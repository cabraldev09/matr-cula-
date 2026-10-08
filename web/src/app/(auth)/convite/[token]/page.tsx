import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/auth-shell";
import { AcceptInvitationForm } from "@/features/auth/accept-invitation-form";
import { previewInvitation } from "@/features/auth/invitation";
import { getSessionContext } from "@/lib/session";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Convite" };
export const dynamic = "force-dynamic";

const ROLE_NAMES: Record<string, string> = { admin: "administrador", supervisor: "supervisor", agent: "atendente" };

export default async function InvitationPage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const invitation = await previewInvitation(token);
  if (!invitation.valid) {
    return (
      <AuthShell title="Convite indisponível" description="Este convite expirou, foi revogado ou já foi usado. Peça um novo ao administrador da empresa.">
        <Link href="/login" className="text-sm underline">Ir para o login</Link>
      </AuthShell>
    );
  }
  const context = await getSessionContext();
  const next = `/convite/${token}`;
  return (
    <AuthShell
      title={`Convite para ${invitation.organizationName}`}
      description={<>Você foi convidado como {ROLE_NAMES[invitation.role] ?? invitation.role}. O convite vale para <span className="font-mono">{invitation.email}</span>.</>}
    >
      {context ? (
        context.email.toLowerCase() === invitation.email ? (
          <AcceptInvitationForm token={token} defaultName={context.displayName} />
        ) : (
          <p className="rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
            Você está conectado como {context.email}. Saia e entre com {invitation.email} para aceitar.
          </p>
        )
      ) : (
        <div className="grid gap-3">
          <Button asChild><Link href={`/cadastro?next=${encodeURIComponent(next)}`}>Criar conta com {invitation.email}</Link></Button>
          <Button asChild variant="outline"><Link href={`/login?next=${encodeURIComponent(next)}`}>Já tenho conta</Link></Button>
        </div>
      )}
    </AuthShell>
  );
}
