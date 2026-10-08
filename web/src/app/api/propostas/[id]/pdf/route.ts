import { NextResponse } from "next/server";
import { loadProposalForMember } from "@/features/proposals/load";
import { proposalLogoBytes } from "@/features/proposals/settings";
import { renderProposalPdf } from "@/features/proposals/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const proposal = await loadProposalForMember((await params).id);
  if (!proposal) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  const pdf = await renderProposalPdf(proposal.document, await proposalLogoBytes(proposal.document.logo));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Proposta - ${encodeURIComponent(proposal.document.studentName)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
