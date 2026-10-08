-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE curricular."AcademicAnalysisSource"
  DROP CONSTRAINT "AcademicAnalysisSource_actorUserId_fkey";

ALTER TABLE curricular."AcademicAnalysisSource"
  DROP CONSTRAINT "AcademicAnalysisSource_enrollmentId_fkey";

ALTER TABLE curricular."AcademicAnalysisSource"
  DROP CONSTRAINT "AcademicAnalysisSource_versionId_fkey";

ALTER TABLE curricular."AcademicAnalysisVersion"
  DROP CONSTRAINT "AcademicAnalysisVersion_actorUserId_fkey";

ALTER TABLE curricular."AcademicAnalysisVersion"
  DROP CONSTRAINT "AcademicAnalysisVersion_enrollmentId_fkey";

ALTER TABLE curricular."AcademicAnalysisVersion"
  DROP CONSTRAINT "AcademicAnalysisVersion_previousVersionId_fkey";

ALTER TABLE curricular."AcademicAnalysisVersion"
  DROP CONSTRAINT "AcademicAnalysisVersion_reviewId_fkey";

ALTER TABLE curricular."AcademicGridCorrection"
  DROP CONSTRAINT "AcademicGridCorrection_userId_fkey";

ALTER TABLE curricular."AcademicGridReview"
  DROP CONSTRAINT "AcademicGridReview_createdById_fkey";

ALTER TABLE curricular."AcademicGridReview"
  DROP CONSTRAINT "AcademicGridReview_enrollmentId_fkey";

ALTER TABLE curricular."AcademicRequest"
  DROP CONSTRAINT "AcademicRequest_actorUserId_fkey";

ALTER TABLE curricular."CommercialGrade"
  DROP CONSTRAINT "CommercialGrade_uploadedById_fkey";

ALTER TABLE curricular."StudentEnrollment"
  DROP CONSTRAINT "StudentEnrollment_currentVersionId_fkey";

ALTER TABLE curricular."StudentEnrollment"
  DROP CONSTRAINT "StudentEnrollment_ownerId_fkey";

ALTER TABLE curricular."StudentEnrollment"
  DROP CONSTRAINT "StudentEnrollment_studentUserId_fkey";

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisSource"
  ADD CONSTRAINT "AcademicAnalysisSource_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicAnalysisVersion"
  ADD CONSTRAINT "AcademicAnalysisVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES curricular."AcademicGridReview"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES curricular."StudentEnrollment"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."AcademicRequest"
  ADD CONSTRAINT "AcademicRequest_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."CommercialGrade"
  ADD CONSTRAINT "CommercialGrade_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES curricular."AcademicAnalysisVersion"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;

ALTER TABLE curricular."StudentEnrollment"
  ADD CONSTRAINT "StudentEnrollment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES curricular."User"(id) ON UPDATE CASCADE;