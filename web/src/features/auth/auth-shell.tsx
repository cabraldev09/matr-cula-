import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { BRAND } from "@/lib/brand";

/** Moldura das telas de acesso (login, cadastro, senha, convite). */
export function AuthShell({
  title,
  description,
  children,
  footer,
  logoSrc,
  logoAlt,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  logoSrc?: string | null;
  logoAlt?: string;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 size-[520px] rounded-full bg-brand-cyan/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-[520px] rounded-full bg-brand-gold/15 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center text-white">
          <BrandLogo src={logoSrc} alt={logoAlt} maxWidthClassName="max-w-[280px]" />
        </Link>
        <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer}
        <p className="mt-6 text-center text-xs text-white/60">{BRAND.name} · {BRAND.tagline}</p>
      </div>
    </main>
  );
}
