"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_OPTIONS, type PeriodKey } from "@/features/reports/period";

/** Troca o período na hora, sem botão "Aplicar". Datas próprias abrem dois campos. */
export function PeriodFilter({ active, fromDay, toDay, today }: { active: PeriodKey; fromDay: string; toDay: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [custom, setCustom] = useState(active === "personalizado");
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);

  function go(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        value={custom ? "personalizado" : active}
        onValueChange={(value) => {
          if (value === "personalizado") {
            setCustom(true);
            return;
          }
          setCustom(false);
          go((p) => {
            p.delete("de");
            p.delete("ate");
            p.set("periodo", value);
          });
        }}
      >
        <SelectTrigger aria-label="Período" className="h-9 w-48 bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          <SelectItem value="personalizado">Datas próprias</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <>
          <label className="text-xs text-muted-foreground">De<Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40 bg-card" /></label>
          <label className="text-xs text-muted-foreground">Até<Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40 bg-card" /></label>
          <Button size="sm" disabled={!from || !to || from > to} onClick={() => go((p) => { p.delete("periodo"); p.set("de", from); p.set("ate", to); })}>Aplicar</Button>
        </>
      )}
    </div>
  );
}
