import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";

const LINKS = [
  ["/#solucoes", "Soluções"],
  ["/#polos", "Para polos"],
  ["/planos", "Planos"],
  ["/#duvidas", "Dúvidas"],
] as const;

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Página inicial" className="text-brand-navy">
          <BrandLogo maxWidthClassName="max-w-[150px]" />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 transition-colors hover:text-brand-navy">{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          {loggedIn ? (
            <Link href="/inicio" className="rounded-full bg-brand-navy px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-[#07558f]">Abrir sistema</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full border border-brand-navy/20 px-4 py-2 font-semibold text-brand-navy transition-colors hover:bg-brand-navy-50">Entrar</Link>
              <Link href="/cadastro" className="hidden rounded-full bg-brand-navy px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-[#07558f] sm:inline-flex">Testar grátis</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
