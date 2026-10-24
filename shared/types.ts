export type Locale = "ar" | "fr";
export type Role = "farmer" | "expert" | "institution_admin" | "super_admin";

export type ContentStatus = "draft" | "in_review" | "published" | "archived";
export type VerificationStatus =
  | "confirmed"
  | "expert_reviewed"
  | "reported"
  | "unverified"
  | "absent"
  | "unknown";

export type PestKind = "insect" | "mite" | "disease" | "other";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  locale: Locale;
  mustChangePassword?: boolean;
  createdAt: string;
}

export interface Country {
  code: string;
  nameAr: string;
  nameFr: string;
  defaultLocale: Locale;
}

export interface Region {
  id: string;
  code: string;
  countryCode: string;
  nameAr: string;
  nameFr: string;
  countryNameAr: string;
  countryNameFr: string;
}

export interface Municipality {
  id: string;
  regionId: string;
  nameAr: string;
  nameFr: string;
}

export interface CropStage {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  order: number;
}

export interface Crop {
  id: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  scientificName: string;
  category: string;
  descriptionAr: string;
  descriptionFr: string;
  imageKey: string;
  stages: CropStage[];
  regionIds: string[];
  lastUpdated: string;
  pestCount?: number;
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  publicationDate: string | null;
  accessedDate: string;
  kind: "datasheet" | "guideline" | "research" | "regulation" | "institutional";
  language: string;
}

export interface OccurrenceRecord {
  id: string;
  pestId: string;
  regionId: string | null;
  scope: "national" | "regional";
  status: VerificationStatus;
  noteAr: string;
  noteFr: string;
  sourceIds: string[];
  lastVerifiedAt: string;
}

export interface Trait {
  questionId: string;
  optionId: string;
  weight: number;
}

export interface Recommendation {
  id: string;
  pestIds: string[];
  cropIds: string[];
  category:
    | "prevention"
    | "monitoring"
    | "cultural"
    | "biological"
    | "other"
    | "chemical";
  titleAr: string;
  titleFr: string;
  purposeAr: string;
  purposeFr: string;
  conditionsAr: string;
  conditionsFr: string;
  benefitsAr: string;
  benefitsFr: string;
  limitationsAr: string;
  limitationsFr: string;
  environmentAr: string;
  environmentFr: string;
  beneficialImpactAr: string;
  beneficialImpactFr: string;
  safetyAr: string;
  safetyFr: string;
  sourceIds: string[];
  verificationDate: string;
  chemical: boolean;
  status: ContentStatus;
}

export interface Pest {
  id: string;
  slug: string;
  kind: PestKind;
  scientificName: string;
  authority: string;
  taxonomy: {
    kingdom: string;
    phylum: string;
    class: string;
    order: string;
    family: string;
    genus: string;
  };
  nameAr: string;
  nameFr: string;
  synonyms: string[];
  descriptionAr: string;
  descriptionFr: string;
  morphologyAr: string;
  morphologyFr: string;
  lifecycleAr: string;
  lifecycleFr: string;
  damageAr: string;
  damageFr: string;
  monitoringAr: string;
  monitoringFr: string;
  featuresAr: string[];
  featuresFr: string[];
  imageKey: string;
  beneficial: boolean;
  status: ContentStatus;
  cropIds: string[];
  symptomIds: string[];
  damageTypeIds: string[];
  similarPestIds: string[];
  traits: Trait[];
  occurrence: OccurrenceRecord[];
  recommendations: Recommendation[];
  sourceIds: string[];
  review: {
    reviewerName: string | null;
    status: "unreviewed" | "in_review" | "approved";
    lastVerifiedAt: string;
  };
  contentVersion: number;
  updatedAt: string;
}

export interface QuestionOption {
  id: string;
  labelAr: string;
  labelFr: string;
  descriptionAr: string;
  descriptionFr: string;
}

export interface Question {
  id: string;
  code: string;
  textAr: string;
  textFr: string;
  helpAr: string;
  helpFr: string;
  order: number;
  type: "single" | "multi";
  options: QuestionOption[];
}

export interface ExpertPublicProfile {
  id: string;
  displayName: string;
  credentials: string;
  specializations: string[];
  cropIds: string[];
  regionId: string;
  municipalityId: string | null;
  organizationName: string;
  contact: {
    phone: string | null;
    email: string | null;
    office: string | null;
  };
  consentPublished: boolean;
  verificationStatus: "pending" | "verified" | "revoked";
  lastVerifiedAt: string | null;
  availabilityNoteAr: string;
  availabilityNoteFr: string;
}

