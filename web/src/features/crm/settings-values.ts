import { parseMoney } from "@/features/crm/course-import";
import type { LogoSource } from "@/domain/proposal/document";
import type { ProposalRules } from "@/domain/proposal/pricing";

export interface SettingsFormValues {
  institutionName: string;
  institutionDocument: string;
  logoSource: LogoSource;
  uploadedLogoUrl: string | null;
  rules: ProposalRules;
  projectionNote: string;
  finalMessage: string;
  pixKey: string;
  pixMerchantName: string;
  pixCity: string;
}

/** O formulário trabalha com texto (o que a pessoa digita); a conversão para números acontece só ao salvar. */
export interface SettingsValues {
  institutionName: string;
  institutionDocument: string;
  logoSource: LogoSource;
  enrollmentFee: string;
  dueDay: string;
  firstTermInstallments: string;
  punctualityPct: string;
  lateTier1Pct: string;
  lateTier2Pct: string;
  firstTermScholarshipPct: string;
  nextScholarshipPct: string;
  scholarshipStepPct: string;
  readjustPct1: string;
  readjustUntil: string;
  readjustPct2: string;
  annualMinPct: string;
  annualMaxPct: string;
  projectionNote: string;
  finalMessage: string;
  pixKey: string;
  pixMerchantName: string;
  pixCity: string;
}

export type SettingsErrors = Partial<Record<keyof SettingsValues, string>>;

const text = (value: number) => String(value).replace(".", ",");
const num = (value: string) => Number(value.trim().replace(",", "."));

export function valuesFromInitial(initial: SettingsFormValues): SettingsValues {
  const r = initial.rules;
  const first = r.semesterReadjust[0] ?? { from: 2, to: 5, pct: 2 };
  const second = r.semesterReadjust[1] ?? { from: (first.to ?? 5) + 1, to: null, pct: 3 };
  return {
    institutionName: initial.institutionName,
    institutionDocument: initial.institutionDocument,
    logoSource: initial.logoSource,
    enrollmentFee: (r.enrollmentFeeCents / 100).toFixed(2).replace(".", ","),
    dueDay: String(r.dueDay),
    firstTermInstallments: String(r.firstTermInstallments),
    punctualityPct: text(r.punctualityPct),
    lateTier1Pct: text(r.lateTier1Pct),
    lateTier2Pct: text(r.lateTier2Pct),
    firstTermScholarshipPct: text(r.firstTermScholarshipPct),
    nextScholarshipPct: text(r.nextScholarshipPct),
    scholarshipStepPct: text(r.scholarshipStepPct),
    readjustPct1: text(first.pct),
    readjustUntil: String(first.to ?? 5),
    readjustPct2: text(second.pct),
    annualMinPct: text(r.annualMinPct),
    annualMaxPct: text(r.annualMaxPct),
    projectionNote: initial.projectionNote,
    finalMessage: initial.finalMessage,
    pixKey: initial.pixKey,
    pixMerchantName: initial.pixMerchantName,
    pixCity: initial.pixCity,
  };
}

const PERCENT_FIELDS = ["punctualityPct", "lateTier1Pct", "lateTier2Pct", "firstTermScholarshipPct", "nextScholarshipPct", "scholarshipStepPct", "readjustPct1", "readjustPct2", "annualMinPct", "annualMaxPct"] as const;

export function validateValues(v: SettingsValues): SettingsErrors {
  const errors: SettingsErrors = {};
  if (v.institutionName.trim().length < 2) errors.institutionName = "Informe o nome da instituição.";
  if (!/^[0-9./ -]*$/.test(v.institutionDocument)) errors.institutionDocument = "Use só números, ponto, barra e hífen.";
  const fee = parseMoney(v.enrollmentFee || "0");
  if (!Number.isFinite(fee) || fee < 0) errors.enrollmentFee = "Informe um valor em reais, como 99,00.";
  const integer = (field: "dueDay" | "firstTermInstallments" | "readjustUntil", min: number, max: number, message: string) => {
    const n = num(v[field]);
    if (!Number.isInteger(n) || n < min || n > max) errors[field] = message;
  };
  integer("dueDay", 1, 28, "Dia de 1 a 28.");
  integer("firstTermInstallments", 1, 12, "De 1 a 12 parcelas.");
  integer("readjustUntil", 2, 19, "Semestre de 2 a 19.");
  for (const field of PERCENT_FIELDS) {
    const n = num(v[field]);
    if (!v[field].trim() || !Number.isFinite(n) || n < 0 || n > 100) errors[field] = "Percentual de 0 a 100.";
  }
  if (!errors.annualMinPct && !errors.annualMaxPct && num(v.annualMaxPct) < num(v.annualMinPct)) errors.annualMaxPct = "O máximo não pode ser menor que o mínimo.";
  if (v.pixKey.trim() && !v.pixMerchantName.trim()) errors.pixMerchantName = "Informe o nome do recebedor para gerar o Pix.";
  if (v.pixKey.trim() && !v.pixCity.trim()) errors.pixCity = "Informe a cidade do recebedor para gerar o Pix.";
  return errors;
}

export function payloadFromValues(v: SettingsValues) {
  const until = num(v.readjustUntil);
  return {
    institutionName: v.institutionName,
    institutionDocument: v.institutionDocument,
    logoSource: v.logoSource,
    rules: {
      enrollmentFeeCents: parseMoney(v.enrollmentFee || "0"),
      dueDay: num(v.dueDay),
      firstTermInstallments: num(v.firstTermInstallments),
      punctualityPct: num(v.punctualityPct),
      lateTier1Pct: num(v.lateTier1Pct),
      lateTier2Pct: num(v.lateTier2Pct),
      firstTermScholarshipPct: num(v.firstTermScholarshipPct),
      nextScholarshipPct: num(v.nextScholarshipPct),
      scholarshipStepPct: num(v.scholarshipStepPct),
      semesterReadjust: [
        { from: 2, to: until, pct: num(v.readjustPct1) },
        { from: until + 1, to: null, pct: num(v.readjustPct2) },
      ],
      annualMinPct: num(v.annualMinPct),
      annualMaxPct: num(v.annualMaxPct),
    },
    projectionNote: v.projectionNote,
    finalMessage: v.finalMessage,
    pixKey: v.pixKey,
    pixMerchantName: v.pixMerchantName,
    pixCity: v.pixCity,
  };
}

export const isDirty = (a: SettingsValues, b: SettingsValues) => (Object.keys(a) as (keyof SettingsValues)[]).some((key) => a[key] !== b[key]);
