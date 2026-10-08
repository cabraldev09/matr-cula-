import React, { useState } from "react";
import { supabase, requireResult } from "./client";

export default function Channels({
  org,
  channels,
  teams,
  manager,
  action,
  busy,
}) {
  const [provider, setProvider] = useState("simulator");
  return (
    <>
      <section className="saas-card">
        <h2>Canais da empresa</h2>
        <p>
          Use o canal de teste para experimentar a inbox. WhatsApp Cloud precisa
          de configuração da conta Meta no servidor.
        </p>
        {manager && (
          <form
            className="saas-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget,
                values = new FormData(form);
              action(async () => {
                requireResult(
                  await supabase.rpc("create_channel", {
                    org: org.id,
                    channel_name: values.get("name"),
                    channel_provider: provider,
                    phone_id:
                      provider === "whatsapp_cloud"
                        ? values.get("phone_id")
                        : null,
                    team: values.get("team") || null,
                  })
                );
                form.reset();
              }, "Canal cadastrado.");
            }}
          >
            <label className="saas-field">
              <span>Nome do canal</span>
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <label className="saas-field">
              <span>Tipo de canal</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="simulator">Teste local (simulador)</option>
                <option value="whatsapp_cloud">WhatsApp Cloud API</option>
              </select>
            </label>
            {provider === "whatsapp_cloud" && (
              <label className="saas-field">
                <span>ID do número na Meta</span>
                <input name="phone_id" required pattern="[0-9]{5,30}" />
                <small>
                  Não é o telefone. Use o Phone Number ID do painel Meta.
                </small>
              </label>
            )}
            <label className="saas-field">
              <span>Departamento de entrada</span>
              <select name="team">
                <option value="">Sem departamento</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="saas-primary" disabled={busy}>
              Criar canal
            </button>
          </form>
        )}
      </section>
      <div className="saas-grid">
        {channels.map((channel) => (
          <section className="saas-card" key={channel.id}>
            <h2>{channel.name}</h2>
            <span className="saas-badge">
              {channel.provider === "simulator"
                ? "Teste local"
                : "WhatsApp Cloud"}
            </span>
            <p>{channel.enabled ? "Habilitado" : "Pausado"}</p>
            {channel.provider === "whatsapp_cloud" && (
              <p>
                O cadastro não confirma conexão. Configure o token deste canal e
                o webhook no servidor.
              </p>
            )}
            {manager && (
              <>
                <details>
                  <summary>Identificador do canal</summary>
                  <code>{channel.id}</code>
                </details>
                <button
                  className="saas-secondary"
                  disabled={busy}
                  onClick={() =>
                    action(async () =>
                      requireResult(
                        await supabase.rpc("set_channel_enabled", {
                          channel: channel.id,
                          active: !channel.enabled,
                        })
                      )
                    )
                  }
                >
                  {channel.enabled ? "Pausar canal" : "Habilitar canal"}
                </button>
                {channel.provider === "simulator" && channel.enabled && (
                  <form
                    className="saas-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget,
                        values = new FormData(form);
                      action(async () => {
                        requireResult(
                          await supabase.rpc("simulate_incoming", {
                            channel: channel.id,
                            phone: values.get("phone"),
                            contact_name: values.get("contact_name"),
                            message_body: values.get("message_body"),
                            event_id: crypto.randomUUID(),
                          })
                        );
                        form.reset();
                      }, "Mensagem de teste recebida. Abra Atendimentos para responder.");
                    }}
                  >
                    <h3>Simular mensagem do cliente</h3>
                    <label className="saas-field">
                      <span>Telefone do cliente de teste</span>
                      <input
                        name="phone"
                        required
                        pattern="[0-9]{8,15}"
                        placeholder="5569999999999"
                      />
                    </label>
                    <label className="saas-field">
                      <span>Nome do cliente de teste</span>
                      <input
                        name="contact_name"
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </label>
                    <label className="saas-field">
                      <span>Mensagem do cliente de teste</span>
                      <textarea name="message_body" required maxLength={4096} />
                    </label>
                    <button className="saas-primary" disabled={busy}>
                      Receber mensagem de teste
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      {!channels.length && (
        <div className="saas-empty">Nenhum canal cadastrado.</div>
      )}
    </>
  );
}
