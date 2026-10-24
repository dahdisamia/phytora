import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db";
import { nowIso, parseJson } from "../db";
import { getPublicExperts } from "../content";
import type { ContentStore } from "../content";
import { ApiError } from "../errors";
import { audit } from "../audit";
import { requireAuth, requireRole } from "../auth";

const profileSchema = z.object({
  credentials: z.string().trim().min(2).max(300),
  specializations: z.array(z.string().trim().min(2).max(120)).max(10),
  cropIds: z.array(z.string().max(80)).max(20),
  municipalityId: z.string().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  office: z.string().trim().max(300).nullable().optional(),
  consentPublished: z.boolean(),
  availabilityNoteAr: z.string().trim().max(500).default(""),
  availabilityNoteFr: z.string().trim().max(500).default("")
});

export function expertsRouter(db: Db, store: ContentStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const regionId = req.query.regionId ? String(req.query.regionId) : undefined;
    const cropId = req.query.cropId ? String(req.query.cropId) : undefined;
    const experts = getPublicExperts(db, { regionId, cropId });
    res.json({
      experts,
      noteAr:
        experts.length === 0
          ? "الدليل العام للخبراء فارغ حالياً. لا نعرض أسماء أو ملفات غير موثقة، ولا يوجد في هذه النسخة خبير حقيقي وافق على النشر."
          : "تُعرض فقط الملفات التي تحققت المؤسسة منها ووافق صاحبها على النشر.",
      noteFr:
        experts.length === 0
          ? "L'annuaire public des experts est vide. Aucun profil non vérifié n'est affiché et aucun expert réel n'a consenti à la publication dans cette version."
          : "Seuls les profils vérifiés par l'organisation et ayant consenti à la publication sont affichés."
    });
  });

  router.get("/me", requireAuth, requireRole("expert"), (req, res) => {
    const row = db
      .prepare("SELECT * FROM expert_profiles WHERE id = ?")
      .get(req.user!.id) as Record<string, unknown> | undefined;
    if (!row) {
      throw new ApiError(404, "profile_not_found", "ملف الخبير غير موجود.", "Profil expert introuvable.");
    }
    res.json({
      profile: {
        id: String(row.id),
        displayName: String(row.display_name),
        credentials: String(row.credentials),
        specializations: parseJson<string[]>(String(row.specializations), []),
        cropIds: parseJson<string[]>(String(row.crop_ids), []),
        regionId: String(row.region_id),
        municipalityId: row.municipality_id ? String(row.municipality_id) : null,
        organizationName: String(row.organization_name),
        contact: {
          phone: row.phone ? String(row.phone) : null,
          email: row.email ? String(row.email) : null,
          office: row.office ? String(row.office) : null
        },
        consentPublished: Number(row.consent_published) === 1,
        verificationStatus: String(row.verification_status),
        lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : null,
        availabilityNoteAr: String(row.availability_note_ar ?? ""),
        availabilityNoteFr: String(row.availability_note_fr ?? "")
      }
    });
  });

  router.put("/me", requireAuth, requireRole("expert"), (req, res) => {
    const body = profileSchema.parse(req.body);
    const region = store.regions.find((item) => item.id === req.user!.organizationId);
    void region;
    const row = db
      .prepare("SELECT region_id, municipality_id FROM expert_profiles WHERE id = ?")
      .get(req.user!.id) as { region_id: string; municipality_id: string | null } | undefined;
    if (!row) {
      throw new ApiError(404, "profile_not_found", "ملف الخبير غير موجود.", "Profil expert introuvable.");
    }
    if (
      body.municipalityId &&
      !store.municipalities.some(
        (item) => item.id === body.municipalityId && item.regionId === row.region_id
      )
    ) {
      throw new ApiError(400, "unknown_municipality", "البلدية غير معروفة.", "Commune inconnue.", {
        municipalityId: "unknown_municipality"
      });
    }
    for (const cropId of body.cropIds) {
      if (!store.crops.some((crop) => crop.id === cropId)) {
        throw new ApiError(400, "unknown_crop", "المحصول غير معروف.", "Culture inconnue.", {
          cropIds: "unknown_crop"
        });
      }
    }
    const org = db
      .prepare("SELECT name_ar FROM organizations WHERE id = ?")
      .get(req.user!.organizationId) as { name_ar: string } | undefined;
    db.prepare(
      `UPDATE expert_profiles SET credentials = ?, specializations = ?, crop_ids = ?,
        municipality_id = ?, phone = ?, email = ?, office = ?, consent_published = ?,
        availability_note_ar = ?, availability_note_fr = ?
       WHERE id = ?`
    ).run(
      body.credentials,
      JSON.stringify(body.specializations),
      JSON.stringify(body.cropIds),
      body.municipalityId ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.office ?? null,
      body.consentPublished ? 1 : 0,
      body.availabilityNoteAr,
      body.availabilityNoteFr,
      req.user!.id
    );
    audit(db, req, "expert.profile_update", "expert_profile", req.user!.id, {
      consentPublished: body.consentPublished,
      organization: org?.name_ar ?? null
    });
    res.json({ ok: true });
  });

  router.get(
    "/directory",
    requireAuth,
    requireRole("institution_admin", "super_admin"),
    (req, res) => {
      const user = req.user!;
      const rows = db
        .prepare(
          `SELECT u.id, u.display_name, u.email, u.organization_id, ep.verification_status,
                  ep.credentials, ep.specializations
           FROM users u
           LEFT JOIN expert_profiles ep ON ep.id = u.id
           WHERE u.role = 'expert' AND u.disabled = 0
             ${user.role === "super_admin" ? "" : "AND u.organization_id = ?"}`
        )
        .all(
          ...(user.role === "super_admin" ? [] : [user.organizationId])
        ) as Record<string, unknown>[];
      res.json({
        experts: rows.map((row) => ({
          id: String(row.id),
          displayName: String(row.display_name),
          email: String(row.email),
          organizationId: row.organization_id ? String(row.organization_id) : null,
          verificationStatus: row.verification_status
            ? String(row.verification_status)
            : "pending",
          credentials: row.credentials ? String(row.credentials) : "",
          specializations: parseJson<string[]>(
            row.specializations ? String(row.specializations) : "[]",
            []
          )
        }))
      });
    }
  );

  router.post(
    "/:id/verify",
    requireAuth,
    requireRole("institution_admin", "super_admin"),
    (req, res) => {
      const target = db
        .prepare(
          "SELECT u.id, u.organization_id, u.role FROM users u WHERE u.id = ?"
        )
        .get(String(req.params.id)) as
        | { id: string; organization_id: string | null; role: string }
        | undefined;
      if (!target || target.role !== "expert") {
        throw new ApiError(404, "expert_not_found", "الخبير غير موجود.", "Expert introuvable.");
      }
      if (
        req.user!.role !== "super_admin" &&
        target.organization_id !== req.user!.organizationId
      ) {
        throw new ApiError(403, "forbidden", "الخبير خارج مؤسستك.", "Expert hors de votre organisation.");
      }
      db.prepare(
        "UPDATE expert_profiles SET verification_status = 'verified', last_verified_at = ? WHERE id = ?"
      ).run(nowIso(), target.id);
      audit(db, req, "expert.verify", "expert_profile", target.id);
      res.json({ ok: true });
    }
  );

  router.post(
    "/:id/revoke",
    requireAuth,
    requireRole("institution_admin", "super_admin"),
    (req, res) => {
      const target = db
        .prepare("SELECT id, organization_id FROM users WHERE id = ? AND role = 'expert'")
        .get(String(req.params.id)) as { id: string; organization_id: string | null } | undefined;
      if (!target) {
        throw new ApiError(404, "expert_not_found", "الخبير غير موجود.", "Expert introuvable.");
      }
      if (
        req.user!.role !== "super_admin" &&
        target.organization_id !== req.user!.organizationId
      ) {
        throw new ApiError(403, "forbidden", "الخبير خارج مؤسستك.", "Expert hors de votre organisation.");
      }
      db.prepare(
        "UPDATE expert_profiles SET verification_status = 'revoked', consent_published = 0, last_verified_at = ? WHERE id = ?"
      ).run(nowIso(), target.id);
      audit(db, req, "expert.revoke", "expert_profile", target.id);
      res.json({ ok: true });
    }
  );

  return router;
}
