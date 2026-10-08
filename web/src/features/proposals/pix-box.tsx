"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** QR Code e copia-e-cola do Pix da taxa de matrícula. */
export function PixBox({ payload, qrSvg }: { payload: string; qrSvg: string }) {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto size-44 rounded-xl bg-white p-2 ring-1 ring-slate-200 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="min-w-0 space-y-2">
        <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{payload}</p>
        <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(payload).then(() => toast.success("Código Pix copiado."))}>
          <Copy className="size-4" /> Copiar código Pix
        </Button>
      </div>
    </div>
  );
}
