import type {
  CaseRecord,
  CaseStatus,
  ConfidenceCategory,
  DiagnosticAnswer,
  Referral,
  SeverityInput,
  SeverityLevel
} from "../shared/types";
import type { Db } from "./db";
import { parseJson } from "./db";
import type { ContentStore } from "./content";
import { getCrop, getMunicipality, getPest, getRegion } from "./content";

export interface CaseRow {
  id: string;
  client_id: string;
  user_id: string;
  organization_id: string | null;
  crop_id: string;
  region_id: string;
  municipality_id: string | null;
  stage_id: string | null;
  suspected_pest_id: string | null;
  candidate_pest_ids: string;
  answers: string;
  severity: string | null;
  severity_level: string | null;
  notes: string;
  status: string;
  top_pest_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export function mapCase(
  db: Db,
  store: ContentStore,
  row: CaseRow
): CaseRecord {
  const crop = getCrop(store, row.crop_id);
  const region = getRegion(store, row.region_id);
  const municipality = row.municipality_id
    ? getMunicipality(store, row.municipality_id)
    : undefined;
  const candidateIds = parseJson<string[]>(row.candidate_pest_ids, []);
  const topId = row.top_pest_id ?? candidateIds[0] ?? null;
  const top = topId ? getPest(store, topId) : undefined;
  const suspected = row.suspected_pest_id
    ? getPest(store, row.suspected_pest_id)
    : undefined;
  const referral = db
    .prepare(
      "SELECT status, assessment, requested_info FROM referrals WHERE case_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(row.id) as
    | { status: string; assessment: string | null; requested_info: string | null }
    | undefined;

  return {
    id: row.id,
    clientId: row.client_id,
    serverId: row.id,
    userId: row.user_id,
    cropId: row.crop_id,
    cropNameAr: crop?.nameAr ?? row.crop_id,
    cropNameFr: crop?.nameFr ?? row.crop_id,
    regionId: row.region_id,
    municipalityId: row.municipality_id,
    municipalityName: municipality
      ? municipality.nameAr
      : null,
    stageId: row.stage_id,
    suspectedPestId: suspected?.id ?? null,
    candidatePestIds: candidateIds,
    topPestNameAr: top?.nameAr,
    topPestNameFr: top?.nameFr,
    answers: parseJson<DiagnosticAnswer[]>(row.answers, []),
    severity: parseJson<SeverityInput | null>(row.severity, null),
    severityLevel: (row.severity_level as SeverityLevel | null) ?? null,
    notes: row.notes,
    status: row.status as CaseStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.updated_at,
    lastSyncError: null,
    version: row.version,
    serverUpdatedAt: row.updated_at,
    referralStatus: referral?.status ?? null,
    assessment: referral?.assessment ?? null,
    requestedInfo: referral?.requested_info ?? null
  };
}

export interface ReferralRow {
  id: string;
  case_id: string;
  organization_id: string | null;
  expert_id: string | null;
  status: string;
  message: string;
  assessment: string | null;
  requested_info: string | null;
  created_at: string;
  updated_at: string;
  crop_id: string;
  region_id: string;
  municipality_id: string | null;
  top_pest_id: string | null;
  candidate_pest_ids: string;
  farmer_name: string;
  farmer_email: string;
  expert_name: string | null;
  case_public_id: string;
}

export function mapReferral(
  store: ContentStore,
  row: ReferralRow
): Referral {
  const crop = getCrop(store, row.crop_id);
  const region = getRegion(store, row.region_id);
  const municipality = row.municipality_id
    ? getMunicipality(store, row.municipality_id)
    : undefined;
  const topId = row.top_pest_id ?? parseJson<string[]>(row.candidate_pest_ids, [])[0] ?? null;
  const top = topId ? getPest(store, topId) : undefined;
  return {
    id: row.id,
    caseId: row.case_id,
    casePublicId: row.case_public_id,
    status: row.status as Referral["status"],
    message: row.message,
    expertId: row.expert_id,
    expertName: row.expert_name,
    organizationId: row.organization_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cropNameAr: crop?.nameAr ?? row.crop_id,
    cropNameFr: crop?.nameFr ?? row.crop_id,
    regionNameAr: region?.nameAr ?? row.region_id,
    regionNameFr: region?.nameFr ?? row.region_id,
    municipalityNameAr: municipality?.nameAr ?? null,
    municipalityNameFr: municipality?.nameFr ?? null,
    topPestNameAr: top?.nameAr ?? null,
    topPestNameFr: top?.nameFr ?? null,
    farmerName: row.farmer_name,
    farmerEmail: row.farmer_email,
    assessment: row.assessment,
    requestedInfo: row.requested_info
  };
}

export const REFERRAL_SELECT = `
  SELECT r.*, c.crop_id, c.region_id, c.municipality_id, c.top_pest_id,
         c.candidate_pest_ids, c.client_id AS case_public_id,
         u.display_name AS farmer_name, u.email AS farmer_email,
         e.display_name AS expert_name
  FROM referrals r
  JOIN cases c ON c.id = r.case_id
  JOIN users u ON u.id = c.user_id
  LEFT JOIN users e ON e.id = r.expert_id
`;

export type { ConfidenceCategory };
