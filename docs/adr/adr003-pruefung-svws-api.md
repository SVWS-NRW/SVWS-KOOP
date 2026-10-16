# ADR 003: Prüfung der SVWS-API für SVWS-KOOP

- **Status:** Angenommen
- **Datum:** 2026-10-15, aktualisiert 2026-10-16
- **Autor:** Frank Pfotenhauer

## Kontext

[ADR 002](adr002-fachliche-anforderungen.md) beschreibt den Ablauf in vier Phasen und nennt dafür Endpunkte des SVWS-Servers. Vor Beginn der Umsetzung wurde geprüft, ob diese Endpunkte das Benötigte wirklich leisten.

Geprüft wurde in zwei Schritten:

1. **Quellcode des SVWS-Servers** (Repository `SVWS-NRW/SVWS-Server`, Stand 2026-10-15).
2. **Testserver** `https://localhost:8443` (DB-Revision 80, ohne eigenen Port für privilegierte Zugriffe) am 2026-10-16. Dazu wurde das Test-Schema `kooptest` mit Schulnummer 168890 angelegt.

## Ergebnis auf einen Blick

| Schritt | Endpunkt | Ergebnis |
|---|---|---|
| KOOP-DB anlegen | `POST /api/schema/root/create/{schema}` | ✅ getestet, siehe 1 |
| KOOP-DB initialisieren | `POST /api/schema/create/{schema}/init/{schulnummer}` | ✅ getestet, braucht den **Datenbank-Benutzer des Schemas**, siehe 1 |
| Jahrgänge der KOOP-DB | `PATCH /db/{schema}/jahrgaenge/{id}` | ⚠️ nach `init` unvollständig, müssen angeglichen werden, siehe 1 |
| Backup erstellen | `GET /api/schema/export/{schema}/sqlite` | ✅ getestet, braucht **Datenbank-Zugangsdaten**, siehe 1 |
| Backup einspielen | `POST /api/schema/root/import/sqlite/{schema}` | ✅ getestet, siehe 1 |
| Root-Endpunkte aus dem Browser | `/api/schema/root/…` | ⚠️ Einschränkung durch Port für privilegierte Zugriffe, siehe 2 |
| Benutzer anlegen, Adminrechte, Kennwort | `POST /db/{schema}/benutzer/new`, `…/{id}/addAdmin`, `…/{id}/password` | ✅ getestet, siehe 1 |
| Schüler anlegen | `POST /db/{schema}/schueler/create` + PATCH-Endpunkte | ✅ getestet, siehe 3 |
| Abiturjahrgang anlegen | `POST /db/{schema}/gost/abiturjahrgang/new/{abschnitt}/{jahrgang}` | ✅ getestet (nach Angleichen der Jahrgänge), siehe 3 |
| Fachwahlen übertragen | Laufbahnplanung-Import v2 | ❌ **nicht geeignet**, siehe 4 |
| Fachwahlen übertragen | `PATCH /db/{schema}/gost/schueler/{id}/fachwahl/{fachid}` | ✅ getestet, auch für später angelegte Schüler, siehe 4 |
| Sprachenfolge | `/db/{schema}/schueler/{id}/sprachen/belegungen`, `…/pruefungen` | ✅ laut Code vorhanden, wird gebraucht, siehe 4 |
| Lehrkräfte anlegen | `POST /db/{schema}/lehrer/create` | ✅ laut Code geeignet, siehe 5 |
| Stammschule der Lehrkraft | `POST /db/{schema}/lehrer/personalabschnittsdaten` | ✅ laut Code geeignet, siehe 5 |
| Schulkatalog | `POST /db/{schema}/schule/schulen/create` | ✅ getestet, siehe 5 |
| Kurse zurückspielen | `POST /db/{schema}/kurse/create` | ✅ getestet, **aber `schulnummer` nicht setzbar (Fehler im SVWS-Server)**, siehe 6 |
| Leistungsdaten zurückspielen | `POST /db/{schema}/schueler/leistungsdaten/create/multiple` | ✅ getestet, auch `koopSchule`, siehe 6 |
| Blockung in der Stammschule wiederherstellen | `GET /db/{schema}/gost/blockungen/{abiturjahr}/{halbjahr}/restore` | ✅ getestet, siehe 6 |

