import type { EfiNotificationEvent } from "@/services/billing/efi";

export interface BillingEvent {
  eventId: string;
  kind: "paid" | "unpaid" | "canceled";
  organizationId: string | null;
  efiSubscriptionId: number | null;
  efiChargeId: number | null;
  amountCents: number | null;
  occurredAt: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Traduz o histórico de uma notificação da Efí nos eventos que mudam a assinatura. A chave do evento
 * combina objeto e status final, então a mesma cobrança paga nunca é contada duas vezes, mesmo que a
 * Efí reenvie a notificação ou envie tokens diferentes.
 */
export function toBillingEvents(history: EfiNotificationEvent[]): BillingEvent[] {
  const events: BillingEvent[] = [];
  for (const item of history) {
    const status = item.status?.current;
    const chargeId = item.identifiers?.charge_id ?? null;
    const subscriptionId = item.identifiers?.subscription_id ?? null;
    const organizationId = item.custom_id && UUID.test(item.custom_id) ? item.custom_id : null;
    const base = { organizationId, efiSubscriptionId: subscriptionId, efiChargeId: chargeId };
    if ((item.type === "subscription_charge" || item.type === "charge") && chargeId) {
      if (status === "paid" || status === "settled") {
        events.push({ ...base, eventId: `efi:charge:${chargeId}:paid`, kind: "paid", amountCents: item.value ?? null, occurredAt: item.received_by_bank_at ?? item.created_at ?? null });
      } else if (status === "unpaid") {
        events.push({ ...base, eventId: `efi:charge:${chargeId}:unpaid`, kind: "unpaid", amountCents: null, occurredAt: item.created_at ?? null });
      }
    } else if (item.type === "subscription" && subscriptionId && status === "canceled") {
      events.push({ ...base, eventId: `efi:subscription:${subscriptionId}:canceled`, kind: "canceled", amountCents: null, occurredAt: item.created_at ?? null });
    }
  }
  return events;
}
