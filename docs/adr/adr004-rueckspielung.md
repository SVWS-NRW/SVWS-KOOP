# ADR 004: Rückspielung in die Stammschulen

- **Status:** Angenommen
- **Datum:** 2026-10-18
- **Autor:** Frank Pfotenhauer

## Kontext

[ADR 002](adr002-fachliche-anforderungen.md) legt fest, was zurückgespielt wird (A16–A20, Phase 4), wie der Ort eines Kurses bestimmt wird und dass Lehrkräfte der Partnerschulen in der Stammschule durch Platzhalter vertreten werden. [ADR 003](adr003-pruefung-svws-api.md), Abschnitt 6, hat die Endpunkte für Kurse, Leistungsdaten und `restore` geprüft.

Vor der Umsetzung sind einige Fragen offen, die diese ADRs nicht beantworten: was mit Kursen und Leistungsdaten geschieht, die in der Stammschule schon vorhanden sind, woher die Daten in der KOOP-DB gelesen werden, welche Halbjahre zurückgespielt werden können und welche Vorarbeiten aus Phase 1 und 3 noch fehlen. Dieses ADR klärt diese Fragen.

Grundsatz bleibt: Zurückgespielt werden **nicht die Blockungen**, sondern ihr Ergebnis, also **Kurse** und **Leistungsdaten** (Kurszuordnungen) der eigenen Schüler, dazu die in der KOOP-DB geänderten **Fachwahlen**. Die Stammschule erhält danach mit `restore` eine Blockung, die aus diesen Kursen gebildet wird.

## Entscheidung

### 1. Vorarbeiten in Phase 1 und 3

Zwei Prüfungen aus ADR 002 („Änderungen außerhalb der KOOP-DB“) brauchen Werte, die heute noch nicht geschrieben werden.

**Prüfsumme der Fachwahlen (Phase 1).** Übernahme und Nachladen speichern für jeden übernommenen Schüler eine Prüfsumme seiner Fachwahlen in der KOOP-DB, Schlüssel `fachwahlen.<Schulnummer in der KOOP-DB>` in der Client-Konfiguration `SVWS-KOOP`, Wert als JSON `{ "<ID in der Stammschule>": { "ab": <erstes Halbjahr>, "p": "<Prüfsumme>" } }`.

- Die Prüfsumme wird aus den Fachwahlen in der **Stammschule** berechnet, so wie sie übernommen wurden: je Fach (über das Kürzel) die Kursarten **ab dem aktuellen Halbjahr** und das Abiturfach, nach Kürzel sortiert. Vergangene Halbjahre zählen nicht, weil sie nicht in der KOOP-DB stehen (ADR 003, Abschnitt 7).
- `ab` ist das erste berücksichtigte Halbjahr (0 = EF.1). Die Rückspielung rechnet mit demselben `ab`, auch wenn sie in einem späteren Halbjahr stattfindet als die Übernahme.
- Als Prüfsumme dient FNV-1a (32 Bit, 8 Hex-Zeichen). Sie soll nur Änderungen erkennen und läuft ohne Web Crypto, also auch im Browser über http.
- Ein erneuter Übernahmelauf ändert die Prüfsumme bereits übernommener Schüler nicht, weil auch ihre Fachwahlen nicht überschrieben werden (A21). Nur wenn Fachwahlen nachgeholt werden, wird sie neu gesetzt. Fehlt sie bei einem bereits übernommenen Schüler (Übernahme vor Einführung der Prüfsumme), wird sie aus dem dann aktuellen Stand der Stammschule nachgetragen. Das Protokoll weist darauf hin.
- Bei rund 350 Schülern je Schule ist der Wert etwa 10 KB groß. Die Spalte `Wert` ist vom Typ TEXT.

