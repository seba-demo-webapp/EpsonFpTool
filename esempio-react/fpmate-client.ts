/**
 * Client FPMate / ePOS Fiscal per stampanti fiscali Epson RT (es. FP-81 II RT)
 * Comunicazione: XML su HTTP POST verso l'IP della stampante in rete.
 *
 * Cross-platform: dipende SOLO da fetch (presente in browser, in Node >= 18,
 * in Electron e in Tauri). Nessun driver da installare.
 *
 * ⚠️ ATTRIBUTI E CODICI: i nomi esatti dei comandi/attributi e i codici
 * (paymentType, department, ecc.) vanno confermati sulla "EpsonFPMate
 * Development Guide" ufficiale. Qui usiamo lo schema ePOS Fiscal standard.
 */

// ---------- Tipi ----------

export interface FpItem {
  description: string;
  quantity: number;
  unitPrice: number;   // prezzo unitario, es. 1.20
  department: number;  // reparto IVA configurato sulla stampante (1, 2, ...)
}

export type PaymentType =
  | "cash"   // contanti
  | "card"   // carta / elettronico
  | "ticket"; // ticket / buoni

export interface ReceiptInput {
  operator?: string;     // codice operatore, default "1"
  items: FpItem[];
  payment: PaymentType;  // tipo di pagamento per il totale
}

export interface FpResponse {
  success: boolean;
  code: string | null;     // codice errore se success=false
  status: string | null;   // stato stampante
  raw: string;             // XML grezzo di risposta (per debug/log)
  receiptNumber?: string;  // numero documento, se presente
}

export interface PrinterConfig {
  ip: string;            // es. "192.168.1.251"
  timeoutMs?: number;    // timeout lato stampante, default 10000
  https?: boolean;       // alcune config usano https; default false (http)
}

// Mappa il tipo di pagamento sul codice paymentType di Epson.
// NB: verifica i codici esatti nella guida FPMate per la tua configurazione.
const PAYMENT_CODE: Record<PaymentType, number> = {
  cash: 0,   // contanti
  card: 2,   // pagamento elettronico
  ticket: 3, // ticket / buoni
};

// ---------- Costruzione XML ----------

/** Escape minimale per il testo dentro gli attributi XML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Formatta un importo con 2 decimali e punto come separatore. */
function money(n: number): string {
  return n.toFixed(2);
}

/**
 * Costruisce il documento XML di un documento commerciale (ex scontrino):
 * apertura -> righe articolo -> totale/pagamento -> chiusura.
 */
export function buildReceiptXml(input: ReceiptInput): string {
  const op = esc(input.operator ?? "1");

  const itemLines = input.items
    .map(
      (it) =>
        `    <printRecItem operator="${op}" description="${esc(it.description)}" ` +
        `quantity="${it.quantity}" unitPrice="${money(it.unitPrice)}" ` +
        `department="${it.department}" justification="1" />`
    )
    .join("\n");

  const total = input.items.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice,
    0
  );

  const paymentCode = PAYMENT_CODE[input.payment];

  return `<?xml version="1.0" encoding="utf-8"?>
<printerFiscalReceipt>
    <beginFiscalReceipt operator="${op}" />
${itemLines}
    <printRecTotal operator="${op}" description="PAGAMENTO" payment="${money(
    total
  )}" paymentType="${paymentCode}" index="1" />
    <endFiscalReceipt operator="${op}" />
</printerFiscalReceipt>`;
}

/** Documento di chiusura giornaliera Z (innesca la trasmissione telematica). */
export function buildDailyCloseXml(operator = "1"): string {
  const op = esc(operator);
  return `<?xml version="1.0" encoding="utf-8"?>
<printerFiscalReport>
    <printZReport operator="${op}" />
</printerFiscalReport>`;
}

// ---------- Invio ----------

/** Estrae i campi principali dalla risposta XML della stampante. */
function parseResponse(xml: string): FpResponse {
  const successMatch = xml.match(/success="?(true|false|1|0)"?/i);
  const codeMatch = xml.match(/code="([^"]*)"/i);
  const statusMatch = xml.match(/status="([^"]*)"/i);
  const recMatch =
    xml.match(/fiscalReceiptNumber="([^"]*)"/i) ||
    xml.match(/receiptNumber="([^"]*)"/i);

  const successVal = successMatch?.[1]?.toLowerCase();
  return {
    success: successVal === "true" || successVal === "1",
    code: codeMatch?.[1] ?? null,
    status: statusMatch?.[1] ?? null,
    raw: xml,
    receiptNumber: recMatch?.[1],
  };
}

/**
 * Invia un documento XML alla stampante via HTTP POST e ritorna l'esito.
 * Endpoint FPMate tipico: /cgi-bin/fpmate.cgi
 */
export async function sendToPrinter(
  cfg: PrinterConfig,
  xml: string
): Promise<FpResponse> {
  const scheme = cfg.https ? "https" : "http";
  const timeout = cfg.timeoutMs ?? 10000;
  const url = `${scheme}://${cfg.ip}/cgi-bin/fpmate.cgi?devid=local_printer&timeout=${timeout}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout + 2000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: xml,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        success: false,
        code: `HTTP_${res.status}`,
        status: null,
        raw: text,
      };
    }
    return parseResponse(text);
  } catch (err) {
    return {
      success: false,
      code: "NETWORK_ERROR",
      status: null,
      raw: String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Funzioni di alto livello ----------

export async function printReceipt(
  cfg: PrinterConfig,
  input: ReceiptInput
): Promise<FpResponse> {
  return sendToPrinter(cfg, buildReceiptXml(input));
}

export async function dailyClose(
  cfg: PrinterConfig,
  operator = "1"
): Promise<FpResponse> {
  return sendToPrinter(cfg, buildDailyCloseXml(operator));
}
