import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db";
import { nowIso } from "../db";
import type { ContentStore } from "../content";
import {
  createSession,
  deleteSession,
  hashPassword,
  requireAuth,
  userFromToken,
  verifyPassword
} from "../auth";
import { ApiError } from "../errors";
import { audit } from "../audit";
import { IS_PROD, SESSION_COOKIE, SESSION_TTL_DAYS } from "../config";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل.")
    .max(200)
    .regex(/[A-Za-z]/, "يجب أن تحتوي كلمة المرور على حرف.")
    .regex(/[0-9]/, "يجب أن تحتوي كلمة المرور على رقم."),
  displayName: z.string().trim().min(2).max(120),
  locale: z.enum(["ar", "fr"]).default("ar")
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل.")
    .max(200)
    .regex(/[A-Za-z]/, "يجب أن تحتوي كلمة المرور على حرف.")
    .regex(/[0-9]/, "يجب أن تحتوي كلمة المرور على رقم.")
});

const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new ApiError(
      429,
      "rate_limited",
      "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.",
      "Trop de tentatives. Patientez quelques minutes puis réessayez."
    );
  }
}

function resetRateLimit(key: string): void {
  attempts.delete(key);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: IS_PROD,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

function publicUser(db: Db, user: ReturnType<typeof userFromToken> | undefined) {
  if (!user) return null;
  const unread = db
    .prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL"
    )
    .get(user.id) as { count: number };
  const profile = db
    .prepare("SELECT verification_status FROM expert_profiles WHERE id = ?")
    .get(user.id) as { verification_status: string } | undefined;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organizationName,
    organizationIsDemo: user.organizationIsDemo,
    locale: user.locale,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    expertVerificationStatus: profile?.verification_status ?? null,
    unreadNotifications: unread?.count ?? 0
  };
}

export function authRouter(db: Db, _store: ContentStore): Router {
  const router = Router();

  router.post("/register", (req, res) => {
    const body = registerSchema.parse(req.body);
    checkRateLimit(`register:${req.ip}`);
    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(body.email) as { id: string } | undefined;
    if (existing) {
      throw new ApiError(
        409,
        "email_taken",
        "هذا البريد مستخدم بالفعل.",
        "Cette adresse e-mail est déjà utilisée.",
        { email: "email_taken" }
      );
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, role, organization_id, locale, must_change_password, created_at)
       VALUES (?, ?, ?, ?, 'farmer', NULL, ?, 0, ?)`
    ).run(id, body.email, hashPassword(body.password), body.displayName, body.locale, nowIso());
    const { token } = createSession(db, id);
    req.user = userFromToken(db, token) ?? undefined;
    audit(db, req, "auth.register", "user", id, { role: "farmer" });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.status(201).json({ user: publicUser(db, req.user) });
  });

  router.post("/login", (req, res) => {
    const body = loginSchema.parse(req.body);
    checkRateLimit(`login:${req.ip}:${body.email}`);
    const row = db
      .prepare("SELECT id, password_hash, disabled FROM users WHERE email = ?")
      .get(body.email) as
      | { id: string; password_hash: string; disabled: number }
      | undefined;
    if (!row || row.disabled === 1 || !verifyPassword(body.password, row.password_hash)) {
      throw new ApiError(
        401,
        "invalid_credentials",
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        "E-mail ou mot de passe incorrect."
      );
    }
    resetRateLimit(`login:${req.ip}:${body.email}`);
    const { token } = createSession(db, row.id);
    req.user = userFromToken(db, token) ?? undefined;
    audit(db, req, "auth.login", "user", row.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json({ user: publicUser(db, req.user) });
  });

  router.post("/logout", (req, res) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  router.get("/me", (req, res) => {
    res.json({ user: publicUser(db, req.user ?? null) });
  });

  router.post("/change-password", requireAuth, (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const row = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(req.user!.id) as { password_hash: string };
    if (!verifyPassword(body.currentPassword, row.password_hash)) {
      throw new ApiError(
        400,
        "invalid_password",
        "كلمة المرور الحالية غير صحيحة.",
        "Le mot de passe actuel est incorrect.",
        { currentPassword: "invalid_password" }
      );
    }
    db.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?"
    ).run(hashPassword(body.newPassword), req.user!.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.user!.id);
    const { token } = createSession(db, req.user!.id);
    req.user = userFromToken(db, token) ?? undefined;
    audit(db, req, "auth.change_password", "user", req.user!.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json({ user: publicUser(db, req.user) });
  });

  return router;
}
