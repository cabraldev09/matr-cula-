/**
 * Pix copia-e-cola estático (BR Code, padrão EMV do Banco Central) com valor e identificador.
 * Não depende de banco: o polo confirma o recebimento manualmente no CRM.
 */

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e símbolos não aceitos nos campos de texto do BR Code. */
function plain(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

export interface PixInput {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  /** Identificador da cobrança (até 25 letras/números). */
  txid: string;
  description?: string;
}

export function buildPixPayload(input: PixInput): string {
  const key = input.key.trim();
  if (!key || key.length > 77) throw new Error("Chave Pix inválida.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Valor inválido.");
  const txid = input.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const account = field("00", "br.gov.bcb.pix") + field("01", key) + (input.description ? field("02", plain(input.description, 40)) : "");
  const body =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (input.amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", plain(input.merchantName, 25) || "RECEBEDOR") +
    field("60", plain(input.merchantCity, 15) || "BRASIL") +
    field("62", field("05", txid)) +
    "6304";
  return body + crc16(body);
}
