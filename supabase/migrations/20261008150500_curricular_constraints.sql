-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_status_check" CHECK (status = ANY (ARRAY['PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text]));

CREATE UNIQUE INDEX "AcademicAnalysisSource_one_processing" ON curricular."AcademicAnalysisSource" ("enrollmentId")
  WHERE status = 'PROCESSING'::text;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_positive_version" CHECK (version > 0);

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_attempt_positive" CHECK (attempt > 0);