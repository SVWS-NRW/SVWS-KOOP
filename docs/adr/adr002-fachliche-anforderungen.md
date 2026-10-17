# ADR 002: Fachliche Anforderungen an SVWS-KOOP

- **Status:** Angenommen
- **Datum:** 2026-10-15
- **Autor:** Frank Pfotenhauer
- **Quelle:** [anforderungen.md](../../anforderungen.md)

## Kontext

Mehrere Schulen mit gymnasialer Oberstufe arbeiten in einer Kooperation zusammen und blocken die Kurse der Oberstufe gemeinsam. Weil die Schülerinnen und Schüler mehrerer Schulen in dieselben Kurse gehen können, lassen sich mehr Kurse einrichten und den Schülern ein breiteres Fächerangebot machen.

Betroffen sind die Jahrgänge 10, EF, Q1 und Q2. Der Jahrgang 10 ist dabei, weil auf Grundlage seiner Laufbahnplanung die **EF des kommenden Schuljahres** geblockt wird.

Der SVWS-Server kann heute die Kursblockung für **eine** Schule: Blockung anlegen und rechnen, ein Ergebnis aktivieren und dabei Kurse und Leistungsdaten der Schüler schreiben. Was fehlt, ist der Weg, die Schüler und Lehrkräfte mehrerer Schulen in einer Datenbank zusammenzuführen und die Ergebnisse anschließend in die jeweilige Schule zurückzubringen. Genau das soll SVWS-KOOP übernehmen.

Der technische Rahmen ist in [ADR 001](adr001-architektur-und-erscheinungsbild.md) festgelegt.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Stammschule** | Die Schule, an der ein Schüler angemeldet ist. Ihre SVWS-Datenbank ist und bleibt die führende Datenbank für diesen Schüler. |
| **Kooperationsschulen** | Alle an der Kooperation beteiligten Schulen (zunächst bis zu drei). |
| **KOOP-DB** | Ein eigenes SVWS-Schema, in dem die Schüler und Lehrkräfte aller Kooperationsschulen zusammengeführt und gemeinsam geblockt werden. |
| **KOOP-Server** | Ein SVWS-Server nach Wahl der Kooperation, auf dem die Daten zusammengeführt und geblockt werden. Es gibt keine Leitschule, alle Kooperationsschulen sind gleichberechtigt. |
| **Übernahme** | Übertragung von Schülern, Fachwahlen und Lehrkräften aus den Stammschulen in die KOOP-DB. |
| **Rückspielung** | Übertragung von Kursen, Kurszuordnungen (Leistungsdaten) und geänderten Fachwahlen aus der KOOP-DB in die Stammschulen. |

## Anforderungen

### Allgemein

- **A1** SVWS-KOOP unterstützt eine Kooperation aus bis zu **drei** Schulen. Die Datenstrukturen sollen eine spätere Erweiterung auf mehr Schulen nicht verhindern.
- **A2** Betroffen sind die Schüler der Jahrgänge **10, EF, Q1 und Q2**. Für den Jahrgang 10 wird die EF.1 des kommenden Schuljahres geplant.
- **A3** Geblockt wird wie an einer einzelnen Schule: **eine Blockung pro Abiturjahrgang und Halbjahr**. Die Blockung selbst findet in der KOOP-DB mit den vorhandenen Funktionen des SVWS-Servers bzw. SVWS-Clients statt (Blockung anlegen, rechnen, Ergebnis aktivieren). SVWS-KOOP baut die Blockung nicht nach.
- **A4** SVWS-KOOP übernimmt alle Schritte **vor** und **nach** der Blockung: KOOP-DB einrichten, Daten prüfen, Daten übernehmen, Daten zurückspielen.

### KOOP-DB

- **A5** SVWS-KOOP legt eine neue KOOP-DB an. Sie wird mit der Schulnummer einer der Kooperationsschulen initialisiert. Das ist technisch nötig und gibt dieser Schule keinen Vorrang. Alle Quellschulen werden im **Schulkatalog** der KOOP-DB eingetragen und **durchnummeriert** (1, 2, 3). Die Nummer dient als Kurzkennung der Quellschule, z. B. bei den Lehrerkürzeln (siehe „Quellschulen und Lehrkräfte in der KOOP-DB“).
- **A6** Die Schulstammdaten der KOOP-DB werden so geändert, dass sie eindeutig als KOOP-DB erkennbar ist (z. B. Bezeichnung „KOOP – <Schule A> / <Schule B> / <Schule C>“). Eine Verwechslung mit der echten Datenbank dieser Schule muss ausgeschlossen sein.

### Konsistenzprüfung

