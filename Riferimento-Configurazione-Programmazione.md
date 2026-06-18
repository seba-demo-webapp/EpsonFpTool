# Cosa programmare sulla stampante — guida alla configurazione

Riferimento di **cosa va impostato** (operatori, reparti, aliquote IVA, prodotti/servizi, ecc.) prima e durante l'uso del software, tratto dalla documentazione ufficiale *Communication Protocol – Italian Fiscal Printer RT* (Rev. 8.10).

> Idea chiave da capire subito: **l'IVA non si associa al singolo articolo, ma al REPARTO**. Quando vendi un prodotto/servizio indichi un *reparto* (1–99); il reparto è legato a un *gruppo IVA*; il gruppo IVA contiene la *percentuale*. Quindi la catena è:
>
> **Articolo → Reparto → Gruppo IVA → Aliquota %**

---

## Indice
1. [Modello logico: come si lega l'IVA a prodotti e servizi](#1-modello-logico)
2. [Ordine consigliato di programmazione](#2-ordine-consigliato-di-programmazione)
3. [Operatori (nome cassiere)](#3-operatori-nome-cassiere)
4. [Tabella IVA — aliquote](#4-tabella-iva--aliquote)
5. [Nature di esenzione (aliquota zero)](#5-nature-di-esenzione)
6. [Reparti (beni/servizi + IVA)](#6-reparti)
7. [PLU interni (anagrafica prodotti)](#7-plu-interni-anagrafica-prodotti)
8. [Descrizioni pagamenti (carte, ticket, contanti)](#8-descrizioni-pagamenti)
9. [Gruppi prodotto e valute](#9-gruppi-prodotto-e-valute)
10. [Intestazione e data/ora](#10-intestazione-e-dataora)
11. [Flag di configurazione importanti](#11-flag-di-configurazione-importanti)
12. [Vincolo "giornata chiusa"](#12-vincolo-giornata-chiusa)
13. [Tabella riassuntiva comandi](#13-tabella-riassuntiva-comandi)

---

## 1. Modello logico

| Cosa | Dove si configura | Come lo usa il software |
|------|-------------------|--------------------------|
| **Nome operatore** | comando `4-013` (max 12 operatori) | passi l'ID operatore (01–12) in ogni comando |
| **Aliquota IVA %** | comando `4-005` (gruppi IVA 1–9) | non la passi mai direttamente: la richiami via reparto |
| **Bene o servizio** | comando `4-002` (impostazione reparto, campo *Sales type*) | derivata dal reparto dell'articolo |
| **Esenzione / natura** | gruppi IVA 0 e 10–18 + comando `9-004` | reparto associato a gruppo esente |
| **Prodotto/anagrafica** | comando `4-003` (PLU interni, opzionale) | oppure gestisci l'anagrafica nel tuo DB e mandi descrizione+reparto+prezzo a ogni vendita |

Due strategie possibili lato software:

- **A. Anagrafica nel tuo software** (consigliata per gestionali): la stampante conosce solo i **reparti** e le **aliquote**. Per ogni vendita invii descrizione, quantità, prezzo e numero di reparto. Tutta l'anagrafica prodotti vive nel tuo database.
- **B. PLU interni nella stampante** (`4-003`): carichi i prodotti dentro la stampante. Utile per uso a tastiera, raramente necessario se hai un software.

---

## 2. Ordine consigliato di programmazione

1. **Data e ora** (`4-001`) — a giornata chiusa.
2. **Tabella IVA** (`4-005`) — definisci le aliquote attive (es. 22%, 10%, 4%, 5%).
3. **Nature di esenzione** (`9-004`) — solo se vendi beni/servizi esenti o non imponibili.
4. **Reparti** (`4-002`) — associa ogni reparto a un gruppo IVA e al tipo (bene/servizio).
5. **Operatori** (`4-013`) — nomi e password dei cassieri.
6. **Descrizioni pagamenti** (`4-007`, `4-010`, `4-053`) — nomi carte, ticket, contanti.
7. **Intestazione** (`3-016`) — ragione sociale, indirizzo, P.IVA dell'esercente.
8. **Flag** (`4-014`) — in particolare attivare la **modalità UPOS** (flag 29) se usi quel modello, e la modalità operatori (flag 4/5).

> ⚠️ I punti 1, 2, 4 richiedono che la **giornata sia chiusa** (vedi §12).

---

## 3. Operatori (nome cassiere)

**`H1=4 H2=013` — SET OPERATOR (CASHIER) PARAMETERS**

Fino a **12 operatori**. Per ciascuno: descrizione (es. cognome), password, percentuale di commissione.

| Campo | Descrizione | Lunghezza | Range |
|-------|-------------|-----------|-------|
| N | ID operatore | 2 byte | 01–12 |
| DESC | Descrizione (es. cognome) | 20 byte | alfanumerico |
| PSW | Password operatore | 4 byte | 0000–9999 |
| %OP | Commissione | 4 byte | 0000–9999 = 00.00%–99.99% |

Per attivare la gestione operatori servono i flag (vedi §11): `4-014/04` (modalità operatori ON), `4-014/05` (password obbligatoria), `4-014/07` (stampa riga operatore nel documento).

Lettura: `4-213` GET OPERATOR PARAMETERS.

---

## 4. Tabella IVA — aliquote

**`H1=4 H2=005` — SET VAT TABLE ENTRY**

Fino a **9 aliquote attive** (+ 36 storiche per resi/annulli). Richiede giornata chiusa. Due aliquote non possono avere la stessa percentuale.

| Campo | Descrizione | Valore |
|-------|-------------|--------|
| N | Numero gruppo IVA | `01`–`09` attivi · `21`–`29`/`31`–`39`/`41`–`49`/`51`–`59` storici · `97`/`98` ventilazione |
| VAL | Aliquota | `0000`–`9999` = 00.01%–99.99% (`0000` disattiva il gruppo) |

Esempio impostazione tipica:

| Gruppo IVA | Aliquota | VAL |
|------------|----------|-----|
| 1 | 22% | `2200` |
| 2 | 10% | `1000` |
| 3 | 4% | `0400` |
| 4 | 5% | `0500` |

> Consiglio Epson: prima di riprogrammare tutta la tabella, azzera tutte le percentuali e poi reimposta quelle desiderate.

Lettura: `4-205` GET VAT TABLE ENTRY.

---

## 5. Nature di esenzione

I gruppi IVA **0 e 10–18** sono riservati alle vendite ad **aliquota zero** (esenti, non imponibili, escluse, non soggette). Sei nature sono già hard-coded nel firmware:

| Codice | Significato (esempi) |
|--------|----------------------|
| EE | Esente |
| NS | Non soggetta |
| NI | Non imponibile |
| ES | Escluso |
| RM | Regime del margine |
| AL | Altro (autofattura, ecc.) |

**`H1=9 H2=004` — SET VAT EXEMPT TABLE ADDITIONS (NATURES)**: si usa **solo** per aggiungere nuove nature autorizzate (indici 15–18). Ogni natura ha: simbolo a 2 char (es. `NS`), descrizione (es. "Non soggetta"), e il **codice XML di trasmissione** (es. `N7`) usato nel file inviato all'Agenzia delle Entrate.

> ⚠️ Importante: nature non autorizzate nel file XML dei corrispettivi fanno **rifiutare l'intero file** dall'Agenzia. Usa solo i codici ufficiali.

Lettura: `9-204` READ VAT EXEMPT TABLE.

---

## 6. Reparti

**`H1=4 H2=002` — SET DEPARTMENT**

È il punto centrale: collega prodotti/servizi all'IVA. Fino a **99 reparti**, ciascuno con:

| Parametro | Descrizione |
|-----------|-------------|
| **Descrizione** | max 20 caratteri (compare nei report e nelle vendite a tastiera) |
| **Prezzo unitario** | fino a 3 prezzi preimpostati (per vendite a tastiera) |
| **Single article** | vendita singola o multipla |
| **Gruppo IVA** | il **numero** del gruppo IVA (non la %): `1`–`9` attivi, `0`/`10`–`18` esenti, `21`–`59` storici |
| **Limite prezzo** | 0 = nessun limite (riferito a prezzo × quantità) |
| **Print group** | 0–10, per raggruppare reparti in documenti gestionali |
| **Product group** | 0–10, per raggruppare reparti nei report finanziari |
| **Unità di misura** | 2 char per le fatture (es. KG, Ps) |
| **Sales type** | **beni** o **servizi** ← classificazione fiscale del reparto |
| **Sales attribute** | se includere o no il reparto negli sconti/maggiorazioni su subtotale |
| **ATECO index** | 0 = nessuna gestione ATECO |

Esempio di mappatura reparti:

| Reparto | Descrizione | Gruppo IVA | Tipo |
|---------|-------------|------------|------|
| 1 | Bar/Alimentari | 3 (4%) | Beni |
| 2 | Bevande | 2 (10%) | Beni |
| 3 | Servizi | 1 (22%) | Servizi |
| 4 | Esente | 10 (0% — natura) | Beni |

> Programmabile solo a **giornata chiusa** se la stampante è censita.

Lettura: `4-202` GET DEPARTMENT PARAMETERS.

---

## 7. PLU interni (anagrafica prodotti)

**`H1=4 H2=003` — SET INTERNAL PLU** (opzionale)

Fino a **1000 PLU**. Per ciascuno: descrizione (20 char; `@` finale = articolo a peso/bilancia), fino a 3 prezzi, reparto associato (1–99; `00` disattiva), barcode opzionale (fino a 40 char).

> Serve solo se vuoi l'anagrafica **dentro** la stampante. Con un gestionale di solito tieni l'anagrafica nel tuo DB (strategia A del §1) e questo comando non ti serve.
> Comandi collegati: `4-012` associazione tasti PLU diretti, `4-203` lettura PLU per numero, `4-273` lettura PLU per barcode.

---

## 8. Descrizioni pagamenti

Personalizzano i nomi che appaiono nei report e nei documenti.

| Comando | Cosa programma | Quantità | Campi |
|---------|----------------|----------|-------|
| `4-007` SET CREDIT CARD NAMES | Nomi carte di credito | 10 (indice 01–10) | descrizione 20 char |
| `4-010` SET TICKET DESCRIPTION AND VALUE | Nomi e **valore** ticket/buoni | 10 (01–10) | descrizione + valore in centesimi |
| `4-053` SET CASH PAYMENT DESCRIPTIONS | 5 descrizioni contanti | 5 (indice 01–05) | descrizione |

Questi nomi corrispondono agli **indici** che passi nel comando di pagamento `1-084` (vedi *Riferimento-Funzioni-Comandi.md* §7).

---

## 9. Gruppi prodotto e valute

- **`4-008` SET PRODUCT GROUP NAMES** — fino a 10 gruppi prodotto (descrizione 20 char), per aggregare i reparti nei report X-02/X-08/Z-03/Z-08.
- **`4-006` SET CURRENCY DESCRIPTION AND EXCHANGE RATE** — fino a 6 valute (etichetta 2 char + tasso di cambio). Di norma le valute multiple le gestisce il software, non la stampante.

---

## 10. Intestazione e data/ora

- **`3-016` SET RETAIL HEADER LINE TEXT** — righe di intestazione (ragione sociale, indirizzo, P.IVA dell'esercente) stampate in testa a ogni documento. Lettura con `3-216`; font con `4-016`.
- **`4-001` SET DATE AND TIME** — data/ora (`DD MM YY HH MM`, secondi non impostabili). A stampante censita si può cambiare solo a **giornata chiusa** e non prima dell'ultima chiusura fiscale.

---

## 11. Flag di configurazione importanti

**`H1=4 H2=014` — SET FLAGS** (flag N da 01 a 69, valore 0/1). I più rilevanti per l'integrazione software:

| Flag | Nome | Effetto |
|------|------|---------|
| 03 | STAMPA AP. CASS. | 1 = l'apertura cassetto emette un documento gestionale |
| 04 | OPERATORI | 1 = modalità operatori attiva |
| 05 | OPERATORI SEGRETI | 1 = password operatore obbligatoria |
| 06 | RESET OPERATORE | 1 = disattiva l'operatore a fine documento |
| 07 | STAMPA OPERATORE | 1 = inserisce la riga operatore nel documento |
| 08 | STAMPA N. PEZZI | 1 = stampa il numero di pezzi nel documento |
| **29** | **JavaPOS-UPOS mode** | 1 = il documento resta aperto dopo il pagamento e si chiude con `1-087` (necessario in modalità UPOS) |
| 57 | DETTAGLIO FORME PAGAMENTO | 1 = stampa il dettaglio delle forme di pagamento |
| 58/59 | RT RESO/ANNULLAM. = NdC | modalità nota di credito su resi/annulli |

> Il flag **29** è decisivo per il modello di comunicazione del tuo software: in modalità UPOS la chiusura è esplicita (`1-087`), altrimenti `1-084` chiude e taglia da solo.

---

## 12. Vincolo "giornata chiusa"

Diversi comandi di programmazione (tabella IVA `4-005`, reparti `4-002`, data/ora `4-001`) sono ammessi **solo a giornata logica chiusa** (`Day Opened = False`), cioè subito dopo una chiusura fiscale Z e prima del primo documento commerciale del giorno. Se tenti di modificarli a giornata aperta la stampante restituisce **Errore 17 (operazione impossibile ora)**.

Flusso pratico per riprogrammare IVA o reparti:
1. Esegui la chiusura Z (`3-001`).
2. Programma IVA / reparti / data.
3. Riapri la giornata con il primo documento.

---

## 13. Tabella riassuntiva comandi

| Cosa programmare | Comando | A giornata chiusa? | Lettura |
|------------------|---------|--------------------|---------|
| Data e ora | `4-001` | sì (se censita) | `4-201` |
| Reparti | `4-002` | sì (se censita) | `4-202` |
| PLU interni | `4-003` | no | `4-203` / `4-273` |
| Aliquote IVA | `4-005` | **sì** | `4-205` |
| Valute | `4-006` | no | `4-206` |
| Nomi carte di credito | `4-007` | no | `4-207` |
| Nomi gruppi prodotto | `4-008` | no | `4-208` |
| Nomi/valore ticket | `4-010` | no | `4-210` |
| Operatori (cassieri) | `4-013` | no | `4-213` |
| Flag di configurazione | `4-014` | no (anche a doc. aperto) | — |
| Descrizioni contanti | `4-053` | no | `4-253` |
| Nature di esenzione | `9-004` | no | `9-204` |
| Intestazione documento | `3-016` | no | `3-216` |

---

*Fonte: Epson Italia S.p.A. — "Communication Protocol – Italian Fiscal Printer RT", FP 000 008 EN Rev. 8.10 (18/12/2023). I codici esatti degli attributi XML FPMate corrispondenti vanno verificati sulla EpsonFPMate Development Guide.*
