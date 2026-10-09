import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyBRL } from "@/lib/utils";

const LIMIT_LABELS: Record<string, [string, string]> = {
  users: ["usuário", "usuários"],
  channels: ["canal", "canais"],
  analyses: ["análise por mês", "análises por mês"],
  ai_credits: ["crédito de IA por mês", "créditos de IA por mês"],
};

/** Planos públicos e ativos, lidos com a chave publishable (RLS libera só estes). */
export async function PublicPlans() {
  const supabase = await createClient();
  const [{ data: plans }, { data: modules }] = await Promise.all([
    supabase.from("plans").select("code, name, description, price_cents, billing_interval, modules, limits, trial_days").order("sort_order"),
    supabase.from("modules").select("code, name"),
  ]);
  const names = new Map((modules ?? []).map((m) => [m.code as string, m.name as string]));
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {(plans ?? []).map((plan, index) => (
        <article
          key={plan.code}
          className={`flex flex-col rounded-3xl border bg-white p-7 shadow-sm ${index === (plans?.length ?? 0) - 1 ? "border-brand-cyan ring-2 ring-brand-cyan/30" : "border-slate-200"}`}
        >
          <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
          <p className="mt-1 min-h-10 text-sm text-slate-500">{plan.description}</p>
          <p className="mt-6">
            <span className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatCurrencyBRL(plan.price_cents / 100)}</span>
            <span className="text-sm text-slate-500">/{plan.billing_interval === "year" ? "ano" : "mês"}</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2 text-sm text-slate-700">
            {(plan.modules as string[]).map((code) => (
              <li key={code} className="flex items-center gap-2"><Check className="size-4 text-brand-cyan" /> {names.get(code) ?? code}</li>
            ))}
            {Object.entries(plan.limits as Record<string, number>).map(([key, value]) => (
              <li key={key} className="flex items-center gap-2 text-slate-500">
                <span className="size-4" /> {value === 1 ? `1 ${LIMIT_LABELS[key]?.[0] ?? key}` : `Até ${value} ${LIMIT_LABELS[key]?.[1] ?? key}`}
              </li>
            ))}
          </ul>
          <Link href="/cadastro" className="mt-8 rounded-xl bg-brand-navy px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-navy-700">
            {plan.trial_days > 0 ? `Testar grátis por ${plan.trial_days} dias` : "Começar agora"}
          </Link>
        </article>
      ))}
    </div>
  );
}
