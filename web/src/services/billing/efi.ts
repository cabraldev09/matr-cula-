import "server-only";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Cliente da API de Cobranças da Efí (planos e assinaturas por boleto/Pix ou cartão).
 * Referência: https://dev.efipay.com.br/docs/api-cobrancas/assinatura
 * Autenticação OAuth2 client_credentials com Basic (client_id:client_secret); token de 10 minutos.
 */
export class EfiNotConfiguredError extends Error {
  constructor() {
    super("Cobrança automática não configurada. Defina EFI_CLIENT_ID e EFI_CLIENT_SECRET.");
    this.name = "EfiNotConfiguredError";
  }
}

export class EfiRequestError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(`Efí respondeu ${status}: ${detail}`);
    this.name = "EfiRequestError";
  }
}

export function isEfiConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.EFI_CLIENT_ID && env.EFI_CLIENT_SECRET);
}

function baseUrl(): string {
  return getEnv().EFI_SANDBOX === "false" ? "https://cobrancas.api.efipay.com.br" : "https://cobrancas-h.api.efipay.com.br";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const env = getEnv();
  if (!env.EFI_CLIENT_ID || !env.EFI_CLIENT_SECRET) throw new EfiNotConfiguredError();
  const response = await fetch(`${baseUrl()}/v1/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.EFI_CLIENT_ID}:${env.EFI_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new EfiRequestError(response.status, "falha na autenticação");
  const json = (await response.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 600) * 1000 };
  return cachedToken.value;
}

async function efi<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as { data?: T; error_description?: unknown }) : {};
  if (!response.ok) {
    const detail = typeof json.error_description === "string" ? json.error_description : JSON.stringify(json.error_description ?? text).slice(0, 300);
    logger.warn("efi.request_failed", { method, path: path.replace(/\d{3,}/g, ":id"), status: response.status });
    throw new EfiRequestError(response.status, detail);
  }
  return (json.data ?? json) as T;
}

export async function createEfiPlan(input: { name: string; months: 1 | 12 }): Promise<number> {
  const data = await efi<{ plan_id: number }>("POST", "/v1/plan", { name: input.name.slice(0, 255), interval: input.months, repeats: null });
  return data.plan_id;
}

export interface EfiCustomer {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface EfiBillingAddress {
  street: string;
  number: string;
  neighborhood: string;
  zipcode: string;
  city: string;
  state: string;
  complement?: string;
}

function customerPayload(customer: EfiCustomer) {
  const base = { email: customer.email, phone_number: customer.phone };
  return customer.document.length === 14
    ? { ...base, juridical_person: { corporate_name: customer.name, cnpj: customer.document } }
    : { ...base, name: customer.name, cpf: customer.document };
}

export interface EfiSubscriptionResult {
  subscriptionId: number;
  chargeId: number | null;
  chargeStatus: string | null;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
  dueDate: string | null;
}

/** Cria a assinatura e a primeira cobrança em uma chamada (one-step). */
export async function createEfiSubscription(input: {
  efiPlanId: number;
  itemName: string;
  valueCents: number;
  customer: EfiCustomer;
  method: "boleto" | "credit_card";
  paymentToken?: string;
  billingAddress?: EfiBillingAddress;
  customId: string;
  notificationUrl: string;
}): Promise<EfiSubscriptionResult> {
  const expire = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const payment =
    input.method === "credit_card"
      ? { credit_card: { customer: customerPayload(input.customer), billing_address: input.billingAddress, payment_token: input.paymentToken } }
      : { banking_billet: { customer: customerPayload(input.customer), expire_at: expire, message: input.itemName.slice(0, 80) } };
  const data = await efi<Record<string, unknown>>("POST", `/v1/plan/${input.efiPlanId}/subscription/one-step`, {
    items: [{ name: input.itemName.slice(0, 255), value: input.valueCents, amount: 1 }],
    payment,
    metadata: { custom_id: input.customId, notification_url: input.notificationUrl },
  });
  const charge = (data.charge ?? {}) as { id?: number; status?: string };
  const pix = (data.pix ?? {}) as { qrcode?: string };
  const pdf = (data.pdf ?? {}) as { charge?: string };
  return {
    subscriptionId: Number(data.subscription_id),
    chargeId: charge.id ?? null,
    chargeStatus: charge.status ?? (typeof data.status === "string" ? data.status : null),
    paymentUrl: (typeof data.link === "string" ? data.link : null) ?? pdf.charge ?? null,
    pixCopyPaste: pix.qrcode ?? null,
    dueDate: typeof data.expire_at === "string" ? data.expire_at : input.method === "boleto" ? expire : null,
  };
}

export async function cancelEfiSubscription(subscriptionId: number): Promise<void> {
  await efi("PUT", `/v1/subscription/${subscriptionId}/cancel`);
}

export interface EfiNotificationEvent {
  id: number;
  type: string;
  custom_id: string | null;
  status: { current: string; previous: string | null };
  identifiers: { charge_id?: number; subscription_id?: number };
  created_at?: string;
  received_by_bank_at?: string;
  value?: number;
}

/** A notificação só traz um token; os dados vêm desta consulta autenticada. */
export async function getEfiNotification(token: string): Promise<EfiNotificationEvent[]> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(token)) throw new EfiRequestError(400, "token inválido");
  return efi<EfiNotificationEvent[]>("GET", `/v1/notification/${token}`);
}
