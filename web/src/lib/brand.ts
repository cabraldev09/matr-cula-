/**
 * Marca da plataforma (revenda). Para usar uma logo própria, coloque o arquivo em public/brand/ e
 * defina NEXT_PUBLIC_BRAND_LOGO (ex.: /brand/logo.svg); sem ela, o logotipo em texto é usado.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Matrícula+",
  tagline: "Atendimento e análise curricular em um só lugar",
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO || null,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
} as const;
