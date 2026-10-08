import React, { useEffect, useState, useRef } from "react";
import { supabase, requireResult, readableError } from "./client";
import "./saas.css";
import Channels from "./Channels";
import ConversationMessages from "./ConversationMessages";

const roles = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Atendente",
};
const menus = [
  ["overview", "Visão geral", "◈"],
  ["conversations", "Atendimentos", "▤"],
  ["channels", "Canais", "◉"],
  ["contacts", "Contatos", "◎"],
  ["teams", "Departamentos", "▦"],
  ["tags", "Etiquetas", "◇"],
  ["answers", "Respostas rápidas", "ϟ"],
  ["members", "Equipe e convites", "♧"],
  ["settings", "Empresa", "⚙"],
];
const labels = {
  pending: "Pendente",
  open: "Em atendimento",
  closed: "Resolvido",
};
const stamp = (value) => new Date(value).toLocaleString("pt-BR");

function Field({ label, ...props }) {
  return (
    <label className="saas-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Notice({ error, message }) {
  return error ? (
    <div className="saas-notice error" role="alert">
      {error}
    </div>
  ) : message ? (
    <div className="saas-notice" role="status">
      {message}
    </div>
  ) : null;
}
function Form({ children, onSubmit, busy, label = "Salvar" }) {
  return (
    <form className="saas-form" onSubmit={onSubmit}>
      {children}
      <button disabled={busy} className="saas-primary">
        {busy ? "Salvando…" : label}
      </button>
    </form>
  );
}
function Empty({ children }) {
  return <div className="saas-empty">{children}</div>;
}

function Auth({ onMessage }) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const credentials = {
        email: data.get("email").trim(),
        password: data.get("password"),
      };
      const result = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: `${window.location.origin}/saas` },
          })
        : await supabase.auth.signInWithPassword(credentials);
      requireResult(result);
      if (signup && !result.data.session)
        onMessage("Confira seu e-mail para confirmar o cadastro.");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="saas-auth">
      <section className="saas-auth-brand">
        <a href="/" className="saas-wordmark">
          W<span>+</span> <small>ATENDIMENTO</small>
        </a>
        <div>
          <span className="saas-eyebrow">SEU NEGÓCIO, MAIS CONECTADO</span>
          <h1>
            Uma equipe.
            <br />
            Todas as conversas.
          </h1>
          <p>
            Organize seus contatos, distribua atendimentos e dê a cada empresa
            seu próprio espaço.
          </p>
        </div>
        <footer>Uma nova base para seu atendimento.</footer>
      </section>
      <section className="saas-auth-form">
        <div>
          <span className="saas-eyebrow">BEM-VINDO</span>
          <h2>{signup ? "Crie sua conta" : "Entre no seu espaço"}</h2>
          <p>Use sua conta do SaaS para acessar suas empresas.</p>
          <Notice error={error} />
          <Form
            onSubmit={submit}
            busy={busy}
            label={signup ? "Criar conta" : "Entrar"}
          >
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
            <Field
              label="Senha"
              name="password"
              type="password"
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
          </Form>
          <button
            className="saas-link"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Já tenho uma conta" : "Criar uma conta"}
          </button>
          <a className="saas-link" href="/login">
            Acessar atendimento Community
          </a>
        </div>
      </section>
    </main>
  );
}

