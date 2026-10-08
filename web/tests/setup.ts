import { vi } from "vitest";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56421";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_test_key_000000";
process.env.SUPABASE_SECRET_KEY ??= "sb_secret_test_key_00000000000";
// Os testes de data foram escritos para o fuso UTC-4 (sem horário de verão).
process.env.NEXT_PUBLIC_APP_TIME_ZONE ??= "America/Porto_Velho";
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_ENCRYPTION_KEY_VERSION ??= "1";
process.env.CRON_SECRET ??= "test-cron-secret-123456";

// "server-only" é um marcador do Next; em testes é um módulo vazio.
vi.mock("server-only", () => ({}));

