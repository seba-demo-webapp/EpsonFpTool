/**
 * Client FPMate / ePOS Fiscal per stampanti fiscali Epson RT (es. FP-81 II RT).
 * Versione CommonJS per il MAIN process di Electron: la richiesta HTTP parte da
 * Node, quindi NON è soggetta a CORS (la fpmate.cgi non invia header CORS).
 *
 * ⚠️ I codici (paymentType, department, ecc.) vanno confermati sulla
 * "EpsonFPMate Development Guide" per la tua configurazione.
 */

const http = require("http");
const https = require("https");

const PAYMENT_CODE = {
  cash: 0,   // contanti
  card: 2,   // pagamento elettronico
  ticket: 3, // ticket / buoni
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return Number(n).toFixed(2);
}

/** Documento commerciale: apertura -> righe -> totale/pagamento -> chiusura. */
function buildReceiptXml(input) {
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

  const paymentCode = PAYMENT_CODE[input.payment] ?? 0;

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

/** Chiusura giornaliera Z (innesca la trasmissione telematica). */
function buildDailyCloseXml(operator = "1") {
  const op = esc(operator);
  return `<?xml version="1.0" encoding="utf-8"?>
<printerFiscalReport>
    <printZReport operator="${op}" />
</printerFiscalReport>`;
}

function parseResponse(xml) {
  const successMatch = xml.match(/success="?(true|false|1|0)"?/i);
  const codeMatch = xml.match(/code="([^"]*)"/i);
  const statusMatch = xml.match(/status="([^"]*)"/i);
  const recMatch =
    xml.match(/fiscalReceiptNumber="([^"]*)"/i) ||
    xml.match(/receiptNumber="([^"]*)"/i);

  // directIO: <responseCommand> e <responseData> (config/letture)
  const respCmd = xml.match(/<responseCommand>([^<]*)<\/responseCommand>/i);
  const respData = xml.match(/<responseData>([^<]*)<\/responseData>/i);

  const successVal = successMatch && successMatch[1].toLowerCase();
  return {
    success: successVal === "true" || successVal === "1",
    code: codeMatch ? codeMatch[1] : null,
    status: statusMatch ? statusMatch[1] : null,
    raw: xml,
    receiptNumber: recMatch ? recMatch[1] : undefined,
    responseCommand: respCmd ? respCmd[1].trim() : undefined,
    responseData: respData ? respData[1] : undefined,
  };
}

/** Avvolge il payload (senza la propria dichiarazione <?xml?>) in un envelope SOAP,
 *  formato richiesto dal server FPMate della stampante (verificato via sniffing
 *  delle richieste generate dalla pagina web di configurazione della stampante). */
function wrapSoap(xml) {
  const inner = xml.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body>
${inner}
</s:Body>
</s:Envelope>`;
}

/** POST XML alla stampante. Endpoint FPMate tipico: /cgi-bin/fpmate.cgi */
function sendToPrinter(cfg, xml) {
  return new Promise((resolve) => {
    const lib = cfg.https ? https : http;
    const timeout = cfg.timeoutMs ?? 10000;
    const path = `/cgi-bin/fpmate.cgi?devid=${cfg.devid ?? "local_printer"}&timeout=${timeout}`;
    const body = Buffer.from(wrapSoap(xml), "utf-8");

    const req = lib.request(
      {
        host: cfg.ip,
        port: cfg.port ?? (cfg.https ? 443 : 80),
        path,
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": body.length,
        },
        timeout: timeout + 2000,
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf-8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parseResponse(data));
          } else {
            resolve({
              success: false,
              code: `HTTP_${res.statusCode}`,
              status: null,
              raw: data,
            });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      resolve({
        success: false,
        code: "NETWORK_ERROR",
        status: null,
        raw: String(err),
      });
    });

    req.write(body);
    req.end();
  });
}

function printReceipt(cfg, input) {
  return sendToPrinter(cfg, buildReceiptXml(input));
}

function dailyClose(cfg, operator = "1") {
  return sendToPrinter(cfg, buildDailyCloseXml(operator));
}

module.exports = {
  buildReceiptXml,
  buildDailyCloseXml,
  sendToPrinter,
  printReceipt,
  dailyClose,
};