export default function SaasApp() {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [memberships, setMemberships] = useState([]),
    [orgId, setOrgId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let live = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (live) {
        setSession(data.session);
        setReady(true);
        if (error) setError(readableError(error));
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  const loadOrgs = async () => {
    const rows = requireResult(
      await supabase
        .from("memberships")
        .select("organization_id,role,organizations(id,name,timezone)")
        .eq("user_id", session.user.id)
        .eq("active", true)
    );
    setMemberships(rows);
    setOrgId((previous) =>
      rows.some((r) => r.organization_id === previous)
        ? previous
        : rows[0]?.organization_id || ""
    );
    setLoaded(true);
  };
  useEffect(() => {
    setLoaded(false);
    setMemberships([]);
    setOrgId("");
    setError("");
    if (session)
      loadOrgs().catch((e) => {
        setError(readableError(e));
        setLoaded(true);
      });
  }, [session?.user.id]);
  const onboarding = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      requireResult(
        await supabase.rpc(
          inviteToken ? "accept_invitation" : "create_organization",
          inviteToken
            ? {
                invite_token: inviteToken,
                display_name: data.get("display_name"),
              }
            : {
                org_name: data.get("organization"),
                display_name: data.get("display_name"),
              }
        )
      );
      if (inviteToken) window.history.replaceState(null, "", "/saas");
      await loadOrgs();
      setMessage(
        inviteToken
          ? "Convite aceito."
          : "Empresa criada. Seu espaço está pronto."
      );
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!supabase)
    return (
      <main className="saas-onboard">
        <h1>Configuração necessária</h1>
        <p>
          Configure a URL e a chave pública do Supabase no ambiente do frontend.
        </p>
        <a href="/">Voltar ao atendimento</a>
      </main>
    );
  if (!ready || (session && !loaded))
    return (
      <main className="saas-onboard" role="status">
        Carregando seu espaço…
      </main>
    );
  if (!session)
    return (
      <>
        <Notice error={error} message={message} />
        <Auth onMessage={setMessage} />
      </>
    );
  const current = memberships.find((m) => m.organization_id === orgId);
  if (!current || inviteToken)
    return (
      <main className="saas-onboard">
        <div className="saas-card">
          <span className="saas-eyebrow">PRIMEIRO PASSO</span>
          <h1>{inviteToken ? "Participe da equipe" : "Crie sua empresa"}</h1>
          <p>
            {inviteToken
              ? `Você está entrando com ${session.user.email}. O convite deve ter sido enviado para esse e-mail.`
              : "Cada empresa tem seus próprios contatos, departamentos e equipe."}
          </p>
          <Notice error={error} message={message} />
          <Form
            onSubmit={onboarding}
            busy={busy}
            label={inviteToken ? "Aceitar convite" : "Criar meu espaço"}
          >
            <Field
              label="Seu nome"
              name="display_name"
              minLength={2}
              maxLength={120}
              required
            />
            {!inviteToken && (
              <Field
                label="Nome da empresa"
                name="organization"
                minLength={2}
                maxLength={120}
                required
              />
            )}
          </Form>
          <button className="saas-link" onClick={() => supabase.auth.signOut()}>
            Sair da conta
          </button>
          {inviteToken && current && (
            <a className="saas-link" href="/saas">
              Voltar às minhas empresas
            </a>
          )}
        </div>
      </main>
    );
  return (
    <Workspace
      key={orgId}
      org={current.organizations}
      role={current.role}
      user={session.user}
      memberships={memberships}
      onSwitch={setOrgId}
      reloadOrgs={loadOrgs}
    />
  );
}

function Workspace({ org, role, user, memberships, onSwitch, reloadOrgs }) {
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState({
      contacts: [],
      teams: [],
      tags: [],
      quick_answers: [],
      conversations: [],
      memberships: [],
      invitations: [],
      profiles: [],
      team_members: [],
      contact_tags: [],
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [inviteLink, setInviteLink] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [notes, setNotes] = useState([]),
    [files, setFiles] = useState([]),
    [newOrg, setNewOrg] = useState(false),
    [counts, setCounts] = useState({}),
    [page, setPage] = useState(0);
  const alive = useRef(true),
    sequence = useRef(0),
    noteSequence = useRef(0);
  const manager = ["owner", "admin"].includes(role);
  useEffect(
    () => () => {
      alive.current = false;
      sequence.current++;
      noteSequence.current++;
    },
    []
  );
  const load = async () => {
    const request = ++sequence.current;
    const tables = [
      "contacts",
      "teams",
      "tags",
      "quick_answers",
      "conversations",
      "memberships",
      "team_members",
      "contact_tags",
      "channels",
    ];
    const results = await Promise.all(
      tables.map((table) => {
        let query = supabase
          .from(table)
          .select(
            table === "conversations" ? "*,contacts(name),teams(name)" : "*",
            { count: "exact" }
          )
          .eq("organization_id", org.id);
        if (table === "contacts") {
          query = query
            .order("created_at", { ascending: false })
            .range(page * 50, page * 50 + 49);
          if (search.trim())
            query = query.ilike("name", `%${search.replace(/[%_]/g, "")}%`);
        } else if (table === "conversations")
          query = query.order("updated_at", { ascending: false }).limit(100);
        else query = query.limit(100);
        return query;
      })
    );
    const next = {},
      nextCounts = {};
    results.forEach((result, index) => {
      next[tables[index]] = requireResult(result);
      nextCounts[tables[index]] = result.count;
    });
    next.profiles = requireResult(
      await supabase.from("profiles").select("id,display_name").limit(100)
    );
    next.invitations = manager
      ? requireResult(
          await supabase
            .from("invitations")
            .select("id,email,role,expires_at,accepted_at,revoked_at")
            .eq("organization_id", org.id)
            .order("created_at", { ascending: false })
            .limit(100)
        )
      : [];
    if (alive.current && request === sequence.current) {
      setData(next);
      setCounts(nextCounts);
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    load().catch((e) => {
      if (alive.current) {
        setError(readableError(e));
        setLoading(false);
      }
    });
  }, [page, search]);
  useEffect(() => {
    const channel = supabase
      .channel(`workspace:${org.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `organization_id=eq.${org.id}`,
        },
        () => load().catch((e) => setError(readableError(e)))
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${org.id}`,
        },
        () => load().catch((e) => setError(readableError(e)))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [org.id, page, search]);
  const action = async (work, success = "Alterações salvas.") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      if (alive.current) {
        await load();
        setMessage(success);
      }
    } catch (e) {
      if (alive.current) setError(readableError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const insert = (table) => (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form));
    if (table === "contacts") {
      values.phone = values.phone.trim() || null;
      values.email = values.email.trim() || null;
    }
    if (table === "conversations") values.team_id = values.team_id || null;
    action(
      async () => {
        requireResult(
          await supabase
            .from(table)
            .insert({ ...values, organization_id: org.id })
        );
        form.reset();
      },
      table === "conversations"
        ? "Atendimento interno criado."
        : "Registro criado."
    );
  };
  const remove = (table, id) => {
    if (window.confirm("Excluir este registro?"))
      action(
        async () =>
          requireResult(
            await supabase
              .from(table)
              .delete()
              .eq("organization_id", org.id)
              .eq("id", id)
          ),
        "Registro excluído."
      );
  };
  const rpc = (name, args, success) =>
    action(async () => requireResult(await supabase.rpc(name, args)), success);
  const displayName = (id) =>
    data.profiles.find((p) => p.id === id)?.display_name ||
    (id === user.id ? "Você" : "Membro da equipe");
  const openConversation = async (conversation) => {
    const request = ++noteSequence.current;
    setSelected(conversation);
    setNotes([]);
    setFiles([]);
    setError("");
    try {
      const [noteResult, fileResult] = await Promise.all([
        supabase
          .from("internal_notes")
          .select("*")
          .eq("organization_id", org.id)
          .eq("conversation_id", conversation.id)
          .order("created_at")
          .limit(100),
        supabase.storage
          .from("attachments")
          .list(`${org.id}/${conversation.id}`, { limit: 100 }),
      ]);
      if (alive.current && request === noteSequence.current) {
        setNotes(requireResult(noteResult));
        setFiles(requireResult(fileResult));
      }
    } catch (e) {
      if (alive.current && request === noteSequence.current)
        setError(readableError(e));
    }
  };
  useEffect(() => {
    if (!selected) return undefined;
    const channel = supabase
      .channel(`notes:${org.id}:${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_notes",
          filter: `conversation_id=eq.${selected.id}`,
        },
        () => openConversation(selected)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [org.id, selected?.id]);
  const uploadFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 20 MB.");
      return;
    }
    action(async () => {
      const name = `${crypto.randomUUID()}-${file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      requireResult(
        await supabase.storage
          .from("attachments")
          .upload(`${org.id}/${selected.id}/${name}`, file)
      );
      await openConversation(selected);
    }, "Anexo privado salvo.");
  };
  const download = async (file) => {
    try {
      const result = requireResult(
        await supabase.storage
          .from("attachments")
          .createSignedUrl(`${org.id}/${selected.id}/${file.name}`, 60)
      );
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(readableError(e));
    }
  };
  const createInvite = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    action(async () => {
      const invitation = requireResult(
        await supabase.rpc("invite_member", {
          org: org.id,
          invite_email: values.email,
          invite_role: values.role,
        })
      );
      setInviteLink(
        `${window.location.origin}/saas?invite=${encodeURIComponent(
          invitation.token
        )}`
      );
    }, "Convite criado. Compartilhe o link com o destinatário; o envio por e-mail ainda não está integrado.");
  };
  return (
    <div className="saas-shell">
      <aside className="saas-sidebar">
        <a className="saas-wordmark" href="/saas">
          W<span>+</span>
          <small>ATENDIMENTO</small>
        </a>
        <div className="saas-org">
          <small>ESPAÇO DE TRABALHO</small>
          <select
            aria-label="Empresa ativa"
            value={org.id}
            onChange={(e) => {
              setSelected(null);
              onSwitch(e.target.value);
            }}
          >
            {memberships.map((m) => (
              <option key={m.organization_id} value={m.organization_id}>
                {m.organizations.name}
              </option>
            ))}
          </select>
          <span>{roles[role]}</span>
        </div>
        <nav aria-label="Menu principal">
          {menus.map(([key, title, icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setError("");
                setMessage("");
                setSelected(null);
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {title}
            </button>
          ))}
        </nav>
        <footer>
          <a href="/tickets">Atendimento Community ↗</a>
          <button onClick={() => supabase.auth.signOut()}>Sair da conta</button>
        </footer>
      </aside>
      <main className="saas-main">
        <header className="saas-topbar">
          <span className="saas-breadcrumb">
            {org.name} <span>/</span> {menus.find((m) => m[0] === tab)[1]}
          </span>
          <span className="saas-avatar" title={user.email}>
            {user.email.charAt(0).toUpperCase()}
          </span>
        </header>
        <div className="saas-content">
          <div className="saas-heading">
            <div>
              <span className="saas-eyebrow">SEU ESPAÇO DE TRABALHO</span>
              <h1>{menus.find((m) => m[0] === tab)[1]}</h1>
              <p>
                {tab === "overview"
                  ? "Tudo o que sua equipe precisa para começar, em um só lugar."
                  : "Dados e configurações exclusivos desta empresa."}
              </p>
            </div>
            <button
              className="saas-secondary"
              disabled={busy}
              onClick={() => action(async () => {}, "Dados atualizados.")}
            >
              Atualizar
            </button>
          </div>
          <Notice error={error} message={message} />
          {loading ? (
            <Empty>Carregando dados…</Empty>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <div className="saas-stats">
                    {[
                      ["Contatos", counts.contacts, "◎"],
                      ["Atendimentos", counts.conversations, "▤"],
                      ["Departamentos", counts.teams, "▦"],
                      ["Membros cadastrados", counts.memberships, "♧"],
                    ].map(([name, value, icon]) => (
                      <div className="saas-card saas-stat" key={name}>
                        <span className="saas-stat-icon">{icon}</span>
                        <p>{name}</p>
                        <strong>{value || 0}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="saas-card">
                    <span className="saas-eyebrow">COMECE POR AQUI</span>
                    <h2>Prepare sua operação</h2>
                    <div className="saas-steps">
                      {[
                        [
                          "teams",
                          "1",
                          "Organize seus departamentos",
                          "Separe os atendimentos por equipe.",
                        ],
                        [
                          "contacts",
                          "2",
                          "Cadastre seus contatos",
                          "Centralize os dados dos seus clientes.",
                        ],
                        [
                          "members",
                          "3",
                          "Convide sua equipe",
                          "Cada pessoa entra com sua própria conta.",
                        ],
                      ].map(([key, number, title, detail]) => (
                        <button key={key} onClick={() => setTab(key)}>
                          <b>{number}</b>
                          <span>
                            <strong>{title}</strong>
                            <small>{detail}</small>
                          </span>
                          <span>→</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <div className="saas-card saas-progress">
                    <h2>Conexões com canais</h2>
                    <p>
                      Cadastre um canal de teste para experimentar mensagens e
                      respostas. WhatsApp Cloud precisa das credenciais Meta
                      configuradas no servidor.
                    </p>
                  </div>
                </>
              )}
              {tab === "channels" && (
                <Channels
                  org={org}
                  channels={data.channels}
                  teams={data.teams}
                  manager={manager}
                  action={action}
                  busy={busy}
                />
              )}
              {tab === "contacts" && (
                <>
                  <section className="saas-card">
                    <h2>Novo contato</h2>
                    <Form onSubmit={insert("contacts")} busy={busy}>
                      <Field
                        label="Nome"
                        name="name"
                        required
                        minLength={2}
                        maxLength={120}
                      />
                      <Field
                        label="Telefone"
                        name="phone"
                        placeholder="5569999999999"
                        pattern="\+?[0-9]{8,15}"
                      />
                      <Field
                        label="E-mail"
                        name="email"
                        type="email"
                        maxLength={254}
                      />
                    </Form>
                  </section>
                  <section className="saas-card">
                    <div className="saas-list-heading">
                      <h2>
                        Seus contatos <small>{counts.contacts}</small>
                      </h2>
                      <input
                        aria-label="Buscar contatos por nome"
                        placeholder="Buscar por nome…"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(0);
                        }}
                      />
                    </div>
                    {data.contacts.length ? (
                      <div className="saas-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Nome</th>
                              <th>Telefone</th>
                              <th>E-mail</th>
                              <th>Etiquetas</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {data.contacts.map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <strong>{c.name}</strong>
                                </td>
                                <td>{c.phone || "—"}</td>
                                <td>{c.email || "—"}</td>
                                <td>
                                  <div className="saas-tag-list">
                                    {data.contact_tags
                                      .filter((ct) => ct.contact_id === c.id)
                                      .map((ct) => {
                                        const tag = data.tags.find(
                                          (t) => t.id === ct.tag_id
                                        );
                                        return (
                                          tag && (
                                            <button
                                              key={ct.tag_id}
                                              style={{ color: tag.color }}
                                              className="saas-badge"
                                              disabled={busy}
                                              title="Remover etiqueta"
                                              onClick={() =>
                                                action(async () =>
                                                  requireResult(
                                                    await supabase
                                                      .from("contact_tags")
                                                      .delete()
                                                      .eq(
                                                        "organization_id",
                                                        org.id
                                                      )
                                                      .eq("contact_id", c.id)
                                                      .eq("tag_id", tag.id)
                                                  )
                                                )
                                              }
                                            >
                                              {tag.name} ×
                                            </button>
                                          )
                                        );
                                      })}
                                    <select
                                      aria-label={`Adicionar etiqueta a ${c.name}`}
                                      value=""
                                      disabled={busy}
                                      onChange={(e) => {
                                        if (e.target.value)
                                          action(async () =>
                                            requireResult(
                                              await supabase
                                                .from("contact_tags")
                                                .insert({
                                                  organization_id: org.id,
                                                  contact_id: c.id,
                                                  tag_id: e.target.value,
                                                })
                                            )
                                          );
                                      }}
                                    >
                                      <option value="">+ Etiqueta</option>
                                      {data.tags
                                        .filter(
                                          (t) =>
                                            !data.contact_tags.some(
                                              (ct) =>
                                                ct.contact_id === c.id &&
                                                ct.tag_id === t.id
                                            )
                                        )
                                        .map((t) => (
                                          <option value={t.id} key={t.id}>
                                            {t.name}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                </td>
                                <td>
                                  {manager && (
                                    <button
                                      className="saas-link danger"
                                      disabled={busy}
                                      onClick={() => remove("contacts", c.id)}
                                    >
                                      Excluir
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>Nenhum contato encontrado.</Empty>
                    )}
                    <div className="saas-pagination">
                      <button
                        disabled={busy || page === 0}
                        onClick={() => setPage(page - 1)}
                      >
                        Anterior
                      </button>
                      <span>Página {page + 1}</span>
                      <button
                        disabled={busy || (page + 1) * 50 >= counts.contacts}
                        onClick={() => setPage(page + 1)}
                      >
                        Próxima
                      </button>
                    </div>
                  </section>
                </>
              )}
              {tab === "teams" && (
                <>
                  {manager && (
                    <section className="saas-card">
                      <h2>Novo departamento</h2>
                      <Form onSubmit={insert("teams")} busy={busy}>
                        <Field
                          label="Nome"
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                        />
                        <Field
                          label="Cor"
                          name="color"
                          type="color"
                          defaultValue="#3956ff"
                        />
                        <Field
                          label="Mensagem de boas-vindas"
                          name="greeting_message"
                          maxLength={2000}
                        />
                      </Form>
                    </section>
                  )}
                  <div className="saas-grid">
                    {data.teams.map((t) => (
                      <section className="saas-card" key={t.id}>
                        <h2>
                          <span
                            className="saas-dot"
                            style={{ background: t.color }}
                          />
                          {t.name}
                        </h2>
                        <p>
                          {t.greeting_message || "Sem mensagem configurada."}
                        </p>
                        <div className="saas-tag-list">
                          {data.team_members
                            .filter((tm) => tm.team_id === t.id)
                            .map((tm) => (
                              <button
                                key={tm.user_id}
                                className="saas-badge"
                                disabled={!manager || busy}
                                onClick={() =>
                                  action(async () =>
                                    requireResult(
                                      await supabase
                                        .from("team_members")
                                        .delete()
                                        .eq("organization_id", org.id)
                                        .eq("team_id", t.id)
                                        .eq("user_id", tm.user_id)
                                    )
                                  )
                                }
                              >
                                {displayName(tm.user_id)}
                                {manager ? " ×" : ""}
                              </button>
                            ))}
                        </div>
                        {manager && (
                          <>
                            <select
                              aria-label={`Adicionar membro ao departamento ${t.name}`}
                              value=""
                              disabled={busy}
                              onChange={(e) => {
                                if (e.target.value)
                                  action(async () =>
                                    requireResult(
                                      await supabase
                                        .from("team_members")
                                        .insert({
                                          organization_id: org.id,
                                          team_id: t.id,
                                          user_id: e.target.value,
                                        })
                                    )
                                  );
                              }}
                            >
                              <option value="">Adicionar membro…</option>
                              {data.memberships
                                .filter(
                                  (m) =>
                                    m.active &&
                                    !data.team_members.some(
                                      (tm) =>
                                        tm.team_id === t.id &&
                                        tm.user_id === m.user_id
                                    )
                                )
                                .map((m) => (
                                  <option key={m.user_id} value={m.user_id}>
                                    {displayName(m.user_id)}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="saas-link danger"
                              disabled={busy}
                              onClick={() => remove("teams", t.id)}
                            >
                              Excluir departamento
                            </button>
                          </>
                        )}
                      </section>
                    ))}
                  </div>
                  {!data.teams.length && (
                    <Empty>
                      Crie um departamento para organizar sua equipe.
                    </Empty>
                  )}
                </>
              )}
              {tab === "tags" && (
                <>
                  {manager && (
                    <section className="saas-card">
                      <h2>Nova etiqueta</h2>
                      <Form onSubmit={insert("tags")} busy={busy}>
                        <Field
                          label="Nome"
                          name="name"
                          required
                          minLength={2}
                          maxLength={60}
                        />
                        <Field
                          label="Cor"
                          name="color"
                          type="color"
                          defaultValue="#3956ff"
                        />
                      </Form>
                    </section>
                  )}
                  <section className="saas-card">
                    <h2>Etiquetas da empresa</h2>
                    <div className="saas-tag-list">
                      {data.tags.map((t) => (
                        <span
                          className="saas-badge"
                          style={{ color: t.color }}
                          key={t.id}
                        >
                          {t.name}
                          {manager && (
                            <button
                              disabled={busy}
                              aria-label={`Excluir etiqueta ${t.name}`}
                              onClick={() => remove("tags", t.id)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {!data.tags.length && (
                      <Empty>Nenhuma etiqueta cadastrada.</Empty>
                    )}
                  </section>
                </>
              )}
              {tab === "answers" && (
                <>
                  {manager && (
                    <section className="saas-card">
                      <h2>Nova resposta rápida</h2>
                      <Form onSubmit={insert("quick_answers")} busy={busy}>
                        <Field
                          label="Atalho"
                          name="shortcut"
                          placeholder="boasvindas"
                          required
                          maxLength={30}
                        />
                        <label className="saas-field">
                          <span>Mensagem</span>
                          <textarea name="body" required maxLength={10000} />
                        </label>
                      </Form>
                    </section>
                  )}
                  <div className="saas-grid">
                    {data.quick_answers.map((a) => (
                      <section className="saas-card" key={a.id}>
                        <span className="saas-badge">/{a.shortcut}</span>
                        <p className="saas-preserve">{a.body}</p>
                        {manager && (
                          <button
                            className="saas-link danger"
                            disabled={busy}
                            onClick={() => remove("quick_answers", a.id)}
                          >
                            Excluir
                          </button>
                        )}
                      </section>
                    ))}
                  </div>
                  {!data.quick_answers.length && (
                    <Empty>Nenhuma resposta rápida cadastrada.</Empty>
                  )}
                </>
              )}
              {tab === "members" && (
                <>
                  {manager && (
                    <section className="saas-card">
                      <h2>Convide uma pessoa</h2>
                      <Form
                        onSubmit={createInvite}
                        busy={busy}
                        label="Gerar convite"
                      >
                        <Field
                          label="E-mail do destinatário"
                          name="email"
                          type="email"
                          required
                        />
                        <label className="saas-field">
                          <span>Perfil</span>
                          <select name="role" aria-label="Perfil">
                            <option value="agent">Atendente</option>
                            <option value="supervisor">Supervisor</option>
                            {role === "owner" && (
                              <option value="admin">Administrador</option>
                            )}
                          </select>
                        </label>
                      </Form>
                      {inviteLink && (
                        <div className="saas-invite">
                          <label>
                            Link do convite
                            <input
                              aria-label="Link do convite"
                              readOnly
                              value={inviteLink}
                              onFocus={(e) => e.target.select()}
                            />
                          </label>
                          <button
                            className="saas-secondary"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(inviteLink)
                                .then(() => setMessage("Link copiado."))
                                .catch(() =>
                                  setError(
                                    "Selecione e copie o link manualmente."
                                  )
                                )
                            }
                          >
                            Copiar
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                  <section className="saas-card">
                    <h2>Membros da empresa</h2>
                    <div className="saas-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Pessoa</th>
                            <th>Perfil</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.memberships.map((m) => (
                            <tr key={m.user_id}>
                              <td>{displayName(m.user_id)}</td>
                              <td>{roles[m.role]}</td>
                              <td>{m.active ? "Ativo" : "Desativado"}</td>
                              <td>
                                {manager &&
                                  m.active &&
                                  m.role !== "owner" &&
                                  (m.role !== "admin" || role === "owner") && (
                                    <button
                                      className="saas-link danger"
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            "Desativar o acesso desta pessoa?"
                                          )
                                        )
                                          rpc(
                                            "remove_member",
                                            { org: org.id, member: m.user_id },
                                            "Acesso desativado."
                                          );
                                      }}
                                    >
                                      Desativar
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  {manager && (
                    <section className="saas-card">
                      <h2>Convites</h2>
                      {data.invitations.map((i) => (
                        <div className="saas-row" key={i.id}>
                          <span>
                            <strong>{i.email}</strong>
                            <small>
                              {roles[i.role]} · expira em {stamp(i.expires_at)}
                            </small>
                          </span>
                          <span>
                            {i.accepted_at
                              ? "Aceito"
                              : i.revoked_at
                              ? "Revogado"
                              : new Date(i.expires_at) < new Date()
                              ? "Expirado"
                              : "Pendente"}
                          </span>
                          {!i.accepted_at && !i.revoked_at && (
                            <button
                              className="saas-link danger"
                              disabled={busy}
                              onClick={() =>
                                rpc(
                                  "revoke_invitation",
                                  { invitation_id: i.id },
                                  "Convite revogado."
                                )
                              }
                            >
                              Revogar
                            </button>
                          )}
                        </div>
                      ))}
                      {!data.invitations.length && (
                        <Empty>Nenhum convite criado.</Empty>
                      )}
                    </section>
                  )}
                </>
              )}
              {tab === "conversations" && (
                <>
                  <section className="saas-card">
                    <h2>Novo atendimento interno</h2>
                    <p>
                      Organize um caso com sua equipe. Este formulário não envia
                      mensagens ao WhatsApp.
                    </p>
                    <Form
                      onSubmit={insert("conversations")}
                      busy={busy}
                      label="Criar atendimento"
                    >
                      <Field label="Assunto" name="subject" maxLength={200} />
                      <label className="saas-field">
                        <span>Contato</span>
                        <select name="contact_id" aria-label="Contato" required>
                          <option value="">Selecione…</option>
                          {data.contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="saas-field">
                        <span>Departamento</span>
                        <select name="team_id" aria-label="Departamento">
                          <option value="">Sem departamento</option>
                          {data.teams
                            .filter(
                              (t) =>
                                manager ||
                                role === "supervisor" ||
                                data.team_members.some(
                                  (tm) =>
                                    tm.team_id === t.id &&
                                    tm.user_id === user.id
                                )
                            )
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </Form>
                  </section>
                  <div className="saas-board">
                    {["pending", "open", "closed"].map((status) => (
                      <section key={status}>
                        <h2>
                          {labels[status]}{" "}
                          <small>
                            {
                              data.conversations.filter(
                                (c) => c.status === status
                              ).length
                            }
                          </small>
                        </h2>
                        {data.conversations
                          .filter((c) => c.status === status)
                          .map((c) => (
                            <article key={c.id} className="saas-card">
                              <button
                                className="saas-conversation-title"
                                onClick={() => openConversation(c)}
                              >
                                {c.subject || "Atendimento"}
                                <small>{c.contacts?.name || "Contato"}</small>
                              </button>
                              <p>{c.teams?.name || "Sem departamento"}</p>
                              {c.assigned_to && (
                                <span className="saas-badge">
                                  {displayName(c.assigned_to)}
                                </span>
                              )}
                              <small className="saas-date">
                                {stamp(c.updated_at)}
                              </small>
                              {status === "pending" && (
                                <button
                                  className="saas-secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    rpc(
                                      "claim_conversation",
                                      { conversation: c.id },
                                      "Atendimento assumido."
                                    )
                                  }
                                >
                                  Assumir
                                </button>
                              )}
                              {status === "open" &&
                                (c.assigned_to === user.id ||
                                  manager ||
                                  role === "supervisor") && (
                                  <button
                                    className="saas-secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      rpc(
                                        "close_conversation",
                                        { conversation: c.id },
                                        "Atendimento resolvido."
                                      )
                                    }
                                  >
                                    Resolver
                                  </button>
                                )}
                            </article>
                          ))}
                        {!data.conversations.some(
                          (c) => c.status === status
                        ) && <Empty>Nenhum atendimento.</Empty>}
                      </section>
                    ))}
                  </div>
                  {counts.conversations > 100 && (
                    <p>
                      Exibindo os 100 atendimentos atualizados mais
                      recentemente.
                    </p>
                  )}
                  {selected && (
                    <>
                      {selected.channel_id && (
                        <ConversationMessages
                          key={selected.id}
                          orgId={org.id}
                          conversation={selected}
                          answers={data.quick_answers}
                        />
                      )}
                      <section className="saas-card">
                        <div className="saas-list-heading">
                          <h2>
                            Notas internas · {selected.subject || "Atendimento"}
                          </h2>
                          <button
                            className="saas-link"
                            onClick={() => {
                              noteSequence.current++;
                              setSelected(null);
                            }}
                          >
                            Fechar
                          </button>
                        </div>
                        <p>Visíveis apenas para a equipe autorizada.</p>
                        {notes.map((n) => (
                          <div className="saas-note" key={n.id}>
                            <small>
                              {displayName(n.author_id)} · {stamp(n.created_at)}
                            </small>
                            <p className="saas-preserve">{n.body}</p>
                          </div>
                        ))}
                        <Form
                          busy={busy}
                          label="Adicionar nota"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget,
                              body = new FormData(form).get("body");
                            action(async () => {
                              requireResult(
                                await supabase.from("internal_notes").insert({
                                  organization_id: org.id,
                                  conversation_id: selected.id,
                                  author_id: user.id,
                                  body,
                                })
                              );
                              form.reset();
                              await openConversation(selected);
                            }, "Nota adicionada.");
                          }}
                        >
                          <label className="saas-field">
                            <span>Nota</span>
                            <textarea name="body" required maxLength={10000} />
                          </label>
                        </Form>
                        <h3>Anexos privados</h3>
                        {files.map((f) => (
                          <div className="saas-row" key={f.name}>
                            <span>{f.name.slice(37)}</span>
                            <button
                              className="saas-link"
                              onClick={() => download(f)}
                            >
                              Abrir
                            </button>
                          </div>
                        ))}
                        <label className="saas-upload">
                          Adicionar arquivo até 20 MB
                          <input
                            type="file"
                            disabled={busy}
                            onChange={uploadFile}
                          />
                        </label>
                      </section>
                    </>
                  )}
                </>
              )}
              {tab === "settings" && (
                <>
                  <section className="saas-card">
                    <h2>Dados da empresa</h2>
                    {manager ? (
                      <Form
                        busy={busy}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const values = Object.fromEntries(
                            new FormData(event.currentTarget)
                          );
                          action(async () => {
                            requireResult(
                              await supabase
                                .from("organizations")
                                .update(values)
                                .eq("id", org.id)
                            );
                            await reloadOrgs();
                          });
                        }}
                      >
                        <Field
                          label="Nome"
                          name="name"
                          defaultValue={org.name}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                        <Field
                          label="Fuso horário"
                          name="timezone"
                          defaultValue={org.timezone}
                          required
                        />
                      </Form>
                    ) : (
                      <p>
                        {org.name} · {org.timezone}
                      </p>
                    )}
                  </section>
                  <section className="saas-card">
                    <h2>Seus espaços</h2>
                    <p>
                      Você pode participar de diferentes empresas com a mesma
                      conta.
                    </p>
                    <button
                      className="saas-secondary"
                      onClick={() => setNewOrg(!newOrg)}
                    >
                      {newOrg ? "Cancelar" : "Criar outra empresa"}
                    </button>
                    {newOrg && (
                      <Form
                        label="Criar empresa"
                        busy={busy}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const values = Object.fromEntries(
                            new FormData(event.currentTarget)
                          );
                          action(async () => {
                            requireResult(
                              await supabase.rpc("create_organization", {
                                org_name: values.org_name,
                                display_name: values.display_name,
                              })
                            );
                            await reloadOrgs();
                            setNewOrg(false);
                          }, "Empresa criada.");
                        }}
                      >
                        <Field
                          label="Nome da nova empresa"
                          name="org_name"
                          required
                          minLength={2}
                          maxLength={120}
                        />
                        <Field
                          label="Seu nome"
                          name="display_name"
                          required
                          minLength={2}
                          maxLength={120}
                          defaultValue={
                            displayName(user.id) === "Você"
                              ? ""
                              : displayName(user.id)
                          }
                        />
                      </Form>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
