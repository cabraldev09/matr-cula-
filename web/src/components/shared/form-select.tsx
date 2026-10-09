"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Lista do mesmo visual do restante do sistema para formulários com `action` e `FormData`.
 * O Radix cria um campo escondido com o `name`, então `form.get(name)` continua devolvendo o valor escolhido.
 */
export function FormSelect({ id, name, defaultValue, options, className, "aria-label": ariaLabel }: {
  id?: string;
  name: string;
  defaultValue?: string;
  options: readonly (readonly [string, string])[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue ?? options[0]?.[0]}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full", className)}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
