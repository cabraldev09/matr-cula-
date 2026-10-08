import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/domain/proposal/document";
import { loadOpenCharge, loadProposalByToken } from "@/features/proposals/load";
import { ProposalView } from "@/features/proposals/proposal-view";
import { PixBox } from "@/features/proposals/pix-box";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposta de bolsa", robots: { index: false, follow: false } };

/** Página que o aluno recebe: proposta completa, PDF e pagamento da taxa de matrícula. */
export default async function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();
  const charge = await loadOpenCharge(proposal.id);
  const qrSvg = charge?.method === "pix_manual" && charge.pix_payload && charge.status === "pending" ? await QRCode.toString(charge.pix_payload, { type: "svg", margin: 0 }) : null;
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Proposta nº {proposal.number}</p>
        <Button asChild variant="outline" size="sm">
          <a href={`/proposta/${token}/pdf`} target="_blank" rel="noreferrer"><Download className="size-4" /> Baixar PDF</a>
        </Button>
      </div>
      {charge && (
        <section className="mx-auto mb-4 max-w-4xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Taxa de matrícula · {money(charge.amount_cents / 100)}</h2>
          {charge.status === "paid" ? (
            <p className="mt-2 flex items-center gap-2 text-emerald-700"><CheckCircle2 className="size-5" /> Pagamento confirmado. Sua vaga está garantida!</p>
          ) : charge.method === "efi_link" && charge.payment_url ? (
            <div className="mt-3">
              <p className="mb-3 text-sm text-slate-600">Pague por boleto, cartão ou Pix para garantir sua vaga.</p>
              <Button asChild size="lg"><a href={charge.payment_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Pagar taxa de matrícula</a></Button>
            </div>
          ) : qrSvg && charge.pix_payload ? (
            <div className="mt-3">
              <p className="mb-3 text-sm text-slate-600">Pague pelo Pix (QR Code ou copia e cola). A equipe confirma o recebimento.</p>
              <PixBox payload={charge.pix_payload} qrSvg={qrSvg} />
            </div>
          ) : null}
        </section>
      )}
      <ProposalView doc={proposal.document} />
      <p className="mt-6 text-center text-xs text-slate-400">Proposta gerada com {BRAND.name}</p>
    </main>
  );
}