## 1. KOOP-DB anlegen

**Anlegen** (`POST /api/schema/root/create/{schema}`):

- Anmeldung per Basic Auth mit dem **Datenbank-Root-Benutzer**.
- Body (`BenutzerKennwort`): `{"user": "<DB-Benutzer>", "password": "<Kennwort>"}`. Der Datenbank-Benutzer wird neu angelegt und erhält den administrativen Zugang zum Schema.
- Im Schema entsteht der SVWS-Benutzer **`Admin` ohne Kennwort**.

**Initialisieren** (`POST /api/schema/create/{schema}/init/{schulnummer}`):

- Anmeldung mit dem **Datenbank-Benutzer des Schemas** aus dem vorigen Schritt. Mit `Admin` gibt der Server 401 zurück (getestet).
- Legt Schulstammdaten, Teilstandort, den aktuellen Schuljahresabschnitt, Jahrgänge 05–Q2 und einen Fächerkatalog an.
- Die Schulnummer muss im Schulkatalog des SVWS-Servers vorkommen. 409, wenn das Schema bereits eine Schule enthält.

**Entscheidung: Alle Angaben werden vor der Generierung abgefragt.** SVWS-KOOP sammelt im Assistenten „KOOP-DB einrichten“ zuerst alle Angaben, prüft sie und legt erst danach etwas an. So bricht die Generierung nicht auf halbem Weg wegen einer fehlenden oder falschen Angabe ab.

| Bereich | Eingabe | Verwendung |
|---|---|---|
| Server | Adresse des KOOP-Servers, optional Adresse für privilegierte Zugriffe | alle Aufrufe, Root-Endpunkte (Abschnitt 2) |
| Datenbank-Root | Benutzername und Kennwort | Basic Auth für `root/create` und `root/exists` |
| Quell-DBs (je Schule, bis zu drei) | **Name des Schemas** auf dem KOOP-Server | Lesen der Schuldaten |
| | **SVWS-Benutzer und Kennwort** für dieses Schema | Basic Auth beim Lesen |
| | Nummer der Schule (1, 2, 3) | Schulkatalog, Lehrerkürzel `-<Nr>` |
| KOOP-DB | **Name des Schemas** | Pfad von `root/create` und `init` |
| | Datenbank-Benutzer und Kennwort | Body von `root/create`, Basic Auth für `init` |
| | Schulnummer (Auswahl aus den Quellschulen) | Pfad von `init` |
| | Kennwort für `Admin` (optional, leer erlaubt) | `POST …/benutzer/{id}/password` |
| Neue Benutzer in der KOOP-DB (je Schule) | **Benutzername**, Anzeigename, Kennwort | `POST …/benutzer/new`, `…/addAdmin` |

Prüfungen vor der Generierung:

- Der Server ist erreichbar, die Root-Zugangsdaten sind gültig.
- Jede Quell-DB existiert, die Anmeldung mit den angegebenen Zugangsdaten gelingt, und die Schulnummern sind verschieden.
- Der Name der KOOP-DB ist noch nicht vergeben (`GET /api/schema/root/exists/{schema}`) und unterscheidet sich von den Quell-DBs.
- Die Benutzernamen der neuen Benutzer sind eindeutig.

Erst danach legt SVWS-KOOP die KOOP-DB an, initialisiert sie und arbeitet dann **mit dem SVWS-Benutzer `Admin`** weiter. Kennwörter werden nur für die Dauer der Sitzung im Arbeitsspeicher gehalten (ADR 001).

