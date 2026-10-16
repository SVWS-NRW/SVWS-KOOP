# SVWS-KOOP: Projektplan

Stand: 2026-10-16

Grundlage sind die angenommenen Architekturentscheidungen:

- [ADR 001](adr/adr001-architektur-und-erscheinungsbild.md): Architektur und Erscheinungsbild
- [ADR 002](adr/adr002-fachliche-anforderungen.md): Fachliche Anforderungen
- [ADR 003](adr/adr003-pruefung-svws-api.md): Prüfung der SVWS-API

## Erledigt

- [x] Architektur, fachliche Anforderungen und API-Prüfung (ADR 001–003)
- [x] Testserver mit den Schemata `kooptest` (KOOP-DB) und `koopquelle_test` (Kopie von `svwsdb`)
- [x] Projektgerüst: Anmeldung an der KOOP-DB, Dashboard mit Kacheln, Design, Dark Mode, Fußzeile, Electron, Release-Skript
- [x] Fachlogik für Lehrerkürzel `<Kürzel>-<Nr>` mit Tests
- [x] Sicherheitsupdate vitest 4 (kritische Meldungen behoben)

## Nächste Schritte

Die Reihenfolge folgt dem Ablauf aus ADR 002. Jeder Schritt ist für sich nutzbar.

### 1. Assistent „KOOP-DB einrichten“ (Phase 1) – umgesetzt

- [x] Alle Angaben vorab abfragen: Server, Root-Zugang, Quell-DBs mit Zugangsdaten und Nummer, Name und Datenbank-Benutzer der KOOP-DB, neue Benutzer je Schule
- [x] Angaben prüfen, bevor etwas angelegt wird
- [x] KOOP-DB anlegen, initialisieren und als KOOP-DB kennzeichnen
- [x] Quellschulen in den Schulkatalog eintragen, Benutzer je Schule anlegen
- [x] Optional: Quell-DB aus SQLite-Datei einspielen

### 2. Konsistenzprüfung

- [ ] Vergleich von Fächern, Oberstufeneinstellungen, Jahrgängen (mit Schulgliederung), Klassen, Erzieherarten, Schulkatalog und Länge der Lehrerkürzel
- [ ] Abweichungen melden und auf Nachfrage korrigieren
- [ ] Jahrgänge in die KOOP-DB übernehmen (Voraussetzung für den Abiturjahrgang)

### 3. Übernahme

- [ ] Lehrkräfte mit Kürzel `<Kürzel>-<Nr>` und Stammschule
- [ ] Schüler mit Stammdaten, Erzieherdaten, Sprachenfolge und Fachwahlen je Fach
- [ ] Wiederholbar, mit Protokoll

### 4. Rückspielung (Phase 4)

- [ ] Prüfungen: zu altes Backup, in der Stammschule geänderte Fachwahlen
- [ ] Kurse und Leistungsdaten mit `koopSchule` schreiben
- [ ] Platzhalter-Lehrkräfte je Partnerschule anlegen
- [ ] Geänderte Fachwahlen übertragen
- [ ] Blockung in der Stammschule mit `restore` wiederherstellen

### 5. Abrunden

- [ ] Nachladen, Übersicht der KOOP-DB, Protokolle
- [ ] App-Icon
- [ ] Electron-Build und erstes Release 0.1.0
- [ ] Aufnahme in [SVWS-Tools](https://github.com/SVWS-NRW/SVWS-Tools)
- [ ] Anleitung für Anwenderinnen und Anwender unter `docs/`

## Parallel

Diese Punkte hängen nicht von der Umsetzung ab:

- [ ] Meldungen an das SVWS-Team (Details in ADR 003):
  - Schulnummer am Kurs lässt sich nicht setzen (500)
  - `IDext` der Schüler ist nicht über die API erreichbar
  - Jahrgänge haben nach `init` keine Schulgliederung
- [ ] Weitere Testdaten: `gymnasium` als zweite Quell-DB, eine dritte Quell-DB mit Oberstufe
- [ ] Pilotschulen bzw. eine Kooperation als Ansprechpartner finden
- [ ] Hilfe-Seite unter doku.svws-nrw.de mit dem Projekt SVWS-Dokumentation abstimmen

## Bekannte Einschränkungen

- Bis zur Reparatur im SVWS-Server setzt die Rückspielung die Schulnummer der Partnerschule nur in den Leistungsdaten, nicht am Kurs.
- Bis `IDext` über die API verfügbar ist, steht die ID aus der Stammschule in der Schülerausweisnummer der KOOP-DB.
- 8 mittlere Meldungen von `npm audit` in electron-builder (`sprintf-js`), nur zur Build-Zeit, ohne verfügbare Korrektur.