export interface ContentPackage {
  version: string;
  contentVersion: number;
  generatedAt: string;
  region: Region;
  municipalities: Municipality[];
  crops: Crop[];
  pests: Pest[];
  questions: Question[];
  sources: Source[];
  experts: ExpertPublicProfile[];
  warnings: string[];
  sizeBytes?: number;
}

export interface DiagnosticAnswer {
  questionId: string;
  optionId: string;
}

export interface DiagnosticInput {
  cropId: string;
  regionId: string;
  stageId: string | null;
  suspectedPestId: string | null;
  answers: DiagnosticAnswer[];
}

export type ConfidenceCategory = "likely" | "possible" | "uncertain" | "insufficient";

export interface CandidateResult {
  pest: Pest;
  score: number;
  evidence: Trait[];
  occurrence: OccurrenceRecord | null;
  occurrenceScope: "regional" | "national" | "none";
  confidence: ConfidenceCategory;
  isTop: boolean;
}

export interface DiagnosticResult {
  cropId: string;
  regionId: string;
  stageId: string | null;
  suspectedPestId: string | null;
  candidates: CandidateResult[];
  alternatives: CandidateResult[];
  top: CandidateResult | null;
  answeredCount: number;
  unansweredRelevant: string[];
  regionalDataAvailable: boolean;
  warnings: string[];
  method: "rule_based";
  generatedAt: string;
}

export type SeverityLevel =
  | "monitor"
  | "preventive"
  | "further_diagnosis"
  | "expert_required"
  | "urgent";

export interface SeverityInput {
  growthStage: string | null;
  damageExtent: "none" | "light" | "moderate" | "heavy" | "unknown";
  affectedPlants: "few" | "some" | "many" | "unknown";
  distribution: "few_spots" | "patches" | "widespread" | "unknown";
  rapidSpread: "yes" | "no" | "unknown";
  identificationConfidence: ConfidenceCategory;
}

export interface SeverityResult {
  level: SeverityLevel;
  reasons: { ar: string; fr: string }[];
  disclaimerAr: string;
  disclaimerFr: string;
  thresholdDataAvailable: false;
}

export type CaseStatus =
  | "local_draft"
  | "pending_sync"
  | "submitted"
  | "in_review"
  | "assessment_ready"
  | "closed"
  | "sync_conflict";

export interface LocalCase {
  id: string;
  clientId: string;
  serverId: string | null;
  userId: string | null;
  cropId: string;
  cropNameAr: string;
  cropNameFr: string;
  regionId: string;
  municipalityId: string | null;
  municipalityName: string | null;
  stageId: string | null;
  suspectedPestId: string | null;
  candidatePestIds: string[];
  topPestNameAr?: string;
  topPestNameFr?: string;
  answers: DiagnosticAnswer[];
  severity: SeverityInput | null;
  severityLevel: SeverityLevel | null;
  notes: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  lastSyncError: string | null;
  version: number;
  serverUpdatedAt?: string | null;
  referralStatus?: string | null;
  assessment?: string | null;
  requestedInfo?: string | null;
}

export interface CaseRecord extends LocalCase {
  serverId: string;
  userName?: string;
  organizationName?: string;
}

export interface Referral {
  id: string;
  caseId: string;
  casePublicId: string;
  status: "awaiting_assignment" | "assigned" | "in_review" | "responded" | "closed";
  message: string;
  expertId: string | null;
  expertName: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  cropNameAr: string;
  cropNameFr: string;
  regionNameAr: string;
  regionNameFr: string;
  municipalityNameAr: string | null;
  municipalityNameFr: string | null;
  topPestNameAr: string | null;
  topPestNameFr: string | null;
  farmerName: string;
  farmerEmail: string;
  assessment: string | null;
  requestedInfo: string | null;
}

export interface DashboardStats {
  totals: {
    reports: number;
    verified: number;
    pending: number;
    cases: number;
    experts: number;
    farmers: number;
  };
  byMunicipality: { id: string; nameAr: string; nameFr: string; count: number }[];
  byCrop: { id: string; nameAr: string; nameFr: string; count: number }[];
  byPest: { id: string; nameAr: string; nameFr: string; count: number; verified: number }[];
  monthly: { month: string; count: number; verified: number }[];
  privacy: { minAggregation: number; noteAr: string; noteFr: string };
}

export interface Organization {
  id: string;
  nameAr: string;
  nameFr: string;
  type: string;
  licensePlan: string;
  licenseStatus: string;
  licenseExpiresAt: string | null;
  licensedRegionIds: string[];
  isDemo: boolean;
  userCount?: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  titleAr: string;
  titleFr: string;
  bodyAr: string;
  bodyFr: string;
  createdAt: string;
  readAt: string | null;
}

export interface ApiErrorShape {
  error: {
    code: string;
    messageAr: string;
    messageFr: string;
    fieldErrors?: Record<string, string>;
  };
}