- **A7** Vor der Übernahme prüft SVWS-KOOP, ob alle beteiligten Datenbanken übereinstimmen in:
  - dem **Fächerkatalog** (Kürzel, Statistikkürzel, Fremdsprache; Abweichungen bei der **Bezeichnung** sind Warnungen, die Schulen sollten sie in ihren Datenbanken vereinheitlichen). Abweichungen bei **Aufgabenfeld** und **Unterrichtssprache** sind nur Warnungen: Der Wert wird in der KOOP-DB vom Benutzer im SVWS-Client als Vorgabe für die KOOP-Blockung festgelegt,
  - den **Fächereinstellungen** der Abiturjahrgänge (u. a. Wählbarkeit je Halbjahr, Leitfach, Abiturfach-Eignung, Wochenstunden). Abweichungen sind **Warnungen**: Wer gemeinsam blockt, sollte diese Einstellungen in den Datenbanken der Schulen vereinheitlichen. Die Unterrichtssprache wird in der KOOP-DB festgelegt (siehe oben),
  - den **Oberstufeneinstellungen** der betroffenen Abiturjahrgänge (Jahrgangseinstellungen). **Fachkombinationen** werden nicht verglichen: Sie werden vom Benutzer in der KOOP-DB für die KOOP-Blockung angelegt, weil die Oberstufenblockung in den Datenbanken der Schulen bei einer Kooperation nicht genutzt wird,
  - dem aktuellen **Schuljahresabschnitt** und dem Vorhandensein der **Jahrgänge** 10, EF, Q1 und Q2. Schulgliederung, Statistik-Jahrgang und Restabschnitte werden nicht verglichen, weil sie von der Schulform abhängen und sich zwischen GE und GY unterscheiden dürfen (ADR 003),
  - den **Klassen** der EF, Q1 und Q2: Die Schulen stellen sicher, dass ihre Klassen gleich heißen (in der Praxis `EF`, `Q1`, `Q2` an allen Schulen). SVWS-KOOP prüft das nur. Die Klassen der 10 werden nicht verglichen, weil die 10 für die Planung der kommenden EF wie eine Jahrgangsstufe behandelt wird. In der KOOP-DB kommen alle Schüler der 10 in eine Klasse `10`,
  - der **Länge der Lehrerkürzel**: Höchstens 8 Zeichen, damit das Suffix `-<Nr>` in das Kürzelfeld (10 Zeichen) passt,
  - dem **Schulkatalog** jeder Schule: Jede Partnerschule muss dort mit Schulnummer und **Kürzel** eingetragen sein, weil das Kürzel für die Platzhalter-Lehrkräfte gebraucht wird (siehe „Lehrkraft der Partnerschule in der Stammschule“).
- **A8** Abweichungen werden als **Meldungen** je Schule angezeigt, unterteilt in **Fehler** und **Warnungen**. Nur Fehler verhindern die Übernahme. Zu jeder Abweichung, die SVWS-KOOP beheben kann, **fragt** es, ob es sie korrigieren soll, und korrigiert erst nach Bestätigung. Welcher Wert gilt, wählt der Benutzer je Abweichung, denn es gibt keine Leitschule. Die Übernahme ist erst möglich, wenn alle Abweichungen behoben sind. Korrigiert wird in Phase 1 nur die eingespielte Kopie einer Schule auf dem KOOP-Server. Damit die Rückspielung passt, muss die Schule dieselbe Korrektur in ihrer eigenen Datenbank vornehmen. SVWS-KOOP weist darauf hin und prüft vor der Rückspielung erneut (Phase 4).

### Übernahme

- **A9** Aus jeder Stammschule werden für die betroffenen Jahrgänge übernommen:
  - die **Schülerstammdaten**,
  - **alle Erzieherdaten** (Erziehungsberechtigte),
  - **alle Telefonnummern**,
  - die **Laufbahnplanung / Fachwahlen** (LuPO-Daten),
  - die **Sprachenfolge** (Sprachbelegungen und Sprachprüfungen), weil die Belegprüfung der Laufbahnplanung sie braucht (ADR 003).

  Die Kataloge **Erzieherarten** und **Telefonarten** müssen in den Schulen nicht übereinstimmen. Die KOOP-DB erhält ihre Vereinigung (Zuordnung über die Bezeichnung).

  Weitere Schülerdaten werden bei Bedarf später ergänzt.
- **A10** Aus jeder Kooperationsschule werden **alle aktiven Lehrkräfte** in die KOOP-DB übernommen, nicht nur die Lehrkräfte der Oberstufe. Aktiv ist eine Lehrkraft mit **`istSichtbar = true`** (`LehrerListeEintrag` bzw. `LehrerStammdaten`). Platzhalter-Lehrkräfte aus früheren Rückspielungen werden nicht übernommen. Nur so können in der KOOP-DB allen Kursen Lehrkräfte zugeordnet werden, auch von der Partnerschule. Jede Lehrkraft trägt in der KOOP-DB die Schulnummer ihrer Quellschule als **Stammschule**, ihr Kürzel wird um die Nummer der Quellschule ergänzt (z. B. `MÜL-2`).
- **A11** Jeder Schüler in der KOOP-DB trägt die Schulnummer seiner Stammschule im Feld **`ExterneSchulNr`** und seine ID aus der Stammschule vorerst im Feld **Schülerausweisnummer** (siehe „Merkmal Stammschule“). Darüber wird er bei der Rückspielung eindeutig seinem Datensatz in der Stammschule zugeordnet.
- **A12** Die Übernahme ist **wiederholbar**: Ein erneuter Lauf aktualisiert vorhandene Schüler und Lehrkräfte, statt sie doppelt anzulegen.
- **A21** Es gibt eine Funktion zum **Nachladen**, auch nachdem die Blockung begonnen hat. Dazu spielt die Schule ein neueres Backup ein. SVWS-KOOP vergleicht es mit der KOOP-DB und zeigt an:
  - **neue Schüler** (in der Stammschule, aber nicht in der KOOP-DB): werden mit Stammdaten, Erzieherdaten und Fachwahlen nachgeladen,
  - **neue Lehrkräfte**: werden nachgeladen,
  - **abgegangene Schüler** (in der KOOP-DB, aber in der Stammschule nicht mehr im betroffenen Jahrgang): werden gemeldet. SVWS-KOOP bietet an, sie aus der KOOP-DB zu entfernen, einschließlich ihrer Kurszuordnungen.

  Fachwahlen bereits übernommener Schüler werden beim Nachladen **nicht** überschrieben, weil sie ab der Übernahme nur in der KOOP-DB gepflegt werden (siehe „Änderungen außerhalb der KOOP-DB“).
