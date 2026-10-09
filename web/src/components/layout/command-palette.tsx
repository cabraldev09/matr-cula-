"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { isNavVisible, NAV_SECTIONS, SETTINGS_NAV, type NavContext } from "@/components/layout/nav-items";

interface Destination {
  href: string;
  label: string;
  group: string;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function destinationsFor(nav: NavContext): Destination[] {
  const pages: Destination[] = [];
  for (const section of NAV_SECTIONS) {
    if (section.module && !nav.modules.includes(section.module)) continue;
    for (const item of section.items) if (isNavVisible(item, nav)) pages.push({ href: item.href, label: item.label, group: section.label ?? "Geral" });
  }
  for (const item of SETTINGS_NAV) if (isNavVisible(item, nav)) pages.push({ href: item.href, label: item.label, group: "Configurações" });
  if (nav.platformAdmin) pages.push({ href: "/admin", label: "Plataforma", group: "Geral" });
  return pages;
}

export function filterDestinations(pages: readonly Destination[], query: string): Destination[] {
  const needle = normalize(query.trim());
  return needle ? pages.filter((page) => normalize(`${page.label} ${page.group}`).includes(needle)) : [...pages];
}

interface LeadHit {
  id: string;
  stage: string;
  contacts: { name: string } | null;
}

/** Paleta de comandos (Ctrl+K ou ⌘K): vai para qualquer página do menu e encontra leads pelo nome. */
export function CommandPalette({ nav, organizationId }: { nav: NavContext; organizationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<LeadHit[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const pages = useMemo(() => destinationsFor(nav), [nav]);
  const visiblePages = useMemo(() => filterDestinations(pages, query), [pages, query]);
  const searchId = useRef(0);
  const hasCrm = nav.modules.includes("crm");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!open || !hasCrm || term.length < 2) {
      const clear = setTimeout(() => setLeads([]), 0);
      return () => clearTimeout(clear);
    }
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data } = await supabase.from("leads").select("id, stage, contacts!inner(name)").eq("organization_id", organizationId).ilike("contacts.name", like).order("updated_at", { ascending: false }).limit(6);
      if (id === searchId.current) setLeads((data ?? []) as unknown as LeadHit[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, hasCrm, supabase, organizationId]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const groups = [...new Set(visiblePages.map((p) => p.group))];
  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-brand-navy-50 data-[selected=true]:text-brand-navy";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-brand-cyan/50 hover:text-foreground md:flex"
        aria-label="Buscar páginas e leads (Ctrl K)"
      >
        <Search className="size-4" aria-hidden="true" /> Buscar
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery(""); }}>
        <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <DialogDescription className="sr-only">Digite para ir a uma página ou encontrar um lead. Use as setas e Enter.</DialogDescription>
          <Command shouldFilter={false} label="Buscar páginas e leads" loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Ir para uma página ou buscar um lead pelo nome" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">Nada encontrado.</Command.Empty>
              {leads.length > 0 && (
                <Command.Group heading="Leads" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {leads.map((lead) => (
                    <Command.Item key={lead.id} value={`lead-${lead.id}`} onSelect={() => go(`/crm?lead=${lead.id}`)} className={item}>
                      <PersonAvatar name={lead.contacts?.name ?? "Lead"} size="sm" /> {lead.contacts?.name ?? "Lead"}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {groups.map((group) => (
                <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {visiblePages.filter((p) => p.group === group).map((page) => (
                    <Command.Item key={page.href} value={page.href} onSelect={() => go(page.href)} className={item}>{page.label}</Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
