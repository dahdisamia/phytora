import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Db } from "./db";
import { nowIso } from "./db";
import type { Role, User } from "../shared/types";
import { SESSION_TTL_DAYS } from "./config";

export interface SessionUser extends User {
  organizationIsDemo: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSession(db: Db, userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + SESSION_TTL_DAYS);
  const expiresAt = expires.toISOString();
  db.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), userId, tokenHash(token), expiresAt, now.toISOString());
  return { token, expiresAt };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function deleteExpiredSessions(db: Db): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
}

export function userFromToken(db: Db, token: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.*, o.name_ar AS org_name_ar, o.name_fr AS org_name_fr, o.is_demo AS org_is_demo
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`
    )
    .get(tokenHash(token), nowIso()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: row.role as Role,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    organizationName: row.org_name_ar
      ? String(row.org_name_ar)
      : row.org_name_fr
        ? String(row.org_name_fr)
        : null,
    locale: row.locale === "fr" ? "fr" : "ar",
    mustChangePassword: Number(row.must_change_password) === 1,
    createdAt: String(row.created_at),
    organizationIsDemo: Number(row.org_is_demo ?? 0) === 1
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: "auth_required",
        messageAr: "يجب تسجيل الدخول للمتابعة.",
        messageFr: "Vous devez vous connecter pour continuer."
      }
    });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: "auth_required",
          messageAr: "يجب تسجيل الدخول للمتابعة.",
          messageFr: "Vous devez vous connecter pour continuer."
        }
      });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: "forbidden",
          messageAr: "ليست لديك الصلاحية لهذا الإجراء.",
          messageFr: "Vous n'avez pas l'autorisation pour cette action."
        }
      });
      return;
    }
    next();
  };
}

export function isStaff(user: SessionUser): boolean {
  return user.role === "expert" || user.role === "institution_admin" || user.role === "super_admin";
}
