import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { SessionUser } from "@/lib/session";
import { academicPdf, academicHistoryPdf, selectablePdf } from "../fixtures/academic-pdf";
import { assertLocalDatabase, createTenant, dropTenants, type TestTenant } from "./tenant-fixture";

const session = vi.hoisted(() => ({
  user: null as SessionUser | null,
}));
// Sessão simulada com as mesmas regras de lib/session: aluno só com allowStudent e perfil ativo.
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  const { can } = await import("@/lib/rbac");
  const current = async (allowStudent: boolean) => {
    const user = session.user;
    if (!user) return null;
    // Importado sob demanda: importar o Prisma na fábrica do mock faria o cliente com escopo enxergar a sessão real.
    const { prismaUnscoped } = await import("@/lib/prisma");
    const row = await prismaUnscoped.user.findUnique({ where: { id: user.id } });
    if (!row?.isActive) return null;
    if (user.role === "STUDENT" && !allowStudent) return null;
    return user;
  };
  return {
    ...actual,
    getSessionUser: async (options: { allowStudent?: boolean } = {}) => current(Boolean(options.allowStudent)),
    requirePermission: async (permission: Parameters<typeof can>[1]) => {
      const user = await current(false);
      if (!user) throw new actual.UnauthorizedError();
      if (!can(user.role, permission)) throw new actual.ForbiddenError();
      return user;
    },
  };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/student-portal/notifications", () => ({
  notifyAcademicUpdate: vi.fn(),
}));
vi.mock("@/services/email/mailer", () => ({
  isEmailConfigured: () => false,
  appUrl: (value: string) => `http://localhost:3010${value}`,
  sendMail: vi.fn(),
}));
let prisma: (typeof import("@/lib/prisma"))["prisma"];
let tenant: TestTenant;
let tutor: SessionUser;
let otherTutor: SessionUser;
let student: SessionUser;
const users: string[] = [];
const enrollments: string[] = [];
const reviewIds: string[] = [];
let enrollmentId: string;
const rgm = `9${Date.now()}`;
const asSession = (user: SessionUser) => {
  session.user = user;
};

beforeAll(async () => {
  if (!assertLocalDatabase()) throw new Error("Portal integration tests require the local Supabase database.");
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_DIR = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "portal-storage-"));
  prisma = (await import("@/lib/prisma")).prisma;
  tenant = await createTenant("TUTOR");
  (globalThis as { __TEST_TENANT__?: string }).__TEST_TENANT__ = tenant.organizationId;
  const { createAdminClient } = await import("@/lib/supabase/server");
  const make = async (role: "TUTOR" | "STUDENT") => {
    const email = `portal-test-${randomUUID()}@example.test`;
    const { data } = await createAdminClient().auth.admin.createUser({ email, password: `P-${randomUUID()}!`, email_confirm: true });
    const user = await prisma.user.create({
      data: { role, email, name: "Aluno Teste Portal", authUserId: data.user!.id },
    });
    users.push(user.id);
    return {
      id: user.id,
      authUserId: user.authUserId,
      name: user.name,
      email: user.email,
      role,
      organizationId: tenant.organizationId,
      organizationName: "Empresa de teste",
      memberRole: role === "STUDENT" ? null : "agent",
      modules: ["analise_curricular", "portal_aluno"],
    } satisfies SessionUser;
  };
  tutor = await make("TUTOR");
  otherTutor = await make("TUTOR");
  student = await make("STUDENT");
  const enrollment = await prisma.studentEnrollment.create({
    data: {
      name: student.name,
      rgm,
      ownerId: tutor.id,
      studentUserId: student.id,
      courseName: "Administracao",
    },
  });
  enrollments.push(enrollment.id);
  enrollmentId = enrollment.id;
}, 20000);
afterAll(async () => {
  if (!tenant) return;
  const { prismaUnscoped } = await import("@/lib/prisma");
  const { createAdminClient } = await import("@/lib/supabase/server");
  const accounts = await prismaUnscoped.user.findMany({ where: { organizationId: tenant.organizationId }, select: { authUserId: true } });
  await dropTenants([tenant]);
  for (const account of accounts) await createAdminClient().auth.admin.deleteUser(account.authUserId).catch(() => undefined);
}, 20000);