- **A13** Jeder Lauf erzeugt ein **Protokoll** (übernommene, geänderte, übersprungene Datensätze und Fehler).

### Blockung (im SVWS-Client)

- **A14** In der KOOP-DB werden die Blockungen mit den vorhandenen Werkzeugen erstellt und das gewählte Ergebnis aktiviert. Dabei schreibt der SVWS-Server die Kurse und die Kurszuordnungen in die Leistungsdaten der Schüler.
- **A15** Ändern sich während der Blockung Fachwahlen eines Schülers (Fachwahländerung), werden diese in der KOOP-DB gepflegt.

### Rückspielung

- **A16** Für jede Stammschule werden zurückgespielt:
  - die **Kurse**, in denen Schüler dieser Schule sitzen,
  - die **Leistungsdaten** (Kurszuordnungen) ihrer Schüler im betreffenden Halbjahr,
  - **geänderte Fachwahlen** ihrer Schüler.
- **A17** Findet ein Kurs an einer Partnerschule statt, wird in der Stammschule bei diesem Kurs die **Schulnummer der Schule eingetragen, an der der Kurs stattfindet** (Feld `schulnummer` der Kursdaten). Bei Kursen an der eigenen Schule bleibt das Feld leer. Welche Schule das ist, ergibt sich aus der **Kurslehrkraft**: Ein Kurs mit der Lehrkraft `BALS-1` gehört zur Schule mit der Nummer 1. Dieselbe Schulnummer wird auch in den Leistungsdaten der Schüler dieses Kurses gesetzt (Feld `koopSchule`, ADR 003). Hinweis: Die Schulnummer am Kurs lässt sich wegen eines Fehlers im SVWS-Server derzeit nicht über die API schreiben, in den Leistungsdaten funktioniert es (ADR 003, Abschnitt 6).
- **A18** Es werden **nur** Daten von Schülern der jeweiligen Stammschule geschrieben. Schüler der Partnerschulen gelangen nicht in die Datenbank einer anderen Schule.
- **A19** Vor dem Schreiben zeigt SVWS-KOOP eine **Vorschau** der Änderungen je Schule. Geschrieben wird erst nach Bestätigung.
- **A20** Die Rückspielung erzeugt ein Protokoll wie A13.

## Entscheidung: Ablauf der Datensynchronisation

Grundlage ist die Idee aus [anforderungen.md](../../anforderungen.md): Der Datenaustausch zwischen den Schulen läuft über **SQLite-Backups**. SVWS-KOOP arbeitet dabei immer mit mehreren Schemata **auf einem SVWS-Server**.

```
Phase 1: Zusammenführen (auf dem KOOP-Server, einem SVWS-Server nach Wahl)

  Schule A ──SQLite-Backup──┐
  Schule B ──SQLite-Backup──┼──► SVWS-Server: Schema A, Schema B, Schema C
  Schule C ──SQLite-Backup──┘                  + neues Schema KOOP
                                               │
                                SVWS-KOOP: prüfen und übernehmen
                                               │
                                               ▼
Phase 2: Blockung              SVWS-Client: Blockung in Schema KOOP,
                               Ergebnis aktivieren
                                               │
                                               ▼
Phase 3: Verteilen             SQLite-Backup von KOOP (je eine Kopie pro Schule)
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
Phase 4:     Server Schule A            Server Schule B            Server Schule C
Rückspielen  Schema A + Schema KOOP     Schema B + Schema KOOP     Schema C + Schema KOOP
             SVWS-KOOP: KOOP → A        SVWS-KOOP: KOOP → B        SVWS-KOOP: KOOP → C
             KOOP-Schema löschen        KOOP-Schema löschen        KOOP-Schema löschen
```

### Phase 1: Zusammenführen

