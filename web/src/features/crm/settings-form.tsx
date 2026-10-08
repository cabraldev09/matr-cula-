"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProposalRules } from "@/domain/proposal/pricing";
import type { LogoSource } from "@/domain/proposal/document";
import { saveProposalSettingsAction, uploadProposalLogoAction } from "@/features/crm/settings-actions";
import { removeEfiAccountAction, saveEfiAccountAction } from "@/features/crm/actions";
import { parseMoney } from "@/features/crm/courses-manager";

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

export function ProposalSettingsForm({ initial }: { initial: SettingsFormValues }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logoSource, setLogoSource] = useState<LogoSource>(initial.logoSource);
  const r = initial.rules;
  const firstRange = r.semesterReadjust[0] ?? { from: 2, to: 5, pct: 2 };
  const secondRange = r.semesterReadjust[1] ?? { from: (firstRange.to ?? 5) + 1, to: null, pct: 3 };

  function submit(form: FormData) {
    const n = (name: string) => Number(String(form.get(name) ?? "").replace(",", "."));
    const until = n("readjustUntil");
    start(async () => {
      const result = await saveProposalSettingsAction({
        institutionName: form.get("institutionName"),
        institutionDocument: form.get("institutionDocument"),
        logoSource,
        rules: {
          enrollmentFeeCents: parseMoney(String(form.get("enrollmentFee") ?? "0")),
          dueDay: n("dueDay"),
          firstTermInstallments: n("firstTermInstallments"),
          punctualityPct: n("punctualityPct"),
          lateTier1Pct: n("lateTier1Pct"),
          lateTier2Pct: n("lateTier2Pct"),
          firstTermScholarshipPct: n("firstTermScholarshipPct"),
          nextScholarshipPct: n("nextScholarshipPct"),
          scholarshipStepPct: n("scholarshipStepPct"),
          semesterReadjust: [
            { from: 2, to: until, pct: n("readjustPct1") },
            { from: until + 1, to: null, pct: n("readjustPct2") },
          ],
          annualMinPct: n("annualMinPct"),
          annualMaxPct: n("annualMaxPct"),
        },
        projectionNote: form.get("projectionNote"),
        finalMessage: form.get("finalMessage"),
        pixKey: form.get("pixKey"),
        pixMerchantName: form.get("pixMerchantName"),
        pixCity: form.get("pixCity"),
      });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  const field = (name: string, label: string, value: string | number, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value} {...props} />
    </div>
  );

  return (
    <form action={submit} className="grid gap-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cabeçalho da proposta</CardTitle>
          <CardDescription>Instituição, CNPJ e logo que aparecem no topo da proposta e do PDF.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("institutionName", "Instituição", initial.institutionName, { required: true, maxLength: 160, placeholder: "Universidade Cruzeiro do Sul Virtual" })}
            {field("institutionDocument", "CNPJ", initial.institutionDocument, { maxLength: 24, placeholder: "07.158.229/0007-93" })}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Logo da proposta</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["preset_cruzeiro", "Cruzeiro do Sul Virtual", "/presets/cruzeiro-do-sul-virtual.png"],
                  ["upload", "Minha logo", initial.uploadedLogoUrl],
                  ["none", "Sem logo", null],
                ] as const
              ).map(([value, label, src]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLogoSource(value)}
                  aria-pressed={logoSource === value}
                  className={cn("flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm transition-colors", logoSource === value ? "border-brand-cyan bg-brand-cyan/5 ring-2 ring-brand-cyan/30" : "hover:bg-muted/50")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- logos com proporção livre */}
                  {src ? <img src={src} alt="" className="h-10 w-auto max-w-full object-contain" /> : <span className="text-muted-foreground">{value === "upload" ? "Envie abaixo" : "—"}</span>}
                  <span className="flex items-center gap-1 font-medium">{logoSource === value && <CheckCircle2 className="size-4 text-brand-cyan" />}{label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">A logo da Cruzeiro do Sul é oferecida para polos parceiros autorizados a usar a marca nas propostas. A plataforma continua com a marca Matrícula+.</p>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Condições e projeção</CardTitle>
          <CardDescription>Os padrões reproduzem a proposta modelo. Mudanças valem para as próximas propostas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {field("enrollmentFee", "Taxa de matrícula (R$)", (r.enrollmentFeeCents / 100).toFixed(2).replace(".", ","), { inputMode: "decimal" })}
          {field("dueDay", "Vencimento (dia)", r.dueDay, { type: "number", min: 1, max: 28 })}
          {field("firstTermInstallments", "Parcelas no 1º semestre", r.firstTermInstallments, { type: "number", min: 1, max: 12 })}
          {field("punctualityPct", "Pontualidade inclusa (%)", r.punctualityPct, { inputMode: "decimal" })}
          {field("lateTier1Pct", "Acréscimo dias 11 a 25 (%)", r.lateTier1Pct, { inputMode: "decimal" })}
          {field("lateTier2Pct", "Acréscimo após vencimento (%)", r.lateTier2Pct, { inputMode: "decimal" })}
          {field("firstTermScholarshipPct", "Bolsa no 1º semestre (%)", r.firstTermScholarshipPct, { inputMode: "decimal" })}
          {field("nextScholarshipPct", "Bolsa nos demais (%)", r.nextScholarshipPct, { inputMode: "decimal" })}
          {field("scholarshipStepPct", "Ajuste de bolsa no 2º semestre (%)", r.scholarshipStepPct, { inputMode: "decimal" })}
          {field("readjustPct1", "Reajuste semestral (%)", firstRange.pct, { inputMode: "decimal" })}
          {field("readjustUntil", "…do 2º até o semestre", firstRange.to ?? 5, { type: "number", min: 2, max: 19 })}
          {field("readjustPct2", "Reajuste depois disso (%)", secondRange.pct, { inputMode: "decimal" })}
          {field("annualMinPct", "Reajuste anual mínimo (%)", r.annualMinPct, { inputMode: "decimal" })}
          {field("annualMaxPct", "Reajuste anual máximo (%)", r.annualMaxPct, { inputMode: "decimal" })}
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="projectionNote">Texto da projeção</Label><Textarea id="projectionNote" name="projectionNote" rows={2} maxLength={600} defaultValue={initial.projectionNote} /></div>
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="finalMessage">Mensagem final</Label><Textarea id="finalMessage" name="finalMessage" rows={2} maxLength={600} defaultValue={initial.finalMessage} /></div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Pix do polo</CardTitle>
          <CardDescription>Usado para gerar o Pix copia-e-cola da taxa. A equipe confirma o recebimento no CRM.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {field("pixKey", "Chave Pix", initial.pixKey, { maxLength: 77, placeholder: "CNPJ, e-mail, telefone ou aleatória" })}
          {field("pixMerchantName", "Nome do recebedor", initial.pixMerchantName, { maxLength: 60 })}
          {field("pixCity", "Cidade do recebedor", initial.pixCity, { maxLength: 40 })}
        </CardContent>
      </Card>

      <div>
        <Button type="submit" size="lg" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar configurações</Button>
      </div>
    </form>
  );
}

