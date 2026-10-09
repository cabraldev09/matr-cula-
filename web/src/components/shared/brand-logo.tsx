import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { BrandMarkSvg } from "@/components/icons/brand-mark";

/** Logo da plataforma. Com `src`, mostra a logo da empresa cliente (marca própria). */
export function BrandLogo({
  className,
  compact = false,
  maxWidthClassName = "max-w-[220px]",
  src,
  alt,
}: {
  className?: string;
  compact?: boolean;
  maxWidthClassName?: string;
  src?: string | null;
  alt?: string;
}) {
  const logo = src ?? BRAND.logo;
  if (logo) {
    return (
      <div className={cn("flex items-center", className)}>
        {/* Logos enviadas pelas empresas podem ter qualquer proporção; next/image exige dimensões fixas. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={alt ?? BRAND.name} className={cn("h-auto w-full object-contain", compact ? "max-h-10 max-w-10" : cn("max-h-14", maxWidthClassName))} />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label={BRAND.name}>
      <BrandMarkSvg />
      {!compact && <span className={cn("truncate text-xl", maxWidthClassName)}>{BRAND.name}</span>}
    </div>
  );
}

/** Mantido para páginas que só precisam do símbolo. */
export function BrandMark({ className }: { className?: string }) {
  return BRAND.logo ? (
    <Image src={BRAND.logo} alt={BRAND.name} width={40} height={40} className={cn("size-10 object-contain", className)} />
  ) : (
    <BrandMarkSvg className={className} />
  );
}
