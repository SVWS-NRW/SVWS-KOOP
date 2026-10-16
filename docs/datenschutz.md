# Datenschutzhinweise

## 1. Zweck

SVWS-KOOP unterstützt Schulen mit gymnasialer Oberstufe, die ihre Kurse in einer Kooperation gemeinsam blocken. Dazu werden Daten der Kooperationsschulen in einer gemeinsamen Datenbank (KOOP-DB) auf einem SVWS-Server zusammengeführt und die Ergebnisse anschließend in die Datenbank jeder Schule zurückgespielt.

## 2. Welche Daten verarbeitet werden

- **Schülerinnen und Schüler** der Jahrgänge 10, EF, Q1 und Q2: Stammdaten, Erzieherdaten, Sprachenfolge und Fachwahlen der Laufbahnplanung
- **Lehrkräfte** (aktiv): Individualdaten und Stammschule
- **Ergebnisse der Blockung**: Kurse und Kurszuordnungen (Leistungsdaten)

Weitere Daten werden nicht übernommen.

## 3. Austausch zwischen den Schulen

Bei der Arbeit mit SVWS-KOOP gelangen Daten einer Schule an die Partnerschulen:

- Die KOOP-DB enthält die Daten aller Kooperationsschulen.
- Für die Rückspielung erhält jede Schule eine Kopie der KOOP-DB.
- Mit den Erzieherdaten gelangen auch Adressen und Kontaktdaten der Erziehungsberechtigten an die Partnerschulen.

Dafür braucht es eine **Vereinbarung der Kooperationsschulen**, die diesen Austausch regelt. SVWS-KOOP bietet nach Abschluss eines Schrittes an, eingespielte Kopien der Partnerschulen und die KOOP-DB-Kopie zu löschen.

Bei der Rückspielung schreibt SVWS-KOOP nur die Daten der eigenen Schülerinnen und Schüler in die Datenbank einer Schule.

## 4. Keine Speicherung von Zugangsdaten

- Benutzernamen und Kennwörter werden ausschließlich im Arbeitsspeicher gehalten.
- Es werden **keine** Zugangsdaten in `localStorage`, `sessionStorage`, Cookies oder Dateien gespeichert.
- Nach dem Beenden der App oder einem Neuladen der Seite sind alle Zugangsdaten gelöscht.

## 5. Datenhaltung

- SVWS-KOOP hat kein eigenes Backend. Alle Daten bleiben in den SVWS-Datenbanken.
- Geladene Daten verbleiben nur für die Dauer der Sitzung im Arbeitsspeicher Ihres Geräts.
- Kein Tracking, keine Cookies, keine Drittserver.
- Die Theme-Einstellung (Hell/Dunkel) wird im `localStorage` gespeichert, ohne Bezug zu Schüler- oder Zugangsdaten.

## 6. Empfehlungen

- Arbeiten Sie über eine verschlüsselte `https://`-Verbindung.
- Vergeben Sie für die KOOP-DB eigene Kennwörter, nicht die Ihrer Schuldatenbank.
- Löschen Sie eingespielte Kopien der Partnerschulen und der KOOP-DB, sobald sie nicht mehr gebraucht werden.
