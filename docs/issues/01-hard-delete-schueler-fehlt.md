# Endpunkt zum endgültigen Löschen von Schülern fehlt seit Refactoring

**Art:** Fehler (Regression) · **Bereich:** API Schüler (`APISchueler`)

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Dazu werden Schüler mehrerer Schulen per API in eine eigene Datenbank (KOOP-DB) übertragen. Verlassen Schüler eine Schule oder wird eine Übernahme wiederholt, müssen wir Schüler aus dieser Datenbank wieder **vollständig entfernen** können. Ein Löschvermerk reicht dafür nicht, weil die Schüler sonst weiter in Listen und bei der Blockung auftauchen.

## Beobachtung

Im aktuellen Stand von `dev` gibt es für Schüler nur noch

- `DELETE /db/{schema}/schueler/softdelete/multiple` (setzt einen Löschvermerk).

Der Endpunkt

- `DELETE /db/{schema}/schueler/delete/multiple` („Entfernt mehrere Schüler.“)

existiert nicht mehr. Ein Aufruf liefert HTTP 500, im Server-Log steht `RESTEASY003650: No resource method found for DELETE, return 405`.

## Ursache (vermutet)

- Commit `54cacc0204` (2026-10-12, „Api: Schüler löschen implementieren“) hat den Endpunkt in `APISchueler.java` eingeführt.
- Commit `20b579a9d8` (2026-10-16, „Refactoring: DataManager im Schülerlernabschnitt zu Services migrieren“) hat ihn wieder entfernt. Der Diff von `APISchueler.java` zeigt die Methode `deleteSchueler(...)` mit `@DELETE @Path("/delete/multiple")` als gelöscht. Thematisch gehört das nicht zum Refactoring der Lernabschnitte.
- Die Logik darunter ist noch vorhanden: `SchuelerStammdatenService.delete(List<Long>)` (mit `BulkDeleteUtils.delete`) und `SchuelerStammdatenControllerImpl.delete(List<Long>)`.

Es sieht so aus, als sei nur die API-Methode beim Zusammenführen verloren gegangen.

## Nachstellen

```bash
curl -k -u Admin: -X DELETE -H 'Content-Type: application/json' -d '[]' \
  https://localhost:8443/db/<schema>/schueler/delete/multiple
# erwartet: 200 mit leerer Liste, tatsächlich: 500 (405 im Log)
```

## Erwartet

`DELETE /db/{schema}/schueler/delete/multiple` mit einer Liste von Schüler-IDs entfernt die Schüler endgültig, so wie nach Commit `54cacc0204`.

## Vorschlag

Die Methode aus Commit `54cacc0204` in `APISchueler.java` wiederherstellen, sie ruft den vorhandenen `SchuelerStammdatenController.delete(...)` auf.
