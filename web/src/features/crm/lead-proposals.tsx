"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Course, Lead } from "@/features/crm/labels";
import { ChargeSection, ProposalList } from "@/features/crm/lead-charges";
import { ProposalForm } from "@/features/crm/lead-proposal-form";
import type { ChargeRow, ProposalRow } from "@/features/crm/lead-types";
import { useVisiblePolling } from "@/features/crm/use-visible-polling";

/** Aba "Proposta e taxa": busca propostas e cobranças e as atualiza sozinha (o pagamento Efí chega por webhook). */
export function ProposalTab({ lead, courses, organizationId, enrollmentFeeCents, efiConfigured, pixConfigured, defaultStartTerm, onChanged }: {
  lead: Lead;
  courses: Course[];
  organizationId: string;
  enrollmentFeeCents: number;
  efiConfigured: boolean;
  pixConfigured: boolean;
  defaultStartTerm: string;
  onChanged: () => void;
}) {
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

  return (
    <div className="space-y-6">
      <ProposalForm lead={lead} courses={courses} defaultStartTerm={defaultStartTerm} onCreated={refresh} />
      <ProposalList proposals={proposals} />
      <ChargeSection leadId={lead.id} proposals={proposals} charges={charges} enrollmentFeeCents={enrollmentFeeCents} efiConfigured={efiConfigured} pixConfigured={pixConfigured} onChanged={refresh} />
    </div>
  );
}
