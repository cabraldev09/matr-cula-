import { describe, expect, it } from "vitest";
import { buildPixPayload, crc16 } from "@/services/payments/pix";

describe("Pix copia-e-cola", () => {
  it("usa o CRC16-CCITT do padrão (vetor 123456789 → 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("monta o BR Code com chave, valor, recebedor, cidade e identificador", () => {
    const payload = buildPixPayload({ key: "polo@exemplo.com.br", merchantName: "Polo Educação Ltda", merchantCity: "Porto Velho", amountCents: 9900, txid: "TAXA-000123" });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("0014br.gov.bcb.pix0119polo@exemplo.com.br");
    expect(payload).toContain("540599.00");
    expect(payload).toContain("5802BR");
    expect(payload).toContain("5918POLO EDUCACAO LTDA");
    expect(payload).toContain("6011PORTO VELHO");
    expect(payload).toContain("62140510TAXA000123");
    const crc = payload.slice(-4);
    expect(crc16(payload.slice(0, -4))).toBe(crc);
  });

  it("recusa chave ou valor inválidos", () => {
    expect(() => buildPixPayload({ key: "", merchantName: "A", merchantCity: "B", amountCents: 100, txid: "x" })).toThrow();
    expect(() => buildPixPayload({ key: "k", merchantName: "A", merchantCity: "B", amountCents: 0, txid: "x" })).toThrow();
  });
});
