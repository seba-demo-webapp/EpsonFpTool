/**
 * Builder XML per la CONFIGURAZIONE della stampante fiscale Epson RT (FP-81 II RT)
 * via ePOS Fiscal Print Solution.
 *
 * METODO UFFICIALE (confermato su "ePOS Fiscal Print Solution Development Guide"
 * Rev. U, §5.3.2): i comandi di programmazione/lettura si inviano con l'elemento
 *
 *     <directIO command="HHHH" data="..." />
 *
 * dove `command` = concatenazione H1+H2 (4 cifre) e `data` = i campi rimanenti
 * del PDU nativo, a LARGHEZZA FISSA (vedi "Communication Protocol" Rev. 8.10).
 * Un singolo comando va in <printerCommand>; più comandi in <printerCommands>.
 *
 * Nessun meccanismo correttivo (arrotondamento/troncamento) agisce qui: il
 * payload deve rispettare ESATTAMENTE lunghezze e range dei campi.
 *
 * Comandi implementati:
 *   Intestazione      3-016  (DESCR 40 byte, riga 99 = conferma)   lettura 3-216
 *   Reparto           4-002  (PDU dati 72 byte)                    lettura 4-202
 *   Aliquota IVA      4-005  (N 2 + VAL 4)                         lettura 4-205
 *   Carte di credito  4-007  (N 2 + DESC 20)                       lettura 4-207
 *   Ticket / buoni    4-010  (N 2 + DESC 20 + VAL 9)               lettura 4-210
 *   Contanti          4-053  (N 2 + DESC 20)                       lettura 4-253
 */

// ---------- helper di formattazione campi ----------

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Campo numerico: intero, allineato a destra, zero-padded a `len`. */
function num(value, len) {
  const s = String(Math.trunc(Math.abs(Number(value) || 0)));
  if (s.length > len) throw new Error(`Valore ${value} troppo lungo per campo ${len} cifre`);
  return s.padStart(len, "0");
}

/** Campo alfanumerico: maiuscolo, troncato e space-padded a destra a `len`. */
function text(value, len) {
  let s = String(value == null ? "" : value).toUpperCase().slice(0, len);
  return s.padEnd(len, " ");
}

/** Euro -> centesimi (intero). 1.20 -> 120 */
function cents(euro) {
  return Math.round((Number(euro) || 0) * 100);
}

// ---------- envelope ----------

