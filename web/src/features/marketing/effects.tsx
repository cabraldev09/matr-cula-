"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Observa o elemento e dispara uma vez quando entra na tela. */
function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      const timer = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, shown] as const;
}

/** Surge suavemente ao rolar a página (respeita "reduzir movimento"). */
export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const [ref, shown] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref as never} data-shown={shown} className={cn("reveal", className)} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Número que conta até o valor quando aparece. */
export function Counter({ value, prefix = "", suffix = "", duration = 1400 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [ref, shown] = useInView<HTMLSpanElement>(0.4);
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (!shown) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = setTimeout(() => setCurrent(value), 0);
      return () => clearTimeout(timer);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setCurrent(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, value, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {current.toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

export interface FeatureTab {
  title: string;
  text: string;
  image: string;
  alt: string;
}

/** Lista em acordeão: o item aberto troca a tela mostrada ao lado. */
export function FeatureTabs({ items }: { items: FeatureTab[] }) {
  const [active, setActive] = useState(0);
  const current = items[active]!;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.25fr]">
      <ul className="space-y-3">
        {items.map((item, index) => {
          const open = index === active;
          return (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-expanded={open}
                className={cn(
                  "w-full rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                  open ? "border-brand-cyan/40 bg-white shadow-lg shadow-brand-cyan/10" : "border-transparent hover:bg-white/70",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={cn("text-lg font-semibold", open ? "text-brand-navy" : "text-slate-700")}>{item.title}</span>
                  <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-full text-lg transition-transform duration-300", open ? "rotate-45 bg-brand-cyan text-white" : "bg-slate-100 text-slate-500")}>+</span>
                </span>
                <span className={cn("grid transition-all duration-300", open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <span className="overflow-hidden text-sm leading-6 text-slate-600">{item.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="relative">
        <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-cyan/25 via-sky-100 to-brand-gold/20 blur-2xl" />
        <BrowserFrame key={current.image} className="animate-blur-fade">
          {/* eslint-disable-next-line @next/next/no-img-element -- captura estática gerada por script */}
          <img src={current.image} alt={current.alt} width={1600} height={1000} className="block h-auto w-full" />
        </BrowserFrame>
      </div>
    </div>
  );
}

export function BrowserFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/15", className)}>
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-rose-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-300" />
      </div>
      {children}
    </div>
  );
}
