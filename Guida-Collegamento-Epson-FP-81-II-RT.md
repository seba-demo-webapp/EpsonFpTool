# Collegare la stampante fiscale Epson FP-81 II RT a un software

Guida didattica basata sulla documentazione ufficiale Epson (*Communication Protocol – Italian Fiscal Printer Registratore Telematico*, Rev. 8.10) e sui file di configurazione del driver UPOS.

---

## 1. Cos'è e come "ragiona" questa stampante

La FP-81 II RT è un **Registratore Telematico (RT)**: non è una semplice stampante, ma un dispositivo fiscale certificato che memorizza i corrispettivi, gestisce IVA/reparti/pagamenti e li **trasmette telematicamente all'Agenzia delle Entrate**. Il concetto chiave per il tuo software è:

> Tu non stampi "righe di testo". Invii **comandi fiscali** (apri documento commerciale, aggiungi articolo, applica sconto, chiudi con pagamento, chiusura giornaliera Z). La stampante esegue numerazione, calcolo IVA, totali, memoria fiscale e trasmissione.

Nota terminologica importante (dalla doc Rev. 8): sui modelli RT non si parla più di "scontrino fiscale" ma di **documento commerciale**, e non più di "scontrino non fiscale" ma di **documento gestionale**.

---

## 2. I tre modi di collegare un software (scegli il livello giusto)

Esistono tre strade, dal più alto livello (semplice) al più basso (massimo controllo). **Tutte e tre possono funzionare via rete.**

| # | Approccio | Cosa usi | Quando sceglierlo |
|---|-----------|----------|-------------------|
| **A** | **Driver UPOS** (OPOS.NET su Windows / JavaPOS su Java) | Installi l'*EPSON UPOS Driver for Fiscal* e chiami metodi standard `FiscalPrinter` | **Consigliato** per la maggior parte dei gestionali. È il livello dei file `.reg`, `jpos.xml`, `RegSettings_*.xml` che hai caricato |
| **B** | **ePOS / FPMate – XML su HTTP** | Invii documenti XML via HTTP POST alla stampante | App web/cross-platform, integrazioni leggere senza installare driver |
| **C** | **Protocollo nativo** (comandi H1/H2 su frame PDU) | Apri tu il socket TCP/seriale e costruisci i frame | Sviluppo di un driver, massimo controllo, è ciò che descrive il PDF *Communication Protocol* |

In tutti i casi la logica fiscale è la stessa; cambia solo **quanto lavoro fa il driver al posto tuo**. A) e B) ti nascondono il frame e il checksum; C) ti fa gestire tutto a mano.

---

## 3. Le interfacce fisiche disponibili

Dal capitolo *6. Physical Level* del protocollo, la stampante può comunicare via:

- **Seriale RS-232** — default `57600, NO parity, 8 data bit, 1 stop bit, RTS/CTS attivo`
- **USB nativa** — due modalità PID: *USB PID TM* (0202h) e *USB PID FP* (0201h, da usare quando sullo stesso PC ci sono stampanti fiscali e non)
- **USB RNDIS** — la porta USB usata in modalità "LAN TCP/IP" (programmazione via `SET 19`)
- **LAN Ethernet** ← *il tuo caso* (programmazione via `SET 19`)
- **LAN Wireless** — richiede dongle USB Epson WL-01/WL-02 (solo banda 2.4 GHz)