1. Jede Kooperationsschule erstellt zu einem vereinbarten Stichtag ein SQLite-Backup ihrer Datenbank (`GET /api/schema/export/{schema}/sqlite`).
2. Auf dem KOOP-Server werden die Backups als eigene Schemata eingespielt (`POST /api/schema/root/import/sqlite/{schema}`).
3. SVWS-KOOP legt die KOOP-DB an (`POST /api/schema/root/create/{schema}`, `POST /api/schema/create/{schema}/init/{schulnummer}`), passt die Schulstammdaten an (A6) und trägt die Quellschulen mit ihrer Nummer in den Schulkatalog ein (`POST /db/{schema}/schule/schulen/create`, A5).
4. SVWS-KOOP führt die Konsistenzprüfung durch (A7, A8).
5. SVWS-KOOP überträgt Jahrgänge (die von `init` angelegten Jahrgänge sind unvollständig, ADR 003), Fächer, Oberstufeneinstellungen und Klassen in die KOOP-DB (nach der Konsistenzprüfung stimmen sie in allen Schulen überein, die Quelle ist daher beliebig) und legt die Abiturjahrgänge an.
6. SVWS-KOOP übernimmt die aktiven Lehrkräfte aller Schulen (`POST /db/{schema}/lehrer/create` mit Kürzel `<Kürzel>-<Nr>`, Stammschule in den Personalabschnittsdaten), dann die Schüler (`POST /db/{schema}/schueler/create`, `externeSchulNr` und `idSchuelerausweis` gesetzt), deren Erzieherdaten (`GET /db/{schema}/schueler/{id}/erzieher` → `POST /db/{schema}/schueler/erzieher/new/{idSchueler}/{pos}`) und schreibt deren Fachwahlen (A9–A13).

Schüler werden mit `create` angelegt, alle weiteren Daten über die jeweiligen PATCH-Endpunkte. Fachwahlen werden **je Schüler und Fach** übertragen (`GET …/gost/schueler/{id}/laufbahnplanung` → `PATCH …/gost/schueler/{id}/fachwahl/{fachid}`), Fächer werden über das Kürzel zugeordnet. Der Laufbahnplanung-Import per Datei ist dafür nicht geeignet, weil er Schulnummer, Schüler-IDs und Fach-IDs der Quelldatenbank verlangt (siehe [ADR 003](adr003-pruefung-svws-api.md)).

### Phase 2: Blockung

Die Blockung erfolgt im SVWS-Client auf der KOOP-DB, eine pro Abiturjahrgang und Halbjahr (A3, A14). Aktivieren schreibt Kurse und Leistungsdaten (`POST /db/{schema}/gost/blockungen/zwischenergebnisse/{id}/activate`).

### Phase 3: Verteilen

SVWS-KOOP schreibt den **Stand** (Zeitpunkt) in die KOOP-DB und erstellt danach ein SQLite-Backup, das an jede Kooperationsschule weitergegeben wird.

### Phase 4: Rückspielen

An jeder Schule wird das KOOP-Backup als zusätzliches Schema auf dem eigenen SVWS-Server eingespielt. SVWS-KOOP liest aus dem KOOP-Schema die Daten der Schüler mit `ExterneSchulNr` = eigene Schulnummer, findet sie über die mitgeführte ID (Schülerausweisnummer) in der eigenen Datenbank wieder und schreibt die Daten nach Vorschau und Bestätigung in das Schema der Schule (A16–A20). Vorher prüft es die Konsistenz gegen die eigene Datenbank der Schule erneut (A7) und führt die Prüfungen aus „Änderungen außerhalb der KOOP-DB“ durch. Nach erfolgreicher Rückspielung speichert es den Zeitpunkt in der Datenbank der Schule. Danach wird das KOOP-Schema entfernt (`POST /api/schema/root/destroy/{schema}`).

### Änderungen außerhalb der KOOP-DB

Zwischen Übernahme und Rückspielung gilt: **Fachwahlen werden nur in der KOOP-DB geändert.** Eine Änderung in der Stammschule passt nicht mehr zur Blockung. Diese Regel steht in der Anleitung von SVWS-KOOP. Das Tool erkennt Verstöße und warnt.

SVWS-KOOP speichert dazu Werte in der Datenbank, über die Client-Konfiguration des SVWS-Servers (`GET /db/{schema}/client/config/SVWS-KOOP`, `PUT /db/{schema}/client/config/SVWS-KOOP/global/{key}`):

| Datenbank | Schlüssel (Vorschlag) | Inhalt | Geschrieben |
|---|---|---|---|
| KOOP-DB | `stand` | Zeitpunkt, zu dem das Backup für die Verteilung erstellt wurde | Phase 3 |
| KOOP-DB | `fachwahlen.<Schulnummer>` | Prüfsumme der Fachwahlen je Schüler beim Übernehmen aus der Stammschule | Phase 1 |
| Stammschule | `letzteRueckspielung` | Zeitpunkt der Rückspielung und `stand` des verwendeten KOOP-Backups | Phase 4 |

Prüfungen vor der Rückspielung:

- **Zu altes Backup:** Ist der `stand` des eingespielten KOOP-Backups nicht neuer als der `stand` der letzten Rückspielung in dieser Schule, **warnt** SVWS-KOOP, dass ein veraltetes Backup verwendet wird. Weiter geht es nur nach ausdrücklicher Bestätigung.
- **Fachwahlen in der Stammschule geändert:** SVWS-KOOP berechnet die Prüfsumme der aktuellen Fachwahlen jedes Schülers in der Stammschule und vergleicht sie mit dem Wert aus der Übernahme. Bei Abweichung **warnt** es und nennt die betroffenen Schüler. Die Rückspielung überschreibt diese Fachwahlen mit dem Stand der KOOP-DB, wenn der Benutzer das bestätigt.

