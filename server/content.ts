import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  Crop,
  ExpertPublicProfile,
  Municipality,
  Question,
  Region,
  Source,
  ContentPackage
} from "../shared/types";
import { resolvePests, validateContent, type RawPest } from "../shared/content";
import { CONTENT_DIR } from "./config";
import type { Db } from "./db";
import { parseJson } from "./db";

interface RawRegions {
  countries: { code: string; nameAr: string; nameFr: string; defaultLocale: "ar" | "fr" }[];
  regions: Omit<Region, "countryNameAr" | "countryNameFr">[];
  municipalities: Municipality[];
}

export interface ContentStore {
  regions: Region[];
  countries: RawRegions["countries"];
  municipalities: Municipality[];
  crops: Crop[];
  pests: ReturnType<typeof resolvePests>;
  questions: Question[];
  sources: Source[];
  contentVersion: string;
}

let cache: ContentStore | null = null;

function readJson<T>(name: string): T {
  const file = path.join(CONTENT_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function loadContent(): ContentStore {
  if (cache) return cache;
  const rawRegions = readJson<RawRegions>("regions.json");
  const crops = readJson<Crop[]>("crops.json");
  const questions = readJson<Question[]>("questions.json");
  const sources = readJson<Source[]>("sources.json");
  const recommendations = readJson<Parameters<typeof resolvePests>[1]>("recommendations.json");
  const rawPests = readJson<RawPest[]>("pests.json");
  const pests = resolvePests(rawPests, recommendations);

  const problems = validateContent({
    crops,
    pests,
    questions,
    recommendations,
    sources
  });
  if (problems.length > 0) {
    throw new Error(`Content validation failed:\n${problems.join("\n")}`);
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ crops, questions, sources, rawPests, recommendations }))
    .digest("hex")
    .slice(0, 12);

  const regions: Region[] = rawRegions.regions.map((region) => {
    const country = rawRegions.countries.find((item) => item.code === region.countryCode);
    return {
      ...region,
      countryNameAr: country?.nameAr ?? region.countryCode,
      countryNameFr: country?.nameFr ?? region.countryCode
    };
  });

  cache = {
    regions,
    countries: rawRegions.countries,
    municipalities: rawRegions.municipalities,
    crops,
    pests,
    questions,
    sources,
    contentVersion: hash
  };
  return cache;
}

export function resetContentCache(): void {
  cache = null;
}

export function getCrop(store: ContentStore, cropId: string): Crop | undefined {
  return store.crops.find((crop) => crop.id === cropId);
}

export function getPest(store: ContentStore, pestId: string): ContentStore["pests"][number] | undefined {
  return store.pests.find((pest) => pest.id === pestId);
}

export function getRegion(store: ContentStore, regionId: string): Region | undefined {
  return store.regions.find((region) => region.id === regionId);
}

export function getMunicipality(
  store: ContentStore,
  municipalityId: string
): Municipality | undefined {
  return store.municipalities.find((item) => item.id === municipalityId);
}

export function getSources(store: ContentStore, sourceIds: string[]): Source[] {
  return sourceIds
    .map((id) => store.sources.find((source) => source.id === id))
    .filter((source): source is Source => Boolean(source));
}

export function getPublicExperts(
  db: Db,
  filters: { regionId?: string; cropId?: string } = {}
): ExpertPublicProfile[] {
  const rows = db
    .prepare(
      `SELECT ep.*, u.organization_id, o.is_demo
       FROM expert_profiles ep
       JOIN users u ON u.id = ep.id
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE ep.verification_status = 'verified'
         AND ep.consent_published = 1
         AND u.disabled = 0
         AND COALESCE(o.is_demo, 0) = 0`
    )
    .all() as Record<string, unknown>[];

  return rows
    .map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      credentials: String(row.credentials),
      specializations: parseJson<string[]>(String(row.specializations), []),
      cropIds: parseJson<string[]>(String(row.crop_ids), []),
      regionId: String(row.region_id),
      municipalityId: row.municipality_id ? String(row.municipality_id) : null,
      organizationName: String(row.organization_name),
      contact: {
        phone: row.phone ? String(row.phone) : null,
        email: row.email ? String(row.email) : null,
        office: row.office ? String(row.office) : null
      },
      consentPublished: true,
      verificationStatus: "verified" as const,
      lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : null,
      availabilityNoteAr: String(row.availability_note_ar ?? ""),
      availabilityNoteFr: String(row.availability_note_fr ?? "")
    }))
    .filter((expert) => {
      if (filters.regionId && expert.regionId !== filters.regionId) return false;
      if (filters.cropId && !expert.cropIds.includes(filters.cropId)) return false;
      return true;
    });
}

export function buildContentPackage(
  store: ContentStore,
  regionId: string,
  experts: ExpertPublicProfile[]
): ContentPackage {
  const region = store.regions.find((item) => item.id === regionId) ?? store.regions[0];
  const pests = store.pests.filter(
    (pest) => pest.status === "published" && pest.occurrence.some((occ) => {
      if (occ.scope === "regional") return occ.regionId === region.id;
      return occ.scope === "national";
    })
  );
  const regionalConfirmed = pests.filter((pest) =>
    pest.occurrence.some(
      (occ) =>
        occ.scope === "regional" &&
        occ.regionId === region.id &&
        (occ.status === "confirmed" || occ.status === "expert_reviewed")
    )
  ).length;
  const warningIds = [
    "content_not_agronomist_reviewed",
    "chemical_products_unavailable",
    "economic_thresholds_unavailable"
  ];
  if (regionalConfirmed <= 1) warningIds.push("regional_data_limited");
  if (experts.length === 0) warningIds.push("expert_directory_empty");

  return {
    version: `2026.10.23-${store.contentVersion}`,
    contentVersion: 1,
    generatedAt: new Date().toISOString(),
    region,
    municipalities: store.municipalities.filter((item) => item.regionId === region.id),
    crops: store.crops.filter((crop) => crop.regionIds.includes(region.id)),
    pests,
    questions: store.questions,
    sources: store.sources,
    experts,
    warnings: warningIds
  };
}
