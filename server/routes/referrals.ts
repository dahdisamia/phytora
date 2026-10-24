import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db";
import { nowIso } from "../db";
import type { ContentStore } from "../content";
import { ApiError } from "../errors";
import { audit, notify } from "../audit";
import { mapReferral, REFERRAL_SELECT, type ReferralRow } from "../mappers";
import { requireAuth, requireRole } from "../auth";

const assignSchema = z.object({
  expertId: z.string().min(1).max(80)
});

const respondSchema = z.object({
  assessment: z.string().trim().min(5).max(6000),
  requestedInfo: z.string().trim().max(3000).optional().default(""),
  close: z.boolean().optional()
});

const messageSchema = z.object({
  message: z.string().trim().max(3000).optional().default("")
});

function referralRow(db: Db, id: string): ReferralRow | undefined {
  return db.prepare(`${REFERRAL_SELECT} WHERE r.id = ?`).get(id) as
    | ReferralRow
    | undefined;
}

function caseInfo(db: Db, caseId: string) {
  return db
    .prepare(
      `SELECT c.id, c.user_id, c.organization_id, c.status, c.client_id,
              u.display_name AS farmer_name, u.email AS farmer_email
       FROM cases c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(caseId) as
    | {
        id: string;
        user_id: string;
        organization_id: string | null;
        status: string;
        client_id: string;
        farmer_name: string;
        farmer_email: string;
      }
    | undefined;
}

export function referralsRouter(db: Db, store: ContentStore): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    const user = req.user!;
    let rows: ReferralRow[];
    if (user.role === "super_admin") {
      rows = db
        .prepare(`${REFERRAL_SELECT} ORDER BY r.updated_at DESC`)
        .all() as unknown as ReferralRow[];
    } else if (user.role === "institution_admin") {
      rows = db
        .prepare(`${REFERRAL_SELECT} WHERE r.organization_id = ? ORDER BY r.updated_at DESC`)
        .all(user.organizationId) as unknown as ReferralRow[];
    } else if (user.role === "expert") {
      rows = db
        .prepare(
          `${REFERRAL_SELECT} WHERE r.organization_id = ? AND (r.expert_id = ? OR r.expert_id IS NULL) ORDER BY r.updated_at DESC`
        )
        .all(user.organizationId, user.id) as unknown as ReferralRow[];
    } else {
      rows = db
        .prepare(`${REFERRAL_SELECT} WHERE c.user_id = ? ORDER BY r.updated_at DESC`)
        .all(user.id) as unknown as ReferralRow[];
    }
    res.json({ referrals: rows.map((row) => mapReferral(store, row)) });
  });

  router.get("/:id", (req, res) => {
    const row = referralRow(db, String(req.params.id));
    if (!row) {
      throw new ApiError(404, "referral_not_found", "الإحالة غير موجودة.", "Demande introuvable.");
    }
    const user = req.user!;
    const caseRowInfo = caseInfo(db, row.case_id);
    const allowed =
      user.role === "super_admin" ||
      (user.role === "institution_admin" && row.organization_id === user.organizationId) ||
      (user.role === "expert" &&
        row.organization_id === user.organizationId &&
        (row.expert_id === user.id || row.expert_id === null)) ||
      (user.role === "farmer" && caseRowInfo?.user_id === user.id);
    if (!allowed) {
      throw new ApiError(403, "forbidden", "ليست لديك صلاحية لعرض هذه الإحالة.", "Accès non autorisé.");
    }
    res.json({ referral: mapReferral(store, row) });
  });

  router.post("/:id/claim", requireRole("expert"), (req, res) => {
    const row = referralRow(db, String(req.params.id));
    if (!row) {
      throw new ApiError(404, "referral_not_found", "الإحالة غير موجودة.", "Demande introuvable.");
    }
    if (row.organization_id !== req.user!.organizationId) {
      throw new ApiError(403, "forbidden", "الإحالة خارج مؤسستك.", "Demande hors de votre organisation.");
    }
    if (row.expert_id && row.expert_id !== req.user!.id) {
      throw new ApiError(409, "already_assigned", "الإحالة مسندة إلى خبير آخر.", "Demande déjà assignée à un autre expert.");
    }
    const info = caseInfo(db, row.case_id);
    const now = nowIso();
    db.prepare(
      "UPDATE referrals SET expert_id = ?, status = 'in_review', updated_at = ? WHERE id = ?"
    ).run(req.user!.id, now, row.id);
    db.prepare(
      "UPDATE cases SET status = 'in_review', updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(now, row.case_id);
    if (info) {
      notify(
        db,
        info.user_id,
        "referral_claimed",
        "تم إسناد حالتك إلى خبير",
        "Votre cas a été pris en charge",
        "بدأ خبير بمراجعة حالتك الزراعية.",
        "Un expert a commencé l'examen de votre cas agricole."
      );
    }
    audit(db, req, "referral.claim", "referral", row.id);
    res.json({ referral: mapReferral(store, referralRow(db, row.id)!) });
  });

  router.post("/:id/assign", requireRole("institution_admin", "super_admin"), (req, res) => {
    const body = assignSchema.parse(req.body);
    const row = referralRow(db, String(req.params.id));
    if (!row) {
      throw new ApiError(404, "referral_not_found", "الإحالة غير موجودة.", "Demande introuvable.");
    }
    if (
      req.user!.role !== "super_admin" &&
      row.organization_id !== req.user!.organizationId
    ) {
      throw new ApiError(403, "forbidden", "الإحالة خارج مؤسستك.", "Demande hors de votre organisation.");
    }
    const expert = db
      .prepare(
        "SELECT id, organization_id, role, display_name FROM users WHERE id = ? AND role = 'expert' AND disabled = 0"
      )
      .get(body.expertId) as
      | { id: string; organization_id: string | null; role: string; display_name: string }
      | undefined;
    if (!expert) {
      throw new ApiError(400, "expert_not_found", "الخبير غير موجود.", "Expert introuvable.", {
        expertId: "expert_not_found"
      });
    }
    if (req.user!.role !== "super_admin" && expert.organization_id !== row.organization_id) {
      throw new ApiError(400, "expert_other_org", "الخبير ينتمي لمؤسسة أخرى.", "L'expert appartient à une autre organisation.");
    }
    const info = caseInfo(db, row.case_id);
    const now = nowIso();
    db.prepare(
      "UPDATE referrals SET expert_id = ?, status = 'in_review', updated_at = ? WHERE id = ?"
    ).run(expert.id, now, row.id);
    db.prepare(
      "UPDATE cases SET status = 'in_review', updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(now, row.case_id);
    notify(
      db,
      expert.id,
      "referral_assigned",
      "تم إسناد إحالة إليك",
      "Une demande vous a été assignée",
      "لديك حالة زراعية جديدة للمراجعة.",
      "Vous avez un nouveau cas agricole à examiner."
    );
    if (info) {
      notify(
        db,
        info.user_id,
        "referral_assigned_to_expert",
        "تم إسناد حالتك إلى خبير",
        "Votre cas a été assigné à un expert",
        "سيتم إعلامك عند اكتمال المراجعة.",
        "Vous serez notifié dès que l'examen sera terminé."
      );
    }
    audit(db, req, "referral.assign", "referral", row.id, { expertId: expert.id });
    res.json({ referral: mapReferral(store, referralRow(db, row.id)!) });
  });

  router.post("/:id/respond", requireRole("expert", "institution_admin", "super_admin"), (req, res) => {
    const body = respondSchema.parse(req.body);
    const row = referralRow(db, String(req.params.id));
    if (!row) {
      throw new ApiError(404, "referral_not_found", "الإحالة غير موجودة.", "Demande introuvable.");
    }
    const user = req.user!;
    if (user.role === "expert") {
      if (row.expert_id !== user.id) {
        throw new ApiError(403, "not_assigned", "الإحالة غير مسندة إليك.", "Cette demande ne vous est pas assignée.");
      }
    } else if (user.role !== "super_admin" && row.organization_id !== user.organizationId) {
      throw new ApiError(403, "forbidden", "الإحالة خارج مؤسستك.", "Demande hors de votre organisation.");
    }
    if (!row.expert_id && user.role !== "institution_admin" && user.role !== "super_admin") {
      throw new ApiError(409, "not_assigned", "لا يمكن الرد قبل إسناد الإحالة.", "Impossible de répondre avant assignation.");
    }
    const info = caseInfo(db, row.case_id);
    const now = nowIso();
    const status = body.close ? "closed" : "responded";
    const caseStatus = body.close ? "closed" : "assessment_ready";
    db.prepare(
      `UPDATE referrals SET assessment = ?, requested_info = ?, status = ?, expert_id = COALESCE(expert_id, ?), updated_at = ?
       WHERE id = ?`
    ).run(
      body.assessment,
      body.requestedInfo || null,
      status,
      user.role === "expert" ? user.id : null,
      now,
      row.id
    );
    db.prepare(
      "UPDATE cases SET status = ?, updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(caseStatus, now, row.case_id);
    if (info) {
      notify(
        db,
        info.user_id,
        "assessment_ready",
        "تقييم الخبير جاهز",
        "L'avis de l'expert est disponible",
        body.requestedInfo
          ? "أضاف الخبير تقييماً وطلب معلومات إضافية."
          : "يمكنك الآن الاطلاع على تقييم الخبير.",
        body.requestedInfo
          ? "L'expert a ajouté une évaluation et demande des informations complémentaires."
          : "Vous pouvez maintenant consulter l'avis de l'expert."
      );
    }
    audit(db, req, "referral.respond", "referral", row.id, { close: Boolean(body.close) });
    res.json({ referral: mapReferral(store, referralRow(db, row.id)!) });
  });

  router.post("/:id/message", (req, res) => {
    messageSchema.parse(req.body ?? {});
    const row = referralRow(db, String(req.params.id));
    if (!row) {
      throw new ApiError(404, "referral_not_found", "الإحالة غير موجودة.", "Demande introuvable.");
    }
    const info = caseInfo(db, row.case_id);
    if (!info || info.user_id !== req.user!.id) {
      throw new ApiError(403, "forbidden", "غير مسموح.", "Action non autorisée.");
    }
    // Farmer messages are appended to the case notes and the expert is notified.
    const message = String(req.body?.message ?? "").trim().slice(0, 3000);
    if (!message) {
      throw new ApiError(400, "empty_message", "اكتب رسالة أولاً.", "Écrivez d'abord un message.");
    }
    db.prepare(
      "UPDATE cases SET notes = ?, updated_at = ?, version = version + 1 WHERE id = ?"
    ).run(`${info.farmer_name}: ${message}`.slice(0, 4000), nowIso(), row.case_id);
    if (row.expert_id) {
      notify(
        db,
        row.expert_id,
        "farmer_message",
        "رسالة جديدة من مزارع",
        "Nouveau message d'un agriculteur",
        message.slice(0, 240),
        message.slice(0, 240)
      );
    }
    audit(db, req, "referral.farmer_message", "referral", row.id);
    res.json({ ok: true });
  });

  return router;
}