**Stand (Phase 3).** Eine eigene Kachel **„Verteilen“** schreibt den Zeitpunkt in die KOOP-DB (Schlüssel `stand`, ISO-Zeitstempel) und lädt danach das SQLite-Backup der KOOP-DB herunter (`GET /db/{schema}/export/sqlite`, mit dem angemeldeten SVWS-Benutzer, Kompetenz Admin oder SQLite-Export, ADR 003). Ohne `stand` ist eine Rückspielung möglich, die Prüfung auf ein veraltetes Backup entfällt dann mit Hinweis.

### 2. Anmeldung an der Schule

Die Rückspielung läuft auf dem SVWS-Server der Schule. Dort liegen die eigene Datenbank der Schule und das eingespielte KOOP-Backup. Der Name des Schemas der Schule stimmt nicht mit dem Namen der Quell-DB auf dem KOOP-Server überein.

- Angemeldet wird wie bisher an der **KOOP-DB** (dem eingespielten Schema).
- In der Ansicht „Rückspielen“ meldet sich der Benutzer zusätzlich an der **Datenbank seiner Schule** an. Das Schema wird frei gewählt, nicht aus der Liste der Quell-DBs übernommen.
- Welche Quellschule das ist, erkennt SVWS-KOOP an der Schulnummer (Vergleich mit `schulNr` der vermerkten Quell-DBs). Passt keine, bricht SVWS-KOOP ab. Bei Testdaten (Schulnummer 123456) wählt der Benutzer die Quellschule aus.
- Empfohlen wird ein Benutzer mit Administratorrechten in der Datenbank der Schule, weil auch Platzhalter-Lehrkräfte angelegt werden (ADR 002, „Benutzer und Rechte“).

### 3. Datenquelle in der KOOP-DB

Gelesen werden die **Kurse und Leistungsdaten der KOOP-DB**, die das Aktivieren einer Blockung geschrieben hat (A14), nicht die Blockung selbst.

- Zurückgespielt wird je **Abiturjahrgang und Halbjahr**. Voraussetzung ist eine **aktivierte Blockung** dieses Halbjahres in der KOOP-DB.
- Die Vorschau warnt, wenn die Lehrkräfte der Blockungskurse von den Lehrkräften der Kurse abweichen. Das passiert, wenn Lehrkräfte nach dem Aktivieren in der Blockung geändert wurden. Dann muss die Blockung erneut aktiviert oder die Lehrkraft am Kurs nachgetragen werden.

Begründung: Kurse und Leistungsdaten sind das, was auch in einer einzelnen Schule nach dem Aktivieren gilt. Die Kursart je Schüler (z. B. `LK1`, `GKS`, `AB3`) hat der Server dabei bereits aus den Fachwahlen gebildet und muss nicht nachgebaut werden.

### 4. Halbjahr und Lernabschnitt

- Das Halbjahr der aktivierten Blockung muss in der Datenbank der Schule einem **vorhandenen Schuljahresabschnitt** entsprechen. Jeder Schüler braucht dort einen **Lernabschnitt** in diesem Abschnitt.
- Schüler ohne passenden Lernabschnitt werden in der Vorschau gemeldet und übersprungen. Die API bietet kein Anlegen eines Lernabschnitts nach dem Vorbild des vorigen, wie es der Server beim Aktivieren intern tut (`createByPrevious`). Ein solcher Endpunkt ist beim SVWS-Team in Planung. Sobald er verfügbar ist, legt SVWS-KOOP fehlende Lernabschnitte damit an.
- **Jahrgang 10:** Die KOOP-Blockung gilt für die EF.1 des kommenden Schuljahres. In der Schule gibt es diesen Abschnitt in der Regel noch nicht. Kurse und Leistungsdaten der 10 werden deshalb **erst nach dem Schuljahreswechsel** zurückgespielt. Vorher zeigt die Vorschau einen Hinweis. Die Fachwahlen der 10 können schon vorher zurückgespielt werden.

### 5. Eigene Daten der Schule und Daten aus der Rückspielung

**Grundsatz:** Kurse, Leistungsdaten und Blockungen, die nicht aus einer Rückspielung stammen, sind **Daten der Schule** und werden von ihr selbst verwaltet. SVWS-KOOP lässt sie unverändert. Ändern und entfernen darf SVWS-KOOP nur, was es selbst angelegt hat.

