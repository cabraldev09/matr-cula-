import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { buildRulesFromRecords, RULE_DEFINITIONS, type AcademicRules } from "@/domain/curricular-analysis/rules/types";

/** Cada empresa recebe a versão 1.0 das regras padrão no primeiro uso do módulo. */
async function createDefaultRuleSet() {
  try {
    await prisma.ruleSetVersion.create({
      data: {
        version: "1.0",
        isActive: true,
        notes: "Conjunto inicial de regras.",
        rules: {
          create: RULE_DEFINITIONS.map((d) => ({
            key: d.key,
            valueType: d.valueType,
            value: d.defaultValue === null ? Prisma.JsonNull : (d.defaultValue as Prisma.InputJsonValue),
            status: d.status,
            description: d.description,
          })),
        },
      },
    });
  } catch (error) {
    // Outra requisição criou a mesma versão ao mesmo tempo.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
}

export async function getActiveRuleSet(): Promise<{ id: string; version: string; rules: AcademicRules }> {
  const find = () => prisma.ruleSetVersion.findFirst({ where: { isActive: true }, include: { rules: true }, orderBy: { effectiveFrom: "desc" } });
  let active = await find();
  if (!active) {
    await createDefaultRuleSet();
    active = await find();
  }
  if (!active) throw new Error("Nenhuma versão de regras ativa.");
  return { id: active.id, version: active.version, rules: buildRulesFromRecords(active.rules) };
}

export async function getRuleSetById(id: string): Promise<{ id: string; version: string; rules: AcademicRules }> {
  const rs = await prisma.ruleSetVersion.findUniqueOrThrow({ where: { id }, include: { rules: true } });
  return { id: rs.id, version: rs.version, rules: buildRulesFromRecords(rs.rules) };
}
