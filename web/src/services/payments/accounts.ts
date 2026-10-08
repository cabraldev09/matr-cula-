import "server-only";
import { prismaUnscoped } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { decryptString, encryptString, parseMasterKey } from "@/services/crypto/aes-gcm";
import type { EfiCredentials } from "@/services/billing/efi";

const AAD = "payment-account:v1";

type Row = {
  efi_client_id: string | null;
  efi_client_secret_encrypted: string | null;
  efi_secret_iv: string | null;
  efi_secret_tag: string | null;
  key_version: number | null;
  sandbox: boolean;
  webhook_secret: string;
};

function masterKey() {
  const env = getEnv();
  return parseMasterKey(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEY_VERSION);
}

async function load(organizationId: string): Promise<Row | null> {
  const rows = await prismaUnscoped.$queryRaw<Row[]>`
    select efi_client_id, efi_client_secret_encrypted, efi_secret_iv, efi_secret_tag, key_version, sandbox, webhook_secret
    from private.payment_accounts where organization_id = ${organizationId}::uuid`;
  return rows[0] ?? null;
}

/** Resumo seguro para a tela de configurações (nunca devolve o segredo). */
export async function getPaymentAccountSummary(organizationId: string) {
  const row = await load(organizationId);
  return {
    efiConfigured: Boolean(row?.efi_client_id && row.efi_client_secret_encrypted),
    clientIdHint: row?.efi_client_id ? `${row.efi_client_id.slice(0, 6)}…${row.efi_client_id.slice(-4)}` : null,
    sandbox: row?.sandbox ?? true,
    webhookSecret: row?.webhook_secret ?? null,
  };
}

/** Credenciais Efí do polo em memória, só no servidor. */
export async function getOrganizationEfiCredentials(organizationId: string): Promise<EfiCredentials | null> {
  const row = await load(organizationId);
  if (!row?.efi_client_id || !row.efi_client_secret_encrypted || !row.efi_secret_iv || !row.efi_secret_tag || row.key_version === null) return null;
  const clientSecret = decryptString(
    { ciphertext: row.efi_client_secret_encrypted, iv: row.efi_secret_iv, authTag: row.efi_secret_tag, keyVersion: row.key_version },
    masterKey(),
    AAD,
  );
  return { clientId: row.efi_client_id, clientSecret, sandbox: row.sandbox };
}

export async function getWebhookSecret(organizationId: string): Promise<string | null> {
  return (await load(organizationId))?.webhook_secret ?? null;
}

export async function saveEfiCredentials(organizationId: string, input: { clientId: string; clientSecret: string; sandbox: boolean }) {
  const encrypted = encryptString(input.clientSecret.trim(), masterKey(), AAD);
  await prismaUnscoped.$executeRaw`
    insert into private.payment_accounts(organization_id, efi_client_id, efi_client_secret_encrypted, efi_secret_iv, efi_secret_tag, key_version, sandbox, updated_at)
    values (${organizationId}::uuid, ${input.clientId.trim()}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag}, ${encrypted.keyVersion}, ${input.sandbox}, now())
    on conflict (organization_id) do update set efi_client_id = excluded.efi_client_id,
      efi_client_secret_encrypted = excluded.efi_client_secret_encrypted, efi_secret_iv = excluded.efi_secret_iv,
      efi_secret_tag = excluded.efi_secret_tag, key_version = excluded.key_version, sandbox = excluded.sandbox, updated_at = now()`;
}

export async function removeEfiCredentials(organizationId: string) {
  await prismaUnscoped.$executeRaw`
    update private.payment_accounts set efi_client_id = null, efi_client_secret_encrypted = null, efi_secret_iv = null,
      efi_secret_tag = null, key_version = null, updated_at = now()
    where organization_id = ${organizationId}::uuid`;
}

/** Garante a linha da conta (e o segredo do webhook) para exibir a URL de notificação ao polo. */
export async function ensurePaymentAccount(organizationId: string): Promise<string> {
  const rows = await prismaUnscoped.$queryRaw<{ webhook_secret: string }[]>`
    insert into private.payment_accounts(organization_id) values (${organizationId}::uuid)
    on conflict (organization_id) do update set updated_at = private.payment_accounts.updated_at
    returning webhook_secret`;
  return rows[0]!.webhook_secret;
}
