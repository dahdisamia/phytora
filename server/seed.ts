import crypto from "node:crypto";
import type { Db } from "./db";
import { nowIso } from "./db";
import { hashPassword } from "./auth";
import { DEMO_ORG_ID, DEMO_PASSWORD } from "./config";

interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  role: "farmer" | "expert" | "institution_admin" | "super_admin";
  locale: "ar" | "fr";
}

const DEMO_USERS: DemoUser[] = [
  {
    id: "user-demo-farmer",
    email: "farmer@demo.fieldguard.dz",
    displayName: "مزارع تجريبي (حساب اختبار)",
    role: "farmer",
    locale: "ar"
  },
  {
    id: "user-demo-expert",
    email: "expert@demo.fieldguard.dz",
    displayName: "خبير تجريبي (حساب اختبار)",
    role: "expert",
    locale: "ar"
  },
  {
    id: "user-demo-admin",
    email: "admin@demo.fieldguard.dz",
    displayName: "مسؤول مؤسسة تجريبي (حساب اختبار)",
    role: "institution_admin",
    locale: "ar"
  },
  {
    id: "user-demo-super",
    email: "super@demo.fieldguard.dz",
    displayName: "مشرف عام تجريبي (حساب اختبار)",
    role: "super_admin",
    locale: "ar"
  }
];

export function seedDemoData(db: Db): { createdUsers: number; createdOrg: boolean } {
  const now = nowIso();
  const existingOrg = db
    .prepare("SELECT id FROM organizations WHERE id = ?")
    .get(DEMO_ORG_ID);
  if (!existingOrg) {
    db.prepare(
      `INSERT INTO organizations (id, name_ar, name_fr, type, license_plan, license_status, license_expires_at, licensed_region_ids, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      DEMO_ORG_ID,
      "مديرية المصالح الفلاحية — بيانات تجريبية",
      "DSA de démonstration — données de test",
      "chamber",
      "chamber",
      "trial",
      "2027-12-31",
      JSON.stringify(["dz-eloued"]),
      now
    );
  }
  const researchOrgId = "org-demo-research";
  if (!db.prepare("SELECT id FROM organizations WHERE id = ?").get(researchOrgId)) {
    db.prepare(
      `INSERT INTO organizations (id, name_ar, name_fr, type, license_plan, license_status, license_expires_at, licensed_region_ids, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      researchOrgId,
      "مؤسسة بحث تجريبية — بيانات تجريبية",
      "Institut de recherche de démonstration — données de test",
      "research",
      "research",
      "trial",
      null,
      JSON.stringify(["dz-eloued"]),
      now
    );
  }

  let createdUsers = 0;
  for (const user of DEMO_USERS) {
    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(user.email) as { id: string } | undefined;
    if (existing) continue;
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, role, organization_id, locale, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      user.id,
      user.email,
      hashPassword(DEMO_PASSWORD),
      user.displayName,
      user.role,
      DEMO_ORG_ID,
      user.locale,
      now
    );
    createdUsers += 1;
  }

  const expertExists = db
    .prepare("SELECT id FROM expert_profiles WHERE id = ?")
    .get("user-demo-expert");
  if (!expertExists) {
    db.prepare(
      `INSERT INTO expert_profiles (
        id, display_name, credentials, specializations, crop_ids, region_id, municipality_id,
        organization_name, phone, email, office, consent_published, verification_status,
        last_verified_at, availability_note_ar, availability_note_fr
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 'verified', ?, ?, ?)`
    ).run(
      "user-demo-expert",
      "خبير تجريبي (حساب اختبار)",
      "ملف تجريبي لاختبار سير العمل فقط — ليس خبيراً حقيقياً وليس مؤهلاً علمياً",
      JSON.stringify(["اختبار سير العمل"]),
      JSON.stringify(["crop-date-palm", "crop-potato", "crop-tomato"]),
      "dz-eloued",
      null,
      "مديرية المصالح الفلاحية — بيانات تجريبية",
      now,
      "حساب تجريبي لاختبار الإحالات. لا يُعرض في الدليل العام.",
      "Compte de test pour le workflow des avis. Non affiché dans l'annuaire public."
    );
  }

  return { createdUsers, createdOrg: !existingOrg };
}

export function seedAuditNote(db: Db): void {
  const row = db
    .prepare("SELECT id FROM audit_logs WHERE action = 'system.seed' LIMIT 1")
    .get();
  if (row) return;
  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata, ip, created_at)
     VALUES (?, NULL, 'system.seed', 'system', NULL, ?, NULL, ?)`
  ).run(
    crypto.randomUUID(),
    JSON.stringify({ demo: true, note: "Demo accounts and organisations seeded" }),
    nowIso()
  );
}
