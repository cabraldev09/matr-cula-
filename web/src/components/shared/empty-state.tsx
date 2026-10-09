import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { IconComponent } from "@/components/icons";

/** Estado vazio com a identidade da marca: ícone próprio sobre um selo e um texto que diz o próximo passo. */
export function EmptyState({ icon: Icon, title, description, action, className, compact = false }: {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-4 text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      <span className="relative grid size-14 place-items-center rounded-2xl bg-brand-navy-50 text-brand-navy">
        <span aria-hidden="true" className="absolute -right-1 -top-1 size-3 rounded-full bg-brand-gold ring-2 ring-card" />
        <Icon className={compact ? "size-6" : "size-7"} />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
