import React, { useEffect, useRef, useState } from "react";
import { supabase, requireResult, readableError } from "./client";
const statuses = {
  received: "Recebida",
  queued: "Na fila",
  processing: "Enviando",
  sent: "Aceita pelo WhatsApp",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  unknown: "Resultado incerto: revisar antes de reenviar",
  simulated: "Envio simulado — sem entrega externa",
};
export default function ConversationMessages({ orgId, conversation, answers }) {
  const [messages, setMessages] = useState([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [older, setOlder] = useState(false);
  const pending = useRef(null);
  useEffect(() => {
    let live = true,
      generation = 0;
    const load = async () => {
      const current = ++generation;
      try {
        const result = await supabase
          .from("messages")
          .select("*")
          .eq("organization_id", orgId)
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(100);
        const rows = requireResult(result);
        if (live && current === generation) {
          setMessages(rows.reverse());
          setOlder(rows.length === 100);
        }
      } catch (e) {
        if (live) setError(readableError(e));
      }
    };
    setMessages([]);
    load();
    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        load
      )
      .subscribe();
    // Also reconcile after reconnect and when an UPDATE notification is missed.
    const timer = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [orgId, conversation.id]);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (!pending.current || pending.current.body !== body)
      pending.current = { body, key: crypto.randomUUID() };
    try {
      requireResult(
        await supabase.rpc("queue_message", {
          conversation: conversation.id,
          message_body: body,
          idempotency_key: pending.current.key,
        })
      );
      setBody("");
      pending.current = null;
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="saas-card">
      <h2>Mensagens com o cliente</h2>
      {older && <p>Exibindo as últimas 100 mensagens desta conversa.</p>}
      <div className="saas-message-list" aria-live="polite">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`saas-message ${message.direction}`}
          >
            <small>
              {message.direction === "incoming" ? "Cliente" : "Equipe"} ·{" "}
              {new Date(message.created_at).toLocaleString("pt-BR")}
            </small>
            <p className="saas-preserve">{message.body}</p>
            <small>
              {statuses[message.status]}
              {message.error_code ? ` · ${message.error_code}` : ""}
            </small>
          </article>
        ))}
      </div>
      {!messages.length && <p>Nenhuma mensagem recebida.</p>}
      {error && (
        <div className="saas-notice error" role="alert">
          {error}
        </div>
      )}
      <form className="saas-form" onSubmit={send}>
        <label className="saas-field">
          <span>Inserir resposta rápida</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setBody(e.target.value);
            }}
          >
            <option value="">Selecione…</option>
            {answers.map((answer) => (
              <option key={answer.id} value={answer.body}>
                /{answer.shortcut}
              </option>
            ))}
          </select>
        </label>
        <label className="saas-field">
          <span>Mensagem para o cliente</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={4096}
          />
        </label>
        <button className="saas-primary" disabled={busy || !body.trim()}>
          Enviar mensagem
        </button>
        <small>
          Assuma o atendimento antes de responder. Envios no canal de teste são
          simulados.
        </small>
      </form>
    </section>
  );
}
