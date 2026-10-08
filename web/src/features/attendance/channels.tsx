"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readableError, requireResult } from "@/features/attendance/errors";

export interface Channel {
  id: string;
  name: string;
  provider: "simulator" | "whatsapp_cloud";
  phone_number_id: string | null;
  enabled: boolean;
  default_team_id: string | null;
}

export function Channels({ organizationId, manager, channels, teams, limit }: { organizationId: string; manager: boolean; channels: Channel[]; teams: { id: string; name: string }[]; limit: number | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [provider, setProvider] = useState<Channel["provider"]>("simulator");
  const [busy, setBusy] = useState(false);

  async function run(work: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, success: string, after?: () => void) {
    setBusy(true);
    try {
      requireResult(await work());
      toast.success(success);
      after?.();
      router.refresh();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {manager && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Novo canal</CardTitle>
            <CardDescription>
              Use o canal de teste para experimentar a caixa de entrada. O WhatsApp oficial precisa da conta Meta configurada no servidor de mensagens.
              {limit ? ` Seu plano permite ${limit} canal${limit === 1 ? "" : "is"}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={(form) =>
                run(
                  () =>
                    supabase.rpc("create_channel", {
                      org: organizationId,
                      channel_name: form.get("name"),
                      channel_provider: provider,
                      phone_id: provider === "whatsapp_cloud" ? form.get("phone_id") : null,
                      team: form.get("team") || null,
                    }),
                  "Canal criado.",
                )
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <div className="space-y-1.5"><Label htmlFor="ch-name">Nome do canal</Label><Input id="ch-name" name="name" required minLength={2} maxLength={120} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-provider">Tipo</Label>
                <select id="ch-provider" value={provider} onChange={(e) => setProvider(e.target.value as Channel["provider"])} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                  <option value="simulator">Teste (simulador)</option>
                  <option value="whatsapp_cloud">WhatsApp Cloud API</option>
                </select>
              </div>
              {provider === "whatsapp_cloud" && (
                <div className="space-y-1.5"><Label htmlFor="ch-phone">ID do número na Meta (Phone Number ID)</Label><Input id="ch-phone" name="phone_id" required pattern="[0-9]{5,30}" /></div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ch-team">Departamento de entrada</Label>
                <select id="ch-team" name="team" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                  <option value="">Sem departamento</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Criar canal</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {channels.length === 0 && <p className="text-sm text-muted-foreground">Nenhum canal cadastrado.</p>}
        {channels.map((channel) => (
          <Card key={channel.id} className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                {channel.name}
                <Badge variant={channel.enabled ? "secondary" : "outline"}>{channel.enabled ? "Ativo" : "Pausado"}</Badge>
              </CardTitle>
              <CardDescription>{channel.provider === "simulator" ? "Canal de teste" : `WhatsApp Cloud · ${channel.phone_number_id}`}</CardDescription>
            </CardHeader>
            {manager && (
              <CardContent className="space-y-4">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => supabase.rpc("set_channel_enabled", { channel: channel.id, active: !channel.enabled }), channel.enabled ? "Canal pausado." : "Canal ativado.")}>
                  {channel.enabled ? "Pausar" : "Ativar"}
                </Button>
                {channel.provider === "simulator" && channel.enabled && (
                  <form
                    action={(form) =>
                      run(
                        () =>
                          supabase.rpc("simulate_incoming", {
                            channel: channel.id,
                            phone: String(form.get("phone") ?? "").replace(/\D/g, ""),
                            contact_name: form.get("contact_name"),
                            message_body: form.get("message_body"),
                            event_id: crypto.randomUUID(),
                          }),
                        "Mensagem de teste recebida. Veja em Conversas.",
                      )
                    }
                    className="grid gap-2 rounded-lg bg-muted/30 p-3"
                  >
                    <p className="text-sm font-medium">Simular mensagem de cliente</p>
                    <Input name="phone" required pattern="[0-9]{8,15}" placeholder="5569999999999" aria-label="Telefone do cliente de teste" />
                    <Input name="contact_name" required minLength={2} maxLength={120} placeholder="Nome do cliente" aria-label="Nome do cliente de teste" />
                    <Textarea name="message_body" required maxLength={4096} rows={2} placeholder="Mensagem" aria-label="Mensagem de teste" />
                    <Button type="submit" size="sm" disabled={busy}>Receber mensagem de teste</Button>
                  </form>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
