"use client";

import { useState } from "react";
import { ArrowLeft, Building2, Check, KeyRound, LogOut, Menu, Plus, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sidebar } from "@/components/layout/sidebar";
import type { NavContext } from "@/components/layout/nav-items";
import { logoutAction, switchOrganizationAction } from "@/features/auth/actions";
import { FollowUpBell, type FollowUpItem } from "@/components/layout/follow-up-bell";
import { PushToggle } from "@/components/layout/push-toggle";

export interface TopbarOrganization {
  id: string;
  name: string;
}

export function Topbar({
  user,
  nav,
  organizations,
  activeOrganizationId,
  followUps,
  pushPublicKey,
}: {
  user: { name: string; email: string; roleLabel: string };
  nav: NavContext;
  organizations: TopbarOrganization[];
  activeOrganizationId: string;
  followUps: { items: FollowUpItem[]; total: number; teamWide: boolean } | null;
  pushPublicKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <>
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação principal do sistema</SheetDescription>
          <Sidebar nav={nav} variant="drawer" onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <BackButton />
      <OrganizationSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      <div className="flex-1" />
      {followUps && <FollowUpBell items={followUps.items} total={followUps.total} teamWide={followUps.teamWide} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-muted" aria-label="Menu do usuário">
            <Avatar className="size-8">
              <AvatarFallback className="bg-brand-navy text-white text-xs">{initials || <UserRound className="size-4" />}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">{user.roleLabel}</div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/account"><KeyRound className="size-4" /> Minha conta</Link>
          </DropdownMenuItem>
          {followUps && (
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <PushToggle publicKey={pushPublicKey} />
            </DropdownMenuItem>
          )}
          <form action={logoutAction}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Sair
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    </>
  );
}

/** Volta para a página anterior; se a página foi aberta direto (sem histórico), sobe um nível no endereço. */
function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const parent = pathname.split("/").filter(Boolean).slice(0, -1).join("/");
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(parent ? `/${parent}` : "/");
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-slate-600 hover:text-[#003B71]" aria-label="Voltar para a página anterior">
      <ArrowLeft className="size-4" />
      <span className="hidden sm:inline">Voltar</span>
    </Button>
  );
}

/** Troca de empresa (para quem participa de mais de uma) e criação de uma nova. */
function OrganizationSwitcher({ organizations, activeOrganizationId }: { organizations: TopbarOrganization[]; activeOrganizationId: string }) {
  const active = organizations.find((o) => o.id === activeOrganizationId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-[45vw] gap-2 text-slate-700" aria-label="Trocar de empresa">
          <Building2 className="size-4 shrink-0" />
          <span className="truncate font-medium">{active?.name ?? "Empresa"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Suas empresas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((organization) => (
          <form key={organization.id} action={switchOrganizationAction}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                {organization.id === activeOrganizationId ? <Check className="size-4" /> : <span className="size-4" />}
                <span className="truncate">{organization.name}</span>
              </button>
            </DropdownMenuItem>
          </form>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?nova=1"><Plus className="size-4" /> Nova empresa</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