Neben den KOOP-Kursen kann es in der Schule eigene Oberstufenkurse geben, zum Beispiel Arbeitsgemeinschaften, die nicht zum Abitur zählen. Diese bleiben bestehen und erscheinen nach `restore` zusammen mit den KOOP-Kursen in der Blockung der Schule.

**Was SVWS-KOOP angelegt hat,** speichert es in der Datenbank der Schule (Client-Konfiguration `SVWS-KOOP`, Schlüssel `rueckspielung.<abiturjahr>.<halbjahr>`): Zeitpunkt, `stand` des KOOP-Backups und die IDs der angelegten Kurse, Leistungsdaten und der Blockung aus `restore`. Platzhalter-Lehrkräfte werden nicht vermerkt. Sie werden wiederverwendet und nie entfernt (ADR 002).

**Erneute Rückspielung:** Gibt es für das Halbjahr einen Vermerk aus einer früheren Rückspielung, entfernt SVWS-KOOP nach Bestätigung zuerst diese Daten: Leistungsdaten (`DELETE …/schueler/leistungsdaten/delete/multiple`), Kurse (`DELETE …/kurse/delete/multiple`) und die Blockung aus `restore` (`DELETE …/gost/blockungen/{id}`). Nicht mehr vorhandene IDs werden übersprungen. Sind in diesen Leistungsdaten inzwischen **Noten** eingetragen, ist das ein Fehler, und das Halbjahr wird nicht zurückgespielt.

**Konflikte mit Daten der Schule** werden gemeldet, nicht aufgelöst:
- Hat ein Schüler im Lernabschnitt schon eigene Leistungsdaten in einem Fach, das auch ein KOOP-Kurs abdeckt, wird diese KOOP-Leistung nicht geschrieben. Die Vorschau nennt Schüler und Fach. Die Schule entscheidet, ob sie ihre eigenen Leistungsdaten entfernt.
- Verwendet ein eigener Kurs der Schule im selben Abschnitt dasselbe Kürzel wie ein KOOP-Kurs, wird der KOOP-Kurs nicht angelegt, seine Leistungsdaten auch nicht. Die Schule benennt ihren Kurs um.
- Hat die Schule für das Halbjahr **eigene Blockungen**, zeigt die Vorschau eine **deutliche Warnung** (F2). Eine aktivierte wird besonders hervorgehoben. Weiter geht es nur nach ausdrücklicher Bestätigung. `restore` wird in diesem Fall nicht aufgerufen, damit neben der eigenen Blockung keine zweite entsteht. Die Vorschau weist darauf hin.

Die Fachwahlen der Schule werden nur nach Abschnitt 9 geändert.

### 6. Lehrkräfte

Für jeden Kurs bestimmt die **Kurslehrkraft** der KOOP-DB den Ort (ADR 002, „Kurse an der Partnerschule“):

| Kurslehrkraft in der KOOP-DB | Lehrkraft in der Schule | Ort des Kurses |
|---|---|---|
| `<Kürzel>-<eigene Nr>` | Lehrkraft mit `<Kürzel>`, auch wenn sie inzwischen unsichtbar ist | eigene Schule |
| `<Kürzel>-<Nr der Partnerschule>` | Platzhalter dieser Partnerschule | Partnerschule |
| keine, oder Lehrkräfte verschiedener Schulen, oder Kürzel ohne Suffix | Auswahl in der Vorschau | Auswahl in der Vorschau |

