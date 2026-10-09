"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/features/crm/labels";
import { ChargeSection, ProposalList } from "@/features/crm/lead-charges";
import type { ChargeRow, ProposalRow } from "@/features/crm/lead-types";
import { useVisiblePolling } from "@/features/crm/use-visible-polling";

/** Propostas e cobranças do lead, atualizadas sozinhas (o pagamento Efí chega por webhook). */
function useLeadMoney(lead: Lead, organizationId: string, onChanged: () => void) {
  const supabase = useMemo(() => createClient(), []);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from("proposals").select("id, number, public_token, course_name, first_monthly_cents, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }),
      supabase.from("enrollment_charges").select("id, method, status, amount_cents, payment_url, pix_payload, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }),
    ]);
    setProposals((p.data ?? []) as ProposalRow[]);
    setCharges((c.data ?? []) as ChargeRow[]);
  }, [supabase, organizationId, lead.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, lead.updated_at]);
  useVisiblePolling(load, 8_000);

  const refresh = useCallback(() => {
    load();
    onChanged();
  }, [load, onChanged]);
  return { proposals, charges, refresh };
}

/** Aba "Proposta de bolsa": a montagem acontece em uma tela própria; aqui ficam as versões salvas. */
export function ProposalsPanel({ lead, organizationId, onChanged }: { lead: Lead; organizationId: string; onChanged: () => void }) {
  const { proposals, refresh } = useLeadMoney(lead, organizationId, onChanged);
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border p-4">
        <h3 className="font-semibold">Proposta de bolsa</h3>
        <p className="text-sm text-muted-foreground">
          Monte a proposta deste lead em uma tela própria: escolha o curso, ajuste bolsa, valores e projeção, salve, gere o PDF ou envie no WhatsApp.
          {lead.proposals ? ` A última foi a nº ${lead.proposals.number}.` : ""}
        </p>
        <Button asChild><Link href={`/crm/leads/${lead.id}/proposta`}><FileText className="size-4" /> {proposals.length > 0 ? "Montar nova proposta" : "Montar proposta"}</Link></Button>
      </section>
      <ProposalList proposals={proposals} onSent={refresh} />
    </div>
  );
}

/** Aba "Matrículas e pagamentos": taxa de matrícula por link Efí ou Pix, e a confirmação do recebimento. */
export function PaymentsPanel({ lead, organizationId, enrollmentFeeCents, efiConfigured, pixConfigured, onChanged }: {
  lead: Lead;
  organizationId: string;
  enrollmentFeeCents: number;
  efiConfigured: boolean;
  pixConfigured: boolean;
  onChanged: () => void;
}) {
  const { proposals, charges, refresh } = useLeadMoney(lead, organizationId, onChanged);
  return <ChargeSection leadId={lead.id} proposals={proposals} charges={charges} enrollmentFeeCents={enrollmentFeeCents} efiConfigured={efiConfigured} pixConfigured={pixConfigured} onChanged={refresh} />;
}
