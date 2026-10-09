"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactsIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { readableError, requireResult } from "@/features/attendance/errors";

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  contact_tags: { tag_id: string }[];
}

const PAGE = 50;

export function Contacts({ organizationId, manager, tags }: { organizationId: string; manager: boolean; tags: { id: string; name: string; color: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const tagById = new Map(tags.map((t) => [t.id, t]));

  const load = useCallback(async () => {
    let request = supabase
      .from("contacts")
      .select("id, name, phone, email, created_at, contact_tags(tag_id)", { count: "exact" })
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (query.trim()) request = request.ilike("name", `%${query.trim().replace(/[%_]/g, "")}%`);
    const result = await request;
    if (result.error) toast.error(readableError(result.error));
    setRows((result.data ?? []) as Contact[]);
    setCount(result.count ?? 0);
    setLoading(false);
  }, [supabase, organizationId, page, query]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    const channel = supabase
      .channel(`contacts:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `organization_id=eq.${organizationId}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId, load]);

  async function toggleTag(contact: Contact, tagId: string) {
    const has = contact.contact_tags.some((t) => t.tag_id === tagId);
    const result = has
      ? await supabase.from("contact_tags").delete().eq("organization_id", organizationId).eq("contact_id", contact.id).eq("tag_id", tagId)
      : await supabase.from("contact_tags").insert({ organization_id: organizationId, contact_id: contact.id, tag_id: tagId });
    if (result.error) toast.error(readableError(result.error));
    else load();
  }

  async function remove(contact: Contact) {
    if (!window.confirm(`Excluir ${contact.name}? As conversas dele também deixam de existir.`)) return;
    const result = await supabase.from("contacts").delete().eq("organization_id", organizationId).eq("id", contact.id);
    if (result.error) toast.error(readableError(result.error));
    else {
      toast.success("Contato excluído.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} placeholder="Buscar pelo nome" className="pl-8" aria-label="Buscar contato" />
        </div>
        <ContactDialog organizationId={organizationId} onSaved={load} />
      </div>
      <Card className="overflow-hidden shadow-sm">
        <ul className="divide-y">
          {loading ? (
            <li className="flex justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></li>
          ) : rows.length === 0 ? (
            <li className="p-4"><EmptyState icon={ContactsIcon} title="Nenhum contato encontrado" description="Os contatos aparecem sozinhos quando alguém escreve no WhatsApp do polo. Também dá para cadastrar um manualmente." compact /></li>
          ) : (
            rows.map((contact) => (
              <li key={contact.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <PersonAvatar name={contact.name} />
                  <div className="min-w-0">
                  <p className="truncate font-medium">{contact.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "Sem telefone ou e-mail"}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((tag) => {
                      const active = contact.contact_tags.some((t) => t.tag_id === tag.id);
                      return (
                        <button key={tag.id} type="button" onClick={() => toggleTag(contact, tag.id)} aria-pressed={active}>
                          <Badge variant={active ? "default" : "outline"} style={active ? { backgroundColor: tag.color } : { borderColor: tag.color, color: tag.color }}>
                            {tagById.get(tag.id)?.name}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
                </div>
                <div className="flex gap-1 sm:justify-end">
                  <ContactDialog organizationId={organizationId} contact={contact} onSaved={load} />
                  {manager && <Button size="sm" variant="ghost" onClick={() => remove(contact)} aria-label={`Excluir ${contact.name}`}><Trash2 className="size-4" /></Button>}
                </div>
              </li>
            ))
          )}
        </ul>
      </Card>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{count} contato{count === 1 ? "" : "s"}</span>
        <span className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= count} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </span>
      </div>
    </div>
  );
}

function ContactDialog({ organizationId, contact, onSaved }: { organizationId: string; contact?: Contact; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    const values = {
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").replace(/[^\d+]/g, "") || null,
      email: String(form.get("email") ?? "").trim() || null,
    };
    try {
      if (contact) requireResult(await supabase.from("contacts").update({ ...values, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", contact.id));
      else requireResult(await supabase.from("contacts").insert({ ...values, organization_id: organizationId }));
      toast.success(contact ? "Contato atualizado." : "Contato criado.");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {contact ? <Button size="sm" variant="outline">Editar</Button> : <Button><Plus className="size-4" /> Novo contato</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>Telefone com DDI e DDD, só números (ex.: 5569999999999).</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="c-name">Nome</Label><Input id="c-name" name="name" required minLength={2} maxLength={120} defaultValue={contact?.name} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-phone">Telefone</Label><Input id="c-phone" name="phone" inputMode="tel" defaultValue={contact?.phone ?? ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-email">E-mail</Label><Input id="c-email" name="email" type="email" defaultValue={contact?.email ?? ""} /></div>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