### Benutzer und Rechte

| Schritt | Wo | Benötigte Rechte |
|---|---|---|
| SQLite-Backup erstellen | Datenbank jeder Schule | über die API (`/api/schema/export/{schema}/sqlite`): Datenbank-Benutzer des Schemas oder Root. Mit SVWS-Admin oder der Kompetenz „Backup durchführen“ geht es über diesen Endpunkt nicht (ADR 003) |
| Backups einspielen, KOOP-DB anlegen, Schemata löschen | SVWS-Server | Datenbank-Administrator (Endpunkte unter `/api/schema/root/…`) |
| Konsistenzprüfung, Übernahme, Nachladen, Blockung, Verteilen | KOOP-DB | Benutzer der KOOP-DB, siehe unten |
| Rückspielung | Datenbank jeder Schule | volle Rechte für Oberstufe und Laufbahnplanung (`OBERSTUFE_LAUFBAHNPLANUNG_*`, `OBERSTUFE_KURSPLANUNG_*` einschließlich `OBERSTUFE_KURSPLANUNG_BLOCKUNG_AKTIVIEREN`) |

**Benutzer der KOOP-DB:** Der größte Teil der Arbeit findet in der KOOP-DB statt. SVWS-KOOP legt dort beim Einrichten **für jede Kooperationsschule einen eigenen Benutzer mit hohen Rechten** an (`POST /db/{schema}/benutzer/new`), möglichst mit **Administratorrechten** (`…/benutzer/{id}/addAdmin`). So kann jede Schule selbstständig in der KOOP-DB arbeiten, und Änderungen sind einer Schule zuzuordnen. Die Kennwörter vergibt der Benutzer beim Einrichten. SVWS-KOOP zeigt sie nur einmal an und speichert sie nicht (ADR 001).

Hinweise:

- Für die Rückspielung muss SVWS-KOOP in der Stammschule zusätzlich Kurse anlegen und Platzhalter-Lehrkräfte anlegen dürfen. Ob die Oberstufenrechte dafür reichen oder weitere Kompetenzen nötig sind, ist bei der Umsetzung zu prüfen. Im Zweifel wird die Rückspielung mit einem Administrator durchgeführt.
- Die KOOP-DB wird mit ihren Benutzern an alle Schulen verteilt. Deshalb werden für die KOOP-DB eigene Kennwörter vergeben, nicht die Kennwörter aus den Schuldatenbanken.

### Merkmal Stammschule

**Entscheidung:** Jeder Schüler in der KOOP-DB trägt zwei Merkmale, auch die Schüler der Schule, deren Schulnummer die KOOP-DB trägt:

| API-Feld (`SchuelerStammdaten`) | Spalte `Schueler` | Inhalt |
|---|---|---|
| `externeSchulNr` | `ExterneSchulNr` | Schulnummer der Quellschule (Stammschule) |
| `idSchuelerausweis` | `Ausweisnummer` | ID des Schülers in der Quelldatenbank (vorerst, siehe unten) |

Damit ist jeder Schüler der KOOP-DB eindeutig einem Datensatz seiner Stammschule zugeordnet. Bei der Rückspielung braucht es keinen Abgleich über Name und Geburtsdatum.

**Stand im SVWS-Server (geprüft 2026-10-15):**

- `externeSchulNr` („Schulnummer von externen Koopschülern“) und `idSchuelerausweis` (Nummer des Schülerausweises, bis 30 Zeichen) sind Teil der Schülerstammdaten der API und über `GET/PATCH /db/{schema}/schueler/{id}/stammdaten` lesbar und schreibbar.
- Die eigentlich passende Spalte `IDext` („externe ID“) existiert nur in der Datenbank. Kein Endpunkt liest oder schreibt sie.

**Übergangslösung Schülerausweisnummer:** Solange der SVWS-Server `IDext` nicht über die API bereitstellt, legt SVWS-KOOP die ID aus der Quelldatenbank in der Schülerausweisnummer der KOOP-DB ab. Eine dort vorhandene echte Ausweisnummer wird in der KOOP-DB überschrieben. Das ist unkritisch, weil die KOOP-DB nur eine Arbeitskopie ist. Bei der Rückspielung wird die Ausweisnummer **nicht** in die Stammschule zurückgeschrieben. Die Erweiterung um `IDext` übernimmt das SVWS-Team, der Zeitpunkt ist offen. Sobald `IDext` über die API verfügbar ist, wechselt SVWS-KOOP auf dieses Feld (F3).

### Quellschulen und Lehrkräfte in der KOOP-DB

**Schulkatalog:** Alle Quellschulen werden im Schulkatalog der KOOP-DB eingetragen (`/db/{schema}/schule/schulen`, `SchulEintrag`):

| Feld | Inhalt |
|---|---|
| `schulnummerStatistik` | Schulnummer der Quellschule |
| `kuerzel` | laufende Nummer der Quellschule (`1`, `2`, `3`) |
| `name`, `kurzbezeichnung` | aus den Schulstammdaten der Quellschule |

