import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db";
import { nowIso, parseJson } from "../db";
import type { ContentStore } from "../content";
import { getCrop, getMunicipality, getRegion } from "../content";
import { assessSeverity } from "../../shared/diagnostic";
import type { DiagnosticAnswer, SeverityInput } from "../../shared/types";
import { ApiError } from "../errors";
import { audit, notify, notifyOrganizationAdmins } from "../audit";
import { mapCase, REFERRAL_SELECT, type CaseRow, type ReferralRow, mapReferral } from "../mappers";
import { requireAuth, type SessionUser } from "../auth";

const answerSchema = z.object({
  questionId: z.string().min(1).max(80),
  optionId: z.string().min(1).max(80)
});

const severitySchema = z.object({
  growthStage: z.string().max(80).nullable(),
  damageExtent: z.enum(["none", "light", "moderate", "heavy", "unknown"]),
  affectedPlants: z.enum(["few", "some", "many", "unknown"]),
  distribution: z.enum(["few_spots", "patches", "widespread", "unknown"]),
  rapidSpread: z.enum(["yes", "no", "unknown"]),
  identificationConfidence: z.enum(["likely", "possible", "uncertain", "insufficient"])
});

const caseInputSchema = z.object({
  clientId: z.string().min(6).max(120),
  cropId: z.string().min(1).max(80),
  regionId: z.string().min(1).max(80),
  municipalityId: z.string().max(80).nullable().optional(),
  stageId: z.string().max(80).nullable().optional(),
  suspectedPestId: z.string().max(80).nullable().optional(),
  candidatePestIds: z.array(z.string().max(80)).max(12).default([]),
  answers: z.array(answerSchema).max(20).default([]),
  severity: severitySchema.nullable().optional(),
  notes: z.string().max(4000).default(""),
  status: z.string().max(40).optional(),
  version: z.number().int().min(1).max(1_000_000).default(1),
  baseUpdatedAt: z.string().max(60).nullable().optional(),
  force: z.boolean().optional(),
  createdAt: z.string().max(60).optional()
});

const submitSchema = z.object({
  message: z.string().max(2000).optional()
});

type CaseInput = z.infer<typeof caseInputSchema>;

