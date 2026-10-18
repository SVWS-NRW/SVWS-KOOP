# SVWS-KOOP: Projektplan

Stand: 2026-10-16

Grundlage sind die angenommenen Architekturentscheidungen:

- [ADR 001](adr/adr001-architektur-und-erscheinungsbild.md): Architektur und Erscheinungsbild
- [ADR 002](adr/adr002-fachliche-anforderungen.md): Fachliche Anforderungen
- [ADR 003](adr/adr003-pruefung-svws-api.md): Prüfung der SVWS-API
- [ADR 004](adr/adr004-rueckspielung.md): Rückspielung in die Stammschulen

## Erledigt

- [x] Architektur, fachliche Anforderungen und API-Prüfung (ADR 001–003), Rückspielung (ADR 004)
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

### 2. Konsistenzprüfung – umgesetzt

- [x] Vergleich von Fächern, Oberstufeneinstellungen, Jahrgängen (mit Schulgliederung), Klassen, Erzieherarten, Schulkatalog und Länge der Lehrerkürzel
- [x] Abweichungen melden und auf Nachfrage korrigieren (Jahrgänge, Einstellungen und Fächer der Abiturjahrgänge; übrige Bereiche nur Meldung)
- [x] Jahrgänge in die KOOP-DB übernehmen (Voraussetzung für den Abiturjahrgang)
- [x] Fehler und Warnungen unterscheiden, Ergebnisliste zuklappbar
- [ ] Korrektur weiterer Bereiche (Erzieherarten, Schulkatalog), falls mit echten Testdaten nötig

### 3. Übernahme – umgesetzt

- [x] KOOP-DB vorbereiten: Jahrgänge, Fächer, Klassen `10`/`EF`/`Q1`/`Q2`, Abiturjahrgänge mit Einstellungen und Leitfächern
- [x] Kataloge als Vereinigung: Erzieherarten, Telefonarten, Religionen, Orte, Fahrschülerarten, Haltestellen
- [x] Lehrkräfte mit Kürzel `<Kürzel>-<Nr>` und Stammschule, ohne Platzhalter
- [x] Schüler (Status Aufnahme, Aktiv, Beurlaubt) mit Stammdaten, allen Erziehern, allen Telefonnummern, Sprachenfolge und Fachwahlen je Fach ab dem aktuellen Halbjahr
- [x] Wiederholbar, mit Protokoll; abgebrochene Übernahmen werden beim nächsten Lauf vervollständigt
- [ ] Offen: Fachwahlen vergangener Halbjahre fehlen in der KOOP-DB (Server verlangt dafür Lernabschnitte, ADR 003, Abschnitt 7)
- [x] Dauer verkürzen: parallel schreiben mit Wiederholung und Jitter bei 500 (Race Condition des Servers)

### 3a. Nachladen (A21) – umgesetzt

- [x] Abgleich jeder Quell-DB mit der KOOP-DB, vorher Konsistenzprüfung
- [x] Neue Schüler und Lehrkräfte nachladen (gleiche Logik wie die Übernahme, Kataloge werden vorher ergänzt)
- [x] Abgegangene Schüler (fehlt, anderer Jahrgang, anderer Status) und Lehrkräfte (fehlt, nicht mehr aktiv) melden
- [x] Abgegangene Schüler entfernen: Kurszuordnungen in allen Blockungsergebnissen und Leistungsdaten löschen, dann Löschvermerk (zählt dann nicht mehr zum Abiturjahrgang)
- [x] Abgegangene Lehrkräfte entfernen: aus Blockungskursen und Kursen nehmen, unsichtbar setzen
- [ ] Endgültiges Löschen von Schülern, sobald der Endpunkt wieder da ist (Issue 01)
- [ ] Rückkehrer: Schüler mit Löschvermerk, der wieder in der Quell-DB auftaucht, wird heute neu angelegt statt reaktiviert
- [ ] Backup einer Schule direkt in der Ansicht einspielen (heute über den Admin-Client)

### 3b. Übersicht KOOP-DB – umgesetzt

- [x] Schulen: Schüler je Stufe, Schüler ohne Fachwahlen, aktive und entfernte Lehrkräfte, Kurse und Wochenstunden im laufenden Halbjahr, Prüfung des Schulkatalogs
- [x] Stufen: Verteilung der Schüler auf die Schulen, Schüler ohne Fachwahlen, Kurse (auch ohne Lehrkraft), Blockungen aller Halbjahre mit Link in den SVWS-Client
- [x] Lehrkräfte: Liste mit Suche, Filter nach Schule und Status, Kurse, Wochenstunden und Stufen
- [ ] Link in den SVWS-Client im Browser prüfen (Route aus dem Quellcode des Clients abgeleitet)
- [ ] Kooperationskurse: Schüler, die Kurse an einer Partnerschule besuchen

### 4. Rückspielung (Phase 4, ADR 004)

Vorarbeiten:
- [x] Prüfsumme der Fachwahlen bei Übernahme und Nachladen speichern (`fachwahlen.<Schulnummer>`), fehlende werden beim nächsten Lauf nachgetragen
- [x] Kachel „Verteilen“: `stand` setzen, SQLite-Backup der KOOP-DB herunterladen (`/db/{schema}/export/sqlite`, Admin reicht)
- [ ] In `kooptest` Lehrkräfte an Blockungskursen zuordnen und die Blockungen erneut aktivieren

