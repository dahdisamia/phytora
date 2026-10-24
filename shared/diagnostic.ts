import type {
  CandidateResult,
  ConfidenceCategory,
  Crop,
  DiagnosticAnswer,
  DiagnosticResult,
  OccurrenceRecord,
  Pest,
  Question,
  SeverityInput,
  SeverityResult,
  Trait
} from "./types";

export const MAX_DIAGNOSTIC_QUESTIONS = 6;

export interface EngineData {
  pests: Pest[];
  questions: Question[];
  crops?: Crop[];
}

export function getOccurrenceForRegion(
  pest: Pest,
  regionId: string
): { record: OccurrenceRecord | null; scope: "regional" | "national" | "none" } {
  const regional = pest.occurrence.find(
    (item) => item.scope === "regional" && item.regionId === regionId
  );
  if (regional) return { record: regional, scope: "regional" };
  const national = pest.occurrence.find(
    (item) => item.scope === "national" && item.regionId === null
  );
  if (national) return { record: national, scope: "national" };
  return { record: null, scope: "none" };
}

export function getCandidatePests(
  pests: Pest[],
  cropId: string,
  regionId: string
): Pest[] {
  return pests.filter((pest) => {
    if (pest.beneficial) return false;
    if (pest.status !== "published") return false;
    if (!pest.cropIds.includes(cropId)) return false;
    const { record } = getOccurrenceForRegion(pest, regionId);
    if (record?.status === "absent") return false;
    return true;
  });
}

export function hasRegionalData(pests: Pest[], regionId: string): boolean {
  return pests.some((pest) =>
    pest.occurrence.some(
      (item) => item.scope === "regional" && item.regionId === regionId
    )
  );
}

function answeredQuestionIds(answers: DiagnosticAnswer[]): Set<string> {
  return new Set(answers.map((answer) => answer.questionId));
}

function traitFor(pest: Pest, questionId: string): Trait | undefined {
  return pest.traits.find((trait) => trait.questionId === questionId);
}

function coverageFor(pests: Pest[], questionId: string): number {
  return pests.filter((pest) => traitFor(pest, questionId)).length;
}

export function scorePest(
  pest: Pest,
  answers: DiagnosticAnswer[],
  suspectedPestId: string | null
): { score: number; evidence: Trait[] } {
  let score = suspectedPestId === pest.id ? 1.5 : 0;
  const evidence: Trait[] = [];
  for (const answer of answers) {
    const trait = pest.traits.find(
      (item) =>
        item.questionId === answer.questionId && item.optionId === answer.optionId
    );
    if (trait) {
      score += trait.weight;
      evidence.push(trait);
    }
  }
  return { score, evidence };
}

