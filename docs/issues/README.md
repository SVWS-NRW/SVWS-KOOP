# Issues an das SVWS-Team

Diese Texte sind als Vorlagen für Issues im Projekt [SVWS-NRW/SVWS-Server](https://github.com/SVWS-NRW/SVWS-Server) gedacht. Jede Datei ist ein eigenes Issue und lässt sich ohne die anderen verstehen.

## Gemeinsamer Kontext (steht kurz auch in jedem Issue)

**SVWS-KOOP** ist ein neues SVWS-Tool in der Familie von SVWS-Import, SVWS-Prognos und SVWS-Konferenz (Vue-SPA, kein eigenes Backend, greift nur über die REST-API des SVWS-Servers zu). Es unterstützt Schulen mit gymnasialer Oberstufe, die ihre Kurse **in einer Kooperation gemeinsam blocken**:

1. Die Datenbanken von bis zu fünf Kooperationsschulen werden als Schemata auf einem SVWS-Server eingespielt (`/api/schema/root/import/sqlite`).
2. SVWS-KOOP legt ein neues Schema an, die **KOOP-DB** (`/api/schema/root/create` + `/api/schema/create/{schema}/init/{schulnummer}`), und überträgt Schüler, Lehrkräfte, Fächer und Oberstufeneinstellungen aus den Quell-DBs per API.
3. In der KOOP-DB wird mit dem SVWS-Client geblockt.
4. Kurse und Kurszuordnungen werden per API in die Datenbanken der einzelnen Schulen zurückgespielt.

SVWS-KOOP ändert den SVWS-Server nicht selbst. Wo die API nicht reicht, melden wir das hier.

## Getesteter Stand

- SVWS-Server Branch `dev`, Commit `4dfc78e518` (2026-10-16), DB-Revision 80
- MariaDB, Zugriff über HTTPS auf Port 8443, ohne eigenen Port für privilegierte Zugriffe

## Übersicht

| Nr. | Titel | Art |
|---|---|---|
| [01](01-hard-delete-schueler-fehlt.md) | Endpunkt zum endgültigen Löschen von Schülern fehlt seit Refactoring | Fehler (Regression) |
| [02](02-race-condition-create.md) | Gleichzeitige Create-Aufrufe scheitern mit HTTP 500 | Fehler, **besprochen: derzeit nicht änderbar** (SchILD-NRW 3), nur Dokumentation |
| [03](03-kurs-schulnummer-500.md) | `schulnummer` am Kurs lässt sich nicht setzen (500) | Fehler |
| [04](04-init-jahrgaenge-ohne-schulgliederung.md) | Nach `init` haben die Jahrgänge keine Schulgliederung, Abiturjahrgang nicht anlegbar | Fehler |
| [05](05-idext-in-schuelerstammdaten.md) | `IDext` der Schüler über die API lesen und schreiben | Erweiterung |
