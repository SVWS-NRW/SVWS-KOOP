# ADR 001: Architektur und Erscheinungsbild nach dem Vorbild der SVWS-Tools

- **Status:** Angenommen
- **Datum:** 2026-10-15
- **Autor:** Frank Pfotenhauer

## Kontext

SVWS-KOOP soll Schulen mit gymnasialer Oberstufe, die in einer Kooperation zusammenarbeiten, beim gemeinsamen Blocken ihrer Kurse unterstützen. Die fachlichen Anforderungen werden in ADR 002 erarbeitet. Dieses ADR legt nur den technischen Rahmen und das Erscheinungsbild fest.

Rund um den SVWS-Server gibt es bereits eine Familie eigenständiger Web-Anwendungen, die über das Paket [SVWS-Tools](https://github.com/SVWS-NRW/SVWS-Tools) gemeinsam mit dem SVWS-Server ausgeliefert werden:

| Tool | Repository | Zielordner in SVWS-Tools |
|---|---|---|
| SVWS-Import | `SVWS-NRW/SVWS-Import` | `import/` |
| SVWS-Prognos | `SVWS-NRW/SVWS-Prognos` | `prognos/` |
| SVWS-Konferenz | `SVWS-NRW/SVWS-Conference` | `konferenz/` |
| SVWS-GradeHub | `SVWS-NRW/SVWS-GradeHub` | `gradehub/` |

Diese Tools teilen Technologie, Projektstruktur, Auslieferung und Design. Die Nutzerinnen und Nutzer sollen sie als eine Produktfamilie wahrnehmen, Entwickler sollen zwischen den Projekten wechseln können, ohne umzudenken. SVWS-KOOP soll sich nahtlos einfügen.

Maßgebliche Vorlagen sind die ADRs von SVWS-Prognos (insbesondere 0001, 0002, 0004, 0006, 0010–0013, 0017, 0019) und SVWS-Import. Als **Referenzimplementierung** dient SVWS-Prognos, weil es den aktuellsten Stand des gemeinsamen Musters zeigt (zentraler Error-Service, Vitest, Design-System, Electron).

Eine Besonderheit von SVWS-KOOP: Anders als die übrigen Tools arbeitet es nicht nur mit den Daten **einer** Schule, sondern mit den Daten **mehrerer** Schulen. Welche Folgen das für die Architektur hat, ist unten unter „Mehrere Schulen“ beschrieben.

## Ziele

1. **Gleiches Aussehen:** Wer SVWS-Import oder SVWS-Prognos kennt, erkennt SVWS-KOOP sofort als Teil derselben Familie (Farben, Kacheln, Kopfzeile, Fußzeile, Dark Mode).
2. **Gleiche Technik:** Dieselben Bibliotheken, dieselbe Verzeichnisstruktur, dieselben Muster für API-Zugriff, Anmeldung, State und Routing.
3. **Gleiche Auslieferung:** Web-Bundle für den SVWS-Server (über SVWS-Tools) und Desktop-App über Electron, mit demselben Release-Ablauf.
4. **Kein eigenes Backend:** Die Anwendung läuft vollständig im Browser bzw. in Electron und spricht direkt mit dem SVWS-Server.
5. **Datenschutz wie bei den Schwesterprojekten:** Schülerdaten verlassen den SVWS-Server nur in Richtung des angemeldeten Benutzers, Zugangsdaten werden nicht gespeichert.

## Entscheidung

### 1. Technologie

Wie SVWS-Prognos ADR 0001:

- **Single Page Application** mit **Vue 3** (Composition API, `<script setup>`) und **TypeScript**
- **Vite** als Build-Tool
- **PrimeVue 4** mit Aura-Theme und **PrimeIcons**
- **Pinia** für den State
- **Vue Router 4** mit `createWebHashHistory()`
- **Axios** für HTTP
- **AG Grid Community** für große Tabellen (z. B. Schüler-Kurs-Matrix), sonst PrimeVue-Komponenten
- **marked** + **DOMPurify** für Markdown-Inhalte (Impressum, Datenschutz, Hilfe)
- **Vitest** für Unit-Tests, **ESLint** für statische Prüfung

Die Major-Versionen der Abhängigkeiten richten sich nach SVWS-Prognos. Abweichungen werden begründet.

### 2. Projektstruktur

Wie SVWS-Prognos ADR 0012:

```
src/
├── App.vue                 # nur <Toast /> und <RouterView />
├── main.ts                 # PrimeVue, Pinia, Router, initTheme()
├── style.css               # Design-Tokens (siehe Abschnitt 4)
├── views/                  # eine Datei pro Route
├── components/
│   ├── shared/             # ThemeToggle, LegalFooter, …
│   └── <fachbereich>/      # fachliche Komponenten (ADR 002)
├── stores/                 # Pinia-Stores
├── services/               # apiClient, svwsService, errorService
├── models/                 # TypeScript-Interfaces
├── composables/            # useTheme, …
├── utils/                  # reine Hilfsfunktionen
├── koop/                   # Fachlogik der Kooperationsblockung, isoliert und testbar
└── router/
    └── index.ts
electron/main.cjs           # Electron-Hauptprozess
public/impressum.example.js # Vorlage für das Impressum
build/icon.svg, icon.png    # App-Icon
scripts/release.mjs         # Release-Skript
docs/                       # ADRs, Handbuch, Datenschutz
```

Das Verzeichnis `koop/` entspricht `rules/` in SVWS-Prognos: Die fachliche Logik (z. B. Blockungsregeln und -prüfungen) liegt dort ohne Abhängigkeit zu Vue oder zur API und wird mit Vitest getestet. Den Inhalt legt ADR 002 fest.

### 3. SVWS-Anbindung, Anmeldung, Fehler

- **REST-API des SVWS-Servers** als einzige Datenquelle und -senke (SVWS-Prognos ADR 0004). Für die gymnasiale Oberstufe stellt der SVWS-Server bereits Endpunkte unter `/db/{schema}/gost/…` bereit, unter anderem für Fachwahlen und Kursblockungen. Welche davon genutzt werden, klärt ADR 002.
- **Service-Layer** (SVWS-Prognos ADR 0010): `apiClient.ts` (Axios-Instanz, Basic-Auth-Header, Interceptors, Timeout), `svwsService.ts` (typisierte Methoden pro Endpunkt), kein direkter Axios-Aufruf außerhalb von `services/`.
- **Basic Auth** (SVWS-Prognos ADR 0011): Zugangsdaten nur im Arbeitsspeicher (Pinia), nie in `localStorage`/`sessionStorage`, nie in Logs. Prüfung über einen Test-Request beim Verbinden. Abmelden leert den Store und verwirft den API-Client.
- **Zentraler Error-Service** (`services/errorService.ts`, `models/AppError.ts`) mit Fehlerklassen (Netzwerk, Auth, API, Validierung) und einheitlicher Anzeige per Toast. Damit wird die in SVWS-Import nachträglich festgestellte Lücke (ADR 0009) von Anfang an vermieden.

### 4. Erscheinungsbild

Verbindlich ist das Design-System aus SVWS-Prognos ADR 0017 bzw. SVWS-Conference ADR 007:

- **Emerald** als Primärfarbe (`#059669` hell, `#34d399` dunkel), alle Farben als eigene CSS Custom Properties in `src/style.css`, keine Abhängigkeit von PrimeVue-internen Tokens wie `--p-surface-ground`.
- Die Token-Liste (`--accent`, `--accent-hover`, `--bg-a`, `--bg-b`, `--surface`, `--app-bg`, `--app-accent`, `--app-ink`, `--app-border`) wird aus SVWS-Prognos übernommen. KOOP-spezifische Tokens (z. B. Farben für Partnerschulen oder Konflikte in der Blockung) erhalten das Präfix `--koop-`.
- Body-Hintergrund mit dem gemeinsamen Emerald-Gradient.
- **Dark Mode** über die Klasse `dark` auf `<html>`, Präferenz `light | dark | system` in `localStorage` unter dem Schlüssel **`dark-mode`**, damit die Einstellung über alle SVWS-Tools synchron bleibt. `composables/useTheme.ts` und `components/ThemeToggle.vue` werden aus SVWS-Prognos übernommen.
- **Seitenaufbau** wie in SVWS-Prognos:
  - `ConnectView` als Anmeldeseite,
  - Dashboard mit Kopfzeile (Titel „SVWS KOOP“, ThemeToggle, „Abmelden“) und **Kachelraster** (`tile-grid`, `tile`, Icon, Titel, Untertitel, Chevron) als Einstieg in die Funktionen,
  - Fußzeile `LegalFooter` mit **Hilfe**, **Impressum** und **Datenschutzhinweise**.
- **Impressum** über `public/impressum.js` (Vorlage `impressum.example.js`, Variable `window.__IMPRESSUM_MARKDOWN__`), damit Schule oder IT-Dienstleister es ohne Neubau anpassen können.
- **Hilfe** verlinkt auf `https://doku.svws-nrw.de/svws_module/svws_koop/`.
- **WCAG AA** für alle Farbkombinationen.
- **Skalierung** wie in SVWS-Import und SVWS-Prognos: Im Browser gilt die Standardschriftgröße (100 %), keine eigene Verkleinerung über `font-size` auf `<html>`. Die Electron-App startet maximiert (`win.maximize()`, 1400×900 beim Verlassen der Maximierung), Zoom über Strg + / Strg − / Strg 0.

### 5. Routing

Hash-Routing wie SVWS-Prognos ADR 0013. `/#/connect` ist ungeschützt, alle übrigen Routen prüfen per Guard, ob eine Verbindung besteht. Die konkreten Routen ergeben sich aus ADR 002.

### 6. Auslieferung und Release

Wie SVWS-Prognos ADR 0002 und 0019 sowie SVWS-Import:

**Web-Bundle**
- `npm run build` erzeugt `dist/` mit `index.html` direkt im Root.
- Release-Asset: **`SVWS-KOOP-<version>-webapp.zip`**, flach (ohne umschließenden Ordner), wie es SVWS-Tools erwartet.

**Desktop-App (Electron)**
- Hauptprozess `electron/main.cjs`, behebt CORS über `onHeadersReceived`.
- `appId`: `de.skinwalker.svws-koop`, `productName`: `SVWS KOOP`
- Linux: AppImage, Windows: NSIS (`oneClick`, Desktop- und Startmenüeintrag, `menuCategory: "SVWS"`)
- Icon unter `build/icon.svg` und `build/icon.png` (256×256, kein `.ico`), mit eigener Hintergrundfarbe, die sich von Conference (Teal) und GradeHub (Blau) unterscheidet.

**Release**
- `npm run release [patch|minor|major|<x.y.z>]` über `scripts/release.mjs`: Version erhöhen, Commit und Tag `v<version>`, bauen, pushen, GitHub-Release als Entwurf mit Web-ZIP, AppImage und Windows-Installer.
- Versionierung nach SemVer, Start bei `0.1.0`.

### 7. Aufnahme in SVWS-Tools

Sobald ein erstes Release existiert, wird SVWS-KOOP in [SVWS-Tools](https://github.com/SVWS-NRW/SVWS-Tools) aufgenommen:

- Eintrag in `tools.json`: `name: "koop"`, `title: "SVWS-KOOP"`, `repo: "SVWS-NRW/SVWS-KOOP"`, `asset: "SVWS-KOOP-{version}-webapp.zip"`
- Kachel auf der Startseite mit `data-tool="koop"`, damit sie über `sichtbarkeit.js` ausgeblendet werden kann.

Im SVWS-Server ist das Tool dann unter `/app/koop/` erreichbar. Dort gelten die Einschränkungen von `/app/`: Es werden nur `.html`, `.js`, `.css`, Bilder und Schriften ausgeliefert, kein `.json`. Laufzeit-Konfiguration (wie das Impressum) wird deshalb als `.js` abgelegt.

### 8. Dokumentation

Wie in den Schwesterprojekten:

- `README.md` mit Zweck, Entwicklung, Build und Release
- `docs/adr/` mit fortlaufend nummerierten ADRs (`adrNNN-<thema>.md`)
- `docs/index.md` und Handbuchseiten für doku.svws-nrw.de
- `docs/datenschutz.md` als Quelle der Datenschutzhinweise in der App
- `impressum.example.md` als Vorlage

### 9. Mehrere Schulen

Alle bisherigen Tools verbinden sich mit genau einem SVWS-Server und einem Schema. SVWS-KOOP braucht die Daten mehrerer Kooperationsschulen. Damit diese Anforderung nicht später eine Umstellung der Grundstruktur erzwingt, gilt:

- Die Verbindungsschicht (`authStore`, `apiClient`) wird so gebaut, dass sie **mehrere Verbindungen gleichzeitig** halten kann, je eine pro Schule (Serveradresse, Schema, Zugangsdaten, eigene Axios-Instanz).
- Für jede Verbindung gelten dieselben Regeln wie in Abschnitt 3: Zugangsdaten nur im Arbeitsspeicher, Prüfung per Test-Request.
- Daten werden pro Schule geladen und in Stores mit Schulbezug gehalten. Die Fachlogik in `koop/` arbeitet auf diesen zusammengeführten Daten.

Ob die Schulen tatsächlich gleichzeitig verbunden werden, ob alle Kooperationsschulen auf einem gemeinsamen SVWS-Server liegen oder ob Daten zwischen den Schulen als Datei ausgetauscht werden, ist eine fachliche und organisatorische Frage und wird in ADR 002 entschieden.

## Alternativen

- **Eigenständiges Design oder anderes Framework (React, Angular):** verworfen, widerspricht Ziel 1 und 2.
- **Gemeinsame Komponentenbibliothek für alle SVWS-Tools:** wäre langfristig sauberer, ist aber bisher in keinem Projekt umgesetzt. Bis dahin werden `useTheme`, `ThemeToggle`, `LegalFooter`, `style.css`, `apiClient` und `errorService` aus SVWS-Prognos kopiert.
- **Eigenes Backend, das die Daten der Schulen zusammenführt:** verworfen, widerspricht Ziel 4 und würde einen zentralen Datenspeicher mit Schülerdaten mehrerer Schulen schaffen.
- **Integration als Modul in den SVWS-Client:** verworfen, weil SVWS-KOOP wie die anderen Tools unabhängig vom Release-Zyklus des SVWS-Servers entwickelt und veröffentlicht werden soll.

## Konsequenzen

**Positiv**
- Einheitliches Erscheinungsbild und gleiche Bedienung wie bei den übrigen SVWS-Tools.
- Entwickler können Code, Muster und Wissen aus SVWS-Prognos und SVWS-Import direkt übertragen.
- Auslieferung über den bestehenden Weg (SVWS-Tools, SVWS-Server-Installer) ohne neue Infrastruktur.
- Die mehrfähige Verbindungsschicht hält die Optionen für ADR 002 offen.

**Negativ / Risiken**
- Kopierter Code (Theme, Footer, Tokens, API-Client) muss manuell mit den Schwesterprojekten synchron gehalten werden.
- **CORS bei mehreren Servern:** Läuft das Web-Bundle unter `/app/koop/` auf dem SVWS-Server einer Schule, sind Zugriffe auf diesen Server same-origin. Zugriffe auf die SVWS-Server **anderer** Schulen sind dagegen Cross-Origin und scheitern ohne CORS-Freigabe auf deren Seite. Die Electron-App ist davon nicht betroffen. Das muss bei der Entscheidung in ADR 002 berücksichtigt werden.
- **Port für privilegierte Zugriffe:** Verwendet der SVWS-Server für `/api/schema/root/…` einen eigenen Port, ist dieser für das Web-Bundle eine fremde Adresse (CORS). SVWS-KOOP fragt deshalb optional eine zweite Adresse für privilegierte Zugriffe ab. Ist sie nicht erreichbar, werden Schema-Anlage und Backup-Import im Admin-Client des SVWS-Servers erledigt (ADR 003, Abschnitt 2).
- Ein Benutzer mit Zugängen zu mehreren Schulen hat im Browser Daten mehrerer Schulen gleichzeitig im Speicher. Das ist im Datenschutzkonzept (`docs/datenschutz.md`) zu beschreiben.

## Offene Fragen

- **Datenaustausch zwischen den Schulen:** gleichzeitige Verbindung zu mehreren SVWS-Servern, gemeinsamer Server oder Dateiaustausch? → ADR 002 sieht SQLite-Backups vor; SVWS-KOOP arbeitet dann mit mehreren Schemata auf **einem** Server, das CORS-Risiko entfällt.
- **Rückschreiben:** Wird das Blockungsergebnis in die SVWS-Datenbanken der beteiligten Schulen zurückgeschrieben, und über welche Endpunkte? → ADR 002
- **Icon-Farbe:** Welche Hintergrundfarbe bekommt das KOOP-Icon?
