-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE SCHEMA curricular AUTHORIZATION postgres;

CREATE TYPE curricular."AcademicDocumentType" AS ENUM (
  'OFFICIAL_ACADEMIC_HISTORY',
  'SIMPLE_ACADEMIC_HISTORY',
  'CURRICULAR_EXTRACT',
  'UNKNOWN_ACADEMIC_DOCUMENT'
);

CREATE TYPE curricular."AcademicGridReviewStatus" AS ENUM (
  'NO_PENDING',
  'CAN_ADD',
  'NEAR_LIMIT',
  'LIMIT_REACHED',
  'MANUAL_REVIEW_REQUIRED'
);

CREATE TYPE curricular."AcademicRequestStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'UNDER_REVIEW',
  'WAITING_NEW_DOCUMENT',
  'NO_CHANGES',
  'COMPLETED',
  'REJECTED',
  'FAILED'
);

CREATE TYPE curricular."AIOperation" AS ENUM (
  'DOCUMENT_EXTRACTION',
  'CURRICULUM_EXTRACTION',
  'AUDIT',
  'FINAL_EXPLANATION',
  'CONNECTION_TEST'
);

CREATE TYPE curricular."AIPrivacyMode" AS ENUM (
  'PDF_FILE',
  'REDACTED_TEXT'
);

CREATE TYPE curricular."AIReviewStatus" AS ENUM (
  'OK',
  'REVIEW'
);

CREATE TYPE curricular."AnalysisStatus" AS ENUM (
  'UPLOADED',
  'PARSING',
  'AI_EXTRACTION',
  'NORMALIZING',
  'CALCULATING',
  'VALIDATING',
  'AI_AUDIT',
  'WAITING_REVIEW',
  'COMPLETED',
  'FAILED',
  'AI_ERROR'
);

CREATE TYPE curricular."CourseFormat" AS ENUM (
  'EAD_DIGITAL',
  'SEMIPRESENCIAL'
);

CREATE TYPE curricular."DeletionRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE curricular."EnrollmentStatus" AS ENUM (
  'PENDING',
  'ENROLLED',
  'NOT_ENROLLED'
);

CREATE TYPE curricular."EntryPeriodSource" AS ENUM (
  'DOCUMENT',
  'STRUCTURED',
  'RULE',
  'USER'
);

CREATE TYPE curricular."FollowUpCadence" AS ENUM (
  'ONCE_DAILY',
  'TWICE_DAILY'
);

CREATE TYPE curricular."IntegrationStatus" AS ENUM (
  'DISCONNECTED',
  'CONNECTED',
  'ERROR'
);

CREATE TYPE curricular."ProjectionSubjectKind" AS ENUM (
  'REGULAR',
  'BACKLOG'
);

CREATE TYPE curricular."Readability" AS ENUM (
  'CLEAR',
  'UNCLEAR',
  'UNREADABLE'
);

CREATE TYPE curricular."ReliabilityLevel" AS ENUM (
  'HIGH',
  'REVIEW_RECOMMENDED',
  'REVIEW_REQUIRED'
);

CREATE TYPE curricular."RetentionPolicy" AS ENUM (
  'DAYS_30',
  'DAYS_90',
  'DAYS_180',
  'INDEFINITE',
  'DELETE_AFTER_PROCESSING'
);

CREATE TYPE curricular."Role" AS ENUM (
  'ADMIN',
  'ACADEMIC_COORDINATOR',
  'TUTOR',
  'ANALYST',
  'VIEWER',
  'STUDENT'
);

CREATE TYPE curricular."RuleStatus" AS ENUM (
  'CONFIRMED',
  'CONFIGURABLE',
  'NOT_CONFIGURED'
);

CREATE TYPE curricular."SubjectOrigin" AS ENUM (
  'AI',
  'USER'
);

CREATE TYPE curricular."SubjectStatus" AS ENUM (
  'EXEMPTED',
  'PENDING',
  'REVIEW'
);

CREATE TYPE curricular."WarningSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

CREATE TYPE curricular."WarningSource" AS ENUM (
  'PIPELINE',
  'VALIDATOR',
  'AUDITOR',
  'EXTRACTION'
);

CREATE SEQUENCE curricular."AcademicRequest_protocol_seq" AS integer;

CREATE TABLE curricular."AcademicAnalysisSource" (
  "organizationId"        uuid                              DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                      uuid                              NOT NULL,
  "enrollmentId"          uuid                              NOT NULL,
  "sourceFileHash"        character(64)                     NOT NULL,
  "documentType"          curricular."AcademicDocumentType" DEFAULT 'CURRICULAR_EXTRACT'::curricular."AcademicDocumentType" NOT NULL,
  "parsedSnapshot"        jsonb,
  "parserName"            text,
  "validationResult"      text,
  "normalizedContentHash" character(64),
  "deleteAfter"           timestamp(6) with time zone,
  "deletedAt"             timestamp(6) with time zone,
  "storageKey"            text,
  filename                text                              NOT NULL,
  status                  text                              DEFAULT 'PROCESSING'::text NOT NULL,
  stage                   text                              DEFAULT 'Processando extrato'::text NOT NULL,
  "actorUserId"           uuid                              NOT NULL,
  "actorRole"             curricular."Role"                 NOT NULL,
  "versionId"             uuid,
  "errorMessage"          text,
  reused                  boolean                           DEFAULT false NOT NULL,
  attempts                integer                           DEFAULT 1 NOT NULL,
  "createdAt"             timestamp(6) with time zone       DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"             timestamp(6) with time zone       NOT NULL
);

ALTER TABLE curricular."AcademicAnalysisSource"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_pkey" PRIMARY KEY (id);

CREATE INDEX "AcademicAnalysisSource_enrollmentId_normalizedContentHash_s_idx" ON curricular."AcademicAnalysisSource" ("enrollmentId", "normalizedContentHash", status);

