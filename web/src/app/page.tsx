import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2 } from "lucide-react";
import {
  ChannelsIcon, FrameIcon, FunnelIcon, PixIcon, PlatformIcon, ProposalIcon, ReportsIcon, SentIcon, StepsIcon,
  TeamsIcon, TemperatureIcon, WindowIcon, type IconComponent,
} from "@/components/icons";
import { getSessionContext } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { SiteHeader } from "@/features/marketing/site-header";
import { PublicPlans } from "@/features/marketing/public-plans";
import { BrowserFrame, Counter, FeatureTabs, Reveal, type FeatureTab } from "@/features/marketing/effects";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} · CRM de matrículas para polos de ensino superior` },
  description: "Lead do WhatsApp direto no funil, proposta de bolsa em PDF, taxa de matrícula por Pix ou link e análise curricular no mesmo sistema.",
};
export const dynamic = "force-dynamic";

const CHANNELS = [
  { icon: ChannelsIcon, title: "WhatsApp oficial", text: "Conecte o número do polo pela API oficial da Meta. Cada mensagem nova vira lead no funil na mesma hora.", tone: "bg-emerald-50 text-emerald-600" },
  { icon: WindowIcon, title: "Cadastro pela equipe", text: "Lead que chegou por telefone, indicação ou visita? A consultora cadastra em segundos e ele entra no mesmo funil.", tone: "bg-sky-50 text-sky-600" },
  { icon: FrameIcon, title: "Instagram Direct", text: "Em breve: mensagens do Instagram do polo no mesmo funil de matrículas.", tone: "bg-pink-50 text-pink-600", soon: true },
];

const FEATURES: FeatureTab[] = [
  { title: "CRM de matrículas", text: "Funil em colunas do primeiro contato até a matrícula. O curso de interesse é reconhecido na mensagem e cada lead recebe uma nota de 0 a 100: quente, morno ou frio.", image: "/site/crm.webp", alt: "Funil de matrículas com leads por etapa" },
  { title: "Proposta de bolsa em PDF", text: "Escolha o curso e a bolsa: a proposta sai com faixas de pontualidade e projeção de mensalidade por semestre, com a logo do seu polo. Envie o link pelo WhatsApp.", image: "/site/proposta.webp", alt: "Proposta de bolsa com projeção por semestre" },
  { title: "Taxa de matrícula", text: "Cobre a taxa por Pix copia-e-cola com a chave do polo ou por link de pagamento Efí (Pix, boleto e cartão). Pagamento confirmado move o lead para \"Taxa paga\".", image: "/site/crm-lead.webp", alt: "Painel do lead com proposta e cobrança da taxa" },
  { title: "Atendimento em equipe", text: "Caixa de entrada compartilhada, departamentos, respostas rápidas, notas internas e anexos. Na conversa você já vê a etapa e a temperatura do lead.", image: "/site/atendimento.webp", alt: "Caixa de entrada com conversa do WhatsApp" },
  { title: "Relatórios de gestão", text: "Leads por etapa, curso e origem, conversão em taxa paga, taxas recebidas e tempo de primeira resposta da equipe.", image: "/site/relatorios.webp", alt: "Relatórios do funil e do atendimento" },
];

const MARQUEE = ["Funil kanban", "Lead automático do WhatsApp", "Proposta de bolsa em PDF", "Pix copia-e-cola", "Link de pagamento Efí", "Análise de histórico escolar", "Portal do aluno", "Grades comerciais", "Respostas rápidas", "Relatórios de conversão", "Equipe com papéis", "Dados isolados por polo"];

const NUMBERS = [
  { value: 8, suffix: " etapas", label: "no funil, do novo lead à matrícula" },
  { value: 3, suffix: " formas", label: "de pagar a taxa: Pix, boleto ou cartão" },
  { value: 100, suffix: "%", label: "dos dados separados por polo, garantido pelo banco" },
  { value: 7, suffix: " dias", label: "de teste grátis, sem cartão" },
];

const FAQ = [
  ["Preciso instalar alguma coisa?", "Não. O sistema roda no navegador, no computador ou no celular. Você cria a conta, escolhe o plano e já começa com um espaço vazio e só seu."],
  ["Como o lead entra no CRM?", "Assim que alguém manda mensagem para o WhatsApp do polo, o contato vira um lead na coluna \"Novo lead\". Se o curso aparece na mensagem, ele já fica marcado."],
  ["A proposta de bolsa segue o modelo da instituição?", "Sim. Os valores vêm da sua tabela de cursos e as regras (pontualidade, bolsa por semestre, reajustes) são editáveis. O PDF sai com a logo que você escolher."],
  ["Para onde vai o dinheiro da taxa de matrícula?", "Direto para a conta do polo. Pelo Pix copia-e-cola a equipe confirma o recebimento; pelo link Efí a confirmação é automática."],
  ["Posso usar a logo da Cruzeiro do Sul na proposta?", "Polos parceiros autorizados encontram o modelo pronto nas configurações. Também é possível enviar a sua própria logo."],
  ["Consigo trocar de plano ou cancelar?", "Sim, a qualquer momento, pela área Plano e faturas. O pagamento da assinatura é por boleto, Pix ou cartão."],
];

export default async function LandingPage() {
  const context = await getSessionContext();
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7faff] text-slate-900">
      <SiteHeader loggedIn={Boolean(context)} />

      {/* Hero */}
      <section className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_85%_10%,rgba(56,182,245,.22),transparent_55%),radial-gradient(ellipse_at_5%_60%,rgba(254,248,76,.18),transparent_45%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-14 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:pt-20">
          <div className="animate-blur-fade">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-white px-3 py-1 text-xs font-semibold text-brand-navy shadow-sm">
              <StepsIcon className="size-4 text-brand-cyan" /> Feito para polos de ensino superior
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-brand-navy sm:text-6xl">
              Do primeiro “oi”
              <span className="mx-1 inline-block -rotate-1 rounded-2xl bg-brand-cyan px-3 py-0.5 text-white shadow-lg shadow-brand-cyan/30 sm:mx-2">à matrícula</span>
              no mesmo sistema
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              CRM de matrículas com WhatsApp: o lead entra no funil na hora, recebe a proposta de bolsa em PDF e paga a taxa de matrícula por Pix ou link.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/cadastro" className="group inline-flex items-center gap-2 rounded-full bg-brand-navy px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-navy/25 transition-transform hover:-translate-y-0.5">
                Testar grátis <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/planos" className="rounded-full px-5 py-3 text-sm font-semibold text-brand-navy hover:bg-white">Ver planos</Link>
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><BadgeCheck className="size-4 text-emerald-500" /> 7 dias grátis, sem cartão</span>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto hidden h-[22rem] w-full max-w-md lg:block">
            {/* Recortes das telas reais (geradas por scripts/site-screenshots.mjs): funil e painel do lead. */}
            <div className="absolute left-0 top-0 h-48 w-[80%] -rotate-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
              {/* eslint-disable-next-line @next/next/no-img-element -- captura estática */}
              <img src="/site/crm.webp" alt="" width={1600} height={1000} className="block max-w-none" style={{ width: "245%", marginLeft: "-49%", marginTop: "-217px" }} />
            </div>
            <div className="absolute right-0 top-24 h-64 w-[58%] rotate-[1.5deg] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25">
              {/* eslint-disable-next-line @next/next/no-img-element -- captura estática */}
              <img src="/site/crm-lead.webp" alt="" width={1600} height={1000} className="block max-w-none" style={{ width: "377%", marginLeft: "-277%" }} />
            </div>
            <div className="absolute bottom-6 left-2 flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-orange-700 shadow-lg">
              <TemperatureIcon level="quente" className="size-5" /> Lead quente · 75
            </div>
            <div className="absolute -bottom-2 right-8 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-lg">
              <SentIcon className="size-4" /> Taxa paga · R$ 99,00
            </div>
          </div>
        </div>
        {/* Tela do produto sobre faixa colorida */}
        <div className="relative mt-6">
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-b from-brand-navy-50 to-[#dceefe]" />
          <Reveal className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <BrowserFrame>
              {/* eslint-disable-next-line @next/next/no-img-element -- captura estática gerada por script */}
              <img src="/site/crm.webp" alt="Funil de matrículas do Matrícula+ com leads por etapa" width={1600} height={1000} className="block h-auto w-full" />
            </BrowserFrame>
            <span className="absolute -left-1 top-1/3 hidden items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-xl sm:inline-flex">
              <TemperatureIcon level="morno" className="size-4 text-brand-gold" /> Lead qualificado automaticamente
            </span>
          </Reveal>
        </div>
      </section>

      {/* Faixa de recursos */}
      <div className="border-y border-slate-200 bg-white py-4" aria-label="Recursos">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <ul className="flex w-max shrink-0 animate-marquee gap-10 pr-10 text-sm font-semibold text-slate-500">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <li key={i} aria-hidden={i >= MARQUEE.length} className="flex items-center gap-2 whitespace-nowrap"><span className="size-1.5 rounded-full bg-brand-cyan" /> {item}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Canais */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">Sua equipe e seus leads, finalmente no mesmo lugar</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Chega de lead perdido no celular da consultora. Toda conversa fica no sistema do polo, com histórico, responsável e etapa.</p>
        </Reveal>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <Reveal className="relative order-2 lg:order-1">
            <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-emerald-100 via-sky-100 to-transparent blur-xl" />
            <BrowserFrame>
              {/* eslint-disable-next-line @next/next/no-img-element -- captura estática gerada por script */}
              <img src="/site/atendimento.webp" alt="Conversa do WhatsApp com a etapa do lead" width={1600} height={1000} loading="lazy" className="block h-auto w-full" />
            </BrowserFrame>
          </Reveal>
          <ul className="order-1 space-y-4 lg:order-2">
            {CHANNELS.map(({ icon: Icon, title, text, tone, soon }, i) => (
              <Reveal as="li" key={title} delay={i * 120} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="size-6" /></span>
                <span>
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    {title} {soon && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">em breve</span>}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">{text}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* O que fazemos */}
      <section id="solucoes" className="scroll-mt-20 bg-gradient-to-b from-white to-[#eef6ff] py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-brand-cyan">O que fazemos</p>
            <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">Tudo o que a equipe de matrícula precisa, sem planilha</h2>
          </Reveal>
          <Reveal className="mt-12"><FeatureTabs items={FEATURES} /></Reveal>
        </div>
      </section>

      {/* Faixa WhatsApp oficial */}
      <section className="px-4 py-16 sm:px-6">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-navy px-6 py-12 text-white sm:px-12">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_0%,rgba(56,182,245,.55),transparent_50%),radial-gradient(ellipse_at_0%_100%,rgba(254,248,76,.18),transparent_45%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">WhatsApp oficial para o seu polo</h2>
              <p className="mt-3 max-w-xl text-white/80">Conecte o número pela API oficial da Meta: mais estabilidade, vários atendentes no mesmo número e mensagens registradas no sistema.</p>
              <Link href="/cadastro" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-navy shadow-lg transition-transform hover:-translate-y-0.5">
                Começar agora <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="grid gap-3 text-sm">
              {["Vários atendentes no mesmo número", "Lead criado a cada nova conversa", "Respostas rápidas e notas internas", "Proposta enviada pelo próprio chat"].map((item) => (
                <li key={item} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 backdrop-blur"><CheckCircle2 className="size-4 text-brand-gold" /> {item}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* Números */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((n, i) => (
            <Reveal key={n.label} delay={i * 100} className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-4xl font-bold tracking-tight text-brand-navy"><Counter value={n.value} suffix={n.suffix} /></p>
              <p className="mt-2 text-sm text-slate-600">{n.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Feito para polos */}
      <section id="polos" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-cyan">Feito para polos</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">A proposta de bolsa que o aluno entende, pronta em segundos</h2>
            <p className="mt-4 text-slate-600">Cadastre a tabela de cursos do polo uma vez. Depois é só escolher o curso: mensalidade, bolsa, pontualidade e projeção por semestre saem calculadas, no padrão da instituição.</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                [ProposalIcon, "PDF e link público com a logo do polo"],
                [FunnelIcon, "Lead vai para \"Proposta enviada\" sozinho"],
                [PixIcon, "Taxa de matrícula por Pix ou link de pagamento"],
                [ReportsIcon, "Análise curricular para quem já estudou: dispensas e previsão de conclusão"],
                [TeamsIcon, "Cada polo com sua equipe, sua conta e seus dados"],
                [PlatformIcon, "Um polo nunca vê os dados de outro"],
              ].map(([Icon, text]) => {
                const I = Icon as IconComponent;
                return <li key={text as string} className="flex items-start gap-3"><I className="mt-0.5 size-5 shrink-0 text-brand-cyan" /> {text as string}</li>;
              })}
            </ul>
          </Reveal>
          <Reveal delay={150} className="relative">
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rotate-2 rounded-[2.5rem] bg-gradient-to-br from-brand-gold/30 via-sky-100 to-brand-cyan/20" />
            <BrowserFrame>
              {/* eslint-disable-next-line @next/next/no-img-element -- captura estática gerada por script */}
              <img src="/site/proposta.webp" alt="Proposta de bolsa aberta pelo aluno" width={1600} height={1000} loading="lazy" className="block h-auto w-full" />
            </BrowserFrame>
          </Reveal>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">Planos para cada tamanho de polo</h2>
            <p className="mt-3 text-center text-slate-600">Contrate só o que precisa. Troque de plano ou cancele quando quiser.</p>
          </Reveal>
          <div className="mt-10"><PublicPlans /></div>
        </div>
      </section>

      {/* Dúvidas */}
      <section id="duvidas" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Reveal><h2 className="text-center text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">Tire suas dúvidas sobre o {BRAND.name}</h2></Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map(([question, answer], i) => (
            <Reveal key={question} delay={i * 60}>
              <details className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  {question}
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition-transform group-open:rotate-45 group-open:bg-brand-cyan group-open:text-white">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 pb-20 sm:px-6">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-r from-brand-navy to-[#0a6db8] px-6 py-14 text-center text-white sm:px-12">
          <div aria-hidden="true" className="absolute -right-20 -top-20 size-72 rounded-full bg-brand-cyan/40 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Pronto para matricular mais neste semestre?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">Crie a conta do seu polo, importe a tabela de cursos e receba o primeiro lead hoje.</p>
          <Link href="/cadastro" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-brand-navy shadow-lg transition-transform hover:-translate-y-0.5">
            Testar grátis por 7 dias <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} {BRAND.name}{BRAND.supportEmail ? ` · ${BRAND.supportEmail}` : ""}</p>
          <nav aria-label="Rodapé" className="flex gap-4">
            <Link href="/planos" className="hover:text-brand-navy">Planos</Link>
            <Link href="/login" className="hover:text-brand-navy">Entrar</Link>
            <Link href="/cadastro" className="hover:text-brand-navy">Criar conta</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
