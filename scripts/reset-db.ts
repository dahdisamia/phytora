import "dotenv/config";
import fs from "node:fs";
import { DATABASE_PATH } from "../server/config";

for (const suffix of ["", "-wal", "-shm"]) {
  const file = DATABASE_PATH + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`removed ${file}`);
  }
}
console.log("Database reset. Run npm run db:seed to recreate the demo data.");
