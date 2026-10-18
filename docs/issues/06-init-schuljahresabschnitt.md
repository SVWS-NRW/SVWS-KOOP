# Schuljahresabschnitt beim Initialisieren wählen oder per API anlegen

**Art:** Erweiterung · **Bereich:** Schema initialisieren (`DataSchuleStammdaten.init`), Schuljahresabschnitte

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Das Tool legt per API ein neues Schema an und initialisiert es mit einer Schulnummer (`POST /api/schema/root/create/{schema}`, danach `POST /api/schema/create/{schema}/init/{schulnummer}`). In dieses Schema werden dann Schüler, Lehrkräfte und Fachwahlen aus den Datenbanken der Kooperationsschulen übertragen. Dafür muss das neue Schema auf **demselben Schuljahresabschnitt** stehen wie die Datenbanken der Schulen, sonst passen Lernabschnitte, Klassen und Abiturjahrgänge nicht zusammen.

## Beobachtung

`DataSchuleStammdaten.init` legt genau einen Schuljahresabschnitt an und bestimmt ihn aus dem heutigen Datum:

```java
final LocalDate date = LocalDate.now();
final int schuljahr = (month > 7) ? year : (year - 1);
final int abschnitt = ((month > 2) && (month < 8)) ? 2 : 1;
```

Einen anderen Abschnitt kann man nicht wählen. Über die API lässt sich auch kein weiterer Schuljahresabschnitt anlegen. Es gibt keinen Endpunkt zum Anlegen von `Schuljahresabschnitte`, und `PATCH /db/{schema}/schule/stammdaten` mit `idSchuljahresabschnitt` setzt nur einen schon vorhandenen Abschnitt.

Folgen:

- Haben die Schulen den Halbjahreswechsel schon vollzogen, im Februar aber noch nicht nach der Datumsregel, steht ein neues Schema auf dem alten Halbjahr. Umgekehrt gilt dasselbe.
- Testdatenbanken stehen oft auf einem anderen Abschnitt als das heutige Datum. Getestet: Quell-DBs auf 2026/2, ein am 18.10.2026 initialisiertes Schema auf 2026/1.

## Getesteter Stand

- SVWS-Server Branch `dev`, Commit `4dfc78e518` (2026-10-16), DB-Revision 80

## Vorschlag

Eine der beiden Möglichkeiten:

1. **`init` mit Abschnitt:** optionaler Parameter für Schuljahr und Abschnitt, zum Beispiel `POST /api/schema/create/{schema}/init/{schulnummer}?schuljahr=2026&abschnitt=2`. Ohne Parameter bleibt es bei der Datumsregel.
2. **Schuljahresabschnitte anlegen:** ein Endpunkt, der den Folgeabschnitt des aktuellen Abschnitts anlegt und dabei `VorigerAbschnitt_ID`/`FolgeAbschnitt_ID` verknüpft, zum Beispiel `POST /db/{schema}/schule/abschnitte/folgeabschnitt`. Mit dem vorhandenen PATCH auf `idSchuljahresabschnitt` kann das Schema danach auf diesen Abschnitt gestellt werden.
