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

export interface EfiCredentials {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
}

/** Conta Efí da plataforma (assinaturas dos planos), definida nas variáveis de ambiente. */
export function platformEfiCredentials(): EfiCredentials | null {
  const env = getEnv();
  if (!env.EFI_CLIENT_ID || !env.EFI_CLIENT_SECRET) return null;
  return { clientId: env.EFI_CLIENT_ID, clientSecret: env.EFI_CLIENT_SECRET, sandbox: env.EFI_SANDBOX !== "false" };
}

export function isEfiConfigured(): boolean {
  return platformEfiCredentials() !== null;
}

type EfiRequest = <T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<T>;

const tokens = new Map<string, { value: string; expiresAt: number }>();

/** Cliente autenticado de uma conta Efí (plataforma ou polo). O token OAuth fica em memória por conta. */
export function createEfiRequest(credentials: EfiCredentials): EfiRequest {
  const base = credentials.sandbox ? "https://cobrancas-h.api.efipay.com.br" : "https://cobrancas.api.efipay.com.br";
  const cacheKey = `${credentials.sandbox ? "h" : "p"}:${credentials.clientId}`;

  async function accessToken(): Promise<string> {
    const cached = tokens.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;
    const response = await fetch(`${base}/v1/authorize`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new EfiRequestError(response.status, "falha na autenticação (confira Client ID e Client Secret)");
    const json = (await response.json()) as { access_token: string; expires_in?: number };
    tokens.set(cacheKey, { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 600) * 1000 });
    return json.access_token;
  }

  return async function efi<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
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
  };
}

function platformRequest(): EfiRequest {
  const credentials = platformEfiCredentials();
  if (!credentials) throw new EfiNotConfiguredError();
  return createEfiRequest(credentials);
}

export async function createEfiPlan(input: { name: string; months: 1 | 12 }): Promise<number> {
  const data = await platformRequest()<{ plan_id: number }>("POST", "/v1/plan", { name: input.name.slice(0, 255), interval: input.months, repeats: null });
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
  const data = await platformRequest()<Record<string, unknown>>("POST", `/v1/plan/${input.efiPlanId}/subscription/one-step`, {
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
  await platformRequest()("PUT", `/v1/subscription/${subscriptionId}/cancel`);
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
export async function getEfiNotification(token: string, credentials?: EfiCredentials): Promise<EfiNotificationEvent[]> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(token)) throw new EfiRequestError(400, "token inválido");
  const request = credentials ? createEfiRequest(credentials) : platformRequest();
  return request<EfiNotificationEvent[]>("GET", `/v1/notification/${token}`);
}

/**
 * Link de pagamento avulso (boleto, cartão e, quando habilitado na conta, Pix) na conta Efí do polo.
 * Referência: https://dev.efipay.com.br/docs/api-cobrancas/link-de-pagamento
 */
export async function createEfiPaymentLink(
  credentials: EfiCredentials,
  input: { itemName: string; valueCents: number; customId: string; notificationUrl: string; email?: string | null; expireAt: string; message?: string },
): Promise<{ chargeId: number; paymentUrl: string }> {
  const data = await createEfiRequest(credentials)<{ charge_id: number; payment_url: string }>("POST", "/v1/charge/one-step/link", {
    items: [{ name: input.itemName.slice(0, 255), value: input.valueCents, amount: 1 }],
    metadata: { custom_id: input.customId, notification_url: input.notificationUrl },
    ...(input.email ? { customer: { email: input.email } } : {}),
    settings: { payment_method: "all", expire_at: input.expireAt, request_delivery_address: false, ...(input.message ? { message: input.message.slice(0, 80) } : {}) },
  });
  return { chargeId: Number(data.charge_id), paymentUrl: data.payment_url };
}

/** Confere as credenciais fazendo a autenticação (sem criar nada na conta). */
export async function testEfiCredentials(credentials: EfiCredentials): Promise<void> {
  await createEfiRequest(credentials)("GET", "/v1/plans?limit=1").catch((err) => {
    if (err instanceof EfiRequestError && err.status !== 401 && err.status !== 403 && !/autentica/.test(err.detail)) return;
    throw err;
  });
}
