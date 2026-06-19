// UI di cassa. La comunicazione con la stampante passa SEMPRE per window.cassa
// (IPC -> main process), così evitiamo il blocco CORS della fpmate.cgi.

const $ = (id) => document.getElementById(id);
let cart = [];
let payment = "cash";

const eur = (n) =>
  "€ " + Number(n).toFixed(2).replace(".", ",");

function render() {
  const rows = $("rows");
  rows.innerHTML = "";
  cart.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${it.quantity}</td>` +
      `<td>${it.description}</td>` +
      `<td class="num">${eur(it.unitPrice)}</td>` +
      `<td class="num">${eur(it.quantity * it.unitPrice)}</td>` +
      `<td><span class="x" data-i="${i}">✕</span></td>`;
    rows.appendChild(tr);
  });
  $("empty").style.display = cart.length ? "none" : "block";
  const total = cart.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  $("total").textContent = eur(total);
}

function showMsg(text, ok) {
  const m = $("msg");
  m.textContent = text;
  m.className = "msg " + (ok ? "ok" : "err");
}

// ---- Articoli ----
$("add").addEventListener("click", () => {
  const description = $("desc").value.trim().toUpperCase();
  const unitPrice = parseFloat($("price").value);
  const quantity = parseInt($("qty").value, 10);
  const department = parseInt($("dept").value, 10);
  if (!description) return showMsg("Inserisci una descrizione.", false);
  if (!(unitPrice > 0)) return showMsg("Prezzo non valido.", false);
  if (!(quantity > 0)) return showMsg("Quantità non valida.", false);
  cart.push({ description, unitPrice, quantity, department: department || 1 });
  $("desc").value = "";
  $("price").value = "";
  $("qty").value = "1";
  $("msg").className = "msg";
  $("desc").focus();
  render();
});

$("desc").addEventListener("keydown", (e) => { if (e.key === "Enter") $("price").focus(); });
$("price").addEventListener("keydown", (e) => { if (e.key === "Enter") $("add").click(); });

$("rows").addEventListener("click", (e) => {
  const i = e.target.getAttribute("data-i");
  if (i !== null) { cart.splice(+i, 1); render(); }
});

$("clear").addEventListener("click", () => { cart = []; $("msg").className = "msg"; render(); });

// ---- Pagamento ----
document.querySelectorAll(".pay button").forEach((b) => {
  b.addEventListener("click", () => {
    payment = b.getAttribute("data-pay");
    document.querySelectorAll(".pay button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  });
});

// ---- Stampa ----
$("print").addEventListener("click", async () => {
  if (!cart.length) return showMsg("Lo scontrino è vuoto.", false);
  $("print").disabled = true;
  showMsg("Invio alla stampante…", true);
  try {
    const res = await window.cassa.printReceipt({ items: cart, payment });
    if (res.success) {
      showMsg(`✅ Documento stampato${res.receiptNumber ? " (n. " + res.receiptNumber + ")" : ""}.`, true);
      cart = [];
      render();
    } else {
      showMsg(`❌ Errore: ${res.code || "sconosciuto"} — stato: ${res.status || "n/d"}`, false);
      console.error("Risposta stampante:", res.raw);
    }
  } catch (err) {
    showMsg("❌ " + err, false);
  } finally {
    $("print").disabled = false;
  }
});

$("zreport").addEventListener("click", async () => {
  if (!confirm("Eseguire la chiusura giornaliera Z?")) return;
  $("zreport").disabled = true;
  showMsg("Chiusura Z in corso…", true);
  try {
    const res = await window.cassa.dailyClose();
    showMsg(res.success ? "✅ Chiusura Z eseguita." : "❌ Errore chiusura: " + (res.code || "?"), res.success);
  } catch (err) {
    showMsg("❌ " + err, false);
  } finally {
    $("zreport").disabled = false;
  }
});

// ---- Configurazione ----
async function loadCfg() {
  const cfg = await window.cassa.getConfig();
  $("ip").value = cfg.ip || "";
  $("operator").value = cfg.operator || "1";
  $("timeout").value = cfg.timeoutMs || 10000;
  $("https").value = String(!!cfg.https);
  $("devid").value = cfg.devid || "local_printer";
  $("connTxt").textContent = cfg.ip || "non configurata";
  $("dot").style.background = cfg.ip ? "var(--ok)" : "var(--muted)";
}

$("saveCfg").addEventListener("click", async () => {
  const cfg = {
    ip: $("ip").value.trim(),
    operator: $("operator").value.trim() || "1",
    timeoutMs: parseInt($("timeout").value, 10) || 10000,
    https: $("https").value === "true",
    devid: $("devid").value.trim() || "local_printer",
  };
  await window.cassa.setConfig(cfg);
  await loadCfg();
  showMsg("✅ Configurazione salvata.", true);
});

loadCfg();
render();

// ===================== SCHEDE =====================
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
    t.classList.add("on");
    const v = t.getAttribute("data-view");
    $("view-cassa").classList.toggle("hidden", v !== "cassa");
    $("view-config").classList.toggle("hidden", v !== "config");
  });
});

// ===================== CONFIGURAZIONE =====================
function cfgShow(text, ok) {
  const m = $("cfgMsg");
  m.textContent = text;
  m.className = "msg " + (ok ? "ok" : "err");
}

// Raccoglie il payload per ciascun tipo di comando dai campi del form.
function cfgPayload(kind, btn) {
  switch (kind) {
    case "header":
      return { lines: [...document.querySelectorAll(".hdr")].map((i) => i.value), commit: true };
    case "header:read":
      return { number: +$("hdrReadLine").value };
    case "department":
      return {
        number: +$("depN").value,
        description: $("depDesc").value.trim().toUpperCase(),
        vatGroup: +$("depVat").value,
        salesType: $("depType").value,
      };
    case "department:read":
      return { number: +$("depN").value };
    case "vat":
      return { group: +$("vatG").value, rate: parseFloat($("vatR").value) };
    case "vat:read":
      return { group: +$("vatG").value };
    case "card":
      return { index: +$("cardIdx").value, description: $("cardDesc").value.trim().toUpperCase() };
    case "ticket":
      return {
        index: +$("tickIdx").value,
        description: $("tickDesc").value.trim().toUpperCase(),
        value: parseFloat($("tickVal").value) || 0,
      };
    case "cash":
      return { index: +$("cashIdx").value, description: $("cashDesc").value.trim().toUpperCase() };
    case "payments:read": {
      const sub = btn.getAttribute("data-sub");
      const idx = sub === "card" ? +$("cardIdx").value
        : sub === "ticket" ? +$("tickIdx").value : +$("cashIdx").value;
      return { subkind: sub, index: idx };
    }
    case "operator":
      return {
        number: +$("opN").value,
        description: $("opDesc").value.trim().toUpperCase(),
        password: +$("opPsw").value,
        commission: parseFloat($("opComm").value) || 0,
      };
    case "operator:read":
      return { number: +$("opN").value };
    case "datetime": {
      // <input type=date> -> "YYYY-MM-DD" ; <input type=time> -> "HH:MM"
      const [Y, M, D] = ($("dtDate").value || "").split("-");
      const [h, m] = ($("dtTime").value || "").split(":");
      if (!Y || !h) throw new Error("Imposta data e ora");
      return { day: +D, month: +M, year: +Y % 100, hour: +h, minute: +m };
    }
    case "datetime:read":
      return {};
    case "flag":
      return { number: +$("flagN").value, value: +$("flagVal").value };
    case "flag:read":
      return { number: +$("flagN").value };
    default:
      return {};
  }
}

// Popola la tendina dei flag comuni e sincronizza con il numero.
(async () => {
  const flags = await window.cassa.getFlags();
  const sel = $("flagSel");
  Object.entries(flags).forEach(([n, label]) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = `${String(n).padStart(2, "0")} — ${label}`;
    sel.appendChild(o);
  });
  sel.value = "4";
  sel.addEventListener("change", () => { $("flagN").value = sel.value; });
})();

document.querySelectorAll("[data-build]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.getAttribute("data-build");
    try {
      const xml = await window.cassa.buildConfig(kind, cfgPayload(kind, btn));
      $("cfgXml").value = xml;
      const isRead = kind.includes("read");
      cfgShow(isRead
        ? "🔎 XML di lettura pronto. Premi «Invia» per interrogare la stampante."
        : "✏️ XML generato. Controlla/modifica a destra, poi premi «Invia».", true);
    } catch (err) {
      cfgShow("❌ " + err, false);
    }
  });
});

$("cfgSend").addEventListener("click", async () => {
  const xml = $("cfgXml").value.trim();
  if (!xml) return cfgShow("Genera prima un XML.", false);
  $("cfgSend").disabled = true;
  cfgShow("Invio alla stampante…", true);
  try {
    const res = await window.cassa.sendConfig(xml);
    const decoded = res.decoded ? "📖 " + res.decoded + "\n\n" : "";
    $("cfgResp").textContent = decoded + (res.raw || "(nessuna risposta)");
    if (res.success) cfgShow(res.decoded ? "✅ " + res.decoded : "✅ Comando eseguito dalla stampante.", true);
    else cfgShow(`❌ Errore: ${res.code || "?"} — stato: ${res.status || "n/d"}`, false);
  } catch (err) {
    cfgShow("❌ " + err, false);
  } finally {
    $("cfgSend").disabled = false;
  }
});