- Findet SVWS-KOOP eine eigene Lehrkraft in der Schule nicht, wird der Kurs in der Vorschau gemeldet und ohne Lehrkraft angelegt.
- **Platzhalter** legt SVWS-KOOP beim ersten Lauf an (`POST /db/{schema}/lehrer/create`): Kürzel = Kürzel der Partnerschule im Schulkatalog der Schule, Name aus dem Schulkatalog, `istRelevantFuerStatistik = false`. Fehlt die Partnerschule im Katalog oder hat sie kein Kürzel, ist das ein Fehler in der Vorschau (A7).
- **Weitere Lehrkräfte** eines Kurses werden übernommen, wenn sie zur eigenen Schule gehören. Lehrkräfte der Partnerschule als weitere Lehrkraft entfallen.
- **Sonderfälle** muss der Benutzer in der Vorschau einer Schule zuordnen. Dafür gibt es eine Sammelzuordnung („alle Kurse ohne Lehrkraft: Schule …“). Ohne Zuordnung wird der Kurs nicht übertragen, die Leistungsdaten seiner Schüler auch nicht (ADR 002).

### 7. Kurse

Übertragen werden nur Kurse, in denen mindestens ein eigener Schüler sitzt (A16, A18).

| Feld (`KursDaten`) | Wert |
|---|---|
| `idSchuljahresabschnitt` | Abschnitt der Schule zum Halbjahr |
| `kuerzel`, `kursartAllg`, `wochenstunden`, `wochenstundenLehrer`, `schienen`, `sortierung` | wie in der KOOP-DB |
| `idFach` | Fach der Schule mit demselben Kürzel |
| `idJahrgaenge` | Jahrgang der Schule zum Halbjahr (EF, Q1, Q2) |
| `lehrer`, `weitereLehrer` | nach Abschnitt 6 |
| `schulnummer` | Schulnummer der Partnerschule, wenn der Kurs dort stattfindet, sonst leer |

`schulnummer` lässt sich wegen des Server-Fehlers derzeit nicht schreiben (ADR 003, Abschnitt 6, Issue 03). Bis zur Behebung bleibt das Feld leer, das Protokoll vermerkt es. Die Partnerschule ist dann über den Platzhalter und `koopSchule` in den Leistungsdaten erkennbar.

### 8. Leistungsdaten

Für jeden eigenen Schüler werden die Leistungsdaten der KOOP-DB **mit Kurs** übertragen, je Schüler in einem Aufruf (`POST /db/{schema}/schueler/leistungsdaten/create/multiple`, eine Transaktion):

| Feld | Wert |
|---|---|
| `lernabschnittID` | Lernabschnitt des Schülers in der Schule (Abschnitt 4) |
| `fachID`, `kursID` | Fach und neu angelegter Kurs der Schule |
| `kursart`, `wochenstunden` | wie in der KOOP-DB |
| `lehrerID` | Kurslehrkraft der Schule bzw. Platzhalter |
| `koopSchule` | Schulnummer der Partnerschule, wenn der Kurs dort stattfindet, sonst leer |

Schüler werden über `externeSchulNr` und die mitgeführte ID gefunden (ADR 002, „Merkmal Stammschule“). Schüler mit Löschvermerk in der KOOP-DB werden nicht zurückgespielt. Gibt es die ID in der Schule nicht mehr, wird der Schüler gemeldet.

### 9. Fachwahlen

- Zurückgespielt werden die Fachwahlen der KOOP-DB **ab dem aktuellen Halbjahr**. Vergangene Halbjahre bleiben in der Schule unverändert, weil sie in der KOOP-DB fehlen (ADR 003, Abschnitt 7).
- Geschrieben wird nur bei Schülern, deren Fachwahlen sich unterscheiden, je Fach mit `PATCH /db/{schema}/gost/schueler/{id}/fachwahl/{fachid}`.
- Weicht die Prüfsumme der Fachwahlen in der Schule vom Wert aus der Übernahme ab (Abschnitt 1), nennt die Vorschau die Schüler. Ihre Fachwahlen werden nur nach ausdrücklicher Bestätigung überschrieben (ADR 002).
- Fachwahlen werden **vor** Kursen und Leistungsdaten geschrieben, damit `restore` zu den Fachwahlen passende Daten vorfindet.

### 10. Ablauf

Je Abiturjahrgang und Halbjahr, nach Vorschau und Bestätigung (A19):