**Kennwörter:** Die KOOP-DB wird zunächst mit `Admin` und leerem Kennwort angelegt. Das Kennwort setzt danach SVWS-KOOP oder der Benutzer. Als `Admin` lassen sich Kennwörter über die API setzen (`POST /db/{schema}/benutzer/{id}/password`, Body: Kennwort als JSON-String). Getestet: Benutzer „Schule1“ angelegt (`POST …/benutzer/new` mit `anzeigename`, `benutzername`, `password`), Adminrechte vergeben (`POST …/benutzer/{id}/addAdmin`), Kennwort geändert, Anmeldung mit neuem Kennwort erfolgreich, mit altem abgelehnt.

**Jahrgänge nach `init` unvollständig (getestet):** Bei den von `init` angelegten Jahrgängen sind **Schulgliederung**, Sekundarstufe, Restabschnitte und Folgejahrgang leer. Ohne Schulgliederung kann der Server kein Abiturjahr berechnen, `abiturjahrgang/new` antwortet dann mit 404. SVWS-KOOP muss die Jahrgänge der KOOP-DB deshalb aus den Quellschulen übernehmen (`PATCH /db/{schema}/jahrgaenge/{id}` mit u. a. `idSchulgliederung`, `anzahlRestabschnitte`, `idFolgejahrgang`). Nach dem Setzen von `idSchulgliederung` ließ sich der Abiturjahrgang 2029 anlegen.

Die Quellschulen selbst unterscheiden sich hier ebenfalls: In `gymnasium` hat die EF die Gliederung `GY8`, in `svwsdb` `***`. Die Konsistenzprüfung muss die Jahrgangseinstellungen deshalb einschließlich der Schulgliederung vergleichen (ADR 002, A7).

**Backup erstellen** (`GET /api/schema/export/{schema}/sqlite`, getestet): Funktioniert nur mit **Datenbank-Zugangsdaten**, also mit dem Root-Benutzer oder dem Datenbank-Benutzer des Schemas. Mit dem SVWS-Benutzer `Admin` antwortet der Server mit 401. Die Kompetenz „Backup durchführen“ (`EXTRAS_BACKUP_DURCHFUEHREN`) wird von keinem Endpunkt geprüft. Export von `svwsdb`: 30 MB in 12 Sekunden.

**Einspielen** über die privilegierte API (`POST /api/schema/root/import/sqlite/{schema}`, multipart, Basic Auth mit Root, getestet): Felder `database` (SQLite-Datei), `schemaUsername`, `schemaUserPassword`. Der Datenbank-Benutzer wird für das neue Schema angelegt. Test: Backup von `svwsdb` als `koopquelle_test` eingespielt, 17 Sekunden. Die SVWS-Benutzer der Quelle bleiben mit ihren Kennwörtern erhalten, SVWS-KOOP kann die Quell-DB also mit denselben Zugangsdaten lesen wie an der Schule.

Ein vorhandenes Schema gleichen Namens wird **ersetzt**. SVWS-KOOP prüft deshalb vorher mit `GET /api/schema/root/exists/{schema}` und fragt nach.

**Folge für den Assistenten:** Je Quell-DB kann der Benutzer statt eines vorhandenen Schemas eine **SQLite-Datei** angeben. Dann fragt SVWS-KOOP zusätzlich Name und Kennwort des Datenbank-Benutzers für das neue Schema ab und spielt die Datei vor der Generierung ein.

## 2. Root-Endpunkte und Port für privilegierte Zugriffe

Der SVWS-Server kann einen eigenen Port für privilegierte Zugriffe haben (`SVWSAuthenticator.java`, Konfiguration `PortHTTPPrivilegedAccess`). Ist er konfiguriert, sind `/api/schema/root/…` **nur** über diesen Port erreichbar und alle anderen Endpunkte dort **nicht**. Außerdem kann der Root-Zugriff abgeschaltet sein (`DisableDBRootAccess`). Der Testserver hat keinen eigenen Port, dort funktionierte der Root-Zugriff über 8443.

**Folgen:**