function validateDomain(store: ContentStore, input: CaseInput): void {
  const fieldErrors: Record<string, string> = {};
  const crop = getCrop(store, input.cropId);
  if (!crop) fieldErrors.cropId = "unknown_crop";
  const region = getRegion(store, input.regionId);
  if (!region) fieldErrors.regionId = "unknown_region";
  if (input.municipalityId) {
    const municipality = getMunicipality(store, input.municipalityId);
    if (!municipality || municipality.regionId !== input.regionId) {
      fieldErrors.municipalityId = "unknown_municipality";
    }
  }
  if (input.stageId && crop && !crop.stages.some((stage) => stage.id === input.stageId)) {
    fieldErrors.stageId = "unknown_stage";
  }
  if (input.suspectedPestId) {
    const pest = store.pests.find((item) => item.id === input.suspectedPestId);
    if (!pest) fieldErrors.suspectedPestId = "unknown_pest";
  }
  for (const pestId of input.candidatePestIds) {
    if (!store.pests.some((item) => item.id === pestId)) {
      fieldErrors.candidatePestIds = "unknown_pest";
      break;
    }
  }
  for (const answer of input.answers) {
    const question = store.questions.find((item) => item.id === answer.questionId);
    if (!question || !question.options.some((option) => option.id === answer.optionId)) {
      fieldErrors.answers = "unknown_answer";
      break;
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError(
      400,
      "validation_error",
      "تحقق من بيانات الحالة المرسلة.",
      "Vérifiez les données du cas envoyé.",
      fieldErrors
    );
  }
}

function caseRow(db: Db, id: string): CaseRow | undefined {
  return db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
}

function canAccessCase(user: SessionUser, db: Db, row: CaseRow): boolean {
  if (user.role === "super_admin") return true;
  if (row.user_id === user.id) return true;
  if (!user.organizationId || row.organization_id !== user.organizationId) return false;
  if (user.role === "institution_admin") return true;
  if (user.role === "expert") {
    const referral = db
      .prepare(
        "SELECT expert_id FROM referrals WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(row.id) as { expert_id: string | null } | undefined;
    return Boolean(referral && (referral.expert_id === user.id || referral.expert_id === null));
  }
  return false;
}

function upsertCase(
  db: Db,
  store: ContentStore,
  user: SessionUser,
  input: CaseInput
) {
  validateDomain(store, input);
  const existing = db
    .prepare("SELECT * FROM cases WHERE client_id = ?")
    .get(input.clientId) as CaseRow | undefined;

  if (existing && existing.user_id !== user.id) {
    throw new ApiError(
      403,
      "case_owned_by_other",
      "هذه الحالة مسجلة لمستخدم آخر.",
      "Ce cas appartient à un autre utilisateur."
    );
  }

  if (
    existing &&
    !input.force &&
    (input.version < existing.version ||
      (input.baseUpdatedAt && input.baseUpdatedAt !== existing.updated_at))
  ) {
    return { conflict: true as const, existing };
  }

  const severity = (input.severity ?? null) as SeverityInput | null;
  const severityLevel = severity ? assessSeverity(severity).level : null;
  const now = nowIso();
  const candidatePestIds = input.candidatePestIds;
  const topPestId = candidatePestIds[0] ?? input.suspectedPestId ?? null;
  const safeStatuses = new Set(["local_draft", "pending_sync", "sync_conflict"]);
  let status = input.status ?? "pending_sync";
  if (!["local_draft", "pending_sync", "submitted"].includes(status)) {
    status = "pending_sync";
  }

  if (existing) {
    const keepStatus =
      !safeStatuses.has(existing.status) && !input.force ? existing.status : status;
    const newVersion = Math.max(input.version, existing.version + 1);
    db.prepare(
      `UPDATE cases SET
        municipality_id = ?, stage_id = ?, suspected_pest_id = ?,
        candidate_pest_ids = ?, answers = ?, severity = ?, severity_level = ?,
        notes = ?, status = ?, top_pest_id = ?, updated_at = ?, version = ?
       WHERE id = ?`
    ).run(
      input.municipalityId ?? null,
      input.stageId ?? null,
      input.suspectedPestId ?? null,
      JSON.stringify(candidatePestIds),
      JSON.stringify(input.answers),
      severity ? JSON.stringify(severity) : null,
      severityLevel,
      input.notes,
      keepStatus,
      topPestId,
      now,
      newVersion,
      existing.id
    );
    return { conflict: false as const, row: caseRow(db, existing.id)! };
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO cases (
      id, client_id, user_id, organization_id, crop_id, region_id, municipality_id,
      stage_id, suspected_pest_id, candidate_pest_ids, answers, severity, severity_level,
      notes, status, top_pest_id, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.clientId,
    user.id,
    user.organizationId,
    input.cropId,
    input.regionId,
    input.municipalityId ?? null,
    input.stageId ?? null,
    input.suspectedPestId ?? null,
    JSON.stringify(candidatePestIds),
    JSON.stringify(input.answers),
    severity ? JSON.stringify(severity) : null,
    severityLevel,
    input.notes,
    status,
    topPestId,
    input.createdAt ?? now,
    now,
    input.version
  );
  return { conflict: false as const, row: caseRow(db, id)! };
}

export function casesRouter(db: Db, store: ContentStore): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    const user = req.user!;
    const limit = Math.min(Number(req.query.limit ?? 100), 200);
    let rows: CaseRow[];
    if (user.role === "super_admin") {
      rows = db
        .prepare("SELECT * FROM cases ORDER BY updated_at DESC LIMIT ?")
        .all(limit) as unknown as CaseRow[];
    } else if (user.role === "institution_admin") {
      rows = db
        .prepare(
          "SELECT * FROM cases WHERE organization_id = ? ORDER BY updated_at DESC LIMIT ?"
        )
        .all(user.organizationId, limit) as unknown as CaseRow[];
    } else if (user.role === "expert") {
      rows = db
        .prepare(
          `SELECT DISTINCT c.* FROM cases c
           JOIN referrals r ON r.case_id = c.id
           WHERE r.organization_id = ? AND (r.expert_id = ? OR r.expert_id IS NULL)
           ORDER BY c.updated_at DESC LIMIT ?`
        )
        .all(user.organizationId, user.id, limit) as unknown as CaseRow[];
    } else {
      rows = db
        .prepare("SELECT * FROM cases WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?")
        .all(user.id, limit) as unknown as CaseRow[];
    }
    res.json({ cases: rows.map((row) => mapCase(db, store, row)) });
  });

  router.get("/:id", (req, res) => {
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (!canAccessCase(req.user!, db, row)) {
      throw new ApiError(403, "forbidden", "ليست لديك صلاحية لعرض هذه الحالة.", "Accès non autorisé à ce cas.");
    }
    res.json({ case: mapCase(db, store, row) });
  });

  router.post("/", (req, res) => {
    const input = caseInputSchema.parse(req.body);
    const result = upsertCase(db, store, req.user!, input);
    if (result.conflict) {
      res.status(409).json({
        error: {
          code: "sync_conflict",
          messageAr: "هناك نسخة أحدث من هذه الحالة على الخادم.",
          messageFr: "Une version plus récente de ce cas existe sur le serveur."
        },
        serverCase: mapCase(db, store, result.existing)
      });
      return;
    }
    audit(db, req, "case.upsert", "case", result.row.id, {
      clientId: result.row.client_id,
      status: result.row.status
    });
    res.status(201).json({ case: mapCase(db, store, result.row) });
  });

  router.patch("/:id", (req, res) => {
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (row.user_id !== req.user!.id) {
      throw new ApiError(403, "forbidden", "لا يمكنك تعديل هذا الملف.", "Vous ne pouvez pas modifier ce dossier.");
    }
    const input = caseInputSchema.parse({ ...req.body, clientId: row.client_id });
    const result = upsertCase(db, store, req.user!, input);
    if (result.conflict) {
      res.status(409).json({
        error: {
          code: "sync_conflict",
          messageAr: "هناك نسخة أحدث من هذه الحالة على الخادم.",
          messageFr: "Une version plus récente de ce cas existe sur le serveur."
        },
        serverCase: mapCase(db, store, result.existing)
      });
      return;
    }
    audit(db, req, "case.update", "case", row.id);
    res.json({ case: mapCase(db, store, result.row) });
  });

  router.post("/:id/submit", (req, res) => {
    submitSchema.parse(req.body ?? {});
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (row.user_id !== req.user!.id) {
      throw new ApiError(403, "forbidden", "لا يمكنك إرسال هذا الملف.", "Vous ne pouvez pas soumettre ce dossier.");
    }
    const now = nowIso();
    db.prepare(
      "UPDATE cases SET status = 'submitted', updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(now, row.id);
    audit(db, req, "case.submit", "case", row.id);
    notifyOrganizationAdmins(
      db,
      row.organization_id,
      "case_submitted",
      "حالة جديدة في انتظار المعالجة",
      "Nouveau cas en attente de traitement",
      "تم إرسال حالة زراعية جديدة إلى مؤسستك.",
      "Un nouveau cas agricole a été soumis à votre organisation."
    );
    res.json({ case: mapCase(db, store, caseRow(db, row.id)!) });
  });

  router.post("/:id/referral", (req, res) => {
    const body = submitSchema.parse(req.body ?? {});
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (row.user_id !== req.user!.id) {
      throw new ApiError(403, "forbidden", "لا يمكنك طلب إحالة لهذا الملف.", "Vous ne pouvez pas demander un avis pour ce dossier.");
    }
    if (row.status === "local_draft" || row.status === "pending_sync") {
      throw new ApiError(
        409,
        "case_not_submitted",
        "أرسل الحالة أولاً قبل طلب إحالة.",
        "Soumettez d'abord le cas avant de demander un avis."
      );
    }
    const open = db
      .prepare(
        "SELECT id FROM referrals WHERE case_id = ? AND status NOT IN ('responded','closed')"
      )
      .get(row.id) as { id: string } | undefined;
    if (open) {
      throw new ApiError(
        409,
        "referral_open",
        "توجد إحالة مفتوحة بالفعل لهذه الحالة.",
        "Une demande d'avis est déjà ouverte pour ce cas."
      );
    }
    const id = crypto.randomUUID();
    const now = nowIso();
    db.prepare(
      `INSERT INTO referrals (id, case_id, organization_id, expert_id, status, message, assessment, requested_info, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'awaiting_assignment', ?, NULL, NULL, ?, ?)`
    ).run(id, row.id, row.organization_id, body.message ?? "", now, now);
    notifyOrganizationAdmins(
      db,
      row.organization_id,
      "referral_created",
      "طلب إحالة جديد",
      "Nouvelle demande d'avis",
      "طلب مزارع مراجعة حالة زراعية من خبير.",
      "Un agriculteur demande l'avis d'un expert sur un cas agricole."
    );
    audit(db, req, "referral.create", "referral", id, { caseId: row.id });
    const referral = db
      .prepare(`${REFERRAL_SELECT} WHERE r.id = ?`)
      .get(id) as unknown as ReferralRow;
    res.status(201).json({ referral: mapReferral(store, referral) });
  });

  router.post("/:id/close", (req, res) => {
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (row.user_id !== req.user!.id && req.user!.role !== "super_admin") {
      throw new ApiError(403, "forbidden", "غير مسموح.", "Action non autorisée.");
    }
    db.prepare(
      "UPDATE cases SET status = 'closed', updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(nowIso(), row.id);
    db.prepare(
      "UPDATE referrals SET status = 'closed', updated_at = ? WHERE case_id = ? AND status != 'closed'"
    ).run(nowIso(), row.id);
    audit(db, req, "case.close", "case", row.id);
    res.json({ case: mapCase(db, store, caseRow(db, row.id)!) });
  });

  router.delete("/:id", (req, res) => {
    const row = caseRow(db, req.params.id);
    if (!row) {
      throw new ApiError(404, "case_not_found", "الحالة غير موجودة.", "Cas introuvable.");
    }
    if (row.user_id !== req.user!.id) {
      throw new ApiError(403, "forbidden", "غير مسموح.", "Action non autorisée.");
    }
    if (!["local_draft", "pending_sync", "sync_conflict"].includes(row.status)) {
      throw new ApiError(
        409,
        "case_already_submitted",
        "لا يمكن حذف حالة أُرسلت إلى الخبراء. يمكنك إغلاقها بدلاً من ذلك.",
        "Un cas soumis aux experts ne peut pas être supprimé. Vous pouvez le clôturer."
      );
    }
    const referral = db
      .prepare("SELECT id FROM referrals WHERE case_id = ?")
      .get(row.id);
    if (referral) {
      throw new ApiError(
        409,
        "case_has_referral",
        "لا يمكن حذف حالة مرتبطة بإحالة.",
        "Impossible de supprimer un cas lié à une demande d'avis."
      );
    }
    db.prepare("DELETE FROM cases WHERE id = ?").run(row.id);
    audit(db, req, "case.delete", "case", row.id);
    res.json({ ok: true });
  });

  return router;
}

export { canAccessCase, caseRow };
