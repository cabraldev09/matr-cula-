import { DEFAULT_PUNCTUALITY_NOTE, formatIsoDay, money, percent2, type ProposalDocument } from "@/domain/proposal/document";
import { formatDateTime } from "@/lib/time";
import { proposalLogoUrl } from "@/features/proposals/settings";
import { ProjectionTable } from "@/features/proposals/projection-table";

/** A proposta em HTML (página pública e prévia), no mesmo layout do PDF. */
export function ProposalView({ doc }: { doc: ProposalDocument }) {
  const { pricing, rules } = doc;
  const firstDue = formatIsoDay(doc.firstPaymentDate);
  const logo = proposalLogoUrl(doc.logo);
  return (
    <article className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-5 text-[#1f2328] shadow-sm ring-1 ring-slate-200 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo da instituição, proporção livre */}
        {logo ? <img src={logo} alt={doc.institutionName} className="h-12 w-auto max-w-[220px] object-contain" /> : <span />}
        <div className="text-right text-sm">
          <p className="font-semibold">{doc.institutionName}</p>
          {doc.institutionDocument && <p className="text-slate-600">CNPJ {doc.institutionDocument}</p>}
        </div>
      </header>
      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Proposta de Bolsa - {doc.courseName}</h1>
      <p className="mt-1 text-sm text-slate-600">Semestres: {doc.semesters}</p>
      <p className="text-sm text-slate-600">Proposta destinada a <strong className="text-slate-900">{doc.studentName}</strong></p>
      <p className="mt-2 text-sm text-slate-600">Documento gerado em {formatDateTime(doc.generatedAt).replace(",", "")}</p>

      <dl className="mt-5 space-y-1 text-[15px]">
        <div><dt className="inline font-bold">Mensalidade bruta atual:</dt> <dd className="inline">{money(pricing.grossMonthly)}</dd></div>
        <div><dt className="inline font-bold">Bolsa aplicada:</dt> <dd className="inline">{percent2(pricing.scholarshipPct)} <span className="text-xs text-slate-500">(Descontos de pontualidade, desconto de ingressante, campanha comercial etc.)</span></dd></div>
        <div className="pb-2"><dt className="inline font-bold">Primeira Mensalidade:</dt> <dd className="inline">{money(pricing.firstMonthly)}{firstDue && <span className="text-xs text-slate-500"> (vencimento em {firstDue})</span>}</dd></div>
        <div><dt className="inline font-bold">Taxa de matrícula:</dt> <dd className="inline">{money(pricing.enrollmentFee)} <span className="text-xs text-slate-500">(no ato da inscrição)</span></dd></div>
        <div><dt className="inline font-bold">Demais mensalidades:</dt> <dd className="inline">todo dia {rules.dueDay}</dd></div>
        <div><dt className="inline font-bold">Quantidade de parcelas desse semestre:</dt> <dd className="inline">{rules.firstTermInstallments}</dd></div>
      </dl>

      <h2 className="mt-6 text-lg font-bold">2ª mensalidade em diante. (Pontualidade já inclusa de {rules.punctualityPct}%).</h2>
      <ul className="mt-2 space-y-1 text-[15px]">
        <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" /><span><strong>Até o dia {rules.dueDay}:</strong> {money(pricing.untilDue)} <span className="text-xs text-slate-500">(com desconto de pontualidade de {rules.punctualityPct}%)</span></span></li>
        <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" /><span><strong>Dias {rules.dueDay + 1} a 25:</strong> {money(pricing.lateTier1)} <span className="text-xs text-slate-500">(Perde desconto de pontualidade de {rules.lateTier1Pct}%.)</span></span></li>
        <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" /><span><strong>Após o vencimento:</strong> {money(pricing.lateTier2)} <span className="text-xs text-slate-500">(Perde desconto de pontualidade de {rules.lateTier2Pct}%.)</span></span></li>
      </ul>
      <p className="mt-3 text-base italic">{doc.punctualityNote ?? DEFAULT_PUNCTUALITY_NOTE}</p>

      <h2 className="mt-6 text-lg font-bold">Projeção por semestre</h2>
      <p className="mt-1 rounded-xl bg-sky-50 px-3 py-1.5 text-xs text-slate-700">{doc.projectionNote}</p>
      <ProjectionTable doc={doc} />

      <h2 className="mt-6 text-lg font-bold">Produtos ou serviços</h2>
      <div className="mt-2 grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b pb-2 text-xs uppercase tracking-wider text-slate-500">
        <span>Produto</span><span>Preço</span><span>Desconto</span><span className="text-right">Sub-total</span>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 py-2 text-[15px]">
        <span><strong className="block">{doc.courseName}</strong><span className="text-sm text-slate-500">{doc.modality}</span></span>
        <span>{money(pricing.grossMonthly)}</span>
        <span>{percent2(pricing.scholarshipPct)}</span>
        <span className="text-right">{money(pricing.firstMonthly)}</span>
      </div>
      <p className="flex justify-between rounded-xl bg-emerald-50 px-3 py-2 font-semibold"><span>Valor total do pedido</span><span>{money(pricing.firstMonthly)}</span></p>

      <h2 className="mt-6 text-lg font-bold">Mensagem final</h2>
      <p className="mt-2 text-[15px]">{doc.finalMessage}</p>
    </article>
  );
}
