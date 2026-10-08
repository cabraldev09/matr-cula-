"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, CreditCard, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { checkoutAction, startTrialAction, type CheckoutResult } from "@/features/billing/actions";

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  description: string;
  priceCents: number;
  interval: "month" | "year";
  trialDays: number;
  modules: string[];
  limits: Record<string, number>;
}

const LIMIT_LABELS: Record<string, string> = {
  users: "usuários",
  channels: "canais",
  analyses: "análises por mês",
  ai_credits: "créditos de IA por mês",
};

export function PlanPicker({
  plans,
  moduleNames,
  currentPlanId,
  pendingPlanId,
  canStartTrial,
  isOwner,
  highlightModule,
  hasBillingProfile,
  efiAccount,
  efiSandbox,
}: {
  plans: PlanOption[];
  moduleNames: Record<string, string>;
  currentPlanId: string | null;
  pendingPlanId: string | null;
  canStartTrial: boolean;
  isOwner: boolean;
  highlightModule: string | null;
  hasBillingProfile: boolean;
  efiAccount: string | null;
  efiSandbox: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checkoutPlan, setCheckoutPlan] = useState<PlanOption | null>(null);

  function trial(plan: PlanOption) {
    start(async () => {
      const result = await startTrialAction(plan.code);
      if (result.ok) {
        toast.success(result.message);
        router.push("/inicio");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const current = plan.id === currentPlanId;
          const waiting = plan.id === pendingPlanId;
          const highlighted = highlightModule ? plan.modules.includes(highlightModule) : false;
          return (
            <Card key={plan.id} className={cn("flex flex-col shadow-sm", (current || highlighted) && "ring-2 ring-brand-cyan")}>
              <CardContent className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  {current && <Badge>Atual</Badge>}
                  {waiting && <Badge variant="outline">Aguardando pagamento</Badge>}
                </div>
                <p>
                  <span className="text-3xl font-semibold tabular-nums">{formatCurrencyBRL(plan.priceCents / 100)}</span>
                  <span className="text-sm text-muted-foreground">/{plan.interval === "year" ? "ano" : "mês"}</span>
                </p>
                <ul className="space-y-1.5 text-sm">
                  {plan.modules.map((module) => (
                    <li key={module} className="flex items-center gap-2"><Check className="size-4 text-status-success" /> {moduleNames[module] ?? module}</li>
                  ))}
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <li key={key} className="flex items-center gap-2 text-muted-foreground"><span className="size-4" /> {value === 1 ? `1 ${(LIMIT_LABELS[key] ?? key).replace(/s(\b| )/, "$1")}` : `Até ${value} ${LIMIT_LABELS[key] ?? key}`}</li>
                  ))}
                </ul>
                <div className="mt-auto grid gap-2">
                  {isOwner ? (
                    <>
                      {canStartTrial && plan.trialDays > 0 && (
                        <Button variant="outline" disabled={pending} onClick={() => trial(plan)}>
                          {pending && <Loader2 className="size-4 animate-spin" />} Testar grátis por {plan.trialDays} dias
                        </Button>
                      )}
                      {!current && (
                        <Button
                          disabled={pending}
                          onClick={() => {
                            if (!hasBillingProfile) {
                              toast.error("Preencha os dados de cobrança abaixo antes de contratar.");
                              document.getElementById("dados-cobranca")?.scrollIntoView({ behavior: "smooth" });
                              return;
                            }
                            setCheckoutPlan(plan);
                          }}
                        >
                          {currentPlanId ? "Mudar para este plano" : "Contratar"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Somente o proprietário da empresa contrata ou troca o plano.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <CheckoutDialog plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} efiAccount={efiAccount} efiSandbox={efiSandbox} />
    </>
  );
}

function CheckoutDialog({ plan, onClose, efiAccount, efiSandbox }: { plan: PlanOption | null; onClose: () => void; efiAccount: string | null; efiSandbox: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState<"boleto" | "credit_card">("boleto");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CheckoutResult | null>(null);

  function close() {
    setResult(null);
    onClose();
  }

  function submit(form: FormData) {
    if (!plan) return;
    start(async () => {
      let paymentToken: string | undefined;
      if (method === "credit_card") {
        if (!efiAccount) {
          toast.error("Pagamento com cartão indisponível no momento.");
          return;
        }
        try {
          paymentToken = await tokenizeCard(form, efiAccount, efiSandbox);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Confira os dados do cartão.");
          return;
        }
      }
      const response = await checkoutAction({ planCode: plan.code, method, paymentToken });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success(response.message);
      router.refresh();
      if (method === "boleto") setResult(response.data);
      else close();
    });
  }

  return (
    <Dialog open={Boolean(plan)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? "Cobrança gerada" : `Contratar ${plan?.name ?? ""}`}</DialogTitle>
          <DialogDescription>
            {result
              ? "Pague pelo boleto ou pelo Pix. O plano é liberado automaticamente quando a Efí confirmar o pagamento."
              : `${plan ? formatCurrencyBRL(plan.priceCents / 100) : ""} por ${plan?.interval === "year" ? "ano" : "mês"}, renovado automaticamente. Cancele quando quiser.`}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            {result.paymentUrl && (
              <Button asChild>
                <a href={result.paymentUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir boleto</a>
              </Button>
            )}
            {result.pixCopyPaste && (
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(result.pixCopyPaste!).then(() => toast.success("Código Pix copiado."))}
              >
                <Copy className="size-4" /> Copiar código Pix
              </Button>
            )}
            <Button variant="ghost" onClick={close}>Fechar</Button>
          </div>
        ) : (
          <form action={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={method === "boleto" ? "default" : "outline"} onClick={() => setMethod("boleto")}>
                <FileText className="size-4" /> Boleto ou Pix
              </Button>
              <Button type="button" variant={method === "credit_card" ? "default" : "outline"} onClick={() => setMethod("credit_card")}>
                <CreditCard className="size-4" /> Cartão
              </Button>
            </div>
            {method === "credit_card" && (
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cardNumber">Número do cartão</Label>
                  <Input id="cardNumber" name="cardNumber" inputMode="numeric" autoComplete="cc-number" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="holderName">Nome impresso no cartão</Label>
                  <Input id="holderName" name="holderName" autoComplete="cc-name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="holderDocument">CPF do titular</Label>
                  <Input id="holderDocument" name="holderDocument" inputMode="numeric" required />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="expMonth">Mês</Label>
                    <Input id="expMonth" name="expMonth" inputMode="numeric" placeholder="MM" autoComplete="cc-exp-month" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="expYear">Ano</Label>
                    <Input id="expYear" name="expYear" inputMode="numeric" placeholder="AAAA" autoComplete="cc-exp-year" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cvv">CVV</Label>
                    <Input id="cvv" name="cvv" inputMode="numeric" autoComplete="cc-csc" required />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Os dados do cartão vão direto para a Efí; nosso sistema recebe só um token.</p>
              </div>
            )}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} {method === "boleto" ? "Gerar cobrança" : "Pagar com cartão"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Tokeniza o cartão no navegador com a biblioteca oficial da Efí. */
async function tokenizeCard(form: FormData, account: string, sandbox: boolean): Promise<string> {
  const { default: EfiPay } = await import("payment-token-efi");
  const digits = (name: string) => String(form.get(name) ?? "").replace(/\D/g, "");
  const number = digits("cardNumber");
  const card = EfiPay.CreditCard.setAccount(account).setEnvironment(sandbox ? "sandbox" : "production").setCardNumber(number);
  const brand = await card.verifyCardBrand();
  const result = await EfiPay.CreditCard.setAccount(account)
    .setEnvironment(sandbox ? "sandbox" : "production")
    .setCreditCardData({
      brand,
      number,
      cvv: digits("cvv"),
      expirationMonth: digits("expMonth").padStart(2, "0"),
      expirationYear: digits("expYear"),
      holderName: String(form.get("holderName") ?? "").trim(),
      holderDocument: digits("holderDocument"),
      reuse: true,
    })
    .getPaymentToken();
  if ("payment_token" in result) return result.payment_token;
  throw new Error(result.error_description || "Cartão recusado. Confira os dados.");
}
