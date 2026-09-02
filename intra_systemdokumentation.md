# Intra – vollständige Systemdokumentation

Dieses Dokument beschreibt die App **Intra** so vollständig wie möglich: alle Bereiche, alle Masken mit ihren Feldern, alle Verknüpfungen zwischen den Datenmodellen, wie Daten importiert/erzeugt werden, wo sie landen (Speicherorte), und wie die Desktop/Web-Oberfläche und die Handy-App zusammenspielen. Es ist als Referenz für eine andere KI/Entwicklungsumgebung gedacht, die diese App versteht, weiterbaut oder neu implementiert.

---

## 1. Grundarchitektur

**Zwei Frontends, eine Datenbasis:**

- **`intra.html` + `app.js` + `style.css`** – die Desktop/Web-Anwendung ("Baustellenbüro"-Sicht). Single-Page-App: *jede* Seite ist ein eigener `<div class="spa-page" id="page-XYZ">`-Block, der **immer im DOM vorhanden** ist (nicht dynamisch nachgeladen), aber per CSS-Klasse `active`/Hash-Routing ein-/ausgeblendet wird.
- **`handyapp.html` + `handyapp.js` (+ `handyapp.css`)** – die mobile Companion-App ("vor Ort am Mast"-Sicht). Bindet `app.js` mit ein, um dieselben Speicher-Funktionen (`loadBauabschnitte()`, `loadProjects()`, `pKey()` usw.) wiederzuverwenden; die dortigen IIFEs greifen aber nicht, weil ihre Ziel-Elemente in `handyapp.html` nicht existieren (jede IIFE prüft zuerst `if (!element) return;`).

