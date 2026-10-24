import path from "node:path";

export const ROOT_DIR = process.cwd();
export const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(ROOT_DIR, "content");
export const DATABASE_PATH =
  process.env.DATABASE_PATH ?? path.join(ROOT_DIR, "data", "fieldguard.db");
export const PORT = Number(process.env.PORT ?? 3001);
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const SESSION_COOKIE = "fg_session";
export const SESSION_TTL_DAYS = 14;
export const IS_PROD = NODE_ENV === "production";
export const DEMO_ORG_ID = "org-demo-dsa";
export const DEMO_PASSWORD = "Demo!Pass123";
