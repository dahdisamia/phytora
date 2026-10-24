import "dotenv/config";
import { openDatabase } from "../server/db";
import { DATABASE_PATH } from "../server/config";
import { resetContentCache, loadContent } from "../server/content";

const db = openDatabase(DATABASE_PATH);
loadContent();
resetContentCache();
console.log(`[fieldguard] migrations applied to ${DATABASE_PATH}`);
db.close();
