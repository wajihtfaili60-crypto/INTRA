# Intra

Baustellenmanagement-Web-App (Projekte, Masttafel, Bautagebuch, Leistungsverzeichnis, Dokumente, Protokolle, u.v.m.) mit einer begleitenden Handy-Ansicht.

## Struktur

| Datei | Zweck |
|---|---|
| `intra.html` | die Web-App |
| `handyapp.html` | die Handy-Vorschau (mobile Ansicht) |
| `app.js` | gemeinsame Logik – wird von **beiden** oben gebraucht |
| `firebase-sync.js` | Cloud-Synchronisierung (Firebase Firestore/Auth/Storage) zwischen PC und Handy |
| `style.css` | gemeinsames Grunddesign |
| `handyapp.css` | Zusatzdesign nur für die Handy-App |
| `intra_systemdokumentation.md` | Systemdokumentation |
| `alt-mockups/` | ältere, einzelne Mockup-Seiten aus einer früheren Entwicklungsphase (nicht Teil der aktuellen App, nur zur Referenz) |

Alle Hauptdateien (`intra.html`, `handyapp.html`, `app.js`, `firebase-sync.js`, `style.css`, `handyapp.css`) müssen im selben Ordner bleiben, da sie sich gegenseitig referenzieren.

## Hosting (GitHub Pages)

Nach einem Push landet die App automatisch unter (sobald GitHub Pages in den Repo-Settings aktiviert ist, Quelle: Branch `main`, Ordner `/ (root)`):

- Web-App: `https://wajihtfaili60-crypto.github.io/INTRA/intra.html`
- Handy-Ansicht: `https://wajihtfaili60-crypto.github.io/INTRA/handyapp.html`

## Wichtig

Die App synchronisiert Projektdaten über Firebase (Firestore + Authentication + Storage) zwischen PC- und Handy-App – Login per E-Mail/Passwort. Anmeldedaten für Firebase liegen in `firebase-sync.js`.
