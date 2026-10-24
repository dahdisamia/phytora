import "dotenv/config";
import { openDatabase } from "../server/db";
import { DATABASE_PATH } from "../server/config";
import { loadContent } from "../server/content";
import { seedAuditNote, seedDemoData } from "../server/seed";

const db = openDatabase(DATABASE_PATH);
const store = loadContent();
const result = seedDemoData(db);
seedAuditNote(db);
console.log(
  `[fieldguard] seeded demo org/users (org created: ${result.createdOrg}, users created: ${result.createdUsers}); content ${store.contentVersion}`
);
console.log("[fieldguard] demo password:", "Demo!Pass123");
db.close();
