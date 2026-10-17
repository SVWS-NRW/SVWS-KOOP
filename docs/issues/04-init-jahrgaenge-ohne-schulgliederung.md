# Nach `init` haben die Jahrgänge keine Schulgliederung, Abiturjahrgang nicht anlegbar

**Art:** Fehler · **Bereich:** Schema initialisieren (`DataSchuleStammdaten.init`), Oberstufe

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Das Tool legt dafür per API ein neues Schema an und initialisiert es mit einer Schulnummer (`POST /api/schema/root/create/{schema}`, danach `POST /api/schema/create/{schema}/init/{schulnummer}`). Anschließend werden die Abiturjahrgänge für 10, EF, Q1 und Q2 angelegt.

## Beobachtung

In einem frisch initialisierten Schema (getestet mit einer GE, Schulnummer 192806, und einem GY, Schulnummer 168890) scheitert

- `POST /db/{schema}/gost/abiturjahrgang/new/{idAbschnitt}/{idJahrgangEF}` mit **404 ohne Meldung**.

Ursache ist, dass die von `init` angelegten Jahrgänge keine Schulgliederung haben. In der Datenbank steht `EigeneSchule_Jahrgaenge.SGL = NULL`, ebenso `Restabschnitte`, `Folgejahrgang_ID` und `SekStufe`. `GostAbiturjahrUtils.getGostAbiturjahr` bzw. `JahrgaengeUtils.getRestlicheJahre` liefern bei fehlender Gliederung `null`, `DataGostJahrgangsliste.create` antwortet dann mit `NOT_FOUND`.

Setzt man die Gliederung auf „Standard für diese Schulform“ (`PATCH /db/{schema}/jahrgaenge/{id}` mit `{"idSchulgliederung": 0}`, schreibt `***`), lässt sich der Abiturjahrgang anlegen. Das klappt für GE und GY.

**Erschwerend:** Über die API ist der Fehler nicht zu sehen. `GET /db/{schema}/jahrgaenge/` liefert für `SGL = NULL` dieselbe `idSchulgliederung` (0, Standard der Schulform) wie für `***`, weil `JahrgangMapper.mapGliederung` bei `null` `Schulgliederung.getDefault(schulform)` einsetzt.

## Ursache

In `DataSchuleStammdaten.init` (Abschnitt „Einrichten der Jahrgänge“, ca. Zeile 548) werden die Felder ausdrücklich leer gesetzt:

```java
dto.GliederungKuerzel = null;
dto.Sekundarstufe = null;
dto.AnzahlRestabschnitte = null;
dto.Folgejahrgang_ID = null;
```

## Nachstellen

1. Schema anlegen und mit `init/192806` initialisieren.
2. `GET /db/{schema}/jahrgaenge/` → ID des Jahrgangs EF.
3. `POST /db/{schema}/gost/abiturjahrgang/new/1/{idEF}` → 404.
4. `PATCH /db/{schema}/jahrgaenge/{idEF}` mit `{"idSchulgliederung": 0}`, dann Schritt 3 wiederholen → 200.

## Erwartet

- `init` legt Jahrgänge an, mit denen der Server arbeiten kann: mindestens `GliederungKuerzel = "***"` (Standard der Schulform), sinnvollerweise auch Restabschnitte und Folgejahrgang.
- `abiturjahrgang/new` meldet bei fehlender Gliederung, warum es scheitert, statt 404 ohne Text.
- `GET /jahrgaenge` unterscheidet „keine Gliederung“ von „Standard der Schulform“, oder `init` lässt den Fall gar nicht erst entstehen.
