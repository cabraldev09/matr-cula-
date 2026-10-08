import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/planos", label: "Planos" },
];

export function AdminNav({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Painel da plataforma">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active === item.href ? "border-brand-cyan text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
