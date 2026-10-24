import { openDB, DBSchema, IDBPDatabase } from "idb";

interface FieldGuardDB extends DBSchema {
  cases: {
    key: string;
    value: {
      id: string;
      localId: string;
      remoteId?: string;
      cropId: string;
      regionId: string;
      answers: any[];
      result: any;
      status: "local" | "syncing" | "synced" | "failed";
      createdAt: string;
      updatedAt: string;
      version: number;
    };
    indexes: { status: string; updatedAt: string };
  };
  outbox: {
    key: string;
    value: {
      id: string;
      type: "upsert_case" | "referral";
      payload: any;
      attempts: number;
      lastAttemptAt?: string;
      nextRetryAt?: string;
      createdAt: string;
    };
    indexes: { nextRetryAt: string };
  };
  content: {
    key: string;
    value: {
      key: string;
      data: any;
      version: string;
      updatedAt: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<FieldGuardDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FieldGuardDB>("fieldguard-offline", 1, {
      upgrade(db) {
        const cases = db.createObjectStore("cases", { keyPath: "localId" });
        cases.createIndex("status", "status");
        cases.createIndex("updatedAt", "updatedAt");
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("nextRetryAt", "nextRetryAt");
        db.createObjectStore("content", { keyPath: "key" });
      }
    });
  }
  return dbPromise;
}

export async function saveCaseLocal(caseData: {
  cropId: string;
  regionId: string;
  answers: any[];
  result: any;
}) {
  const db = await getDB();
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const record = {
    id: localId,
    localId,
    cropId: caseData.cropId,
    regionId: caseData.regionId,
    answers: caseData.answers,
    result: caseData.result,
    status: "local" as const,
    createdAt: now,
    updatedAt: now,
    version: 1
  };
  await db.put("cases", record);
  await db.put("outbox", {
    id: `out_${localId}`,
    type: "upsert_case",
    payload: record,
    attempts: 0,
    createdAt: now
  });
  return record;
}

export async function listLocalCases() {
  const db = await getDB();
  return db.getAll("cases");
}

export async function syncOutbox() {
  const db = await getDB();
  const items = await db.getAll("outbox");
  for (const item of items) {
    try {
      const res = await fetch("/api/cases/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });
      if (res.ok) {
        await db.delete("outbox", item.id);
        const updated = { ...item.payload, status: "synced" as const, remoteId: (await res.json()).case?.id };
        await db.put("cases", updated);
      } else {
        await db.put("outbox", { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() });
      }
    } catch {
      // Never delete on failure
      await db.put("outbox", { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() });
    }
  }
}
