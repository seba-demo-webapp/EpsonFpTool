/**
 * Componente React di esempio: pulsante "Stampa scontrino".
 * Usa il client FPMate (fpmate-client.ts).
 *
 * ⚠️ CORS — leggere con attenzione:
 * La fpmate.cgi della stampante NON invia header CORS. Una fetch fatta
 * direttamente dal renderer di Electron o dal browser viene BLOCCATA dal CORS.
 * Soluzioni (scegline una in base allo stack):
 *
 *  • Electron  -> esegui printReceipt() nel MAIN process (Node, niente CORS)
 *                 ed esponilo al renderer via ipcMain/ipcRenderer (preload).
 *  • Tauri     -> usa @tauri-apps/plugin-http (la richiesta parte da Rust,
 *                 niente CORS) oppure un comando #[tauri::command].
 *  • Solo dev  -> in fase di sviluppo puoi usare un proxy o disabilitare la
 *                 web security, ma NON in produzione.
 *
 * Qui sotto la versione "diretta" (valida in Tauri con plugin http o se chiami
 * tramite IPC). In Electron sposta la chiamata nel main process: la UI resta
 * identica, cambia solo da dove parte printReceipt().
 */

import { useState } from "react";
import { printReceipt, dailyClose, type PrinterConfig, type FpItem } from "./fpmate-client";

const PRINTER: PrinterConfig = {
  ip: "192.168.1.251", // <-- IP della tua FP-81 II RT
  timeoutMs: 10000,
};

export default function StampaScontrino() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Esempio di carrello (in un'app reale arriva dallo stato/contesto)
  const carrello: FpItem[] = [
    { description: "CAFFE", quantity: 2, unitPrice: 1.2, department: 1 },
    { description: "BRIOCHE", quantity: 1, unitPrice: 1.5, department: 1 },
  ];

  async function handleStampa() {
    setBusy(true);
    setMsg(null);
    const res = await printReceipt(PRINTER, {
      items: carrello,
      payment: "cash",
    });
    setBusy(false);

    if (res.success) {
      setMsg(`✅ Scontrino stampato${res.receiptNumber ? ` (n. ${res.receiptNumber})` : ""}`);
    } else {
      setMsg(`❌ Errore: ${res.code ?? "sconosciuto"} — stato: ${res.status ?? "n/d"}`);
      console.error("Risposta stampante:", res.raw);
    }
  }

  async function handleChiusura() {
    setBusy(true);
    setMsg(null);
    const res = await dailyClose(PRINTER);
    setBusy(false);
    setMsg(res.success ? "✅ Chiusura Z eseguita" : `❌ Errore chiusura: ${res.code}`);
  }

  const totale = carrello.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 360 }}>
      <h3>Cassa</h3>
      <ul>
        {carrello.map((i, k) => (
          <li key={k}>
            {i.quantity} × {i.description} — € {(i.quantity * i.unitPrice).toFixed(2)}
          </li>
        ))}
      </ul>
      <p>
        <strong>Totale: € {totale.toFixed(2)}</strong>
      </p>

      <button onClick={handleStampa} disabled={busy}>
        {busy ? "Invio…" : "Stampa scontrino (contanti)"}
      </button>{" "}
      <button onClick={handleChiusura} disabled={busy}>
        Chiusura Z
      </button>

      {msg && <p>{msg}</p>}
    </div>
  );
}
