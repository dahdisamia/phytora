import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db";
import { nowIso, parseJson } from "../db";
import type { ContentStore } from "../content";
import { ApiError } from "../errors";
import { audit } from "../audit";
import { requireAuth, requireRole } from "../auth";

const licenseSchema = z.object({
  licensePlan: z.enum(["pilot", "chamber", "institution", "research"]).optional(),
  licenseStatus: z.enum(["active", "expired", "suspended", "trial"]).optional(),
  licenseExpiresAt: z.string().max(40).nullable().optional(),
  licensedRegionIds: z.array(z.string().max(80)).max(100).optional()
});

export function adminRouter(db: Db, store: ContentStore): Router {
  const router = Router();
  router.use(requireAuth, requireRole("institution_admin", "super_admin"));

  router.get("/organizations", (req, res) => {
    if (req.user!.role !== "super_admin") {
      throw new ApiError(403, "forbidden", "هذه القائمة متاحة للمشرف العام فقط.", "Cette liste est réservée au super-administrateur.");
    }
    const rows = db
      .prepare(
        `SELECT o.*,
          (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
          (SELECT COUNT(*) FROM cases c WHERE c.organization_id = o.id) AS case_count,
          (SELECT COUNT(*) FROM referrals r WHERE r.organization_id = o.id AND r.status NOT IN ('closed','responded')) AS open_referrals
         FROM organizations o ORDER BY o.created_at ASC`
      )
      .all() as Record<string, unknown>[];
    res.json({
      organizations: rows.map((row) => ({
        id: String(row.id),
        nameAr: String(row.name_ar),
        nameFr: String(row.name_fr),
        type: String(row.type),
        licensePlan: String(row.license_plan),
        licenseStatus: String(row.license_status),
        licenseExpiresAt: row.license_expires_at ? String(row.license_expires_at) : null,
        licensedRegionIds: parseJson<string[]>(String(row.licensed_region_ids), []),
        isDemo: Number(row.is_demo) === 1,
        userCount: Number(row.user_count ?? 0),
        caseCount: Number(row.case_count ?? 0),
        openReferrals: Number(row.open_referrals ?? 0)
      }))
    });
  });

  router.patch("/organizations/:id/license", (req, res) => {
    if (req.user!.role !== "super_admin") {
      throw new ApiError(403, "forbidden", "هذا الإجراء متاح للمشرف العام فقط.", "Action réservée au super-administrateur.");
    }
    const body = licenseSchema.parse(req.body);
    const org = db
      .prepare("SELECT * FROM organizations WHERE id = ?")
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!org) {
      throw new ApiError(404, "org_not_found", "المؤسسة غير موجودة.", "Organisation introuvable.");
    }
    for (const regionId of body.licensedRegionIds ?? []) {
      if (!store.regions.some((region) => region.id === regionId)) {
        throw new ApiError(400, "unknown_region", "المنطقة غير معروفة.", "Région inconnue.", {
          licensedRegionIds: "unknown_region"
        });
      }
    }
    db.prepare(
      `UPDATE organizations SET license_plan = ?, license_status = ?, license_expires_at = ?, licensed_region_ids = ?
       WHERE id = ?`
    ).run(
      body.licensePlan ?? String(org.license_plan),
      body.licenseStatus ?? String(org.license_status),
      body.licenseExpiresAt === undefined
        ? (org.license_expires_at as string | null)
        : body.licenseExpiresAt,
      JSON.stringify(
        body.licensedRegionIds ?? parseJson<string[]>(String(org.licensed_region_ids), [])
      ),
      req.params.id
    );
    audit(db, req, "admin.license_update", "organization", req.params.id, {
      plan: body.licensePlan,
      status: body.licenseStatus
    });
    res.json({ ok: true });
  });

  router.get("/overview", (req, res) => {
    const user = req.user!;
    const orgId = user.role === "super_admin" ? null : user.organizationId;
    const orgRow = orgId
      ? (db.prepare("SELECT * FROM organizations WHERE id = ?").get(orgId) as
          | Record<string, unknown>
          | undefined)
      : undefined;
    res.json({
      organization: orgRow
        ? {
            id: String(orgRow.id),
            nameAr: String(orgRow.name_ar),
            nameFr: String(orgRow.name_fr),
            licensePlan: String(orgRow.license_plan),
            licenseStatus: String(orgRow.license_status),
            licenseExpiresAt: orgRow.license_expires_at
              ? String(orgRow.license_expires_at)
              : null,
            isDemo: Number(orgRow.is_demo) === 1
          }
        : null,
      generatedAt: nowIso(),
      contentVersion: store.contentVersion
    });
  });

  return router;
}
