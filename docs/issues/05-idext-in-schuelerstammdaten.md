# `IDext` der Schüler über die API lesen und schreiben

**Art:** Erweiterung · **Bereich:** Schülerstammdaten (`SchuelerStammdaten`, `SchuelerStammdatenMapper`)

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Dazu werden die Schüler mehrerer Schulen per API in eine eigene Datenbank (KOOP-DB) kopiert. Nach der Blockung müssen ihre Kurse und Fachwahlen in die Datenbank ihrer eigenen Schule zurückgeschrieben werden. Dafür muss jeder Schüler der KOOP-DB eindeutig seinem Datensatz in der Schuldatenbank zugeordnet werden können.

Wir verwenden dafür zwei Merkmale:

- `externeSchulNr` (Spalte `Schueler.ExterneSchulNr`, „Schulnummer von externen Koopschülern“): die Schulnummer der Herkunftsschule. Das funktioniert bereits über `SchuelerStammdaten`.
- die **ID des Schülers in der Herkunftsdatenbank**. Dafür passt die vorhandene Spalte `Schueler.IDext` („externe ID“).

## Beobachtung

`IDext` gibt es nur in der Datenbank (`DTOSchueler.IDext`). Sie ist weder Teil von `SchuelerStammdaten` noch wird sie von einem Endpunkt gelesen oder geschrieben.

Als Übergang legen wir die ID in der **Schülerausweisnummer** (`idSchuelerausweis`) ab. Das funktioniert, zweckentfremdet aber ein fachliches Feld.

## Wunsch

`IDext` als Feld in `SchuelerStammdaten` aufnehmen, z. B. `idExt` (String oder Long):

- lesen über `GET /db/{schema}/schueler/{id}/stammdaten` und `POST /db/{schema}/schueler/stammdaten`,
- setzen über `PATCH /db/{schema}/schueler/{id}/stammdaten`,
- optional beim Anlegen über `POST /db/{schema}/schueler/create`.

Die Abfrage `DTOSchueler.QUERY_BY_IDEXT` gibt es bereits. Eine Suche nach `IDext` über die API wäre ebenfalls hilfreich, ist aber nicht zwingend.

## Nutzen über SVWS-KOOP hinaus

Auch andere Werkzeuge, die Schüler zwischen Systemen abgleichen (z. B. Importe aus Fremdsystemen), könnten so eine fremde ID am Schüler speichern, ohne fachliche Felder zu belegen.
