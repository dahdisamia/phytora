import { Router } from "express";
import type { Db } from "../db";
import { nowIso } from "../db";
import { ApiError } from "../errors";
import { requireAuth } from "../auth";

export function notificationsRouter(db: Db): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    const rows = db
      .prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      )
      .all(req.user!.id) as Record<string, unknown>[];
    res.json({
      notifications: rows.map((row) => ({
        id: String(row.id),
        type: String(row.type),
        titleAr: String(row.title_ar),
        titleFr: String(row.title_fr),
        bodyAr: String(row.body_ar),
        bodyFr: String(row.body_fr),
        createdAt: String(row.created_at),
        readAt: row.read_at ? String(row.read_at) : null
      }))
    });
  });

  router.post("/:id/read", (req, res) => {
    const result = db
      .prepare(
        "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL"
      )
      .run(nowIso(), req.params.id, req.user!.id);
    if (result.changes === 0) {
      const exists = db
        .prepare("SELECT id FROM notifications WHERE id = ? AND user_id = ?")
        .get(req.params.id, req.user!.id);
      if (!exists) {
        throw new ApiError(404, "notification_not_found", "الإشعار غير موجود.", "Notification introuvable.");
      }
    }
    res.json({ ok: true });
  });

  router.post("/read-all", (req, res) => {
    db.prepare(
      "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL"
    ).run(nowIso(), req.user!.id);
    res.json({ ok: true });
  });

  return router;
}
