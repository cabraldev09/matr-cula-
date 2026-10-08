import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/server";
import { getEfiNotification } from "@/services/billing/efi";
import { toBillingEvents } from "@/services/billing/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSecret(received: string | null): boolean {
  const expected = getEnv().EFI_WEBHOOK_SECRET;
  if (!expected || !received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Notificação da Efí: o corpo traz só o token. O segredo na URL descarta chamadas de terceiros e os
 * dados reais vêm da consulta autenticada à Efí, então um token forjado não altera nada.
 */
export async function POST(request: Request) {
  if (!validSecret(new URL(request.url).searchParams.get("secret"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const type = request.headers.get("content-type") ?? "";
  const token = type.includes("application/json")
    ? String(((await request.json().catch(() => ({}))) as { notification?: unknown }).notification ?? "")
    : String((await request.formData().catch(() => new FormData())).get("notification") ?? "");
  if (!token) return NextResponse.json({ error: "Notificação ausente." }, { status: 400 });

  try {
    const history = await getEfiNotification(token);
    const admin = createAdminClient();
    let applied = 0;
    for (const event of toBillingEvents(history)) {
      const { data, error } = await admin.rpc("billing_apply_event", {
        event_id: event.eventId,
        kind: event.kind,
        org: event.organizationId,
        efi_subscription: event.efiSubscriptionId,
        efi_charge: event.efiChargeId,
        amount: event.amountCents,
        occurred_at: event.occurredAt,
        payload: { token, event },
      });
      if (error) {
        // Assinatura desconhecida (ex.: criada fora do sistema): registra e segue para não travar a fila da Efí.
        logger.warn("billing.event_rejected", { eventId: event.eventId, message: error.message.slice(0, 200) });
        continue;
      }
      if (data) applied += 1;
    }
    return NextResponse.json({ received: true, applied });
  } catch (err) {
    logger.error("billing.webhook_failed", { err: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    // 500 faz a Efí tentar de novo mais tarde.
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
