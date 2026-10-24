import type {
  Crop,
  OccurrenceRecord,
  Pest,
  Question,
  Recommendation,
  Source,
  Trait,
  VerificationStatus
} from "./types";

/**
 * Shape of the curated pest records before recommendations are resolved.
 * The JSON files are the source of truth and are kept free of duplicated
 * recommendation bodies; the loader joins them by id.
 */
export interface RawPest
  extends Omit<Pest, "recommendations"> {
  recommendationIds: string[];
}

export interface RawOccurrence extends Omit<OccurrenceRecord, "status"> {
  status: VerificationStatus;
}

export interface ContentBundle {
  crops: Crop[];
  pests: Pest[];
  questions: Question[];
  recommendations: Recommendation[];
  sources: Source[];
}

export function resolvePests(
  rawPests: RawPest[],
  recommendations: Recommendation[]
): Pest[] {
  const byId = new Map(recommendations.map((item) => [item.id, item]));
  return rawPests.map((raw) => {
    const { recommendationIds, ...pest } = raw;
    const resolved = recommendationIds
      .map((id) => byId.get(id))
      .filter((item): item is Recommendation => Boolean(item));
    return { ...pest, recommendations: resolved };
  });
}

export function resolveSources(
  sourceIds: string[],
  sources: Source[]
): Source[] {
  const byId = new Map(sources.map((item) => [item.id, item]));
  return sourceIds
    .map((id) => byId.get(id))
    .filter((item): item is Source => Boolean(item));
}

export function traitKey(trait: Trait): string {
  return `${trait.questionId}:${trait.optionId}`;
}

export function validateContent(bundle: ContentBundle): string[] {
  const problems: string[] = [];
  const cropIds = new Set(bundle.crops.map((crop) => crop.id));
  const sourceIds = new Set(bundle.sources.map((source) => source.id));
  const questionById = new Map(bundle.questions.map((q) => [q.id, q]));
  const recommendationIds = new Set(bundle.recommendations.map((r) => r.id));
  const pestIds = new Set(bundle.pests.map((pest) => pest.id));

  for (const pest of bundle.pests) {
    for (const cropId of pest.cropIds) {
      if (!cropIds.has(cropId)) {
        problems.push(`${pest.id}: unknown crop ${cropId}`);
      }
    }
    for (const sourceId of pest.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        problems.push(`${pest.id}: unknown source ${sourceId}`);
      }
    }
    for (const rec of pest.recommendations) {
      if (!recommendationIds.has(rec.id)) {
        problems.push(`${pest.id}: unknown recommendation ${rec.id}`);
      }
    }
    for (const similarId of pest.similarPestIds) {
      if (!pestIds.has(similarId)) {
        problems.push(`${pest.id}: unknown similar pest ${similarId}`);
      }
    }
    for (const trait of pest.traits) {
      const question = questionById.get(trait.questionId);
      if (!question) {
        problems.push(`${pest.id}: unknown question ${trait.questionId}`);
        continue;
      }
      if (!question.options.some((option) => option.id === trait.optionId)) {
        problems.push(
          `${pest.id}: unknown option ${trait.optionId} for ${trait.questionId}`
        );
      }
    }
    const perQuestion = new Map<string, Set<string>>();
    for (const trait of pest.traits) {
      const set = perQuestion.get(trait.questionId) ?? new Set<string>();
      if (set.has(trait.optionId)) {
        problems.push(`${pest.id}: duplicate trait ${traitKey(trait)}`);
      }
      set.add(trait.optionId);
      perQuestion.set(trait.questionId, set);
    }
    for (const occurrence of pest.occurrence) {
      for (const sourceId of occurrence.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          problems.push(
            `${pest.id}: occurrence ${occurrence.id} unknown source ${sourceId}`
          );
        }
      }
      if (occurrence.scope === "regional" && !occurrence.regionId) {
        problems.push(`${pest.id}: regional occurrence without regionId`);
      }
      if (occurrence.scope === "national" && occurrence.regionId) {
        problems.push(`${pest.id}: national occurrence with regionId`);
      }
    }
  }

  for (const rec of bundle.recommendations) {
    for (const sourceId of rec.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        problems.push(`${rec.id}: unknown source ${sourceId}`);
      }
    }
    for (const pestId of rec.pestIds) {
      if (!pestIds.has(pestId)) {
        problems.push(`${rec.id}: unknown pest ${pestId}`);
      }
    }
    for (const cropId of rec.cropIds) {
      if (!cropIds.has(cropId)) {
        problems.push(`${rec.id}: unknown crop ${cropId}`);
      }
    }
  }

  return problems;
}
