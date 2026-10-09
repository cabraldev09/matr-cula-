import { cn } from "@/lib/utils";

/**
 * Símbolo da Matrícula+: um "M" assimétrico, cujos degraus sobem como um funil de matrícula que se enche,
 * com o "+" no canto. A geometria é a mesma do favicon (components/shared/brand-icon.tsx).
 */
export const BRAND_MARK_PATH = "M7 31V17.5L17 27.5 27 12.5V31";

export function BrandMarkSvg({ className, plain = false }: { className?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label="Matrícula+" className={cn("size-9 shrink-0", className)}>
      <defs>
        <linearGradient id="mp-mark" x1="4" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0693e3" />
          <stop offset="1" stopColor="#003b71" />
        </linearGradient>
      </defs>
      {!plain && <rect width="40" height="40" rx="10" fill="url(#mp-mark)" />}
      <path d={BRAND_MARK_PATH} fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 6.5v7M29.5 10h7" fill="none" stroke="#fef84c" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}
