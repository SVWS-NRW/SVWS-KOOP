# Gleichzeitige Create-Aufrufe scheitern mit HTTP 500

**Art:** Fehler · **Bereich:** Anlegen von Datensätzen über die API (allgemein)

> **Stand 2026-10-17:** Mit dem SVWS-Team besprochen. Derzeit nicht änderbar, weil SchILD-NRW 3 noch direkt auf die MariaDB zugreift. Dieses Issue dient zur Dokumentation und muss nicht eingereicht werden. SVWS-KOOP wiederholt betroffene Aufrufe dauerhaft (siehe unten).

## Kontext

Wir entwickeln das SVWS-Tool **SVWS-KOOP** für Schulen, die ihre Oberstufenkurse in einer Kooperation gemeinsam blocken. Dabei überträgt das Tool per API einige hundert Schüler und Lehrkräfte aus mehreren Schuldatenbanken in eine neue Datenbank (KOOP-DB). Damit das nicht zu lange dauert, sollen mehrere Datensätze gleichzeitig angelegt werden, so wie es auch passiert, wenn mehrere Benutzer gleichzeitig im SVWS-Client arbeiten.

## Beobachtung

Werden Datensätze gleichzeitig angelegt, scheitert ein Teil der Aufrufe mit **HTTP 500**, teils mit leerem Body, teils mit „Es ist ein interner Serverfehler aufgetreten“.

Gemessen beim Übernehmen von 155 Lehrkräften, je 4 gleichzeitig (pro Lehrkraft `POST /db/{schema}/lehrer/create`, danach `POST /db/{schema}/lehrer/personalabschnittsdaten`): **59 von 155 scheiterten mit 500**, betroffen waren beide Aufrufe. Nacheinander ausgeführt gelingen alle. Ein fehlgeschlagener Aufruf gelingt, wenn man ihn einige Millisekunden später wiederholt.

Ob bei einem fehlgeschlagenen Create-Aufruf trotzdem etwas gespeichert wird, konnten wir nicht sicher feststellen. Für Clients, die wiederholen, wäre eine verlässliche Aussage dazu wichtig.

## Ursache

- `DBEntityManager.transactionGetNextID` liest `MaxID` aus `Schema_AutoInkremente` ohne Sperre (`SELECT MaxID … WHERE NameTabelle = ?`) und der Server fügt den Datensatz mit `MaxID + 1` ein.
- Die Tabellen haben keine echten `AUTO_INCREMENT`-Spalten (ID-Default `-1`). Trigger wie `t_AutoIncrement_INSERT_K_Lehrer` halten `Schema_AutoInkremente` aktuell und vergeben bei `ID = -1` selbst eine ID. Diese Konstruktion ermöglicht, dass SchILD-NRW 3 parallel direkt auf die Datenbank schreibt.
- Zwei gleichzeitige Anfragen lesen denselben `MaxID`, eine scheitert am Primärschlüssel.

Betroffen sind nicht nur Endpunkte mit `…/create` im Pfad. Beobachtet bei `POST /lehrer/create` und `POST /lehrer/personalabschnittsdaten`. Bei der Übernahme von Schülern gingen ohne Wiederholung rund 100 Einträge bei Erziehern, Telefonnummern und Sprachen verloren, mit Wiederholung keiner mehr. Welche dieser Endpunkte im Einzelnen betroffen waren, haben wir nicht aufgeschlüsselt.

## Nachstellen

1. Leeres Schema anlegen und initialisieren.
2. 20 Lehrkräfte gleichzeitig anlegen, z. B. mit:

```bash
for i in $(seq 1 20); do
  curl -sk -u Admin: -H 'Content-Type: application/json' -o /dev/null -w "%{http_code}\n" \
    -d "{\"kuerzel\":\"T$i\",\"vorname\":\"Test\",\"nachname\":\"Lehrer$i\",\"geschlecht\":3,\"personalTyp\":\"LEHRKRAFT\"}" \
    https://localhost:8443/db/<schema>/lehrer/create &
done; wait
```

Ein Teil der Aufrufe liefert 500.

## Erwartet

Gleichzeitige Create-Aufrufe gelingen alle, oder der Server antwortet bei einer Kollision mit einem eindeutigen Status (z. B. 409), damit der Client gezielt wiederholen kann.

## Folgen für Anwender

Das betrifft nicht nur Tools. Legen zwei Benutzer gleichzeitig im SVWS-Client Datensätze desselben Typs an, kann einer von beiden einen unerklärlichen Fehler bekommen.

## Wie wir damit umgehen

SVWS-KOOP wiederholt schreibende POST-Aufrufe nach 500 mit zufälliger, wachsender Wartezeit (Jitter, bis zu 5 Versuche). Solange SchILD-NRW 3 direkt auf die Datenbank zugreift, bleibt das so.
