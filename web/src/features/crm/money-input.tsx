"use client";

import { Input } from "@/components/ui/input";

const formatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Texto "1.014,70" a partir de centavos. Vazio quando não há valor. */
export function formatCentsInput(cents: number): string {
  return cents > 0 ? formatter.format(cents / 100) : "";
}

/** Só os dígitos digitados viram centavos, como no teclado de um app de banco: "10147" → 101,47. */
export function centsFromTyping(text: string): number {
  const digits = text.replace(/\D/g, "").slice(0, 9);
  return digits ? Number(digits) : 0;
}

export function MoneyInput({ id, value, onChange, placeholder }: { id?: string; value: number; onChange: (cents: number) => void; placeholder?: string }) {
  return <Input id={id} inputMode="numeric" autoComplete="off" value={formatCentsInput(value)} placeholder={placeholder ?? "0,00"} onChange={(e) => onChange(centsFromTyping(e.target.value))} />;
}