Die Reihenfolge legt der Benutzer beim Einrichten fest.

**Lehrkräfte:** Übernommen werden:

- die **Individualdaten** (`LehrerStammdaten`, `/db/{schema}/lehrer/{id}/stammdaten`),
- aus den **Personaldaten** nur die **Stammschule** (siehe unten).

Weitere Lehrerdaten werden bei Bedarf später ergänzt.

Für jede übernommene Lehrkraft gilt in der KOOP-DB:

- **Kürzel** = `<Kürzel in der Quellschule>-<Nr der Quellschule>`, z. B. `MÜL-2`. Damit sind Kürzel über alle Schulen eindeutig, auch wenn zwei Schulen dasselbe Kürzel verwenden. Weil das Kürzelfeld höchstens 10 Zeichen fasst, dürfen Kürzel in den Quellschulen höchstens 8 Zeichen lang sein (A7).
- **Stammschule** = Schulnummer der Quellschule im Feld `stammschulnummer` der Personalabschnittsdaten (`LehrerPersonalabschnittsdaten`, `/db/{schema}/lehrer/personalabschnittsdaten`). Das Feld gilt je Schuljahresabschnitt und wird für die Abschnitte gesetzt, die geblockt werden.
- Bei der Rückspielung wird eine Lehrkraft über Stammschule und Kürzel ohne Suffix ihrem Datensatz in der Quellschule zugeordnet.
- Eine Lehrkraft, die an mehreren Kooperationsschulen geführt wird, erscheint in der KOOP-DB **einmal je Quellschule** (z. B. `MÜL-1` und `MEY-2`) und wird nicht zusammengeführt. Der Unterricht muss der Lehrkraft an der jeweiligen Schule zugeordnet werden, an der sie ihn erteilt. Der Fall ist sehr selten.

### Kurse an der Partnerschule

Die Kursdaten der API (`KursDaten.schulnummer`, Tabelle `Kurse`, Spalte `SchulNr`) enthalten die Schulnummer der Schule, an der der Kurs stattfindet. Die Blockungskurse (`GostBlockungKurs`) haben dieses Feld nicht, sondern nur das Merkmal `istKoopKurs` („Kooperationskurs an einer anderen Schule“). Beim Aktivieren in der KOOP-DB bleibt die Schulnummer der Kurse daher leer.

**Entscheidung:** Die Schule eines Kurses wird über die **Kurslehrkraft** bestimmt. Das Suffix ihres Kürzels nennt die Quellschule: `BALS-1` → Schule 1 im Schulkatalog der KOOP-DB → deren Schulnummer. In der KOOP-DB ordnet man den Kursen also bei der Blockung wie gewohnt Lehrkräfte zu. Erst bei der Rückspielung schreibt SVWS-KOOP in der Stammschule:

- Kurs mit Lehrkraft der **eigenen** Schule: `schulnummer` bleibt leer.
- Kurs mit Lehrkraft einer **Partnerschule**: `schulnummer` = Schulnummer dieser Partnerschule.

**Sonderfälle:** Hat ein Kurs bei der Rückspielung **keine Lehrkraft** oder **Lehrkräfte verschiedener Schulen** (z. B. `BALS-1` und `MEY-2`), meldet die Vorschau diesen Kurs, und der Benutzer **muss** die Schule auswählen, an der der Kurs stattfindet. Solange das nicht geklärt ist, wird der Kurs **nicht übertragen**. Die Kurszuordnungen der Schüler zu diesem Kurs werden dann ebenfalls nicht übertragen. Das Protokoll führt den Kurs auf.

### Lehrkraft der Partnerschule in der Stammschule

Die Lehrkräfte der Partnerschulen existieren in der Datenbank der Stammschule nicht und werden dort auch nicht angelegt.

**Entscheidung: Platzhalter-Lehrkraft je Partnerschule.** In jeder Stammschule gibt es für jede Partnerschule eine Platzhalter-Lehrkraft, bei drei Kooperationsschulen also zwei. Ein Kurs, der an einer Partnerschule stattfindet, bekommt in der Stammschule den Platzhalter dieser Partnerschule. So hat jeder Kurs eine Lehrkraft, und die Partnerschule ist auch in Listen und Zeugnissen sofort erkennbar.

- **Kürzel** des Platzhalters = **Kürzel der Partnerschule im Schulkatalog der Stammschule** (`SchulEintrag.kuerzel`, höchstens 10 Zeichen). Fehlt die Partnerschule im Katalog oder hat sie kein Kürzel, meldet das die Konsistenzprüfung (A7).
- SVWS-KOOP legt die Platzhalter bei der ersten Rückspielung an, falls sie fehlen, und verwendet sie bei späteren Läufen wieder.
- Die Platzhalter werden als **nicht statistikrelevant** angelegt (`istRelevantFuerStatistik = false` in `LehrerStammdaten`), damit sie nicht in der Lehrerstatistik erscheinen.
- Als Name wird der Name der Partnerschule aus dem Schulkatalog eingetragen (Vorschlag).
- Bei der nächsten Übernahme erkennt SVWS-KOOP die Platzhalter daran, dass ihr Kürzel einem Kürzel im Schulkatalog entspricht und sie nicht statistikrelevant sind. Sie werden nicht in die KOOP-DB übernommen (A10).

