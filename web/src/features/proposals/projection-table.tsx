import { money, percent, visibleProjection, type ProposalDocument } from "@/domain/proposal/document";

/** Projeção de mensalidade por semestre (cenários de reajuste mínimo e máximo), igual na página pública, no editor e no PDF. */
export function ProjectionTable({ doc }: { doc: ProposalDocument }) {
  const { rules } = doc;
  return (
    <div className="mt-2 overflow-x-auto rounded-md ring-1 ring-slate-200">
        <table className="w-full min-w-[760px] text-right text-[13px]">
          <thead className="bg-slate-50 text-[12px] font-semibold text-[#1d63c9]">
            <tr>
              <th className="px-2 py-1.5 text-left">Sem.</th>
              <th className="px-2 py-1.5 text-left">Período</th>
              <th className="px-2 py-1.5">Bolsa</th>
              <th className="px-2 py-1.5">Ajuste bolsa</th>
              <th className="px-2 py-1.5">Reajuste semestral</th>
              <th className="px-2 py-1.5">Anual {rules.annualMinPct}%</th>
              <th className="px-2 py-1.5">Ajustes totais {rules.annualMinPct}%</th>
              <th className="px-2 py-1.5">Mensalidade {rules.annualMinPct}%</th>
              <th className="px-2 py-1.5">Anual {rules.annualMaxPct}%</th>
              <th className="px-2 py-1.5">Ajustes totais {rules.annualMaxPct}%</th>
              <th className="px-2 py-1.5">Mensalidade {rules.annualMaxPct}%</th>
              <th className="px-2 py-1.5">Diferença/mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleProjection(doc).map((r) => (
              <tr key={r.index} className="[&>td]:border-r [&>td]:border-slate-200 [&>td]:px-2 [&>td]:py-1.5">
                <td className="text-left">{r.index}</td>
                <td className="text-left">{r.term}</td>
                <td>{percent(r.scholarshipPct)}</td>
                <td>{percent(r.scholarshipAdjustPct)}</td>
                <td>{percent(r.semesterReadjustPct)}</td>
                <td>{percent(r.annualMinPct)}</td>
                <td>{percent(r.totalMinPct)}</td>
                <td className="font-semibold text-[#1d63c9]">{money(r.monthlyMin)}</td>
                <td>{percent(r.annualMaxPct)}</td>
                <td>{percent(r.totalMaxPct)}</td>
                <td className="font-semibold text-[#1d63c9]">{money(r.monthlyMax)}</td>
                <td>{r.differencePerMonth === null ? "-" : money(r.differencePerMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
