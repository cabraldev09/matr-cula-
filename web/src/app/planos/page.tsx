import type { Metadata } from "next";
import { getSessionContext } from "@/lib/session";
import { SiteHeader } from "@/features/marketing/site-header";
import { PublicPlans } from "@/features/marketing/public-plans";

export const metadata: Metadata = { title: "Planos" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const context = await getSessionContext();
  return (
    <div className="min-h-screen bg-[#f7faff]">
      <SiteHeader loggedIn={Boolean(context)} />
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Planos</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Cada empresa começa com um espaço vazio e só seu. Teste grátis, escolha os módulos e pague por boleto, Pix ou cartão. Troque de plano ou cancele quando quiser.
        </p>
        <div className="mt-10"><PublicPlans /></div>
      </main>
    </div>
  );
}