Rückspielung – umgesetzt, am Testserver mit `koop_ge` und `koop_gy` geprüft:
- [x] Anmeldung an der Datenbank der Schule, Erkennung der Quellschule über die Schulnummer
- [x] Vorschau mit Fehlern, Warnungen und Hinweisen je Abiturjahrgang und Halbjahr, Zuordnung von Kursen ohne eindeutige Lehrkraft (einzeln und gesammelt)
- [x] Eigene Kurse und Leistungsdaten der Schule unverändert lassen, Konflikte (gleiches Fach, gleiches Kurskürzel) melden, eigene Blockungen der Schule deutlich warnen
- [x] Angelegte Kurse, Leistungsdaten und Blockung in der Schule vermerken, bei erneuter Rückspielung nur diese ersetzen
- [x] Platzhalter-Lehrkräfte je Partnerschule anlegen
- [x] Fachwahlen ab dem aktuellen Halbjahr schreiben, Prüfsummen vergleichen
- [x] Kurse und Leistungsdaten mit `koopSchule` schreiben, `restore` (nicht bei eigener Blockung der Schule)
- [x] `letzteRueckspielung` speichern, Protokoll, Hinweis auf das Löschen des KOOP-Schemas
- [x] Schreiben geprüft (2026-10-18): Fachwahlen, Platzhalter, Kurse, Leistungsdaten mit `koopSchule`, `restore`, Vermerk und Ersetzen bei erneuter Rückspielung
- [ ] An vollständigen Testdatenbanken prüfen: Kurse mit Lehrkräften beider Schulen, weitere Lehrkräfte, Schulen ohne eigene Oberstufenkurse, viele Schüler

### 5. Abrunden

- [ ] Protokolle
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
  - Hard-Delete für Schüler (`DELETE /schueler/delete/multiple`) fehlt seit Commit `20b579a9d8`
  - Race Condition bei gleichzeitigen Create-Aufrufen (500)
- [x] **Blockungs-Testdatenbanken** vorbereiten (2026-10-17, siehe „Testumgebung“): Quell-DBs, die wie eine echte Kooperation zusammenpassen
  - verschiedene Schulnummern (aus dem Schulkatalog, nicht 123456)
  - gleicher Schuljahresabschnitt
  - Klassen `EF`, `Q1`, `Q2` an allen Schulen
  - einheitliche Fächer (Kürzel, Statistikkürzel, Bezeichnung) und Fächereinstellungen der Abiturjahrgänge
  - Abiturjahrgänge für 10, EF, Q1, Q2 mit Fachwahlen
  - gleiche Erzieherarten, Partnerschulen mit Kürzel im Schulkatalog
- [ ] Testdaten aus echten Kooperationen
- [ ] Pilotschulen bzw. eine Kooperation als Ansprechpartner finden
- [ ] Hilfe-Seite unter doku.svws-nrw.de mit dem Projekt SVWS-Dokumentation abstimmen

## Testumgebung

Testserver `https://localhost:8443` (Zugangsdaten in der lokalen `.env`, nicht im Repository). Alle Schemata enthalten Testdaten.

| Schema | Inhalt |
|---|---|
| `koop_gy` | Kopie von `gymnasium`, Schulnummer 168890 (Engelbert-Kaempfer-Gymnasium), Abschnitt 2026/1 |
| `koop_ge` | Kopie von `gesamtschule`, Schulnummer 192806 (Städt. Gesamtschule Barmen), Abschnitt 2026/1, Klassen `EF`/`Q1`/`Q2` |
| `kooptest` | KOOP-DB aus `koop_gy` (Schule 1) und `koop_ge` (Schule 2), Admin ohne Kennwort, Benutzer `Schule1`/`schule1` und `Schule2`/`schule2` |

`koop_gy` und `koop_ge` sind angeglichen: gleicher Abschnitt, gleiche Klassen der Oberstufe, gemeinsamer Fächerkatalog der Oberstufe (fehlende Fächer in der jeweils anderen Schule angelegt), gleiche Fächereinstellungen und Leitfächer in den Abiturjahrgängen, gleiche Erzieherarten, Partnerschulen mit Kürzel im Schulkatalog (`EKG`, `GEB`). Die Konsistenzprüfung meldet 0 Fehler und 0 Warnungen.

Die Originale `gymnasium`, `gymnasium2`, `gymnasium3` und `gesamtschule` haben alle die Schulnummer 123456 aus dem Anonymisierungstool.

## Bekannte Einschränkungen

- Bis zur Reparatur im SVWS-Server setzt die Rückspielung die Schulnummer der Partnerschule nur in den Leistungsdaten, nicht am Kurs.
- Bis `IDext` über die API verfügbar ist, steht die ID aus der Stammschule in der Schülerausweisnummer der KOOP-DB.
- 8 mittlere Meldungen von `npm audit` in electron-builder (`sprintf-js`), nur zur Build-Zeit, ohne verfügbare Korrektur.
