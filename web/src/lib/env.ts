import { z } from "zod";

const base64Key32 = z
  .string()
  .min(1, "obrigatório")
  .refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "deve ser 32 bytes em base64 (openssl rand -base64 32)");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  /** Conexão direta/sessão (porta 5432) usada apenas por migrações e seed. */
  DIRECT_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Chave secreta do Supabase (server-only): painel da plataforma, webhooks e convites. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  APP_ENCRYPTION_KEY: base64Key32,
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
  STORAGE_DIR: z.string().default("./storage"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_STORAGE_BUCKET: z.string().default("documents"),
  CRON_SECRET: z.string().min(16),
  /** E-mail transacional (Gmail/Workspace com senha de app). Opcional: sem ele o sistema usa só senha temporária. */
  EMAIL_USER: z.string().email().optional(),
  EMAIL_APP_PASSWORD: z.string().min(8).optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_SMTP_HOST: z.string().default("smtp.gmail.com"),
  EMAIL_SMTP_PORT: z.coerce.number().int().default(465),
  /** URL pública do app (base dos links de e-mail). */
  APP_URL: z.string().url().optional(),
  /** Web Push (VAPID). Sem as chaves, as notificações no navegador ficam desativadas; e-mail continua. */
  VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().optional(),
  /** Chave OpenAI da plataforma: usada pelas empresas que não cadastrarem a própria (consome créditos do plano). */
  OPENAI_PLATFORM_API_KEY: z.string().min(20).optional(),
  /** Cobrança Efí (ver docs/COBRANCA-EFI.md). Sem as credenciais, a cobrança automática fica desativada. */
  EFI_CLIENT_ID: z.string().min(5).optional(),
  EFI_CLIENT_SECRET: z.string().min(5).optional(),
  EFI_SANDBOX: z.enum(["true", "false"]).default("true"),
  EFI_PIX_KEY: z.string().min(5).optional(),
  EFI_CERTIFICATE_BASE64: z.string().min(20).optional(),
  EFI_WEBHOOK_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Lê e valida as variáveis de ambiente do servidor uma única vez. Nunca expor ao cliente. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
