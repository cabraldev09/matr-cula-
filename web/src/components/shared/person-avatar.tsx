import { cn } from "@/lib/utils";

/** Combinações da paleta da marca. A cor sai do nome, então a mesma pessoa tem sempre a mesma cor. */
const TONES = [
  "bg-brand-navy text-white",
  "bg-brand-cyan text-white",
  "bg-[#07538d] text-white",
  "bg-brand-cyan-50 text-brand-cyan-700 ring-1 ring-inset ring-brand-cyan/30",
  "bg-brand-navy-50 text-brand-navy ring-1 ring-inset ring-brand-navy/20",
  "bg-brand-gold-50 text-brand-gold-700 ring-1 ring-inset ring-brand-gold-700/20",
] as const;

const SIZES = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-base" } as const;

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}

function toneIndex(name: string): number {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONES.length;
}

export function PersonAvatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-semibold tracking-tight", SIZES[size], TONES[toneIndex(name)], className)}>
      {initialsOf(name)}
    </span>
  );
}