1. Prüfungen (Abschnitt 11). Bei Fehlern wird dieses Halbjahr nicht geschrieben.
2. Daten einer früheren Rückspielung dieses Halbjahres entfernen (Abschnitt 5).
3. Platzhalter anlegen, falls sie fehlen.
4. Fachwahlen schreiben (Abschnitt 9).
5. Kurse anlegen (Abschnitt 7).
6. Leistungsdaten anlegen (Abschnitt 8).
7. `GET /db/{schema}/gost/blockungen/{abiturjahr}/{halbjahr}/restore` (ADR 003, Abschnitt 6), außer die Schule hat eigene Blockungen für das Halbjahr (Abschnitt 5).
8. Vermerk `rueckspielung.<abiturjahr>.<halbjahr>` mit den angelegten IDs schreiben. Damit der Vermerk auch bei einem Abbruch stimmt, wird er nach jedem Schritt 5 bis 7 aktualisiert.

Danach speichert SVWS-KOOP in der Datenbank der Schule `letzteRueckspielung` (Zeitpunkt, `stand` des KOOP-Backups, zurückgespielte Halbjahre) und erstellt das Protokoll (A20). Zum Schluss weist es darauf hin, dass das KOOP-Schema gelöscht werden sollte (ADR 002, „Datenschutz“). Das Löschen braucht den Root-Zugang und kann auch im Admin-Client erfolgen.

### 11. Prüfungen und Vorschau

Die Vorschau zeigt je Abiturjahrgang und Halbjahr:

**Fehler** (Halbjahr wird nicht geschrieben):
- keine aktivierte Blockung in der KOOP-DB,
- kein passender Schuljahresabschnitt in der Schule,
- Noten in Leistungsdaten einer früheren Rückspielung dieses Halbjahres (Abschnitt 5),
- Fach eines Kurses fehlt in der Schule (Kürzel),
- Partnerschule fehlt im Schulkatalog der Schule oder hat kein Kürzel.

**Warnungen** (Bestätigung nötig):
- **eigene Blockungen der Schule für das Halbjahr**, besonders eine aktivierte (deutlich hervorgehoben, Abschnitt 5),
- KOOP-Backup nicht neuer als die letzte Rückspielung (`stand`),
- Fachwahlen in der Schule seit der Übernahme geändert (Schüler werden genannt),
- Lehrkräfte der Blockung weichen von den Kursen ab (Abschnitt 3),
- Konflikte mit Daten der Schule: Leistungsdaten im selben Fach, Kurse mit demselben Kürzel (Abschnitt 5).

**Hinweise:**
- Kurse ohne eindeutige Lehrkraft (Zuordnung nötig, Abschnitt 6),
- Daten einer früheren Rückspielung, die ersetzt werden (Zeitpunkt, Anzahl der Kurse und Leistungsdaten),
- eigene Oberstufenkurse der Schule, die bestehen bleiben (Anzahl),
- Schüler ohne Lernabschnitt oder nicht in der Schule gefunden,
- Jahrgang 10 vor dem Schuljahreswechsel (Abschnitt 4),
- `schulnummer` am Kurs nicht setzbar (Abschnitt 7).

Dazu kommen Zahlen: Kurse gesamt, davon an Partnerschulen, Schüler, Leistungsdaten, geänderte Fachwahlen, neu anzulegende Platzhalter.

## Alternativen

