# Beschreibung des Ziels der SVWS-KOOOP-App

## Allgeeines

Es gibt Schulen mit gymnasialer Oberstufe, die die Jahrgänge 10,EF,Q1,Q2 zusammen blocken.
Der Vorteil ist, das Schüler man mehr Kurse anbieten kann, also den Schülern eine größere Vielfalt bieten kann.

Dazu muss eine neue Datenbank angelegt werden mit einer Schulnummer einer Schule.
Die Schule-Stammdaten sollten dann aber so geändert werden, dass klar ist, dass es sich umdie KOOP-DB handelt.

Das Tool muss zunächst bis zu drei Schulen unterstützen.
Die Schüler der JAhrgänge 10,EF,Q1 und Q2 müssen aus jeder Schuldatenbank extrahiert werden und in die KOOP-DB gelangen. Schülerstammdaten, Lupo-Fachwahlen. Es muss sichergestellt werden, dass alle DAtenbanken die gleichen Fächer, Fächereinstellungen und die Oberstufeneinstellungen haben. Die Schüler müssen ein Merkmal (Stammschule) haben, mit dem sie später ihrer Schule wieder zugeordnet werden können.

Danach kann man in der KOOP-DB die Blockung durchführen.
Die Blockung kann dann bei dne Schülern aktiviert und die Wahlen in die Leistungsdaten geschrieben werden. (Das macht jetzt schon der SVWS-Server )

Die Schüler-Leitsungsdaten müssen dann in Ihrer Stammschule eingespielt werden. Gegebenenfalls muss auch eine Fachwahländerung bei einem Schüler zurückgespielt werden.

Idee für die Datensynchronisation:

1. Zu einem Zeitpunkt werden SQ-Lite-Backups erstellt. Diese werden auf einem SVWS-Server eingespielt und auch die KOOP-DB wird dort erstellt. Das SVWS-KOOP-Tool übernimmt die Synchronisation.

2. Nach Fertigstellung der Blockung werden 3 SQ-Lite-Backups von der KOOP-DB erstellt.
Diese werden dann in die SVWS-Server-Instanzen an jeder Schule eingespielt. Das SVWS-KOOP-Tool macht dann die Rückspielung der DAten.