describe("Portal Acadêmico — banco real", () => {
  it("nega IDs de outros alunos, escopo de outro tutor e todas as permissões internas", async () => {
    const { requireEnrollment } =
      await import("@/services/student-portal/access");
    const { can } = await import("@/lib/rbac");
    expect((await requireEnrollment(student, enrollmentId)).id).toBe(
      enrollmentId,
    );
    await expect(requireEnrollment(student, randomUUID())).rejects.toThrow();
    await expect(requireEnrollment(otherTutor, enrollmentId)).rejects.toThrow();
    expect(can("STUDENT", "analysis:read")).toBe(false);
    expect(can("STUDENT", "analysis:review")).toBe(false);
    expect(can("STUDENT", "students:manage")).toBe(false);
    asSession(student);
    const { getSessionUser, requirePermission } = await import("@/lib/session");
    expect(await getSessionUser()).toBeNull();
    expect((await getSessionUser({ allowStudent: true }))?.id).toBe(student.id);
    await expect(requirePermission("analysis:delete")).rejects.toThrow();
  });
  it("dois envios concorrentes compartilham o job e publicam uma única versão", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm);
    const claims = await Promise.all([
      claimUpload(tutor, enrollmentId, pdf, "tutor.pdf"),
      claimUpload(student, enrollmentId, pdf, "aluno-renomeado.pdf"),
    ]);
    expect(claims.filter((claim) => claim.run)).toHaveLength(1);
    expect(claims[0].source.id).toBe(claims[1].source.id);
    const claim = claims.find((value) => value.run)!;
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const job = await prisma.academicAnalysisSource.findUniqueOrThrow({
      where: { id: claim.source.id },
    });
    expect(job.errorMessage).toBeNull();
    expect(job.status).toBe("COMPLETED");
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(1);
    expect(
      await prisma.academicGridReview.count({ where: { enrollmentId } }),
    ).toBe(1);
    const duplicate = await claimUpload(
      student,
      enrollmentId,
      pdf,
      "outro-nome.pdf",
    );
    expect(duplicate.run).toBe(false);
    expect(duplicate.duplicate).toBe(true);
  }, 20000);
  it("reutiliza metadata diferente antes da extração estruturada e snapshot igual não cria histórico", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "A CURSAR", "different PDF metadata");
    const claim = await claimUpload(student, enrollmentId, pdf, "novo.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const job = await prisma.academicAnalysisSource.findUniqueOrThrow({
      where: { id: claim.source.id },
    });
    expect(job.reused).toBe(true);
    expect(job.storageKey).toBeNull();
    const variant = academicPdf(rgm, "A CURSAR", "", "ALUNO TESTE PORTAL");
    const next = await claimUpload(
      student,
      enrollmentId,
      variant,
      "formatado.pdf",
    );
    await processUpload(next.source.id, next.source.attempts, variant);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: next.source.id },
        })
      ).reused,
    ).toBe(true);
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(1);
    expect(
      await prisma.academicGridReview.count({ where: { enrollmentId } }),
    ).toBe(1);
  }, 20000);
  it("mudança real cria V2, registra o tutor e mantém V1 imutável", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "CURSANDO");
    const claim = await claimUpload(tutor, enrollmentId, pdf, "atualizado.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const versions = await prisma.academicAnalysisVersion.findMany({
      where: { enrollmentId },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1].actorUserId).toBe(tutor.id);
    expect(versions[1].origin).toBe("TUTOR_UPLOAD");
    expect(versions[1].changeSummary).toContain(
      "Pendências anteriores: 1 → 0.",
    );
    expect(
      (versions[0].snapshot as { result: { previousPending: number } }).result
        .previousPending,
    ).toBe(1);
    expect(
      (
        await prisma.studentEnrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })
      ).currentVersionId,
    ).toBe(versions[1].id);
  }, 20000);
  it("PDF de outro RGM ou curso e PDF corrompido não substituem a versão atual", async () => {
    const { claimUpload, processUpload } =
      await import("@/services/student-portal/processing");
    const before = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    for (const pdf of [
      academicPdf("outra-matricula"),
      academicPdf(rgm, "A CURSAR", "", "Aluno Teste Portal", "Pedagogia"),
      Buffer.from("%PDF-corrompido"),
    ]) {
      const claim = await claimUpload(
        student,
        enrollmentId,
        pdf,
        "extrato.pdf",
      );
      await processUpload(claim.source.id, claim.source.attempts, pdf);
      expect(
        (
          await prisma.academicAnalysisSource.findUniqueOrThrow({
            where: { id: claim.source.id },
          })
        ).status,
      ).toBe("FAILED");
    }
    expect(
      (
        await prisma.studentEnrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })
      ).currentVersionId,
    ).toBe(before.currentVersionId);
  }, 20000);
  it("correção manual usa o motor existente, preserva versão anterior e bloqueia aluno", async () => {
    const current = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { currentVersion: true },
    });
    const { updateAcademicGridFieldAction } =
      await import("@/features/academic-analysis/actions");
    asSession(student);
    expect(
      (
        await updateAcademicGridFieldAction({
          reviewId: current.currentVersion!.reviewId,
          disciplineIndex: 0,
          field: "originalStatus",
          value: "AE",
        })
      ).ok,
    ).toBe(false);
    asSession(tutor);
    expect(
      (
        await updateAcademicGridFieldAction({
          reviewId: current.currentVersion!.reviewId,
          disciplineIndex: 0,
          field: "originalStatus",
          value: "AE",
        })
      ).ok,
    ).toBe(true);
    const next = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { currentVersion: true },
    });
    expect(next.currentVersion?.version).toBe(3);
    expect(next.currentVersion?.origin).toBe("TUTOR_MANUAL_CORRECTION");
    expect(next.currentVersion?.actorUserId).toBe(tutor.id);
    const count = await prisma.academicAnalysisVersion.count({
      where: { enrollmentId },
    });
    await updateAcademicGridFieldAction({
      reviewId: next.currentVersion!.reviewId,
      disciplineIndex: 0,
      field: "originalStatus",
      value: "AE",
    });
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(count);
  });
  it("bloqueio é imediato, encerra as sessões do Supabase e o histórico permanece", async () => {
    const { studentAccessAction } =
      await import("@/features/student-portal/actions");
    const { getSessionUser } = await import("@/lib/session");
    const { createClient } = await import("@supabase/supabase-js");
    const { createAdminClient } = await import("@/lib/supabase/server");
    const { prismaUnscoped } = await import("@/lib/prisma");
    // Uma sessão real do aluno no Supabase Auth.
    const password = `S-${randomUUID()}!`;
    await createAdminClient().auth.admin.updateUserById(student.authUserId, { password });
    const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await browser.auth.signInWithPassword({ email: student.email, password })).error).toBeNull();
    const sessions = () => prismaUnscoped.$queryRaw<{ count: bigint }[]>`select count(*) from auth.sessions where user_id = ${student.authUserId}::uuid`.then((r) => Number(r[0]!.count));
    expect(await sessions()).toBeGreaterThan(0);
    asSession(tutor);
    expect((await studentAccessAction({ enrollmentId, action: "BLOCK", confirmed: true })).ok).toBe(true);
    expect(await sessions()).toBe(0);
    asSession(student);
    expect(await getSessionUser({ allowStudent: true })).toBeNull();
    asSession(tutor);
    expect((await studentAccessAction({ enrollmentId, action: "ACTIVATE", confirmed: true })).ok).toBe(true);
    // A sessão antiga foi revogada: o refresh token não volta a valer com a reativação.
    expect((await browser.auth.refreshSession()).error).not.toBeNull();
    asSession(student);
    expect((await getSessionUser({ allowStudent: true }))?.id).toBe(student.id);
    expect(
      await prisma.academicAnalysisVersion.count({ where: { enrollmentId } }),
    ).toBe(3);
  });
  it("convite sem SMTP gera link de uso único do Supabase e conta de aluno na empresa", async () => {
    const { createStudentAction } =
      await import("@/features/student-portal/actions");
    asSession(tutor);
    const newRgm = `${rgm}1`;
    const email = `portal-test-${randomUUID()}@example.test`;
    const result = await createStudentAction({
      name: "Nova Aluna",
      rgm: newRgm,
      email,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    enrollments.push(result.data.enrollmentId);
    const enrollment = await prisma.studentEnrollment.findUniqueOrThrow({
      where: { id: result.data.enrollmentId },
      include: { studentUser: true },
    });
    users.push(enrollment.studentUserId!);
    expect(enrollment.studentUser?.role).toBe("STUDENT");
    expect(enrollment.studentUser?.organizationId).toBe(tenant.organizationId);
    const link = new URL(result.data.link!);
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("invite");
    expect(link.searchParams.get("org")).toBe(tenant.organizationId);
    // O token vale uma vez: a primeira verificação abre a sessão, a segunda é recusada.
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const tokenHash = link.searchParams.get("token_hash")!;
    expect((await verifier.auth.verifyOtp({ type: "invite", token_hash: tokenHash })).error).toBeNull();
    expect((await verifier.auth.verifyOtp({ type: "invite", token_hash: tokenHash })).error).not.toBeNull();
    const duplicate = await createStudentAction({
      name: "Nova Aluna",
      rgm: newRgm,
      email,
    });
    expect(duplicate.ok && duplicate.data.duplicate).toBe(true);
  });
  it("vincula análises legadas por RGM exato e conserva o histórico sem duplicatas", async () => {
    const { parsePdf } = await import("@/services/pdf/parser");
    const { extractAcademicGrid } =
      await import("@/services/academic-analysis/extract");
    const { sha256 } = await import("@/services/student-portal/fingerprints");
    const { ensureEnrollment } =
      await import("@/services/student-portal/enrollments");
    const oldRgm = `${rgm}2`;
    const pdf = academicPdf(oldRgm);
    const snapshot = extractAcademicGrid(
      await parsePdf(pdf, { maxPages: 5 }),
      "antigo.pdf",
    );
    for (let i = 0; i < 2; i++) {
      const review = await prisma.academicGridReview.create({
        data: {
          createdById: tutor.id,
          studentName: snapshot.studentName,
          rgm: oldRgm,
          courseName: snapshot.courseName,
          currentPeriod: 3,
          sourceFilename: "antigo.pdf",
          sourceSha256: sha256(pdf),
          sourcePageCount: 1,
          status: snapshot.result.status,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
        },
      });
      reviewIds.push(review.id);
    }
    const enrollment = await ensureEnrollment(tutor, {
      rgm: oldRgm,
      name: "Aluno Teste Portal",
      courseName: "Administracao",
    });
    enrollments.push(enrollment.id);
    expect(
      await prisma.academicGridReview.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(2);
    expect(
      await prisma.academicAnalysisVersion.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(1);
    await expect(
      ensureEnrollment(otherTutor, { rgm: oldRgm, name: "Aluno Teste Portal" }),
    ).rejects.toThrow();
  });
  it("protege APIs de status e PDF mesmo com IDs conhecidos e nega execução de upload interno", async () => {
    const statusRoute = await import("@/app/api/portal/status/route");
    const documentRoute = await import("@/app/api/portal/document/[id]/route");
    const internalUpload =
      await import("@/app/api/academic-analysis/upload/route");
    const source = await prisma.academicAnalysisSource.findFirstOrThrow({
      where: { enrollmentId, storageKey: { not: null } },
    });
    asSession(student);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3010/api/portal/status?enrollmentId=${enrollmentId}`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3010/api/portal/status?enrollmentId=${randomUUID()}`,
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await documentRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({ id: source.id }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await internalUpload.POST(
          new Request("http://localhost:3010/api/academic-analysis/upload", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(401);
    asSession(otherTutor);
    expect(
      (
        await documentRoute.GET(new Request("http://localhost"), {
          params: Promise.resolve({ id: source.id }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await statusRoute.GET(
          new Request(
            `http://localhost:3010/api/portal/status?enrollmentId=${enrollmentId}`,
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("retoma job interrompido sem permitir publicação pela tentativa antiga", async () => {
    const { claimUpload, processUpload, STALE_JOB_MS } =
      await import("@/services/student-portal/processing");
    const pdf = academicPdf(rgm, "APROVADO", "retry test");
    const first = await claimUpload(tutor, enrollmentId, pdf, "retomada.pdf");
    await prisma.academicAnalysisSource.update({
      where: { id: first.source.id },
      data: { updatedAt: new Date(Date.now() - STALE_JOB_MS - 1000) },
    });
    const retry = await claimUpload(student, enrollmentId, pdf, "retomada.pdf");
    expect(retry.run).toBe(true);
    expect(retry.source.attempts).toBe(2);
    await processUpload(first.source.id, first.source.attempts, pdf);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: first.source.id },
        })
      ).status,
    ).toBe("PROCESSING");
    await processUpload(retry.source.id, retry.source.attempts, pdf);
    expect(
      (
        await prisma.academicAnalysisSource.findUniqueOrThrow({
          where: { id: first.source.id },
        })
      ).status,
    ).toBe("COMPLETED");
  });

  it("banco aplica RLS e índice parcial que impedem exposição e processamento concorrente", async () => {
    const flags = await prisma.$queryRaw<
      Array<{ relrowsecurity: boolean }>
    >`SELECT relrowsecurity FROM pg_class WHERE relname IN ('StudentEnrollment', 'AcademicAnalysisVersion', 'AcademicAnalysisSource')`;
    expect(flags).toHaveLength(3);
    expect(flags.every((row) => row.relrowsecurity)).toBe(true);
    const first = await prisma.academicAnalysisSource.create({
      data: {
        enrollmentId,
        sourceFileHash: "b".repeat(64),
        filename: "index-test.pdf",
        actorUserId: tutor.id,
        actorRole: "TUTOR",
      },
    });
    await expect(
      prisma.academicAnalysisSource.create({
        data: {
          enrollmentId,
          sourceFileHash: "c".repeat(64),
          filename: "race.pdf",
          actorUserId: student.id,
          actorRole: "STUDENT",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.academicAnalysisSource.delete({ where: { id: first.id } });
  });

  it("rejeita múltiplos PDFs em qualquer campo multipart para aluno, tutor e admin", async () => {
    const adminEmail = `academic-admin-${randomUUID()}@example.test`;
    const { data: adminAuth } = await (await import("@/lib/supabase/server")).createAdminClient().auth.admin.createUser({ email: adminEmail, password: `A-${randomUUID()}!`, email_confirm: true });
    const adminUser = await prisma.user.create({ data: { role: "ADMIN", email: adminEmail, name: "Admin Teste", authUserId: adminAuth.user!.id } });
    users.push(adminUser.id);
    const admin = { ...tutor, id: adminUser.id, role: "ADMIN" as const, email: adminUser.email };
    const { handleAcademicUpload } = await import("@/services/student-portal/upload-handler");
    for (const actor of [student, tutor, admin]) {
      asSession(actor);
      for (const secondKey of ["file", "complementaryDocument"]) {
        const form = new FormData();
        form.append("file", new File([academicPdf(rgm)], "a.pdf", { type: "application/pdf" }));
        form.append(secondKey, new File([academicPdf(rgm)], "b.pdf", { type: "application/pdf" }));
        form.set("enrollmentId", enrollmentId); form.set("confirmUpdatedTranscript", "true");
        const response = await handleAcademicUpload(new Request("http://localhost:3010/api/portal/upload", { method: "POST", body: form }));
        expect(response.status).toBe(422);
        expect((await response.json()).error).toContain("apenas 1");
      }
    }
  });

  it("Extrato → Simples → Oficial mantém versão, preserva mapeamento e promove fonte oficial", async () => {
    const { claimUpload, processUpload } = await import("@/services/student-portal/processing");
    const code = `${rgm}77`;
    const enrollment = await prisma.studentEnrollment.create({ data: { rgm: code, name: student.name, ownerId: tutor.id, studentUserId: student.id, courseName: "Administracao" } });
    enrollments.push(enrollment.id);
    const upload = async (pdf: Buffer, name: string) => { const claim = await claimUpload(student, enrollment.id, pdf, name); if (claim.run) await processUpload(claim.source.id, claim.source.attempts, pdf); return prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: claim.source.id }, include: { requests: true } }); };
    const extract = await upload(academicPdf(code), "base.pdf");
    const simple = await upload(academicHistoryPdf(code), "simples.pdf");
    const official = await upload(academicHistoryPdf(code, true), "oficial.pdf");
    expect(simple.status).toBe("COMPLETED");
    expect(official.status).toBe("COMPLETED");
    expect(simple.versionId).toBe(extract.versionId);
    expect(official.versionId).toBe(extract.versionId);
    expect(official.requests[0].status).toBe("NO_CHANGES");
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
    const current = await prisma.academicAnalysisVersion.findUniqueOrThrow({ where: { id: extract.versionId! } });
    expect(current.preferredSourceId).toBe(official.id);
    const snapshot = current.snapshot as unknown as import("@/domain/academic-analysis/types").AcademicGridSnapshot;
    expect(snapshot.disciplines.map(r => r.period)).toEqual([1, 3, 2]);
    const beforeCount = await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id } } });
    for (let i = 0; i < 5; i++) expect((await claimUpload(student, enrollment.id, academicHistoryPdf(code, true), `renamed-${i}.pdf`)).duplicate).toBe(true);
    expect(await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id } } })).toBe(beforeCount);
    const changed = await upload(academicHistoryPdf(code, true, true), "nova-aprovacao.pdf");
    expect(changed.versionId).not.toBe(extract.versionId);
    expect(changed.requests[0].createdVersion).toBe(true);
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(2);
    const { reviewAcademicRequest } = await import("@/services/academic-documents/requests");
    await expect(reviewAcademicRequest(otherTutor, changed.requests[0].id, "REJECT")).rejects.toThrow();
    await expect(reviewAcademicRequest(student, changed.requests[0].id, "REJECT")).rejects.toThrow();
    await reviewAcademicRequest(tutor, changed.requests[0].id, "REJECT", "Documento inadequado.");
    expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(extract.versionId);
    await expect(claimUpload(student, enrollment.id, academicHistoryPdf(code, true, true), "mesmo-recusado.pdf")).rejects.toThrow("recusado");
    const replacement = await upload(academicHistoryPdf(code, true, true, "new-request"), "corrigido.pdf");
    expect(replacement.requests[0].previousRequestId).toBe(changed.requests[0].id);
    expect(replacement.requests[0].sourceDocumentId).not.toBe(changed.id);
    expect(await prisma.academicAnalysisVersion.count({ where: { enrollmentId: enrollment.id } })).toBe(3);
    expect(await prisma.academicRequest.count({ where: { sourceDocument: { enrollmentId: enrollment.id }, aiUsed: true } })).toBe(0);
  });

  it("histórico sem grade publica dados seguros em revisão e rejeita RGM/curso/UNKNOWN", async () => {
    const { claimUpload, processUpload } = await import("@/services/student-portal/processing");
    const code = `${rgm}88`;
    const enrollment = await prisma.studentEnrollment.create({ data: { rgm: code, name: student.name, ownerId: tutor.id, studentUserId: student.id, courseName: "Administracao" } });
    enrollments.push(enrollment.id);
    const pdf = academicHistoryPdf(code);
    const claim = await claimUpload(tutor, enrollment.id, pdf, "qualquer-nome.pdf");
    await processUpload(claim.source.id, claim.source.attempts, pdf);
    const source = await prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: claim.source.id }, include: { requests: true, version: true } });
    expect(source.requests[0].status).toBe("UNDER_REVIEW");
    const snapshot = source.version!.snapshot as unknown as import("@/domain/academic-analysis/types").AcademicGridSnapshot;
    expect(snapshot.disciplines.every(r => r.period === null)).toBe(true);
    expect(snapshot.result.currentPeriod).toBeNull();
    const { reviewAcademicRequest } = await import("@/services/academic-documents/requests");
    await expect(reviewAcademicRequest(tutor, source.requests[0].id, "CONCLUDE")).rejects.toThrow("mapeamento");
    for (const invalid of [academicHistoryPdf("outro-rgm"), academicPdf(code, "A CURSAR", "", student.name, "Outro curso"), selectablePdf([[20, 780, "PDF sem dados academicos"]])]) {
      const bad = await claimUpload(student, enrollment.id, invalid, "invalido.pdf");
      await processUpload(bad.source.id, bad.source.attempts, invalid);
      expect((await prisma.academicAnalysisSource.findUniqueOrThrow({ where: { id: bad.source.id } })).status).toBe("FAILED");
      expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(source.versionId);
    }
    const storage = (await import("@/services/storage/storage")).getStorage();
    expect(await storage.read(source.storageKey!)).toEqual(pdf);
    const flags = await prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE relname = 'AcademicRequest'`;
    expect(flags[0].relrowsecurity).toBe(true);
  });


  it("tutor exclui solicitação e análise dos próprios alunos, com a versão anterior voltando a ser a atual", async () => {
    const { claimUpload, processUpload } = await import("@/services/student-portal/processing");
    const { deleteAcademicRequest, deleteAcademicGridReview } = await import("@/services/student-portal/deletion");
    const code = `${rgm}41`;
    const enrollment = await prisma.studentEnrollment.create({ data: { rgm: code, name: student.name, ownerId: tutor.id, courseName: "Administracao" } });
    enrollments.push(enrollment.id);
    for (const pdf of [academicPdf(code), academicPdf(code, "CURSANDO")]) {
      const claim = await claimUpload(tutor, enrollment.id, pdf, "extrato.pdf");
      await processUpload(claim.source.id, claim.source.attempts, pdf);
    }
    const [v1, v2] = await prisma.academicAnalysisVersion.findMany({ where: { enrollmentId: enrollment.id }, orderBy: { version: "asc" } });
    expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(v2.id);
    const latest = await prisma.academicRequest.findFirstOrThrow({ where: { sourceDocument: { versionId: v2.id } } });
    await expect(deleteAcademicRequest(otherTutor, latest.id)).rejects.toThrow("seus alunos");
    await deleteAcademicRequest(tutor, latest.id);
    expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBe(v1.id);
    expect(await prisma.academicAnalysisVersion.count({ where: { id: v2.id } })).toBe(0);
    expect(await prisma.academicGridReview.count({ where: { id: v2.reviewId } })).toBe(0);
    await deleteAcademicGridReview(tutor, v1.reviewId);
    expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).currentVersionId).toBeNull();
    expect(await prisma.academicAnalysisSource.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { userId: tutor.id, action: { in: ["academic_request.delete", "academic_grid.delete"] } } })).toBe(2);
  }, 30000);
});
