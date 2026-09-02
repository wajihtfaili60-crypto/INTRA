// ======================================================================
// Intra Handy-App - eigenständige App-Ansicht, die dieselben
// localStorage-Daten liest/schreibt wie intra.html (dafür wird
// app.js hier ebenfalls eingebunden - alle darin enthaltenen IIFEs sind
// auf bestimmte Element-IDs der Hauptseite gescoped und tun hier einfach
// nichts, nur die obersten Konstanten/Funktionen wie MASTTAFEL_STATE_KEY,
// loadBauabschnitte(), loadTlProjectList(), loadProtokollProjectList(),
// loadMastTlAssignments() usw. werden tatsächlich gebraucht).
// ======================================================================
(function () {
  'use strict';

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function normalize(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }
  // Für die "Importierte Dokumente"-Liste im Fotos & Dokumente-Tab (siehe
  // renderMastTabFotos/renderElTabFotos unten) - Dokumente, die per
  // Datenpfad-Import (Desktop-Seite, Projekteinstellungen > Dokumentenordner)
  // automatisch hinterlegt wurden. Hier nur lesend/anzeigend, kein Hinzufügen/
  // Löschen von der Handy-App aus.
  function fmtBytesHa(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtDatumKurzHa(iso) {
    const s = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  }
  // Nutzer-Feedback: "Das Wichtige ist aber das er es anzeigt wirklich in
  // der App öffnet ... und nicht nur zum Download bereitstellt" - die
  // Zeilen sind deshalb keine <a href download>-Links mehr, sondern öffnen
  // per Klick den Dokument-Viewer (siehe openDpDocViewer() unten), der
  // Bilder/PDFs direkt anzeigt. data-dp-doc-idx verweist auf die Position
  // im docs-Array, das der jeweilige Aufrufer (renderMastTabFotos/
  // renderElTabFotos) nach dem Setzen von innerHTML zum Verdrahten nutzt.
  function importierteDokumenteHtml(docs) {
    if (!docs || !docs.length) return '';
    return `<div class="ha-dp-doc-heading">Importierte Dokumente</div>
      <div class="ha-dp-doc-list">${docs.map((d, i) => `
        <div class="ha-dp-doc-row" data-dp-doc-idx="${i}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div class="ha-dp-doc-meta">
            <span class="ha-dp-doc-name">${esc(d.name)} · ${esc(d.typ)}</span>
            <span class="ha-dp-doc-sub">${fmtBytesHa(d.size)} · ${fmtDatumKurzHa(d.attachedAt)}</span>
          </div>
        </div>`).join('')}</div>`;
  }
  // Zeigt ein importiertes Dokument direkt in der App an, statt es nur zum
  // Download anzubieten: Bilder als <img>, PDFs eingebettet als <iframe> auf
  // die data:-URL (funktioniert in Chrome/Edge nativ, ohne pdf.js). Für
  // Dateitypen, die ein Browser nicht selbst darstellen kann (z. B. .dwg),
  // bleibt der Download als Fallback-Aktion oben rechts erhalten.
  function openDpDocViewer(doc) {
    if (!doc) return;
    const overlay = document.getElementById('ha-overlay-dokument');
    if (!overlay) return;
    const titleEl = document.getElementById('ha-dok-viewer-title');
    const bodyEl = document.getElementById('ha-dok-viewer-body');
    const downloadBtn = document.getElementById('ha-dok-viewer-download');
    if (titleEl) titleEl.textContent = doc.name;
    if (downloadBtn) {
      downloadBtn.href = doc.url;
      downloadBtn.setAttribute('download', doc.name || 'Dokument');
    }
    const mime = String(doc.mime || '');
    let inner;
    if (mime.startsWith('image/')) {
      inner = `<img src="${doc.url}" alt="${esc(doc.name)}">`;
    } else if (mime === 'application/pdf') {
      inner = `<iframe src="${doc.url}" title="${esc(doc.name)}"></iframe>`;
    } else {
      inner = `<div class="ha-dok-viewer-unsupported">Dieser Dateityp lässt sich nicht direkt in der App anzeigen - bitte über das Download-Symbol oben rechts öffnen.</div>`;
    }
    if (bodyEl) bodyEl.innerHTML = inner;
    overlay.hidden = false;
  }
  function wireDpDocRows(root, docs) {
    if (!root || !docs) return;
    root.querySelectorAll('[data-dp-doc-idx]').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-dp-doc-idx'));
        openDpDocViewer(docs[idx]);
      });
    });
  }
  const dokViewerCloseBtn = document.getElementById('ha-dok-viewer-close');
  if (dokViewerCloseBtn) {
    dokViewerCloseBtn.addEventListener('click', () => {
      const overlay = document.getElementById('ha-overlay-dokument');
      if (overlay) overlay.hidden = true;
      // Ein laufendes PDF-<iframe> soll nicht im Hintergrund weiterleben -
      // Inhalt leeren, sobald der Viewer geschlossen wird.
      const bodyEl = document.getElementById('ha-dok-viewer-body');
      if (bodyEl) bodyEl.innerHTML = '';
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // Berechnet den Vorbefüllungs-Wert für eine bestimmte Zeile einer
  // Tabellen-Spalte - identische Kopie der Funktion aus app.js (dort im
  // Protokoll-Editor gescoped), da handyapp.js eine eigene Datei ohne
  // gemeinsamen Scope ist.
  function tabellePrefillValue(prefill, rowIdx) {
    if (!prefill || !prefill.mode || prefill.mode === 'keine') return '';
    if (prefill.mode === 'text') return prefill.text || '';
    if (prefill.mode === 'fortlaufend') {
      const start = Number(prefill.start);
      const schritt = Number(prefill.schritt);
      const s = isNaN(start) ? 1 : start;
      const st = isNaN(schritt) ? 1 : schritt;
      return String(s + rowIdx * st);
    }
    if (prefill.mode === 'liste') {
      const werte = String(prefill.liste || '').split(/\r?\n/).map((x) => x.trim());
      return werte[rowIdx] || '';
    }
    return '';
  }
  // Migriert/normalisiert b.optionen bei Checkbox-Bausteinen - identische
  // Kopie der Funktion aus app.js (dort im Protokoll-Editor gescoped).
  // Ältere, noch im alten Ja/Nein-Bool-Format gespeicherte Checkbox-
  // Bausteine haben kein b.optionen -> Standard-Optionen anlegen.
  function syncCheckboxOptionen(b) {
    if (!Array.isArray(b.optionen) || !b.optionen.length) {
      b.optionen = [{ id: 'opt-ja', label: 'Ja', folgefeld: null }, { id: 'opt-nein', label: 'Nein', folgefeld: null }];
    }
  }
  // Baut das Eingabefeld für die Folgefrage einer einzelnen Checkbox-Option
  // (erscheint nur, wenn diese Option angekreuzt ist) - unterstützt dieselben
  // 4 einfachen Feldtypen wie im Editor (Text/Zahl/Datum/Auswahl).
  function checkboxFolgeInputHtml(b, opt) {
    const f = opt.folgefeld;
    const ffKey = b.id + '__ff__' + opt.id;
    const ffSaved = protokollFormState.answers[ffKey];
    const ffReq = f.required ? ' <span class="ha-field-req">*</span>' : '';
    let ffLabel = esc(f.label);
    if (f.type === 'zahl' && f.einheit) ffLabel += ` (${esc(f.einheit)})`;
    let inputHtml = '';
    if (f.type === 'text') {
      const val = ffSaved != null ? ffSaved : (f.standardwert || '');
      inputHtml = `<input type="text" data-checkbox-folge-input="${ffKey}" value="${esc(val)}">`;
    } else if (f.type === 'zahl') {
      const val = ffSaved != null ? ffSaved : (f.standardwert || '');
      inputHtml = `<input type="number" data-checkbox-folge-input="${ffKey}" value="${esc(val)}">`;
    } else if (f.type === 'datum') {
      const val = ffSaved != null ? ffSaved : (f.standardwert === 'heute' ? todayIso() : '');
      inputHtml = `<input type="date" data-checkbox-folge-input="${ffKey}" value="${esc(val)}">`;
    } else if (f.type === 'auswahl') {
      const val = ffSaved != null ? ffSaved : (f.standardwert || '');
      inputHtml = `<select data-checkbox-folge-input="${ffKey}">
        <option value=""${!val ? ' selected' : ''}>Bitte wählen...</option>
        ${(f.choices || []).map((c) => `<option value="${esc(c)}"${val === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>`;
    }
    const ffHint = f.hilfetext ? `<div class="ha-field-hint">${esc(f.hilfetext)}</div>` : '';
    return `<div class="ha-checkbox-folge">
      <div class="ha-field-label">${ffLabel}${ffReq}</div>
      ${inputHtml}
      ${ffHint}
    </div>`;
  }

  // In-App-Sicherheitsabfrage statt window.confirm(): der native Browser-
  // Dialog wird in manchen Vorschau-/Webview-Kontexten (z.B. eingebettet in
  // einem Fenster ohne Dialog-Erlaubnis) gar nicht erst angezeigt oder
  // sofort automatisch weggeklickt - dann kommt die Abfrage aus Nutzersicht
  // "nie". Ein eigener, im DOM der App selbst gerenderter Dialog ist immer
  // sichtbar, unabhängig vom Ausführungskontext.
  function showAppConfirm(message, onConfirm) {
    const backdrop = document.getElementById('ha-confirm-backdrop');
    const msgEl = document.getElementById('ha-confirm-message');
    const okBtn = document.getElementById('ha-confirm-ok');
    const cancelBtn = document.getElementById('ha-confirm-cancel');
    if (!backdrop || !msgEl || !okBtn || !cancelBtn) { if (onConfirm) onConfirm(); return; }
    msgEl.textContent = message;
    backdrop.hidden = false;
    function cleanup() {
      backdrop.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onOk() { cleanup(); if (onConfirm) onConfirm(); }
    function onCancel() { cleanup(); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  }
  // Reine Hinweis-Meldung (nur ein "OK", kein "Abbrechen") - genutzt z.B. um
  // fehlende Pflichtfelder vor dem Speichern zu melden.
  function showAppAlert(message) {
    const backdrop = document.getElementById('ha-confirm-backdrop');
    const msgEl = document.getElementById('ha-confirm-message');
    const okBtn = document.getElementById('ha-confirm-ok');
    const cancelBtn = document.getElementById('ha-confirm-cancel');
    if (!backdrop || !msgEl || !okBtn || !cancelBtn) { return; }
    msgEl.textContent = message;
    cancelBtn.hidden = true;
    okBtn.textContent = 'OK';
    backdrop.hidden = false;
    function cleanup() {
      backdrop.hidden = true;
      cancelBtn.hidden = false;
      okBtn.textContent = 'Fortfahren';
      okBtn.removeEventListener('click', onOk);
    }
    function onOk() { cleanup(); }
    okBtn.addEventListener('click', onOk);
  }

  // Same flattening/label logic as the Mast-Detail page on the Hauptseite
  // (app.js), copied here since it lives inside a private IIFE there.
  function stripUnitSuffix(label) {
    const parts = String(label || '').split(' – ');
    if (parts.length <= 1) return label || '';
    const last = parts[parts.length - 1].trim();
    const isUnit = /^(mm|cm|dm|km|m|kg|g|t|°|%|st\.?|stk\.?)(\s?x\s?(mm|cm|m))?\.?$/i.test(last);
    return isUnit ? parts.slice(0, -1).join(' – ') : label;
  }
  function groupColumns(columns) {
    const groups = [];
    (columns || []).forEach((col, i) => {
      const last = groups[groups.length - 1];
      if (last && last.label === col.label) last.idxs.push(i);
      else groups.push({ label: col.label, idxs: [i] });
    });
    return groups;
  }

  // Same Baustein-Typ-Konstanten wie im Protokolle-Editor (dort privat in
  // einer IIFE) - hier dupliziert, um die echten Eingabefelder rendern zu
  // können.
  // Checkbox ist seit den mehreren einzeln ankreuzbaren Optionen (siehe
  // syncCheckboxOptionen weiter unten) hier bewusst nicht mehr enthalten -
  // eine einzelne Tabellenzelle lässt sich nicht sinnvoll auf mehrere
  // unabhängige Checkboxen abbilden.
  const SOURCEABLE_TYPES = ['text', 'zahl', 'datum', 'auswahl'];
  const FOLGEFELD_TYPE_LABELS = { text: 'Textfeld', zahl: 'Zahl', datum: 'Datum', auswahl: 'Auswahl' };
  const LOCK_SVG_SMALL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  // ---------- Masttafel-Daten lesen (gleiches Format wie MASTTAFEL_STATE_KEY) ----------
  function readMasttafelSections() {
    let saved;
    const key = (typeof pKey === 'function') ? pKey(MASTTAFEL_STATE_KEY) : MASTTAFEL_STATE_KEY;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.sections) return {};
    const out = {};
    Object.keys(saved.sections).forEach((id) => {
      const sec = saved.sections[id] || {};
      out[id] = { columns: sec.columns || [], rows: new Map(sec.rowsByKey || []) };
    });
    return out;
  }
  function allMastRows() {
    const sections = readMasttafelSections();
    const bauabschnitte = (typeof loadBauabschnitte === 'function') ? loadBauabschnitte() : [];
    const rows = [];
    Object.keys(sections).forEach((id) => {
      const ba = bauabschnitte.find((b) => b.id === id);
      const baName = ba ? ba.name : id;
      const sec = sections[id];
      sec.rows.forEach((entry, key) => {
        rows.push({
          mastKey: key,
          displayKey: entry.displayKey || key,
          currentIndex: entry.currentIndex || null,
          bauabschnittId: id,
          bauabschnittName: baName,
          columns: sec.columns,
          versions: entry.versions || [],
        });
      });
    });
    return rows;
  }

  // ---------- App-Status ----------
  const state = {
    selectedProjekt: null,
    bauabschnittFilter: '__all__',
    searchTerm: '',
    currentMast: null,
    currentVersion: null,
    // Nutzer-Wunsch (Folgeturn 8): eigener, von der Masttafel unabhängiger
    // Zustand für die generische Elemente-Liste/-Detail-Ansicht - bewusst
    // getrennte Felder statt Wiederverwendung der obigen (currentMast etc.),
    // damit beide Bereiche sich niemals gegenseitig überschreiben können.
    currentSammlung: null,
    elBauabschnittFilter: '__all__',
    elSearchTerm: '',
    currentElement: null,
    currentElVersion: null,
  };

  function showScreen(id) {
    document.querySelectorAll('.ha-screen').forEach((el) => el.classList.toggle('active', el.id === id));
  }
  document.querySelectorAll('[data-ha-back]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.getAttribute('data-ha-back')));
  });

  // ======================================================================
  // Screen 1: Projekte-Auswahl - liest die ECHTE, persistierte Projektliste
  // (loadProjects()/PROJECTS_KEY, definiert in app.js, das vor dieser Datei
  // eingebunden wird - siehe Kommentar oben) statt einer eigenen, fest
  // hardcodierten Kopie. Vorher stand hier eine eigene DEMO_PROJECTS-
  // Konstante mit genau den vier ursprünglichen Demo-Projekten - dadurch
  // tauchten auf der Hauptseite neu angelegte (oder dort umbenannte/
  // gelöschte) Projekte auf dieser Handy-Vorschau NIE auf, auch nicht nach
  // einem Neuladen, weil die Liste selbst nie aus dem localStorage kam.
  // ======================================================================
  function statusBadgeHtml(status) {
    if (status === 'active') return '<span class="ha-badge ha-badge-active">● Aktiv</span>';
    if (status === 'paused') return '<span class="ha-badge ha-badge-paused">● Pausiert</span>';
    return '<span class="ha-badge ha-badge-done">● Abgeschlossen</span>';
  }
  function chevronSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
  }
  function renderProjekteList() {
    const el = document.getElementById('ha-projekte-list');
    if (!el) return;
    const projects = (typeof loadProjects === 'function') ? loadProjects() : [];
    el.innerHTML = projects.map((p) => `
      <div class="ha-list-row" data-open-projekt="${esc(p.nr)}">
        <div class="ha-list-row-main">
          <div class="ha-list-row-title">${esc(p.nr)} - ${esc(p.name)}</div>
          <div class="ha-list-row-sub">Masttafel</div>
        </div>
        ${statusBadgeHtml(p.status)}
        <span class="ha-list-row-chev">${chevronSvg()}</span>
      </div>`).join('');
    el.querySelectorAll('[data-open-projekt]').forEach((row) => {
      row.addEventListener('click', () => openProjekt(row.getAttribute('data-open-projekt')));
    });
  }
  function openProjekt(nr) {
    const nrStr = String(nr);
    const projects = (typeof loadProjects === 'function') ? loadProjects() : [];
    const p = projects.find((x) => String(x.nr) === nrStr) || projects[0];
    if (!p) return;
    // Setzt dasselbe "aktuelles Projekt" wie die Hauptseite (siehe pKey()/
    // currentProjectId() in app.js) - ab hier lesen/schreiben alle
    // gemeinsam genutzten load*/save*-Funktionen (Masttafel, Bauabschnitte,
    // Tätigkeitslisten/Protokolle im Projekt, Mast-Zuordnungen usw.) den zu
    // diesem einen Projekt gehörenden Datensatz statt eines globalen.
    if (typeof setCurrentProjectId === 'function') setCurrentProjectId(p.nr);
    state.selectedProjekt = p;
    state.bauabschnittFilter = '__all__';
    state.searchTerm = '';
    const titleEl = document.getElementById('ha-mt-projekt-name');
    if (titleEl) titleEl.textContent = `${p.nr} - ${p.name}`;
    const searchEl = document.getElementById('ha-mt-search');
    if (searchEl) searchEl.value = '';
    // Nutzer-Wunsch (Folgeturn 8): "die App hat dann in einem Projekt
    // natürlich die Option die verschiedenen Elementlisten aufzumachen ...
    // momentan öffnet sich ja immer direkt die Masttafel" - statt hier
    // sofort in die Masttafel-Liste zu springen, zeigt sich jetzt erst die
    // Elemente-Auswahl (Masttafel + alle anderen Elementensammlungen des
    // Projekts). Ein Klick auf "Masttafel" dort führt weiterhin unverändert
    // zu renderMasttafelScreen()/ha-screen-masttafel (siehe renderElementeScreen).
    const elProjektTitleEl = document.getElementById('ha-el-projekt-name');
    if (elProjektTitleEl) elProjektTitleEl.textContent = `${p.nr} - ${p.name}`;
    state.elBauabschnittFilter = '__all__';
    state.elSearchTerm = '';
    renderElementeScreen();
    showScreen('ha-screen-elemente');
  }

  // ======================================================================
  // Screen 1b: Elemente-Auswahl - Liste aller Elementensammlungen dieses
  // Projekts (Masttafel immer zuerst, fest eingebaut, siehe
  // loadElementensammlungen() in app.js). Tippen auf Masttafel führt zum
  // unveränderten, bestehenden Masttafel-Screen; Tippen auf eine andere
  // Sammlung zur neuen, generischen Elemente-Liste.
  // ======================================================================
  function elementensammlungSubtitle(s) {
    if (s.type === 'masttafel') return 'Mastdaten (xlsx/PDF-Import)';
    const map = (typeof loadElementDaten === 'function') ? loadElementDaten() : {};
    const entry = map[s.id];
    const bauabschnitte = (typeof loadBauabschnitte === 'function') ? loadBauabschnitte() : [];
    let rowCount = 0;
    if (entry && entry.sections) {
      bauabschnitte.forEach((b) => {
        const sec = entry.sections[b.id];
        if (sec) rowCount += (sec.rowsByKey || []).length;
      });
    }
    const colCount = (s.columns || []).length;
    return `${colCount} Spalte${colCount === 1 ? '' : 'n'} · ${rowCount} Zeile${rowCount === 1 ? '' : 'n'}`;
  }
  function renderElementeScreen() {
    const el = document.getElementById('ha-el-list');
    if (!el) return;
    const sammlungen = (typeof loadElementensammlungen === 'function') ? loadElementensammlungen() : [];
    el.innerHTML = sammlungen.map((s) => `
      <div class="ha-list-row" data-open-sammlung="${esc(s.id)}">
        <div class="ha-list-row-main">
          <div class="ha-list-row-title">${esc(s.name)}</div>
          <div class="ha-list-row-sub">${esc(elementensammlungSubtitle(s))}</div>
        </div>
        <span class="ha-list-row-chev">${chevronSvg()}</span>
      </div>`).join('');
    el.querySelectorAll('[data-open-sammlung]').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-open-sammlung');
        const sammlung = sammlungen.find((s) => s.id === id);
        if (!sammlung) return;
        if (sammlung.type === 'masttafel') {
          renderMasttafelScreen();
          showScreen('ha-screen-masttafel');
          return;
        }
        openElementeSammlung(sammlung);
      });
    });
  }

  // ======================================================================
  // Screen 1c: Elemente-Liste - generische Einträge-Liste einer
  // Nicht-Masttafel-Elementensammlung. Liest ELEMENT_DATEN_KEY (siehe
  // app.js), flacht alle Bauabschnitte zu einer gemeinsamen, filterbaren
  // Liste ab - gleiches UI-Muster wie renderMasttafelScreen oben, aber
  // datengetrieben über sammlung.columns statt hart codierter Mastdaten-Felder.
  // ======================================================================
  function allElementRows(sammlung) {
    const map = (typeof loadElementDaten === 'function') ? loadElementDaten() : {};
    const entry = map[sammlung.id];
    const bauabschnitte = (typeof loadBauabschnitte === 'function') ? loadBauabschnitte() : [];
    const rows = [];
    if (entry && entry.sections) {
      Object.keys(entry.sections).forEach((baId) => {
        const ba = bauabschnitte.find((b) => b.id === baId);
        const baName = ba ? ba.name : baId;
        const sec = entry.sections[baId] || {};
        (sec.rowsByKey || []).forEach((pair) => {
          const key = pair[0];
          const rowEntry = pair[1];
          rows.push({
            sammlungId: sammlung.id,
            rowKey: key,
            displayKey: rowEntry.displayKey || key,
            bauabschnittId: baId,
            bauabschnittName: baName,
            columns: sammlung.columns || [],
            versions: rowEntry.versions || [],
          });
        });
      });
    }
    return rows;
  }
  function openElementeSammlung(sammlung) {
    state.currentSammlung = sammlung;
    state.elBauabschnittFilter = '__all__';
    state.elSearchTerm = '';
    const titleEl = document.getElementById('ha-el-liste-sammlung-name');
    if (titleEl) titleEl.textContent = sammlung.name;
    const searchEl = document.getElementById('ha-el-liste-search');
    if (searchEl) searchEl.value = '';
    renderElListeScreen();
    showScreen('ha-screen-el-liste');
  }
  function renderElListeBauabschnittChips(rows) {
    const el = document.getElementById('ha-el-liste-bauabschnitt-chips');
    if (!el) return;
    const seen = new Map();
    rows.forEach((r) => { if (!seen.has(r.bauabschnittId)) seen.set(r.bauabschnittId, r.bauabschnittName); });
    if (seen.size <= 1) { el.innerHTML = ''; return; }
    const chips = [{ id: '__all__', name: 'Alle' }].concat([...seen.entries()].map(([id, name]) => ({ id, name })));
    el.innerHTML = chips.map((c) => `<span class="ha-chip${state.elBauabschnittFilter === c.id ? ' active' : ''}" data-ha-el-chip="${esc(c.id)}">${esc(c.name)}</span>`).join('');
    el.querySelectorAll('[data-ha-el-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.elBauabschnittFilter = chip.getAttribute('data-ha-el-chip');
        renderElListeScreen();
      });
    });
  }
  function renderElListeScreen() {
    if (!state.currentSammlung) return;
    const rows = allElementRows(state.currentSammlung);
    renderElListeBauabschnittChips(rows);
    const term = state.elSearchTerm.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (state.elBauabschnittFilter !== '__all__' && r.bauabschnittId !== state.elBauabschnittFilter) return false;
      if (term && !String(r.displayKey).toLowerCase().includes(term)) return false;
      return true;
    }).sort((a, b) => String(a.displayKey).localeCompare(String(b.displayKey), 'de', { numeric: true }));

    const listEl = document.getElementById('ha-el-liste-list');
    const emptyEl = document.getElementById('ha-el-liste-empty');
    if (emptyEl) emptyEl.hidden = rows.length > 0;
    if (!listEl) return;
    if (!rows.length) { listEl.innerHTML = ''; return; }
    if (!filtered.length) { listEl.innerHTML = '<div class="ha-empty">Keine Treffer für diese Suche/diesen Filter.</div>'; return; }
    listEl.innerHTML = filtered.map((r) => `
      <div class="ha-list-row" data-open-element="${esc(r.rowKey)}" data-ba="${esc(r.bauabschnittId)}">
        <div class="ha-list-row-main">
          <div class="ha-list-row-title">${esc(r.displayKey)}</div>
          <div class="ha-list-row-sub">${esc(r.bauabschnittName)} · ${r.versions.length} Version${r.versions.length === 1 ? '' : 'en'}</div>
        </div>
        <span class="ha-list-row-chev">${chevronSvg()}</span>
      </div>`).join('');
    listEl.querySelectorAll('[data-open-element]').forEach((row) => {
      row.addEventListener('click', () => openElement(row.getAttribute('data-open-element'), row.getAttribute('data-ba')));
    });
  }
  const elListeSearchInput = document.getElementById('ha-el-liste-search');
  if (elListeSearchInput) {
    elListeSearchInput.addEventListener('input', () => {
      state.elSearchTerm = elListeSearchInput.value;
      renderElListeScreen();
    });
  }

  // ======================================================================
  // Screen 1d: Element-Detail mit 3 Tabs (Datensätze/Tätigkeitsliste/Fotos)
  // - generisches Gegenstück zur Mast-Detail-Seite (Screen 3 unten), für
  // Einträge einer Nicht-Masttafel-Elementensammlung. Tätigkeitsliste-
  // Zuordnung/Status und Fotos nutzen die parallelen, generischen Stores
  // (siehe app.js: ELEMENT_TL_ASSIGNMENT_KEY usw.) statt der Masttafel-
  // eigenen - die Masttafel-Datenmodelle/-Seiten bleiben unangetastet.
  // ======================================================================
  function openElement(rowKey, bauabschnittId) {
    if (!state.currentSammlung) return;
    const rows = allElementRows(state.currentSammlung);
    const row = rows.find((r) => r.rowKey === rowKey && r.bauabschnittId === bauabschnittId) || rows.find((r) => r.rowKey === rowKey);
    if (!row) return;
    state.currentElement = row;
    state.currentElVersion = row.versions.length ? row.versions[row.versions.length - 1].version : null;

    const titleEl = document.getElementById('ha-el-detail-title');
    const subEl = document.getElementById('ha-el-detail-sub');
    if (titleEl) titleEl.textContent = row.displayKey;
    if (subEl) subEl.textContent = row.bauabschnittName;

    document.querySelectorAll('.ha-el-tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-ha-el-tab') === 'datensaetze'));
    document.querySelectorAll('#ha-screen-el-detail .ha-tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'ha-el-tabpanel-datensaetze'));

    renderElTabDatensaetze();
    renderElTabTaetigkeitsliste();
    renderElTabFotos();
    showScreen('ha-screen-el-detail');
  }
  document.querySelectorAll('.ha-el-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-ha-el-tab');
      document.querySelectorAll('.ha-el-tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('#ha-screen-el-detail .ha-tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'ha-el-tabpanel-' + name));
    });
  });

  // ---- Tab 1: Datensätze (feste Spalten + Versions-Chips, wie Masttafel-Tab) ----
  function renderElTabDatensaetze() {
    const el = document.getElementById('ha-el-tabpanel-datensaetze');
    if (!el || !state.currentElement) return;
    const row = state.currentElement;
    const versions = row.versions;
    if (!versions.length) { el.innerHTML = '<div class="ha-empty">Keine Versionsdaten vorhanden.</div>'; return; }
    const latestVersion = versions[versions.length - 1].version;
    const selected = state.currentElVersion || latestVersion;
    const v = versions.find((x) => x.version === selected) || versions[versions.length - 1];
    const prev = versions.find((x) => x.version === selected - 1);
    const isLatest = selected === latestVersion;
    const chips = versions.map((x) => `<span class="ha-ver-chip${x.version === selected ? ' active' : ''}" data-goto-el-version="${x.version}">v${x.version}${x.version === latestVersion ? ' (aktuell)' : ''}</span>`).join('');

    const fields = (row.columns || []).map((c) => {
      const val = v.values[c.idx];
      const changed = !!prev && normalize(prev.values[c.idx]) !== normalize(v.values[c.idx]);
      return `<div class="ha-stat-card${changed ? ' changed' : ''}">
        <div class="ha-stat-card-label">${esc(c.label)}</div>
        <div class="ha-stat-card-value${val ? '' : ' empty'}">${val ? esc(val) : '–'}</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="ha-stat-card"><div class="ha-stat-card-label">Version</div><div class="ha-stat-card-value">v${selected}${isLatest ? ' (aktuell)' : ''}</div></div>
      ${versions.length > 1 ? `<div class="ha-ver-chip-row">${chips}</div>` : ''}
      ${fields}
    `;
    el.querySelectorAll('[data-goto-el-version]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.currentElVersion = parseInt(chip.getAttribute('data-goto-el-version'), 10);
        renderElTabDatensaetze();
      });
    });
  }

  // ---- Tab 2: Tätigkeitsliste (Status-Zuordnung/-Verfolgung wie bei der
  // Masttafel, siehe cycleTaskStatus/applyTaskAbschluss oben - hier über die
  // parallelen ELEMENT_*-Stores. Das eigentliche Protokoll-AUSFÜLLEN
  // (Formular mit Bausteinen/Unterschrift/Foto-Feldern) ist für generische
  // Elemente in diesem Schritt bewusst noch NICHT abgebildet - dafür
  // erscheint bei entsprechend markierten Aufgaben ein Hinweis statt einer
  // funktionslosen Karte, damit klar bleibt, was hier (noch) fehlt.) ----
  function currentElTlList() {
    if (!state.currentElement || !state.currentSammlung) return null;
    const assignments = (typeof loadElementTlAssignments === 'function') ? loadElementTlAssignments() : {};
    const listId = (assignments[state.currentSammlung.id] || {})[state.currentElement.rowKey];
    if (!listId) return null;
    const lists = (typeof loadTlProjectList === 'function') ? loadTlProjectList() : [];
    return lists.find((l) => l.id === listId) || null;
  }
  function cycleElTaskStatus(list, taskId) {
    const task = (list.tasks || []).find((t) => t.id === taskId);
    const statusOpts = taskStatusOptions(task, list);
    if (!statusOpts.length) return;
    const sammlungId = state.currentSammlung.id;
    const rowKey = state.currentElement.rowKey;
    const all = loadElementTaskStatus();
    all[sammlungId] = all[sammlungId] || {};
    const forRow = all[sammlungId][rowKey] || {};
    const currentId = forRow[taskId] || (statusOpts[0] && statusOpts[0].id);
    const idx = statusOpts.findIndex((s) => s.id === currentId);
    const next = statusOpts[(idx + 1) % statusOpts.length];
    forRow[taskId] = next.id;
    all[sammlungId][rowKey] = forRow;
    saveElementTaskStatus(all);
    applyElTaskAbschluss(sammlungId, rowKey, task, list, isStatusErledigt(next));
    renderElTabTaetigkeitsliste();
  }
  // Wie applyTaskAbschluss() oben, aber generisch (ELEMENT_TASK_ABSCHLUSS_KEY,
  // zusätzlich unter sammlungId genestet) - inkl. derselben automatischen
  // Bautagebuch-Ereignis-Erzeugung beim ersten Wechsel auf "erledigt".
  function applyElTaskAbschluss(sammlungId, rowKey, task, list, done) {
    if (!sammlungId || !rowKey || !task || typeof loadElementTaskAbschluss !== 'function') return;
    const all = loadElementTaskAbschluss();
    all[sammlungId] = all[sammlungId] || {};
    const forRow = all[sammlungId][rowKey] || {};
    if (done) {
      const already = !!forRow[task.id];
      forRow[task.id] = { datum: (typeof todayIsoDate === 'function') ? todayIsoDate() : '' };
      all[sammlungId][rowKey] = forRow;
      saveElementTaskAbschluss(all);
      if (!already && typeof pushEreignisFuerHeute === 'function') {
        const elLabel = (state.currentElement && state.currentElement.displayKey) || rowKey;
        const sammlungName = (state.currentSammlung && state.currentSammlung.name) || '';
        pushEreignisFuerHeute(
          `Tätigkeit abgeschlossen: ${task.titel || '(ohne Titel)'}`,
          `${sammlungName}${sammlungName ? ' · ' : ''}${elLabel}${list && list.name ? ' · ' + list.name : ''}`
        );
      }
    } else if (forRow[task.id]) {
      delete forRow[task.id];
      all[sammlungId][rowKey] = forRow;
      saveElementTaskAbschluss(all);
    }
  }
  function renderElTabTaetigkeitsliste() {
    const el = document.getElementById('ha-el-tabpanel-taetigkeitsliste');
    if (!el || !state.currentElement || !state.currentSammlung) return;
    const list = currentElTlList();
    if (!list) {
      el.innerHTML = '<div class="ha-empty">Diesem Eintrag ist noch keine Tätigkeitsliste zugeordnet - das lässt sich auf der Hauptseite unter Elemente mit der Mehrfachauswahl einstellen.</div>';
      return;
    }
    if (!list.tasks.length) {
      el.innerHTML = '<div class="ha-empty">Diese Tätigkeitsliste hat noch keine Aufgaben.</div>';
      return;
    }
    const sammlungId = state.currentSammlung.id;
    const rowKey = state.currentElement.rowKey;
    const statusMap = ((loadElementTaskStatus()[sammlungId] || {})[rowKey]) || {};
    el.innerHTML = list.tasks.map((t) => {
      const statusOpts = taskStatusOptions(t, list);
      const statusId = statusMap[t.id] || (statusOpts[0] && statusOpts[0].id);
      const status = statusOpts.find((s) => s.id === statusId) || statusOpts[0];
      const metaParts = [];
      if (t.rolle) metaParts.push(t.rolle);
      if (t.fristTage != null && t.fristTage !== '') metaParts.push(`Frist ${t.fristTage} Tage`);
      const protokollHint = t.dokuArt === 'protokoll'
        ? '<div class="ha-task-warning">Protokoll-Ausfüllen wird für Elementensammlungen (außerhalb der Masttafel) hier noch nicht unterstützt - der Status lässt sich aber weiterhin manuell setzen.</div>'
        : '';
      return `<div class="ha-task-card" data-task-id="${esc(t.id)}">
        <div class="ha-task-top">
          <div>
            <div class="ha-task-title">${t.nr != null ? esc(String(t.nr)) + '. ' : ''}${esc(t.titel || '(ohne Titel)')}</div>
            ${metaParts.length ? `<div class="ha-task-meta">${esc(metaParts.join(' · '))}</div>` : ''}
          </div>
          ${statusPillHtml(status)}
        </div>
        ${protokollHint}
      </div>`;
    }).join('');
    el.querySelectorAll('[data-cycle-status]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.ha-task-card');
        cycleElTaskStatus(list, card.getAttribute('data-task-id'));
      });
    });
  }

  // ---- Tab 3: Fotos & Dokumente (wie Masttafel-Tab, siehe renderMastTabFotos/
  // openLightbox unten - hier über ELEMENT_FOTOS_KEY statt MAST_FOTOS_KEY,
  // die Lightbox-Overlay-Elemente im DOM werden für beide gemeinsam genutzt) ----
  function renderElTabFotos() {
    const el = document.getElementById('ha-el-tabpanel-fotos');
    if (!el || !state.currentElement || !state.currentSammlung) return;
    const sammlungId = state.currentSammlung.id;
    const rowKey = state.currentElement.rowKey;
    const bauabschnittId = state.currentElement.bauabschnittId;
    const fotos = ((loadElementFotos()[sammlungId] || {})[rowKey]) || [];
    const dpDocs = (typeof getElementDatenpfadDokumente === 'function') ? getElementDatenpfadDokumente(sammlungId, bauabschnittId, rowKey) : [];
    el.innerHTML = `
      <button type="button" class="ha-add-photo-btn" id="ha-el-add-photo-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Foto oder Dokument hinzufügen
      </button>
      <input type="file" accept="image/*" data-el-photo-input hidden>
      ${fotos.length ? `<div class="ha-gallery">${fotos.map((f) => `<div class="ha-photo-thumb" data-el-photo-id="${esc(f.id)}"><img src="${f.dataUrl}" alt="${esc(f.name || '')}"></div>`).join('')}</div>` : '<div class="ha-empty">Noch keine Fotos oder Dokumente für diesen Eintrag.</div>'}
      ${importierteDokumenteHtml(dpDocs)}
    `;
    const addBtn = el.querySelector('#ha-el-add-photo-btn');
    const fileInput = el.querySelector('[data-el-photo-input]');
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const all = loadElementFotos();
        all[sammlungId] = all[sammlungId] || {};
        const list = all[sammlungId][rowKey] || [];
        list.push({ id: makeMastDataId('foto'), dataUrl: reader.result, name: file.name, addedAt: new Date().toISOString() });
        all[sammlungId][rowKey] = list;
        saveElementFotos(all);
        renderElTabFotos();
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
    el.querySelectorAll('[data-el-photo-id]').forEach((thumb) => {
      thumb.addEventListener('click', () => openElLightbox(thumb.getAttribute('data-el-photo-id')));
    });
    wireDpDocRows(el, dpDocs);
  }
  function openElLightbox(photoId) {
    const sammlungId = state.currentSammlung.id;
    const rowKey = state.currentElement.rowKey;
    const list = ((loadElementFotos()[sammlungId] || {})[rowKey]) || [];
    const foto = list.find((f) => f.id === photoId);
    if (!foto) return;
    document.getElementById('ha-lightbox-img').src = foto.dataUrl;
    const overlay = document.getElementById('ha-overlay-lightbox');
    overlay.hidden = false;
    const deleteBtn = document.getElementById('ha-lightbox-delete');
    deleteBtn.onclick = () => {
      const all2 = loadElementFotos();
      all2[sammlungId] = all2[sammlungId] || {};
      all2[sammlungId][rowKey] = (all2[sammlungId][rowKey] || []).filter((f) => f.id !== photoId);
      saveElementFotos(all2);
      overlay.hidden = true;
      renderElTabFotos();
    };
  }

  // ======================================================================
  // Screen 2: Masttafel - Liste aller Mastnummern (über alle Bauabschnitte,
  // per Chip filterbar), mit Suche.
  // ======================================================================
  function renderBauabschnittChips(rows) {
    const el = document.getElementById('ha-mt-bauabschnitt-chips');
    if (!el) return;
    const seen = new Map();
    rows.forEach((r) => { if (!seen.has(r.bauabschnittId)) seen.set(r.bauabschnittId, r.bauabschnittName); });
    if (seen.size <= 1) { el.innerHTML = ''; return; }
    const chips = [{ id: '__all__', name: 'Alle' }].concat([...seen.entries()].map(([id, name]) => ({ id, name })));
    el.innerHTML = chips.map((c) => `<span class="ha-chip${state.bauabschnittFilter === c.id ? ' active' : ''}" data-ha-chip="${esc(c.id)}">${esc(c.name)}</span>`).join('');
    el.querySelectorAll('[data-ha-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.bauabschnittFilter = chip.getAttribute('data-ha-chip');
        renderMasttafelScreen();
      });
    });
  }
  function renderMasttafelScreen() {
    const rows = allMastRows();
    renderBauabschnittChips(rows);
    const term = state.searchTerm.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (state.bauabschnittFilter !== '__all__' && r.bauabschnittId !== state.bauabschnittFilter) return false;
      if (term && !String(r.displayKey).toLowerCase().includes(term)) return false;
      return true;
    }).sort((a, b) => String(a.displayKey).localeCompare(String(b.displayKey), 'de', { numeric: true }));

    const listEl = document.getElementById('ha-mt-list');
    const emptyEl = document.getElementById('ha-mt-empty');
    if (emptyEl) emptyEl.hidden = rows.length > 0;
    if (!listEl) return;
    if (!rows.length) { listEl.innerHTML = ''; return; }
    if (!filtered.length) { listEl.innerHTML = '<div class="ha-empty">Keine Treffer für diese Suche/diesen Filter.</div>'; return; }
    listEl.innerHTML = filtered.map((r) => `
      <div class="ha-list-row" data-open-mast="${esc(r.mastKey)}" data-ba="${esc(r.bauabschnittId)}">
        <div class="ha-list-row-main">
          <div class="ha-list-row-title">${esc(r.displayKey)}</div>
          <div class="ha-list-row-sub">${esc(r.bauabschnittName)} · ${r.versions.length} Version${r.versions.length === 1 ? '' : 'en'}</div>
        </div>
        ${r.currentIndex ? `<span class="ha-badge ha-badge-index">Index ${esc(r.currentIndex)}</span>` : ''}
        <span class="ha-list-row-chev">${chevronSvg()}</span>
      </div>`).join('');
    listEl.querySelectorAll('[data-open-mast]').forEach((row) => {
      row.addEventListener('click', () => openMast(row.getAttribute('data-open-mast'), row.getAttribute('data-ba')));
    });
  }
  const searchInput = document.getElementById('ha-mt-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.searchTerm = searchInput.value;
      renderMasttafelScreen();
    });
  }

  // ======================================================================
  // Screen 3: Mast-Detail mit 3 Tabs
  // ======================================================================
  function openMast(mastKey, bauabschnittId) {
    const rows = allMastRows();
    const row = rows.find((r) => r.mastKey === mastKey && r.bauabschnittId === bauabschnittId) || rows.find((r) => r.mastKey === mastKey);
    if (!row) return;
    state.currentMast = row;
    state.currentVersion = row.versions.length ? row.versions[row.versions.length - 1].version : null;

    const titleEl = document.getElementById('ha-mast-title');
    const subEl = document.getElementById('ha-mast-sub');
    if (titleEl) titleEl.textContent = row.displayKey;
    if (subEl) subEl.textContent = row.bauabschnittName;

    document.querySelectorAll('.ha-tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-ha-tab') === 'masttafel'));
    document.querySelectorAll('.ha-tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'ha-tabpanel-masttafel'));

    renderMastTabMasttafel();
    renderMastTabTaetigkeitsliste();
    renderMastTabFotos();
    showScreen('ha-screen-mast');
  }
  document.querySelectorAll('.ha-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-ha-tab');
      document.querySelectorAll('.ha-tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.ha-tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'ha-tabpanel-' + name));
    });
  });

  // ---- Tab 1: Masttafel (gleiche Logik/Optik wie die Mast-Detail-Seite
  // der Hauptseite: Index, Versions-Chips, geänderte Felder hervorgehoben) ----
  function renderMastTabMasttafel() {
    const el = document.getElementById('ha-tabpanel-masttafel');
    if (!el || !state.currentMast) return;
    const row = state.currentMast;
    const versions = row.versions;
    if (!versions.length) { el.innerHTML = '<div class="ha-empty">Keine Versionsdaten vorhanden.</div>'; return; }
    const latestVersion = versions[versions.length - 1].version;
    const selected = state.currentVersion || latestVersion;
    const v = versions.find((x) => x.version === selected) || versions[versions.length - 1];
    const prev = versions.find((x) => x.version === selected - 1);
    const isLatest = selected === latestVersion;
    const rowIndex = isLatest ? row.currentIndex : v.index;

    const indexHero = rowIndex
      ? `<div class="ha-index-hero"><span class="ha-index-hero-label">Aktueller Bearbeitungsstand</span><span class="ha-index-hero-value">Index ${esc(rowIndex)}</span></div>`
      : '';
    const chips = versions.map((x) => `<span class="ha-ver-chip${x.version === selected ? ' active' : ''}" data-goto-version="${x.version}">v${x.version}${x.version === latestVersion ? ' (aktuell)' : ''}</span>`).join('');

    const fields = groupColumns(row.columns).map((g) => {
      let val = '';
      for (const i of g.idxs) {
        const cand = v.values[i];
        if (cand != null && String(cand).trim() !== '') { val = cand; break; }
      }
      const changed = !!prev && g.idxs.some((i) => normalize(prev.values[i]) !== normalize(v.values[i]));
      const label = stripUnitSuffix(g.label);
      return `<div class="ha-stat-card${changed ? ' changed' : ''}">
        <div class="ha-stat-card-label">${esc(label)}</div>
        <div class="ha-stat-card-value${val ? '' : ' empty'}">${val ? esc(val) : '–'}</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      ${indexHero}
      <div class="ha-stat-card"><div class="ha-stat-card-label">Version</div><div class="ha-stat-card-value">v${selected}${isLatest ? ' (aktuell)' : ''}</div></div>
      ${versions.length > 1 ? `<div class="ha-ver-chip-row">${chips}</div>` : ''}
      ${fields}
    `;
    el.querySelectorAll('[data-goto-version]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.currentVersion = parseInt(chip.getAttribute('data-goto-version'), 10);
        renderMastTabMasttafel();
      });
    });
  }

  // ---- Tab 2: Tätigkeitsliste ----
  function currentTlList() {
    if (!state.currentMast) return null;
    const assignments = (typeof loadMastTlAssignments === 'function') ? loadMastTlAssignments() : {};
    const listId = assignments[state.currentMast.mastKey];
    if (!listId) return null;
    const lists = (typeof loadTlProjectList === 'function') ? loadTlProjectList() : [];
    return lists.find((l) => l.id === listId) || null;
  }
  // Statusoptionen gelten seit dem Nutzer-Feedback ("Statusoption ... auf
  // die einzelnen Tätigkeiten übertragen, nicht übergeordnet auf die ganze
  // Tätigkeitenliste") pro Tätigkeit statt pro Liste - Fallback auf die
  // (ältere) listenweite Konfiguration bzw. den Hart-Default, falls eine
  // Tätigkeit noch keine eigenen statusOptions hat (z.B. vor diesem Update
  // angelegte Tätigkeiten).
  function taskStatusOptions(task, list) {
    if (task && Array.isArray(task.statusOptions) && task.statusOptions.length) return task.statusOptions;
    if (list && Array.isArray(list.statusOptions) && list.statusOptions.length) return list.statusOptions;
    return [
      { id: 'st-default-open', label: 'Nicht erledigt', color: '#8a94a6', icon: '○' },
      { id: 'st-default-done', label: 'Erledigt', color: '#3fb950', icon: '✓' },
    ];
  }
  function statusPillHtml(status) {
    if (!status) return '';
    return `<button type="button" class="ha-status-pill" style="background:${esc(status.color)}22; color:${esc(status.color)};" data-cycle-status>${esc(status.icon || '')} ${esc(status.label)}</button>`;
  }
  // Einer Tätigkeit können mehrere Protokolle zugeordnet sein (Oder-
  // Verknüpfung) - Altdaten mit dem früheren Einzelfeld "protokollId" werden
  // hier transparent auf ein Array abgebildet. Eigene Kopie wie bei
  // taskStatusOptions oben, da diese IIFE ihr eigenes Scope hat.
  function taskProtokollIds(task) {
    if (!task) return [];
    if (Array.isArray(task.protokollIds)) return task.protokollIds;
    if (task.protokollId) return [task.protokollId];
    return [];
  }
  // Liefert die ID des Protokolls, das für diese Tätigkeit tatsächlich schon
  // mit echten Daten ausgefüllt wurde (oder null, falls noch keins). Bei
  // mehreren zugeordneten Protokollen ist das die Grundlage für die Oder-
  // Sperre: sobald eins ausgefüllt ist, gilt jedes andere für diese
  // Tätigkeit als gesperrt (siehe renderMastTabTaetigkeitsliste).
  function getFilledProtokollId(mastKey, taskId) {
    if (!mastKey || !taskId) return null;
    const all = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
    const entry = all[mastKey] && all[mastKey][taskId];
    if (!entry) return null;
    const answers = entry.answers || {};
    const hasAny = Object.keys(answers).some((k) => {
      const v = answers[k];
      return v !== '' && v != null && !(Array.isArray(v) && v.length === 0);
    });
    return hasAny ? (entry.protokollId || null) : null;
  }
  // Fest verdrahtete, unmissverständliche Anzeige direkt bei der
  // Protokoll-Tätigkeit: Grün "Erledigt" sobald ein Datensatz gespeichert
  // wurde, sonst Rot "Nicht erledigt". WICHTIG: hängt bewusst NICHT am
  // frei konfigurierbaren Status-Pill der Tätigkeitsliste - der basiert
  // auf einer Text-Übereinstimmung mit "Erledigt"/"Nicht erledigt" unter
  // den Status-Optionen dieser einen Liste, und schlägt fehl (bzw. zeigt
  // fälschlich weiter "Nicht erledigt"), sobald eine Liste keine eigene,
  // eindeutig als "erledigt" erkennbare Status-Option hat (z.B. nur eine
  // einzige Option, oder umbenannte Optionen). Stattdessen direkt an der
  // tatsächlich vorhandenen (nicht-leeren) Protokoll-Datensatz-Speicherung
  // festgemacht - das ist immer zuverlässig.
  function dokuStatusLabelHtml(done) {
    const bg = done ? '#1a9c4b' : '#e0392b';
    const label = done ? 'Erledigt' : 'Nicht erledigt';
    const icon = done
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';
    return `<span class="ha-doku-status" style="background:${bg};">${icon}<span>${esc(label)}</span></span>`;
  }
  function renderMastTabTaetigkeitsliste() {
    const el = document.getElementById('ha-tabpanel-taetigkeitsliste');
    if (!el || !state.currentMast) return;
    const list = currentTlList();
    if (!list) {
      el.innerHTML = '<div class="ha-empty">Diesem Mast ist noch keine Tätigkeitsliste zugeordnet - das lässt sich auf der Hauptseite auf der Mast-Detail-Seite einstellen.</div>';
      return;
    }
    if (!list.tasks.length) {
      el.innerHTML = '<div class="ha-empty">Diese Tätigkeitsliste hat noch keine Aufgaben.</div>';
      return;
    }
    const mastKey = state.currentMast.mastKey;
    const statusMap = (loadMastTaskStatus()[mastKey]) || {};
    const protokolle = (typeof loadProtokollProjectList === 'function') ? loadProtokollProjectList() : [];
    el.innerHTML = list.tasks.map((t) => {
      const statusOpts = taskStatusOptions(t, list);
      const statusId = statusMap[t.id] || (statusOpts[0] && statusOpts[0].id);
      const status = statusOpts.find((s) => s.id === statusId) || statusOpts[0];
      const assignedIds = t.dokuArt === 'protokoll' ? taskProtokollIds(t) : [];
      // Nur Protokolle behalten, die tatsächlich noch existieren (nicht
      // gelöscht wurden bzw. diesem Projekt weiterhin zugeordnet sind).
      const taskProtokolle = assignedIds.map((id) => protokolle.find((p) => p.id === id)).filter(Boolean);
      // Eine Tätigkeit kann inzwischen mehreren Protokollen zugeordnet sein
      // (Oder-Verknüpfung, siehe Nutzer-Wunsch): der Nutzer entscheidet sich
      // beim Ausfüllen für genau eins - ist eines mit echten Daten
      // gespeichert, gilt jedes andere für diese Tätigkeit als gesperrt.
      // WICHTIG weiterhin: nach Tätigkeit (t.id), NICHT nach Protokoll-
      // Vorlage gefragt - sonst würden zwei Tätigkeiten, die dieselbe
      // Vorlage nutzen (z.B. "Fotodokumentation" bei mehreren
      // Arbeitsschritten), sich gegenseitig als "Erledigt" anzeigen, sobald
      // nur EINE davon ausgefüllt wurde.
      const filledProtokollId = taskProtokolle.length ? getFilledProtokollId(mastKey, t.id) : null;
      const filledProtokoll = filledProtokollId ? taskProtokolle.find((p) => p.id === filledProtokollId) : null;
      // Diese Tätigkeit ist als "Dokumentation: Protokoll" markiert, aber es
      // konnte keine gültige Vorlage gefunden werden - entweder wurde im
      // Tätigkeiten-Editor noch keine Auswahl getroffen, oder das gewählte
      // Protokoll wurde diesem Projekt nie über die Projekteinstellungen
      // zugeordnet. Ohne diesen Hinweis würde hier einfach gar nichts
      // erscheinen, ohne erkennbaren Grund.
      const missingProtokollHint = (t.dokuArt === 'protokoll' && !taskProtokolle.length)
        ? '<div class="ha-task-warning">Kein Protokoll hinterlegt - bitte in der Tätigkeitsliste (Web) unter dieser Aufgabe ein Protokoll auswählen (ggf. zuvor in den Projekteinstellungen ins Projekt übernehmen).</div>'
        : '';
      const metaParts = [];
      if (t.rolle) metaParts.push(t.rolle);
      if (t.fristTage != null && t.fristTage !== '') metaParts.push(`Frist ${t.fristTage} Tage`);
      // Genau ein Protokoll zugeordnet: unverändertes Verhalten wie bisher -
      // die ganze Karte ist klickbar.
      const singleProtokoll = taskProtokolle.length === 1 ? taskProtokolle[0] : null;
      const hasProtokollDoku = taskProtokolle.length > 0;
      // Nutzer-Feedback: "das ist viel zu unstruckturiert und doppelt mit
      // dem erledigt" - die frei durchklickbare Status-Pille oben rechts sah
      // bei Protokoll-Tätigkeiten wie eine zweite, möglicherweise
      // abweichende "Nicht erledigt"-Anzeige neben dem ohnehin schon
      // verlässlichen Dokumentations-Status weiter unten aus. Für
      // Protokoll-Tätigkeiten ersetzt daher EIN einziger, auf echten
      // gespeicherten Daten basierender Status-Chip die frei klickbare
      // Pille komplett - nur Tätigkeiten OHNE Protokoll-Dokumentation
      // (Foto/keine) behalten die klickbare Status-Pille, dort ist sie die
      // einzige Möglichkeit, überhaupt einen Status zu setzen.
      const topStatusHtml = hasProtokollDoku ? dokuStatusLabelHtml(!!filledProtokollId) : statusPillHtml(status);
      const docIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      const chevronIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 6 15 12 9 18"/></svg>';
      const checkIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const lockIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      let dokuBlockHtml = '';
      if (singleProtokoll) {
        // Ein einziges Protokoll: eine schlanke, tippbare Zeile statt eines
        // eigenen umrandeten Buttons mit eigenem Status - der Status steht
        // ja bereits oben rechts an der Karte.
        dokuBlockHtml = `<button type="button" class="ha-doku-link-row" data-open-protokoll-btn>
          <span class="ha-doku-link-icon">${docIcon}</span>
          <span class="ha-doku-link-label">${esc(singleProtokoll.name)}</span>
          <span class="ha-doku-link-chevron">${chevronIcon}</span>
        </button>`;
      } else if (taskProtokolle.length > 1) {
        // Mehrere Protokolle zugeordnet (Oder-Frage): EINE kompakte
        // Auswahl-Liste statt mehrerer voll ausgestatteter Blöcke mit je
        // eigener Statuspille - jede Zeile trägt nur noch ein kleines
        // Symbol (Haken/leerer Kreis/Schloss) statt einer zweiten,
        // redundanten "Nicht erledigt"-Anzeige.
        const hint = filledProtokoll
          ? ''
          : `<div class="ha-task-doku-hint">Wähle eines der folgenden Protokolle aus - sobald eines ausgefüllt ist, ist das andere gesperrt.</div>`;
        const rowsHtml = taskProtokolle.map((p) => {
          const isFilled = filledProtokollId === p.id;
          const isLocked = !!filledProtokollId && !isFilled;
          const leadIcon = isFilled ? checkIcon : (isLocked ? lockIcon : '');
          const leadClass = isFilled ? 'ha-doku-option-lead-filled' : (isLocked ? 'ha-doku-option-lead-locked' : 'ha-doku-option-lead-open');
          const trail = isLocked ? 'Gesperrt' : (isFilled ? 'Ausgewählt' : chevronIcon);
          // Titel-Attribut absichtlich OHNE literale Anführungszeichen um den
          // Protokollnamen - die würden sonst (unescaped, da esc() hier nur
          // auf den Namen selbst wirkt) das umschließende title="..."-
          // Attribut vorzeitig beenden und die Zeile kaputt rendern.
          const lockedTitle = isLocked ? `Gesperrt – für diese Tätigkeit wurde bereits ${esc(filledProtokoll ? filledProtokoll.name : '')} ausgefüllt (Oder-Auswahl).` : '';
          return `<button type="button" class="ha-doku-option${isFilled ? ' ha-doku-option-filled' : ''}${isLocked ? ' ha-doku-option-locked' : ''}" data-open-protokoll-btn="${esc(p.id)}"${isLocked ? ' disabled' : ''} title="${lockedTitle}">
            <span class="ha-doku-option-lead ${leadClass}">${leadIcon}</span>
            <span class="ha-doku-option-label">${esc(p.name)}</span>
            <span class="ha-doku-option-trail">${trail}</span>
          </button>`;
        }).join('');
        dokuBlockHtml = `<div class="ha-task-doku-block">${hint}<div class="ha-doku-options">${rowsHtml}</div></div>`;
      }
      return `<div class="ha-task-card${singleProtokoll ? ' ha-task-card-clickable' : ''}" data-task-id="${esc(t.id)}"${singleProtokoll ? ` data-open-protokoll="${esc(singleProtokoll.id)}"` : ''}>
        <div class="ha-task-top">
          <div>
            <div class="ha-task-title">${t.nr != null ? esc(String(t.nr)) + '. ' : ''}${esc(t.titel || '(ohne Titel)')}</div>
            ${metaParts.length ? `<div class="ha-task-meta">${esc(metaParts.join(' · '))}</div>` : ''}
          </div>
          ${topStatusHtml}
        </div>
        ${dokuBlockHtml}
        ${missingProtokollHint}
      </div>`;
    }).join('');

    el.querySelectorAll('[data-cycle-status]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.ha-task-card');
        cycleTaskStatus(list, card.getAttribute('data-task-id'));
      });
    });
    // Ist genau ein Protokoll zugeordnet, bildet die Tätigkeit ja die
    // Dokumentation für diese Aufgabe ab - ein Klick auf die gesamte Karte
    // (nicht nur auf den "ausfüllen"-Button) öffnet daher direkt die
    // zugehörige Protokoll-Maske. Der Status-Pill hat eine eigene Aktion
    // (Status durchschalten) und stoppt die Klick-Weitergabe, damit ein
    // Klick darauf nicht zusätzlich die Maske öffnet.
    // Der Button selbst bekommt bewusst KEINEN eigenen (stopPropagation-)
    // Klick-Handler - ein Klick auf ihn soll ganz normal zu diesem Karten-
    // Handler hochblubbern und die Maske öffnen, genau wie ein Klick auf
    // den Rest der Karte. Frueher wurde das versehentlich hier abgefangen,
    // wodurch ein Klick auf den Button gar nichts mehr ausgelöst hat.
    el.querySelectorAll('.ha-task-card[data-open-protokoll]').forEach((card) => {
      card.addEventListener('click', () => {
        const taskId = card.getAttribute('data-task-id');
        const protokollId = card.getAttribute('data-open-protokoll');
        openProtokollFormWithOverwriteCheck(protokollId, taskId, list);
      });
    });
    // Sind einer Tätigkeit MEHRERE Protokolle zugeordnet (Oder-Frage), trägt
    // jede Auswahl-Zeile ihre eigene Protokoll-ID direkt am Button - ein
    // Klick öffnet gezielt genau dieses eine Protokoll. Gesperrte Buttons
    // sind über das disabled-Attribut bereits nicht anklickbar.
    el.querySelectorAll('[data-open-protokoll-btn]:not([disabled])').forEach((btn) => {
      const btnProtokollId = btn.getAttribute('data-open-protokoll-btn');
      if (!btnProtokollId) return; // gehört zur Einzelauswahl-Karte, dort übernimmt der Karten-Handler oben
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.ha-task-card');
        const taskId = card.getAttribute('data-task-id');
        openProtokollFormWithOverwriteCheck(btnProtokollId, taskId, list);
      });
    });
  }
  // Öffnet die Protokoll-Maske - fragt vorher nach, falls für diese
  // Tätigkeit bereits ein echter Datensatz gespeichert ist (unabhängig vom
  // Status-Pill, der z.B. manuell durchgeklickt worden sein könnte, ohne
  // dass je gespeichert wurde). So greift der Hinweis zuverlässig genau
  // dann, wenn tatsächlich schon ausgefüllte Daten überschrieben würden.
  function openProtokollFormWithOverwriteCheck(protokollId, taskId, list) {
    if (hasSavedProtokollDaten(state.currentMast.mastKey, taskId)) {
      showAppConfirm('Für diese Tätigkeit liegt bereits ein gespeicherter Datensatz vor. Möchten Sie ihn wirklich ändern?', () => {
        openProtokollForm(protokollId, taskId, list);
      });
      return;
    }
    openProtokollForm(protokollId, taskId, list);
  }
  // Prüft, ob für DIESE Tätigkeit (nicht für die Vorlage allgemein) schon
  // ein echter Datensatz existiert - siehe Kommentar bei protokollDone oben:
  // mehrere Tätigkeiten können dieselbe Protokoll-Vorlage nutzen und müssen
  // trotzdem unabhängig voneinander "ausgefüllt"/"nicht ausgefüllt" sein.
  function hasSavedProtokollDaten(mastKey, taskId) {
    return !!getFilledProtokollId(mastKey, taskId);
  }
  function cycleTaskStatus(list, taskId) {
    const task = (list.tasks || []).find((t) => t.id === taskId);
    const statusOpts = taskStatusOptions(task, list);
    if (!statusOpts.length) return;
    const mastKey = state.currentMast.mastKey;
    const all = loadMastTaskStatus();
    const forMast = all[mastKey] || {};
    const currentId = forMast[taskId] || (statusOpts[0] && statusOpts[0].id);
    const idx = statusOpts.findIndex((s) => s.id === currentId);
    const next = statusOpts[(idx + 1) % statusOpts.length];
    forMast[taskId] = next.id;
    all[mastKey] = forMast;
    saveMastTaskStatus(all);
    applyTaskAbschluss(mastKey, task, list, isStatusErledigt(next));
    renderMastTabTaetigkeitsliste();
  }

  // Zentrale Stelle, an der ein Tätigkeits-Abschluss (egal ob per Status-
  // Pill durchgeklickt oder per Protokoll-Speichern ausgelöst) in das für
  // die Fertigstellungsliste genutzte Abschluss-Datum je Mast/Tätigkeit
  // übersetzt wird - inkl. automatischer Ereignis-Erzeugung im Bautagebuch
  // beim allerersten Wechsel auf "erledigt". Ein erneutes Abhaken auf
  // "erledigt" (z.B. Status mehrfach durchgeklickt) erzeugt bewusst KEIN
  // zweites Ereignis, ein Zurücksetzen auf "nicht erledigt" entfernt das
  // Abschluss-Datum wieder (die Zelle in der Fertigstellungsliste wird
  // dann wieder leer statt das alte Datum weiter anzuzeigen).
  function applyTaskAbschluss(mastKey, task, list, done, explicitProtokollId) {
    if (!mastKey || !task || typeof loadMastTaskAbschluss !== 'function') return;
    const all = loadMastTaskAbschluss();
    const forMast = all[mastKey] || {};
    if (done) {
      const already = !!forMast[task.id];
      forMast[task.id] = { datum: (typeof todayIsoDate === 'function') ? todayIsoDate() : '' };
      all[mastKey] = forMast;
      saveMastTaskAbschluss(all);
      if (!already && typeof pushEreignisFuerHeute === 'function') {
        const mastLabel = (state.currentMast && (state.currentMast.displayKey || state.currentMast.mastKey)) || mastKey;
        // War explizit bekannt, welches Protokoll gerade gespeichert wurde
        // (z.B. direkt aus dem Speichern-Handler übergeben), das nehmen -
        // sonst (z.B. beim manuellen Durchklicken des Status-Pills) das
        // tatsächlich für diese Tätigkeit ausgefüllte Protokoll ermitteln.
        // Bei mehreren zugeordneten Protokollen (Oder-Frage) ist ohnehin nur
        // je Tätigkeit genau eins gleichzeitig ausgefüllt.
        const protokollIdForEvt = task.dokuArt === 'protokoll'
          ? (explicitProtokollId || getFilledProtokollId(mastKey, task.id))
          : null;
        pushEreignisFuerHeute(
          `Tätigkeit abgeschlossen: ${task.titel || '(ohne Titel)'}`,
          `Mast ${mastLabel}${list && list.name ? ' · ' + list.name : ''}`,
          { mastKey, taskId: task.id, protokollId: protokollIdForEvt || null }
        );
      }
    } else if (forMast[task.id]) {
      delete forMast[task.id];
      all[mastKey] = forMast;
      saveMastTaskAbschluss(all);
    }
  }

  // ---- Protokoll-Formular (Bausteine als echte Eingabefelder, mit
  // automatischer Vorbefüllung aus der Masttafel dieses einen Masts) ----
  let protokollFormState = null; // { protokoll, task, list, answers }

  // Wird das zugehörige Protokoll gespeichert, gilt die Tätigkeit als
  // erledigt dokumentiert - unabhängig vom "Dokumentation Pflicht zum
  // Abhaken"-Schalter (dieser steuert nur, ob die Aufgabe OHNE Protokoll
  // manuell abgehakt werden darf, nicht ob das Speichern selbst abhakt).
  function isStatusErledigt(status) {
    return !!status && /erledigt/i.test(status.label) && !/nicht/i.test(status.label);
  }
  function findErledigtStatus(task, list) {
    const opts = taskStatusOptions(task, list);
    return opts.find(isStatusErledigt) || opts[opts.length - 1];
  }
  function markTaskDoneIfRequired(list, task, explicitProtokollId) {
    if (!task) return;
    const mastKey = state.currentMast.mastKey;
    // Den Status-Pill nur setzen, wenn diese Liste überhaupt eine als
    // "erledigt" erkennbare Status-Option hat (z.B. leere statusOptions bei
    // manchen Listen) - das Abschluss-Datum für die Fertigstellungsliste
    // (applyTaskAbschluss) darf davon aber NICHT abhängen. Genau das war der
    // Bug: früher brach die Funktion hier komplett ab, sobald "done" fehlte,
    // wodurch das Protokoll zwar gespeichert wurde, aber nie als Abschluss
    // in der Fertigstellungsliste ankam.
    const done = findErledigtStatus(task, list);
    if (done) {
      const all = loadMastTaskStatus();
      const forMast = all[mastKey] || {};
      forMast[task.id] = done.id;
      all[mastKey] = forMast;
      saveMastTaskStatus(all);
    }
    applyTaskAbschluss(mastKey, task, list, true, explicitProtokollId);
  }
  // Gegenstück: solange noch kein echter Datensatz eingegeben wurde, bleibt
  // die Tätigkeit explizit auf "Nicht erledigt" stehen - ein Klick auf
  // Speichern ohne ausgefüllte Felder darf die Aufgabe nicht fälschlich als
  // erledigt markieren.
  function findNichtErledigtStatus(task, list) {
    const opts = taskStatusOptions(task, list);
    return opts.find((s) => !isStatusErledigt(s) && /nicht/i.test(s.label) && /erledigt/i.test(s.label)) || opts[0];
  }
  function markTaskNotDone(list, task) {
    if (!task) return;
    const mastKey = state.currentMast.mastKey;
    const notDone = findNichtErledigtStatus(task, list);
    if (notDone) {
      const all = loadMastTaskStatus();
      const forMast = all[mastKey] || {};
      forMast[task.id] = notDone.id;
      all[mastKey] = forMast;
      saveMastTaskStatus(all);
    }
    applyTaskAbschluss(mastKey, task, list, false);
  }

  function resolveMasttafelValue(b) {
    if (!b.masttafelSpalte) return '';
    const cols = state.currentMast.columns || [];
    const idx = cols.findIndex((c) => c.idx === b.masttafelSpalte.idx);
    if (idx === -1) return '';
    const versions = state.currentMast.versions;
    const latest = versions[versions.length - 1];
    const val = latest.values[b.masttafelSpalte.idx];
    return val != null ? val : '';
  }

  function bausteinFieldHtml(b) {
    if (b.type === 'abschnitt') {
      return `<div class="ha-field-abschnitt">
        <div class="ha-field-abschnitt-title">${esc(b.label)}</div>
        ${b.beschreibung ? `<div class="ha-field-abschnitt-desc">${esc(b.beschreibung)}</div>` : ''}
      </div>`;
    }
    const reqMark = b.required ? ' <span class="ha-field-req">*</span>' : '';
    const headingHtml = b.heading ? `<div class="ha-field-heading">${esc(b.heading)}</div>` : '';
    const hintHtml = b.hilfetext ? `<div class="ha-field-hint">${esc(b.hilfetext)}</div>` : '';
    const isMulti = b.type === 'auswahl' && b.mehrfachauswahl;
    const isAuto = SOURCEABLE_TYPES.includes(b.type) && b.quelle === 'masttafel' && !isMulti;
    let labelText = esc(b.label);
    if (b.type === 'zahl' && b.einheit) labelText += ` (${esc(b.einheit)})`;

    if (isAuto) {
      const val = protokollFormState.answers[b.id];
      return `<div class="ha-field">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        <div class="ha-field-auto">${LOCK_SVG_SMALL}<span>${val ? esc(val) : '–'}</span><span class="ha-badge ha-badge-index">Auto</span></div>
        ${hintHtml}
      </div>`;
    }

    const saved = protokollFormState.answers[b.id];

    if (b.type === 'checkbox') {
      syncCheckboxOptionen(b);
      const checkedMap = (saved && typeof saved === 'object') ? saved : {};
      const optionenHtml = b.optionen.map((opt) => {
        const checked = checkedMap[opt.id] === true;
        const folgeHtml = (opt.folgefeld && checked) ? checkboxFolgeInputHtml(b, opt) : '';
        return `<div class="ha-checkbox-option">
          <label class="ha-field-checkbox"><input type="checkbox" data-checkbox-option-input="${b.id}::${opt.id}"${checked ? ' checked' : ''}><span>${esc(opt.label)}</span></label>
          ${folgeHtml}
        </div>`;
      }).join('');
      return `<div class="ha-field" data-checkbox-field="${b.id}">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        ${optionenHtml}
        ${hintHtml}
      </div>`;
    }
    if (b.type === 'auswahl' && isMulti) {
      const arr = Array.isArray(saved) ? saved : [];
      const choicesHtml = (b.choices || []).map((c) => `<label class="ha-field-choice"><input type="checkbox" data-baustein-input-multi="${b.id}" value="${esc(c)}"${arr.indexOf(c) !== -1 ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('');
      return `<div class="ha-field">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        <div class="ha-field-checklist">${choicesHtml}</div>
        ${hintHtml}
      </div>`;
    }
    if (b.type === 'unterschrift') {
      return `<div class="ha-field">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        <canvas class="ha-sign-canvas" data-sign-canvas="${b.id}"></canvas>
        <button type="button" class="ha-sign-clear" data-sign-clear="${b.id}">Unterschrift löschen</button>
        ${hintHtml}
      </div>`;
    }
    if (b.type === 'foto') {
      return `<div class="ha-field" data-photo-field="${b.id}">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        <button type="button" class="ha-field-photo-btn" data-photo-btn>${b.mehrfach ? 'Foto hinzufügen' : 'Foto aufnehmen'}${b.mehrfach && b.maxAnzahl ? ` (max. ${esc(String(b.maxAnzahl))})` : ''}</button>
        <input type="file" accept="image/*" capture="environment" data-photo-input hidden>
        <div class="ha-field-photo-preview" data-photo-preview></div>
        ${hintHtml}
      </div>`;
    }
    if (b.type === 'tabelle') {
      const cols = (b.columns && b.columns.length ? b.columns : ['Spalte 1', 'Spalte 2']).slice(0, 3);
      // Noch keine gespeicherte Antwort -> frische Zeilen anlegen, dabei pro
      // Spalte deren Vorbefüllung (b.columnPrefill[i]) anwenden (z.B. eine
      // "Tiefe [m]"-Spalte, die automatisch 1,2,3... zeigt).
      const rowCount = Math.max(1, parseInt(b.rows, 10) || 1);
      const startRows = (Array.isArray(saved) && saved.length)
        ? saved
        : Array.from({ length: rowCount }).map((_, ri) => cols.map((c, ci) => tabellePrefillValue((b.columnPrefill && b.columnPrefill[ci]) || null, ri)));
      return `<div class="ha-field" data-table-field="${b.id}">${headingHtml}
        <div class="ha-field-label">${labelText}${reqMark}</div>
        <table class="ha-field-table" data-baustein-table="${b.id}">
          <thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${startRows.map((r) => `<tr>${cols.map((c, i) => `<td><input type="text" value="${esc(r[i] || '')}"></td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        <button type="button" class="ha-table-add-row" data-table-add-row="${b.id}">+ Zeile</button>
        ${hintHtml}
      </div>`;
    }

    let inputHtml = '';
    if (b.type === 'text') {
      const val = saved != null ? saved : (b.standardwert || '');
      inputHtml = b.mehrzeilig
        ? `<textarea data-baustein-input="${b.id}">${esc(val)}</textarea>`
        : `<input type="text" data-baustein-input="${b.id}" value="${esc(val)}">`;
    } else if (b.type === 'zahl') {
      const val = saved != null ? saved : (b.standardwert || '');
      const minAttr = (b.min !== '' && b.min != null) ? ` min="${esc(String(b.min))}"` : '';
      const maxAttr = (b.max !== '' && b.max != null) ? ` max="${esc(String(b.max))}"` : '';
      inputHtml = `<input type="number" data-baustein-input="${b.id}" value="${esc(val)}"${minAttr}${maxAttr}>`;
    } else if (b.type === 'datum') {
      const val = saved != null ? saved : (b.standardwert === 'heute' ? todayIso() : '');
      inputHtml = `<input type="date" data-baustein-input="${b.id}" value="${esc(val)}">`;
    } else if (b.type === 'auswahl') {
      const val = saved != null ? saved : (b.standardwert || '');
      inputHtml = `<select data-baustein-input="${b.id}">
        <option value=""${!val ? ' selected' : ''}>Bitte wählen...</option>
        ${(b.choices || []).map((c) => `<option value="${esc(c)}"${val === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>`;
    }
    return `<div class="ha-field">${headingHtml}
      <div class="ha-field-label">${labelText}${reqMark}</div>
      ${inputHtml}
      ${hintHtml}
    </div>`;
  }

  function setupSignaturePad(canvas, bausteinId) {
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#1d2433';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const existing = protokollFormState.answers[bausteinId];
    if (existing) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      img.src = existing;
    }
    let drawing = false;
    let last = null;
    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function start(e) { drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      protokollFormState.answers[bausteinId] = canvas.toDataURL('image/png');
    }
    function end() { drawing = false; }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function wirePhotoField(container, b) {
    if (!b) return;
    const btn = container.querySelector('[data-photo-btn]');
    const input = container.querySelector('[data-photo-input]');
    const preview = container.querySelector('[data-photo-preview]');
    function currentArr() {
      const val = protokollFormState.answers[b.id];
      return Array.isArray(val) ? val : (val ? [val] : []);
    }
    function renderPreview() {
      const arr = currentArr();
      preview.innerHTML = arr.map((src, i) => `<img src="${src}" data-photo-remove="${i}">`).join('');
      preview.querySelectorAll('[data-photo-remove]').forEach((img) => {
        img.addEventListener('click', () => {
          const arr2 = currentArr();
          arr2.splice(parseInt(img.getAttribute('data-photo-remove'), 10), 1);
          protokollFormState.answers[b.id] = b.mehrfach ? arr2 : (arr2[0] || null);
          renderPreview();
        });
      });
    }
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let arr = currentArr();
        if (b.mehrfach) {
          const max = b.maxAnzahl ? parseInt(b.maxAnzahl, 10) : null;
          if (max && arr.length >= max) arr = arr.slice(0, Math.max(0, max - 1));
          arr.push(reader.result);
          protokollFormState.answers[b.id] = arr;
        } else {
          protokollFormState.answers[b.id] = reader.result;
        }
        renderPreview();
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
    renderPreview();
  }

  // Ankreuzen/Abwählen einer Checkbox-Option muss die (eventuelle)
  // Folgefrage darunter ein-/ausblenden - dafür wird NUR der Container dieses
  // einen Checkbox-Bausteins neu gerendert (nicht das ganze Formular), damit
  // noch nicht gespeicherte Eingaben in anderen Feldern (Text/Zahl/Datum/
  // Auswahl werden erst beim Speichern aus dem DOM gelesen, siehe
  // collectAnswers) dabei nicht verloren gehen.
  function wireCheckboxOptions(formEl, b) {
    const container = formEl.querySelector(`[data-checkbox-field="${b.id}"]`);
    if (!container) return;
    container.querySelectorAll('[data-checkbox-option-input]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const optId = cb.getAttribute('data-checkbox-option-input').split('::')[1];
        const cur = (protokollFormState.answers[b.id] && typeof protokollFormState.answers[b.id] === 'object') ? protokollFormState.answers[b.id] : {};
        cur[optId] = cb.checked;
        protokollFormState.answers[b.id] = cur;
        const tmp = document.createElement('div');
        tmp.innerHTML = bausteinFieldHtml(b);
        container.replaceWith(tmp.firstElementChild);
        wireCheckboxOptions(formEl, b);
      });
    });
    container.querySelectorAll('[data-checkbox-folge-input]').forEach((inp) => {
      const evtName = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evtName, () => {
        protokollFormState.answers[inp.getAttribute('data-checkbox-folge-input')] = inp.value;
      });
    });
  }

  function wireProtokollFormInputs(formEl) {
    const bausteineById = {};
    protokollFormState.protokoll.bausteine.forEach((b) => { bausteineById[b.id] = b; });

    formEl.querySelectorAll('[data-checkbox-field]').forEach((container) => {
      const b = bausteineById[container.getAttribute('data-checkbox-field')];
      if (b) wireCheckboxOptions(formEl, b);
    });
    formEl.querySelectorAll('[data-sign-canvas]').forEach((canvas) => {
      setupSignaturePad(canvas, canvas.getAttribute('data-sign-canvas'));
    });
    formEl.querySelectorAll('[data-sign-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sign-clear');
        const canvas = formEl.querySelector(`[data-sign-canvas="${id}"]`);
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        delete protokollFormState.answers[id];
      });
    });
    formEl.querySelectorAll('[data-photo-field]').forEach((container) => {
      wirePhotoField(container, bausteineById[container.getAttribute('data-photo-field')]);
    });
    formEl.querySelectorAll('[data-table-add-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-table-add-row');
        const b = bausteineById[id];
        const cols = (b.columns && b.columns.length ? b.columns : ['Spalte 1', 'Spalte 2']).slice(0, 3);
        const table = formEl.querySelector(`[data-baustein-table="${id}"] tbody`);
        // Neue Zeile bekommt denselben Zeilenindex wie ihre Position in der
        // Tabelle, damit z.B. eine "fortlaufend"-Vorbefüllung (1,2,3...) auch
        // bei manuell per "+ Zeile" hinzugefügten Zeilen sinnvoll weiterläuft.
        const rowIdx = table.querySelectorAll('tr').length;
        const tr = document.createElement('tr');
        tr.innerHTML = cols.map((c, ci) => `<td><input type="text" value="${esc(tabellePrefillValue((b.columnPrefill && b.columnPrefill[ci]) || null, rowIdx))}"></td>`).join('');
        table.appendChild(tr);
      });
    });
  }

  function collectAnswers() {
    const answers = Object.assign({}, protokollFormState.answers);
    protokollFormState.protokoll.bausteine.forEach((b) => {
      if (b.type === 'abschnitt') return;
      const isMulti = b.type === 'auswahl' && b.mehrfachauswahl;
      const isAuto = SOURCEABLE_TYPES.includes(b.type) && b.quelle === 'masttafel' && !isMulti;
      if (isAuto || b.type === 'foto' || b.type === 'unterschrift') return; // already current in `answers`
      if (b.type === 'checkbox') {
        syncCheckboxOptionen(b);
        const container = document.querySelector(`[data-checkbox-field="${b.id}"]`);
        const optWerte = {};
        b.optionen.forEach((opt) => {
          const cb = container && container.querySelector(`[data-checkbox-option-input="${b.id}::${opt.id}"]`);
          optWerte[opt.id] = cb ? cb.checked : !!(answers[b.id] && answers[b.id][opt.id]);
          if (opt.folgefeld) {
            const ffKey = b.id + '__ff__' + opt.id;
            const ffInput = container && container.querySelector(`[data-checkbox-folge-input="${ffKey}"]`);
            if (ffInput) answers[ffKey] = ffInput.value;
          }
        });
        answers[b.id] = optWerte;
        return;
      }
      if (isMulti) {
        answers[b.id] = Array.from(document.querySelectorAll(`[data-baustein-input-multi="${b.id}"]:checked`)).map((el) => el.value);
        return;
      }
      if (b.type === 'tabelle') {
        const table = document.querySelector(`[data-baustein-table="${b.id}"]`);
        if (table) {
          answers[b.id] = Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('input')).map((i) => i.value));
        }
        return;
      }
      const inp = document.querySelector(`[data-baustein-input="${b.id}"]`);
      if (inp) answers[b.id] = inp.value;
    });
    return answers;
  }

  function openProtokollForm(protokollId, taskId, list) {
    const protokolle = loadProtokollProjectList();
    const protokoll = protokolle.find((p) => p.id === protokollId);
    if (!protokoll) return;
    const task = list.tasks.find((t) => t.id === taskId) || null;
    const mastKey = state.currentMast.mastKey;
    const allAnswers = loadMastProtokollDaten();
    // Nach der Tätigkeit (taskId), nicht nach der Vorlage (protokollId)
    // gespeicherte Daten laden - siehe Kommentar bei hasSavedProtokollDaten().
    const existingEntry = allAnswers[mastKey] && allAnswers[mastKey][taskId];
    const existing = (existingEntry && existingEntry.answers) || {};
    protokollFormState = { protokoll, task, list, answers: Object.assign({}, existing) };

    // Masttafel-Quelle-Bausteine sind immer live - bei jedem Öffnen frisch
    // aus der aktuellen Masttafel-Version dieses Masts übernehmen.
    protokoll.bausteine.forEach((b) => {
      const isMulti = b.type === 'auswahl' && b.mehrfachauswahl;
      if (SOURCEABLE_TYPES.includes(b.type) && b.quelle === 'masttafel' && !isMulti) {
        protokollFormState.answers[b.id] = resolveMasttafelValue(b);
      }
    });

    document.getElementById('ha-protokoll-title').textContent = protokoll.name;
    document.getElementById('ha-protokoll-sub').textContent = `Mast ${state.currentMast.displayKey}`;

    const formEl = document.getElementById('ha-protokoll-form');
    let html = `<div class="ha-field">
      <div class="ha-field-label">Mastnummer</div>
      <div class="ha-field-auto">${LOCK_SVG_SMALL}<span>${esc(state.currentMast.displayKey)}</span><span class="ha-badge ha-badge-index">Immer</span></div>
    </div>`;
    protokoll.bausteine.forEach((b) => { html += bausteinFieldHtml(b); });
    formEl.innerHTML = html;
    wireProtokollFormInputs(formEl);

    document.getElementById('ha-overlay-protokoll').hidden = false;
  }
  function closeProtokollForm() {
    document.getElementById('ha-overlay-protokoll').hidden = true;
    protokollFormState = null;
  }
  // Zählt jedes tatsächlich vorhandene Feld (inkl. automatisch aus der
  // Masttafel übernommener Werte) - ein Klick auf Speichern ohne ein
  // einziges befülltes Feld (z.B. ein reines "abschnitt"-Protokoll) zählt
  // nicht als ausgefüllt, alles andere schon.
  function hasManualAnswerData(protokoll, answers) {
    // Delegiert an isBausteinAnswered() für ALLE Typen (auch hier
    // konsistent, nicht nur eine ad-hoc "leer?"-Prüfung) - wichtig seit dem
    // Checkbox-Optionen-Umbau: eine unberührte Checkbox liefert jetzt immer
    // ein Objekt wie "{optA:false, optB:false}" (nie mehr null/''), das die
    // alte generische Prüfung hier fälschlich als "beantwortet" gezählt
    // hätte, obwohl gar nichts angekreuzt wurde.
    return protokoll.bausteine.some((b) => {
      if (b.type === 'abschnitt') return false;
      return isBausteinAnswered(b, answers[b.id]);
    });
  }
  // Prüft für einen einzelnen Baustein, ob er (je nach Typ passend) als
  // "beantwortet" gilt - dieselben Wert-Formen wie beim Speichern/Anzeigen.
  function isBausteinAnswered(b, v) {
    if (b.type === 'checkbox') {
      if (!v || typeof v !== 'object') return false;
      return Object.keys(v).some((k) => v[k] === true);
    }
    if (b.type === 'foto') {
      const arr = Array.isArray(v) ? v : (v ? [v] : []);
      return arr.length > 0;
    }
    if (b.type === 'unterschrift') return !!v;
    if (b.type === 'tabelle') {
      if (!Array.isArray(v) || !v.length) return false;
      return v.some((row) => Array.isArray(row) && row.some((cell) => cell !== '' && cell != null));
    }
    if (Array.isArray(v)) return v.length > 0; // Mehrfachauswahl
    return v !== '' && v != null;
  }
  // Liefert alle als "Pflichtfeld" markierten Bausteine, die noch nicht
  // ausgefüllt sind - Grundlage für die Speichern-Sperre samt Warnung.
  // Zusätzlich: als Pflichtfeld markierte Folgefragen einer Checkbox-Option,
  // die (weil die Option angekreuzt ist) gerade sichtbar sind, aber noch
  // keinen Wert haben.
  function getMissingRequiredFields(protokoll, answers) {
    const missing = protokoll.bausteine.filter((b) => {
      if (b.type === 'abschnitt' || !b.required) return false;
      return !isBausteinAnswered(b, answers[b.id]);
    });
    protokoll.bausteine.forEach((b) => {
      if (b.type !== 'checkbox' || !Array.isArray(b.optionen)) return;
      const v = answers[b.id] || {};
      b.optionen.forEach((opt) => {
        if (!opt.folgefeld || !opt.folgefeld.required || v[opt.id] !== true) return;
        const ffVal = answers[b.id + '__ff__' + opt.id];
        if (ffVal === '' || ffVal == null) missing.push({ label: `${b.label}: ${opt.folgefeld.label}` });
      });
    });
    return missing;
  }
  const protokollCloseBtn = document.getElementById('ha-protokoll-close');
  if (protokollCloseBtn) protokollCloseBtn.addEventListener('click', closeProtokollForm);
  const protokollSaveBtn = document.getElementById('ha-protokoll-save');
  if (protokollSaveBtn) {
    protokollSaveBtn.addEventListener('click', () => {
      if (!protokollFormState) return;
      const answers = collectAnswers();
      // Pflichtfelder erzwingen: solange auch nur eines fehlt, wird gar
      // nicht gespeichert - stattdessen eine Warnung mit den konkret
      // fehlenden Feldnamen zeigen, damit klar ist, was noch fehlt.
      const missing = getMissingRequiredFields(protokollFormState.protokoll, answers);
      if (missing.length) {
        const names = missing.map((b) => b.label || '(ohne Bezeichnung)').join(', ');
        showAppAlert(`Bitte zuerst folgende Pflichtfelder ausfüllen: ${names}`);
        return;
      }
      if (!protokollFormState.task) return; // sollte nie passieren, s.o. bei openProtokollForm
      const mastKey = state.currentMast.mastKey;
      // Sicherheitsnetz für die Oder-Auswahl bei mehreren zugeordneten
      // Protokollen: die UI blendet das jeweils andere Protokoll bereits als
      // gesperrt aus, sobald eins ausgefüllt ist - dieser Check greift nur,
      // falls trotzdem (z.B. über einen alten offenen Formularzustand)
      // versucht wird, ein zweites Protokoll für dieselbe Tätigkeit zu
      // speichern, obwohl schon ein anderes ausgefüllt ist.
      const alreadyFilledId = getFilledProtokollId(mastKey, protokollFormState.task.id);
      if (alreadyFilledId && alreadyFilledId !== protokollFormState.protokoll.id) {
        const other = loadProtokollProjectList().find((p) => p.id === alreadyFilledId);
        showAppAlert(`Für diese Tätigkeit ist bereits "${other ? other.name : 'ein anderes Protokoll'}" ausgefüllt. Bei mehreren zugeordneten Protokollen kann pro Tätigkeit nur eines befüllt werden.`);
        closeProtokollForm();
        renderMastTabTaetigkeitsliste();
        return;
      }
      const all = loadMastProtokollDaten();
      const forMast = all[mastKey] || {};
      // Nach der Tätigkeit (taskId), nicht nach der Vorlage (protokollId)
      // speichern - protokollId wird trotzdem mit abgelegt, damit sich beim
      // Lesen (z.B. Datensätze-Panel auf der Hauptseite) weiterhin ermitteln
      // lässt, welche Vorlage zu diesem Datensatz gehört (und, bei mehreren
      // zugeordneten Protokollen, welches der beiden das ausgefüllte ist).
      forMast[protokollFormState.task.id] = { protokollId: protokollFormState.protokoll.id, answers };
      all[mastKey] = forMast;
      saveMastProtokollDaten(all);
      // Nur als erledigt markieren, wenn wirklich Daten eingegeben wurden -
      // ein leer gespeichertes Protokoll lässt die Tätigkeit "Nicht erledigt".
      if (hasManualAnswerData(protokollFormState.protokoll, answers)) {
        markTaskDoneIfRequired(protokollFormState.list, protokollFormState.task, protokollFormState.protokoll.id);
      } else {
        markTaskNotDone(protokollFormState.list, protokollFormState.task);
      }
      closeProtokollForm();
      renderMastTabTaetigkeitsliste();
    });
  }

  // ---- Tab 3: Fotos & Dokumente ----
  function renderMastTabFotos() {
    const el = document.getElementById('ha-tabpanel-fotos');
    if (!el || !state.currentMast) return;
    const mastKey = state.currentMast.mastKey;
    const fotos = (loadMastFotos()[mastKey]) || [];
    const dpDocs = (typeof getMastDatenpfadDokumente === 'function') ? getMastDatenpfadDokumente(mastKey) : [];
    el.innerHTML = `
      <button type="button" class="ha-add-photo-btn" id="ha-add-photo-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Foto oder Dokument hinzufügen
      </button>
      <input type="file" accept="image/*" data-mast-photo-input hidden>
      ${fotos.length ? `<div class="ha-gallery">${fotos.map((f) => `<div class="ha-photo-thumb" data-photo-id="${esc(f.id)}"><img src="${f.dataUrl}" alt="${esc(f.name || '')}"></div>`).join('')}</div>` : '<div class="ha-empty">Noch keine Fotos oder Dokumente für diesen Mast.</div>'}
      ${importierteDokumenteHtml(dpDocs)}
    `;
    const addBtn = el.querySelector('#ha-add-photo-btn');
    const fileInput = el.querySelector('[data-mast-photo-input]');
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const all = loadMastFotos();
        const list = all[mastKey] || [];
        list.push({ id: makeMastDataId('foto'), dataUrl: reader.result, name: file.name, addedAt: new Date().toISOString() });
        all[mastKey] = list;
        saveMastFotos(all);
        renderMastTabFotos();
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
    el.querySelectorAll('[data-photo-id]').forEach((thumb) => {
      thumb.addEventListener('click', () => openLightbox(thumb.getAttribute('data-photo-id')));
    });
    wireDpDocRows(el, dpDocs);
  }
  function openLightbox(photoId) {
    const mastKey = state.currentMast.mastKey;
    const list = (loadMastFotos()[mastKey]) || [];
    const foto = list.find((f) => f.id === photoId);
    if (!foto) return;
    document.getElementById('ha-lightbox-img').src = foto.dataUrl;
    const overlay = document.getElementById('ha-overlay-lightbox');
    overlay.hidden = false;
    const deleteBtn = document.getElementById('ha-lightbox-delete');
    deleteBtn.onclick = () => {
      const all2 = loadMastFotos();
      all2[mastKey] = (all2[mastKey] || []).filter((f) => f.id !== photoId);
      saveMastFotos(all2);
      overlay.hidden = true;
      renderMastTabFotos();
    };
  }
  const lightboxCloseBtn = document.getElementById('ha-lightbox-close');
  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', () => {
      document.getElementById('ha-overlay-lightbox').hidden = true;
    });
  }

  // "Aktualisieren"-Button auf der Projekte-Auswahl: lädt die komplette Seite
  // neu (statt nur die Liste neu zu rendern), da handyapp.js sein
  // gemeinsames JS-Modul mit intra.html teilt, aber als eigene,
  // separat geöffnete Seite läuft - ein einfacher Reload ist hier der
  // verlässlichste Weg, um sämtliche zwischenzeitlich auf der Hauptseite
  // gemachten Änderungen (neue/umbenannte/gelöschte Projekte, Masttafel-
  // Importe usw.) sicher zu übernehmen; genau so vom Nutzer gewünscht.
  const projekteRefreshBtn = document.getElementById('ha-projekte-refresh');
  if (projekteRefreshBtn) {
    projekteRefreshBtn.addEventListener('click', () => { window.location.reload(); });
  }

  // ---------- Start ----------
  renderProjekteList();
})();
