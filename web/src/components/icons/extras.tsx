import { createIcon, type IconProps } from "./create-icon";
import { cn } from "@/lib/utils";

/** Histórico escolar com selo de conferência (módulo Análise curricular). */
export const TranscriptIcon = createIcon("TranscriptIcon", (
  <>
    <path d="M7 3h10a2 2 0 0 1 2 2v7.5M19 17v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" />
    <path className="icon-accent" d="M8.5 8h7M8.5 12h4" />
    <circle className="icon-accent" cx="17" cy="16.2" r="3.2" />
    <path className="icon-accent" d="m15.6 16.2.9.9 1.6-1.8" />
  </>
));

/** Ícones de estado de mensagem (relógio, enviado, entregue, lido, falha). */
export const ClockIcon = createIcon("ClockIcon", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </>
));
export const SentIcon = createIcon("SentIcon", <path d="m5 12.8 4.4 4.4L19 7.6" />);
export const DeliveredIcon = createIcon("DeliveredIcon", <path d="m2.8 12.8 4.4 4.4 9.2-9.6M11.6 15.4l1.4 1.8 8.2-9.6" />);
export const ReadIcon = createIcon("ReadIcon", (
  <path className="icon-accent" d="m2.8 12.8 4.4 4.4 9.2-9.6M11.6 15.4l1.4 1.8 8.2-9.6" />
));
export const FailedIcon = createIcon("FailedIcon", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.6v5.2M12 16.2v.1" />
  </>
));

/** Temperatura do lead: termômetro com três níveis, no lugar da chama. */
export function TemperatureIcon({ level, className, ...props }: IconProps & { level: "quente" | "morno" | "frio" }) {
  const top = level === "quente" ? 7 : level === "morno" ? 10.6 : 14;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M9.8 14.6V5.4a2.2 2.2 0 0 1 4.4 0v9.2a4.2 4.2 0 1 1-4.4 0Z" />
      <path className="icon-accent" d={`M12 ${top}v8`} />
      <circle className="icon-accent" cx="12" cy="17.2" r="1.7" fill="currentColor" />
    </svg>
  );
}

/** Consumo (créditos de IA, cotas): ponteiro sobre uma escala. */
export const MeterIcon = createIcon("MeterIcon", (
  <>
    <path d="M4.2 17.5a8.2 8.2 0 1 1 15.6 0" />
    <path className="icon-accent" d="m12 14 3.6-4.6" />
    <circle className="icon-accent" cx="12" cy="14" r="1.2" />
    <path d="M7 17.5h10" />
  </>
));

/** Documento lido por varredura (importar datas de um PDF). */
export const ScanDocumentIcon = createIcon("ScanDocumentIcon", (
  <>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M14 3v5h5" />
    <path className="icon-accent" d="M3 14h18" />
  </>
));

/** Aplicar correções: lista com conferência. */
export const ApplyFixesIcon = createIcon("ApplyFixesIcon", (
  <>
    <path d="M4 7h9M4 12h6M4 17h8" />
    <path className="icon-accent" d="m14.4 14.6 2.6 2.6 4-4.8" />
  </>
));

/** Canais fora do WhatsApp. */
export const WindowIcon = createIcon("WindowIcon", (
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M3 9h18" />
    <path className="icon-accent" d="M7 6.8h.1M10 6.8h.1" />
  </>
));
export const FrameIcon = createIcon("FrameIcon", (
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle className="icon-accent" cx="12" cy="12" r="3.6" />
  </>
));
export const PixIcon = createIcon("PixIcon", (
  <>
    <path d="m12 3.2 4.4 4.4a2 2 0 0 1 0 2.8L12 14.8 7.6 10.4a2 2 0 0 1 0-2.8L12 3.2Z" />
    <path className="icon-accent" d="m12 21-4.4-4.4a2 2 0 0 1 0-2.8M12 21l4.4-4.4a2 2 0 0 0 0-2.8" />
  </>
));
