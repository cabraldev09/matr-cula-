"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Campo com rótulo e lista. "" significa "não informado" (o Radix não aceita valor vazio, então usa um marcador). */
export function SelectField({ id, label, value, onChange, options, empty = "Não informado", className }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  empty?: string | null;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {empty !== null && <SelectItem value="none">{empty}</SelectItem>}
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
