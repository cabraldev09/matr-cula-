/** Símbolo "M+" usado nos ícones gerados (favicon, Apple e app instalável). */
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
        color: "white",
        fontSize: size * (maskable ? 0.36 : 0.46),
        fontWeight: 800,
        letterSpacing: -size * 0.02,
      }}
    >
      M+
    </div>
  );
}
