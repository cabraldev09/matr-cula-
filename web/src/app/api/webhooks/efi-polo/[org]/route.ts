import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/server";
import { getEfiNotification } from "@/services/billing/efi";
import { getOrganizationEfiCredentials, getWebhookSecret } from "@/services/payments/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notificação da Efí do polo (taxa de matrícula). O segredo da URL é do polo; os dados vêm da
 * consulta autenticada com as credenciais do próprio polo, e a confirmação é idempotente.
 */
export async function POST(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  if (!/^[0-9a-f-]{36}$/.test(org)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const expected = await getWebhookSecret(org);
  const received = new URL(request.url).searchParams.get("secret") ?? "";
  if (!expected || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const credentials = await getOrganizationEfiCredentials(org);
  if (!credentials) return NextResponse.json({ error: "Conta não configurada." }, { status: 409 });
  const type = request.headers.get("content-type") ?? "";
  const token = type.includes("application/json")
    ? String(((await request.json().catch(() => ({}))) as { notification?: unknown }).notification ?? "")
    : String((await request.formData().catch(() => new FormData())).get("notification") ?? "");
  if (!token) return NextResponse.json({ error: "Notificação ausente." }, { status: 400 });
  try {
    const history = await getEfiNotification(token, credentials);
    const admin = createAdminClient();
    let confirmed = 0;
    for (const event of history) {
      const chargeId = event.identifiers?.charge_id;
      if (event.type !== "charge" || !chargeId || !["paid", "settled"].includes(event.status?.current)) continue;
      // Só confirma cobranças desta empresa (o custom_id é o id da cobrança no sistema).
      const { data: charge } = await admin.from("enrollment_charges").select("id").eq("organization_id", org).eq("efi_charge_id", chargeId).maybeSingle();
      if (!charge) continue;
      const { data, error } = await admin.rpc("confirm_enrollment_charge", { charge: charge.id });
      if (error) logger.warn("crm.charge_confirm_failed", { org, message: error.message.slice(0, 200) });
      else if (data) confirmed += 1;
    }
    return NextResponse.json({ received: true, confirmed });
  } catch (err) {
    logger.error("crm.webhook_failed", { org, err: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
