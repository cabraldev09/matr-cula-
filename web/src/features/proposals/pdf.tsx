import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { DEFAULT_PUNCTUALITY_NOTE, formatIsoDay, money, percent, percent2, visibleProjection, type ProposalDocument } from "@/domain/proposal/document";
import { formatDateTime } from "@/lib/time";

const BLUE = "#1d63c9";
const TEXT = "#1f2328";
const MUTED = "#6b7280";
const LINE = "#d7dde5";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 30, paddingHorizontal: 22, fontSize: 9, color: TEXT, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logo: { height: 34, maxWidth: 170, objectFit: "contain" },
  institution: { textAlign: "right", fontSize: 8.5 },
  institutionName: { fontFamily: "Helvetica-Bold" },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  small: { fontSize: 8.5, color: "#3f4650", marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  summary: { marginTop: 10, marginBottom: 6 },
  line: { fontSize: 10, marginBottom: 2 },
  note: { color: MUTED, fontSize: 8 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4 },
  bulletRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#0ea5e9", marginRight: 5 },
  observation: { fontFamily: "Helvetica-Oblique", fontSize: 11, marginTop: 4, marginBottom: 6 },
  h3: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 3 },
  planning: { backgroundColor: "#e8f2ff", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, fontSize: 7.5, color: "#334155", marginBottom: 4 },
  table: { borderWidth: 0.6, borderColor: LINE, borderRadius: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: LINE },
  headRow: { flexDirection: "row", backgroundColor: "#f3f7fd", borderBottomWidth: 0.6, borderBottomColor: LINE },
  th: { paddingVertical: 3, paddingHorizontal: 3, color: BLUE, fontFamily: "Helvetica-Bold", fontSize: 7.2, textAlign: "right" },
  td: { paddingVertical: 3, paddingHorizontal: 3, fontSize: 7.8, textAlign: "right", borderRightWidth: 0.6, borderRightColor: LINE },
  tdStrong: { color: BLUE, fontFamily: "Helvetica-Bold" },
  productHead: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: LINE, paddingVertical: 4 },
  productTh: { color: MUTED, fontSize: 8, letterSpacing: 0.6 },
  productRow: { flexDirection: "row", paddingVertical: 5, alignItems: "center" },
  total: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#ecfdf3", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 6, marginTop: 2 },
  footer: { position: "absolute", bottom: 14, left: 22, right: 22, fontSize: 6.5, color: "#9ca3af", textAlign: "right" },
});

const COLUMNS = [
  { key: "sem", label: "Sem.", width: 32, align: "left" as const },
  { key: "term", label: "Período", width: 48, align: "left" as const },
  { key: "bolsa", label: "Bolsa", width: 42 },
  { key: "ajuste", label: "Ajuste\nbolsa", width: 40 },
  { key: "reajuste", label: "Reajuste\nsemestral", width: 50 },
  { key: "anualMin", label: "Anual\n5%", width: 38 },
  { key: "totalMin", label: "Ajustes\ntotais 5%", width: 48 },
  { key: "mensalMin", label: "Mensalidade\n5%", width: 58, strong: true },
  { key: "anualMax", label: "Anual\n11%", width: 38 },
  { key: "totalMax", label: "Ajustes\ntotais 11%", width: 48 },
  { key: "mensalMax", label: "Mensalidade\n11%", width: 58, strong: true },
  { key: "diff", label: "Diferença/\nmês", width: 49 },
];

