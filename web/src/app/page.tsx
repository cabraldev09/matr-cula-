import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileSearch, GraduationCap, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import { getSessionContext } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { SiteHeader } from "@/features/marketing/site-header";
import { PublicPlans } from "@/features/marketing/public-plans";

export const metadata: Metadata = { title: { absolute: `${BRAND.name} · ${BRAND.tagline}` } };
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: MessagesSquare, title: "Atendimento em equipe", text: "Caixa de entrada compartilhada, departamentos, respostas rápidas, notas internas e anexos privados." },
  { icon: FileSearch, title: "Análise curricular", text: "Envie o histórico em PDF e receba grade, dispensas, pendências e previsão de conclusão, conferidas por regras e por IA." },
  { icon: GraduationCap, title: "Portal do aluno", text: "Cada aluno acompanha a própria análise e envia documentos pelo endereço da sua instituição." },
  { icon: BarChart3, title: "Relatórios", text: "Tempo de primeira resposta, conversas por atendente, análises por curso e conversão em matrícula." },
  { icon: Users, title: "Sua equipe, suas regras", text: "Convide pessoas, defina papéis e departamentos. Cada empresa tem um espaço só seu." },
  { icon: ShieldCheck, title: "Dados isolados", text: "Uma empresa nunca vê dados de outra: o próprio banco de dados impõe essa separação." },
];

export default async function LandingPage() {
  const context = await getSessionContext();
  return (
    <div className="min-h-screen bg-[#f7faff]">
      <SiteHeader loggedIn={Boolean(context)} />
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,rgba(56,182,245,.45),transparent_55%),radial-gradient(ellipse_at_0%_100%,rgba(254,248,76,.12),transparent_50%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pb-28 lg:pt-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gold">Para escolas, polos e equipes de matrícula</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Atenda, analise o histórico e matricule. Tudo no mesmo sistema.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/80 sm:text-lg">
              {BRAND.name} junta o atendimento da equipe e a análise curricular automática para você responder rápido e mostrar ao candidato quanto falta para se formar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/cadastro" className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-navy shadow-lg">Testar grátis</Link>
              <Link href="/planos" className="rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">Ver planos</Link>
            </div>
          </div>
          <div aria-hidden="true" className="relative hidden lg:block">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur">
              <div className="rounded-2xl bg-white p-4 text-slate-800">
                <div className="flex items-center justify-between text-sm"><span className="font-semibold">Maria Souza</span><span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">Em atendimento</span></div>
                <p className="mt-3 max-w-[80%] rounded-2xl bg-slate-100 px-3 py-2 text-sm">Oi! Já fiz parte do curso em outra faculdade. Quanto tempo falta?</p>
                <p className="ml-auto mt-2 max-w-[80%] rounded-2xl bg-sky-50 px-3 py-2 text-sm">Analisei seu histórico: 14 disciplinas dispensadas. Previsão de conclusão: 2028.1 🎓</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-white">
                <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-semibold">14</p><p className="text-xs text-white/70">dispensadas</p></div>
                <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-semibold">22</p><p className="text-xs text-white/70">pendentes</p></div>
                <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-semibold">2028.1</p><p className="text-xs text-white/70">conclusão</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Icon className="size-6 text-brand-cyan" />
              <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Planos</h2>
        <p className="mt-2 text-slate-600">Contrate só o que precisa. Troque de plano ou cancele quando quiser.</p>
        <div className="mt-8"><PublicPlans /></div>
      </section>
      <footer className="border-t bg-white py-8 text-center text-sm text-slate-500">
        © {BRAND.name}{BRAND.supportEmail ? ` · ${BRAND.supportEmail}` : ""}
      </footer>
    </div>
  );
}
