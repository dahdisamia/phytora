import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  type TEXT NOT NULL,
  license_plan TEXT NOT NULL DEFAULT 'pilot',
  license_status TEXT NOT NULL DEFAULT 'active',
  license_expires_at TEXT,
  licensed_region_ids TEXT NOT NULL DEFAULT '[]',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization_id TEXT REFERENCES organizations(id),
  locale TEXT NOT NULL DEFAULT 'ar',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  crop_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  municipality_id TEXT,
  stage_id TEXT,
  suspected_pest_id TEXT,
  candidate_pest_ids TEXT NOT NULL DEFAULT '[]',
  answers TEXT NOT NULL DEFAULT '[]',
  severity TEXT,
  severity_level TEXT,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  top_pest_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id),
  expert_id TEXT REFERENCES users(id),
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  assessment TEXT,
  requested_info TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expert_profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  credentials TEXT NOT NULL,
  specializations TEXT NOT NULL DEFAULT '[]',
  crop_ids TEXT NOT NULL DEFAULT '[]',
  region_id TEXT NOT NULL,
  municipality_id TEXT,
  organization_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  office TEXT,
  consent_published INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  last_verified_at TEXT,
  availability_note_ar TEXT NOT NULL DEFAULT '',
  availability_note_fr TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  title_fr TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_fr TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_referrals_org ON referrals(organization_id);
CREATE INDEX IF NOT EXISTS idx_referrals_expert ON referrals(expert_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;

export function migrate(db: Db): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
}

export function openDatabase(file: string): Db {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function json<T>(value: T): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
