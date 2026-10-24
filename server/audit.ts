import crypto from "node:crypto";
import type { Request } from "express";
import type { Db } from "./db";
import { nowIso, parseJson } from "./db";

export function audit(
  db: Db,
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    req.user?.id ?? null,
    action,
    entityType,
    entityId,
    JSON.stringify(metadata),
    req.ip ?? null,
    nowIso()
  );
}

export function notify(
  db: Db,
  userId: string,
  type: string,
  titleAr: string,
  titleFr: string,
  bodyAr: string,
  bodyFr: string
): void {
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title_ar, title_fr, body_ar, body_fr, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    type,
    titleAr,
    titleFr,
    bodyAr,
    bodyFr,
    nowIso()
  );
}

export function notifyOrganizationAdmins(
  db: Db,
  organizationId: string | null,
  type: string,
  titleAr: string,
  titleFr: string,
  bodyAr: string,
  bodyFr: string
): void {
  if (!organizationId) return;
  const admins = db
    .prepare(
      "SELECT id FROM users WHERE organization_id = ? AND role IN ('institution_admin','super_admin') AND disabled = 0"
    )
    .all(organizationId) as { id: string }[];
  for (const admin of admins) {
    notify(db, admin.id, type, titleAr, titleFr, bodyAr, bodyFr);
  }
}

export function readStringArray(value: string | null): string[] {
  return parseJson<string[]>(value, []);
}