CREATE INDEX "AcademicAnalysisSource_enrollmentId_createdAt_idx" ON curricular."AcademicAnalysisSource" ("enrollmentId", "createdAt" DESC);

CREATE INDEX "AcademicAnalysisSource_actorUserId_idx" ON curricular."AcademicAnalysisSource" ("actorUserId");

CREATE INDEX "AcademicAnalysisSource_versionId_idx" ON curricular."AcademicAnalysisSource" ("versionId");

CREATE INDEX "AcademicAnalysisSource_deleteAfter_idx" ON curricular."AcademicAnalysisSource" ("deleteAfter");

CREATE INDEX "AcademicAnalysisSource_organizationId_idx" ON curricular."AcademicAnalysisSource" ("organizationId");

CREATE UNIQUE INDEX "AcademicAnalysisSource_enrollmentId_sourceFileHash_key" ON curricular."AcademicAnalysisSource" ("enrollmentId", "sourceFileHash");

CREATE TABLE curricular."AcademicAnalysisVersion" (
  "organizationId"       uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                     uuid                        NOT NULL,
  "enrollmentId"         uuid                        NOT NULL,
  "reviewId"             uuid                        NOT NULL,
  version                integer                     NOT NULL,
  "previousVersionId"    uuid,
  "preferredSourceId"    uuid,
  "academicSnapshotHash" character(64)               NOT NULL,
  snapshot               jsonb                       NOT NULL,
  "actorUserId"          uuid                        NOT NULL,
  "actorRole"            curricular."Role"           NOT NULL,
  origin                 text                        NOT NULL,
  "changeSummary"        jsonb                       NOT NULL,
  "createdAt"            timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AcademicAnalysisVersion"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_preferredSourceId_fkey" FOREIGN KEY ("preferredSourceId") REFERENCES curricular."AcademicAnalysisSource"(id) ON UPDATE CASCADE ON DELETE
    SET NULL;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE
    ON DELETE RESTRICT;

CREATE INDEX "AcademicAnalysisVersion_actorUserId_idx" ON curricular."AcademicAnalysisVersion" ("actorUserId");

CREATE UNIQUE INDEX "AcademicAnalysisVersion_enrollmentId_version_key" ON curricular."AcademicAnalysisVersion" ("enrollmentId", VERSION);

CREATE INDEX "AcademicAnalysisVersion_organizationId_idx" ON curricular."AcademicAnalysisVersion" ("organizationId");

CREATE INDEX "AcademicAnalysisVersion_enrollmentId_createdAt_idx" ON curricular."AcademicAnalysisVersion" ("enrollmentId", "createdAt" DESC);

CREATE INDEX "AcademicAnalysisVersion_preferredSourceId_idx" ON curricular."AcademicAnalysisVersion" ("preferredSourceId");

CREATE INDEX "AcademicAnalysisVersion_previousVersionId_idx" ON curricular."AcademicAnalysisVersion" ("previousVersionId");

CREATE INDEX "AcademicAnalysisVersion_reviewId_idx" ON curricular."AcademicAnalysisVersion" ("reviewId");

CREATE TABLE curricular."AcademicGridCorrection" (
  "organizationId"  uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                uuid                        NOT NULL,
  "reviewId"        uuid                        NOT NULL,
  "userId"          uuid                        NOT NULL,
  "disciplineIndex" integer,
  field             text                        NOT NULL,
  "previousValue"   jsonb,
  "newValue"        jsonb,
  reason            text,
  "createdAt"       timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AcademicGridCorrection"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_pkey" PRIMARY KEY (id);

CREATE INDEX "AcademicGridCorrection_reviewId_createdAt_idx" ON curricular."AcademicGridCorrection" ("reviewId", "createdAt" DESC);

CREATE INDEX "AcademicGridCorrection_userId_createdAt_idx" ON curricular."AcademicGridCorrection" ("userId", "createdAt" DESC);

CREATE INDEX "AcademicGridCorrection_organizationId_idx" ON curricular."AcademicGridCorrection" ("organizationId");

CREATE TABLE curricular."AcademicGridReview" (
  "organizationId"         uuid                                  DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                       uuid                                  NOT NULL,
  "createdById"            uuid                                  NOT NULL,
  "studentName"            text,
  rgm                      text,
  "courseName"             text,
  "currentPeriod"          integer,
  "currentPeriodRaw"       text,
  "currentPeriodConfirmed" boolean                               DEFAULT false NOT NULL,
  "sourceFilename"         text                                  NOT NULL,
  "sourceSha256"           character(64)                         NOT NULL,
  "sourcePageCount"        integer                               NOT NULL,
  status                   curricular."AcademicGridReviewStatus" DEFAULT 'MANUAL_REVIEW_REQUIRED'::curricular."AcademicGridReviewStatus" NOT NULL,
  snapshot                 jsonb                                 NOT NULL,
  "createdAt"              timestamp(6) with time zone           DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"              timestamp(6) with time zone           NOT NULL,
  "completedAt"            timestamp(6) with time zone,
  "enrollmentId"           uuid
);

ALTER TABLE curricular."AcademicGridReview"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES curricular."AcademicGridReview"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES curricular."AcademicGridReview"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "AcademicGridReview_enrollmentId_idx" ON curricular."AcademicGridReview" ("enrollmentId");

CREATE INDEX "AcademicGridReview_createdById_createdAt_idx" ON curricular."AcademicGridReview" ("createdById", "createdAt" DESC);

CREATE INDEX "AcademicGridReview_rgm_createdAt_idx" ON curricular."AcademicGridReview" (rgm, "createdAt" DESC);

CREATE INDEX "AcademicGridReview_organizationId_idx" ON curricular."AcademicGridReview" ("organizationId");

CREATE INDEX "AcademicGridReview_studentName_createdAt_idx" ON curricular."AcademicGridReview" ("studentName", "createdAt" DESC);

CREATE TABLE curricular."AcademicRequest" (
  "organizationId"    uuid                               DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                  uuid                               NOT NULL,
  protocol            integer                            DEFAULT nextval('curricular."AcademicRequest_protocol_seq"'::regclass) NOT NULL,
  "sourceDocumentId"  uuid                               NOT NULL,
  attempt             integer                            DEFAULT 1 NOT NULL,
  "previousRequestId" uuid,
  status              curricular."AcademicRequestStatus" DEFAULT 'RECEIVED'::curricular."AcademicRequestStatus" NOT NULL,
  "actorUserId"       uuid                               NOT NULL,
  "actorRole"         curricular."Role"                  NOT NULL,
  result              text,
  "aiUsed"            boolean                            DEFAULT false NOT NULL,
  "createdVersion"    boolean                            DEFAULT false NOT NULL,
  "createdAt"         timestamp(6) with time zone        DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"         timestamp(6) with time zone        NOT NULL
);

ALTER SEQUENCE curricular."AcademicRequest_protocol_seq" OWNED BY curricular."AcademicRequest".protocol;

ALTER TABLE curricular."AcademicRequest"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_previousRequestId_fkey" FOREIGN KEY ("previousRequestId") REFERENCES curricular."AcademicRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES curricular."AcademicAnalysisSource"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "AcademicRequest_actorUserId_idx" ON curricular."AcademicRequest" ("actorUserId");

CREATE UNIQUE INDEX "AcademicRequest_sourceDocumentId_attempt_key" ON curricular."AcademicRequest" ("sourceDocumentId", attempt);

CREATE UNIQUE INDEX "AcademicRequest_protocol_key" ON curricular."AcademicRequest" (protocol);

CREATE INDEX "AcademicRequest_status_createdAt_idx" ON curricular."AcademicRequest" (status, "createdAt" DESC);

CREATE INDEX "AcademicRequest_organizationId_idx" ON curricular."AcademicRequest" ("organizationId");

CREATE INDEX "AcademicRequest_previousRequestId_idx" ON curricular."AcademicRequest" ("previousRequestId");

CREATE TABLE curricular."AIExtraction" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "analysisId"     uuid                        NOT NULL,
  model            text                        NOT NULL,
  "promptVersion"  text                        NOT NULL,
  "privacyMode"    curricular."AIPrivacyMode"  NOT NULL,
  "rawOutput"      jsonb,
  "durationMs"     integer                     NOT NULL,
  status           text                        NOT NULL,
  "errorCode"      text,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AIExtraction"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AIExtraction"
  ADD CONSTRAINT "AIExtraction_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AIExtraction"
  ADD CONSTRAINT "AIExtraction_pkey" PRIMARY KEY (id);

CREATE INDEX "AIExtraction_analysisId_idx" ON curricular."AIExtraction" ("analysisId");

CREATE INDEX "AIExtraction_organizationId_idx" ON curricular."AIExtraction" ("organizationId");

CREATE TABLE curricular."AIReview" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "analysisId"     uuid                        NOT NULL,
  model            text                        NOT NULL,
  "promptVersion"  text                        NOT NULL,
  status           curricular."AIReviewStatus" NOT NULL,
  issues           jsonb                       NOT NULL,
  "durationMs"     integer                     NOT NULL,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AIReview"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AIReview"
  ADD CONSTRAINT "AIReview_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AIReview"
  ADD CONSTRAINT "AIReview_pkey" PRIMARY KEY (id);

CREATE INDEX "AIReview_analysisId_idx" ON curricular."AIReview" ("analysisId");

CREATE INDEX "AIReview_organizationId_idx" ON curricular."AIReview" ("organizationId");

CREATE TABLE curricular."AIUsage" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "analysisId"     uuid,
  operation        curricular."AIOperation"    NOT NULL,
  model            text                        NOT NULL,
  "inputTokens"    integer                     NOT NULL,
  "outputTokens"   integer                     NOT NULL,
  "totalTokens"    integer                     NOT NULL,
  "estimatedCost"  numeric(12,6)               NOT NULL,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AIUsage"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AIUsage"
  ADD CONSTRAINT "AIUsage_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AIUsage"
  ADD CONSTRAINT "AIUsage_pkey" PRIMARY KEY (id);

CREATE INDEX "AIUsage_createdAt_idx" ON curricular."AIUsage" ("createdAt");

CREATE INDEX "AIUsage_analysisId_idx" ON curricular."AIUsage" ("analysisId");

CREATE INDEX "AIUsage_organizationId_idx" ON curricular."AIUsage" ("organizationId");

CREATE TABLE curricular."AnalysisDeletionRequest" (
  "organizationId" uuid                               DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                               NOT NULL,
  "analysisId"     uuid                               NOT NULL,
  "requestedById"  uuid                               NOT NULL,
  status           curricular."DeletionRequestStatus" DEFAULT 'PENDING'::curricular."DeletionRequestStatus" NOT NULL,
  reason           text,
  "reviewedById"   uuid,
  "reviewedAt"     timestamp(6) with time zone,
  "decisionNote"   text,
  "createdAt"      timestamp(6) with time zone        DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"      timestamp(6) with time zone        NOT NULL
);

ALTER TABLE curricular."AnalysisDeletionRequest"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AnalysisDeletionRequest"
  ADD CONSTRAINT "AnalysisDeletionRequest_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AnalysisDeletionRequest"
  ADD CONSTRAINT "AnalysisDeletionRequest_pkey" PRIMARY KEY (id);

CREATE INDEX "AnalysisDeletionRequest_analysisId_requestedById_status_idx" ON curricular."AnalysisDeletionRequest" ("analysisId", "requestedById", status);

CREATE INDEX "AnalysisDeletionRequest_status_createdAt_idx" ON curricular."AnalysisDeletionRequest" (status, "createdAt" DESC);

CREATE INDEX "AnalysisDeletionRequest_organizationId_idx" ON curricular."AnalysisDeletionRequest" ("organizationId");

CREATE TABLE curricular."AnalysisWarning" (
  "organizationId" uuid                         DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                         NOT NULL,
  "analysisId"     uuid                         NOT NULL,
  code             text                         NOT NULL,
  severity         curricular."WarningSeverity" NOT NULL,
  source           curricular."WarningSource"   NOT NULL,
  message          text                         NOT NULL,
  "subjectId"      uuid,
  "sourcePage"     integer,
  data             jsonb,
  "resolvedAt"     timestamp(6) with time zone,
  "resolvedById"   uuid,
  "createdAt"      timestamp(6) with time zone  DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AnalysisWarning"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AnalysisWarning"
  ADD CONSTRAINT "AnalysisWarning_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AnalysisWarning"
  ADD CONSTRAINT "AnalysisWarning_pkey" PRIMARY KEY (id);

CREATE INDEX "AnalysisWarning_organizationId_idx" ON curricular."AnalysisWarning" ("organizationId");

CREATE INDEX "AnalysisWarning_analysisId_resolvedAt_idx" ON curricular."AnalysisWarning" ("analysisId", "resolvedAt");

CREATE TABLE curricular."AnalyzedSubject" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "analysisId"     uuid                        NOT NULL,
  "rowHash"        text                        NOT NULL,
  code             text,
  name             text                        NOT NULL,
  workload         integer                     NOT NULL,
  period           integer                     NOT NULL,
  "usedSubject"    text,
  status           curricular."SubjectStatus"  NOT NULL,
  readability      curricular."Readability"    DEFAULT 'CLEAR'::curricular."Readability" NOT NULL,
  "sourcePage"     integer                     NOT NULL,
  "sourceRow"      integer                     NOT NULL,
  bbox             jsonb,
  origin           curricular."SubjectOrigin"  DEFAULT 'AI'::curricular."SubjectOrigin" NOT NULL,
  note             text,
  "sortIndex"      integer                     NOT NULL,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"      timestamp(6) with time zone NOT NULL
);

ALTER TABLE curricular."AnalyzedSubject"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AnalyzedSubject"
  ADD CONSTRAINT "AnalyzedSubject_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AnalyzedSubject"
  ADD CONSTRAINT "AnalyzedSubject_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AnalysisWarning"
  ADD CONSTRAINT "AnalysisWarning_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES curricular."AnalyzedSubject"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "AnalyzedSubject_analysisId_period_sortIndex_idx" ON curricular."AnalyzedSubject" ("analysisId", period, "sortIndex");

CREATE INDEX "AnalyzedSubject_organizationId_idx" ON curricular."AnalyzedSubject" ("organizationId");

CREATE UNIQUE INDEX "AnalyzedSubject_analysisId_rowHash_key" ON curricular."AnalyzedSubject" ("analysisId", "rowHash");

CREATE TABLE curricular."AuditLog" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "userId"         uuid,
  action           text                        NOT NULL,
  "entityType"     text                        NOT NULL,
  "entityId"       text,
  metadata         jsonb,
  ip               text,
  "userAgent"      text,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."AuditLog"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."AuditLog"
  ADD CONSTRAINT "AuditLog_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."AuditLog"
  ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

CREATE INDEX "AuditLog_createdAt_idx" ON curricular."AuditLog" ("createdAt" DESC);

CREATE INDEX "AuditLog_organizationId_idx" ON curricular."AuditLog" ("organizationId");

CREATE INDEX "AuditLog_entityType_entityId_idx" ON curricular."AuditLog" ("entityType", "entityId");

CREATE INDEX "AuditLog_userId_idx" ON curricular."AuditLog" ("userId");

CREATE TABLE curricular."CommercialGrade" (
  "organizationId"       uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                     uuid                        NOT NULL,
  "courseName"           text                        NOT NULL,
  modality               text,
  "curriculumTerm"       text,
  degree                 text,
  "knowledgeArea"        text,
  "durationSemesters"    integer,
  "courseTracks"         jsonb,
  "contentHash"          character(64),
  "catalogKey"           character(64),
  "internshipInfo"       text,
  "hasTcc"               boolean                     DEFAULT false NOT NULL,
  "totalInternshipHours" integer,
  "totalCourseHours"     integer,
  "whatsappSummary"      text,
  "originalName"         text                        NOT NULL,
  "storageKey"           text                        NOT NULL,
  "sizeBytes"            integer                     NOT NULL,
  "uploadedById"         uuid                        NOT NULL,
  "createdAt"            timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"            timestamp(6) with time zone NOT NULL
);

ALTER TABLE curricular."CommercialGrade"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."CommercialGrade"
  ADD CONSTRAINT "CommercialGrade_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."CommercialGrade"
  ADD CONSTRAINT "CommercialGrade_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX "CommercialGrade_organizationId_contentHash_key" ON curricular."CommercialGrade" ("organizationId", "contentHash");

CREATE UNIQUE INDEX "CommercialGrade_organizationId_catalogKey_key" ON curricular."CommercialGrade" ("organizationId", "catalogKey");

CREATE INDEX "CommercialGrade_createdAt_idx" ON curricular."CommercialGrade" ("createdAt" DESC);

CREATE INDEX "CommercialGrade_durationSemesters_idx" ON curricular."CommercialGrade" ("durationSemesters");

CREATE INDEX "CommercialGrade_knowledgeArea_idx" ON curricular."CommercialGrade" ("knowledgeArea");

CREATE INDEX "CommercialGrade_degree_idx" ON curricular."CommercialGrade" (degree);

CREATE INDEX "CommercialGrade_courseName_idx" ON curricular."CommercialGrade" ("courseName");

CREATE INDEX "CommercialGrade_uploadedById_idx" ON curricular."CommercialGrade" ("uploadedById");

CREATE UNIQUE INDEX "CommercialGrade_storageKey_key" ON curricular."CommercialGrade" ("storageKey");

CREATE TABLE curricular."CurricularAnalysis" (
  "organizationId"            uuid                           DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                          uuid                           NOT NULL,
  status                      curricular."AnalysisStatus"    DEFAULT 'UPLOADED'::curricular."AnalysisStatus" NOT NULL,
  "createdById"               uuid                           NOT NULL,
  "courseName"                text,
  "matrixLabel"               text,
  campus                      text,
  modality                    text,
  "candidateLabel"            text,
  "studentName"               text,
  "poloCode"                  text,
  "poloName"                  text,
  "courseFormat"              curricular."CourseFormat",
  "reanalysisOfId"            uuid,
  "enrollmentStatus"          curricular."EnrollmentStatus"  DEFAULT 'PENDING'::curricular."EnrollmentStatus" NOT NULL,
  "enrollmentUpdatedAt"       timestamp(6) with time zone,
  "enrollmentUpdatedById"     uuid,
  "enrollmentNote"            text,
  "enrollmentReanalysisAt"    timestamp(6) with time zone,
  "followUpDueAt"             timestamp(6) with time zone,
  "followUpNotifiedAt"        timestamp(6) with time zone,
  "followUpNotificationCount" integer                        DEFAULT 0 NOT NULL,
  "entryPeriod"               integer,
  "entryPeriodSource"         curricular."EntryPeriodSource",
  "entryTerm"                 text,
  "startTerm"                 text                           NOT NULL,
  reliability                 curricular."ReliabilityLevel",
  "reviewItemsCount"          integer                        DEFAULT 0 NOT NULL,
  "processingSteps"           jsonb                          DEFAULT '[]'::jsonb NOT NULL,
  "errorCode"                 text,
  "errorMessage"              text,
  "ruleSetVersionId"          uuid                           NOT NULL,
  "engineVersion"             text                           NOT NULL,
  "extractorPromptVersion"    text,
  "auditorPromptVersion"      text,
  "extractionModel"           text,
  "auditModel"                text,
  "projectionIncomplete"      boolean                        DEFAULT false NOT NULL,
  "completedAt"               timestamp(6) with time zone,
  "lastCalculatedAt"          timestamp(6) with time zone,
  "createdAt"                 timestamp(6) with time zone    DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"                 timestamp(6) with time zone    NOT NULL
);

ALTER TABLE curricular."CurricularAnalysis"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AIExtraction"
  ADD CONSTRAINT "AIExtraction_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."AIReview"
  ADD CONSTRAINT "AIReview_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."AIUsage"
  ADD CONSTRAINT "AIUsage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."AnalysisDeletionRequest"
  ADD CONSTRAINT "AnalysisDeletionRequest_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."AnalysisWarning"
  ADD CONSTRAINT "AnalysisWarning_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."AnalyzedSubject"
  ADD CONSTRAINT "AnalyzedSubject_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_reanalysisOfId_fkey" FOREIGN KEY ("reanalysisOfId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "CurricularAnalysis_reanalysisOfId_idx" ON curricular."CurricularAnalysis" ("reanalysisOfId");

CREATE INDEX "CurricularAnalysis_status_createdAt_idx" ON curricular."CurricularAnalysis" (status, "createdAt" DESC);

CREATE INDEX "CurricularAnalysis_createdById_idx" ON curricular."CurricularAnalysis" ("createdById");

CREATE INDEX "CurricularAnalysis_poloCode_idx" ON curricular."CurricularAnalysis" ("poloCode");

CREATE INDEX "CurricularAnalysis_enrollmentStatus_followUpDueAt_idx" ON curricular."CurricularAnalysis" ("enrollmentStatus", "followUpDueAt");

CREATE INDEX "CurricularAnalysis_organizationId_idx" ON curricular."CurricularAnalysis" ("organizationId");

CREATE TABLE curricular."DocumentClaim" (
  "organizationId"  uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                uuid                        NOT NULL,
  "analysisId"      uuid                        NOT NULL,
  type              text                        NOT NULL,
  value             double precision,
  "sourcePage"      integer                     NOT NULL,
  "rawText"         text,
  "calculatedValue" double precision,
  matches           boolean,
  "createdAt"       timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."DocumentClaim"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."DocumentClaim"
  ADD CONSTRAINT "DocumentClaim_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."DocumentClaim"
  ADD CONSTRAINT "DocumentClaim_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."DocumentClaim"
  ADD CONSTRAINT "DocumentClaim_pkey" PRIMARY KEY (id);

CREATE INDEX "DocumentClaim_analysisId_idx" ON curricular."DocumentClaim" ("analysisId");

CREATE INDEX "DocumentClaim_organizationId_idx" ON curricular."DocumentClaim" ("organizationId");

CREATE TABLE curricular."ManualCorrection" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "analysisId"     uuid                        NOT NULL,
  "subjectId"      uuid,
  "userId"         uuid                        NOT NULL,
  field            text                        NOT NULL,
  "previousValue"  text,
  "newValue"       text,
  reason           text,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."ManualCorrection"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."ManualCorrection"
  ADD CONSTRAINT "ManualCorrection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."ManualCorrection"
  ADD CONSTRAINT "ManualCorrection_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."ManualCorrection"
  ADD CONSTRAINT "ManualCorrection_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."ManualCorrection"
  ADD CONSTRAINT "ManualCorrection_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES curricular."AnalyzedSubject"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "ManualCorrection_analysisId_createdAt_idx" ON curricular."ManualCorrection" ("analysisId", "createdAt" DESC);

CREATE INDEX "ManualCorrection_organizationId_idx" ON curricular."ManualCorrection" ("organizationId");

CREATE TABLE curricular."OpenAIIntegration" (
  "organizationId"         uuid                           DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                       uuid                           NOT NULL,
  status                   curricular."IntegrationStatus" DEFAULT 'DISCONNECTED'::curricular."IntegrationStatus" NOT NULL,
  "encryptedApiKey"        text,
  "encryptionIv"           text,
  "encryptionAuthTag"      text,
  "keyVersion"             integer,
  "apiKeyLastFour"         text,
  "extractionModel"        text                           DEFAULT 'gpt-5.6-sol'::text NOT NULL,
  "auditModel"             text                           DEFAULT 'gpt-5.6-sol'::text NOT NULL,
  "futureExplanationModel" text,
  "projectLabel"           text,
  "serviceAccountLabel"    text,
  "lastTestedAt"           timestamp(6) with time zone,
  "lastConnectionStatus"   text,
  "lastErrorCode"          text,
  "createdById"            uuid,
  "updatedById"            uuid,
  "createdAt"              timestamp(6) with time zone    DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"              timestamp(6) with time zone    NOT NULL
);

ALTER TABLE curricular."OpenAIIntegration"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."OpenAIIntegration"
  ADD CONSTRAINT "OpenAIIntegration_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."OpenAIIntegration"
  ADD CONSTRAINT "OpenAIIntegration_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX "OpenAIIntegration_organizationId_key" ON curricular."OpenAIIntegration" ("organizationId");

CREATE TABLE curricular."ProjectionSubject" (
  "organizationId" uuid                               DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                               NOT NULL,
  "projectionId"   uuid                               NOT NULL,
  "subjectId"      uuid                               NOT NULL,
  kind             curricular."ProjectionSubjectKind" NOT NULL,
  "order"          integer                            NOT NULL
);

ALTER TABLE curricular."ProjectionSubject"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."ProjectionSubject"
  ADD CONSTRAINT "ProjectionSubject_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."ProjectionSubject"
  ADD CONSTRAINT "ProjectionSubject_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."ProjectionSubject"
  ADD CONSTRAINT "ProjectionSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES curricular."AnalyzedSubject"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE UNIQUE INDEX "ProjectionSubject_projectionId_subjectId_key" ON curricular."ProjectionSubject" ("projectionId", "subjectId");

CREATE INDEX "ProjectionSubject_organizationId_idx" ON curricular."ProjectionSubject" ("organizationId");

CREATE TABLE curricular."PushSubscription" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  "userId"         uuid                        NOT NULL,
  endpoint         text                        NOT NULL,
  p256dh           text                        NOT NULL,
  auth             text                        NOT NULL,
  "userAgent"      text,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "lastUsedAt"     timestamp(6) with time zone
);

ALTER TABLE curricular."PushSubscription"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."PushSubscription"
  ADD CONSTRAINT "PushSubscription_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."PushSubscription"
  ADD CONSTRAINT "PushSubscription_pkey" PRIMARY KEY (id);

CREATE INDEX "PushSubscription_organizationId_idx" ON curricular."PushSubscription" ("organizationId");

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON curricular."PushSubscription" (endpoint);

CREATE INDEX "PushSubscription_userId_idx" ON curricular."PushSubscription" ("userId");

CREATE TABLE curricular."RuleSetVersion" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                        NOT NULL,
  version          text                        NOT NULL,
  "isActive"       boolean                     DEFAULT false NOT NULL,
  "effectiveFrom"  timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  notes            text,
  "createdById"    uuid,
  "createdAt"      timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."RuleSetVersion"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."RuleSetVersion"
  ADD CONSTRAINT "RuleSetVersion_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."RuleSetVersion"
  ADD CONSTRAINT "RuleSetVersion_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES curricular."RuleSetVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "RuleSetVersion_organizationId_version_key" ON curricular."RuleSetVersion" ("organizationId", VERSION);

CREATE TABLE curricular."SemesterProjection" (
  "organizationId"        uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                      uuid                        NOT NULL,
  "analysisId"            uuid                        NOT NULL,
  index                   integer                     NOT NULL,
  term                    text                        NOT NULL,
  "periodNumber"          integer,
  "isAdditional"          boolean                     DEFAULT false NOT NULL,
  "subjectsInPeriod"      integer                     NOT NULL,
  "exemptedInPeriod"      integer                     NOT NULL,
  "regularSubjectsToTake" integer                     NOT NULL,
  "maximumCapacity"       integer                     NOT NULL,
  "backlogCapacity"       integer                     NOT NULL,
  "subjectsFromBacklog"   integer                     NOT NULL,
  "semesterLoad"          integer                     NOT NULL,
  "remainingBacklog"      integer                     NOT NULL,
  "createdAt"             timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."SemesterProjection"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."SemesterProjection"
  ADD CONSTRAINT "SemesterProjection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."SemesterProjection"
  ADD CONSTRAINT "SemesterProjection_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."SemesterProjection"
  ADD CONSTRAINT "SemesterProjection_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."ProjectionSubject"
  ADD CONSTRAINT "ProjectionSubject_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES curricular."SemesterProjection"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "SemesterProjection_organizationId_idx" ON curricular."SemesterProjection" ("organizationId");

CREATE UNIQUE INDEX "SemesterProjection_analysisId_index_key" ON curricular."SemesterProjection" ("analysisId", INDEX);

CREATE TABLE curricular."StudentDeletionRequest" (
  "organizationId" uuid                               DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id               uuid                               NOT NULL,
  "enrollmentId"   uuid,
  "studentName"    text                               NOT NULL,
  rgm              text                               NOT NULL,
  "requestedById"  uuid                               NOT NULL,
  reason           text,
  status           curricular."DeletionRequestStatus" DEFAULT 'PENDING'::curricular."DeletionRequestStatus" NOT NULL,
  "reviewedById"   uuid,
  "reviewedAt"     timestamp(6) with time zone,
  "decisionNote"   text,
  "createdAt"      timestamp(6) with time zone        DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"      timestamp(6) with time zone        NOT NULL
);

ALTER TABLE curricular."StudentDeletionRequest"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."StudentDeletionRequest"
  ADD CONSTRAINT "StudentDeletionRequest_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."StudentDeletionRequest"
  ADD CONSTRAINT "StudentDeletionRequest_pkey" PRIMARY KEY (id);

CREATE INDEX "StudentDeletionRequest_organizationId_idx" ON curricular."StudentDeletionRequest" ("organizationId");

CREATE INDEX "StudentDeletionRequest_status_createdAt_idx" ON curricular."StudentDeletionRequest" (status, "createdAt" DESC);

CREATE INDEX "StudentDeletionRequest_enrollmentId_status_idx" ON curricular."StudentDeletionRequest" ("enrollmentId", status);

CREATE TABLE curricular."StudentEnrollment" (
  "organizationId"   uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                 uuid                        NOT NULL,
  rgm                text                        NOT NULL,
  name               text                        NOT NULL,
  "courseName"       text,
  "studentUserId"    uuid,
  "ownerId"          uuid                        NOT NULL,
  "poloCode"         text,
  "currentVersionId" uuid,
  "welcomedAt"       timestamp(6) with time zone,
  "createdAt"        timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"        timestamp(6) with time zone NOT NULL
);

ALTER TABLE curricular."StudentEnrollment"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."StudentDeletionRequest"
  ADD CONSTRAINT "StudentDeletionRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE UNIQUE INDEX "StudentEnrollment_organizationId_rgm_key" ON curricular."StudentEnrollment" ("organizationId", rgm);

CREATE UNIQUE INDEX "StudentEnrollment_currentVersionId_key" ON curricular."StudentEnrollment" ("currentVersionId");

CREATE INDEX "StudentEnrollment_studentUserId_idx" ON curricular."StudentEnrollment" ("studentUserId");

CREATE INDEX "StudentEnrollment_ownerId_createdAt_idx" ON curricular."StudentEnrollment" ("ownerId", "createdAt" DESC);

CREATE TABLE curricular."SystemRule" (
  "organizationId"   uuid                    DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                 uuid                    NOT NULL,
  "ruleSetVersionId" uuid                    NOT NULL,
  key                text                    NOT NULL,
  "valueType"        text                    NOT NULL,
  value              jsonb                   NOT NULL,
  status             curricular."RuleStatus" NOT NULL,
  description        text                    NOT NULL
);

ALTER TABLE curricular."SystemRule"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."SystemRule"
  ADD CONSTRAINT "SystemRule_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."SystemRule"
  ADD CONSTRAINT "SystemRule_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."SystemRule"
  ADD CONSTRAINT "SystemRule_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES curricular."RuleSetVersion"(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX "SystemRule_organizationId_idx" ON curricular."SystemRule" ("organizationId");

CREATE UNIQUE INDEX "SystemRule_ruleSetVersionId_key_key" ON curricular."SystemRule" ("ruleSetVersionId", key);

CREATE TABLE curricular."SystemSetting" (
  "organizationId" uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  key              text                        NOT NULL,
  value            jsonb                       NOT NULL,
  "updatedAt"      timestamp(6) with time zone NOT NULL
);

ALTER TABLE curricular."SystemSetting"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."SystemSetting"
  ADD CONSTRAINT "SystemSetting_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."SystemSetting"
  ADD CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("organizationId", key);

CREATE TABLE curricular."UploadedDocument" (
  "organizationId"  uuid                        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                uuid                        NOT NULL,
  "analysisId"      uuid                        NOT NULL,
  "originalName"    text                        NOT NULL,
  "storageKey"      text                        NOT NULL,
  "sizeBytes"       integer                     NOT NULL,
  sha256            text                        NOT NULL,
  "pageCount"       integer,
  "mimeType"        text                        NOT NULL,
  "localExtraction" jsonb,
  "deleteAfter"     timestamp(6) with time zone,
  "deletedAt"       timestamp(6) with time zone,
  "createdAt"       timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE curricular."UploadedDocument"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."UploadedDocument"
  ADD CONSTRAINT "UploadedDocument_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES curricular."CurricularAnalysis"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."UploadedDocument"
  ADD CONSTRAINT "UploadedDocument_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."UploadedDocument"
  ADD CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX "UploadedDocument_analysisId_key" ON curricular."UploadedDocument" ("analysisId");

CREATE INDEX "UploadedDocument_organizationId_idx" ON curricular."UploadedDocument" ("organizationId");

CREATE INDEX "UploadedDocument_deleteAfter_idx" ON curricular."UploadedDocument" ("deleteAfter");

CREATE TABLE curricular."User" (
  "organizationId"                 uuid                         DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  id                               uuid                         NOT NULL,
  "authUserId"                     uuid                         NOT NULL,
  email                            text                         NOT NULL,
  name                             text                         NOT NULL,
  role                             curricular."Role"            DEFAULT 'ANALYST'::curricular."Role" NOT NULL,
  "isActive"                       boolean                      DEFAULT true NOT NULL,
  "poloCode"                       text,
  phone                            text,
  "followUpEmailEnabled"           boolean                      DEFAULT true NOT NULL,
  "followUpPushEnabled"            boolean                      DEFAULT true NOT NULL,
  "followUpRepeatBusinessDays"     integer                      DEFAULT 1 NOT NULL,
  "followUpMaxReminders"           integer                      DEFAULT 5 NOT NULL,
  "followUpBusinessStartHour"      integer,
  "followUpBusinessEndHour"        integer,
  "followUpCadence"                curricular."FollowUpCadence",
  "followUpPreferencesConfirmedAt" timestamp(6) with time zone,
  "lastLoginAt"                    timestamp(6) with time zone,
  "lastActiveAt"                   timestamp(6) with time zone,
  "createdAt"                      timestamp(6) with time zone  DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"                      timestamp(6) with time zone  NOT NULL
);

ALTER TABLE curricular."User"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE curricular."User"
  ADD CONSTRAINT "User_authUser_fkey" FOREIGN KEY ("authUserId") REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE curricular."User"
  ADD CONSTRAINT "User_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE curricular."User"
  ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."AnalysisDeletionRequest"
  ADD CONSTRAINT "AnalysisDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."AnalysisDeletionRequest"
  ADD CONSTRAINT "AnalysisDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."AnalysisWarning"
  ADD CONSTRAINT "AnalysisWarning_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."CommercialGrade"
  ADD CONSTRAINT "CommercialGrade_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."CurricularAnalysis"
  ADD CONSTRAINT "CurricularAnalysis_enrollmentUpdatedById_fkey" FOREIGN KEY ("enrollmentUpdatedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."ManualCorrection"
  ADD CONSTRAINT "ManualCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."OpenAIIntegration"
  ADD CONSTRAINT "OpenAIIntegration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."OpenAIIntegration"
  ADD CONSTRAINT "OpenAIIntegration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."RuleSetVersion"
  ADD CONSTRAINT "RuleSetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."StudentDeletionRequest"
  ADD CONSTRAINT "StudentDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE curricular."StudentDeletionRequest"
  ADD CONSTRAINT "StudentDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "User_organizationId_email_key" ON curricular."User" ("organizationId", email);

CREATE UNIQUE INDEX "User_organizationId_authUserId_key" ON curricular."User" ("organizationId", "authUserId");

CREATE INDEX "User_authUserId_idx" ON curricular."User" ("authUserId");

CREATE FUNCTION private.curricular_tenant_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  sentinel constant uuid := '00000000-0000-0000-0000-000000000000';
  new_data jsonb := to_jsonb(new);
  old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  i integer := 0;
  ref text;
  parent_org uuid;
  inherited uuid;
begin
  if tg_op = 'UPDATE' and new."organizationId" <> old."organizationId" then
    raise exception 'Organization of % cannot change', tg_table_name using errcode = '42501';
  end if;
  while i < tg_nargs loop
    ref := new_data ->> tg_argv[i + 1];
    if ref is not null and (old_data is null or ref is distinct from old_data ->> tg_argv[i + 1]) then
      execute format('select "organizationId" from curricular.%I where id = $1::uuid', tg_argv[i]) into parent_org using ref;
      if parent_org is not null then
        if inherited is null then
          inherited := parent_org;
        elsif inherited <> parent_org then
          raise exception 'Cross-organization reference in %', tg_table_name using errcode = '42501';
        end if;
      end if;
    end if;
    i := i + 2;
  end loop;
  if new."organizationId" = sentinel then
    if inherited is null then
      raise exception 'Organization required for %', tg_table_name using errcode = '23502';
    end if;
    new."organizationId" := inherited;
  elsif inherited is not null and inherited <> new."organizationId" then
    raise exception 'Cross-organization reference in %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AcademicAnalysisSource"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('StudentEnrollment', 'enrollmentId', 'User', 'actorUserId', 'AcademicAnalysisVersion', 'versionId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AcademicAnalysisVersion"
  FOR EACH ROW
  EXECUTE FUNCTION
    private.curricular_tenant_guard('AcademicAnalysisSource', 'preferredSourceId', 'StudentEnrollment', 'enrollmentId', 'AcademicGridReview', 'reviewId', 'User', 'actorUserId',
    'AcademicAnalysisVersion', 'previousVersionId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AcademicGridCorrection"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('AcademicGridReview', 'reviewId', 'User', 'userId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AcademicGridReview"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'createdById', 'StudentEnrollment', 'enrollmentId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AcademicRequest"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('AcademicAnalysisSource', 'sourceDocumentId', 'User', 'actorUserId', 'AcademicRequest', 'previousRequestId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AIExtraction"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AIReview"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AIUsage"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AnalysisDeletionRequest"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId', 'User', 'requestedById', 'User', 'reviewedById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AnalysisWarning"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId', 'AnalyzedSubject', 'subjectId', 'User', 'resolvedById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AnalyzedSubject"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'userId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."CommercialGrade"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'uploadedById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."CurricularAnalysis"
  FOR EACH ROW
  EXECUTE FUNCTION
    private.curricular_tenant_guard('User', 'createdById', 'User', 'enrollmentUpdatedById', 'CurricularAnalysis', 'reanalysisOfId', 'RuleSetVersion', 'ruleSetVersionId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."DocumentClaim"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."ManualCorrection"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId', 'AnalyzedSubject', 'subjectId', 'User', 'userId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."OpenAIIntegration"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'createdById', 'User', 'updatedById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."ProjectionSubject"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('SemesterProjection', 'projectionId', 'AnalyzedSubject', 'subjectId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."PushSubscription"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'userId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."RuleSetVersion"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'createdById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."SemesterProjection"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."StudentDeletionRequest"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('StudentEnrollment', 'enrollmentId', 'User', 'requestedById', 'User', 'reviewedById');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."StudentEnrollment"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('User', 'studentUserId', 'User', 'ownerId', 'AcademicAnalysisVersion', 'currentVersionId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."SystemRule"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('RuleSetVersion', 'ruleSetVersionId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."SystemSetting"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard();

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."UploadedDocument"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard('CurricularAnalysis', 'analysisId');

CREATE TRIGGER tenant_guard
  BEFORE INSERT OR UPDATE ON curricular."User"
  FOR EACH ROW
  EXECUTE FUNCTION private.curricular_tenant_guard();

REVOKE ALL ON FUNCTION private.curricular_tenant_guard() FROM PUBLIC;