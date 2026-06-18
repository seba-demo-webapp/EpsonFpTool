# Piano di implementazione — Versione Android (tablet)

> Stato: **da fare** (idea parcheggiata). L'app desktop Electron (Mac/Windows) resta la base.
> Obiettivo: portare la cassa RT Epson su tablet Android come `.apk`.

## Contesto
- App attuale = Electron. La logica reale è **HTTP + XML** verso la stampante
  (`POST http://<IP>/cgi-bin/fpmate.cgi`), la UI è **HTML/JS puro** in `Tool EpsonFp/renderer/`.
- Tablet e stampante devono stare sulla **stessa rete WiFi** (collegamento invariato).

## Tecnologia scelta: Capacitor
- Impacchetta il frontend HTML/JS esistente in app Android nativa (WebView) → produce `.apk`.
- Riusa al massimo il codice già scritto.
- Alternativa scartata: Tauri v2 (reintroduce Rust), PWA pura (CORS blocca la stampante).

## Nodo tecnico principale: CORS
- Oggi le chiamate girano nel **main process Electron** (Node `http`) → niente CORS.
- Dentro la WebView Android un `fetch()` diretto verrebbe **bloccato dal CORS**
  (la `fpmate.cgi` non manda header CORS).
- **Soluzione:** plugin **`CapacitorHttp`**, che esegue la richiesta a livello nativo
  (nessun CORS), come faceva Electron.

## Passi
1. `npm i @capacitor/core @capacitor/cli @capacitor/android` e `npx cap init`.
2. Spostare la logica XML invariata nel frontend:
   - `src/fpmate-client.js` e `src/config-client.js` → versione browser (ESM/bundle).
3. Sostituire il bridge IPC (`preload.js` / `window.cassa`) con chiamate a `CapacitorHttp`:
   - `config:get/set` → storage locale (`@capacitor/preferences`) invece di `userData/config.json`.
   - `printer:*` e `cfg:send` → `CapacitorHttp.post({ url, headers, data: xml })`.
4. `webDir` = cartella con `index.html` + asset; `npx cap add android`; `npx cap sync`.
5. Decidere se i 3 file frontend stanno in una **cartella condivisa** col desktop o **duplicati**.

## Build dell'`.apk`
- Locale: Android Studio / Android SDK → `npx cap build android` o Gradle.
- CI: workflow GitHub Actions su runner Linux (Java + Android SDK) che produce l'`.apk` come artifact.
- `.apk` non firmato → installazione con "origini sconosciute"; per distribuzione firmare con keystore.

## Aperti / da decidere
- Struttura cartelle (condivisa vs duplicata) per riusare i 3 file frontend.
- Firma `.apk` (keystore) se serve distribuzione fuori da install manuale.
