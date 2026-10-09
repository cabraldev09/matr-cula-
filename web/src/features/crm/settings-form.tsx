"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { removeEfiAccountAction, saveEfiAccountAction } from "@/features/crm/actions";
import { saveProposalSettingsAction, uploadProposalLogoAction } from "@/features/crm/settings-actions";
import { isDirty, payloadFromValues, validateValues, valuesFromInitial, type SettingsFormValues, type SettingsValues } from "@/features/crm/settings-values";

export type { SettingsFormValues } from "@/features/crm/settings-values";

interface EfiProps {
  configured: boolean;
  clientIdHint: string | null;
  sandbox: boolean;
  isOwner: boolean;
}

type FieldName = keyof SettingsValues;

/** Tela única com três abas. Os valores ficam em um estado só, então trocar de aba não perde nada e dá para avisar das alterações não salvas. */
export function ProposalSettings({ initial, efi }: { initial: SettingsFormValues; efi: EfiProps }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [baseline, setBaseline] = useState(() => valuesFromInitial(initial));
  const [values, setValues] = useState(baseline);
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => validateValues(values), [values]);
  const dirty = isDirty(values, baseline);
  const errorCount = Object.keys(errors).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (name: FieldName) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  const field = (name: FieldName, label: string, props: React.ComponentProps<typeof Input> = {}) => {
    const message = showErrors ? errors[name] : undefined;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input id={name} value={String(values[name])} onChange={(e) => set(name)(e.target.value)} aria-invalid={Boolean(message)} aria-describedby={message ? `${name}-error` : undefined} {...props} />
        {message && <p id={`${name}-error`} className="text-xs text-status-danger">{message}</p>}
      </div>
    );
  };

  function save() {
    setShowErrors(true);
    if (errorCount > 0) {
      toast.error("Confira os campos destacados antes de salvar.");
      return;
    }
    start(async () => {
      const result = await saveProposalSettingsAction(payloadFromValues(values));
      if (result.ok) {
        toast.success(result.message);
        setBaseline(values);
        setShowErrors(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  const logoOptions = [
    ["preset_cruzeiro", "Cruzeiro do Sul Virtual", "/presets/cruzeiro-do-sul-virtual.png"],
    ["upload", "Minha logo", initial.uploadedLogoUrl],
    ["none", "Sem logo", null],
  ] as const;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="aparencia">
        <TabsList>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="condicoes">Condições</TabsTrigger>
          <TabsTrigger value="recebimento">Recebimento</TabsTrigger>
        </TabsList>

        <TabsContent value="aparencia" className="mt-4 grid gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Cabeçalho da proposta</CardTitle>
              <CardDescription>Instituição, CNPJ e logo que aparecem no topo da proposta e do PDF.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {field("institutionName", "Instituição", { maxLength: 160, placeholder: "Universidade Cruzeiro do Sul Virtual" })}
                {field("institutionDocument", "CNPJ", { maxLength: 24, placeholder: "07.158.229/0007-93" })}
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Logo da proposta</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {logoOptions.map(([value, label, src]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setValues((prev) => ({ ...prev, logoSource: value }))}
                      aria-pressed={values.logoSource === value}
                      className={cn("flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm transition-colors", values.logoSource === value ? "border-brand-cyan bg-brand-cyan/5 ring-2 ring-brand-cyan/30" : "hover:bg-muted/50")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- logos com proporção livre */}
                      {src ? <img src={src} alt="" className="h-10 w-auto max-w-full object-contain" /> : <span className="text-muted-foreground">{value === "upload" ? "Envie abaixo" : "—"}</span>}
                      <span className="flex items-center gap-1 font-medium">{values.logoSource === value && <CheckCircle2 className="size-4 text-brand-cyan" />}{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">A logo da Cruzeiro do Sul é oferecida para polos parceiros autorizados a usar a marca nas propostas. A plataforma continua com a marca Matrícula+.</p>
              </fieldset>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Minha logo na proposta</CardTitle>
              <CardDescription>Ao enviar, a proposta passa a usar esta logo. O envio é imediato e independe do botão Salvar.</CardDescription>
            </CardHeader>
            <CardContent><ProposalLogoUpload onUploaded={() => setValues((prev) => ({ ...prev, logoSource: "upload" }))} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="condicoes" className="mt-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Condições e projeção</CardTitle>
              <CardDescription>Os padrões reproduzem a proposta modelo. Mudanças valem para as próximas propostas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {field("enrollmentFee", "Taxa de matrícula (R$)", { inputMode: "decimal" })}
              {field("dueDay", "Vencimento (dia)", { inputMode: "numeric" })}
              {field("firstTermInstallments", "Parcelas no 1º semestre", { inputMode: "numeric" })}
              {field("punctualityPct", "Pontualidade inclusa (%)", { inputMode: "decimal" })}
              {field("lateTier1Pct", "Acréscimo dias 11 a 25 (%)", { inputMode: "decimal" })}
              {field("lateTier2Pct", "Acréscimo após vencimento (%)", { inputMode: "decimal" })}
              {field("firstTermScholarshipPct", "Bolsa no 1º semestre (%)", { inputMode: "decimal" })}
              {field("nextScholarshipPct", "Bolsa nos demais (%)", { inputMode: "decimal" })}
              {field("scholarshipStepPct", "Ajuste de bolsa no 2º semestre (%)", { inputMode: "decimal" })}
              {field("readjustPct1", "Reajuste semestral (%)", { inputMode: "decimal" })}
              {field("readjustUntil", "…do 2º até o semestre", { inputMode: "numeric" })}
              {field("readjustPct2", "Reajuste depois disso (%)", { inputMode: "decimal" })}
              {field("annualMinPct", "Reajuste anual mínimo (%)", { inputMode: "decimal" })}
              {field("annualMaxPct", "Reajuste anual máximo (%)", { inputMode: "decimal" })}
              <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="projectionNote">Texto da projeção</Label><Textarea id="projectionNote" rows={2} maxLength={600} value={values.projectionNote} onChange={(e) => set("projectionNote")(e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="finalMessage">Mensagem final</Label><Textarea id="finalMessage" rows={2} maxLength={600} value={values.finalMessage} onChange={(e) => set("finalMessage")(e.target.value)} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recebimento" className="mt-4 grid gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Pix do polo</CardTitle>
              <CardDescription>Usado para gerar o Pix copia-e-cola da taxa. A equipe confirma o recebimento no CRM.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {field("pixKey", "Chave Pix", { maxLength: 77, placeholder: "CNPJ, e-mail, telefone ou aleatória" })}
              {field("pixMerchantName", "Nome do recebedor", { maxLength: 60 })}
              {field("pixCity", "Cidade do recebedor", { maxLength: 40 })}
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Conta Efí do polo</CardTitle>
              <CardDescription>Gera links de pagamento da taxa (boleto, cartão e Pix) com confirmação automática no CRM. O dinheiro cai direto na conta do polo.</CardDescription>
            </CardHeader>
            <CardContent><EfiAccountForm {...efi} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className={cn("sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg transition-opacity", dirty ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!dirty}>
        <p className="text-sm font-medium" role="status">
          Alterações não salvas
          {showErrors && errorCount > 0 && <span className="ml-2 text-status-danger">· {errorCount} campo(s) para corrigir</span>}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => { setValues(baseline); setShowErrors(false); }}>Descartar</Button>
          <Button type="button" disabled={pending} onClick={save}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar configurações</Button>
        </div>
      </div>
    </div>
  );
}

function ProposalLogoUpload({ onUploaded }: { onUploaded: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={(form) =>
        start(async () => {
          const result = await uploadProposalLogoAction(form);
          if (result.ok) {
            toast.success(result.message);
            onUploaded();
            router.refresh();
          } else toast.error(result.error);
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <Input name="logo" type="file" accept="image/png,image/jpeg" required aria-label="Arquivo da logo" className="max-w-xs" />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar minha logo</Button>
      <span className="text-xs text-muted-foreground">PNG ou JPG até 1 MB.</span>
    </form>
  );
}

function EfiAccountForm({ configured, clientIdHint, sandbox, isOwner }: EfiProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [useSandbox, setSandbox] = useState(sandbox);
  const [disconnecting, setDisconnecting] = useState(false);
  if (!isOwner) return <p className="text-sm text-muted-foreground">{configured ? `Conta Efí conectada (${clientIdHint}).` : "Somente o proprietário conecta a conta Efí."}</p>;
  return (
    <div className="space-y-3">
      {configured && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-status-success" /> Conectada · Client ID {clientIdHint} · {sandbox ? "homologação" : "produção"}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDisconnecting(true)}>Desconectar</Button>
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
      <AlertDialog open={disconnecting} onOpenChange={setDisconnecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta Efí?</AlertDialogTitle>
            <AlertDialogDescription>Os links de pagamento deixam de ser gerados e as cobranças em aberto não confirmam mais sozinhas. O Pix copia-e-cola continua funcionando.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
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
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
