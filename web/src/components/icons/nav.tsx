import { createIcon } from "./create-icon";

/** Menu lateral. Cada ícone traz um detalhe do universo de matrícula. */
export const HomeIcon = createIcon("HomeIcon", (
  <>
    <path d="M4 11.2 12 4l8 7.2" />
    <path d="M6 9.8V20h12V9.8" />
    <path className="icon-accent" d="M10 20v-5a2 2 0 0 1 4 0v5" />
  </>
));

export const ChatIcon = createIcon("ChatIcon", (
  <>
    <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    <path className="icon-accent" d="M7.5 9.5h9M7.5 12.5h5" />
  </>
));

export const ContactsIcon = createIcon("ContactsIcon", (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle className="icon-accent" cx="9" cy="10.8" r="2" />
    <path d="M5.8 16.2c.6-1.5 1.8-2.2 3.2-2.2s2.6.7 3.2 2.2M15 10h3M15 13.2h3" />
  </>
));

export const ChannelsIcon = createIcon("ChannelsIcon", (
  <>
    <rect x="7" y="2.8" width="10" height="18.4" rx="2.6" />
    <path d="M10.6 18h2.8" />
    <path className="icon-accent" d="M9.2 8.8a4 4 0 0 1 5.6 0M10.9 10.9a1.7 1.7 0 0 1 2.2 0" />
  </>
));

export const TeamsIcon = createIcon("TeamsIcon", (
  <>
    <circle cx="12" cy="6" r="2.2" />
    <circle cx="6" cy="17" r="2.2" />
    <circle cx="18" cy="17" r="2.2" />
    <path className="icon-accent" d="m10.7 7.9-3.4 7M13.3 7.9l3.4 7M8.4 17h7.2" />
  </>
));

export const NewAnalysisIcon = createIcon("NewAnalysisIcon", (
  <>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M14 3v5h5" />
    <path className="icon-accent" d="M12 11.5v5.5M9.2 14.2h5.6" />
  </>
));

export const AnalysesIcon = createIcon("AnalysesIcon", (
  <>
    <path d="M8 3h9a2 2 0 0 1 2 2v11" />
    <rect x="4" y="7" width="12" height="14" rx="2" />
    <path className="icon-accent" d="M7.5 12h5M7.5 16h3" />
  </>
));

export const ReviewIcon = createIcon("ReviewIcon", (
  <>
    <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path className="icon-accent" d="m9 12.6 2.3 2.3 4.2-4.6" />
  </>
));

/** Degraus de semestre: o caminho do aluno até a formatura, com a bandeira na última etapa. */
export const StepsIcon = createIcon("StepsIcon", (
  <>
    <path d="M3.5 20.5h5.2v-5h5.2v-5h6.6" />
    <path className="icon-accent" d="M17 10.5V4.2M17 4.2l3.6 1.5L17 7.2" />
  </>
));

export const RequestsIcon = createIcon("RequestsIcon", (
  <>
    <path d="m4 13 2-6.4A2 2 0 0 1 7.9 5.2h8.2A2 2 0 0 1 18 6.6l2 6.4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" />
    <path d="M4 13h4.5l1 2.2h5l1-2.2H20" />
    <path className="icon-accent" d="M12 7.2v3.6M10.2 9.2 12 11l1.8-1.8" />
  </>
));

export const StudentsIcon = createIcon("StudentsIcon", (
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <circle className="icon-accent" cx="17" cy="9" r="2.4" />
    <path className="icon-accent" d="M16.6 14.4a4.6 4.6 0 0 1 4.4 4.8" />
  </>
));

export const PeopleIcon = createIcon("PeopleIcon", (
  <>
    <circle cx="10" cy="8" r="3.2" />
    <path d="M4 20a6 6 0 0 1 12 0" />
    <path className="icon-accent" d="M19 8v6M16 11h6" />
  </>
));

export const GradesIcon = createIcon("GradesIcon", (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17" />
    <path className="icon-accent" d="M9.5 9.5v10M3.5 14.5h17" />
  </>
));

export const ReportsIcon = createIcon("ReportsIcon", (
  <>
    <path d="M4 20h16M7 20v-5M12 20V9M17 20v-7" />
    <path className="icon-accent" d="m5 8.5 4.6-3.4 3.6 2.6L19 3.8" />
  </>
));

/** Ajustes: três controles deslizantes, no lugar da engrenagem. */
export const SettingsIcon = createIcon("SettingsIcon", (
  <>
    <path d="M4 7h6M14 7h6M4 12h2M10 12h10M4 17h10M18 17h2" />
    <circle className="icon-accent" cx="12" cy="7" r="2" />
    <circle className="icon-accent" cx="8" cy="12" r="2" />
    <circle className="icon-accent" cx="16" cy="17" r="2" />
  </>
));

export const CompanyIcon = createIcon("CompanyIcon", (
  <>
    <path d="M5 20V6.6L12 4l7 2.6V20M3.5 20h17" />
    <path className="icon-accent" d="M9 9.5h1.5M13.5 9.5H15M9 13h1.5M13.5 13H15" />
    <path d="M11 20v-3h2v3" />
  </>
));

export const PlanIcon = createIcon("PlanIcon", (
  <>
    <path d="m12 4 8 4-8 4-8-4 8-4Z" />
    <path className="icon-accent" d="m4 12 8 4 8-4" />
    <path d="m4 16 8 4 8-4" />
  </>
));

export const AccountIcon = createIcon("AccountIcon", (
  <>
    <circle cx="12" cy="12" r="9" />
    <circle className="icon-accent" cx="12" cy="10" r="3" />
    <path d="M6.3 18.2a6.5 6.5 0 0 1 11.4 0" />
  </>
));

export const PlatformIcon = createIcon("PlatformIcon", (
  <>
    <path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9L12 3Z" />
    <circle className="icon-accent" cx="12" cy="12" r="2.6" />
  </>
));

/** Funil de matrículas: etapas que estreitam até a vaga confirmada. */
export const FunnelIcon = createIcon("FunnelIcon", (
  <>
    <path d="M4 5h16l-6 7.4V19l-4 2v-8.6L4 5Z" />
    <path className="icon-accent" d="M8 8.6h8" />
  </>
));

export const ProposalIcon = createIcon("ProposalIcon", (
  <>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M14 3v5h5" />
    <path className="icon-accent" d="m9 17 6-6" />
    <circle className="icon-accent" cx="9.4" cy="11.4" r="1" />
    <circle className="icon-accent" cx="14.6" cy="16.6" r="1" />
  </>
));

export const CoursesIcon = createIcon("CoursesIcon", (
  <>
    <path d="M3.5 6.5c2.6-1.5 5.7-1.5 8.5 0 2.8-1.5 5.9-1.5 8.5 0V19c-2.6-1.5-5.7-1.5-8.5 0-2.8-1.5-5.9-1.5-8.5 0V6.5Z" />
    <path d="M12 6.5V19" />
    <path className="icon-accent" d="M6.5 10.2h2.6M14.9 10.2h2.6" />
  </>
));