Verworfen: Kurs ohne Lehrkraft. Kurse ohne Lehrkraft fallen in Listen, Plausibilitätsprüfungen und Zeugnissen auf, und die Partnerschule wäre nur über die Schulnummer des Kurses erkennbar.

### Folgen für ADR 001

Weil alle Schemata, mit denen SVWS-KOOP gleichzeitig arbeitet, auf **einem** SVWS-Server liegen, entfällt das in ADR 001 beschriebene CORS-Problem mit fremden Servern. Eine Ausnahme sind die Root-Endpunkte, wenn der SVWS-Server dafür einen eigenen Port verwendet (siehe ADR 003, Abschnitt 2). Die Verbindungsschicht muss mehrere **Schemata** desselben Servers gleichzeitig ansprechen können, nicht mehrere Server. Zusätzlich braucht SVWS-KOOP für Schema-Anlage, SQLite-Import und Schema-Löschung die Zugangsdaten eines **Datenbank-Administrators** (Endpunkte unter `/api/schema/root/…`).

## Oberfläche (erster Entwurf)

Dashboard mit Kacheln wie in den anderen SVWS-Tools (ADR 001, Abschnitt 4):

| Kachel | Zweck | Phase |
|---|---|---|
| **KOOP-DB einrichten** | Assistent: zuerst alle Angaben abfragen und prüfen (Quell-DBs mit Zugangsdaten und Nummer, Name und Zugangsdaten der KOOP-DB, neue Benutzer je Schule, siehe ADR 003), danach KOOP-DB anlegen und kennzeichnen | 1 |
| **Konsistenz prüfen** | Abweichungen bei Fächern, Oberstufeneinstellungen, Jahrgängen und Klassen je Schule anzeigen | 1 |
| **Lehrkräfte übernehmen** | Aktive Lehrkräfte aller Schulen, Vorschau der neuen Kürzel (`<Kürzel>-<Nr>`), Übernahme, Protokoll | 1 |
| **Schüler übernehmen** | Jahrgänge wählen, Vorschau, Übernahme, Protokoll | 1 |
| **Nachladen** | Neueres Backup einer Schule mit der KOOP-DB vergleichen, neue Schüler und Lehrkräfte nachladen, abgegangene Schüler entfernen | 1–2 |
| **Übersicht KOOP-DB** | Schüler je Stammschule und Jahrgang, Stand der Fachwahlen, Link zur Blockung im SVWS-Client | 2 |
| **Rückspielen** | Stammschule wählen, Vorschau der Änderungen, Rückspielung, Protokoll | 4 |
| **Protokolle** | Alle Läufe einsehen und exportieren | alle |

## Datenschutz

- Bei diesem Ablauf liegen vollständige Datenbanken der Partnerschulen und eine KOOP-DB mit Schülern und Lehrkräften aller Schulen auf fremden Servern. Dafür braucht es eine Rechtsgrundlage bzw. Vereinbarung der Kooperationsschulen. Das ist organisatorisch zu klären und in `docs/datenschutz.md` zu beschreiben.
- Die eingespielten Backups der Partnerschulen und das KOOP-Schema an jeder Schule werden nach Abschluss des jeweiligen Schritts gelöscht. SVWS-KOOP bietet das aktiv an.
- In die KOOP-DB werden nur festgelegte Datenbereiche übernommen: bei Schülern Stammdaten, alle Erzieherdaten, alle Telefonnummern, Sprachenfolge und Fachwahlen, bei Lehrkräften Individualdaten und Stammschule. Jede Erweiterung ist zu begründen und hier zu ergänzen. Mit den Erzieherdaten und Telefonnummern gelangen auch Adressen und Kontaktdaten der Schüler und Erziehungsberechtigten an die Partnerschulen. Das muss die Vereinbarung der Kooperationsschulen abdecken.

## Geklärte Fragen

