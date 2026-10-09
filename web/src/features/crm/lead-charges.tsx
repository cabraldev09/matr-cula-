"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, ExternalLink, FileDown, QrCode, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/domain/proposal/document";
import { confirmChargeAction, createEnrollmentChargeAction, sendProposalWhatsappAction, type ChargeResult } from "@/features/crm/actions";
import type { ChargeRow, ProposalRow } from "@/features/crm/lead-types";
import { formatDateTime } from "@/lib/utils";

const copy = (text: string, message: string) => navigator.clipboard.writeText(text).then(() => toast.success(message));

export function ProposalList({ proposals, onSent }: { proposals: ProposalRow[]; onSent?: () => void }) {
  const [pending, start] = useTransition();
  if (proposals.length === 0) return null;
  function send(proposalId: string) {
    start(async () => {
      const result = await sendProposalWhatsappAction({ proposalId, paymentUrl: null, pixPayload: null });
      if (result.ok) {
        toast.success(result.message);
        onSent?.();
      } else toast.error(result.error);
    });
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Propostas</h3>
      <ul className="divide-y rounded-2xl border">
        {proposals.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>
              <strong>Nº {p.number}</strong> · {p.course_name} · {money(p.first_monthly_cents / 100)}
              <span className="block text-xs text-muted-foreground">{formatDateTime(p.created_at)}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              <Button asChild size="sm" variant="ghost"><a href={`/proposta/${p.public_token}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir</a></Button>
              <Button asChild size="sm" variant="ghost"><a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="size-4" /> PDF</a></Button>
              <Button size="sm" variant="ghost" onClick={() => copy(`${window.location.origin}/proposta/${p.public_token}`, "Link copiado.")}><Copy className="size-4" /> Link</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => send(p.id)}><Send className="size-4" /> WhatsApp</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cobrança da taxa de matrícula: link Efí ou Pix, com a confirmação do Pix manual em diálogo. */
export function ChargeSection({ leadId, proposals, charges, enrollmentFeeCents, efiConfigured, pixConfigured, onChanged }: {
  leadId: string;
  proposals: ProposalRow[];
  charges: ChargeRow[];
  enrollmentFeeCents: number;
  efiConfigured: boolean;
  pixConfigured: boolean;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [lastCharge, setLastCharge] = useState<ChargeResult | null>(null);
  const [confirming, setConfirming] = useState<ChargeRow | null>(null);
  const latest = proposals[0];

  function charge(method: "efi_link" | "pix_manual") {
    start(async () => {
      const result = await createEnrollmentChargeAction({ leadId, proposalId: latest?.id ?? null, method });
      if (result.ok) {
        toast.success(result.message);
        setLastCharge(result.data);
        onChanged();
      } else toast.error(result.error);
    });
  }

  function send(proposalId: string) {
    start(async () => {
      const result = await sendProposalWhatsappAction({ proposalId, paymentUrl: lastCharge?.paymentUrl ?? null, pixPayload: lastCharge?.pixPayload ?? null });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function confirm(row: ChargeRow) {
    setConfirming(null);
    start(async () => {
      const result = await confirmChargeAction(row.id);
      if (result.ok) {
        toast.success(result.message);
        onChanged();
      } else toast.error(result.error);
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h3 className="font-semibold">Taxa de matrícula · {money(enrollmentFeeCents / 100)}</h3>
      <p className="text-xs text-muted-foreground">O valor vai para a conta do polo. Pelo link Efí a confirmação é automática; pelo Pix, confirme quando o dinheiro entrar.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !efiConfigured} onClick={() => charge("efi_link")}><Wallet className="size-4" /> Gerar link de pagamento</Button>
        <Button variant="outline" disabled={pending || !pixConfigured} onClick={() => charge("pix_manual")}><QrCode className="size-4" /> Gerar Pix</Button>
      </div>
      {(!efiConfigured || !pixConfigured) && (
        <p className="text-xs text-muted-foreground">
          {!efiConfigured && "Link Efí indisponível: o proprietário conecta a conta em CRM → Proposta e pagamentos. "}
          {!pixConfigured && "Pix indisponível: cadastre a chave Pix do polo em CRM → Proposta e pagamentos."}
        </p>
      )}
      {lastCharge && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
          {lastCharge.paymentUrl && (
            <p className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all">{lastCharge.paymentUrl}</span><Button size="sm" variant="outline" onClick={() => copy(lastCharge.paymentUrl!, "Link copiado.")}><Copy className="size-4" /> Copiar</Button></p>
          )}
          {lastCharge.pixPayload && (
            <p className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all font-mono text-[11px]">{lastCharge.pixPayload}</span><Button size="sm" variant="outline" onClick={() => copy(lastCharge.pixPayload!, "Código Pix copiado.")}><Copy className="size-4" /> Copiar</Button></p>
          )}
          {latest && <Button size="sm" disabled={pending} onClick={() => send(latest.id)}><Send className="size-4" /> Enviar proposta e cobrança no WhatsApp</Button>}
        </div>
      )}
      {charges.length > 0 && (
        <ul className="divide-y rounded-xl border text-sm">
          {charges.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                {c.method === "efi_link" ? "Link Efí" : "Pix"} · {money(c.amount_cents / 100)}
                <span className="block text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
              </span>
              {c.status === "paid" ? (
                <Badge className="bg-status-success text-white"><CheckCircle2 className="size-3" /> Pago</Badge>
              ) : c.status === "canceled" ? (
                <Badge variant="outline">Cancelada</Badge>
              ) : c.method === "pix_manual" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(c)}>Marcar como pago</Button>
              ) : (
                <Badge variant="secondary">Aguardando pagamento</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar o pagamento da taxa?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme só se o Pix de {confirming ? money(confirming.amount_cents / 100) : ""} já entrou na conta do polo. O lead passa para Taxa paga e a confirmação não pode ser desfeita aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não entrou</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && confirm(confirming)}>Sim, já entrou</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