**Es gibt keinen Server/Backend.** Beide Frontends sind statische HTML-Dateien, die im selben Browser geöffnet werden und sich **dasselbe `localStorage`** teilen (kein Netzwerk-Sync, keine Datenbank – „Synchronisierung" passiert automatisch dadurch, dass beide Apps denselben Browser-Speicher lesen/schreiben).

**Code-Konvention:** `app.js` besteht aus vielen aufeinanderfolgenden selbstausführenden Funktionen `(function () { ... })();`. Jede ist auf eine bestimmte Seite gescoped, indem sie zuerst ein Ziel-Element per `document.getElementById(...)` sucht und bei `null` sofort `return`et. Dadurch kann *eine* `app.js`-Datei alle Seiten bedienen, ohne dass sich die IIFEs gegenseitig stören. Global gebrauchte Funktionen (Datenzugriff, IDs, Formatierung) stehen **außerhalb** jeder IIFE auf oberster Ebene, damit alle Seiten (und `handyapp.js`) sie nutzen können.

---

## 2. Speicherkonzept

- **Persistenz:** ausschließlich `localStorage` (projektbezogene und globale Daten) sowie `sessionStorage` (z. B. aktuell gewähltes Projekt, kurzlebige Deep-Link-Übergaben zwischen Seiten).
- **Projekt-Scoping:** Fast jeder Datentopf gehört zu genau einem Projekt. Der Schlüssel wird mit `pKey(baseKey) = baseKey + ':' + currentProjectId()` gebildet. `currentProjectId()` liest die aktuell gewählte Projektnummer aus `sessionStorage` (Default `'67'`).
- **Globale (projektübergreifende) Stammdaten** – bewusst **nicht** durch `pKey()` gejagt, weil sie über alle Projekte hinweg gelten:
  - `levelbuild_projekte` – die Projektliste selbst
  - `levelbuild_protokolle_vorlagen` – Protokoll-**Vorlagen**
  - `levelbuild_taetigkeitslisten_vorlagen` – Tätigkeitslisten-**Vorlagen**
  - `levelbuild_taetigkeitsarten_vorlagen` – Tätigkeitenarten-**Vorlagen**
  - `levelbuild_lieferanten` – Lieferanten-Stammdaten
- **Migration:** `migrateToProjectScopedKey(baseKey)` kopiert einmalig alte, noch unskopierte Daten (aus einer Zeit vor der Projekt-Trennung) unter den neuen `baseKey:67`-Schlüssel, damit nichts verloren geht.
- **Aufräumen beim Löschen eines Projekts:** `PROJECT_SCOPED_BASE_KEYS` listet **alle** projekt-gescopten Basis-Schlüssel auf; `deleteAllProjectData(nr)` entfernt beim Löschen eines Projekts jeden davon mit der Endung `:nr`. **Jeder neue projekt-gescopte Datentopf muss in dieses Array eingetragen werden**, sonst bleibt beim Löschen eines Projekts eine Daten-Leiche zurück.

### Vollständige Tabelle aller `localStorage`-Basis-Schlüssel

| Basis-Schlüssel | Scope | Inhalt |
|---|---|---|
| `levelbuild_projekte` | global | Projektliste (nr, name, addr, summe, status) |
| `levelbuild_current_project` (sessionStorage) | Sitzung | aktuell offenes Projekt |
| `levelbuild_bauabschnitte` | Projekt | Bauabschnitte (Bauphasen) |
| `levelbuild_masttafel_data` | Projekt | importierte Masttafel-Rohdaten je Bauabschnitt, versioniert |
| `levelbuild_masttafel_views` | Projekt | gespeicherte Spalten-/Sortier-/Filter-Ansichten der Masttafel |
| `levelbuild_leistungsverzeichnis` | Projekt | importiertes LV (Art → Detail-Art → Leistung) |
| `levelbuild_fertigstellungsliste_views` | Projekt | gespeicherte Spalten-Konfigurationen der Fertigstellungsliste |
| `levelbuild_fertigstellungsliste_state` | Projekt | aktueller UI-Zustand (Sortierung/Filter/Fixierung) |
| `levelbuild_fertigstellungsliste_aktive_liste` | Projekt | welche Tätigkeitsliste im Einzel-Modus aktiv ist |
| `levelbuild_protokolle_vorlagen` | **global** | Protokoll-Vorlagen (Baustein-Editor) |
| `levelbuild_protokolle_projekt` | Projekt | in ein Projekt gezogene, dort editierbare Protokoll-Kopien |
| `levelbuild_taetigkeitslisten_vorlagen` | **global** | Tätigkeitslisten-Vorlagen |
| `levelbuild_taetigkeitslisten_projekt` | Projekt | in ein Projekt gezogene, dort editierbare Listen-Kopien |
| `levelbuild_taetigkeitsarten_vorlagen` | **global** | Tätigkeitenarten-Stammdaten (Name+Farbe) |
| `levelbuild_taetigkeitsarten_projekt` | Projekt | automatisch kaskadierte Arten-Kopien je Projekt |
| `levelbuild_taetigkeitsarten_seeded` | global | Flag: Default-Arten schon einmal angelegt? |
| `levelbuild_mast_taetigkeitsliste` | Projekt | welche Tätigkeitsliste ist welchem Mast zugeordnet |
| `levelbuild_mast_aufgaben_status` | Projekt | aktuell gewählter Status-Pill je Mast+Tätigkeit |
| `levelbuild_mast_protokoll_daten` | Projekt | ausgefüllte Protokoll-Antworten je Mast+Tätigkeit+Protokoll |
| `levelbuild_mast_fotos` | Projekt | an einem Mast aufgenommene Fotos |
| `levelbuild_mast_task_abschluss` | Projekt | Abschlussdatum je Mast+Tätigkeit (robust, unabhängig von Status-Pill-Umbenennung) |
| `levelbuild_bautagebuecher` | Projekt | alle Bautagebuch-Einträge (ein Eintrag pro Tag/Nummer) |
| `levelbuild_dokumente` | Projekt | automatisch erzeugte, ausgefüllte PDF-Protokolle |
| `levelbuild_einkauf_positionen` | Projekt | Einkaufs-/Material-Positionen |
| `levelbuild_einkauf_einstellungen` | Projekt | Vorbelegung für neue Bestellungen (Kostenstelle, Einkäufer, Lieferanschrift, …) |
| `levelbuild_bestellungen` | Projekt | erstellte Bestellungen (inkl. Positions-Schnappschuss) |
| `levelbuild_lieferanten` | **global** | Lieferanten-Stammdaten |

---

## 3. Projekte

Startseite (`page-projekte`). Eine Tabelle aus `loadProjects()` (persistiert, nicht mehr hartkodiert): `nr`, `name`, `addr`, `summe`, `status` (`active`/`paused`/`done`). Klick auf eine Zeile ruft `setCurrentProjectId(nr)` auf (schreibt in `sessionStorage`) und navigiert zu `#uebersicht` – **ab diesem Moment beziehen sich alle `pKey()`-Aufrufe auf dieses Projekt.** Projekte lassen sich anlegen und löschen (Löschen ruft `deleteAllProjectData(nr)` auf).

Auf derselben Seite liegt der Tab **„Vorlagen"** (`#projekte-tab-vorlagen`) – der zentrale Ort für alle **projektübergreifenden Stammdaten**:

### 3.1 Tätigkeitslisten-Vorlagen
Name + Liste von Tätigkeiten (siehe Abschnitt 8). Werden per Drag/Auswahl in ein Projekt „hineingezogen" (siehe 5.2) – das Original bleibt unverändert, es entsteht eine unabhängige Kopie mit neuen IDs.

### 3.2 Protokoll-Vorlagen
Name + Liste von „Bausteinen" (siehe Abschnitt 9). Gleiches Vorlage→Projekt-Kopie-Prinzip.

### 3.3 Tätigkeitenarten
Kleiner Stammdatensatz: **Name + Farbe** (z. B. „Einkauf", „Lieferung", „Ausführung"). Besonderheit gegenüber den anderen beiden: Es gibt **keinen manuellen „in Projekt übernehmen"-Schritt** – sobald irgendeine Tätigkeitsliste in ein Projekt gezogen wird, werden automatisch **alle** Tätigkeitenarten „in Kompletheit" mit kopiert (`cascadeTaetigkeitsartenInsProjekt()`), inklusive ID-Remapping (`sourceTemplateId`), damit bereits in der Vorlage gewählte Arten nach dem Übernehmen korrekt auf die neuen Projekt-Kopien zeigen. Eine Art ist **schon in der Vorlage** einer Tätigkeit zuweisbar (nicht erst nach dem Übernehmen).

### 3.4 Lieferanten
Stammdatensatz für den Einkauf: **Name, Straße, PLZ/Ort, Ansprechpartner-Name, -Telefon, -E-Mail**. Bewusst **global**, nicht projektgebunden (ein Lieferant wird typischerweise über mehrere Baustellen hinweg genutzt). Bei jeder Bestellung (Abschnitt 14) auswählbar – die Felder werden dann als unabhängiger Schnappschuss in die Bestellung kopiert (spätere Änderung am Stammdatensatz wirkt sich nicht rückwirkend auf alte Bestellungen aus).

---

## 4. Übersicht / Formular

Landing-Page nach dem Öffnen eines Projekts (`page-uebersicht`), zeigt Kennzahlen/Kacheln und verlinkt in alle Bereiche. `page-formular` ist eine Formular-Variante derselben Sicht.

---

## 5. Projekteinstellungen

Seite `page-projekteinstellungen`, vier Panels:

### 5.1 Bauabschnitte
Eigene Bauphasen anlegen/umbenennen/löschen (`id`, `name`). Die Masttafel bezieht sich **immer auf genau einen Bauabschnitt** (oder „Alle Bauabschnitte anzeigen"). Wird ein Bauabschnitt gelöscht, werden seine Masttafel-Daten mitgelöscht (`deleteMasttafelSectionData`).

### 5.2 Tätigkeitslisten in diesem Projekt
Eine Vorlage (3.1) auswählen → „In dieses Projekt übernehmen" → tiefe Kopie mit neuen IDs, ab jetzt unabhängig von der Vorlage editierbar (Tätigkeiten hinzufügen/entfernen, Fristen ändern, …), ohne die globale Vorlage zu verändern. Beim Übernehmen werden automatisch auch die Tätigkeitenarten kaskadiert (3.3).

### 5.3 Protokolle in diesem Projekt
Gleiches Prinzip für Protokoll-Vorlagen (3.2).

### 5.4 Bestelldaten (Einkauf)
Formular, das als **Vorbelegung** für jede neu erstellte Bestellung dient (Abschnitt 14), pro Bestellung aber überschreibbar bleibt:

| Feld | ID |
|---|---|
| Kostenstelle | `eke-kostenstelle` |
| Bauvorhaben | `eke-bauvorhaben` |
| Einkäufer Name / Telefon / E-Mail | `eke-einkaeufer-name` / `-telefon` / `-email` |
| Lieferanschrift: Firma / Zusatz / Straße / PLZ+Ort | `eke-lieferanschrift-firma` / `-zusatz` / `-strasse` / `-plzort` |

Speichert in `levelbuild_einkauf_einstellungen:<projektNr>`.

---

## 6. Masttafel

Herzstück der Standort-Daten. Liegt auf der Übersicht/Formular-Seite als importierbare Tabelle.

**Import:** native Dateiauswahl/Drag&Drop, client-seitig geparst mit **SheetJS** (Excel `.xlsx`/`.xls`) oder – für gescannte/Vektor-PDF-Masttafeln – über **pdf.js** (Vektor-Text-Extraktion) plus **Tesseract.js** (OCR-Fallback für gescannte Seiten), mit einem hart hinterlegten **kanonischen 33-Spalten-Schema**, das per Gitterlinien-Erkennung robust Zeilen/Spalten-Grenzen im PDF findet, statt sich rein auf Textkoordinaten zu verlassen.

**Datenmodell je Bauabschnitt:**
- `columns` – Spaltenstruktur (inkl. gruppierter/zweistufiger Kopfzeile aus verschmolzenen Excel-Zellen, z. B. „Mast – Höhenlage – Mast O.K. über SO")
- `rowsByKey` – **Map, Schlüssel = normalisierte Bauwerksnummer** (jede Mastzeile). Wert: `{ displayKey (Original-Schreibweise), currentIndex (Bearbeitungsstand), versions: [...] }`
- **Versionierung:** Wird dieselbe Bauwerksnummer erneut importiert und unterscheiden sich Werte (Whitespace-unempfindlicher Vergleich), entsteht eine neue Version statt eines Overwrites – volle Historie bleibt erhalten. Geänderte Zellen werden rot markiert, wenn „Alle Versionen anzeigen" aktiv ist.
- **Index (Bearbeitungsstand):** manueller Status-Badge je Mast, wird beim (Re-)Import abgefragt.
- **Bauabweichung:** manuell nachträglich eine neue Mast-Version mit Grund/Nachweis hinzufügen (`levelbuildAddManualMastVersion`), unabhängig von einem echten Re-Import – markiert als „Umplanung"/manuell im Verlauf.

**Tabellen-UI:** Zoom, Spalten ein-/ausblenden (Spalten-Panel), Spalten per Drag umsortieren, Spalten fixieren/anpinnen, Klick-Sortierung, Filter-Popover je Spalte, gespeicherte Ansichten (Kombination aus Reihenfolge/Sortierung/Filter/Sichtbarkeit), Zeilen auswählen + löschen, mehrere importierte Dateien mit Re-Download/Löschen.

**Änderungsbericht:** Export als Excel und als PDF (jsPDF/autoTable) – pro Bauwerk ein eigener kleiner Tabellenblock mit **nur den tatsächlich geänderten Spalten**, jede Version als Zeile, geänderte Zellen rot hervorgehoben, Index als eigene Spalte.

**Verknüpfung:** `getMastNummernForBauabschnitt(bauabschnittId|null)` liefert überall in der App die Liste real eingelesener Mastnummern (Standorte) – benutzt u. a. von: Bautagebuch-Leistungen (Mastauswahl statt Freitext), Einkauf (Standorte einer Position zuordnen), Fertigstellungsliste (Zeilen), Handy-App (Mastliste).

---

## 7. Mast-Detail (Standort-Ansicht)

Klick auf eine Masttafel-Zeile → `mast-detail.html`-Seite, Daten werden per `sessionStorage` übergeben (`levelbuild_mast_detail`).

- **Mastdaten-Panel:** Index-Badge, interaktive Versions-Chip-Historie, alle importierten Felder (verschmolzene Duplikate wie mehrfaches „Bemerkungen" werden zusammengefasst), gegenüber der Vorversion geänderte Felder werden hervorgehoben.
- **Bauabweichung-Panel:** manuelle Zusatz-Version mit Grund/Nachweis anlegen.
- **Tätigkeitsliste zuordnen:** welche (Projekt-)Tätigkeitsliste gilt für diesen Mast (`levelbuild_mast_taetigkeitsliste`) + informative Übersicht der Aufgaben und ihres Abhak-Status. **Das eigentliche Abhaken/Ausfüllen passiert nur in der Handy-App** – hier auf Desktop wird nur zugeordnet und der Stand eingesehen.
- **Datensätze-Panel:** die für diesen Mast über die Handy-App erfassten Protokoll-Antworten je Tätigkeit, ein-/ausklappbar, mit automatischer „erledigt"-Erkennung (alle Pflichtfelder beantwortet) und der Möglichkeit, daraus ein ausgefülltes PDF zu erzeugen bzw. es erneut zu öffnen (Reopen setzt „erledigt" mit Rückfrage zurück).
- **Fotos.**
- **Link „Alle Dokumente dieses Masts"** → Deep-Link zur Dokumente-Seite mit vorbefülltem Mast-Filter (One-Shot über `sessionStorage`, danach wieder gelöscht).

---

## 8. Tätigkeitslisten & Tätigkeiten

Eine Tätigkeitsliste besteht aus mehreren **Tätigkeiten** (Aufgaben). Jede Tätigkeit (`Tätigkeit bearbeiten`-Modal) hat:

| Feld | Bedeutung |
|---|---|
| Titel | Name der Tätigkeit |
| Frist | Fälligkeitsdatum |
| **Art** (`taetigkeitsartId`) | Dropdown aus den (Vorlage- oder Projekt-)Tätigkeitenarten (3.3) – **schon in der Vorlage wählbar** |
| **Protokoll(e)** (`protokollIds`, Array) | Dropdown+Chip-UI: **mehrere** Protokolle einer Tätigkeit zuordenbar (nicht nur eines) |
| Statusoptionen | frei definierbare, **pro Tätigkeit eigene** Status-Werte (nicht mehr listenweit), die als zyklisch klickbare „Pille" in der Handy-App erscheinen |

**Mehrfach-Protokoll / Oder-Verknüpfung:** Ist einer Tätigkeit mehr als ein Protokoll zugeordnet, gilt in der Handy-App eine **Oder-Logik pro Mast**: Der Nutzer entscheidet sich am jeweiligen Mast für **eines** der zugeordneten Protokolle; sobald eines ausgefüllt ist, sind die übrigen **nur für diese eine Tätigkeit an diesem einen Mast** gesperrt (nicht global über alle Masten hinweg – andere Masten können weiterhin frei zwischen den Protokollen wählen).

Die UI-Auswahl der Protokolle im „Tätigkeit bearbeiten"-Fenster ist ein Dropdown zum Hinzufügen + darunter angezeigte, farbige „Chips" pro gewähltem Protokoll (rein optisch an die Standorte-Chips aus Bautagebuch/LV angelehnt, keine Checkbox-Liste).

---

## 9. Protokolle (Bausteine + Handy-Formular + PDF-Vorlage)

Ein Protokoll ist eine aus **Bausteinen** zusammengesetzte Datenerfassungs-Maske (füllt der Datenerfasser auf dem Handy an einem Mast aus).

### 9.1 Baustein-Typen
`Textfeld`, `Zahl`, `Foto`, `Checkbox` (mit mehreren Optionen + optionalen Folgefragen je Option), `Auswahl`, `Datum`, `Unterschrift`, `Tabelle` (bis zu 3 Spalten, jede Spalte mit optionaler automatischer Vorbefüllung: fester Text / fortlaufende Nummer / feste Liste), `Abschnitt` (reine Überschrift zur Gliederung).

Jedes Feld hat zusätzlich: `label`, `required` (Pflichtfeld), `heading` (eigene Überschrift), **`quelle`**: `manuell` (Nutzer trägt selbst ein) oder `masttafel` (`masttafelSpalte`-Referenz – Wert wird automatisch aus der importierten Masttafel-Spalte des jeweiligen Masts übernommen statt eingetippt).

### 9.2 PDF-Vorlage (optional pro Protokoll)
Eine hochgeladene PDF-Datei, auf der sich Bausteine **und** feste Systemfelder frei positionieren lassen:

- **Systemfelder** (`PDF_SYSTEM_FELDER`): Mastnummer/Standort, Datum, Betreff, Ersteller, Datenerfasser, Protokollname, Projektname.
- Platzierung: Klick auf die PDF-Seite (mit Autovervollständigungs-Popup statt reiner Dropdown-Auswahl), danach exakt per X/Y-mm-Eingabe, Drag mit Ausrichtungshilfen (Snap-Guides), Pfeiltasten-Feinjustierung, Zoom.
- Tabellen-Baustein: **jede einzelne Zelle** (Zeile × Spalte) ist ein eigenständig frei platzierbares Feld (kein erzwungener fortlaufender Zeilenabstand).
- Schrift/Stil pro Vorlage konfigurierbar: Schriftart (Helvetica/Helvetica Fett/Times/Times Fett/Courier), Größe, Farbe.

### 9.3 Generierung
`generateProtokollPdf` (Bautagebuch → „PDF-Protokoll erstellen") erzeugt aus einem vollständigen Datensatz (Protokoll-Antworten zu einem Mast) mit **pdf-lib** ein ausgefülltes PDF (Overlay auf die hochgeladene Vorlage) und legt es in `levelbuild_dokumente` ab (Abschnitt 12).

### 9.4 Beschreibungs-basierter Feld-Generator
Freitext eingeben (z. B. „Tabelle mit Text und Foto") → einfache Erkennung erzeugt passende Bausteine automatisch (kein echtes KI-Modell, Musterabgleich per Schlüsselwörtern), inkl. optionaler automatischer Masttafel-Spalten-Verknüpfung.

---

## 10. Fertigstellungsliste

Rein lesende, tabellarische Gesamtübersicht **Standorte × Tätigkeiten** über **alle** im Projekt tatsächlich genutzten Tätigkeitslisten hinweg (nicht jede Spalte trifft auf jeden Standort zu, weil Standorten unterschiedliche Listen zugeordnet sein können, siehe `MAST_TL_ASSIGNMENT_KEY`).

- Gleichbenannte Tätigkeiten aus verschiedenen Listen werden **zu einer Spalte zusammengeführt**.
- Segment-Umschalter „Gesamt" (alle Listen gemerged) vs. „Einzel" (eine bestimmte Liste).
- Spalten: ein-/ausblenden, umsortieren (Drag im Header selbst), sortieren (Header-Klick), filtern (Popover je Spalte + Datum), fixieren/anpinnen, gespeicherte Ansichten.
- **Übergeordnete Art-Kopfzeile:** eine zusätzliche Zeile über der normalen Kopfzeile zeigt farbig, zu welcher Tätigkeitenart (Abschnitt 3.3) eine Spalte gehört; Art-Segment-Umschalter erlaubt Filtern nach einer, mehreren oder allen Arten gleichzeitig (in Summe oder Kombination). Eine zusammengeführte Spalte kann Tätigkeiten unterschiedlicher Art enthalten – für die Filterung zählt „passt, wenn *irgendeine* enthaltene Art im aktiven Filter ist" (bewusste Vereinfachung).

---

## 11. Bautagebuch

Liste (`page-bautagebuch-liste`) + Detail (`page-bautagebuch-detail`) je Tag/Nummer, projekt-gescoped. Ein Eintrag enthält:

- **Wetter** – automatisch über die Open-Meteo-API für das gewählte Datum abgerufen (3 Zeiteinträge 09/13/17 Uhr: Temperatur, Bedingung, Niederschlag), Vorhersage- oder Archiv-Endpunkt je nach Datum.
- **Arbeitszeit**
- **Anwesend (Personaleinsatz)** und **Geräteeinsatz** – jeweils ein rekursiver Baum Firma → beliebig tief verschachtelte Positionen (z. B. Firma → Gerätetyp → einzelnes Gerät).
- **Leistungen** – Verknüpfung zur LV-Position (Art/Detail-Art/Beschreibung, siehe Abschnitt 13), Zeiten, KM-Start/-Ende, **Standorte-Zuordnung** (Ankreuz-Auswahl echter Mastnummern aus der Masttafel), Menge/Einheit, vertraglich/außervertraglich/NU-Leistung-Flags.
- **Ereignisse** – u. a. automatisch erzeugt, wenn eine Tätigkeit an einem Mast (über die Handy-App) als erledigt markiert wird (`pushEreignisFuerHeute`, gekoppelt an `levelbuild_mast_task_abschluss`).
- **„PDF-Protokoll erstellen"** – sobald zu einer Tätigkeit an einem Mast ein vollständiger Protokoll-Datensatz vorliegt und dessen Protokoll eine PDF-Vorlage hat, wird hier das ausgefüllte PDF erzeugt (landet in Dokumente).

---

## 12. Dokumente

Rein lesende/verwaltende Liste (`page-dokumente`) aller automatisch erzeugten, ausgefüllten PDF-Protokolle (Betreff, Mast, Datum, Ersteller, Datenerfasser, Protokollname, Erstellt-am, PDF als Base64). Filterbar nach allen genannten Feldern, herunterladen, löschen. Erzeugt wird hier **nichts** – nur Konsum der in Abschnitt 9.3 erzeugten Dokumente. Deep-Link von Mast-Detail „Alle Dokumente dieses Masts" (Abschnitt 7).

---

## 13. Leistungsverzeichnis (LV)

Import via Excel **oder** GAEB DA XML (`.X81`–`.X86`/`.D81`–`.D86`/`.P81`–`.P86`, Struktur/Nummern automatisch erkannt). Drei-stufige Hierarchie:

`Art` (oberste Ebene, z. B. „02 Gründungen und Maste") → `Detail-Art` (z. B. „05 Rammrohrgründung") → `Beschreibung Leistung` (einzelne Position). Die volle LV-Positionsnummer (z. B. „02.05.0401") entsteht erst als Konkatenation aller drei Ebenen. Wird in der Leistungen-Maske des Bautagebuchs referenziert (Abschnitt 11).

---

## 14. Einkauf & Bestellungen

Eigener Bereich (`page-einkauf`), Nav-Punkt „Einkauf".

### 14.1 Einkaufspositionen
Material-Position: `material`, `menge`, `einheit`, `standorte` (Ankreuz-Auswahl aus **allen** im Projekt eingelesenen Masten, bauabschnittübergreifend), `notiz`. Status ist **abgeleitet**, nicht manuell gesetzt: `bestellungId` gesetzt → „Bestellt", sonst „Offen". Filterbar nach Material/Standort/Status.

### 14.2 Bestellung erstellen
Offene Positionen per Checkbox auswählen → „Bestellung erstellen (n)" → Modal mit:

| Bereich | Felder |
|---|---|
| Kopf | Bestellnummer (manuell), Datum vom |
| Vorbefüllt aus Bestelldaten (5.4) | Kostenstelle, Bauvorhaben, Einkäufer Name/Telefon/E-Mail |
| Intern | Ansprechpartner Name/Telefon |
| Lieferant | Dropdown aus Lieferanten-Stammdaten (3.4) → füllt Name/Straße/PLZ-Ort/Kontakt automatisch, danach frei editierbar; alternativ komplett manuell |
| Lieferanschrift | vorbefüllt aus Bestelldaten, editierbar |
| Referenz | Ihre Referenz, Ihre Angebotsnr., Ihr Angebot vom |
| Lieferung | Lieferdatum, Lieferbedingung |
| Positionen | schreibgeschützte Vorschau der ausgewählten Positionen |

Beim Speichern: eine Bestellung wird angelegt, die die Positionsdaten **als unveränderlichen Schnappschuss** (`material`, `menge`, `einheit`, `standorte`) mitführt – spätere Änderungen/Löschung der Original-Position wirken sich nicht auf die historische Bestellung aus. Die ausgewählten Positionen erhalten `bestellungId`, `eingekauft: true`, `eingekauftAm: <Datum vom>`. Danach wird automatisch das Bestellung-PDF heruntergeladen.

**Bestellungen-Liste:** Bestellnummer, Datum, Lieferant, Anzahl Positionen, PDF erneut herunterladen, löschen (Löschen setzt die zugehörigen Positionen wieder auf „offen" zurück).

### 14.3 Bestellung-PDF (Spitzke-Layout)
Bewusst pixelnah an einer echten Referenz-Bestellung gebaut:

1. **Briefkopf oben rechts** – das echte SPITZKE-Firmenlogo (als PNG in `app.js` eingebettete Base64-Konstante `EINKAUF_LOGO_BASE64`, per `doc.addImage` platziert).
2. **Lieferant-Adresse oben links** (Empfängerfeld: Name/Straße/PLZ-Ort).
3. **Überschrift** „Bestellung Nr. `<Bestellnummer>` vom `<Datum>`".
4. **Gerahmte 2-spaltige Kopftabelle** (jsPDF-autoTable, `theme: 'grid'`), per `rowSpan` gruppiert: Kostenstelle/Bauvorhaben ↔ Einkäufer (spannt beide), Ansprechpartner ↔ Kontakt, Lieferanschrift (spannt 3 Zeilen) ↔ Ihre Referenz/Angebotsnr./Angebot vom, Lieferdatum/Lieferbedingung ↔ Druckdatum.
5. **Linienlose Positionstabelle** (`theme: 'plain'`) darunter: Spalten Bezeichnung/Menge/Einheit, und **direkt unter jeder Positionszeile** eine kursive Zeile „Standorte: …" mit den zugeordneten Masten dieser Position.

Erzeugt via `downloadBestellungPDF(bestellung)` in der Einkauf-IIFE, Dateiname `Bestellung_<Bestellnummer>.pdf`.

---

## 15. Handy-App (`handyapp.html` / `handyapp.js`)

Drei Screens (`.ha-screen`, umgeschaltet über `showScreen(id)`):

### 15.1 `ha-screen-projekte`
Echte, persistierte Projektliste (`loadProjects()`), Status-Badges, „Aktualisieren"-Button zum erneuten Laden. Auswahl eines Projekts → `setCurrentProjectId` → Screen „Masttafel".

### 15.2 `ha-screen-masttafel`
Liste aller Standorte (Masten) des Projekts – gelesen direkt aus denselben Masttafel-Rohdaten wie die Desktop-Seite (`readMasttafelSections()` liest `MASTTAFEL_STATE_KEY` im gleichen Format). Filter: Bauabschnitt-Chips + Freitextsuche. Klick auf einen Mast → Screen „Mast".

### 15.3 `ha-screen-mast` (3 Tabs)
1. **Masttafel-Tab** – Mastdaten-Felder dieses Standorts, Versionsauswahl.
2. **Tätigkeitsliste-Tab** – die zugeordnete Tätigkeitsliste (aus `levelbuild_mast_taetigkeitsliste`) mit allen Tätigkeiten:
   - Status-Pille (aus den pro Tätigkeit definierten Statusoptionen, siehe 8) durchklickbar, automatische „erledigt"-Erkennung.
   - Ist einer Tätigkeit ein Protokoll zugeordnet: Formular direkt öffnen und ausfüllen (Feldtypen wie in 9.1, inkl. Checkbox-Folgefragen und Tabellen-Vorbefüllung).
   - **Sind einer Tätigkeit mehrere Protokolle zugeordnet:** Auswahl-Hinweis „Wähle eines der folgenden Protokolle aus – sobald eines ausgefüllt ist, ist das andere für diese Tätigkeit gesperrt." Nach Ausfüllen eines der Protokolle wird das/die andere(n) **nur für diesen Mast+diese Tätigkeit** mit Schloss-Icon gesperrt dargestellt (nicht global). Speicherung unter `levelbuild_mast_protokoll_daten`, geschlüsselt nach Mast → Tätigkeit (`taskId`) → `{ protokollId, answers }` (bewusst pro Tätigkeit, nicht pro Vorlage, damit zwei Tätigkeiten mit derselben Protokoll-Vorlage unabhängige Datensätze und unabhängigen Status haben).
   - Formular-Antworten mit `quelle: 'masttafel'` werden automatisch aus der Masttafel-Spalte des aktuellen Masts vorbefüllt.
3. **Fotos-Tab** – Fotos zu diesem Mast aufnehmen/anzeigen (`levelbuild_mast_fotos`).

**Wichtig:** Die Handy-App ist die **einzige** Stelle, an der Tätigkeiten tatsächlich abgehakt und Protokolle ausgefüllt werden – die Desktop-Mast-Detail-Seite zeigt diese Daten nur lesend an (Datensätze-Panel, Abschnitt 7).

---

## 16. PDF-Erzeugung – zwei getrennte Engines

1. **pdf-lib (Overlay-Engine)** – für ausgefüllte Protokoll-PDFs auf Basis einer hochgeladenen Vorlage (Abschnitt 9.2/9.3). Zeichnet Text an frei platzierten X/Y-mm-Koordinaten auf die bestehende PDF-Seite.
2. **jsPDF + jspdf-autoTable (Report-Engine)** – für alle App-eigenen, neu erzeugten Berichte/Formulare ohne hochgeladene Vorlage: Masttafel-Änderungsbericht, Bestellung-PDF. Beide CDN-Libraries werden im `<head>` von `intra.html` geladen; jede Erzeugungsfunktion prüft zuerst `if (!window.jspdf || !window.jspdf.jsPDF) { alert(...); return; }`.

---

## 17. Test-Konvention

Jede Funktions-Erweiterung bekommt eine **jsdom-basierte** Node-Testdatei (`test_*.js`): lädt die **echten** Dateien `app.js`/`intra.html`/`handyapp.js`/`handyapp.html` per `fs.readFileSync`, entfernt `<link rel="stylesheet">`/`<script src>`-Tags, injiziert den echten Code per `<script>`-Element in ein `JSDOM`-Dokument, seedet `localStorage` mit Testdaten unter dem Schema `<key>:67`, prüft über einfache `check(label, cond)`-Assertions und gibt `ALL_CHECKS_PASSED` oder eine Fehlerliste aus. jsPDF/pdf-lib werden bei Bedarf durch minimale Stubs ersetzt (`window.jspdf = { jsPDF: FakeJsPDF }`), die Aufrufe protokollieren statt echte PDFs zu rendern.

---

## 18. Datenfluss-/Verknüpfungsübersicht (Kurzform)

```
Projekt (levelbuild_projekte)
 └─ Bauabschnitt (levelbuild_bauabschnitte)
     └─ Masttafel-Sektion (levelbuild_masttafel_data.sections[bauabschnittId])
         └─ Mast/Standort (rowsByKey[Bauwerksnummer], versioniert)
             ├─ zugeordnete Tätigkeitsliste (levelbuild_mast_taetigkeitsliste)
             │   └─ Tätigkeitsliste-Kopie (levelbuild_taetigkeitslisten_projekt)
             │       └─ Tätigkeit { taetigkeitsartId → Tätigkeitenarten-Kopie,
             │                      protokollIds[] → Protokoll-Kopien,
             │                      statusOptionen }
             ├─ Status je Tätigkeit (levelbuild_mast_aufgaben_status)
             ├─ Abschlussdatum je Tätigkeit (levelbuild_mast_task_abschluss) → Bautagebuch-Ereignis
             ├─ Protokoll-Antworten je Tätigkeit (levelbuild_mast_protokoll_daten)
             │   └─ generiert bei Vollständigkeit → Dokumente-PDF (levelbuild_dokumente)
             ├─ Fotos (levelbuild_mast_fotos)
             └─ referenziert von: Einkaufsposition.standorte, Bautagebuch-Leistung.standorte

Vorlagenbereich (global)
 ├─ Tätigkeitslisten-Vorlage → (Übernehmen) → Projekt-Kopie
 ├─ Protokoll-Vorlage → (Übernehmen) → Projekt-Kopie
 ├─ Tätigkeitenart-Vorlage → (automatisch bei Listen-Übernahme) → Projekt-Kopie
 └─ Lieferant → (Auswahl bei Bestellung) → Schnappschuss in Bestellung

Einkauf
 └─ Einkaufsposition { standorte[] → Mastnummern, bestellungId → Bestellung }
     └─ Bestellung { positionen[] = Schnappschuss, lieferant = Schnappschuss,
                      Bestelldaten-Vorbelegung aus Projekteinstellungen }
         └─ Bestellung-PDF (Logo + gerahmte Kopftabelle + linienlose Positionstabelle)

Leistungsverzeichnis (LV)
 └─ referenziert von Bautagebuch-Leistung (lvArtNr/lvDetailartNr/lvPosNr)

Fertigstellungsliste (rein lesend, aggregiert)
 └─ liest: alle Projekt-Tätigkeitslisten × alle Masten × Zuordnung × Status × Tätigkeitenart
```

---

## 19. Bekannte Vereinfachungen / bewusste Design-Entscheidungen

- Fertigstellungsliste: eine zusammengeführte Spalte kann Tätigkeiten unterschiedlicher Art enthalten; die Art-Filterung ist inklusiv (ODER) statt die Spalte aufzuspalten.
- Handy-App und Web-App synchronisieren sich **nicht über Netzwerk**, sondern rein durch gemeinsames `localStorage` im selben Browser – für einen echten Mehrgeräte-Einsatz bräuchte es ein Backend/eine echte Sync-Schicht (aktuell Prototyp-Stand).
- Der Beschreibungs-basierte Feld-Generator (9.4) ist ein einfacher Muster-/Schlüsselwort-Abgleich, kein echtes Sprachmodell.
- Bestellnummern werden **manuell** vergeben (kein Zähler), Lieferanten sind ein einfacher flacher Stammdatensatz ohne eigenes Vorlage/Projekt-Kopie-Prinzip.
- Es gibt kein echtes Backend, keine Nutzer-/Rechteverwaltung, keine Mehrbenutzer-Synchronisierung – alles läuft rein clientseitig im Browser.