- **Blockung statt Kursen lesen** (Blockungskurse und aktives Ergebnis): Damit wäre keine Aktivierung in der KOOP-DB nötig. Verworfen, weil SVWS-KOOP dann die Kursart je Schüler aus den Fachwahlen selbst bilden müsste, wie es der Server beim Aktivieren tut, und weil die Aktivierung in der KOOP-DB ohnehin Teil des Ablaufs ist (A14).
- **Alle Oberstufenkurse und -Leistungsdaten des Halbjahres ersetzen** (`revertactivate`, wie beim Aktivieren im Server): verworfen. Damit würden auch Kurse und Leistungsdaten entfernt, die die Schule selbst verwaltet, zum Beispiel Arbeitsgemeinschaften. Außerdem greift `revertactivate` nur, wenn es Oberstufenkurse gibt.
- **Vorhandene Oberstufenkurse als Fehler melden und vom Benutzer im SVWS-Client entfernen lassen:** verworfen aus demselben Grund. Die Schule müsste eigene Kurse entfernen, die mit der Kooperation nichts zu tun haben.
- **Bei einer erneuten Rückspielung nur ergänzen:** verworfen. Es entstünden doppelte Kurse und Leistungsdaten. Deshalb vermerkt SVWS-KOOP, was es angelegt hat.
- **Rückspielung der 10 in den aktuellen Abschnitt:** verworfen, weil die Leistungsdaten dann im falschen Schuljahr stünden.
- **Blockung in die Schule übertragen:** verworfen. Die Blockung bleibt in der KOOP-DB. Mit `restore` erhält die Schule eine Blockung aus den Kursen, die zu ihren eigenen Schülern passt.

## Konsequenzen

- **Übernahme und Nachladen** schreiben die Prüfsumme der Fachwahlen (Abschnitt 1). Das ist vor dem ersten echten Einsatz umzusetzen. KOOP-DBs, die ohne Prüfsumme übernommen wurden, zeigen bei der Rückspielung einen Hinweis statt der Prüfung.
- Neue Kachel **„Verteilen“** (Phase 3) im Dashboard.
- **ADR 002:** Die Tabelle „Oberfläche“ erhält die Kachel „Verteilen“ (erledigt). A16 bis A20 gelten mit den Präzisierungen aus diesem ADR.
- **ADR 003:** Die Lösch-Endpunkte für Kurse, Leistungsdaten und Blockungen sind am Testserver zu prüfen und zu ergänzen.
- Für Tests braucht `kooptest` aktivierte Blockungen mit Lehrkräften an den Kursen. Heute haben die meisten Kurse keine Lehrkraft.

## Geklärte Fragen

- **F1 Lernabschnitte (2026-10-18):** Ein Endpunkt zum Anlegen fehlender Lernabschnitte ist beim SVWS-Team in Planung. Bis dahin werden Schüler ohne Lernabschnitt gemeldet und übersprungen (Abschnitt 4).
- **F2 Eigene Blockung der Schule (2026-10-18):** Schulen in einer Kooperation blocken nicht in ihrer eigenen Datenbank. Eigene Blockungen für das Halbjahr führen zu einer deutlichen Warnung (Abschnitt 5).
- **F3 Änderungen in der Datenbank der Schule (2026-10-18):** SVWS-KOOP ändert in der Datenbank der Schule nichts selbstständig, was es nicht selbst angelegt hat. Konflikte werden gemeldet, die Schule korrigiert selbst (Abschnitt 5).
- **F4 Eigene Kurse und Leistungsdaten der Schule (2026-10-18):** Eigene Oberstufenkurse und Leistungsdaten (z. B. Arbeitsgemeinschaften, die nicht zum Abitur zählen) verwaltet die Schule selbst. Sie bleiben bei der Rückspielung unverändert. SVWS-KOOP vermerkt, was es angelegt hat, und ersetzt bei einer erneuten Rückspielung nur diese Daten (Abschnitt 5).
- **F5 Kooperation zu zweit (2026-10-18):** SVWS-KOOP ist für Kooperationen gemacht, die mit mindestens drei Schulen gemeinsam blocken. Zwei Schulen, die nur einzelne Kurse gemeinsam anbieten, blocken jede für sich und nutzen die KOOP-Funktionen der Oberstufe im SVWS-Client. Zwei Schulen, die die gesamte Stufe gemeinsam blocken, nutzen SVWS-KOOP wie drei Schulen (ADR 002, A1). Die Arbeitsweise mit einzelnen KOOP-Kursen unterstützt SVWS-KOOP nicht, die Regeln aus Abschnitt 5 halten sie aber offen: Eigene Kurse der Schule gehen bei der Rückspielung nicht verloren.

## Offene Fragen

Keine.