- Läuft SVWS-KOOP als Web-Bundle unter `/app/koop/`, ist ein eigener privilegierter Port eine andere Adresse. Der Browser blockiert den Zugriff (CORS). Die Electron-App ist nicht betroffen.
- SVWS-KOOP fragt deshalb optional eine **zweite Adresse für privilegierte Zugriffe** ab.
- Ist der Root-Zugriff abgeschaltet oder nicht erreichbar, zeigt SVWS-KOOP eine Anleitung, wie Schema-Anlage und Backup-Import im **Admin-Client des SVWS-Servers** erledigt werden. Danach geht es in SVWS-KOOP weiter.

## 3. Schüler und Abiturjahrgang

`POST /db/{schema}/schueler/create` (Body `SchuelerNeu`) legt Schüler **und Lernabschnitt** an: Nachname, Vorname, alle Vornamen, Geschlecht, Geburtsdatum, Status, Anmelde- und Aufnahmedatum, Religion, Schuljahresabschnitt, Jahrgang, Klasse. Getestet mit Pflichtangaben und `idJahrgang`.

**Entscheidung:**

- Schüler werden mit `create` angelegt, alle weiteren Daten danach über die jeweiligen PATCH-Endpunkte (u. a. `PATCH …/schueler/{id}/stammdaten` für `externeSchulNr` und `idSchuelerausweis`, Erzieher über `POST …/schueler/erzieher/new/{idSchueler}/{pos}`).
- Die Schüler brauchen nur den **aktuellen, aktiven Lernabschnitt** des Schuljahresabschnitts. Das Aktivieren der Blockung macht der Benutzer in der KOOP-DB selbst.

**Reihenfolge (getestet):** Ein Schüler, der **nach** dem Abiturjahrgang angelegt wurde, erscheint im Abiturjahrgang und kann Fachwahlen erhalten. Die Reihenfolge von Schülern und Abiturjahrgang spielt also keine Rolle, das Nachladen (ADR 002, A21) ist möglich.

## 4. Fachwahlen übertragen

**Laufbahnplanung-Import v2 ist nicht geeignet.** `GostLaufbahnplanungImportV2Service` bricht ab, wenn die Schulnummer der Datei nicht zur Datenbank passt, die Schüler-ID oder der AES-Schlüssel abweicht oder Fach-IDs fehlen. Das gilt in beide Richtungen.

**Entscheidung:** Fachwahlen werden **je Schüler und Fach** übertragen:

- Lesen: `GET /db/{schema}/gost/schueler/{id}/laufbahnplanung`
- Schreiben: `PATCH /db/{schema}/gost/schueler/{id}/fachwahl/{fachid}` mit `GostSchuelerFachwahl`, z. B. `{"halbjahre": ["S","S","S","S","S","S"], "abiturFach": null}` (getestet)
- Fächer werden über das **Kürzel** zugeordnet. Dass die Kürzel übereinstimmen, stellt die Konsistenzprüfung sicher.

**Sprachenfolge:** Die Belegprüfung wertet Sprachbelegungen und Sprachprüfungen aus. Sie werden mit übernommen (`/db/{schema}/schueler/{id}/sprachen/belegungen` und `…/pruefungen`).

## 5. Lehrkräfte und Schulkatalog

- `POST /db/{schema}/lehrer/create`: Pflichtfelder `kuerzel`, `vorname`, `nachname`, `geschlecht`, `personalTyp`. Optional u. a. `istSichtbar`, `istRelevantFuerStatistik`.
- `POST /db/{schema}/lehrer/personalabschnittsdaten`: Pflichtfelder `idLehrer`, `idSchuljahresabschnitt`, optional `stammschulnummer` (höchstens 6 Zeichen).
- `POST /db/{schema}/schule/schulen/create`: Pflichtfelder `schulnummerStatistik`, `kurzbezeichnung`, `name`, optional `kuerzel` (getestet).

## 6. Rückspielung von Kursen und Leistungsdaten

