import { BRAND_MARK_PATH } from "@/components/icons/brand-mark";

/** Símbolo da marca nos ícones gerados (favicon, Apple e app instalável). Mesma geometria de BrandMarkSvg. */
export function BrandIcon({ size, maskable = false }: { size: number; maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0693e3, #003b71)",
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      <svg width={size * (maskable ? 0.62 : 0.86)} height={size * (maskable ? 0.62 : 0.86)} viewBox="0 0 40 40">
        <path d={BRAND_MARK_PATH} fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M33 6.5v7M29.5 10h7" fill="none" stroke="#fef84c" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
