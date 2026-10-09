"use client";

import { useEffect, useRef } from "react";

/** Chama a função a cada `intervalMs` enquanto a aba está à vista. Serve para telas sem Realtime. */
export function useVisiblePolling(callback: () => void, intervalMs: number) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") latest.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