export function getNextQuestion(
  data: EngineData,
  cropId: string,
  regionId: string,
  answers: DiagnosticAnswer[],
  suspectedPestId: string | null
): Question | null {
  if (answers.length >= MAX_DIAGNOSTIC_QUESTIONS) return null;

  const allCandidates = getCandidatePests(data.pests, cropId, regionId);
  if (allCandidates.length < 2) return null;

  const answered = answeredQuestionIds(answers);
  const scored = allCandidates
    .map((pest) => ({ pest, ...scorePest(pest, answers, suspectedPestId) }))
    .sort((a, b) => b.score - a.score);

  // Keep plausible candidates; if the answers exclude everything, keep all so
  // the farmer is never trapped in a dead end.
  const positive = scored.filter((item) => item.score > 0);
  const pool =
    positive.length >= 2 ? positive.map((item) => item.pest) : allCandidates;

  const options = data.questions
    .filter((question) => !answered.has(question.id))
    .filter((question) => coverageFor(pool, question.id) >= 2)
    .map((question) => {
      const optionIds = new Set(
        pool
          .map((pest) => traitFor(pest, question.id)?.optionId)
          .filter((value): value is string => Boolean(value))
      );
      const coverage = coverageFor(pool, question.id);
      const suspicionBoost =
        suspectedPestId &&
        traitFor(
          pool.find((pest) => pest.id === suspectedPestId) ?? pool[0],
          question.id
        )
          ? 0.5
          : 0;
      return {
        question,
        value: optionIds.size * coverage + suspicionBoost
      };
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  return options[0]?.question ?? null;
}

export function rankCandidates(
  data: EngineData,
  cropId: string,
  regionId: string,
  answers: DiagnosticAnswer[],
  suspectedPestId: string | null
): CandidateResult[] {
  const candidates = getCandidatePests(data.pests, cropId, regionId);
  const scored = candidates
    .map((pest) => {
      const { score, evidence } = scorePest(pest, answers, suspectedPestId);
      const occurrence = getOccurrenceForRegion(pest, regionId);
      return { pest, score, evidence, occurrence };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  const secondScore = scored[1]?.score ?? 0;

  return scored.map((item, index) => {
    const isTop = index === 0;
    let confidence = confidenceFor(
      item.score,
      isTop ? topScore - secondScore : topScore - item.score,
      answers.length
    );
    const occurrenceStatus = item.occurrence.record?.status;
    if (occurrenceStatus !== "confirmed" && occurrenceStatus !== "expert_reviewed") {
      confidence = capConfidence(confidence, "possible");
    }
    return {
      pest: item.pest,
      score: item.score,
      evidence: item.evidence,
      occurrence: item.occurrence.record,
      occurrenceScope: item.occurrence.scope,
      confidence,
      isTop
    };
  });
}

function capConfidence(
  current: ConfidenceCategory,
  maximum: ConfidenceCategory
): ConfidenceCategory {
  const order: ConfidenceCategory[] = ["insufficient", "uncertain", "possible", "likely"];
  return order.indexOf(current) > order.indexOf(maximum) ? maximum : current;
}

export function confidenceFor(
  score: number,
  lead: number,
  answeredCount: number
): ConfidenceCategory {
  if (answeredCount === 0) return "insufficient";
  if (score >= 7 && lead >= 3 && answeredCount >= 3) return "likely";
  if (score >= 4 && lead >= 2) return "possible";
  return "uncertain";
}

export function getUnansweredRelevant(
  data: EngineData,
  cropId: string,
  regionId: string,
  answers: DiagnosticAnswer[],
  topPestIds: string[]
): string[] {
  const answered = answeredQuestionIds(answers);
  const topPests = data.pests.filter((pest) => topPestIds.includes(pest.id));
  return data.questions
    .filter((question) => !answered.has(question.id))
    .filter((question) => {
      const options = new Set(
        topPests
          .map((pest) => traitFor(pest, question.id)?.optionId)
          .filter(Boolean)
      );
      return options.size >= 2;
    })
    .slice(0, 3)
    .map((question) => question.id);
}

export function diagnose(
  data: EngineData,
  cropId: string,
  regionId: string,
  stageId: string | null,
  suspectedPestId: string | null,
  answers: DiagnosticAnswer[]
): DiagnosticResult {
  const ranked = rankCandidates(
    data,
    cropId,
    regionId,
    answers,
    suspectedPestId
  );
  const top = ranked[0] ?? null;
  const alternatives = ranked.slice(1, 4);
  const regionalDataAvailable = hasRegionalData(
    getCandidatePests(data.pests, cropId, regionId),
    regionId
  );
  const warnings: string[] = [];
  if (!regionalDataAvailable) {
    warnings.push("regional_data_missing");
  }
  if (answers.length === 0) {
    warnings.push("no_answers");
  }
  if (!top) {
    warnings.push("no_candidates");
  } else if (top.confidence === "uncertain" || top.confidence === "insufficient") {
    warnings.push("uncertain_result");
  }
  if (
    top?.occurrence &&
    (top.occurrence.status === "unverified" ||
      top.occurrence.status === "reported")
  ) {
    warnings.push("occurrence_unverified");
  }
  return {
    cropId,
    regionId,
    stageId,
    suspectedPestId,
    candidates: ranked,
    alternatives,
    top,
    answeredCount: answers.length,
    unansweredRelevant: top
      ? getUnansweredRelevant(
          data,
          cropId,
          regionId,
          answers,
          [top.pest.id, ...alternatives.map((item) => item.pest.id)]
        )
      : [],
    regionalDataAvailable,
    warnings,
    method: "rule_based",
    generatedAt: new Date().toISOString()
  };
}

export function assessSeverity(input: SeverityInput): SeverityResult {
  const reasons: { ar: string; fr: string }[] = [];
  let level: SeverityResult["level"] = "monitor";

  const add = (ar: string, fr: string) => reasons.push({ ar, fr });

  if (input.damageExtent === "heavy") {
    level = "expert_required";
    add("الأضرار واسعة على النباتات", "Dommages étendus sur les plantes");
  }
  if (input.affectedPlants === "many") {
    level = "expert_required";
    add("عدد كبير من النباتات مصاب", "Un grand nombre de plantes est touché");
  }
  if (input.distribution === "widespread") {
    level = "expert_required";
    add("الانتشار يشمل مساحة واسعة من الحقل", "La répartition couvre une grande partie du champ");
  }
  if (input.rapidSpread === "yes") {
    level = "urgent";
    add("توجد مؤشرات على انتشار سريع", "Des signes de propagation rapide sont présents");
  }
  if (
    input.identificationConfidence === "uncertain" ||
    input.identificationConfidence === "insufficient"
  ) {
    if (level === "monitor") level = "further_diagnosis";
    add("نتيجة التعرف غير مؤكدة", "L'identification n'est pas confirmée");
  }
  if (input.damageExtent === "none" && input.affectedPlants === "few") {
    level = "preventive";
    add("لا توجد أضرار واضحة بعد", "Aucun dommage visible pour le moment");
  }
  if (
    input.damageExtent === "light" &&
    input.affectedPlants !== "many" &&
    input.rapidSpread !== "yes"
  ) {
    if (level === "monitor") level = "monitor";
    add("أضرار محدودة يمكن مراقبتها", "Dommages limités pouvant être suivis");
  }
  if (input.damageExtent === "unknown" || input.affectedPlants === "unknown") {
    if (level === "monitor") level = "further_diagnosis";
    add("معلومات الأضرار غير كافية", "Les informations sur les dégâts sont insuffisantes");
  }
  if (reasons.length === 0) {
    add("لم تُسجل مؤشرات خطورة عالية", "Aucun indicateur de gravité élevée n'a été signalé");
  }

  return {
    level,
    reasons,
    disclaimerAr:
      "هذا التقييم إرشادي فقط. لا تتوفر في قاعدة البيانات عتبات اقتصادية إقليمية معتمدة، ولا يجوز اعتباره إعلاناً عن وباء.",
    disclaimerFr:
      "Cette évaluation est indicative. La base ne contient pas de seuils économiques régionaux validés ; elle ne constitue pas une déclaration d'épidémie.",
    thresholdDataAvailable: false
  };
}

export function buildEvidenceSummary(result: DiagnosticResult): string[] {
  if (!result.top) return [];
  const questionIds = new Set(result.top.evidence.map((item) => item.questionId));
  return [...questionIds];
}
