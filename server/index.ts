import "dotenv/config";
import { openDatabase } from "./db";
import { loadContent } from "./content";
import { createApp } from "./app";
import { seedAuditNote, seedDemoData } from "./seed";
import { DATABASE_PATH, IS_PROD, PORT } from "./config";

const db = openDatabase(DATABASE_PATH);
const store = loadContent();

if (!IS_PROD || process.env.SEED_DEMO === "1") {
  const result = seedDemoData(db);
  seedAuditNote(db);
  if (result.createdOrg || result.createdUsers > 0) {
    console.log(
      `[fieldguard] demo data ready (org: ${result.createdOrg}, users: ${result.createdUsers})`
    );
  }
}

const app = createApp(db, store);
const server = app.listen(PORT, () => {
  console.log(`[fieldguard] API on http://localhost:${PORT}`);
  console.log(`[fieldguard] content version ${store.contentVersion}`);
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