function ProposalPdf({ doc, logo }: { doc: ProposalDocument; logo: Buffer | null }) {
  const { pricing, rules } = doc;
  const firstDue = formatIsoDay(doc.firstPaymentDate);
  const annualLabels = { min: `${rules.annualMinPct}%`, max: `${rules.annualMaxPct}%` };
  const columns = COLUMNS.map((c) => ({
    ...c,
    label: c.label.replace("5%", annualLabels.min).replace("11%", annualLabels.max),
  }));
  return (
    <Document title={`Proposta - ${doc.studentName}`} author={doc.institutionName} creator="Matrícula+">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt (vai para o PDF, não para o HTML) */}
          {logo ? <Image src={{ data: logo, format: logo[0] === 0x89 ? "png" : "jpg" }} style={s.logo} /> : <View />}
          <View style={s.institution}>
            <Text style={s.institutionName}>{doc.institutionName}</Text>
            {doc.institutionDocument ? <Text>CNPJ {doc.institutionDocument}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>Proposta de Bolsa - {doc.courseName}</Text>
        <Text style={s.small}>Semestres: {doc.semesters}</Text>
        <Text style={s.small}>
          Proposta destinada a <Text style={s.bold}>{doc.studentName}</Text>
        </Text>
        <Text style={[s.small, { marginTop: 6 }]}>Documento gerado em {formatDateTime(doc.generatedAt).replace(",", "")}</Text>

        <View style={s.summary}>
          <Text style={s.line}><Text style={s.bold}>Mensalidade bruta atual:</Text> {money(pricing.grossMonthly)}</Text>
          <Text style={s.line}>
            <Text style={s.bold}>Bolsa aplicada:</Text> {percent2(pricing.scholarshipPct)}{" "}
            <Text style={s.note}>(Descontos de pontualidade, desconto de ingressante, campanha comercial etc.)</Text>
          </Text>
          <Text style={[s.line, { marginBottom: 6 }]}>
            <Text style={s.bold}>Primeira Mensalidade:</Text> {money(pricing.firstMonthly)}
            {firstDue ? <Text style={s.note}> (vencimento em {firstDue})</Text> : null}
          </Text>
          <Text style={s.line}>
            <Text style={s.bold}>Taxa de matrícula:</Text> {money(pricing.enrollmentFee)} <Text style={s.note}>(no ato da inscrição)</Text>
          </Text>
          <Text style={s.line}><Text style={s.bold}>Demais mensalidades:</Text> todo dia {rules.dueDay}</Text>
          <Text style={s.line}><Text style={s.bold}>Quantidade de parcelas desse semestre:</Text> {rules.firstTermInstallments}</Text>
        </View>

        <Text style={s.h2}>2ª mensalidade em diante. (Pontualidade já inclusa de {rules.punctualityPct}%).</Text>
        {[
          [`Até o dia ${rules.dueDay}:`, pricing.untilDue, `(com desconto de pontualidade de ${rules.punctualityPct}%)`],
          [`Dias ${rules.dueDay + 1} a 25:`, pricing.lateTier1, `(Perde desconto de pontualidade de ${rules.lateTier1Pct}%.)`],
          ["Após o vencimento:", pricing.lateTier2, `(Perde desconto de pontualidade de ${rules.lateTier2Pct}%.)`],
        ].map(([label, value, note]) => (
          <View key={String(label)} style={s.bulletRow}>
            <View style={s.bullet} />
            <Text style={{ fontSize: 10 }}>
              <Text style={s.bold}>{label}</Text> {money(value as number)} <Text style={s.note}>{note}</Text>
            </Text>
          </View>
        ))}
        <Text style={s.observation}>{doc.punctualityNote ?? DEFAULT_PUNCTUALITY_NOTE}</Text>

        <Text style={s.h3}>Projeção por semestre</Text>
        <Text style={s.planning}>{doc.projectionNote}</Text>
        <View style={s.table}>
          <View style={s.headRow}>
            {columns.map((c) => (
              <Text key={c.key} style={[s.th, { width: c.width, textAlign: c.align ?? "right" }]}>{c.label}</Text>
            ))}
          </View>
          {visibleProjection(doc).map((r) => {
            const values: Record<string, string> = {
              sem: String(r.index),
              term: r.term,
              bolsa: percent(r.scholarshipPct),
              ajuste: percent(r.scholarshipAdjustPct),
              reajuste: percent(r.semesterReadjustPct),
              anualMin: percent(r.annualMinPct),
              totalMin: percent(r.totalMinPct),
              mensalMin: money(r.monthlyMin),
              anualMax: percent(r.annualMaxPct),
              totalMax: percent(r.totalMaxPct),
              mensalMax: money(r.monthlyMax),
              diff: r.differencePerMonth === null ? "-" : money(r.differencePerMonth),
            };
            return (
              <View key={r.index} style={s.row} wrap={false}>
                {columns.map((c) => (
                  <Text key={c.key} style={[s.td, { width: c.width, textAlign: c.align ?? "right" }, c.strong ? s.tdStrong : {}]}>{values[c.key]}</Text>
                ))}
              </View>
            );
          })}
        </View>

        <Text style={[s.h3, { marginTop: 8 }]}>Produtos ou serviços</Text>
        <View style={s.productHead}>
          <Text style={[s.productTh, { width: "44%" }]}>PRODUTO</Text>
          <Text style={[s.productTh, { width: "20%" }]}>PREÇO</Text>
          <Text style={[s.productTh, { width: "20%" }]}>DESCONTO</Text>
          <Text style={[s.productTh, { width: "16%", textAlign: "right" }]}>SUB-TOTAL</Text>
        </View>
        <View style={s.productRow}>
          <View style={{ width: "44%" }}>
            <Text style={[s.bold, { fontSize: 10 }]}>{doc.courseName}</Text>
            <Text style={{ color: MUTED, fontSize: 8.5 }}>{doc.modality}</Text>
          </View>
          <Text style={{ width: "20%", fontSize: 10 }}>{money(pricing.grossMonthly)}</Text>
          <Text style={{ width: "20%", fontSize: 10 }}>{percent2(pricing.scholarshipPct)}</Text>
          <Text style={{ width: "16%", fontSize: 10, textAlign: "right" }}>{money(pricing.firstMonthly)}</Text>
        </View>
        <View style={s.total}>
          <Text style={s.bold}>Valor total do pedido</Text>
          <Text style={s.bold}>{money(pricing.firstMonthly)}</Text>
        </View>

        <Text style={[s.h3, { marginTop: 8 }]}>Mensagem final</Text>
        <Text style={{ fontSize: 10, marginTop: 4 }}>{doc.finalMessage}</Text>

        <Text style={s.footer} fixed>{doc.number ? `Proposta nº ${doc.number} · ` : ""}Gerado com Matrícula+</Text>
      </Page>
    </Document>
  );
}

export async function renderProposalPdf(doc: ProposalDocument, logo: Buffer | null): Promise<Buffer> {
  return renderToBuffer(<ProposalPdf doc={doc} logo={logo} />);
}
