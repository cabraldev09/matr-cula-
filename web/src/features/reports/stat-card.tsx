import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatChange } from "@/features/reports/series";
import { cn } from "@/lib/utils";

/** Indicador com a variação sobre o período anterior. `goodWhenUp=false` pinta de verde quando o número cai (ex.: tempo de resposta). */
export function StatCard({ label, value, hint, change, goodWhenUp = true }: { label: string; value: string | number; hint?: string; change?: number | null; goodWhenUp?: boolean }) {
  const hasChange = change !== undefined;
  const direction = !hasChange || change === 0 ? 0 : change === null || change > 0 ? 1 : -1;
  const good = direction === 0 ? null : (direction > 0) === goodWhenUp;
  const Arrow = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hasChange && (
            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good === null ? "text-muted-foreground" : good ? "text-status-success" : "text-status-danger")} title="Em relação ao período anterior">
              <Arrow className="size-3.5" aria-hidden="true" /> {formatChange(change)}
            </span>
          )}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