- **Jahrgang 10 (2026-10-15):** Die Schüler der 10 werden übernommen, um auf Grundlage ihrer Laufbahnplanung die EF des kommenden Schuljahres zu blocken.
- **Gemeinsames Blocken (2026-10-15):** Eine Blockung pro Abiturjahrgang und Halbjahr, wie an einer einzelnen Schule. Kein gemeinsames Schienenraster über mehrere Jahrgänge.
- **Merkmal Stammschule (2026-10-15):** `ExterneSchulNr` enthält die Schulnummer der Quellschule, die ID des Schülers in der Quelldatenbank steht vorerst in der Schülerausweisnummer, später in `IDext` (siehe „Merkmal Stammschule“).
- **Schulkatalog (2026-10-15):** Die Quellschulen werden im Schulkatalog der KOOP-DB eingetragen und durchnummeriert.
- **Lehrerkürzel und Stammschule (2026-10-15):** Kürzel in der KOOP-DB als `<Kürzel>-<Nr>`, Schulnummer der Quellschule als Stammschule in den Personalabschnittsdaten.
- **`IDext` in der API (F3, 2026-10-15):** Die Erweiterung des SVWS-Servers übernimmt das SVWS-Team. Der Zeitpunkt ist offen.
- **Ort eines Kurses (F5, 2026-10-15):** Ergibt sich aus der Kurslehrkraft (`BALS-1` → Schule 1). SVWS-KOOP schreibt die Schulnummer bei der Rückspielung in die Kurse der Stammschule. Die Blockung kennt nur das Merkmal `istKoopKurs`.
- **Lehrkraft der Partnerschule in der Stammschule (F6, 2026-10-15):** Platzhalter-Lehrkraft je Partnerschule, Kürzel = Kürzel der Partnerschule im Schulkatalog der Stammschule, nicht statistikrelevant.
- **Übernommene Lehrerdaten (F6, 2026-10-15):** Individualdaten und aus den Personaldaten die Stammschule. Weitere Daten werden bei Bedarf ergänzt.
- **Lehrkräfte an mehreren Schulen (F4, 2026-10-15):** Werden in der KOOP-DB einmal je Quellschule geführt, nicht zusammengeführt, weil der Unterricht der Lehrkraft an der jeweiligen Schule zugeordnet werden muss. Der Fall ist sehr selten.
- **Kurse an der Partnerschule (2026-10-15):** `SchulNr` des Kurses enthält die Schulnummer der Schule, an der der Kurs stattfindet.
- **Klassen (2026-10-15, ergänzt 2026-10-17):** Die Schulen stellen sicher, dass die Klassen der EF, Q1 und Q2 gleich heißen. SVWS-KOOP prüft das in der Konsistenzprüfung. Die Klassennamen der 10 sind nicht relevant, in der KOOP-DB gibt es für die 10 eine Klasse `10`.
- **Lehrkräfte (2026-10-15):** Alle aktiven Lehrkräfte aller Kooperationsschulen werden in die KOOP-DB übernommen.
- **Abweichungen (F1, 2026-10-15):** SVWS-KOOP meldet Abweichungen und fragt, ob es sie korrigieren soll.
- **Änderungen in der Stammschule (F8, 2026-10-15):** Fachwahlen werden zwischen Übernahme und Rückspielung nur in der KOOP-DB geändert, das fordert die Anleitung. Der Zeitpunkt der letzten Rückspielung wird in der Datenbank der Schule gespeichert. SVWS-KOOP warnt bei einem zu alten KOOP-Backup und bei Fachwahlen, die in der Stammschule geändert wurden (siehe „Änderungen außerhalb der KOOP-DB“).
- **Kurse ohne eindeutige Lehrkraft (F12, 2026-10-15):** Kurse ohne Lehrkraft oder mit Lehrkräften verschiedener Schulen sind Sonderfälle. Sie werden gemeldet, die Schule muss ausgewählt werden. Ohne Auswahl wird der Kurs nicht übertragen.
- **KOOP-Server (F11, 2026-10-15):** Es gibt keine Leitschule. Phase 1–3 laufen auf einem SVWS-Server nach Wahl der Kooperation.
- **Neue und abgehende Schüler (F9, 2026-10-15):** Es gibt eine Funktion zum Nachladen (A21).
- **Rechte (F10, 2026-10-15):** Backups mit Admin- oder Backup-Rechten, sonst volle Oberstufen- und Laufbahnrechte. In der KOOP-DB wird für jede Schule ein Benutzer mit hohen Rechten angelegt, möglichst Administrator (siehe „Benutzer und Rechte“).
- **Aufgabenfeld und Unterrichtssprache (2026-10-17):** Abweichungen sind Warnungen. Die Werte legt der Benutzer in der KOOP-DB im SVWS-Client als Vorgabe für die KOOP-Blockung fest.
- **Bezeichnung der Fächer und Fächer der Abiturjahrgänge (2026-10-17):** Abweichungen sind Warnungen. Die Schulen sollten diese Werte in ihren Datenbanken vereinheitlichen, wenn sie gemeinsam blocken.
- **Fachkombinationen (2026-10-17):** Werden nicht verglichen, sondern vom Benutzer in der KOOP-DB für die KOOP-Blockung angelegt. Die Oberstufenblockung der Schuldatenbanken wird bei einer Kooperation nicht genutzt.
- **Übernommene Schülerdaten (F2, 2026-10-15, ergänzt 2026-10-17):** Stammdaten, alle Erzieherdaten, alle Telefonnummern und Fachwahlen. Weitere Daten werden bei Bedarf ergänzt.
- **Erzieherarten und Telefonarten (2026-10-17):** Müssen in den Schulen nicht übereinstimmen. Die KOOP-DB erhält die Vereinigung der Kataloge aller Quellschulen. Erzieher- und Telefondaten werden über die Bezeichnung der Art zugeordnet.
- **Aktive Lehrkräfte (F7, 2026-10-15):** Aktiv ist eine Lehrkraft mit `istSichtbar = true`.

## Offene Fragen

Die Nummern bleiben stabil, geklärte Fragen werden entfernt und oben unter „Geklärte Fragen“ vermerkt.

- **F3 `IDext` in der API:** Ab welcher Version des SVWS-Servers die Erweiterung zur Verfügung steht, ist unklar. Bis dahin gilt die Übergangslösung mit der Schülerausweisnummer.