Was die Blockung beim Aktivieren schreibt (`DataGostBlockungsergebnisse`): Kurse mit Fach, `KursartAllg`, Wochenstunden, Lehrkräften und Schienen sowie Leistungsdaten mit Kurs, Kursart je Halbjahr, Fachlehrer und Wochenstunden.

**Kurse** (`POST /db/{schema}/kurse/create`, getestet): Pflichtfelder `idSchuljahresabschnitt`, `kuerzel`, `idFach`, `kursartAllg`; dazu u. a. `idJahrgaenge`, `wochenstunden`, `lehrer`, `weitereLehrer`, `schienen`.

**Fehler im SVWS-Server: `schulnummer` am Kurs nicht setzbar.** Beim Anlegen oder Ändern eines Kurses mit `schulnummer` antwortet der Server mit 500, auch wenn die Schule im Schulkatalog steht. Ursache: `DataKurse.mapSchulnummer` sucht im Schulkatalog (`K_Schule.SchulNr`, Typ Text) mit einer Zahl. Der Fehler ist dem SVWS-Team zu melden. Nachstellen: `POST /db/{schema}/kurse/create` mit `"schulnummer": 192806` (Schule im Schulkatalog vorhanden) → 500 mit leerem Body, kein Eintrag im Server-Log. Mit `"schulnummer": "192806"` → 400. Ohne `schulnummer` → 201. Bis zur Behebung kann SVWS-KOOP die Schulnummer am Kurs nicht schreiben (ADR 002, A17).

Unabhängig davon gilt: Die Schulnummer am Kurs muss im **Schulkatalog** der Datenbank stehen. Das ist durch die Konsistenzprüfung abgedeckt (ADR 002, A7).

**Leistungsdaten** (`POST /db/{schema}/schueler/leistungsdaten/create`, getestet): `lernabschnittID`, `fachID`, `kursID`, `kursart`, `wochenstunden`, `koopSchule` werden korrekt gespeichert, auch die Schulnummer der Kooperationsschule (`koopSchule` → Spalte `SchulNr`). `…/create/multiple` erwartet ein JSON-Array von `SchuelerLeistungsdaten` und legt alle Einträge in einer Transaktion an (getestet mit zwei Einträgen, 201). SVWS-KOOP nutzt diesen Endpunkt je Schüler oder je Kurs.

**`restore`** (`GET /db/{schema}/gost/blockungen/{abiturjahr}/{halbjahr}/restore`, Achtung: GET, nicht POST): Getestet mit einem über die API angelegten Kurs (EF, GK Deutsch) und einer Leistung. Der Server legt eine Blockung „Restaurierte Blockung“ mit einem Ergebnis an. Darin liegt der Kurs in Schiene 1, und der Schüler ist dem Kurs zugeordnet. Die Leistungsdaten bleiben unverändert, die Blockung ist nicht aktiv.

**Entscheidung:** Nach der Rückspielung von Kursen und Leistungsdaten ruft SVWS-KOOP in der Stammschule `restore` für das betroffene Halbjahr auf. So hat die Stammschule wieder eine Blockung, mit der sie weiterarbeiten kann (z. B. Hochschreiben in das nächste Halbjahr).

## Konsequenzen

- ADR 002: Fachwahlen je Fach statt per Laufbahnplanungsdatei, Sprachenfolge wird mit übernommen, `koopSchule` in den Leistungsdaten wird gesetzt, Jahrgänge (mit Schulgliederung) werden geprüft und in die KOOP-DB übernommen.
- ADR 001: Verbindung mit optionaler Adresse für privilegierte Zugriffe, Ausweichweg über den Admin-Client.
- Meldungen an das SVWS-Team: `schulnummer` am Kurs (500 statt Speichern), `IDext` in der API (ADR 002, F3), Jahrgänge nach `init` ohne Schulgliederung.

## Offene Punkte

Keine. Alle Punkte sind am Testserver geprüft. Die Meldungen an das SVWS-Team stehen unter „Konsequenzen“.