export function ProposalLogoUpload() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={(form) =>
        start(async () => {
          const result = await uploadProposalLogoAction(form);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.error);
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <Input name="logo" type="file" accept="image/png,image/jpeg" required className="max-w-xs" />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar minha logo</Button>
      <span className="text-xs text-muted-foreground">PNG ou JPG até 1 MB.</span>
    </form>
  );
}

export function EfiAccountForm({ configured, clientIdHint, sandbox, isOwner }: { configured: boolean; clientIdHint: string | null; sandbox: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [useSandbox, setSandbox] = useState(sandbox);
  if (!isOwner) return <p className="text-sm text-muted-foreground">{configured ? `Conta Efí conectada (${clientIdHint}).` : "Somente o proprietário conecta a conta Efí."}</p>;
  return (
    <div className="space-y-3">
      {configured && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-600" /> Conectada · Client ID {clientIdHint} · {sandbox ? "homologação" : "produção"}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await removeEfiAccountAction();
                if (result.ok) {
                  toast.success(result.message);
                  router.refresh();
                } else toast.error(result.error);
              })
            }
          >
            Desconectar
          </Button>
        </p>
      )}
      <form
        action={(form) =>
          start(async () => {
            const result = await saveEfiAccountAction({ clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), sandbox: useSandbox });
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else toast.error(result.error);
          })
        }
        className="grid gap-3 sm:grid-cols-2"
      >
        <div className="space-y-1.5"><Label htmlFor="clientId">Client ID</Label><Input id="clientId" name="clientId" required autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="clientSecret">Client Secret</Label><Input id="clientSecret" name="clientSecret" type="password" required autoComplete="off" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={useSandbox} onCheckedChange={setSandbox} /> Ambiente de homologação (testes)</label>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {configured ? "Trocar credenciais" : "Conectar conta Efí"}</Button></div>
      </form>
      <p className="text-xs text-muted-foreground">
        Na Efí: API → Aplicações → crie uma aplicação com a “API de Emissão de cobranças”. O sistema confere as credenciais antes de salvar e guarda o segredo cifrado. Cada link de pagamento já leva o endereço de notificação, então o pagamento confirma sozinho.
      </p>
    </div>
  );
}