> Suggerimento dalla doc: premendo il tasto `<SUBTOTALE>` la stampante emette un documento gestionale con il **riepilogo dei parametri di tutte le interfacce** (utile per leggere subito l'IP impostato).

---

## 4. Collegamento via rete (LAN Ethernet) — passo per passo

### 4.1 Mettere la stampante in rete
1. Collega il cavo Ethernet alla stampante e alla stessa rete del PC.
2. Imposta i parametri LAN con il comando **`SET 19`** (equivalente al comando protocollo `4-019`) o dal menu/utility. Assegna un **IP statico** fuori dal range DHCP — è la causa #1 di "ieri funzionava, oggi no".
3. Verifica: `ping <IP_stampante>` deve rispondere.

### 4.2 Configurare il driver per la rete
I file `RegSettings_WIRED.xml` che hai caricato mostrano esattamente come si dichiara la connessione di rete al driver UPOS:

```xml
<PortSetting Value="Wired">
  <IPAddress Value="192.168.1.251"/>
  <PortName Value="192.168.1.251"/>
</PortSetting>
```

Confronto con gli altri due file:

```xml
<!-- RegSettings_USB.xml -->
<PortSetting Value="USB"><PortName Value="USB1"/></PortSetting>

<!-- RegSettings_SERIAL.xml -->
<PortSetting Value="Serial">
  <BaudRate Value="57600"/> <Parity Value="0"/> <DataBits Value="8"/>
  <StopBits Value="0"/> <FlowControl Value="3"/> <PortName Value="COM1"/>
</PortSetting>
```

Quindi per passare da seriale/USB alla rete cambi solo il blocco `<PortSetting>`: indichi `Wired` e l'**IP della stampante**. Tutto il resto (i comandi fiscali) resta identico.

---

## 5. Come parla il protocollo nativo (livello C)

Se scegli l'integrazione di basso livello, ogni messaggio viaggia dentro un **frame PDU** (max 512 byte):

```
STX  CNT  IDENT  A.PDU  CKS  ETX
```

- **STX** (0x02): inizio frame.
- **CNT**: contatore di sequenza 01–99. Va incrementato a ogni nuovo frame; **in caso di retry si riusa lo stesso numero** (così la stampante non duplica la transazione).
- **IDENT**: sempre `"E"` (EPSON).
- **A.PDU**: il comando vero e proprio (vedi sotto), max 505 byte.
- **CKS**: checksum (somma dei valori da CNT in poi, modulo 100).
- **ETX**: fine frame.

Il comando dentro A.PDU ha due header + dati:

```
H1 (gruppo, 1 cifra)   H2 (comando, 3 cifre)   DATA
```

Esempi di comandi reali presi dall'indice del protocollo:

| Comando | Significato |
|---------|-------------|
| `H1=1 H2=080` | PRINT REC ITEM (aggiungi articolo) |
| `H1=1 H2=081` | PRINT REC REFUND (reso) |
| `H1=1 H2=082` | PRINT REC VOID ITEM (storno) |
| `H1=1 H2=084` | PRINT REC TOTAL (totale + pagamento) |
| `H1=1 H2=085` | BEGIN COMMERCIAL DOCUMENT (apri documento) |
| `H1=1 H2=087` | END COMMERCIAL DOCUMENT (chiudi) |
| `H1=2 ...`     | Letture/totalizzatori (X) |
| `H1=3 ...`     | Stampe/azzeramenti periodici, storico fiscale (Z) |
| `H1=4 H2=019`  | SET LAN parameters (configurazione di rete) |
| `H1=4 H2=201`  | GET PRINTER DATE AND TIME |

Note pratiche dal protocollo:
- Su **LAN la modalità ACK è sempre disattivata** (l'ACK è un meccanismo legacy della seriale). Prevedi comunque sempre **routine di timeout**: frame malformati (STX mancante o checksum errato) vengono scartati **senza risposta**.
- All'avvio handshaking Epson consiglia di inviare due comandi innocui (es. lettura stato) con contatori diversi per "sincronizzare" il contatore.

---

## 6. Cosa sono i file che hai caricato

| File | A cosa serve |
|------|--------------|
| `Communication Protocol Version 8.1.pdf` | Manuale del **protocollo nativo** (livello C): interfacce fisiche, frame PDU, elenco completo comandi H1/H2 ed errori |
| `OposData_x64.reg` / `OposData_x86.reg` | Voci di registro Windows che registrano i **service object OPOS** (FiscalPrinter, CashDrawer, LineDisplay, ElectronicJournal) del driver UPOS |
| `Configuration.xml` | Mappatura OPOS.NET: associa i nomi logici (`FiscalPrinter1`) al modello e alla porta hardware |
| `jpos.xml` | Equivalente per **JavaPOS**: definisce le factory class e i device per ambiente Java |
| `RegSettings_WIRED / USB / SERIAL.xml` | Le tre varianti di **porta di comunicazione**: rete (IP), USB, seriale. È qui che scegli come il PC raggiunge la stampante |

> ⚠️ **Nota sul modello**: i file di configurazione fanno riferimento a **FP-90II / FP-90III**, non a FP-81 II. È normale: l'*EPSON UPOS Driver for Fiscal* copre l'intera famiglia di RT con la stessa logica. Quando configuri la **tua** FP-81 II, sostituisci il nome del dispositivo con quello corretto; il protocollo fiscale e lo schema dei file restano identici.

---

## 7. Flusso tipico di integrazione (via rete, con driver UPOS)

1. Installa l'*EPSON UPOS Driver for Fiscal* sul PC e importa le voci `.reg`.
2. Configura la porta: `PortSetting = Wired` con l'**IP** della stampante (come in `RegSettings_WIRED.xml`).
3. Dal tuo software apri il device logico `FiscalPrinter1` tramite l'API UPOS.
4. Per ogni scontrino: `beginFiscalReceipt` → `printRecItem` (per articolo) → `printRecTotal` (pagamento) → `endFiscalReceipt`.
5. **Leggi sempre l'esito** e gestisci gli errori (carta finita, documento già aperto, ecc.).
6. A fine giornata invia la **chiusura Z**, che innesca la trasmissione telematica dei corrispettivi.

---

## 8. Checklist per partire

| Passo | Cosa fare |
|------|-----------|
| 1 | Stampante in rete con IP statico raggiungibile (`ping` OK) |
| 2 | Scegliere il livello: UPOS (A), XML/HTTP (B) o nativo (C) |
| 3 | Configurare reparti IVA e tipi di pagamento sulla stampante |
| 4 | Configurare la porta `Wired` + IP nel driver (file `RegSettings_WIRED.xml`) |
| 5 | Test con un documento minimo: 1 articolo + contanti, end-to-end |
| 6 | Gestire risposte di errore e timeout |
| 7 | Implementare letture X e chiusura Z |

Consiglio didattico: parti da **uno scontrino minimo** funzionante end-to-end, poi aggiungi sconti, resi e pagamenti misti.

---

## 9. Documentazione di riferimento

Tra i file caricati:
- *Communication Protocol – Italian Fiscal Printer RT*, Rev. 8.10 (18/12/2023) — riferimento ufficiale completo per il livello nativo.

Online (Epson):
- **EpsonFPMate Development Guide** (XML fiscale per stampanti italiane): https://download4.epson.biz/sec_pubs/bs/pdf/EpsonFpMateDevGuideRev29.pdf
- **ePOS Fiscal Print Solution Development Guide**: https://download4.epson.biz/sec_pubs/bs/pdf/ePOS%20Fiscal%20Print%20Solution%20Development%20Guide%20Rev%20T.pdf
- **Manuale FP-81 II RT** (setup e parametri LAN, dettaglio di `SET 19`): https://support.epson.net/setupnavi/?PINF=bsmanual&OSC=WS&LG2=SW&MKN=FP-81II+RT

---

## Glossario veloce

- **RT** — Registratore Telematico: trasmette i corrispettivi all'Agenzia delle Entrate.
- **UPOS / OPOS / JavaPOS** — standard per pilotare periferiche POS con API uniformi (OPOS = Windows/COM, JavaPOS = Java).
- **FPMate / ePOS Fiscal** — soluzione Epson per comandare la stampante via XML su HTTP.
- **Documento commerciale** — il vecchio "scontrino fiscale" sui modelli RT.
- **Chiusura Z** — chiusura fiscale giornaliera; azzera i totali e innesca la trasmissione.
- **Lettura X** — lettura non fiscale dei totali correnti.
- **PDU** — Protocol Data Unit: il frame nativo `STX CNT IDENT A.PDU CKS ETX`.
- **SET 19 (4-019)** — comando di configurazione dei parametri LAN.
