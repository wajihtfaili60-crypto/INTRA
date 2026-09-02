# levelbuild

Baustellenmanagement-Web-App (Projekte, Masttafel, Bautagebuch, Leistungsverzeichnis, Dokumente, Protokolle, u.v.m.) mit einer begleitenden Handy-Ansicht.

## Struktur

| Datei | Zweck |
|---|---|
| `levelbuild.html` | die Web-App |
| `handyapp.html` | die Handy-Vorschau (mobile Ansicht) |
| `app.js` | gemeinsame Logik – wird von **beiden** oben gebraucht |
| `style.css` | gemeinsames Grunddesign |
| `handyapp.css` | Zusatzdesign nur für die Handy-App |
| `levelbuild_systemdokumentation.md` | Systemdokumentation |
| `alt-mockups/` | ältere, einzelne Mockup-Seiten aus einer früheren Entwicklungsphase (nicht Teil der aktuellen App, nur zur Referenz) |

Alle 5 Hauptdateien (`levelbuild.html`, `handyapp.html`, `app.js`, `style.css`, `handyapp.css`) müssen im selben Ordner bleiben, da sie sich gegenseitig referenzieren.

## Hosting (GitHub Pages)

Nach einem Push landet die App automatisch unter (sobald GitHub Pages in den Repo-Settings aktiviert ist, Quelle: Branch `main`, Ordner `/ (root)`):

- Web-App: `https://<dein-github-name>.github.io/levelbuild/levelbuild.html`
- Handy-Ansicht: `https://<dein-github-name>.github.io/levelbuild/handyapp.html`

## Wichtig

Die App speichert aktuell alle Daten nur lokal im Browser (`localStorage`) – kein gemeinsamer Server im Hintergrund. Für echten Mehrbenutzer-Betrieb wäre zusätzlich eine Datenbank nötig.
