# SVWS-KOOP

Werkzeug für Schulen mit gymnasialer Oberstufe in NRW, die ihre Oberstufenkurse in einer **Kooperation gemeinsam blocken**.

Arbeiten bis zu drei Schulen zusammen und blocken die gesamte Stufe gemeinsam, können ihre Schülerinnen und Schüler dieselben Kurse besuchen. So lassen sich mehr Kurse einrichten und ein breiteres Fächerangebot machen. SVWS-KOOP führt dafür die Daten der Kooperationsschulen in einer gemeinsamen Datenbank zusammen. Dort wird mit den vorhandenen Werkzeugen des SVWS-Servers geblockt, danach bringt SVWS-KOOP die Ergebnisse in die Datenbank jeder Schule zurück.

SVWS-KOOP gehört zur Familie der [SVWS-Tools](https://github.com/SVWS-NRW/SVWS-Tools) und sieht aus und funktioniert wie SVWS-Import, SVWS-Prognos und SVWS-Konferenz.

## Projektstatus

**Phase 1 umgesetzt.** Architektur, fachliche Anforderungen und die Prüfung der SVWS-API sind beschlossen ([ADR 001](docs/adr/adr001-architektur-und-erscheinungsbild.md), [ADR 002](docs/adr/adr002-fachliche-anforderungen.md), [ADR 003](docs/adr/adr003-pruefung-svws-api.md)). Die Rückspielung ist in [ADR 004](docs/adr/adr004-rueckspielung.md) festgelegt. Umgesetzt sind der Assistent „KOOP-DB einrichten“ (auf der Anmeldeseite), die Konsistenzprüfung, die Übernahme von Lehrkräften und Schülern und das Nachladen, die Übersicht der KOOP-DB und das Verteilen. Rückspielung und Protokolle sind in Vorbereitung.

## So funktioniert es

Betroffen sind die Jahrgänge 10, EF, Q1 und Q2. Für die 10 wird die EF des kommenden Schuljahres geplant. Geblockt wird wie an einer einzelnen Schule: eine Blockung pro Abiturjahrgang und Halbjahr.

Der Datenaustausch läuft über SQLite-Backups. Es gibt keine Leitschule, alle Kooperationsschulen sind gleichberechtigt.

| Phase | Wo | Was passiert |
|---|---|---|
| **1. Zusammenführen** | KOOP-Server (ein SVWS-Server nach Wahl) | Jede Schule liefert ein SQLite-Backup. SVWS-KOOP legt die KOOP-DB an, prüft, ob Fächer, Oberstufeneinstellungen, Klassen und Kataloge übereinstimmen, und übernimmt Schüler (Stammdaten, Erzieher, Telefonnummern, Sprachenfolge, Fachwahlen) und aktive Lehrkräfte. |
| **2. Blocken** | KOOP-Server, im SVWS-Client | Die Blockung wird mit den vorhandenen Funktionen des SVWS-Servers erstellt und aktiviert. Fachwahländerungen werden nur noch in der KOOP-DB gepflegt. |
| **3. Verteilen** | KOOP-Server | SVWS-KOOP vermerkt den Stand und erstellt ein Backup der KOOP-DB für jede Schule. |
| **4. Zurückspielen** | SVWS-Server jeder Schule | Jede Schule spielt das KOOP-Backup ein. SVWS-KOOP überträgt nach Vorschau und Bestätigung Kurse, Kurszuordnungen und geänderte Fachwahlen der eigenen Schüler in die Datenbank der Schule. Danach wird die KOOP-Kopie gelöscht. |

Wichtige Regeln:

- Jeder Schüler in der KOOP-DB kennt seine Stammschule (`ExterneSchulNr`) und seine ID dort. Bei der Rückspielung gelangen nur die eigenen Schüler in die Datenbank einer Schule.
- Lehrerkürzel werden in der KOOP-DB um die Nummer der Quellschule ergänzt (z. B. `MÜL-2`). Daran erkennt SVWS-KOOP, an welcher Schule ein Kurs stattfindet.
- Kurse an einer Partnerschule erhalten in der Stammschule deren Schulnummer und eine nicht statistikrelevante Platzhalter-Lehrkraft mit dem Kürzel der Partnerschule.
- SVWS-KOOP warnt bei veralteten Backups und bei Fachwahlen, die außerhalb der KOOP-DB geändert wurden.
- Neue und abgegangene Schüler lassen sich jederzeit nachladen.

Alle Einzelheiten stehen in [ADR 002](docs/adr/adr002-fachliche-anforderungen.md).

## Voraussetzungen

- SVWS-Server für den KOOP-Server und an jeder Kooperationsschule
- Zugangsdaten eines **Datenbank-Administrators** auf dem KOOP-Server und an jeder Schule (Backups einspielen, Schemata anlegen und löschen)
- an jeder Schule ein Benutzer mit Admin- oder Backup-Rechten sowie vollen Rechten für Laufbahn- und Kursplanung der Oberstufe
- übereinstimmende Fächer, Oberstufeneinstellungen und Klassenbezeichnungen in allen Kooperationsschulen (SVWS-KOOP prüft das)
- eine Vereinbarung der Kooperationsschulen zum Datenschutz, weil Schüler- und Lehrerdaten zwischen den Schulen ausgetauscht werden

## Architektur auf einen Blick

| Bereich | Entscheidung |
|---|---|
| Frontend | Vue 3 + TypeScript als Single Page Application, kein eigenes Backend |
| UI | PrimeVue 4 (Aura), Emerald-Design-System und Dark Mode wie in den anderen SVWS-Tools |
| State / Routing | Pinia, Vue Router mit Hash-History |
| Datenzugriff | REST-API des SVWS-Servers über einen gekapselten Service-Layer (Axios) |
| Anmeldung | Basic Auth, Zugangsdaten nur im Arbeitsspeicher |
| Fachlogik | isoliert und mit Vitest getestet unter `src/koop/` |
| Auslieferung | Web-Bundle (`SVWS-KOOP-<version>-webapp.zip`) für den SVWS-Server und Desktop-App mit Electron (AppImage, Windows-Installer) |

Die Begründungen stehen in [ADR 001](docs/adr/adr001-architektur-und-erscheinungsbild.md).

## Entwicklung

Voraussetzung: Node.js 22+ und ein erreichbarer SVWS-Server.

```bash
npm install
npm run dev            # Dev-Server auf http://localhost:5173
npm run build          # Typprüfung und statisches Bundle → dist/
npm run test           # Unit-Tests (Vitest)
npm run electron:dev   # Desktop-App lokal starten
npm run release        # Version erhöhen, AppImage, Windows-Installer und Web-ZIP → release/, GitHub-Release-Entwurf
```

Im Dev-Server laufen alle Anfragen an den SVWS-Server über einen Proxy (`/svws-proxy`), damit CORS und selbstsignierte Zertifikate nicht stören. Die Anmeldemaske lässt sich über eine `.env` vorbelegen, Vorlage: [.env.example](.env.example).

Projektstruktur (ADR 001, Abschnitt 2):

```
src/
├── views/        Seiten (Anmeldung, Einrichten, Dashboard, Konsistenz, Übernahme, Nachladen, Übersicht, Verteilen)
├── components/   ThemeToggle, LegalFooter
├── stores/       Pinia-Stores
├── services/     apiClient (mehrere Verbindungen), svwsService, errorService
├── models/       TypeScript-Typen
├── composables/  useTheme
├── koop/         Fachlogik, ohne Vue und API, mit Vitest getestet
└── router/
electron/main.cjs Electron-Hauptprozess
```

## Dokumentation

- [docs/adr/](docs/adr/): Architekturentscheidungen
- Die Anleitung für Anwenderinnen und Anwender entsteht später unter `docs/`.

## Offene Punkte

- Der SVWS-Server stellt die Spalte `IDext` noch nicht über die API bereit. Bis dahin wird die ID eines Schülers aus seiner Stammschule in der Schülerausweisnummer der KOOP-DB mitgeführt.
- Das App-Icon steht noch aus.

## Verwandte Projekte

- [SVWS-Server](https://github.com/SVWS-NRW/SVWS-Server): REST-API, Kursblockung der Oberstufe
- [SVWS-Tools](https://github.com/SVWS-NRW/SVWS-Tools): gemeinsames Auslieferungspaket aller SVWS-Tools
- [SVWS-Prognos](https://github.com/SVWS-NRW/SVWS-Prognos), [SVWS-Import](https://github.com/SVWS-NRW/SVWS-Import): gleiche technische Basis

## Lizenz

BSD 3-Clause, siehe [LICENSE](LICENSE).
