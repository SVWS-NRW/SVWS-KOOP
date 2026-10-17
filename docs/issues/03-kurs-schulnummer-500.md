# `schulnummer` am Kurs lässt sich nicht setzen (500)

**Art:** Fehler · **Bereich:** API Kurse (`DataKurse`)

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Nach der gemeinsamen Blockung werden die Kurse per API in die Datenbank jeder Schule zurückgeschrieben. Findet ein Kurs an der Partnerschule statt, soll am Kurs deren Schulnummer stehen (Feld `schulnummer` in `KursDaten`, Spalte `Kurse.SchulNr`). Die Partnerschule ist im Schulkatalog der Datenbank eingetragen.

## Beobachtung

| Aufruf | Ergebnis |
|---|---|
| `POST /db/{schema}/kurse/create` mit `"schulnummer": 192806` (Schule steht im Schulkatalog) | **500**, leerer Body, kein Eintrag im Server-Log |
| `PATCH /db/{schema}/kurse/{id}` mit `"schulnummer": 192806` | **500** |
| dasselbe mit `"schulnummer": "192806"` (Text) | 400 |
| ohne `schulnummer` | 201 |

Zum Vergleich: In den Leistungsdaten funktioniert das entsprechende Feld (`koopSchule` in `POST /db/{schema}/schueler/leistungsdaten/create`), dort wird die Schulnummer gespeichert.

## Ursache (vermutet)

`DataKurse.mapSchulnummer` (Zeile ~199) wandelt den Wert in einen `Integer` und sucht damit im Schulkatalog:

```java
final Integer schulnummer = JSONMapper.convertToIntegerInRange(value, true, 100000, 999999, name);
final List<DTOSchuleNRW> schulen = this.conn.queryList(DTOSchuleNRW.QUERY_BY_SCHULNR, DTOSchuleNRW.class, schulnummer);
```

`DTOSchuleNRW.SchulNr` (Tabelle `K_Schule`) ist aber ein `String`. Die JPA-Abfrage mit einem `Integer`-Parameter scheitert vermutlich an der Typprüfung, das führt zum 500.

## Nachstellen

1. Im Schulkatalog `POST /db/{schema}/schule/schulen/create` eine Schule mit `schulnummerStatistik` `192806` anlegen.
2. `POST /db/{schema}/kurse/create` mit `{"idSchuljahresabschnitt": 1, "kuerzel": "D-GK1", "idFach": 1, "kursartAllg": "GK", "idJahrgaenge": [7], "wochenstunden": 3, "schulnummer": 192806}`.

## Erwartet

Der Kurs wird mit `SchulNr = 192806` gespeichert. Steht die Schulnummer nicht im Schulkatalog, antwortet der Server mit 404 und der vorgesehenen Meldung.

## Vorschlag

In `mapSchulnummer` mit `String.valueOf(schulnummer)` abfragen (bzw. den Parametertyp an `DTOSchuleNRW.SchulNr` anpassen).
