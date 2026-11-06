import type { SeverityInput, SeverityResult } from "./types";

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
