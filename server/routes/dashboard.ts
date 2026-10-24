import { Router } from "express";
import type { Db } from "../db";
import type { ContentStore } from "../content";
import { getCrop, getMunicipality, getPest } from "../content";
import { requireAuth, requireRole } from "../auth";

const MIN_AGGREGATION = 5;

export function dashboardRouter(db: Db, store: ContentStore): Router {
  const router = Router();
  router.use(requireAuth, requireRole("institution_admin", "super_admin"));

  router.get("/stats", (req, res) => {
    const user = req.user!;
    const orgFilter = user.role === "super_admin" ? null : user.organizationId;
    const where = orgFilter ? "WHERE organization_id = ?" : "";
    const params = orgFilter ? [orgFilter] : [];

    const totalsRow = db
      .prepare(
        `SELECT
          COUNT(*) AS reports,
          SUM(CASE WHEN status IN ('assessment_ready','closed') THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN status IN ('submitted','in_review') THEN 1 ELSE 0 END) AS pending
         FROM cases ${where}`
      )
      .get(...params) as { reports: number; verified: number; pending: number };

    const expertsRow = db
      .prepare(
        `SELECT COUNT(*) AS count FROM expert_profiles ep
         JOIN users u ON u.id = ep.id
         WHERE ep.verification_status = 'verified' AND u.disabled = 0
         ${orgFilter ? "AND u.organization_id = ?" : ""}`
      )
      .get(...params) as { count: number };

    const farmersRow = db
      .prepare(
        `SELECT COUNT(*) AS count FROM users WHERE role = 'farmer' AND disabled = 0 ${
          orgFilter ? "AND organization_id = ?" : ""
        }`
      )
      .get(...params) as { count: number };

    const municipalityRows = db
      .prepare(
        `SELECT municipality_id AS id, COUNT(*) AS count FROM cases
         ${where ? where + " AND" : "WHERE"} municipality_id IS NOT NULL
         GROUP BY municipality_id ORDER BY count DESC`
      )
      .all(...params) as { id: string; count: number }[];

    const cropRows = db
      .prepare(
        `SELECT crop_id AS id, COUNT(*) AS count FROM cases ${where}
         GROUP BY crop_id ORDER BY count DESC`
      )
      .all(...params) as { id: string; count: number }[];

    const pestRows = db
      .prepare(
        `SELECT top_pest_id AS id, COUNT(*) AS count,
                SUM(CASE WHEN status IN ('assessment_ready','closed') THEN 1 ELSE 0 END) AS verified
         FROM cases ${where ? where + " AND" : "WHERE"} top_pest_id IS NOT NULL
         GROUP BY top_pest_id ORDER BY count DESC`
      )
      .all(...params) as { id: string; count: number; verified: number }[];

    const monthRows = db
      .prepare(
        `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count,
                SUM(CASE WHEN status IN ('assessment_ready','closed') THEN 1 ELSE 0 END) AS verified
         FROM cases ${where}
         GROUP BY month ORDER BY month DESC LIMIT 6`
      )
      .all(...params) as { month: string; count: number; verified: number }[];

    res.json({
      totals: {
        reports: totalsRow.reports ?? 0,
        verified: totalsRow.verified ?? 0,
        pending: totalsRow.pending ?? 0,
        cases: totalsRow.reports ?? 0,
        experts: expertsRow.count ?? 0,
        farmers: farmersRow.count ?? 0
      },
      byMunicipality: municipalityRows
        .filter((row) => row.count >= MIN_AGGREGATION)
        .map((row) => {
          const municipality = getMunicipality(store, row.id);
          return {
            id: row.id,
            nameAr: municipality?.nameAr ?? row.id,
            nameFr: municipality?.nameFr ?? row.id,
            count: row.count
          };
        }),
      byCrop: cropRows
        .filter((row) => row.count >= MIN_AGGREGATION)
        .map((row) => {
          const crop = getCrop(store, row.id);
          return {
            id: row.id,
            nameAr: crop?.nameAr ?? row.id,
            nameFr: crop?.nameFr ?? row.id,
            count: row.count
          };
        }),
      byPest: pestRows
        .filter((row) => row.count >= MIN_AGGREGATION)
        .map((row) => {
          const pest = getPest(store, row.id);
          return {
            id: row.id,
            nameAr: pest?.nameAr ?? row.id,
            nameFr: pest?.nameFr ?? row.id,
            count: row.count,
            verified: row.verified ?? 0
          };
        }),
      monthly: monthRows
        .filter((row) => row.count >= MIN_AGGREGATION)
        .reverse(),
      privacy: {
        minAggregation: MIN_AGGREGATION,
        noteAr:
          "تُخفى التفاصيل التي تقل عن 5 حالات لحماية خصوصية المزارعين. الأرقام المعروضة هي إجماليات حالات مُرسلة فعلياً، وليست تقديرات سكانية.",
        noteFr:
          "Les détails portant sur moins de 5 cas sont masqués pour protéger la vie privée des agriculteurs. Les chiffres affichés sont des agrégats de cas réellement soumis, non des estimations de population."
      }
    });
  });

  return router;
}

export function auditRouter(db: Db): Router {
  const router = Router();
  router.use(requireAuth, requireRole("institution_admin", "super_admin"));

  router.get("/", (req, res) => {
    const user = req.user!;
    const rows =
      user.role === "super_admin"
        ? (db
            .prepare(
              `SELECT a.*, u.display_name AS actor_name FROM audit_logs a
               LEFT JOIN users u ON u.id = a.actor_user_id
               ORDER BY a.created_at DESC LIMIT 200`
            )
            .all() as Record<string, unknown>[])
        : (db
            .prepare(
              `SELECT a.*, u.display_name AS actor_name FROM audit_logs a
               LEFT JOIN users u ON u.id = a.actor_user_id
               WHERE u.organization_id = ?
               ORDER BY a.created_at DESC LIMIT 200`
            )
            .all(user.organizationId) as Record<string, unknown>[]);
    res.json({
      audit: rows.map((row) => ({
        id: String(row.id),
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        actorName: row.actor_name ? String(row.actor_name) : null,
        action: String(row.action),
        entityType: String(row.entity_type),
        entityId: row.entity_id ? String(row.entity_id) : null,
        metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
        ip: row.ip ? String(row.ip) : null,
        createdAt: String(row.created_at)
      }))
    });
  });

  return router;
}
