import type { ModuleCode } from "@/lib/modules";
import type { IconComponent } from "./create-icon";
import { ChannelsIcon, ChatIcon, FunnelIcon, GradesIcon, PlatformIcon, StudentsIcon, TeamsIcon } from "./nav";
import { MeterIcon, TranscriptIcon } from "./extras";

/** Ícone de cada módulo vendável (cartões do Início, planos, site). */
export const MODULE_ICONS: Record<ModuleCode, IconComponent> = {
  atendimento: ChatIcon,
  crm: FunnelIcon,
  analise_curricular: TranscriptIcon,
  portal_aluno: StudentsIcon,
  grades_comerciais: GradesIcon,
  chatbot: TeamsIcon,
  campanhas: ChannelsIcon,
  ia: MeterIcon,
  api: PlatformIcon,
};