function single(command, data, comment) {
  const c = comment ? ` comment="${esc(comment)}"` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<printerCommand>
  <directIO command="${command}" data="${data}"${c} />
</printerCommand>`;
}

function multi(directios) {
  return `<?xml version="1.0" encoding="utf-8"?>
<printerCommands>
${directios.map((d) => "  " + d).join("\n")}
</printerCommands>`;
}

function dio(command, data, comment) {
  const c = comment ? ` comment="${esc(comment)}"` : "";
  return `<directIO command="${command}" data="${esc(data)}"${c} />`;
}

// ---------------------------------------------------------------------------
// INTESTAZIONE — 3-016  (data = LN[2] + DESCR[40])
// LN=01 cancella le righe successive; LN=99 conferma in memoria.
// ---------------------------------------------------------------------------

function buildHeaderXml(lines, commit = true) {
  const cmds = [];
  lines.forEach((line, i) => {
    const ln = num(i + 1, 2);
    cmds.push(dio("3016", ln + text(line, 40), `Intestazione riga ${i + 1}`));
  });
  if (commit) {
    // riga 99 = commit definitivo (DESCR resta 40 byte)
    cmds.push(dio("3016", num(99, 2) + text("", 40), "Conferma intestazione"));
  }
  return multi(cmds);
}

function buildReadHeaderXml(lineNumber) {
  return single("3216", num(lineNumber, 2), `Leggi intestazione riga ${lineNumber}`);
}

// ---------------------------------------------------------------------------
// REPARTO — 4-002
// data = DN[2] DESC[20] P1[9] P2[9] P3[9] SINGLE[1] VATGRP[2] PLIM[9]
//        PRNGRP[2] PRODGRP[2] MU[2] SALESTYPE[1] SALESATTR[2] ATECO[2]
// ---------------------------------------------------------------------------

function buildDepartmentXml(dep) {
  const data =
    num(dep.number, 2) +
    text(dep.description, 20) +
    num(cents(dep.price1), 9) +
    num(cents(dep.price2), 9) +
    num(cents(dep.price3), 9) +
    num(dep.single ? 1 : 0, 1) +
    num(dep.vatGroup, 2) +
    num(cents(dep.priceLimit), 9) +
    num(dep.printGroup || 0, 2) +
    num(dep.productGroup || 0, 2) +
    text(dep.unitOfMeasure || "", 2) +
    num(dep.salesType === "services" ? 1 : 0, 1) +
    num(dep.salesAttribute || 0, 2) +
    num(dep.ateco || 0, 2);
  return single("4002", data, `Reparto ${dep.number}`);
}

function buildReadDepartmentXml(number) {
  return single("4202", num(number, 2), `Leggi reparto ${number}`);
}

// ---------------------------------------------------------------------------
// ALIQUOTA IVA — 4-005  (data = N[2] + VAL[4], VAL in centesimi di punto)
// ---------------------------------------------------------------------------

function buildVatXml(vat) {
  const val = num(Math.round(Number(vat.rate) * 100), 4); // 22.00% -> "2200"
  return single("4005", num(vat.group, 2) + val, `IVA gruppo ${vat.group} = ${vat.rate}%`);
}

function buildReadVatXml(group) {
  return single("4205", num(group, 2), `Leggi IVA gruppo ${group}`);
}

// ---------------------------------------------------------------------------
// PAGAMENTI
// ---------------------------------------------------------------------------

// Carte 4-007: data = N[2] + DESC[20]
function buildCreditCardXml(index, description) {
  return single("4007", num(index, 2) + text(description, 20), `Carta ${index}`);
}

// Ticket 4-010: data = N[2] + DESC[20] + VAL[9]  (valore in centesimi)
function buildTicketXml(index, description, value) {
  const data = num(index, 2) + text(description, 20) + num(cents(value), 9);
  return single("4010", data, `Ticket ${index}`);
}

// Contanti 4-053: data = N[2] + DESC[20]  (indice 01-05)
function buildCashXml(index, description) {
  return single("4053", num(index, 2) + text(description, 20), `Contanti ${index}`);
}

function buildReadPaymentsXml(kind, index) {
  if (kind === "card") return single("4207", num(index, 2), `Leggi carta ${index}`);
  if (kind === "ticket") return single("4210", num(index, 2), `Leggi ticket ${index}`);
  return single("4253", num(index, 2), `Leggi contanti ${index}`);
}

// ---------------------------------------------------------------------------
// OPERATORI — 4-013  (data = N[2] + DESC[20] + PSW[4] + %OP[4])  lettura 4-213
// ---------------------------------------------------------------------------

function buildOperatorXml(op) {
  const data =
    num(op.number, 2) +
    text(op.description, 20) +
    num(op.password || 0, 4) +
    num(Math.round((Number(op.commission) || 0) * 100), 4);
  return single("4013", data, `Operatore ${op.number}`);
}

function buildReadOperatorXml(number) {
  return single("4213", num(number, 2), `Leggi operatore ${number}`);
}

// ---------------------------------------------------------------------------
// DATA E ORA — 4-001  (data = DD[2] MM[2] YY[2] HH[2] MM[2])  lettura 4-201
// Richiede giornata chiusa se la stampante è censita. Secondi non impostabili.
// ---------------------------------------------------------------------------

function buildDateTimeXml(dt) {
  const data =
    num(dt.day, 2) + num(dt.month, 2) + num(dt.year, 2) +
    num(dt.hour, 2) + num(dt.minute, 2);
  return single("4001", data, "Imposta data/ora");
}

function buildReadDateTimeXml() {
  return single("4201", "", "Leggi data/ora");
}

// ---------------------------------------------------------------------------
// FLAG DI CONFIGURAZIONE — 4-014  (data = N[2] + VAL[1], N 01-69, VAL 0/1)
// Programmabili anche a documento aperto. Lettura 4-214.
// ---------------------------------------------------------------------------

// Flag più rilevanti per l'integrazione software (nome italiano da protocollo).
const FLAGS = {
  3:  "STAMPA AP. CASS. (doc. gestionale su apertura cassetto)",
  4:  "OPERATORI (modalità operatori attiva)",
  5:  "OPERATORI SEGRETI (password obbligatoria)",
  6:  "RESET OPERATORE (disattiva a fine documento)",
  7:  "STAMPA OPERATORE (riga operatore nel documento)",
  8:  "STAMPA N. PEZZI",
  13: "OBBLIGO SUBTOTALE (subtotale prima del pagamento)",
  14: "NTP ABILITATO (sincronizzazione orario)",
  26: "AP. AUT. CASSETTO (apre cassetto a chiusura doc.)",
  29: "JAVAPOS-UPOS (chiusura esplicita con endFiscalReceipt)",
  34: "ORA LEGALE (cambio ora solare/legale)",
  57: "RT PAGAMENTI (dettaglio forme di pagamento)",
  58: "RT RESO MERCE = NdC (resi come nota di credito)",
  59: "RT ANNULLAM. = NdC (annulli come nota di credito)",
};

function buildFlagXml(number, value) {
  return single(
    "4014",
    num(number, 2) + num(value ? 1 : 0, 1),
    `Flag ${number} = ${value ? 1 : 0}`
  );
}

function buildReadFlagXml(number) {
  return single("4214", num(number, 2), `Leggi flag ${number}`);
}

// ---------------------------------------------------------------------------
// DECODER delle risposte directIO (responseData = campi RX, senza checksum)
// Restituisce una stringa leggibile per la UI; null se comando non gestito.
// ---------------------------------------------------------------------------

function pct(v4) {
  return (parseInt(v4, 10) / 100).toFixed(2) + "%";
}
function eur(v9) {
  return "€ " + (parseInt(v9, 10) / 100).toFixed(2);
}

function decodeResponse(command, data) {
  if (!data) return null;
  const d = String(data);
  switch (command) {
    case "3216": // LN[2] DESCR[40]
      return `Riga ${d.slice(0, 2)}: "${d.slice(2, 42).trimEnd()}"`;
    case "4205": // N[2] VAL[4]
      return `Gruppo IVA ${d.slice(0, 2)} → ${pct(d.slice(2, 6))}`;
    case "4207": // N[2] DESC[20]
      return `Carta ${d.slice(0, 2)}: "${d.slice(2, 22).trimEnd()}"`;
    case "4210": // N[2] DESC[20] VAL[9]
      return `Ticket ${d.slice(0, 2)}: "${d.slice(2, 22).trimEnd()}" — valore ${eur(d.slice(22, 31))}`;
    case "4253": // N[2] DESC[20]
      return `Contanti ${d.slice(0, 2)}: "${d.slice(2, 22).trimEnd()}"`;
    case "4202": { // DN[2] DESC[20] P1[9] P2[9] P3[9] SINGLE[1] VATGRP[2] PLIM[9] PRNGRP[2] PRODGRP[2] MU[2] SALESTYPE[1] ...
      // DN[2] DESC[20] P1[9] P2[9] P3[9] SINGLE[1] VATGRP[2] PLIM[9] PRNGRP[2] PRODGRP[2] MU[2] SALESTYPE[1] ...
      const dn = d.slice(0, 2);
      const desc = d.slice(2, 22).trimEnd();
      const vat = d.slice(50, 52);
      const stype = d.slice(67, 68) === "1" ? "Servizi" : "Beni";
      return `Reparto ${dn}: "${desc}" — IVA gruppo ${vat} — ${stype}`;
    }
    case "4201": // DD MM YY HH MM
      return `Data/ora stampante: ${d.slice(0, 2)}/${d.slice(2, 4)}/20${d.slice(4, 6)} ${d.slice(6, 8)}:${d.slice(8, 10)}`;
    case "4213": // N[2] DESC[20] PSW[4] %OP[4]
      return `Operatore ${d.slice(0, 2)}: "${d.slice(2, 22).trimEnd()}" — password ${d.slice(22, 26)} — commissione ${pct(d.slice(26, 30))}`;
    case "4214": { // N[2] VAL[1]
      const fn = parseInt(d.slice(0, 2), 10);
      const v = d.slice(2, 3);
      return `Flag ${d.slice(0, 2)} (${FLAGS[fn] || "?"}) = ${v} (${v === "1" ? "SI" : "NO"})`;
    }
    default:
      return null;
  }
}

module.exports = {
  buildHeaderXml,
  buildReadHeaderXml,
  buildDepartmentXml,
  buildReadDepartmentXml,
  buildVatXml,
  buildReadVatXml,
  buildCreditCardXml,
  buildTicketXml,
  buildCashXml,
  buildReadPaymentsXml,
  buildOperatorXml,
  buildReadOperatorXml,
  buildDateTimeXml,
  buildReadDateTimeXml,
  buildFlagXml,
  buildReadFlagXml,
  FLAGS,
  decodeResponse,
};
