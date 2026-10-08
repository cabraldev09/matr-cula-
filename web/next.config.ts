import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const isProd = process.env.NODE_ENV === "production";
// Navegador fala direto com o Supabase (login, Realtime do atendimento e logos públicas das empresas).
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");
// Tokenização de cartão da Efí (payment-token-efi): API de cobranças, tokenizador e antifraude.
const efiHosts = "https://cobrancas.api.efipay.com.br https://cobrancas-h.api.efipay.com.br https://tokenizer.sejaefi.com.br https://device.clearsale.com.br https://web.fpcs-monitor.com.br";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://device.clearsale.com.br https://web.fpcs-monitor.com.br" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin} https://device.clearsale.com.br https://web.fpcs-monitor.com.br`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' blob: ${supabaseOrigin} ${supabaseSocket} ${efiHosts}`.trim(),
  "worker-src 'self' blob:",
  "frame-src 'self' blob: https://device.clearsale.com.br",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(self)" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Identifica cada publicação: quando uma aba aberta antes de um deploy navega para o servidor
  // novo, o Next.js detecta a diferença e recarrega a página em vez de mostrar "This page couldn't load".
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || undefined,
  // Server Action arguments can contain passwords and one-time tokens.
  logging: { serverFunctions: false, incomingRequests: { ignore: [/definir-senha/] } },
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist", "@node-rs/argon2", "@prisma/client", "pg"],
  // Arquivos lidos em runtime que o rastreamento automático não vê: worker/fontes do pdf.js
  // (carregados por import() dinâmico em Node) — sem isso o upload falha na Vercel com "PDF corrompido".
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/cmaps/**",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Sentry: os eventos passam por /monitoring no próprio domínio (a CSP continua só 'self' e
// bloqueadores de anúncio não os descartam). Source maps só sobem com SENTRY_AUTH_TOKEN.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
});
