# Riferimento funzioni / comandi — Epson FP-81 II RT

Elenco delle funzioni disponibili per pilotare la stampante, tratto dalla documentazione ufficiale *Communication Protocol – Italian Fiscal Printer RT* (Rev. 8.10).

Per ogni funzione trovi:
- il **comando nativo** `H1-H2` (protocollo a basso livello),
- l'**elemento XML FPMate/ePOS** corrispondente (il livello che usi nell'app React),
- i parametri principali.

> ⚠️ I nomi/attributi XML FPMate vanno confermati sulla *EpsonFPMate Development Guide*. I codici e i range dei parametri qui riportati sono quelli ufficiali del protocollo nativo.

---

## Indice
1. [Ciclo di vita di un documento commerciale](#1-ciclo-di-vita-di-un-documento-commerciale)
2. [Apertura documento](#2-apertura-documento)
3. [Righe articolo (vendita)](#3-righe-articolo-vendita)
4. [Resi e storni](#4-resi-e-storni)
5. [Sconti e maggiorazioni](#5-sconti-e-maggiorazioni)
6. [Subtotale](#6-subtotale)
7. [Pagamento e totale — con lista completa pagamenti](#7-pagamento-e-totale)
8. [Chiusura documento](#8-chiusura-documento)
9. [Fattura diretta](#9-fattura-diretta)
10. [Dati cliente (P.IVA / Codice Fiscale / Lotteria)](#10-dati-cliente)
11. [Apertura cassetto](#11-apertura-cassetto)
12. [Chiusure e letture fiscali (Z / X)](#12-chiusure-e-letture-fiscali-z--x)
13. [Configurazione: reparti e tabella IVA](#13-configurazione-reparti-e-tabella-iva)
14. [Tabella IVA / gruppi disponibili](#14-tabella-iva--gruppi)
15. [Mappa comando nativo ↔ XML FPMate](#15-mappa-comando-nativo--xml-fpmate)

---

## 1. Ciclo di vita di un documento commerciale

Sequenza tipica:

```
1-085  Apri documento commerciale
1-080  Aggiungi articolo            (ripeti per ogni riga)
1-083  (opz.) Sconto / maggiorazione
1-086  (opz.) Subtotale
1-084  Pagamento / Totale           (ripeti per pagamenti misti)
1-087  Chiudi documento             (in modalità UPOS; altrimenti chiude 1-084)
```

> Su modelli RT il vecchio "scontrino fiscale" si chiama **documento commerciale**; il vecchio "scontrino non fiscale" si chiama **documento gestionale**.

---

## 2. Apertura documento

**`H1=1 H2=085` — BEGIN COMMERCIAL DOCUMENT** · XML: `<beginFiscalReceipt>`

Apre un documento commerciale. Inserisce automaticamente l'intestazione (retail header) e la riga fissa "DOCUMENTO COMMERCIALE…".

| Campo | Descrizione | Valore |
|-------|-------------|--------|
| OP | Operatore | da 01 a 12 |

> Nota: molti comandi di vendita, se ricevuti mentre la stampante è in stato REGISTRAZIONE, **aprono automaticamente** un nuovo documento.

---

## 3. Righe articolo (vendita)

**`H1=1 H2=080` — PRINT REC ITEM** · XML: `<printRecItem>`

Esegue una vendita. Valido per documenti commerciali e fatture dirette.

| Campo | Descrizione | Lunghezza | Range / Valore |
|-------|-------------|-----------|----------------|
| OP | Operatore | 2 byte | 01–12 (51–62 per forzare la riga quantità) |
| DESCR | Descrizione | 1–38 byte | alfanumerico |
| QTY / TARE | Quantità (o tara bilancia) | 7 byte | 0000001–9999999 (= 0.001–9999.999, 3 decimali) |
| PRICE | Prezzo unitario in **centesimi** | 9 byte | 000000000–999999999 |
| DEP | Reparto | 2 byte | 01–99 |
| L/R | Allineamento display | 1 byte | 1=primi 20 char, 2=ultimi 20, 3/4=bilancia |

Note pratiche:
- Il **prezzo è in centesimi**: 1,20 € → `000000120`.
- La quantità ha 3 decimali: 1 pezzo → `0001000`.
- Se il prezzo è 0, le colonne IVA e prezzo restano vuote.
- L'aliquota IVA **non si passa qui**: deriva dal **reparto** (vedi §13–14).
- Per default la riga quantità non compare se = 1; aggiungendo offset 50 all'operatore (es. 51) viene sempre stampata.

---

## 4. Resi e storni

**`H1=1 H2=081` — PRINT REC REFUND (RESO)** · XML: `<printRecRefund>`

Esegue un reso. Valido per documenti di reso/annullo. In un documento di vendita normale viene convertito automaticamente in storno.

**`H1=1 H2=082` — PRINT REC VOID ITEM (STORNO)** · XML: `<printRecVoidItem>`

Annulla/corregge una vendita precedente. Stessi campi di PRINT REC ITEM (OP, DESCR, QTY, PRICE, DEP, L/R). Il segno meno **non** va inserito: lo aggiunge la stampante.

---

## 5. Sconti e maggiorazioni

**`H1=1 H2=083` — PRINT REC ADJUSTMENT** · XML: `<printRecItemAdjustment>` / `<printRecSubtotalAdjustment>`

Applica uno sconto o una maggiorazione a **importo fisso** (le percentuali le calcola il tuo software). Non può essere zero.

| TYPE | Significato |
|------|-------------|
| 0 | Sconto sull'ultima vendita/reso |
| 1 | Sconto sul subtotale (con riga subtotale precedente) |
| 2 | Sconto sul subtotale (senza riga subtotale) |
| 3 | Sconto su un reparto specifico |
| 5 | Maggiorazione sull'ultima vendita/reso |
| 6 | Maggiorazione sul subtotale (con riga subtotale) |
| 7 | Maggiorazione sul subtotale (senza riga subtotale) |
| 8 | Maggiorazione su un reparto specifico |

Altri campi: OP, DESCR, AMN (importo in centesimi), DEP (rilevante solo per type 3 e 8).

---

## 6. Subtotale

**`H1=1 H2=086` — PRINT REC SUBTOTAL** · XML: `<printRecSubtotal>`

Gestisce il subtotale del documento / importo residuo da pagare. Quattro modalità (campo P/D):

| P/D | Azione |
|-----|--------|
| 0 | Aggiungi riga + mostra a display |
| 1 | Aggiungi solo riga |
| 2 | Solo display |
| 3 | Leggi subtotale (nessuna riga né display) |

Se il flag `4-014/13` ("OBBLIGO SUBTOTAL") è attivo, questo comando è **obbligatorio** prima di chiudere.

---

## 7. Pagamento e totale

**`H1=1 H2=084` — PRINT REC TOTAL** · XML: `<printRecTotal>`

Registra un pagamento. In modalità non-UPOS, con pagamento sufficiente, **chiude il documento e taglia la carta**. In modalità UPOS resta aperto e si chiude con `1-087`.

| Campo | Descrizione | Range |
|-------|-------------|-------|
| OP | Operatore | 01–12 |
| DESCR | Descrizione | 1–38 byte |
| AMN | Importo in **centesimi** (0 = "salda il residuo") | 000000000–999999999 |
| TYPE | Tipo di pagamento | vedi tabella sotto |
| IND | Indice (dipende dal tipo) | vedi tabella |
| L/R | Allineamento display | 1 / 2 |

Comportamento risposta: importo < dovuto → mostra **DIFFERENZA**; importo > dovuto → mostra **RESTO** (change); importo = dovuto → descrizione personalizzata. Per pagamenti misti, richiama `1-084` più volte.

### Lista completa dei tipi di pagamento

| TYPE | Pagamento | Indice (IND) | Note |
|------|-----------|--------------|------|
| **0** | **Contanti** | `00` | descrizione fissa CONTANTI nel report X-01 |
| 0 | Contanti con descrizione | `01`–`05` | 5 descrizioni programmabili col comando `4-053` |
| **1** | **Assegni** | N/A | descrizione fissa ASSEGNI |
| **2** | **Credito / Carta di credito** | `00` | Credito (trattato come "Non riscosso" type 5/00) |
| 2 | Carta di credito | `01`–`10` | 10 nomi carte programmabili col comando `4-007` |
| **3** | **Ticket singolo** | `01`–`10` | l'indice è il numero del ticket; nomi via `4-010` |
| **4** | **Ticket multipli** | `01`–`99` | l'indice è la quantità (≠ 0); AMN = valore unitario |
| **5** | **Non riscosso** | `00` | Beni e Servizi |
| 5 | Non riscosso | `01` | solo Beni |
| 5 | Non riscosso | `02` | solo Servizi |
| 5 | Non riscosso | `03` | Segue fattura (fattura su doc. commerciale) |
| 5 | Non riscosso | `04` | Fattura RT |
| 5 | Non riscosso | `05` | SSN (solo farmacie) |
| **6** | **Sconto a pagare** | `00` | Generico |
| 6 | Sconto a pagare | `01` | Buono multiuso |

> "Ticket" = buoni a carico di terzi (ticket restaurant, buoni celiachia, buoni promozionali, ecc.).
> Per i ticket multipli (type 4) l'importo è il **valore unitario**, non la somma.

---

## 8. Chiusura documento

**`H1=1 H2=087` — END COMMERCIAL DOCUMENT** · XML: `<endFiscalReceipt>`

Chiude il documento (richiede modalità UPOS attiva e pagamento già completato). Aggiunge automaticamente: riepilogo pagamenti (Pagamento contante, Pagamento elettronico, Non riscosso, Ticket, Resto, Sconto a Pagare, Importo Pagato), data/ora, numero documento (ZZZZ-xxxx), eventuale codice fiscale/lotteria, logotipo RT e matricola, codici a barre/QR e piè di pagina.

---

## 9. Fattura diretta

**`H1=1 H2=089` — OPEN DIRECT INVOICE** · XML: `<openFiscalInvoice>` (variante)

Apre una fattura diretta di vendita. Campo INV = numero fattura (0 = autonumerazione via `4-025`). Dopo l'apertura si usano gli stessi comandi di vendita; la chiusura in modalità UPOS è sempre `1-087`.

---

## 10. Dati cliente

**`H1=1 H2=060` — SEND BUSINESS TAX CODE (PARTITA IVA)** · XML: `<printRecMessage>` (tipo dedicato)
**`H1=1 H2=061` — SEND PERSONAL TAX CODE (CODICE FISCALE)**
**`H1=1 H2=135` — SEND DEFERRED LOTTERY ID CODE** (codice lotteria degli scontrini)

Da inviare prima della chiusura; vengono stampati nel documento. (Inibiti sulle fatture dirette.)

---

## 11. Apertura cassetto

**`H1=1 H2=050` — OPEN DRAWER** · XML: `<openDrawer>`

Apre il cassetto. Se il flag `4-014/03` = SI viene emesso un documento gestionale. Se inviato mentre un documento è aperto → Errore 11.

| Campo | Descrizione | Default | Note |
|-------|-------------|---------|------|
| OP | Operatore | — | 01–12 |
| DRW NUM | Numero cassetto | 1 | 1 = DK pin 2, 2 = DK pin 5 |
| PULSE ON | Tempo attivazione (mS × 2) | 15 (30 mS) | 000–255 |
| PULSE OFF | Tempo disattivazione (mS × 2) | 15 (30 mS) | 000–255 |

I tre campi opzionali (DRW NUM, PULSE ON, PULSE OFF) si possono omettere: si usano i default. Esiste anche l'apertura automatica del cassetto su chiusura documento (flag `4-014` AP. AUT. CASSETTO).

---

## 12. Chiusure e letture fiscali (Z / X)

**`H1=3 H2=001` — PRINT Z REPORT** · XML: `<printZReport>`
Chiusura giornaliera. Genera un documento gestionale con i totali fiscali, scrive il file `…ZREPORT.txt` in `www/dati-rt/<data>` e **avvia la trasmissione telematica** all'Agenzia delle Entrate. Restituisce data/ora e numero documenti.

**`H1=3 H2=002` — PRINT FINANCIAL DATA AND Z REPORT**
Da usare se la stampante non è ancora "censita" (registrata).

Letture X (non azzerano la giornata), gruppo `H1=2`:

| Comando | Funzione |
|---------|----------|
| `2-002` | Totali giornalieri gruppi prodotto |
| `2-003` | Totali giornalieri reparti |
| `2-006` | Totali giornalieri operatori |
| `2-050` | GET DAILY DATA (lettura dati giornalieri, include n. aperture cassetto = index 21) |
| `2-052` | READ FISCAL GRAND TOTAL (grande totale fiscale) |

Stampe/azzeramenti periodici e storico fiscale: gruppo `H1=3` (`3-003`…`3-015`).

---

## 13. Configurazione: reparti e tabella IVA

**`H1=4 H2=002` — SET DEPARTMENT** · (config)
Programma uno dei 99 reparti. Parametri: descrizione (max 20 char), fino a 3 prezzi unitari, gruppo IVA, limite prezzo, gruppo di stampa, gruppo prodotto, unità di misura fattura, tipo vendita (beni/servizi), attributo vendita, indice ATECO.
> Programmabile solo a **giornata chiusa** (Day Opened = False) se la stampante è censita.

**`H1=4 H2=005` — SET VAT TABLE ENTRY** · (config)
Imposta fino a 9 aliquote IVA attive (+ 36 storiche). Richiede **chiusura fiscale** prima (giornata chiusa). Due aliquote non possono avere la stessa percentuale.

| Campo | Descrizione | Valore |
|-------|-------------|--------|
| N | Numero gruppo IVA | 01–09 (attivi); 21–29/31–39/41–49/51–59 (storici); 97/98 (ventilazione) |
| VAL | Aliquota | 0000–9999 = 00.01%–99.99% (0 disattiva il gruppo) |

Comandi di lettura collegati: `4-202` GET DEPARTMENT PARAMETERS, `4-205` GET VAT TABLE ENTRY.

---

## 14. Tabella IVA / gruppi

Quando associ un reparto a un gruppo IVA (campo DEP negli articoli), il numero di gruppo significa:

| Gruppo | Significato |
|--------|-------------|
| `1`–`9` | Aliquote IVA **attive** (percentuale ≠ 0) |
| `0`, `10`–`18` | **Esenti / nature** (aliquota zero) |
| `21`–`29`, `31`–`39`, `41`–`49`, `51`–`59` | Aliquote **storiche** (solo per resi/annulli) |
| `97` / `98` | Ventilazione disattivata / attivata |

Le nature di esenzione (codici N1…N7 ecc.) si gestiscono con `9-004` SET VAT EXEMPT TABLE (NATURES).

---

## 15. Mappa comando nativo ↔ XML FPMate

| Funzione | Nativo | XML FPMate/ePOS (indicativo) |
|----------|--------|------------------------------|
| Apri documento | `1-085` | `<beginFiscalReceipt>` |
| Riga articolo | `1-080` | `<printRecItem>` |
| Reso | `1-081` | `<printRecRefund>` |
| Storno | `1-082` | `<printRecVoidItem>` |
| Sconto/maggiorazione | `1-083` | `<printRecItemAdjustment>` / `<printRecSubtotalAdjustment>` |
| Subtotale | `1-086` | `<printRecSubtotal>` |
| Pagamento / totale | `1-084` | `<printRecTotal>` |
| Chiudi documento | `1-087` | `<endFiscalReceipt>` |
| Fattura diretta | `1-089` | apertura fattura |
| P.IVA / Cod. Fiscale | `1-060` / `1-061` | messaggio dedicato |
| Apri cassetto | `1-050` | `<openDrawer>` |
| Chiusura Z | `3-001` | `<printZReport>` |
| Lettura X | `2-0xx` | `<printXReport>` |
| Set reparto | `4-002` | configurazione |
| Set tabella IVA | `4-005` | configurazione |

---

### Esempio: documento completo con sconto, pagamento misto e apertura cassetto (XML FPMate concettuale)

```xml
<printerFiscalReceipt>
  <beginFiscalReceipt operator="1" />
  <printRecItem operator="1" description="CAFFE"   quantity="2" unitPrice="1.20" department="1" justification="1" />
  <printRecItem operator="1" description="BRIOCHE" quantity="1" unitPrice="1.50" department="1" justification="1" />
  <printRecItemAdjustment operator="1" description="SCONTO" amount="0.40" adjustmentType="0" department="1" />
  <printRecSubtotal operator="1" option="1" />
  <printRecTotal operator="1" description="CONTANTI" payment="2.00" paymentType="0" index="0" />
  <printRecTotal operator="1" description="CARTA"    payment="1.50" paymentType="2" index="1" />
  <endFiscalReceipt operator="1" />
  <openDrawer operator="1" />
</printerFiscalReceipt>
```

---

*Fonte: Epson Italia S.p.A. — "Communication Protocol – Italian Fiscal Printer Registratore Telematico", FP 000 008 EN Rev. 8.10 (18/12/2023). Per i dettagli completi di ogni comando, errori e layout, fare riferimento al PDF ufficiale e alla EpsonFPMate Development Guide.*
