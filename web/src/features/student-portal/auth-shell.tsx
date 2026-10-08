import type { ReactNode } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { BRAND } from "@/lib/brand";
import { PortalEffects } from "./effects";

/** Tela de acesso do portal do aluno, com a marca da empresa (logo e cor) quando configurada. */
export function PortalAuthShell({
  title,
  description,
  children,
  organization,
}: {
  title: string;
  description: string;
  children: ReactNode;
  organization?: { name: string; logoUrl: string | null; brandColor: string } | null;
}) {
  const color = organization?.brandColor ?? "#003B71";
  return (
    <PortalEffects>
      <main className="portal-auth grid min-h-dvh grid-cols-1 bg-[#f7faff] lg:grid-cols-[1.05fr_1fr]">
        <aside className="portal-auth-story relative isolate flex flex-col justify-end overflow-hidden p-8 text-white sm:p-10 lg:p-14" style={{ backgroundColor: color }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,255,255,.18),transparent_55%),radial-gradient(ellipse_at_100%_100%,rgba(0,0,0,.25),transparent_60%)]" />
          <div className="portal-reveal relative z-10 max-w-md">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-white" /> Portal do aluno
            </span>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
              Sua trajetória acadêmica, em um só lugar.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-7 text-white/80">
              Acompanhe suas conquistas, entenda sua situação e veja o caminho até a formatura.
            </p>
          </div>
        </aside>
        <div className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10 sm:py-12 lg:px-14">
          <div className="portal-reveal relative w-full max-w-sm">
            <div className="mb-10 text-[#003B71]">
              <BrandLogo src={organization?.logoUrl} alt={organization?.name} maxWidthClassName="max-w-[240px]" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[.22em]" style={{ color }}>
              {organization?.name ?? "Portal do aluno"}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mb-8 mt-4 text-sm leading-7 text-slate-500">{description}</p>
            <div className="portal-auth-form">{children}</div>
            <p className="mt-10 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-400">
              {organization?.name ? `${organization.name} · ` : ""}Tecnologia {BRAND.name}
            </p>
          </div>
        </div>
      </main>
    </PortalEffects>
  );
}
