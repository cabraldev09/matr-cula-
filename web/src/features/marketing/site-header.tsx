import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-navy/90 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Página inicial"><BrandLogo maxWidthClassName="max-w-[160px]" /></Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/planos" className="rounded-lg px-3 py-2 text-white/85 hover:text-white">Planos</Link>
          {loggedIn ? (
            <Link href="/inicio" className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-navy">Abrir sistema</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-white/85 hover:text-white">Entrar</Link>
              <Link href="/cadastro" className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-navy">Criar conta</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
