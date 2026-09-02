// Sidebar collapse - scoped to the button's own page (the single-page-app
// shell keeps every page's markup in the DOM at once, just hidden, so an
// unscoped querySelector('.sidebar') would always hit the first page's
// sidebar instead of the one the button actually belongs to).
document.querySelectorAll('[data-collapse-sidebar]').forEach(btn => {
  btn.addEventListener('click', () => {
    const scope = btn.closest('.spa-page') || document;
    const sidebar = scope.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
  });
});

// Nav item selection (only for non-disabled items)
document.querySelectorAll('.nav-item:not(.disabled)').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// Toggle switches
document.querySelectorAll('.switch').forEach(sw => {
  sw.addEventListener('click', () => sw.classList.toggle('on'));
});

// Panel collapse
document.querySelectorAll('.panel-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.panel').classList.toggle('collapsed');
  });
});

// Discard / Save state (enable save button when a field changes) - also
// scoped to the element's own page for the same reason as the sidebar above.
document.querySelectorAll('.main input, .main select').forEach(el => {
  el.addEventListener('input', () => {
    const scope = el.closest('.spa-page') || document;
    const saveBtn = scope.querySelector('.btn-save');
    if (saveBtn) saveBtn.classList.add('active');
  });
});
document.querySelectorAll('.link-discard').forEach(el => {
  el.addEventListener('click', () => {
    const scope = el.closest('.spa-page') || document;
    const saveBtn = scope.querySelector('.btn-save');
    if (saveBtn) saveBtn.classList.remove('active');
  });
});

// ======================================================================
// Projekte-Seite: rendert die Projekttabelle aus der persistierten Liste
// (loadProjects(), siehe pKey()-Block weiter unten) statt aus statischem
// HTML, und stellt "Neues Projekt anlegen" sowie "Projekt löschen" bereit.
// Läuft als eigene, page-gescopte IIFE (Konvention dieser Datei), da sie
// erst ausgeführt wird, sobald loadProjects()/saveProjects()/nextProjectNr()/
// deleteAllProjectData() weiter unten in derselben Datei deklariert sind -
// zur Laufzeit (nicht beim Parsen) ist das dank Funktions-Hoisting kein
// Problem.
(function() {
  const tbody = document.getElementById('projekte-tbody');
  if (!tbody) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const STATUS_LABEL = { active: '● Aktiv', paused: '● Pausiert', done: '● Abgeschlossen' };

  function render() {
    const list = loadProjects();
    tbody.innerHTML = list.map((p) => `
      <tr data-href="uebersicht" data-project-nr="${esc(p.nr)}">
        <td class="nr">${esc(p.nr)}</td>
        <td class="name">${esc(p.name)}</td>
        <td class="addr">${esc(p.addr || '')}</td>
        <td>${esc(p.summe || '')}</td>
        <td><span class="badge ${esc(p.status || 'active')}">${STATUS_LABEL[p.status] || STATUS_LABEL.active}</span></td>
        <td><button type="button" class="link-action" data-project-delete="${esc(p.nr)}" style="color:var(--red);" title="Projekt löschen">✕</button></td>
      </tr>
    `).join('');

    // Zeilen-Klick navigiert über den Router (levelbuildGo, definiert in der
    // zusammengeführten HTML-Shell), fällt sonst auf eine echte Navigation
    // zurück (z. B. falls dieses Skript je auf einer Standalone-Seite läuft).
    tbody.querySelectorAll('tr[data-href]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-project-delete]')) return;
        const nr = row.getAttribute('data-project-nr');
        // Merkt sich, welches Projekt gerade geöffnet wurde, bevor es
        // überhaupt in den Router geht - alle projektspezifischen Daten
        // (Masttafel, Bauabschnitte, Tätigkeitslisten/Protokolle im Projekt,
        // ...) werden danach unter diesem Projekt gescoped gelesen/
        // geschrieben, siehe setCurrentProjectId()/pKey() weiter unten.
        if (nr && typeof setCurrentProjectId === 'function') setCurrentProjectId(nr);
        const target = row.getAttribute('data-href');
        if (window.levelbuildGo) window.levelbuildGo(target);
        else window.location.href = target + '.html';
      });
    });

    tbody.querySelectorAll('[data-project-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nr = btn.getAttribute('data-project-delete');
        const p = list.find((x) => x.nr === nr);
        const label = p ? (p.nr + ' - ' + p.name) : ('Projekt ' + nr);
        if (!window.confirm('"' + label + '" wirklich löschen? Sämtliche Daten dieses Projekts (Masttafel, Bauabschnitte, Bautagebücher, Dokumente, ...) gehen dabei unwiderruflich verloren.')) return;
        const next = loadProjects().filter((x) => x.nr !== nr);
        saveProjects(next);
        deleteAllProjectData(nr);
        render();
      });
    });
  }

  // ---------- "Neues Projekt anlegen"-Modal (nutzt das generische, page-
  // unabhängige Modal-Grundgerüst am Anfang von levelbuild.html) ----------
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  function openModal(title, bodyHtml, footerHtml) {
    if (!modalOverlay) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml || '';
    modalOverlay.hidden = false;
  }
  function closeModal() { if (modalOverlay) modalOverlay.hidden = true; }
  const modalCloseBtn = document.getElementById('modal-close');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  function openNewProjectModal() {
    openModal(
      'Neues Projekt anlegen',
      `<div class="field">
         <label>Projektname *</label>
         <div class="input-wrap"><input type="text" id="np-name" placeholder="z. B. Neubau Umspannwerk Ost"></div>
       </div>
       <div class="field">
         <label>Adresse</label>
         <div class="input-wrap"><input type="text" id="np-addr" placeholder="Straße, Ort"></div>
       </div>
       <div class="field">
         <label>Auftragssumme</label>
         <div class="input-wrap"><input type="text" id="np-summe" placeholder="z. B. 1.200.000,00 €"></div>
       </div>
       <div class="field">
         <label>Status</label>
         <div class="input-wrap">
           <select id="np-status">
             <option value="active">Aktiv</option>
             <option value="paused">Pausiert</option>
             <option value="done">Abgeschlossen</option>
           </select>
         </div>
       </div>`,
      `<button class="btn-primary" id="np-save">Projekt anlegen</button>
       <button class="matt-tool-btn" id="np-cancel">Abbrechen</button>`
    );
    const nameInput = document.getElementById('np-name');
    if (nameInput) nameInput.focus();
    const cancelBtn = document.getElementById('np-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    const saveBtn = document.getElementById('np-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const nameEl = document.getElementById('np-name');
      const name = (nameEl.value || '').trim();
      if (!name) { window.alert('Bitte einen Projektnamen eingeben.'); nameEl.focus(); return; }
      const addr = (document.getElementById('np-addr').value || '').trim();
      const summe = (document.getElementById('np-summe').value || '').trim();
      const status = document.getElementById('np-status').value || 'active';
      const list = loadProjects();
      const nr = nextProjectNr(list);
      list.push({ nr, name, addr, summe, status });
      saveProjects(list);
      closeModal();
      render();
    });
  }

  const newBtn = document.getElementById('projekte-new-btn');
  if (newBtn) newBtn.addEventListener('click', openNewProjectModal);

  // Wird vom Router bei jedem Aufruf der Projekte-Seite (auch beim initialen
  // Laden) aufgerufen - siehe showPage() weiter unten in levelbuild.html.
  // Bewusst kein sofortiger render()-Aufruf hier: loadProjects() greift auf
  // DEMO_PROJECTS/PROJECTS_KEY zu, die als const erst weiter unten in dieser
  // Datei deklariert werden (im Skript-Ausführungszeitpunkt dieser IIFE noch
  // nicht initialisiert - "temporal dead zone"). Der Router ruft diesen Hook
  // erst auf, nachdem app.js komplett geladen/ausgeführt wurde.
  window.levelbuildOnShowProjekte = render;
})();

// Filter tabs (Projekte page). "Vorlagen" is special-cased: unlike the
// status tabs (Aktiv/Pausiert/...), which just filter the project table
// (cosmetic only in this prototype - not actually wired to hide rows), it
// swaps the whole content area for the project-independent Vorlagen
// management panels (Tätigkeitslisten + Protokolle).
document.querySelectorAll('.filter-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isVorlagen = tab.getAttribute('data-tab') === 'vorlagen';
    const projectsEl = document.getElementById('projekte-tab-projects');
    const vorlagenEl = document.getElementById('projekte-tab-vorlagen');
    if (projectsEl) projectsEl.hidden = isVorlagen;
    if (vorlagenEl) vorlagenEl.hidden = !isVorlagen;
  });
});

// Masttafel: expand into the full drill-in view / collapse back to the overview
document.querySelectorAll('[data-expand-masttafel]').forEach(el => {
  el.addEventListener('click', () => {
    const def = document.getElementById('overview-default');
    const exp = document.getElementById('overview-expanded');
    if (def && exp) {
      def.style.display = 'none';
      exp.style.display = 'block';
      // The expanded table was rendered while this section was still
      // display:none (either at page load, or - in the single-page-app
      // shell - because the whole Übersicht page was hidden), so its sticky
      // column offsets were computed against zero-width elements. Recompute
      // now that it's actually visible.
      if (window.levelbuildOnShowUebersicht) window.levelbuildOnShowUebersicht();
    }
  });
});
document.querySelectorAll('[data-collapse-masttafel]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const def = document.getElementById('overview-default');
    const exp = document.getElementById('overview-expanded');
    if (def && exp) {
      exp.style.display = 'none';
      def.style.display = 'flex';
    }
  });
});

// Bauabschnitt segment switcher (e.g. "Bauabschnitt_PA01" in the Masttafel panel header)
document.querySelectorAll('[data-toggle-segment-menu]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = btn.nextElementSibling;
    const isOpen = !menu.hasAttribute('hidden');
    document.querySelectorAll('.segment-menu').forEach(m => m.setAttribute('hidden', ''));
    if (!isOpen) menu.removeAttribute('hidden');
  });
});
document.querySelectorAll('.segment-menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const switcher = item.closest('.segment-switcher');
    switcher.querySelectorAll('.segment-menu-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    switcher.querySelector('.segment-current').textContent = item.dataset.segment;
    item.parentElement.setAttribute('hidden', '');
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.segment-menu').forEach(m => m.setAttribute('hidden', ''));
});

// Dropzones: visual feedback when dragging a file over an empty-state area
document.querySelectorAll('.dropzone').forEach(zone => {
  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
    });
  });
});

// ======================================================================
// Aktuelles Projekt: jedes Projekt speichert seine Daten (Bauabschnitte,
// Masttafel-Importe, im Projekt übernommene Tätigkeitslisten/Protokolle,
// Mast-Zuordnungen/-Status/-Fotos, gespeicherte Masttafel-Ansichten) für
// sich - sonst würde z. B. eine in Projekt 67 eingelesene Masttafel auch in
// Projekt 66 auftauchen. Dafür bekommt jeder betroffene localStorage-
// Schlüssel über pKey() die Projektnummer angehängt. Welches Projekt gerade
// "offen" ist, merkt sich der Zeilen-Klick auf der Projekte-Seite (siehe
// oben) in sessionStorage - fällt ohne Auswahl auf 67 zurück (das einzige
// Projekt mit vorbefüllten Demo-Daten). Vorlagen (Tätigkeitslisten-/
// Protokoll-Vorlagen, PROTOKOLL_TEMPLATES_KEY/TEMPLATES_KEY) bleiben
// bewusst global, da sie per Definition keinem Projekt gehören.
// ======================================================================
const CURRENT_PROJECT_KEY = 'levelbuild_current_project';
const PROJECTS_KEY = 'levelbuild_projekte';
const DEMO_PROJECTS = [
  { nr: '67', name: 'Nordbrand Brauerei Sanierung', addr: 'Sundhäuser Str. 4', summe: '2.500.000,00 €', status: 'active' },
  { nr: '66', name: 'Wohnpark Elbaue – Neubau', addr: 'Elbuferweg 12', summe: '4.120.000,00 €', status: 'active' },
  { nr: '65', name: 'Logistikzentrum Nord', addr: 'Gewerbering 9', summe: '1.860.000,00 €', status: 'paused' },
  { nr: '64', name: 'Sanierung Rathaus Altstadt', addr: 'Marktplatz 1', summe: '980.000,00 €', status: 'done' },
];
// Projekte-Liste selbst: früher rein hardcodiert (DEMO_PROJECTS) und damit
// weder anlegbar noch löschbar - jetzt eine echte, persistierte Liste
// (bewusst NICHT pKey-gescoped, da die Liste der Projekte selbst logisch
// keinem einzelnen Projekt gehört). Beim allerersten Laden mit den bisherigen
// vier Demo-Projekten vorbefüllt, damit sich am bestehenden Demo-Stand nichts
// ändert.
function loadProjects() {
  let list;
  try { list = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null'); } catch (e) { list = null; }
  if (!Array.isArray(list)) {
    list = DEMO_PROJECTS.slice();
    saveProjects(list);
  }
  return list;
}
function saveProjects(list) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function nextProjectNr(list) {
  let max = 0;
  (list || []).forEach((p) => { const n = parseInt(p.nr, 10); if (!isNaN(n) && n > max) max = n; });
  return String(max + 1);
}
function currentProjectId() {
  try { return sessionStorage.getItem(CURRENT_PROJECT_KEY) || '67'; } catch (e) { return '67'; }
}
function setCurrentProjectId(nr) {
  try { sessionStorage.setItem(CURRENT_PROJECT_KEY, String(nr)); } catch (e) { /* ignore */ }
}
function currentProjectLabel() {
  const id = currentProjectId();
  const p = loadProjects().find((x) => x.nr === id);
  return p ? (p.nr + ' - ' + p.name) : ('Projekt ' + id);
}
// Nur der reine Projektname (ohne die vorangestellte Projektnummer) - für das
// PDF-Systemfeld "Projektname" (siehe PDF_SYSTEM_FELDER).
function currentProjectName() {
  const id = currentProjectId();
  const p = loadProjects().find((x) => x.nr === id);
  return p ? p.name : ('Projekt ' + id);
}
// Hängt die aktuelle Projektnummer an einen Basis-Schlüssel an - alle
// projektspezifischen load/save-Funktionen unten benutzen das statt des
// nackten *_KEY, damit dieselbe Konstante je nach offenem Projekt auf einen
// anderen localStorage-Eintrag zeigt.
function pKey(baseKey) {
  return baseKey + ':' + currentProjectId();
}
// Einmalige Migration: Daten, die schon vor dieser Projekt-Trennung unter
// dem alten, unskopierten Schlüssel gespeichert waren, gehören dem einzigen
// Projekt, das bisher tatsächlich benutzt wurde (67) - dorthin übernehmen,
// statt sie beim ersten Laden unter dem neuen Schema zu verlieren. Läuft
// gefahrlos bei jedem Seitenaufruf: kopiert nur, wenn unter dem neuen
// Schlüssel noch nichts steht.
function migrateToProjectScopedKey(baseKey) {
  try {
    const scoped = baseKey + ':67';
    if (localStorage.getItem(scoped) != null) return;
    const old = localStorage.getItem(baseKey);
    if (old == null) return;
    localStorage.setItem(scoped, old);
  } catch (e) { /* ignore */ }
}

// Beim Löschen eines Projekts müssen dessen projektspezifische Daten mit
// weggeräumt werden - sonst blieben z. B. Masttafel-Importe oder Bautage-
// bücher eines längst gelöschten Projekts als "Datenleiche" im localStorage
// zurück. Bewusst NICHT enthalten: PROTOKOLL_TEMPLATES_KEY/TEMPLATES_KEY
// (Vorlagen, projektübergreifend) und CURRENT_PROJECT_KEY (gehört keinem
// Projekt, sondern der Navigation selbst).
const PROJECT_SCOPED_BASE_KEYS = [
  'levelbuild_bauabschnitte',
  'levelbuild_masttafel_data',
  'levelbuild_masttafel_views',
  'levelbuild_leistungsverzeichnis',
  'levelbuild_fertigstellungsliste_views',
  'levelbuild_fertigstellungsliste_state',
  'levelbuild_fertigstellungsliste_aktive_liste',
  'levelbuild_protokolle_projekt',
  'levelbuild_taetigkeitslisten_projekt',
  'levelbuild_mast_taetigkeitsliste',
  'levelbuild_mast_aufgaben_status',
  'levelbuild_mast_protokoll_daten',
  'levelbuild_mast_fotos',
  'levelbuild_bautagebuecher',
  'levelbuild_mast_task_abschluss',
  'levelbuild_dokumente',
];
function deleteAllProjectData(nr) {
  PROJECT_SCOPED_BASE_KEYS.forEach((base) => {
    try { localStorage.removeItem(base + ':' + nr); } catch (e) { /* ignore */ }
  });
}

// ======================================================================
// Bauabschnitte (project construction-phase sections). Created/named in
// Projekteinstellungen, and read from here by the Masttafel view, which
// scopes all of its data to exactly one Bauabschnitt at a time (unless
// "Alle Bauabschnitte anzeigen" is selected). Persisted in localStorage so
// the list survives navigating between pages; kept in plain top-level scope
// (not inside an IIFE) so both the Masttafel view and the Projekteinstellungen
// page below can call into it.
// ======================================================================
const BAUABSCHNITTE_KEY = 'levelbuild_bauabschnitte';
migrateToProjectScopedKey(BAUABSCHNITTE_KEY);

function loadBauabschnitte() {
  let list;
  try { list = JSON.parse(localStorage.getItem(pKey(BAUABSCHNITTE_KEY)) || 'null'); } catch (e) { list = null; }
  if (!Array.isArray(list)) {
    // First-ever load: seed with the three example sections that used to be
    // hardcoded in the Masttafel UI, so the existing demo keeps working.
    list = [
      { id: 'ba-pa01', name: 'Bauabschnitt_PA01' },
      { id: 'ba-pa02', name: 'Bauabschnitt_PA02' },
      { id: 'ba-pa03', name: 'Bauabschnitt_PA03' },
    ];
    saveBauabschnitte(list);
  }
  return list;
}
function saveBauabschnitte(list) {
  try { localStorage.setItem(pKey(BAUABSCHNITTE_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeBauabschnittId() {
  return 'ba-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// The Masttafel's actual imported data (per Bauabschnitt) is persisted here
// too, so switching tabs (e.g. to Formular and back) doesn't wipe it - see
// saveMasttafelState()/loadMasttafelState() further down. This key alone is
// shared at the top level because Projekteinstellungen needs it too, to
// clean up a Bauabschnitt's data when it's deleted.
const MASTTAFEL_STATE_KEY = 'levelbuild_masttafel_data';
migrateToProjectScopedKey(MASTTAFEL_STATE_KEY);
function deleteMasttafelSectionData(id) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
  if (!saved || !saved.sections || !(id in saved.sections)) return;
  delete saved.sections[id];
  try { localStorage.setItem(pKey(MASTTAFEL_STATE_KEY), JSON.stringify(saved)); } catch (e) { /* ignore */ }
}
// Reads the physical spreadsheet columns of whichever imported Bauabschnitt
// has any (all Bauabschnitte are assumed to share the same Masttafel
// template, same assumption the "Alle Bauabschnitte anzeigen" merged view
// already makes elsewhere) - used to offer them as an auto-fill source for
// a Protokoll-Baustein ("Information kommt automatisch aus einer Masttafel-
// Spalte" instead of being typed in by hand on the phone).
function getKnownMasttafelColumns() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
  if (!saved || !saved.sections) return [];
  for (const id of Object.keys(saved.sections)) {
    const sec = saved.sections[id];
    if (sec && sec.columns && sec.columns.length) {
      return sec.columns.map((c) => ({ idx: c.idx, label: c.label }));
    }
  }
  return [];
}
// Liste aller tatsächlich eingelesenen Mastnummern (aus der importierten
// Masttafel) - je Zeile ist die Mastnummer die erste Spalte, gespeichert
// als rowsByKey-Eintrag mit `displayKey` (Originalschreibweise, im
// Gegensatz zum normalisierten Map-Schlüssel). Wenn ein Bauabschnitt
// angegeben ist, werden nur dessen Masten geliefert, sonst alle Masten
// des Projekts über alle Bauabschnitte hinweg. Wird von der Leistungen-
// Maske im Bautagebuch benutzt (Mastnr.-Auswahl statt Freitext).
function getMastNummernForBauabschnitt(bauabschnittId) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
  if (!saved || !saved.sections) return [];
  const ids = (bauabschnittId && saved.sections[bauabschnittId]) ? [bauabschnittId] : Object.keys(saved.sections);
  const seen = new Set();
  const result = [];
  ids.forEach((id) => {
    const sec = saved.sections[id];
    if (!sec || !sec.rowsByKey) return;
    sec.rowsByKey.forEach((pair) => {
      const key = pair[0];
      const entry = pair[1];
      const label = (entry && entry.displayKey) ? String(entry.displayKey) : String(key || '');
      if (label && !seen.has(label)) { seen.add(label); result.push(label); }
    });
  });
  result.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  return result;
}

// ======================================================================
// Projekteinstellungen: Bauabschnitte anlegen, umbenennen, löschen. Only
// runs on the Projekteinstellungen page (guarded by the #ba-list element).
// ======================================================================
(function () {
  const listEl = document.getElementById('ba-list');
  if (!listEl) return;

  function escHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function render() {
    const items = loadBauabschnitte();
    listEl.innerHTML = items.length
      ? items.map((b) => `
        <div class="col-config-row">
          <span>${escHtml(b.name)}</span>
          <span style="display:flex;gap:8px;">
            <button class="link-action" data-rename-ba="${escHtml(b.id)}">Umbenennen</button>
            <button class="link-action" data-delete-ba="${escHtml(b.id)}" style="color:var(--red);">Löschen</button>
          </span>
        </div>`).join('')
      : '<div class="changelog-empty">Noch keine Bauabschnitte angelegt.</div>';

    listEl.querySelectorAll('[data-rename-ba]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const items2 = loadBauabschnitte();
        const b = items2.find((x) => x.id === btn.getAttribute('data-rename-ba'));
        if (!b) return;
        const name = prompt('Neuer Name für diesen Bauabschnitt:', b.name);
        if (!name || !name.trim()) return;
        b.name = name.trim();
        saveBauabschnitte(items2);
        render();
      });
    });
    listEl.querySelectorAll('[data-delete-ba]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-ba');
        if (!confirm('Diesen Bauabschnitt wirklich löschen? Die zugehörigen Masttafel-Daten werden dabei ebenfalls gelöscht.')) return;
        const items2 = loadBauabschnitte().filter((x) => x.id !== id);
        saveBauabschnitte(items2);
        deleteMasttafelSectionData(id);
        render();
      });
    });
  }

  const addInput = document.getElementById('ba-new-name');
  const addBtn = document.getElementById('ba-add');
  function doAdd() {
    if (!addInput) return;
    const name = addInput.value.trim();
    if (!name) return;
    const items = loadBauabschnitte();
    items.push({ id: makeBauabschnittId(), name });
    saveBauabschnitte(items);
    addInput.value = '';
    render();
  }
  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (addInput) addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

  render();

  // Wie die Masttafel: dieses Skript läuft nur einmal, aber loadBauabschnitte()
  // ist jetzt pro Projekt gescoped (pKey()) - ohne diesen Hook würde die Liste
  // beim Wechsel zu einem anderen Projekt weiter die Bauabschnitte des vorher
  // geöffneten Projekts zeigen. Mehrere IIFEs auf dieser Seite (hier, sowie
  // die Tätigkeitslisten-/Protokolle-Projektlisten weiter unten) hängen sich
  // alle in denselben window.levelbuildOnShowProjekteinstellungen-Hook ein.
  const prevOnShowPE1 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE1) prevOnShowPE1();
    render();
  };
})();

// ======================================================================
// Leistungsverzeichnis (LV): pro Projekt aus einer Excel-Datei importierte,
// 3-stufige Positions-Hierarchie (Art -> Detail-Art -> Beschreibung
// Leistung). Jede Ebene trägt nur ihre eigene (Teil-)Nummer (z. B. Art
// "02", Detail-Art "05", Beschreibung Leistung "0401") - die vollständige
// LV-Positionsnummer ergibt sich erst als Konkatenation aller drei, wenn
// in der Leistungen-Maske des Bautagebuchs alle drei Ebenen ausgewählt
// wurden (siehe lvPosNummer()). Wird dort als Auswahl-Kaskade benutzt.
// ======================================================================
const LV_KEY = 'levelbuild_leistungsverzeichnis';
function loadLv() {
  try { return JSON.parse(localStorage.getItem(pKey(LV_KEY)) || 'null'); } catch (e) { return null; }
}
function saveLv(lv) {
  try { localStorage.setItem(pKey(LV_KEY), JSON.stringify(lv)); } catch (e) { /* ignore */ }
}
function makeLvId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// Reine Funktion (kein DOM-Zugriff) - gruppiert flache, bereits auf die 6
// Rollen gemappte Zeilen ({artNr, artBezeichnung, detailartNr,
// detailartBezeichnung, posNr, beschreibung}) zu der 3-stufigen
// Baumstruktur. Zeilen ohne alle drei Nummern werden übersprungen.
function buildLvHierarchy(rows) {
  const artMap = new Map();
  const arten = [];
  (rows || []).forEach((row) => {
    const artNr = String(row.artNr == null ? '' : row.artNr).trim();
    const detailartNr = String(row.detailartNr == null ? '' : row.detailartNr).trim();
    const posNr = String(row.posNr == null ? '' : row.posNr).trim();
    if (!artNr || !detailartNr || !posNr) return;
    let art = artMap.get(artNr);
    if (!art) {
      art = { id: makeLvId('lva'), nr: artNr, bezeichnung: String(row.artBezeichnung == null ? '' : row.artBezeichnung).trim(), detailarten: [] };
      artMap.set(artNr, art);
      arten.push(art);
    }
    let detailart = art.detailarten.find((d) => d.nr === detailartNr);
    if (!detailart) {
      detailart = { id: makeLvId('lvd'), nr: detailartNr, bezeichnung: String(row.detailartBezeichnung == null ? '' : row.detailartBezeichnung).trim(), leistungen: [] };
      art.detailarten.push(detailart);
    }
    detailart.leistungen.push({
      id: makeLvId('lvl'),
      nr: posNr,
      beschreibung: String(row.beschreibung == null ? '' : row.beschreibung).trim(),
      // Menge/Einheit sind optional (z. B. aus einem GAEB-Import mit
      // Vertragsmengen) - dienen in der Leistungen-Maske nur als
      // Vorschlag/Vorbelegung für Menge+Einheit, bleiben aber änderbar.
      menge: row.menge == null || row.menge === '' ? null : String(row.menge).trim(),
      einheit: row.einheit == null ? '' : String(row.einheit).trim(),
    });
  });
  return arten;
}
function lvPosNummer(artNr, detailartNr, posNr) {
  return [artNr, detailartNr, posNr].filter((x) => x !== null && x !== undefined && x !== '').join('.');
}
// ----------------------------------------------------------------------
// GAEB DA XML (.X81-.X86 / .D81-.D86 / .P81-.P86 - Format der Vergabe- und
// Vertragshandbuch-Schnittstelle, wie es AVA-Programme wie iTWO, ORCA,
// California o. ä. für den Austausch von Leistungsverzeichnissen benutzen)
// wird direkt per DOMParser gelesen. Das Format ist bereits vollständig
// hierarchisch (BoQCtgy-Kategorien, typischerweise 2 Ebenen wie
// "Bereich"/"Abschnitt", dann Item-Positionen mit RNoPart als jeweilige
// Teil-Nummer) - eine Spalten-Zuordnung wie beim Excel-Import ist hier
// nicht nötig, da Struktur und Nummern eindeutig aus der Datei hervorgehen.
// Reine Funktion (nur DOMParser, kein Zugriff auf app-eigene DOM-Elemente).
function isGaebXmlContent(text) {
  return typeof text === 'string' && /<GAEB[\s>]/.test(text.slice(0, 4000));
}
function gaebChildByTag(el, tagName) {
  if (!el) return null;
  for (let i = 0; i < el.children.length; i++) { if (el.children[i].tagName === tagName) return el.children[i]; }
  return null;
}
function gaebFindDeep(el, tagName) {
  if (!el) return null;
  if (el.tagName === tagName) return el;
  for (let i = 0; i < el.children.length; i++) {
    const found = gaebFindDeep(el.children[i], tagName);
    if (found) return found;
  }
  return null;
}
// el.textContent würde Text aus benachbarten <span>/<br/>-Elementen ohne
// jede Trennung aneinanderhängen (z. B. "Form" + "(DGN/DWG)" ->
// "Form(DGN/DWG)", da im XML-Quelltext selbst kein Leerzeichen zwischen
// den Tags steht) - daher hier stattdessen die Text-Knoten manuell
// einsammeln und nach jedem Element (bzw. bei <br/>) ein Leerzeichen
// einfügen, um die Wörter der einzelnen Text-Bausteine sauber zu trennen.
function gaebText(el) {
  if (!el) return '';
  const parts = [];
  function walk(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue) parts.push(node.nodeValue);
    } else if (node.nodeType === 1) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      parts.push(' ');
    }
  }
  walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
function gaebOutlineText(itemEl) {
  const desc = gaebChildByTag(itemEl, 'Description');
  if (!desc) return '';
  const outl = gaebFindDeep(desc, 'TextOutlTxt');
  if (outl) { const t = gaebText(outl); if (t) return t; }
  const detail = gaebFindDeep(desc, 'DetailTxt');
  if (detail) { const t = gaebText(detail); if (t) return t.length > 300 ? t.slice(0, 300) + '…' : t; }
  return '';
}
function parseGaebXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Ungültiges GAEB/XML - Datei konnte nicht geparst werden.');
  const boq = doc.getElementsByTagName('BoQ')[0];
  if (!boq) throw new Error('Kein Leistungsverzeichnis (BoQ) in dieser Datei gefunden.');
  const boqBody = gaebChildByTag(boq, 'BoQBody');
  if (!boqBody) throw new Error('Das Leistungsverzeichnis in dieser Datei enthält keine Positionen.');
  const rows = [];
  function itemToRow(itemEl, path) {
    const posNr = itemEl.getAttribute('RNoPart') || '';
    const menge = gaebText(gaebChildByTag(itemEl, 'Qty'));
    const einheit = gaebText(gaebChildByTag(itemEl, 'QU'));
    const beschreibung = gaebOutlineText(itemEl) || '(ohne Beschreibung)';
    const art = path[0] || { nr: '', bezeichnung: '' };
    const detailart = path[1] || { nr: '00', bezeichnung: 'Allgemein' };
    rows.push({ artNr: art.nr, artBezeichnung: art.bezeichnung, detailartNr: detailart.nr, detailartBezeichnung: detailart.bezeichnung, posNr, beschreibung, menge, einheit });
  }
  function walk(bodyEl, path) {
    for (let i = 0; i < bodyEl.children.length; i++) {
      const child = bodyEl.children[i];
      if (child.tagName === 'BoQCtgy') {
        const nr = child.getAttribute('RNoPart') || '';
        const bezeichnung = gaebText(gaebChildByTag(child, 'LblTx'));
        const subBody = gaebChildByTag(child, 'BoQBody');
        if (subBody) walk(subBody, path.concat([{ nr, bezeichnung }]));
      } else if (child.tagName === 'Itemlist') {
        for (let j = 0; j < child.children.length; j++) {
          if (child.children[j].tagName === 'Item') itemToRow(child.children[j], path);
        }
      } else if (child.tagName === 'Item') {
        itemToRow(child, path);
      }
      // 'Remark' (Vorbemerkungen/Erläuterungstexte ohne eigene Positions-
      // nummer) wird bewusst übersprungen - das sind keine Leistungen.
    }
  }
  walk(boqBody, []);
  if (!rows.length) throw new Error('In dieser GAEB-Datei wurden keine Positionen (Items) gefunden.');
  return rows;
}
function lvCounts(arten) {
  let detailarten = 0, leistungen = 0;
  (arten || []).forEach((a) => {
    detailarten += a.detailarten.length;
    a.detailarten.forEach((d) => { leistungen += d.leistungen.length; });
  });
  return { arten: (arten || []).length, detailarten, leistungen };
}
// Kleines eingebautes Demo-LV - wird von der "Allg. LV laden"-Option in
// der Leistungen-Maske benutzt, damit sich die Kaskade auch ohne eigenen
// Excel-Import ausprobieren lässt bzw. für allgemeine (nicht im
// projektspezifischen LV enthaltene) Leistungen.
const GENERIC_LV_ARTEN = buildLvHierarchy([
  { artNr: '01', artBezeichnung: 'Baustelleneinrichtung', detailartNr: '01', detailartBezeichnung: 'Einrichten der Baustelle', posNr: '0001', beschreibung: 'Leistung, Baustelle einrichten' },
  { artNr: '01', artBezeichnung: 'Baustelleneinrichtung', detailartNr: '02', detailartBezeichnung: 'Räumen der Baustelle', posNr: '0001', beschreibung: 'Leistung, Baustelle räumen' },
  { artNr: '02', artBezeichnung: 'Gründungen und Maste', detailartNr: '05', detailartBezeichnung: 'Rammrohrgründung für Aufsetzmaste', posNr: '0401', beschreibung: 'Leistung, Rammrohrgründung für Doppel-Stahlprofilmast Rohr bis 5 m MLV-OLA_02050401' },
  { artNr: '02', artBezeichnung: 'Gründungen und Maste', detailartNr: '05', detailartBezeichnung: 'Rammrohrgründung für Aufsetzmaste', posNr: '0402', beschreibung: 'Leistung, Rammrohrgründung für Doppel-Stahlprofilmast Rohr bis 10 m MLV-OLA_02050402' },
  { artNr: '02', artBezeichnung: 'Gründungen und Maste', detailartNr: '10', detailartBezeichnung: 'Bohrpfahlgründung', posNr: '0101', beschreibung: 'Leistung, Bohrpfahlgründung Durchmesser 60 cm' },
  { artNr: '03', artBezeichnung: 'Kabelverlegung', detailartNr: '01', detailartBezeichnung: 'Kabelgraben herstellen', posNr: '0001', beschreibung: 'Leistung, Kabelgraben herstellen und verfüllen' },
]);

// ======================================================================
// Leistungsverzeichnis-Seite: Excel-Import (Spalten-Mapping) + Vorschau
// der importierten Positionen. Only runs on the Leistungsverzeichnis page
// (guarded by #lv-import-btn).
// ======================================================================
(function () {
  const importBtn = document.getElementById('lv-import-btn');
  if (!importBtn) return;
  const importInput = document.getElementById('lv-import-input');
  const summaryEl = document.getElementById('lv-current-summary');
  const treeEl = document.getElementById('lv-tree-preview');
  const countEl = document.getElementById('lv-tree-count');

  // Lokaler Modal-Helfer - teilt sich die eine globale #modal-overlay mit
  // den anderen Seiten-IIFEs (siehe z. B. die Bautagebuch-Detail-Seite),
  // aber jede Seite verdrahtet sie unabhängig für sich selbst.
  const modalOverlayLv = document.getElementById('modal-overlay');
  const modalTitleLv = document.getElementById('modal-title');
  const modalBodyLv = document.getElementById('modal-body');
  const modalFooterLv = document.getElementById('modal-footer');
  function openModalLv(title, bodyHtml, footerHtml) {
    if (!modalOverlayLv) return;
    modalTitleLv.textContent = title;
    modalBodyLv.innerHTML = bodyHtml;
    modalFooterLv.innerHTML = footerHtml || '';
    modalOverlayLv.hidden = false;
  }
  function closeModalLv() { if (modalOverlayLv) modalOverlayLv.hidden = true; }

  function escHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  const LV_ROLES = [
    { key: 'artNr', label: 'Art – Nr.', hints: ['art-nr', 'artnr', 'titel-nr', 'titelnr'] },
    { key: 'artBezeichnung', label: 'Art – Bezeichnung', hints: ['art-bezeichnung', 'artbezeichnung', 'titel-bezeichnung', 'titelbezeichnung'] },
    { key: 'detailartNr', label: 'Detail-Art – Nr.', hints: ['detailart-nr', 'detailartnr', 'detail-art-nr', 'los-nr', 'losnr'] },
    { key: 'detailartBezeichnung', label: 'Detail-Art – Bezeichnung', hints: ['detailart-bezeichnung', 'detailartbezeichnung', 'los-bezeichnung'] },
    { key: 'posNr', label: 'Positions-Nr.', hints: ['positions-nr', 'position-nr', 'positionsnr', 'pos-nr', 'posnr'] },
    { key: 'beschreibung', label: 'Leistungsbezeichnung', hints: ['leistungsbezeichnung', 'leistungstext', 'beschreibung', 'bezeichnung', 'kurztext', 'langtext'] },
  ];
  function guessColumnIndex(headers, hints) {
    const norm = headers.map((h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const hint of hints) {
      const hintNorm = hint.replace(/[^a-z0-9]/g, '');
      const idx = norm.findIndex((h) => h.includes(hintNorm));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function renderSummary() {
    const lv = loadLv();
    if (!lv || !lv.arten || !lv.arten.length) {
      summaryEl.innerHTML = '<div class="changelog-empty">Noch kein Leistungsverzeichnis importiert.</div>';
      if (countEl) countEl.textContent = '0';
      if (treeEl) treeEl.innerHTML = '<div class="changelog-empty">Noch keine Positionen.</div>';
      return;
    }
    const c = lvCounts(lv.arten);
    summaryEl.innerHTML = `
      <div class="col-config-row">
        <span><strong>${escHtml(lv.dateiname || 'Leistungsverzeichnis')}</strong> · importiert am ${escHtml(fmtDatumLv(lv.importedAt))} · ${c.arten} Art(en), ${c.detailarten} Detail-Art(en), ${c.leistungen} Position(en)</span>
        <span style="display:flex; gap:8px;">
          <button class="link-action" id="lv-reimport">Erneut importieren</button>
          <button class="link-action" id="lv-delete" style="color:var(--red);">Löschen</button>
        </span>
      </div>`;
    const reimportBtn = document.getElementById('lv-reimport');
    if (reimportBtn) reimportBtn.addEventListener('click', () => importInput.click());
    const deleteBtn = document.getElementById('lv-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (!confirm('Das importierte Leistungsverzeichnis wirklich löschen?')) return;
      saveLv(null);
      renderSummary();
    });
    if (countEl) countEl.textContent = String(c.leistungen);
    if (treeEl) {
      treeEl.innerHTML = lv.arten.map((a) => `
        <div class="lv-tree-art">
          <div class="lv-tree-art-head">${escHtml(a.nr)} ${escHtml(a.bezeichnung)}</div>
          ${a.detailarten.map((d) => `
            <div class="lv-tree-detailart">
              <div class="lv-tree-detailart-head">${escHtml(a.nr)}.${escHtml(d.nr)} ${escHtml(d.bezeichnung)}</div>
              ${d.leistungen.map((l) => `<div class="lv-tree-leistung"><span class="lv-tree-leistung-nr">${escHtml(lvPosNummer(a.nr, d.nr, l.nr))}</span> ${escHtml(l.beschreibung)}</div>`).join('')}
            </div>`).join('')}
        </div>`).join('');
    }
  }
  function fmtDatumLv(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleDateString('de-DE');
  }

  function openMappingModal(headers, aoaRows, fileName) {
    const rows = aoaRows.slice(0, 400); // Sicherheitsgrenze für sehr große Dateien
    const selects = LV_ROLES.map((role) => {
      const guess = guessColumnIndex(headers, role.hints);
      const options = headers.map((h, i) => `<option value="${i}"${i === guess ? ' selected' : ''}>${escHtml(h || '(Spalte ' + (i + 1) + ')')}</option>`).join('');
      return `
        <div class="field">
          <label>${escHtml(role.label)}</label>
          <div class="input-wrap">
            <select id="lv-map-${role.key}">${options}</select>
            <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
        </div>`;
    }).join('');
    const previewRows = rows.slice(0, 5);
    const previewHtml = `
      <div style="overflow-x:auto; margin-top:10px;">
        <table class="bt-list-table" style="min-width:600px;">
          <thead><tr>${headers.map((h, i) => `<th>${escHtml(h || 'Spalte ' + (i + 1))}</th>`).join('')}</tr></thead>
          <tbody>${previewRows.map((r) => `<tr>${headers.map((_, i) => `<td>${escHtml(r[i])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    openModalLv('Spalten zuordnen', `
      <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:12px;">
        „${escHtml(fileName)}" - ${aoaRows.length} Zeile(n) gefunden. Bitte die Spalten den drei LV-Ebenen zuordnen (Vorbelegung wurde anhand der Spaltenüberschriften geraten).
      </div>
      ${selects}
      ${previewHtml}
    `, `
      <button class="matt-tool-btn" id="lv-map-cancel">Abbrechen</button>
      <button class="btn-primary" id="lv-map-confirm">Importieren</button>
    `);
    document.getElementById('lv-map-cancel').addEventListener('click', closeModalLv);
    document.getElementById('lv-map-confirm').addEventListener('click', () => {
      const mapping = {};
      LV_ROLES.forEach((role) => { mapping[role.key] = parseInt(document.getElementById('lv-map-' + role.key).value, 10); });
      const mappedRows = aoaRows.map((r) => ({
        artNr: r[mapping.artNr],
        artBezeichnung: r[mapping.artBezeichnung],
        detailartNr: r[mapping.detailartNr],
        detailartBezeichnung: r[mapping.detailartBezeichnung],
        posNr: r[mapping.posNr],
        beschreibung: r[mapping.beschreibung],
      }));
      const arten = buildLvHierarchy(mappedRows);
      saveLv({ dateiname: fileName, importedAt: new Date().toISOString(), arten });
      closeModalLv();
      renderSummary();
    });
  }

  // Zeigt vor dem eigentlichen Import eine kurze Zusammenfassung + Baum-
  // Vorschau eines per GAEB-Datei eingelesenen LV an (Spalten-Zuordnung
  // entfällt hier, da Struktur/Nummern schon eindeutig aus der Datei
  // hervorgehen).
  function openGaebConfirmModal(rows, fileName) {
    const arten = buildLvHierarchy(rows);
    const c = lvCounts(arten);
    const previewArten = arten.slice(0, 3);
    const previewHtml = previewArten.map((a) => `
      <div class="lv-tree-art">
        <div class="lv-tree-art-head">${escHtml(a.nr)} ${escHtml(a.bezeichnung)}</div>
        ${a.detailarten.slice(0, 4).map((d) => `
          <div class="lv-tree-detailart">
            <div class="lv-tree-detailart-head">${escHtml(a.nr)}.${escHtml(d.nr)} ${escHtml(d.bezeichnung)}</div>
            ${d.leistungen.slice(0, 3).map((l) => `<div class="lv-tree-leistung"><span class="lv-tree-leistung-nr">${escHtml(lvPosNummer(a.nr, d.nr, l.nr))}</span> ${escHtml(l.beschreibung)}</div>`).join('')}
          </div>`).join('')}
      </div>`).join('');
    openModalLv('GAEB-Leistungsverzeichnis importieren', `
      <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:12px;">
        „${escHtml(fileName)}" erkannt als GAEB-Datei. Gefunden: ${c.arten} Art(en), ${c.detailarten} Detail-Art(en), ${c.leistungen} Position(en). Eine Spalten-Zuordnung ist hier nicht nötig - die Nummern-Hierarchie und Bezeichnungen stammen direkt aus der Datei.
      </div>
      ${previewHtml}
      ${arten.length > 3 ? `<div style="font-size:12px; color:var(--gray-500); margin-top:8px;">… und ${arten.length - 3} weitere Art(en).</div>` : ''}
    `, `
      <button class="matt-tool-btn" id="lv-gaeb-cancel">Abbrechen</button>
      <button class="btn-primary" id="lv-gaeb-confirm">Importieren</button>
    `);
    document.getElementById('lv-gaeb-cancel').addEventListener('click', closeModalLv);
    document.getElementById('lv-gaeb-confirm').addEventListener('click', () => {
      saveLv({ dateiname: fileName, importedAt: new Date().toISOString(), arten });
      closeModalLv();
      renderSummary();
    });
  }

  // Zip-Dateien (also auch .xlsx/.xls im OOXML-Format) beginnen immer mit
  // der Signatur "PK". Alles andere wird als Text (UTF-8) versucht zu lesen
  // und auf ein GAEB-DA-XML-Wurzelelement geprüft - so ist der Import
  // unabhängig von der tatsächlichen Dateiendung (GAEB-Dateien kommen in
  // der Praxis mit ganz unterschiedlichen Endungen wie .X81-.X86, .D81-
  // .D86, .P81-.P86 oder sogar frei benannt vor).
  function looksLikeZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  }
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bytes = new Uint8Array(evt.target.result);
      try {
        if (looksLikeZip(bytes)) {
          const wb = XLSX.read(bytes, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!aoa.length) throw new Error('empty sheet');
          const headers = aoa[0].map((h) => String(h == null ? '' : h).trim());
          const dataRows = aoa.slice(1).filter((r) => r.some((c) => String(c == null ? '' : c).trim() !== ''));
          if (!dataRows.length) throw new Error('no data rows');
          openMappingModal(headers, dataRows, file.name);
          return;
        }
        const text = new TextDecoder('utf-8').decode(bytes);
        if (isGaebXmlContent(text)) {
          const rows = parseGaebXml(text);
          openGaebConfirmModal(rows, file.name);
          return;
        }
        throw new Error('unrecognized format');
      } catch (err) {
        console.error('LV-Import fehlgeschlagen:', err);
        alert('Diese Datei konnte nicht gelesen werden. Unterstützt werden Excel-Dateien (.xlsx/.xls) und GAEB-Dateien (GAEB DA XML, z. B. .X81-.X86/.D81-.D86/.P81-.P86).');
      }
    };
    reader.readAsArrayBuffer(file);
  }
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    handleFile(file);
    importInput.value = '';
  });

  renderSummary();
  window.levelbuildOnShowLeistungsverzeichnis = function () { renderSummary(); };
})();

// ======================================================================
// Fertigstellungsliste: tabellarische Übersicht (Standorte x Tätigkeiten)
// über ALLE im Projekt tatsächlich verwendeten Tätigkeitslisten hinweg -
// nicht jede Spalte (Tätigkeit) trifft auf jeden Standort zu, weil den
// Standorten unterschiedliche Tätigkeitslisten zugeordnet sein können
// (siehe MAST_TL_ASSIGNMENT_KEY). Rein lesend: Spalten/Zeilen ergeben sich
// live aus den vorhandenen Tätigkeitslisten/Zuordnungen/Masttafel-Daten, es
// wird hier selbst nichts gespeichert außer beim eigentlichen Abschluss
// einer Tätigkeit (das passiert in handyapp.js über applyTaskAbschluss(),
// nicht hier).
// ======================================================================
(function () {
  const contentEl = document.getElementById('fzl-content');
  if (!contentEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function escAttrFzl(v) {
    return String(v == null ? '' : v).replace(/"/g, '&quot;');
  }
  function fmtDatumFzl(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return iso || '';
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  // Lokaler Modal-Helfer - teilt sich die eine globale #modal-overlay mit
  // den anderen Seiten-IIFEs, verdrahtet sie aber unabhängig für sich.
  const modalOverlayFzl = document.getElementById('modal-overlay');
  const modalTitleFzl = document.getElementById('modal-title');
  const modalBodyFzl = document.getElementById('modal-body');
  const modalFooterFzl = document.getElementById('modal-footer');
  function openModalFzl(title, bodyHtml, footerHtml) {
    if (!modalOverlayFzl) return;
    modalTitleFzl.textContent = title;
    modalBodyFzl.innerHTML = bodyHtml;
    modalFooterFzl.innerHTML = footerHtml || '';
    modalOverlayFzl.hidden = false;
  }
  function closeModalFzl() { if (modalOverlayFzl) modalOverlayFzl.hidden = true; }

  // ---------- Ansichten: welche Spalten (Aufgaben + Masttafel) sichtbar
  // sind, in welcher Reihenfolge und welche davon fixiert ("Fixieren") sind.
  // "state" ist die aktuell aktive, sofort wirksame Auswahl (bleibt über
  // Seitenwechsel/Reload erhalten); "views" sind benannte, gespeicherte
  // Schnappschüsse davon, zwischen denen man umschalten kann - dasselbe
  // Grundprinzip wie die "Gespeicherten Ansichten" der Masttafel. ----------
  const FZL_VIEWS_KEY = 'levelbuild_fertigstellungsliste_views';
  const FZL_STATE_KEY = 'levelbuild_fertigstellungsliste_state';
  const FZL_ACTIVE_LIST_KEY = 'levelbuild_fertigstellungsliste_aktive_liste';
  migrateToProjectScopedKey(FZL_VIEWS_KEY);
  migrateToProjectScopedKey(FZL_STATE_KEY);
  migrateToProjectScopedKey(FZL_ACTIVE_LIST_KEY);
  function loadFzlViews() {
    try { return JSON.parse(localStorage.getItem(pKey(FZL_VIEWS_KEY)) || '[]'); } catch (e) { return []; }
  }
  function saveFzlViews(list) {
    try { localStorage.setItem(pKey(FZL_VIEWS_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function loadFzlState() {
    try { return JSON.parse(localStorage.getItem(pKey(FZL_STATE_KEY)) || 'null'); } catch (e) { return null; }
  }
  function saveFzlState(state) {
    try { localStorage.setItem(pKey(FZL_STATE_KEY), JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  // Welche Tätigkeitsliste gerade allein betrachtet wird - '__all__' steht
  // für die Gesamtansicht (Standard). Getrennt von FZL_STATE_KEY gespeichert,
  // weil das Umschalten der Liste nichts mit den gespeicherten Spalten-
  // Ansichten zu tun hat.
  function loadFzlActiveListId() {
    try { return localStorage.getItem(pKey(FZL_ACTIVE_LIST_KEY)) || '__all__'; } catch (e) { return '__all__'; }
  }
  function saveFzlActiveListId(id) {
    try { localStorage.setItem(pKey(FZL_ACTIVE_LIST_KEY), id); } catch (e) { /* ignore */ }
  }
  // order: null bedeutet "natürliche Reihenfolge" (Aufgaben in Reihenfolge
  // ihres ersten Auftretens, danach Masttafel-Spalten) - so bleibt die
  // Standardansicht automatisch aktuell, wenn Tätigkeiten ergänzt/entfernt
  // werden. Ein Array ist eine bewusste Reihenfolge-Momentaufnahme (per
  // Ziehen im Konfigurations-Dialog sortiert); neu hinzukommende Spalten,
  // die darin noch nicht vorkommen, werden beim Anzeigen einfach hinten
  // angehängt, statt zu verschwinden. hidden = explizit ausgeblendete
  // Spalten-Keys (unabhängig von order). frozen = fixierte Spalten-Keys.
  function currentFzlConfig(allCols) {
    const st = loadFzlState();
    // Solange noch nie ein Zustand gespeichert wurde (frischer Start), sind
    // Masttafel-Spalten standardmäßig ausgeblendet - nur Aufgaben-Spalten
    // werden von Anfang an gezeigt. Sobald der Nutzer einmal über "Spalten
    // konfigurieren" etwas übernimmt/speichert, gilt ab dann ausschließlich
    // die gespeicherte hidden-Liste (auch wenn sie leer ist).
    const hidden = (st && Array.isArray(st.hidden))
      ? st.hidden
      : (allCols || []).filter((c) => c.isMt).map((c) => c.key);
    return {
      activeViewName: (st && st.activeViewName) || null,
      order: (st && Array.isArray(st.order)) ? st.order : null,
      hidden,
      frozen: (st && Array.isArray(st.frozen)) ? st.frozen : [],
    };
  }
  // Aufgaben-Spalten (schon fertig aufgebaut - je nach Gesamt-/Einzelansicht
  // unterschiedlich, siehe buildTaskColumns/buildSingleListColumns) und
  // Masttafel-Spalten in EINER gemeinsamen Liste, damit sich beide Arten
  // zusammen frei anordnen lassen (nicht getrennt in zwei Blöcken).
  // Masttafel-Spalten bekommen den Schlüssel-Namensraum "mt::", der nie mit
  // den Aufgaben-Schlüsseln ("titel::"/"solo::"/"solo1::") kollidiert.
  function buildAllColumns(taskCols, mtCols) {
    const tagged = (taskCols || []).map((c) => Object.assign({ isMt: false }, c));
    const mtColsTagged = (mtCols || []).map((c) => ({ key: 'mt::' + c.idx, label: c.label, idx: c.idx, isMt: true }));
    return tagged.concat(mtColsTagged);
  }
  // Wendet eine gespeicherte Reihenfolge auf die aktuell vorhandenen Spalten
  // an: bekannte Schlüssel in der gespeicherten Reihenfolge zuerst, alles
  // andere (neu hinzugekommene Spalten, oder wenn noch gar keine Reihenfolge
  // gespeichert ist) danach in natürlicher Reihenfolge angehängt.
  function orderedAllColumns(allCols, config) {
    const byKey = new Map(allCols.map((c) => [c.key, c]));
    const seq = [];
    const seen = new Set();
    (config.order || []).forEach((key) => {
      if (byKey.has(key) && !seen.has(key)) { seq.push(byKey.get(key)); seen.add(key); }
    });
    allCols.forEach((c) => { if (!seen.has(c.key)) { seq.push(c); seen.add(c.key); } });
    return seq;
  }

  // Gruppiert alle eingelesenen Standorte nach ihrem Bauabschnitt (in der
  // Reihenfolge der Bauabschnitte aus den Projekteinstellungen), innerhalb
  // jeder Gruppe alphanumerisch nach Bezeichnung sortiert. Dieselbe
  // rowsByKey-Struktur wie die Masttafel selbst - "entry" wird mitgegeben,
  // damit optionale Masttafel-Spalten den Zellwert der jeweils aktuellsten
  // Version auflösen können.
  function collectGroups() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
    const bauabschnitte = loadBauabschnitte();
    const groups = [];
    if (!saved || !saved.sections) return groups;
    bauabschnitte.forEach((ba) => {
      const sec = saved.sections[ba.id];
      if (!sec || !sec.rowsByKey || !sec.rowsByKey.length) return;
      const rows = sec.rowsByKey.map((pair) => {
        const mastKey = pair[0];
        const entry = pair[1];
        const label = (entry && entry.displayKey) ? String(entry.displayKey) : String(mastKey || '');
        return { mastKey, label, entry };
      });
      rows.sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
      groups.push({ bauabschnittName: ba.name, rows });
    });
    return groups;
  }

  // Fasst gleichnamige Aufgaben verschiedener Tätigkeitslisten zu EINER
  // Spalte zusammen (z.B. "Rammen" in "Tiefgründung für Fertigteilfundament"
  // UND in "Tiefgründung für Ortbetonkopf" -> nur eine "Rammen"-Spalte statt
  // zwei nebeneinander). Aufgaben ganz ohne Titel werden NICHT zusammen-
  // geführt (zu unsicher, ob das wirklich dieselbe Tätigkeit ist) - die
  // bleiben je Liste eine eigene Spalte, zur Unterscheidung mit Listenname
  // im Titel. Reihenfolge = erstes Auftreten über die Listen hinweg. Wird
  // NUR in der Gesamtansicht benutzt - dort ist das Zusammenführen sinnvoll,
  // weil mehrere Listen gleichzeitig gezeigt werden.
  function buildTaskColumns(usedLists) {
    const map = new Map();
    usedLists.forEach((l) => {
      (l.tasks || []).forEach((t) => {
        const titel = String(t.titel || '').trim();
        const key = titel ? ('titel::' + titel.toLowerCase()) : ('solo::' + l.id + '::' + t.id);
        const label = titel || `(ohne Titel) – ${l.name}`;
        if (!map.has(key)) map.set(key, { key, label, entries: [] });
        map.get(key).entries.push({ listId: l.id, listName: l.name, taskId: t.id });
      });
    });
    return Array.from(map.values());
  }

  // Baut die Spalten für die Einzelansicht EINER Tätigkeitsliste: jede
  // Aufgabe bekommt ihre eigene Spalte, in der natürlichen Reihenfolge der
  // Liste - kein Zusammenführen nötig, weil hier ohnehin nur eine einzige
  // Liste gezeigt wird (es kann also gar keine Überlappung geben). Der
  // Schlüssel-Namensraum "solo1::" ist bewusst ein anderer als der von
  // buildTaskColumns ("titel::"/"solo::"), damit eine für die Gesamtansicht
  // gespeicherte Spalten-Reihenfolge/-Sichtbarkeit nicht versehentlich mit
  // der einer Einzelansicht kollidiert.
  function buildSingleListColumns(list) {
    if (!list) return [];
    return (list.tasks || []).map((t) => ({
      key: 'solo1::' + list.id + '::' + t.id,
      label: String(t.titel || '').trim() || '(ohne Titel)',
      entries: [{ listId: list.id, listName: list.name, taskId: t.id }],
    }));
  }

  function mtColValue(entry, idx) {
    if (!entry || !entry.versions || !entry.versions.length) return '';
    const latest = entry.versions[entry.versions.length - 1];
    const v = latest && latest.values ? latest.values[idx] : undefined;
    return v != null ? String(v) : '';
  }

  // ---------- Sortierung/Filter: eigenständiger, sitzungsweiter Zustand
  // (nicht Teil der gespeicherten Ansichten - ändert sich zu situativ, genau
  // wie bei der Masttafel eigenständig vom Ansichten-Konzept getrennt).
  // fzlSortCol/fzlFilters benutzen dieselben Spalten-Keys wie die Spalten
  // selbst, plus den Sonderwert '__standort__' für die Standort-Spalte.
  // fzlFilters: Spalten-Key -> Set der erlaubten Anzeige-Werte (Excel-
  // artiges Mehrfachauswahl-Popover, wie ursprünglich) - Standort/Masttafel-
  // Spalten filtern nach ihrem tatsächlichen Text, Aufgaben-Spalten nach
  // dem tatsächlichen Abschlussdatum (bzw. "Offen"/"Entfällt") - NICHT nur
  // nach der groben Kategorie erledigt/nicht erledigt. ----------
  let fzlSortCol = null;
  let fzlSortDir = 'asc';
  let fzlFilters = new Map();

  function compareFzlValues(a, b) {
    const na = a == null ? '' : String(a);
    const nb = b == null ? '' : String(b);
    if (na === '' && nb === '') return 0;
    if (na === '') return -1;
    if (nb === '') return 1;
    return na.localeCompare(nb, 'de', { numeric: true, sensitivity: 'base' });
  }
  // Anzeige-/Filterwert EINER Zelle plus ein separater, korrekt sortierbarer
  // Schlüssel (echte Daten wie "27.07.2026" lassen sich alphabetisch nicht
  // richtig ordnen - dafür sortKey = das rohe ISO-Datum; "Offen"/"Entfällt"
  // bekommen einen künstlichen, ans Ende sortierenden Schlüssel).
  function cellFilterInfo(c, m, assignedListId, mastAbschluss) {
    if (!c) return { display: '', sortKey: '' };
    if (c.isMt) {
      const v = mtColValue(m.entry, c.idx);
      const display = v && v.trim() ? v : '(leer)';
      return { display, sortKey: display.toLowerCase() };
    }
    const match = c.entries.find((e) => e.listId === assignedListId);
    if (!match) return { display: 'Entfällt', sortKey: 'zzz9-entfaellt' };
    const done = mastAbschluss[match.taskId];
    if (done && done.datum) return { display: fmtDatumFzl(done.datum), sortKey: done.datum };
    return { display: 'Offen', sortKey: 'zzz1-offen' };
  }
  // Wert einer Zelle für Filter-Abgleich/Anzeige: bei Aufgaben-Spalten das
  // tatsächliche Abschlussdatum (bzw. "Offen"/"Entfällt"), bei Masttafel-
  // Spalten der tatsächliche Zellwert.
  function cellFilterValue(c, m, assignedListId, mastAbschluss) {
    return cellFilterInfo(c, m, assignedListId, mastAbschluss).display;
  }
  // Wert/Info einer Zelle für die Sortierung: { na: Spalte trifft auf diesen
  // Standort gar nicht zu (entfällt) - sortiert unabhängig von der Richtung
  // immer ans Ende; val: eigentlicher Vergleichswert (Abschlussdatum bzw.
  // Masttafel-Zellwert) }.
  function cellSortInfo(c, m, assignedListId, mastAbschluss) {
    if (!c) return { na: false, val: '' };
    if (c.isMt) return { na: false, val: mtColValue(m.entry, c.idx) };
    const match = c.entries.find((e) => e.listId === assignedListId);
    if (!match) return { na: true, val: '' };
    const done = mastAbschluss[match.taskId];
    return { na: false, val: (done && done.datum) ? done.datum : '' };
  }
  // Prüft, ob ein Standort nach den aktuell aktiven Spaltenfiltern sichtbar
  // bleiben soll (UND über alle Spalten mit aktivem Filter hinweg).
  function rowMatchesFilters(m, allCols, assignedListId, mastAbschluss) {
    for (const [colKey, allowed] of fzlFilters.entries()) {
      const display = colKey === '__standort__' ? m.label : cellFilterValue(allCols.find((c) => c.key === colKey), m, assignedListId, mastAbschluss);
      if (!allowed.has(display)) return false;
    }
    return true;
  }

  // Rendert den Tätigkeitslisten-Umschalter im Panel-Header (gleiches
  // Bedienkonzept wie der Bauabschnitt-Umschalter der Masttafel): erster
  // Eintrag "Gesamtansicht" (Standard, mit Zusammenführungs-Logik), danach
  // ein Eintrag je tatsächlich verwendeter Tätigkeitsliste.
  function renderFzlListSwitcher(usedLists) {
    const sw = document.querySelector('.fzl-list-switcher');
    if (!sw) return;
    let activeListId = loadFzlActiveListId();
    const activeList = activeListId !== '__all__' ? usedLists.find((l) => l.id === activeListId) : null;
    if (activeListId !== '__all__' && !activeList) {
      activeListId = '__all__';
      saveFzlActiveListId('__all__');
    }
    const label = sw.querySelector('.segment-current');
    if (label) label.textContent = activeListId === '__all__' ? 'Gesamtansicht' : activeList.name;
    const menu = sw.querySelector('.segment-menu');
    if (!menu) return;
    const items = [{ id: '__all__', name: 'Gesamtansicht (alle Tätigkeitslisten)' }].concat(
      usedLists.map((l) => ({ id: l.id, name: l.name }))
    );
    menu.innerHTML = items.map((it) =>
      `<div class="segment-menu-item${it.id === activeListId ? ' active' : ''}" data-fzl-list="${esc(it.id)}">${esc(it.name)}</div>`
    ).join('');
    menu.querySelectorAll('[data-fzl-list]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        saveFzlActiveListId(item.getAttribute('data-fzl-list'));
        menu.setAttribute('hidden', '');
        // Sortierung/Filter beziehen sich auf Spalten-Keys, die in Gesamt-
        // und Einzelansicht unterschiedliche Namensräume haben - beim
        // Wechsel zurücksetzen, damit kein "unsichtbarer" Filter übrig bleibt.
        fzlSortCol = null;
        fzlSortDir = 'asc';
        fzlFilters = new Map();
        render();
      });
    });
  }

  // Ermittelt alle für den aktuellen Render-Durchlauf nötigen Daten (Zeilen,
  // Spalten, Konfiguration, gefiltert+sortiert) an EINER Stelle, damit sowohl
  // der volle Neuaufbau (render()) als auch das leichte Body-only-Update
  // (refreshBody(), z.B. während man in eine Filterzelle tippt) exakt
  // dieselbe Logik benutzen. Aktualisiert dabei auch die Mast-Zähler-Badge
  // und den Tätigkeitslisten-Umschalter (Nebeneffekt, wie im alten render()).
  function computeRenderData() {
    const groups = collectGroups();
    const totalMasten = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const countEl = document.getElementById('fzl-mast-count');
    if (countEl) countEl.textContent = String(totalMasten);

    if (!totalMasten) {
      return { ok: false, message: 'Es wurden noch keine Standorte aus einer Masttafel eingelesen.' };
    }

    const assignments = loadMastTlAssignments();
    const projectLists = loadTlProjectList();
    const abschluss = loadMastTaskAbschluss();

    // Nur Listen anzeigen, die tatsächlich mindestens einem Standort
    // zugeordnet sind und mindestens eine Tätigkeit haben - eine Liste, die
    // (noch) niemandem zugeordnet ist, würde sonst eine leere Spalte
    // erzeugen, die für dieses Projekt gar nicht relevant ist.
    const assignedListIds = new Set(Object.values(assignments).filter(Boolean));
    const usedLists = projectLists.filter((l) => assignedListIds.has(l.id) && (l.tasks || []).length);

    renderFzlListSwitcher(usedLists);

    if (!usedLists.length) {
      return { ok: false, message: 'Keinem Standort wurde bisher eine Tätigkeitsliste mit Aufgaben zugeordnet - das lässt sich auf der Mast-Detail-Seite unter „Tätigkeitsliste" einstellen.' };
    }

    let activeListId = loadFzlActiveListId();
    const activeList = activeListId !== '__all__' ? usedLists.find((l) => l.id === activeListId) : null;
    if (activeListId !== '__all__' && !activeList) {
      activeListId = '__all__';
      saveFzlActiveListId('__all__');
    }
    const isGesamt = activeListId === '__all__';

    const allTaskCols = isGesamt ? buildTaskColumns(usedLists) : buildSingleListColumns(activeList);
    const mtCols = (typeof getKnownMasttafelColumns === 'function') ? getKnownMasttafelColumns() : [];
    const allCols = buildAllColumns(allTaskCols, mtCols);
    const config = currentFzlConfig(allCols);
    const hiddenSet = new Set(config.hidden || []);
    const frozenSet = new Set(config.frozen || []);
    const visibleCols = orderedAllColumns(allCols, config).filter((c) => !hiddenSet.has(c.key));

    if (!visibleCols.length) {
      return { ok: false, message: 'In der aktuellen Ansicht sind keine Spalten ausgewählt - über „Spalten konfigurieren" wieder welche einblenden.' };
    }

    // In der Einzelansicht nur die Standorte zeigen, denen tatsächlich diese
    // eine Tätigkeitsliste zugeordnet ist - alle anderen Standorte hätten für
    // jede einzelne Spalte "entfällt" und würden die Liste nur unübersichtlich
    // machen, ohne irgendeine Information zu liefern.
    let effGroups = groups;
    if (!isGesamt) {
      effGroups = groups
        .map((g) => ({ bauabschnittName: g.bauabschnittName, rows: g.rows.filter((r) => assignments[r.mastKey] === activeListId) }))
        .filter((g) => g.rows.length);
    }

    // ---- Spaltenfilter anwenden (UND über alle Spalten mit aktivem Filter hinweg) ----
    if (fzlFilters.size) {
      effGroups = effGroups
        .map((g) => ({
          bauabschnittName: g.bauabschnittName,
          rows: g.rows.filter((m) => rowMatchesFilters(m, allCols, assignments[m.mastKey] || null, abschluss[m.mastKey] || {})),
        }))
        .filter((g) => g.rows.length);
    }

    // ---- Sortierung innerhalb jeder Bauabschnitt-Gruppe (die Gruppierung
    // selbst bleibt beim Sortieren erhalten) ----
    if (fzlSortCol) {
      const dir = fzlSortDir === 'desc' ? -1 : 1;
      const sortColObj = fzlSortCol === '__standort__' ? null : allCols.find((c) => c.key === fzlSortCol);
      effGroups.forEach((g) => {
        g.rows.sort((a, b) => {
          if (fzlSortCol === '__standort__') return a.label.localeCompare(b.label, 'de', { numeric: true }) * dir;
          const infoA = cellSortInfo(sortColObj, a, assignments[a.mastKey] || null, abschluss[a.mastKey] || {});
          const infoB = cellSortInfo(sortColObj, b, assignments[b.mastKey] || null, abschluss[b.mastKey] || {});
          if (infoA.na !== infoB.na) return infoA.na ? 1 : -1;
          return compareFzlValues(infoA.val, infoB.val) * dir;
        });
      });
    }

    const totalCols = visibleCols.length;
    const totalMastenSichtbar = effGroups.reduce((sum, g) => sum + g.rows.length, 0);

    return {
      ok: true, groups, assignments, projectLists, abschluss, usedLists, isGesamt, activeListId, activeList,
      allTaskCols, allCols, config, hiddenSet, frozenSet, visibleCols, effGroups, totalCols, totalMastenSichtbar,
    };
  }

  // Nur die Kopf-Spalte selbst (reines Label, evtl. Sortier-Pfeil dahinter) -
  // nicht mehr klickbar und ohne eigenes Symbol, damit der Spaltentext nicht
  // verdrängt wird. Sortieren/Filtern passiert ausschließlich über die
  // Symbole in der Filterzeile direkt darunter (siehe filterRowHtml).
  function headerLabelHtml(label, key) {
    const arrow = fzlSortCol === key ? (fzlSortDir === 'desc' ? ' ▼' : ' ▲') : '';
    return `<span class="fzl-th-label" data-fzl-label="${escAttrFzl(label)}">${esc(label)}${arrow}</span>`;
  }
  // Griff (⠿) zum direkten Verschieben einer Spalte in der Tabellenansicht
  // selbst (Drag & Drop auf den Spaltenkopf ziehen, nicht nur im "Spalten
  // konfigurieren"-Dialog) - die Standort-Spalte bleibt immer die erste,
  // feste Spalte und bekommt deshalb keinen Griff.
  const FZL_COL_DRAG_HANDLE_HTML = '<span class="fzl-col-drag-handle" draggable="true" title="Ziehen, um die Spalte zu verschieben">⠿</span>';
  function headRowHtml(d) {
    let html = `<tr class="fzl-head-row"><th class="fzl-mast-col-head${fzlSortCol === '__standort__' ? ' th-sorted' : ''}" data-fzl-col="__standort__">${headerLabelHtml('Standort', '__standort__')}</th>`;
    d.visibleCols.forEach((c) => {
      const cls = 'fzl-task-head' + (c.isMt ? ' fzl-mt-head' : '') + (fzlSortCol === c.key ? ' th-sorted' : '');
      const tip = c.isMt ? 'Masttafel-Spalte' : ('Aufgabe aus: ' + c.entries.map((e) => e.listName).filter((v, i, arr) => arr.indexOf(v) === i).join(', '));
      html += `<th class="${cls}" data-fzl-col="${escAttrFzl(c.key)}" title="${esc(tip)}">${FZL_COL_DRAG_HANDLE_HTML}${headerLabelHtml(c.label, c.key)}</th>`;
    });
    html += '</tr>';
    return html;
  }
  // Verdrahtet das Verschieben von Spalten direkt im Tabellenkopf per Drag &
  // Drop: Griff greifen, auf eine andere Spaltenüberschrift ziehen - die
  // gezogene Spalte tauscht dabei ihren Platz mit der Zielspalte (dieselbe
  // Reihenfolge-Logik wie im "Spalten konfigurieren"-Dialog, nur direkt in
  // der Tabelle statt in einer separaten Liste).
  function wireHeaderDrag(d) {
    const table = document.querySelector('#fzl-content table.fzl-table');
    if (!table) return;
    let dragSrcKey = null;
    const heads = Array.from(table.querySelectorAll('thead tr.fzl-head-row th[data-fzl-col]'));
    heads.forEach((th) => {
      const key = th.getAttribute('data-fzl-col');
      const handle = th.querySelector('.fzl-col-drag-handle');
      if (handle) {
        handle.addEventListener('dragstart', (e) => {
          dragSrcKey = key;
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); } catch (err) { /* jsdom/ältere Browser: dataTransfer evtl. eingeschränkt - dragSrcKey reicht uns */ }
          th.classList.add('fzl-col-dragging');
        });
        handle.addEventListener('dragend', () => {
          heads.forEach((h) => { h.classList.remove('fzl-col-dragging'); h.classList.remove('fzl-col-drop-target'); });
        });
      }
      if (key === '__standort__') return; // Standort bleibt fest an erster Stelle - kein gültiges Drop-Ziel
      th.addEventListener('dragover', (e) => {
        if (dragSrcKey === null || dragSrcKey === key) return;
        e.preventDefault();
        th.classList.add('fzl-col-drop-target');
      });
      th.addEventListener('dragleave', () => th.classList.remove('fzl-col-drop-target'));
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('fzl-col-drop-target');
        const srcKey = dragSrcKey;
        dragSrcKey = null;
        if (!srcKey || srcKey === key) return;
        reorderFzlColumn(srcKey, key, d);
      });
    });
  }
  // Verschiebt eine Spalte an die Position einer anderen (per Ziehen im
  // Tabellenkopf) und persistiert die neue Reihenfolge sofort - arbeitet auf
  // der VOLLSTÄNDIGEN Spaltenliste (auch ausgeblendete), damit eine
  // versteckte Spalte nicht plötzlich verschwindet oder ihre Position verliert.
  function reorderFzlColumn(srcKey, targetKey, d) {
    const fullOrder = orderedAllColumns(d.allCols, d.config).map((c) => c.key);
    const srcIdx = fullOrder.indexOf(srcKey);
    const targetIdx = fullOrder.indexOf(targetKey);
    if (srcIdx === -1 || targetIdx === -1) return;
    const [moved] = fullOrder.splice(srcIdx, 1);
    fullOrder.splice(targetIdx, 0, moved);
    saveFzlState({ activeViewName: null, order: fullOrder, hidden: d.config.hidden, frozen: d.config.frozen });
    render();
  }
  const FZL_SORT_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="7 10 12 5 17 10"/><polyline points="7 14 12 19 17 14"/></svg>';
  const FZL_FILTER_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="4 4 20 4 14 13 14 19 10 21 10 13 4 4"/></svg>';
  // Eigene Zeile direkt unter der Kopfzeile mit je einem Sortier- und einem
  // Filter-Symbol - genau wie ursprünglich (Klick auf das Symbol sortiert
  // bzw. öffnet ein Auswahl-Popover mit den tatsächlich vorkommenden Werten
  // dieser Spalte), nur nicht mehr direkt neben dem Spaltentext, sondern in
  // dieser separaten Zeile.
  function filterRowHtml(d) {
    function cellInner(key) {
      const sorted = fzlSortCol === key;
      const filtered = fzlFilters.has(key);
      return `<span class="th-controls">` +
        `<span class="th-sort" data-fzl-sort="${escAttrFzl(key)}" title="Sortieren">${FZL_SORT_ICON}</span>` +
        `<span class="th-filter" data-fzl-filter="${escAttrFzl(key)}" title="Filtern">${FZL_FILTER_ICON}</span>` +
        `</span>`;
    }
    let html = `<tr class="fzl-filter-row"><th class="fzl-mast-col-head${fzlSortCol === '__standort__' ? ' th-sorted' : ''}${fzlFilters.has('__standort__') ? ' th-filtered' : ''}" data-fzl-col="__standort__">${cellInner('__standort__')}</th>`;
    d.visibleCols.forEach((c) => {
      const cls = 'fzl-task-head' + (c.isMt ? ' fzl-mt-head' : '') + (fzlSortCol === c.key ? ' th-sorted' : '') + (fzlFilters.has(c.key) ? ' th-filtered' : '');
      html += `<th class="${cls}" data-fzl-col="${escAttrFzl(c.key)}">${cellInner(c.key)}</th>`;
    });
    html += '</tr>';
    return html;
  }
  function bodyRowsHtml(d) {
    if (!d.totalMastenSichtbar) {
      return `<tr><td colspan="${d.totalCols + 1}" class="changelog-empty">Keine Standorte treffen auf die aktuelle Filterung/Ansicht zu.</td></tr>`;
    }
    let bodyHtml = '';
    d.effGroups.forEach((g) => {
      bodyHtml += `<tr class="fzl-ba-row"><td colspan="${d.totalCols + 1}">${esc(g.bauabschnittName)}</td></tr>`;
      g.rows.forEach((m) => {
        const assignedListId = d.assignments[m.mastKey] || null;
        const mastAbschluss = d.abschluss[m.mastKey] || {};
        let rowHtml = `<td class="fzl-mast-col" data-fzl-col="__standort__">${esc(m.label)}</td>`;
        d.visibleCols.forEach((c) => {
          if (c.isMt) {
            rowHtml += `<td class="fzl-cell fzl-cell-mt" data-fzl-col="${escAttrFzl(c.key)}">${esc(mtColValue(m.entry, c.idx))}</td>`;
            return;
          }
          const match = c.entries.find((e) => e.listId === assignedListId);
          if (!match) {
            rowHtml += `<td class="fzl-cell fzl-cell-na" data-fzl-col="${escAttrFzl(c.key)}">entfällt</td>`;
          } else {
            const done = mastAbschluss[match.taskId];
            if (done && done.datum) {
              rowHtml += `<td class="fzl-cell fzl-cell-done" data-fzl-col="${escAttrFzl(c.key)}">${esc(fmtDatumFzl(done.datum))}</td>`;
            } else {
              rowHtml += `<td class="fzl-cell" data-fzl-col="${escAttrFzl(c.key)}"></td>`;
            }
          }
        });
        bodyHtml += `<tr>${rowHtml}</tr>`;
      });
    });
    return bodyHtml;
  }

  // Klick irgendwo auf eine Kopfzelle sortiert nach dieser Spalte (Klick
  // wiederholen dreht die Richtung um), Klick auf das Filter-Symbol öffnet
  // ein Popover mit Checkboxen der tatsächlich vorkommenden Werte (Excel-
  // artige Mehrfachauswahl) - genau wie ursprünglich, nur in der Filterzeile
  // statt im Spaltenkopf selbst.
  function wireFilterRowControls(allCols) {
    const table = document.querySelector('#fzl-content table.fzl-table');
    if (!table) return;
    table.querySelectorAll('thead tr.fzl-filter-row [data-fzl-sort]').forEach((icon) => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = icon.getAttribute('data-fzl-sort');
        if (fzlSortCol === key) fzlSortDir = fzlSortDir === 'asc' ? 'desc' : 'asc';
        else { fzlSortCol = key; fzlSortDir = 'asc'; }
        refreshSortFilterIndicators();
        refreshBody();
      });
    });
    table.querySelectorAll('thead tr.fzl-filter-row [data-fzl-filter]').forEach((icon) => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = icon.getAttribute('data-fzl-filter');
        openFzlFilterPopover(key, icon, allCols);
      });
    });
  }
  // Aktualisiert Pfeil-Text (Kopfzeile) + th-sorted/th-filtered-Klassen
  // (Kopf- UND Filterzeile), ohne die Zeilen selbst neu aufzubauen.
  function refreshSortFilterIndicators() {
    const table = document.querySelector('#fzl-content table.fzl-table');
    if (!table) return;
    table.querySelectorAll('thead tr.fzl-head-row th[data-fzl-col]').forEach((th) => {
      const key = th.getAttribute('data-fzl-col');
      const labelSpan = th.querySelector('.fzl-th-label');
      if (labelSpan) {
        const base = labelSpan.getAttribute('data-fzl-label') || labelSpan.textContent;
        const arrow = fzlSortCol === key ? (fzlSortDir === 'desc' ? ' ▼' : ' ▲') : '';
        labelSpan.textContent = base + arrow;
      }
      th.classList.toggle('th-sorted', fzlSortCol === key);
    });
    table.querySelectorAll('thead tr.fzl-filter-row th[data-fzl-col]').forEach((th) => {
      const key = th.getAttribute('data-fzl-col');
      th.classList.toggle('th-sorted', fzlSortCol === key);
      th.classList.toggle('th-filtered', fzlFilters.has(key));
    });
  }

  // ---------- Filter-Popover: kompaktes, an das Trichter-Symbol verankertes
  // Panel mit den tatsächlich vorkommenden Werten dieser Spalte (Checkboxen,
  // Suche, Alle/Keine) - bei Aufgaben-Spalten sind das die echten Abschluss-
  // daten (z.B. "27.07.2026") plus "Offen"/"Entfällt", nicht nur eine grobe
  // Erledigt/Offen-Kategorie. ----------
  let fzlFilterPopoverEl = null;
  function closeFzlFilterPopover() {
    if (fzlFilterPopoverEl) { fzlFilterPopoverEl.remove(); fzlFilterPopoverEl = null; }
  }
  function openFzlFilterPopover(colKey, anchorEl, allCols) {
    closeFzlFilterPopover();
    const col = colKey === '__standort__' ? null : allCols.find((c) => c.key === colKey);
    const colLabel = colKey === '__standort__' ? 'Standort' : (col ? col.label : 'Spalte');
    const assignments = loadMastTlAssignments();
    const abschluss = loadMastTaskAbschluss();
    const groups = collectGroups(); // alle Zeilen unabhängig von aktuell aktiven Filtern - wie ursprünglich
    const seen = new Map(); // Anzeigewert -> Sortier-Schlüssel (erstes Vorkommen)
    groups.forEach((g) => g.rows.forEach((m) => {
      let display, sortKey;
      if (colKey === '__standort__') { display = m.label; sortKey = m.label; }
      else {
        const info = cellFilterInfo(col, m, assignments[m.mastKey] || null, abschluss[m.mastKey] || {});
        display = info.display;
        sortKey = info.sortKey;
      }
      if (!seen.has(display)) seen.set(display, sortKey);
    }));
    const distinct = Array.from(seen.entries()).sort((a, b) => compareFzlValues(a[1], b[1])).map(([display]) => display);
    const active = fzlFilters.get(colKey);

    const pop = document.createElement('div');
    pop.className = 'th-filter-popover';
    pop.innerHTML = `
      <div class="th-filter-popover-header">
        <span>${esc(colLabel)}</span>
        <span class="th-filter-popover-close" id="fzl-tf-close" title="Schließen">×</span>
      </div>
      <div class="th-filter-popover-search">
        <input type="text" id="fzl-tf-search" placeholder="Werte durchsuchen…">
      </div>
      <div class="th-filter-popover-actions">
        <button type="button" class="link-action" id="fzl-tf-all">Alle</button>
        <button type="button" class="link-action" id="fzl-tf-none">Keine</button>
      </div>
      <div class="th-filter-popover-list" id="fzl-tf-list">
        ${distinct.length ? distinct.map((v) => `
          <label class="th-filter-popover-row" data-search="${esc(String(v).toLowerCase())}">
            <input type="checkbox" data-fzl-filter-val="${esc(v)}" ${(!active || active.has(v)) ? 'checked' : ''}>
            <span>${esc(v)}</span>
          </label>`).join('') : '<div class="th-filter-popover-empty">Keine Werte vorhanden.</div>'}
      </div>
      <div class="th-filter-popover-footer">
        <button type="button" class="matt-tool-btn" id="fzl-tf-clear">Entfernen</button>
        <button type="button" class="btn-primary" id="fzl-tf-apply">Übernehmen</button>
      </div>`;
    document.body.appendChild(pop);
    fzlFilterPopoverEl = pop;

    const rect = anchorEl.getBoundingClientRect();
    const popW = 230;
    let left = Math.min(rect.left, window.innerWidth - popW - 12);
    left = Math.max(8, left);
    let top = rect.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    if (top + 340 > window.innerHeight) {
      pop.style.top = Math.max(8, rect.top - 6) + 'px';
      pop.style.transform = 'translateY(-100%)';
    }

    const searchInput = pop.querySelector('#fzl-tf-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      pop.querySelectorAll('.th-filter-popover-row').forEach((row) => {
        row.style.display = row.getAttribute('data-search').includes(q) ? '' : 'none';
      });
    });
    pop.querySelector('#fzl-tf-all').addEventListener('click', () => {
      pop.querySelectorAll('.th-filter-popover-row:not([style*="display: none"]) [data-fzl-filter-val]').forEach((cb) => { cb.checked = true; });
    });
    pop.querySelector('#fzl-tf-none').addEventListener('click', () => {
      pop.querySelectorAll('.th-filter-popover-row:not([style*="display: none"]) [data-fzl-filter-val]').forEach((cb) => { cb.checked = false; });
    });
    pop.querySelector('#fzl-tf-close').addEventListener('click', closeFzlFilterPopover);
    pop.querySelector('#fzl-tf-apply').addEventListener('click', () => {
      const checked = Array.from(pop.querySelectorAll('[data-fzl-filter-val]')).filter((cb) => cb.checked).map((cb) => cb.getAttribute('data-fzl-filter-val'));
      if (checked.length === 0 || checked.length === distinct.length) fzlFilters.delete(colKey);
      else fzlFilters.set(colKey, new Set(checked));
      closeFzlFilterPopover();
      render();
    });
    pop.querySelector('#fzl-tf-clear').addEventListener('click', () => {
      fzlFilters.delete(colKey);
      closeFzlFilterPopover();
      render();
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }
  document.addEventListener('click', closeFzlFilterPopover);

  // ---------- Spalten fixieren ("Fixieren"): Standort-Spalte ist immer
  // fixiert (wie die Schlüsselspalte der Masttafel), zusätzlich fixierte
  // Spalten werden dahinter mit position:sticky + kumuliertem Pixel-Offset
  // versehen - dieselbe Technik wie updateFrozenOffsets() der Masttafel. ----------
  function fzlAttrSel(key) {
    return String(key).replace(/"/g, '\\"');
  }
  function updateFzlFrozenOffsets(frozenKeys) {
    const table = document.querySelector('#fzl-content table.fzl-table');
    if (!table) return;
    const firstRow = table.querySelector('tbody tr:not(.fzl-ba-row)') || table.querySelector('thead tr.fzl-head-row');
    const groups = ['__standort__'].concat((frozenKeys || []).filter((k) => k !== '__standort__'));
    let offset = 0;
    groups.forEach((key) => {
      const cell = firstRow ? firstRow.querySelector(`[data-fzl-col="${fzlAttrSel(key)}"]`) : null;
      const width = cell ? cell.getBoundingClientRect().width : 0;
      table.querySelectorAll(`[data-fzl-col="${fzlAttrSel(key)}"]`).forEach((c) => {
        c.classList.add('fzl-col-frozen');
        c.style.left = offset + 'px';
      });
      offset += width;
    });
    table.querySelectorAll('.fzl-col-frozen').forEach((c) => {
      const key = c.getAttribute('data-fzl-col');
      if (!groups.includes(key)) {
        c.classList.remove('fzl-col-frozen');
        c.style.left = '';
      }
    });
  }

  function updateActiveViewLabel() {
    const el = document.getElementById('fzl-active-view-label');
    if (!el) return;
    const config = currentFzlConfig();
    el.textContent = 'Ansicht: ' + (config.activeViewName || 'Alle Spalten');
  }

  // Voller Neuaufbau: Kopfzeile + Filterzeile + Tabellenkörper + Debug-Block.
  // Wird für strukturelle Änderungen benutzt (Seite öffnen, Aktualisieren-
  // Knopf, Tätigkeitslisten-Umschalter, Spalten-Konfiguration übernehmen/
  // laden/löschen) - NICHT für einzelne Tastatureingaben in einer Filter-
  // zelle (dafür gibt es refreshBody(), das die Kopf-/Filterzeile unberührt
  // lässt, damit der Eingabefokus erhalten bleibt).
  function render() {
    const d = computeRenderData();
    if (!d.ok) {
      contentEl.innerHTML = `<div class="changelog-empty">${esc(d.message)}</div>`;
      updateActiveViewLabel();
      return;
    }
    contentEl.innerHTML = `
      <div class="fzl-table-wrap">
        <table class="fzl-table">
          <thead>
            ${headRowHtml(d)}
            ${filterRowHtml(d)}
          </thead>
          <tbody>${bodyRowsHtml(d)}</tbody>
        </table>
      </div>
      ${renderDebugBlock(d.assignments, d.abschluss, d.projectLists, d.usedLists, d.allTaskCols)}`;
    updateActiveViewLabel();
    wireFilterRowControls(d.allCols);
    wireHeaderDrag(d);
    updateFzlFrozenOffsets(Array.from(d.frozenSet));
  }

  // Leichtes Update nach einem Sortier-Klick: nur der Tabellenkörper wird
  // neu aufgebaut, die Kopf-/Filterzeile bleiben unangetastet.
  function refreshBody() {
    const table = document.querySelector('#fzl-content table.fzl-table');
    if (!table) { render(); return; }
    const d = computeRenderData();
    if (!d.ok) { render(); return; }
    const tbody = table.querySelector('tbody');
    if (tbody) tbody.innerHTML = bodyRowsHtml(d);
    updateFzlFrozenOffsets(Array.from(d.frozenSet));
  }

  // ---------- "Spalten konfigurieren"-Modal: EINE gemeinsame, per Ziehen
  // (Drag & Drop) sortierbare Liste aus Aufgaben-Spalten (Gesamt- oder
  // Einzelansicht, passend zur gerade aktiven Tätigkeitslisten-Auswahl) und
  // Masttafel-Spalten, jede Zeile mit Sichtbarkeits- und Fixieren-Checkbox
  // (unverändert), plus Verwaltung der gespeicherten Ansichten (laden/
  // löschen/neu speichern). ----------
  function openColumnConfigModal() {
    const projectLists = loadTlProjectList();
    const assignments = loadMastTlAssignments();
    const assignedListIds = new Set(Object.values(assignments).filter(Boolean));
    const usedLists = projectLists.filter((l) => assignedListIds.has(l.id) && (l.tasks || []).length);
    let activeListId = loadFzlActiveListId();
    const activeList = activeListId !== '__all__' ? usedLists.find((l) => l.id === activeListId) : null;
    if (activeListId !== '__all__' && !activeList) activeListId = '__all__';
    const isGesamt = activeListId === '__all__';
    const taskCols = isGesamt ? buildTaskColumns(usedLists) : buildSingleListColumns(activeList);
    const mtCols = (typeof getKnownMasttafelColumns === 'function') ? getKnownMasttafelColumns() : [];
    const allCols = buildAllColumns(taskCols, mtCols);
    const byKey = new Map(allCols.map((c) => [c.key, c]));
    const config = currentFzlConfig(allCols);
    // Arbeitskopien, die erst beim Klick auf "Übernehmen"/"Als Ansicht
    // speichern" tatsächlich persistiert werden - Ziehen/Checkboxen
    // verändern bis dahin nur diesen lokalen Zustand.
    let workingOrder = orderedAllColumns(allCols, config).map((c) => c.key);
    let workingHidden = new Set(config.hidden || []);
    let workingFrozen = new Set(config.frozen || []);
    const views = loadFzlViews();

    const DRAG_HANDLE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>';

    function rowsHtml() {
      if (!workingOrder.length) return '<div class="changelog-empty">Keine Spalten verfügbar - dafür muss mindestens einem Standort eine Tätigkeitsliste mit Aufgaben zugeordnet sein, oder eine Masttafel eingelesen sein.</div>';
      return workingOrder.map((key, i) => {
        const c = byKey.get(key);
        if (!c) return '';
        const hidden = workingHidden.has(key);
        const frozen = workingFrozen.has(key);
        const sub = c.isMt ? 'Masttafel-Spalte' : ('Aufgabe aus: ' + c.entries.map((e) => e.listName).filter((v, idx2, arr) => arr.indexOf(v) === idx2).join(', '));
        return `<div class="col-config-row" data-fzl-row-idx="${i}">
          <span class="col-drag-handle" draggable="true" data-fzl-drag-idx="${i}" title="Ziehen, um die Reihenfolge zu ändern">${DRAG_HANDLE_SVG}</span>
          <label class="col-config-check">
            <input type="checkbox" data-fzl-cfg-visible="${i}" ${hidden ? '' : 'checked'}>
            ${esc(c.label)}
          </label>
          <label class="col-config-check muted" title="Spalte beim horizontalen Scrollen sichtbar halten">
            <input type="checkbox" data-fzl-cfg-frozen="${i}" ${frozen ? 'checked' : ''}>
            Fixieren
          </label>
          <span class="col-config-check muted">${esc(sub)}</span>
        </div>`;
      }).join('');
    }

    const viewsHtml = views.length
      ? views.map((v, i) => `<div class="col-config-row"><span>${esc(v.name)}</span><span style="display:flex; gap:8px;"><button type="button" class="matt-tool-btn" data-fzl-load-view="${i}">Laden</button><button type="button" class="matt-tool-btn" data-fzl-delete-view="${i}">Löschen</button></span></div>`).join('')
      : '<div class="changelog-empty">Noch keine Ansichten gespeichert.</div>';

    openModalFzl('Spalten konfigurieren' + (isGesamt ? '' : ` – ${activeList ? activeList.name : ''}`), `
      <div class="col-config-hint">Am Griff (⠿) links ziehen, um die Reihenfolge zu ändern - Aufgaben und Masttafel-Spalten gemeinsam. „Fixieren" hält eine Spalte beim horizontalen Scrollen sichtbar, direkt neben der Standort-Spalte.${isGesamt ? ' Gleichnamige Aufgaben aus verschiedenen Tätigkeitslisten sind bereits zu einer Spalte zusammengeführt.' : ' Es werden nur die Aufgaben der aktuell ausgewählten Tätigkeitsliste gezeigt.'}</div>
      <div class="col-config-list" id="fzl-cfg-list" style="max-height:340px; overflow-y:auto;">${rowsHtml()}</div>
      <div class="subheading" style="margin-top:16px;">Gespeicherte Ansichten</div>
      <div id="fzl-cfg-views-list">${viewsHtml}</div>
    `, `
      <button type="button" class="matt-tool-btn" id="fzl-cfg-cancel">Abbrechen</button>
      <button type="button" class="matt-tool-btn" id="fzl-cfg-save-view">Als Ansicht speichern</button>
      <button type="button" class="btn-primary" id="fzl-cfg-apply">Übernehmen</button>
    `);

    function wireRows() {
      const list = document.getElementById('fzl-cfg-list');
      if (!list) return;
      list.querySelectorAll('[data-fzl-cfg-visible]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const key = workingOrder[parseInt(cb.dataset.fzlCfgVisible, 10)];
          if (cb.checked) workingHidden.delete(key); else workingHidden.add(key);
        });
      });
      list.querySelectorAll('[data-fzl-cfg-frozen]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const key = workingOrder[parseInt(cb.dataset.fzlCfgFrozen, 10)];
          if (cb.checked) workingFrozen.add(key); else workingFrozen.delete(key);
        });
      });

      // Drag & Drop umsortieren: der Griff startet den Zug (dataTransfer ist
      // dabei nur "best effort", die eigentliche Quelle wird lokal in
      // dragSrcIdx gemerkt), jede Zeile ist ein gültiges Drop-Ziel.
      let dragSrcIdx = null;
      list.querySelectorAll('.col-drag-handle').forEach((handle) => {
        handle.addEventListener('dragstart', (e) => {
          dragSrcIdx = parseInt(handle.getAttribute('data-fzl-drag-idx'), 10);
          try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragSrcIdx)); } catch (err) { /* jsdom/ältere Browser: dataTransfer evtl. eingeschränkt - dragSrcIdx reicht uns */ }
          const row = handle.closest('.col-config-row');
          if (row) row.classList.add('col-row-dragging');
        });
        handle.addEventListener('dragend', () => {
          list.querySelectorAll('.col-row-dragging').forEach((r) => r.classList.remove('col-row-dragging'));
          list.querySelectorAll('.col-row-drop-target').forEach((r) => r.classList.remove('col-row-drop-target'));
        });
      });
      list.querySelectorAll('.col-config-row').forEach((row) => {
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          row.classList.add('col-row-drop-target');
        });
        row.addEventListener('dragleave', () => row.classList.remove('col-row-drop-target'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('col-row-drop-target');
          const targetIdx = parseInt(row.getAttribute('data-fzl-row-idx'), 10);
          if (dragSrcIdx === null || Number.isNaN(targetIdx) || dragSrcIdx === targetIdx) { dragSrcIdx = null; return; }
          const [moved] = workingOrder.splice(dragSrcIdx, 1);
          workingOrder.splice(targetIdx, 0, moved);
          dragSrcIdx = null;
          list.innerHTML = rowsHtml();
          wireRows();
        });
      });
    }
    wireRows();

    document.getElementById('fzl-cfg-cancel').addEventListener('click', closeModalFzl);
    document.getElementById('fzl-cfg-apply').addEventListener('click', () => {
      saveFzlState({ activeViewName: null, order: workingOrder.slice(), hidden: Array.from(workingHidden), frozen: Array.from(workingFrozen) });
      closeModalFzl();
      render();
    });
    document.getElementById('fzl-cfg-save-view').addEventListener('click', () => {
      const name = window.prompt('Name für diese Ansicht:');
      if (!name) return;
      const newView = { name, order: workingOrder.slice(), hidden: Array.from(workingHidden), frozen: Array.from(workingFrozen) };
      const list = loadFzlViews();
      list.push(newView);
      saveFzlViews(list);
      saveFzlState({ activeViewName: name, order: newView.order, hidden: newView.hidden, frozen: newView.frozen });
      closeModalFzl();
      render();
    });
    document.querySelectorAll('[data-fzl-load-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = views[parseInt(btn.getAttribute('data-fzl-load-view'), 10)];
        if (!v) return;
        saveFzlState({ activeViewName: v.name, order: v.order, hidden: v.hidden, frozen: v.frozen || [] });
        closeModalFzl();
        render();
      });
    });
    document.querySelectorAll('[data-fzl-delete-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-fzl-delete-view'), 10);
        const list = loadFzlViews();
        list.splice(idx, 1);
        saveFzlViews(list);
        openColumnConfigModal(); // Modal mit aktualisierter Ansichten-Liste neu aufbauen
      });
    });
  }

  // Sichtbarer Rohdaten-Block (aufklappbar, standardmäßig zu) - hilft dabei,
  // ohne Browser-Devtools zu prüfen, ob die Handy-App-Seite tatsächlich in
  // denselben localStorage-Bereich (gleiches Projekt, gleicher Browser-
  // Origin) schreibt wie diese Web-Seite liest, falls ein Abschluss aus der
  // Handy-App hier mal nicht ankommen sollte - inkl. aller Tätigkeitslisten
  // des Projekts (id/Name/Aufgaben-Anzahl) und der zusammengeführten
  // Aufgaben-Spalten, damit sich auch erkennen lässt, ob eine zugeordnete
  // Liste hier z.B. mit 0 Aufgaben ankommt oder unter ihrer Id gar nicht
  // existiert (dann würde sie aus der Tabelle rausfallen, obwohl die
  // Zuordnung selbst korrekt ist).
  function renderDebugBlock(assignments, abschluss, projectLists, usedLists, allTaskCols) {
    const info = {
      projekt: (typeof currentProjectId === 'function') ? currentProjectId() : '?',
      aktiveTaetigkeitsliste: loadFzlActiveListId(),
      mastTaetigkeitslisteZuordnungen: assignments,
      abschlussDaten: abschluss,
      alleTaetigkeitslistenDesProjekts: (projectLists || []).map((l) => ({
        id: l.id,
        name: l.name,
        anzahlAufgaben: (l.tasks || []).length,
        aufgaben: (l.tasks || []).map((t) => ({ id: t.id, nr: t.nr, titel: t.titel })),
      })),
      inFertigstellungslisteAngezeigteListen: (usedLists || []).map((l) => l.id + ' - ' + l.name),
      zusammengefuehrteAufgabenSpalten: (allTaskCols || []).map((c) => ({ key: c.key, label: c.label, ausListen: c.entries.map((e) => e.listName) })),
      aktiveAnsicht: currentFzlConfig(),
      aktiveSpaltenfilter: Array.from(fzlFilters.entries()).map(([k, v]) => [k, Array.from(v)]),
    };
    return `<details class="fzl-debug" id="fzl-debug">
      <summary>Rohdaten (Debug)</summary>
      <pre>${esc(JSON.stringify(info, null, 2))}</pre>
    </details>`;
  }

  // Manuelles Neuladen: die Fertigstellungsliste rendert zwar automatisch
  // frisch, sobald man erneut auf diese Seite navigiert, aber nicht, während
  // sie schon offen ist und in der Zwischenzeit z.B. in einem anderen
  // Browser-Tab (Handy-App-Vorschau) eine Tätigkeit abgeschlossen wurde -
  // localStorage-Änderungen in einem anderen Tab lösen im selben Tab kein
  // automatisches Neuzeichnen aus. Der Button holt die Daten explizit neu.
  const refreshBtn = document.getElementById('fzl-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      render();
      refreshBtn.classList.add('icon-btn-spin');
      setTimeout(() => refreshBtn.classList.remove('icon-btn-spin'), 500);
    });
  }
  const columnsBtn = document.getElementById('fzl-columns-btn');
  if (columnsBtn) columnsBtn.addEventListener('click', openColumnConfigModal);

  render();
  window.levelbuildOnShowFertigstellungsliste = render;
})();

// ======================================================================
// Protokolle (Baustein-based data-collection masks/forms): project-
// independent templates, same "create once, pull into a project, adapt
// there" pattern as Bauabschnitte/Tätigkeitslisten above. Kept at top level
// (not inside either IIFE) because both the Protokolle editor IIFE further
// below AND the Tätigkeitsliste task-edit modal need to read the current
// list of available Protokolle (to let a Tätigkeit reference one as its
// "welches Protokoll?" documentation type).
// ======================================================================
const PROTOKOLL_TEMPLATES_KEY = 'levelbuild_protokolle_vorlagen'; // global (Vorlage, kein Projektbezug)
const PROTOKOLL_PROJECT_KEY = 'levelbuild_protokolle_projekt';
migrateToProjectScopedKey(PROTOKOLL_PROJECT_KEY);

function loadProtokollTemplates() {
  try { return JSON.parse(localStorage.getItem(PROTOKOLL_TEMPLATES_KEY) || '[]'); } catch (e) { return []; }
}
function saveProtokollTemplates(list) {
  try { localStorage.setItem(PROTOKOLL_TEMPLATES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function loadProtokollProjectList() {
  try { return JSON.parse(localStorage.getItem(pKey(PROTOKOLL_PROJECT_KEY)) || '[]'); } catch (e) { return []; }
}
function saveProtokollProjectList(list) {
  try { localStorage.setItem(pKey(PROTOKOLL_PROJECT_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeProtokollId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// Which store of Protokolle should be offered to a Tätigkeit as "welches
// Protokoll?", given the scope the surrounding Tätigkeitsliste lives in -
// a project-scoped list can only sensibly reference Protokolle already
// pulled into that same project; a project-independent template list
// references the project-independent Protokoll templates directly.
function protokolleFor(scope) {
  return scope === 'project' ? loadProtokollProjectList() : loadProtokollTemplates();
}

// ======================================================================
// Mast <-> Handy-App Verknüpfung: welche Tätigkeitsliste einem Mast
// zugeordnet ist, der Abhaken-Status jeder Aufgabe für diesen einen Mast,
// die dort eingegebenen Protokoll-Antworten und die dort aufgenommenen
// Fotos/Dokumente. Alles keyed über den gleichen normalisierten
// Bauwerksnummer-Schlüssel, den die Masttafel-Versionierung schon
// verwendet, damit derselbe Mast überall (Masttafel, Mast-Detail-Seite,
// separate Handy-App) konsistent wiedererkannt wird. Top-level (nicht in
// einer IIFE) und literal dieselben Key-Strings wie unten, damit sowohl
// die Mast-Detail-Seite als auch handyapp.html/js dieselben localStorage-
// Einträge lesen/schreiben wie die eigentlichen Tätigkeitslisten/
// Protokolle-Speicher.
// ======================================================================
const TL_PROJECT_KEY = 'levelbuild_taetigkeitslisten_projekt';
migrateToProjectScopedKey(TL_PROJECT_KEY);
function loadTlProjectList() {
  try { return JSON.parse(localStorage.getItem(pKey(TL_PROJECT_KEY)) || '[]'); } catch (e) { return []; }
}
function saveTlProjectList(list) {
  try { localStorage.setItem(pKey(TL_PROJECT_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
// Findet eine einzelne Tätigkeit über alle Tätigkeitslisten dieses Projekts
// hinweg anhand ihrer id - genutzt, um im Datensätze-Panel (Mast-Detail)
// den Tätigkeitstitel zu einem gespeicherten Protokoll-Datensatz anzuzeigen
// (Datensätze sind seit dem Mehrfach-Zuordnungs-Fix nach taskId geschlüsselt,
// siehe loadMastProtokollDaten()).
function findTaetigkeitById(taskId) {
  if (!taskId) return null;
  const lists = (typeof loadTlProjectList === 'function') ? loadTlProjectList() : [];
  for (const l of lists) {
    const t = (l.tasks || []).find((x) => x.id === taskId);
    if (t) return t;
  }
  return null;
}

const MAST_TL_ASSIGNMENT_KEY = 'levelbuild_mast_taetigkeitsliste';
const MAST_TASK_STATUS_KEY = 'levelbuild_mast_aufgaben_status';
const MAST_PROTOKOLL_DATEN_KEY = 'levelbuild_mast_protokoll_daten';
const MAST_FOTOS_KEY = 'levelbuild_mast_fotos';
migrateToProjectScopedKey(MAST_TL_ASSIGNMENT_KEY);
migrateToProjectScopedKey(MAST_TASK_STATUS_KEY);
migrateToProjectScopedKey(MAST_PROTOKOLL_DATEN_KEY);
migrateToProjectScopedKey(MAST_FOTOS_KEY);

// { [mastKey]: taetigkeitslisteId }
function loadMastTlAssignments() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_TL_ASSIGNMENT_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastTlAssignments(map) {
  try { localStorage.setItem(pKey(MAST_TL_ASSIGNMENT_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [mastKey]: { [taskId]: statusOptionId } }
function loadMastTaskStatus() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_TASK_STATUS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastTaskStatus(map) {
  try { localStorage.setItem(pKey(MAST_TASK_STATUS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [mastKey]: { [taskId]: { protokollId, answers: { [bausteinId]: value } } } }
// Bewusst nach taskId (nicht protokollId) geschlüsselt: mehrere Tätigkeiten
// einer Tätigkeitsliste können dieselbe Protokoll-Vorlage nutzen (z.B.
// "Fotodokumentation" bei mehreren Arbeitsschritten) und brauchen trotzdem
// jeweils ihren eigenen, unabhängigen Datensatz - sonst würde das Ausfüllen
// einer Tätigkeit alle anderen, die dieselbe Vorlage referenzieren, mit
// denselben Daten überschreiben und fälschlich als erledigt anzeigen.
// protokollId wird zusätzlich mitgespeichert, damit sich beim Lesen (z.B.
// im Datensätze-Panel) ermitteln lässt, welche Vorlage zu diesem Datensatz
// gehört, ohne die zugehörige Tätigkeit erneut nachschlagen zu müssen.
function loadMastProtokollDaten() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_PROTOKOLL_DATEN_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastProtokollDaten(map) {
  try { localStorage.setItem(pKey(MAST_PROTOKOLL_DATEN_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [mastKey]: [{ id, dataUrl, name, addedAt }] }
function loadMastFotos() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_FOTOS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastFotos(map) {
  try { localStorage.setItem(pKey(MAST_FOTOS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
function makeMastDataId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ======================================================================
// Bautagebücher (daily construction site reports): one entry per Tag/Nummer
// for the current project. Each entry carries its own Wetter (weather)
// cards, Arbeitszeit, and two recursive Anwesend/Geräte trees (Firma ->
// beliebig viele verschachtelte Positionen, z.B. Firma -> Gerätetyp ->
// einzelnes Gerät), plus flache Leistungen/Ereignisse-Listen. Persisted
// per project via pKey(), exactly like Bauabschnitte/Masttafel/Tätigkeits-
// listen usw.
// ======================================================================
const BAUTAGEBUCH_KEY = 'levelbuild_bautagebuecher';
migrateToProjectScopedKey(BAUTAGEBUCH_KEY);
function loadBautagebuecher() {
  try { return JSON.parse(localStorage.getItem(pKey(BAUTAGEBUCH_KEY)) || '[]'); } catch (e) { return []; }
}
function saveBautagebuecher(list) {
  try { localStorage.setItem(pKey(BAUTAGEBUCH_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function nextBautagebuchNummer(list) {
  return (list || []).reduce((max, r) => Math.max(max, parseInt(r.nummer, 10) || 0), 0) + 1;
}
function todayIsoDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const BAUTAGEBUCH_DEFAULT_SECTIONS = ['wetter', 'arbeitszeit', 'anwesend', 'geraete', 'leistungen', 'ereignisse'];
function makeBautagebuchEintrag(overrides) {
  const base = {
    id: makeMastDataId('bt'),
    nummer: 1,
    datum: todayIsoDate(),
    trade: '',
    status: 'offen', // 'offen' | 'abgeschlossen'
    arbeitszeit: { von: '07:00', bis: '16:00' },
    wetter: [],
    anwesend: [],
    geraete: [],
    leistungen: [],
    ereignisse: [],
    config: { visibleSections: BAUTAGEBUCH_DEFAULT_SECTIONS.slice() },
  };
  return Object.assign(base, overrides || {});
}

// ======================================================================
// Abschluss-Datum je Tätigkeit/Mast (für die Fertigstellungsliste) + davon
// abgeleitete automatische Ereignis-Erzeugung im Bautagebuch. Getrennt von
// MAST_TASK_STATUS_KEY (das speichert nur den aktuell gewählten Status-Pill,
// z.B. bei frei umbenannten/neu sortierten Status-Optionen einer Liste),
// weil die Fertigstellungsliste ein festes, robustes Konzept braucht: wann
// wurde diese eine Tätigkeit an diesem einen Mast zuletzt als abgeschlossen
// dokumentiert - unabhängig davon, wie die Tätigkeitsliste ihre Status-
// Optionen benennt. { [mastKey]: { [taskId]: { datum: 'YYYY-MM-DD' } } }
// ======================================================================
const MAST_TASK_ABSCHLUSS_KEY = 'levelbuild_mast_task_abschluss';
migrateToProjectScopedKey(MAST_TASK_ABSCHLUSS_KEY);
function loadMastTaskAbschluss() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_TASK_ABSCHLUSS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastTaskAbschluss(map) {
  try { localStorage.setItem(pKey(MAST_TASK_ABSCHLUSS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// Findet (oder legt an) den heutigen Bautagesbericht des aktuellen Projekts
// und hängt dort ein neues Ereignis an - genutzt, damit jeder Tätigkeits-
// Abschluss aus der Handy-App automatisch auch im Bautagebuch auftaucht,
// ohne dass jemand das Ereignis von Hand nachtragen muss. "meta" trägt bei
// einem Protokoll-Abschluss zusätzlich { mastKey, taskId, protokollId } mit -
// dadurch kann das Bautagebuch später (siehe die "PDF-Protokoll erstellen"-
// Funktion in der Bautagebuch-Detail-Seite) genau diesen einen Datensatz
// wiederfinden und daraus automatisch das ausgefüllte PDF erzeugen.
function pushEreignisFuerHeute(titel, beschreibung, meta) {
  try {
    const list = loadBautagebuecher();
    const today = todayIsoDate();
    let r = list.find((x) => x.datum === today);
    if (!r) {
      r = makeBautagebuchEintrag({ nummer: nextBautagebuchNummer(list), datum: today });
      list.push(r);
    }
    if (!r.ereignisse) r.ereignisse = [];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const uhrzeit = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const evt = { id: makeMastDataId('evt'), uhrzeit, titel, beschreibung: beschreibung || '' };
    if (meta && meta.mastKey) evt.mastKey = meta.mastKey;
    if (meta && meta.taskId) evt.taskId = meta.taskId;
    if (meta && meta.protokollId) evt.protokollId = meta.protokollId;
    r.ereignisse.push(evt);
    saveBautagebuecher(list);
  } catch (e) { /* ignore */ }
}

// ======================================================================
// Offizielle PDF-Protokolle: jede Protokoll-Vorlage kann optional eine
// hochgeladene PDF-Vorlage ("pdfVorlage") tragen, auf der Bausteine sowie
// feste Systemfelder (Mastnummer, Datum, Betreff, Ersteller, Datenerfasser,
// Protokollname) an bestimmten Positionen platziert werden. Ist ein
// Datensatz (Protokoll-Antworten) für einen Mast vollständig, kann daraus
// automatisch ein ausgefülltes PDF erzeugt werden (siehe
// generateProtokollPdf weiter unten, genutzt vom Bautagebuch). Erzeugte
// Dokumente landen projekt-gescoped im DOKUMENTE_KEY-Speicher und werden
// über die Dokumente-Seite gefiltert/geöffnet sowie in der Mast-Detail-
// Seite verlinkt.
// ======================================================================

// Feste, immer verfügbare "Systemfelder" - zusätzlich zu den frei
// definierten Bausteinen eines Protokolls - die sich auf der PDF-Vorlage
// platzieren lassen. Diese Werte kommen nicht aus einem Baustein, sondern
// aus dem Kontext des jeweiligen Mast/Datensatzes bzw. werden beim
// Erstellen des Dokuments im Bautagebuch abgefragt.
const PDF_SYSTEM_FELDER = [
  { key: 'mastnummer', label: 'Mastnummer / Standort' },
  { key: 'datum', label: 'Datum' },
  { key: 'betreff', label: 'Betreff' },
  { key: 'ersteller', label: 'Ersteller' },
  { key: 'datenerfasser', label: 'Datenerfasser' },
  { key: 'protokollname', label: 'Protokollname' },
  // Projektname: bewusst als Systemfeld statt als Baustein, da er nicht in
  // der Handy-Vorlage erfasst wird, sondern immer schon aus dem Projekt
  // selbst bekannt ist (siehe currentProjectName()) - lässt sich trotzdem
  // auf der PDF-Vorlage platzieren, auch wenn dafür kein Feld auf dem Handy
  // existiert.
  { key: 'projektname', label: 'Projektname' },
];
// Verfügbare Schriftarten für die einheitliche Vorlagen-Schrift - bewusst
// auf pdf-libs eingebaute Standard-Schriften beschränkt (keine Font-Datei
// nötig, funktioniert garantiert für jede PDF-Vorlage).
const PDF_FONT_OPTIONS = [
  { key: 'Helvetica', label: 'Helvetica' },
  { key: 'HelveticaBold', label: 'Helvetica Fett' },
  { key: 'TimesRoman', label: 'Times' },
  { key: 'TimesRomanBold', label: 'Times Fett' },
  { key: 'Courier', label: 'Courier' },
];
function defaultVorlageStil() {
  return { fontFamily: 'Helvetica', fontSize: 10, farbe: '#1a1a1a' };
}
// Standard-Zeilenabstand für Tabellen-Bausteine auf der PDF-Vorlage - pro
// Baustein-ID gespeichert, nur als Vorschlag beim erstmaligen Platzieren
// einer Spalte bzw. beim Anfügen einer weiteren Zeile über "+ Zeile" in der
// Felder-Liste (siehe renderPdfFelderList). Jede einzelne Zelle (Zeile x
// Spalte) ist danach ein vollständig eigenständiges, frei verschiebbares
// Feld - es gibt bewusst KEINEN fortlaufend erzwungenen Zeilenabstand mehr
// (das war die vorherige "Geister-Zeilen"-Lösung, die der Nutzer explizit
// nicht wollte: "jede Zelle einer Tabelle muss einzeln auf die PDF gezogen
// werden können"). zeilenhoeheYPct ist bewusst schon eine Bruchteil-der-
// Seitenhöhe-Angabe (wie xPct/yPct), nicht in mm - die Editor-UI rechnet das
// beim Anzeigen/Eintragen nur um (siehe pdfPageDimsFor).
function defaultTabellenEinstellung() {
  return { zeilenhoeheYPct: 0.02 };
}
function emptyPdfVorlage(fileName, base64, numPages, pageSizes) {
  return { fileName, base64, numPages, pageSizes: pageSizes || [], felder: [], vorlageStil: defaultVorlageStil(), tabellenEinstellungen: {} };
}
function hexToRgb01(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return { r: 0.1, g: 0.1, b: 0.1 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
// Wandelt eine data-URL/base64-PDF in einen Uint8Array um, wie pdf-lib ihn
// erwartet - funktioniert sowohl im Browser (atob) als auch (falls jemals
// unter Node getestet) da atob dort per Polyfill/Test bereitgestellt wird.
function base64ToUint8Array(base64) {
  const clean = String(base64 || '').replace(/^data:application\/pdf;base64,/, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
// Erzeugt aus einer Protokoll-Vorlage (mit pdfVorlage) + den tatsächlichen
// Baustein-Werten (bausteinValues: { [bausteinId]: displayString }) und den
// Systemfeld-Werten (systemValues: { mastnummer, datum, betreff, ersteller,
// datenerfasser, protokollname }) ein ausgefülltes PDF. Gibt eine Promise
// zurück, die mit einer base64-Daten-URL des fertigen PDFs auflöst, oder
// wirft, wenn keine Vorlage konfiguriert ist oder pdf-lib nicht geladen ist.
async function generateProtokollPdf(protokoll, bausteinValues, systemValues) {
  if (!protokoll || !protokoll.pdfVorlage || !protokoll.pdfVorlage.base64) {
    throw new Error('Für dieses Protokoll ist keine PDF-Vorlage hinterlegt.');
  }
  const PDFLibRef = (typeof window !== 'undefined' && window.PDFLib) || (typeof PDFLib !== 'undefined' ? PDFLib : null);
  if (!PDFLibRef) throw new Error('PDF-Bibliothek (pdf-lib) nicht geladen.');
  const vorlage = protokoll.pdfVorlage;
  const bytes = base64ToUint8Array(vorlage.base64);
  const pdfDoc = await PDFLibRef.PDFDocument.load(bytes);
  const stil = vorlage.vorlageStil || defaultVorlageStil();
  const fontKey = PDFLibRef.StandardFonts[stil.fontFamily] ? stil.fontFamily : 'Helvetica';
  const font = await pdfDoc.embedFont(PDFLibRef.StandardFonts[fontKey]);
  const { r, g, b } = hexToRgb01(stil.farbe);
  const color = PDFLibRef.rgb(r, g, b);
  const size = Number(stil.fontSize) || 10;
  // pdf-lib zeichnet Text an seiner BASISLINIE, die Platzierung im Editor
  // ist dagegen top-left-basiert (wie CSS "top") - die Differenz zwischen
  // "oberer Rand des Textes" und Basislinie ist NICHT die volle Schriftgröße
  // (das war der vorherige, zu grobe Ansatz), sondern nur die Auf-/
  // Versalhöhe der Schriftart (~72% der Schriftgröße bei Helvetica). Mit der
  // vollen Schriftgröße als Versatz landete Tabellen-/Feldtext sichtbar zu
  // tief (z. B. deutlich unterhalb der gedruckten Zeilenlinie einer
  // Tabellenzeile) - font.heightAtSize(size, {descender:false}) liefert die
  // tatsächliche, schriftartspezifische Auf-/Versalhöhe.
  const ascent = font.heightAtSize(size, { descender: false });
  const pages = pdfDoc.getPages();
  (vorlage.felder || []).forEach((f) => {
    const page = pages[f.page];
    if (!page) return;
    const pw = page.getWidth();
    const ph = page.getHeight();
    let text = '';
    if (f.kind === 'system') {
      text = (systemValues && systemValues[f.systemKey]) || '';
    } else if (f.kind === 'tabelle') {
      // Jede Tabellen-Zelle (Zeile x Spalte) ist ein eigenständiges Feld mit
      // eigener Position (f.row/f.spalte) - bausteinValues[f.bausteinId] ist
      // hier (anders als bei den übrigen Baustein-Typen) das rohe Zeilen-
      // Array aus der Handy-App (siehe answers[b.id] in handyapp.js:
      // [[zeile1spalte1, zeile1spalte2, ...], [zeile2spalte1, ...], ...]).
      const rows = (bausteinValues && Array.isArray(bausteinValues[f.bausteinId])) ? bausteinValues[f.bausteinId] : [];
      const row = rows[f.row];
      const cell = row ? row[f.spalte] : null;
      text = cell == null ? '' : cell;
    } else {
      text = (bausteinValues && bausteinValues[f.bausteinId]) || '';
    }
    text = String(text == null ? '' : text);
    if (!text) return;
    const x = (f.xPct || 0) * pw;
    // Platzierung im Editor ist top-left-basiert (wie CSS/DOM), pdf-lib
    // zeichnet Text jedoch von einem links-unten-Ursprung aus - daher hier
    // die Y-Achse spiegeln (und um die Auf-/Versalhöhe statt der vollen
    // Schriftgröße nach unten versetzen, siehe Kommentar bei "ascent" oben).
    const y = ph - (f.yPct || 0) * ph - ascent;
    page.drawText(text, { x, y, size, font, color });
  });
  const outBytes = await pdfDoc.save();
  return 'data:application/pdf;base64,' + uint8ToBase64Global(outBytes);
}
// Wie das lokale uint8ToBase64 der Masttafel-IIFE (chunked, um bei größeren
// Dateien nicht an String.fromCharCode.apply-Argumentgrenzen zu stoßen) -
// hier top-level dupliziert, da generateProtokollPdf außerhalb jeder IIFE
// liegt und sowohl vom Protokoll-Editor als auch vom Bautagebuch aus
// aufgerufen wird.
function uint8ToBase64Global(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// { [projectId gescoped]: [{ id, betreff, mastKey, mastLabel, datum,
//   ersteller, datenerfasser, protokollId, protokollName, taskId,
//   pdfBase64, createdAt }] }
const DOKUMENTE_KEY = 'levelbuild_dokumente';
migrateToProjectScopedKey(DOKUMENTE_KEY);
function loadDokumente() {
  try { return JSON.parse(localStorage.getItem(pKey(DOKUMENTE_KEY)) || '[]'); } catch (e) { return []; }
}
function saveDokumente(list) {
  try { localStorage.setItem(pKey(DOKUMENTE_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function addDokument(doc) {
  const list = loadDokumente();
  list.push(doc);
  saveDokumente(list);
  return doc;
}

// Feste Auswahllisten für die Personaleinsatz-Maske (Anwesend). Es gibt in
// diesem Prototyp noch keine eigene Stammdaten-Verwaltung für Gewerke/
// Qualifikationen, daher hier als einfache, editierbar erweiterbare Liste
// hinterlegt (der zuletzt benutzte/aktuelle Wert wird der Liste immer
// automatisch vorangestellt, falls er nicht enthalten ist).
const PERSONAL_GEWERK_OPTIONS = ['Erdbau', 'Gründung Fahrleitung', 'Rohbau', 'Schalung', 'Bewehrung', 'Betonage', 'Zimmerer', 'Maurer', 'Elektro', 'Sanitär/Heizung', 'Gerüstbau', 'Straßenbau', 'Sonstiges'];
const PERSONAL_QUALIFIKATION_OPTIONS = ['Poliere', 'Vorarbeiter', 'Facharbeiter', 'Baumaschinenführer', 'Kranführer', 'Hilfskraft', 'Auszubildende/r', 'Meister', 'Sonstige'];
// Feste Demo-Werte für die Geräteeinsatz-Maske (Mandant/Niederlassung gibt es
// in diesem Prototyp noch nicht als eigenes Datenmodell - üblicherweise
// konzernweit/projektunabhängig gültig, daher fest hinterlegt). Der
// Gerätekatalog ist ebenfalls nur eine kleine Demo-Auswahl je
// Gruppenstufe; "alle anzeigen?" in der Maske blendet die
// Gruppenstufen-Filterung aus und zeigt den kompletten Katalog.
const GERAETE_MANDANT = { name: 'SPITZKE SE', nr: '101' };
const GERAETE_NIEDERLASSUNG = { name: 'NL Leer', nr: '10140' };
const GERAETE_EINHEIT_OPTIONS = ['Stunden', 'Tage', 'm', 'm²', 'm³', 'lfm'];
const GERAETE_GRUPPENSTUFEN = ['Erdbaugeräte', 'Krane', 'Betontechnik', 'Gerüste', 'Fahrzeuge', 'Kleingeräte/Werkzeug', 'Vermessungstechnik', 'Sonstige'];
const GERAETE_KATALOG = {
  'Erdbaugeräte': ['Bagger 20t', 'Bagger 8t', 'Radlader', 'Walze'],
  'Krane': ['Kran 50t', 'Kran 100t', 'Autokran'],
  'Betontechnik': ['Betonpumpe', 'Betonmischer', 'Rüttler'],
  'Gerüste': ['Fassadengerüst', 'Rollgerüst'],
  'Fahrzeuge': ['LKW', 'Transporter', 'PKW'],
  'Kleingeräte/Werkzeug': ['Stampfer', 'Trennschleifer', 'Bohrhammer'],
  'Vermessungstechnik': ['Tachymeter', 'Nivelliergerät', 'GPS-Rover'],
  'Sonstige': ['Sonstiges Gerät'],
};
// Rekursive Anwesend/Geräte-Baumknoten: { id, bezeichnung, zeitraumVon,
// zeitraumBis, anzahl, children: [...] }. Die angezeigte Anzahl eines
// Knotens mit Kindern ist immer die Summe seiner Blätter (siehe
// btSumAnzahl unten) - die eigene "anzahl" eines Elternknotens wird dann
// nur noch als Fallback benutzt, falls er (noch) keine Kinder hat.
// Für "Anwesend" (Personal) trägt der Knoten zusätzlich die
// Personaleinsatz-Felder (gewerk, qualifikation, pause, eigenpersonal,
// aussenvertraglich, bemerkung) - siehe personaleinsatzModalHtml weiter
// unten.
function makeBautagebuchTreeNode(overrides) {
  return Object.assign({ id: makeMastDataId('btn'), bezeichnung: '', zeitraumVon: '', zeitraumBis: '', anzahl: 1, children: [] }, overrides || {});
}
function btSumAnzahl(node) {
  if (!node.children || !node.children.length) return parseInt(node.anzahl, 10) || 0;
  return node.children.reduce((sum, c) => sum + btSumAnzahl(c), 0);
}
function btFindNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children && n.children.length) {
      const found = btFindNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}
// ----------------------------------------------------------------------
// Automatisches Wetter für das Datum eines Bautagebuchs, über die kostenlose
// Open-Meteo-API (kein API-Key nötig, CORS-fähig für direkte Browser-
// Fetches). Die Projektadresse ist in diesem Prototyp nur dekorativer Text
// ohne echtes Datenmodell, daher ein fester Demo-Standort (Nordhausen, wo
// das Beispielprojekt "Nordbrand Brauerei Sanierung" liegt) - lässt sich
// später leicht durch eine echte Projekt-Adresse/Geokodierung ersetzen.
// ----------------------------------------------------------------------
const BAUTAGEBUCH_WETTER_LAT = 51.5052;
const BAUTAGEBUCH_WETTER_LON = 10.7952;
const BAUTAGEBUCH_WETTER_STUNDEN = ['09:00', '13:00', '17:00'];
const WMO_WEATHER_LABELS = {
  0: 'Klar', 1: 'Überwiegend klar', 2: 'Teils bewölkt', 3: 'Bewölkt',
  45: 'Nebel', 48: 'Reifnebel',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
  56: 'Gefrierender Nieselregen', 57: 'Starker gefrierender Nieselregen',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
  66: 'Gefrierender Regen', 67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneegriesel',
  80: 'Regenschauer', 81: 'Regenschauer', 82: 'Starke Regenschauer',
  85: 'Schneeschauer', 86: 'Starker Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit starkem Hagel',
};
function wmoLabel(code) {
  return WMO_WEATHER_LABELS[code] || '';
}
// Liefert für ein ISO-Datum (YYYY-MM-DD) drei automatische Wetter-Einträge
// (09/13/17 Uhr) über Open-Meteo. Für Datumsangaben, die (ausgehend von
// "heute") mehr als ~5 Tage zurückliegen, wird die Archiv-API benutzt, sonst
// die Vorhersage-API (deckt auch Vergangenheit bis heute mit ab).
async function fetchWetterFuerDatum(datum) {
  if (!datum) return [];
  const today = todayIsoDate();
  const diffDays = Math.round((new Date(today) - new Date(datum)) / 86400000);
  const base = diffDays > 5
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?latitude=${BAUTAGEBUCH_WETTER_LAT}&longitude=${BAUTAGEBUCH_WETTER_LON}&start_date=${datum}&end_date=${datum}&hourly=temperature_2m,precipitation,weathercode&timezone=Europe%2FBerlin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Wetterdienst antwortete mit Status ' + res.status);
  const data = await res.json();
  const times = (data.hourly && data.hourly.time) || [];
  const temps = (data.hourly && data.hourly.temperature_2m) || [];
  const precs = (data.hourly && data.hourly.precipitation) || [];
  const codes = (data.hourly && data.hourly.weathercode) || [];
  if (!times.length) throw new Error('Keine Wetterdaten für dieses Datum verfügbar');
  return BAUTAGEBUCH_WETTER_STUNDEN.map((uhrzeit) => {
    const idx = times.indexOf(`${datum}T${uhrzeit}`);
    const temp = idx !== -1 ? temps[idx] : null;
    const prec = idx !== -1 ? precs[idx] : null;
    return {
      id: makeMastDataId('wtr'),
      uhrzeit,
      temperaturC: temp != null ? Math.round(temp * 10) / 10 : '',
      bedingung: idx !== -1 ? wmoLabel(codes[idx]) : '',
      niederschlagMm: prec != null ? prec : '',
      druckrelevant: prec != null && prec > 0,
      quelle: 'auto',
    };
  });
}
function btRemoveNode(nodes, id) {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const n of nodes) {
    if (n.children && n.children.length && btRemoveNode(n.children, id)) return true;
  }
  return false;
}

// ======================================================================
// Tätigkeitslisten (task lists): project-independent templates, created
// here in Projekteinstellungen, that can be pulled into a project as an
// independent deep copy and then fully customized just for that project
// without ever touching the template. Also drives the dedicated editor
// page (#page-taetigkeitsliste). Only runs where #tl-template-list exists
// (the Projekteinstellungen page - always in the DOM in the merged shell).
// ======================================================================
(function () {
  const templateListEl = document.getElementById('tl-template-list');
  if (!templateListEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  const TEMPLATES_KEY = 'levelbuild_taetigkeitslisten_vorlagen'; // global (Vorlage, kein Projektbezug)
  const PROJECT_LISTS_KEY = 'levelbuild_taetigkeitslisten_projekt'; // gleicher String wie TL_PROJECT_KEY oben - Migration läuft dort bereits

  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveTemplates(list) {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function loadProjectLists() {
    try { return JSON.parse(localStorage.getItem(pKey(PROJECT_LISTS_KEY)) || '[]'); } catch (e) { return []; }
  }
  function saveProjectLists(list) {
    try { localStorage.setItem(pKey(PROJECT_LISTS_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function defaultStatusOptions() {
    return [
      { id: makeId('st'), label: 'Nicht erledigt', color: '#8a94a6', icon: '○' },
      { id: makeId('st'), label: 'Erledigt', color: '#3fb950', icon: '✓' },
    ];
  }
  function emptyList(name) {
    return { id: makeId('tl'), name, statusOptions: defaultStatusOptions(), tasks: [] };
  }
  function emptyTask(nr) {
    return {
      id: makeId('tk'), nr: nr, titel: '', fristTage: null, rolle: '',
      dokuArt: 'keine', protokollId: null, dokuPflichtZumAbhaken: false,
      web: true, mobile: true, vorgaengerId: null,
    };
  }
  // Resolves a task's chosen Protokoll (by id, scoped like the surrounding
  // list) to its current name - looked up live rather than duplicating the
  // name onto the task, so a later Protokoll rename is reflected everywhere
  // it's referenced without needing to touch every Tätigkeit that uses it.
  function resolveProtokollName(protokollId, scope) {
    if (!protokollId) return '';
    const p = protokolleFor(scope).find((x) => x.id === protokollId);
    return p ? p.name : '(gelöschtes Protokoll)';
  }
  function storeFor(scope) {
    return scope === 'project'
      ? { load: loadProjectLists, save: saveProjectLists }
      : { load: loadTemplates, save: saveTemplates };
  }

  // ---------- Projekteinstellungen: template library + project-list panels ----------
  function renderTemplateList() {
    const items = loadTemplates();
    templateListEl.innerHTML = items.length
      ? items.map((l) => `
        <div class="col-config-row">
          <span>${esc(l.name)} <span class="badge-mini">${l.tasks.length} Tätigkeit${l.tasks.length === 1 ? '' : 'en'}</span></span>
          <span style="display:flex;gap:8px;">
            <button class="link-action" data-edit-tl="${esc(l.id)}">Bearbeiten</button>
            <button class="link-action" data-delete-tl="${esc(l.id)}" style="color:var(--red);">Löschen</button>
          </span>
        </div>`).join('')
      : '<div class="changelog-empty">Noch keine Tätigkeitslisten-Vorlagen angelegt.</div>';
    templateListEl.querySelectorAll('[data-edit-tl]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor('template', btn.getAttribute('data-edit-tl')));
    });
    templateListEl.querySelectorAll('[data-delete-tl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-tl');
        if (!confirm('Diese Vorlage wirklich löschen? Bereits in Projekte übernommene Kopien bleiben davon unberührt.')) return;
        saveTemplates(loadTemplates().filter((l) => l.id !== id));
        renderTemplateList();
        renderTemplateSelect();
      });
    });
  }

  function renderTemplateSelect() {
    const sel = document.getElementById('tl-project-add-select');
    if (!sel) return;
    const items = loadTemplates();
    sel.innerHTML = '<option value="">Vorlage auswählen…</option>' +
      items.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.tasks.length})</option>`).join('');
  }

  function renderProjectList() {
    const el = document.getElementById('tl-project-list');
    if (!el) return;
    const items = loadProjectLists();
    el.innerHTML = items.length
      ? items.map((l) => `
        <div class="col-config-row">
          <span>${esc(l.name)} <span class="badge-mini">${l.tasks.length} Tätigkeit${l.tasks.length === 1 ? '' : 'en'}</span></span>
          <span style="display:flex;gap:8px;">
            <button class="link-action" data-edit-pl="${esc(l.id)}">Bearbeiten</button>
            <button class="link-action" data-remove-pl="${esc(l.id)}" style="color:var(--red);">Entfernen</button>
          </span>
        </div>`).join('')
      : '<div class="changelog-empty">Diesem Projekt sind noch keine Tätigkeitslisten zugeordnet.</div>';
    el.querySelectorAll('[data-edit-pl]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor('project', btn.getAttribute('data-edit-pl')));
    });
    el.querySelectorAll('[data-remove-pl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-pl');
        if (!confirm('Diese Tätigkeitsliste wirklich aus dem Projekt entfernen? Die projektspezifischen Anpassungen gehen dabei verloren, die Vorlage selbst bleibt erhalten.')) return;
        saveProjectLists(loadProjectLists().filter((l) => l.id !== id));
        renderProjectList();
      });
    });
  }

  const templateAddInput = document.getElementById('tl-template-new-name');
  const templateAddBtn = document.getElementById('tl-template-add');
  function doAddTemplate() {
    if (!templateAddInput) return;
    const name = templateAddInput.value.trim();
    if (!name) return;
    const items = loadTemplates();
    items.push(emptyList(name));
    saveTemplates(items);
    templateAddInput.value = '';
    renderTemplateList();
    renderTemplateSelect();
  }
  if (templateAddBtn) templateAddBtn.addEventListener('click', doAddTemplate);
  if (templateAddInput) templateAddInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddTemplate(); });

  const projectAddBtn = document.getElementById('tl-project-add');
  if (projectAddBtn) {
    projectAddBtn.addEventListener('click', () => {
      const sel = document.getElementById('tl-project-add-select');
      const id = sel ? sel.value : '';
      if (!id) return;
      const tpl = loadTemplates().find((l) => l.id === id);
      if (!tpl) return;
      // Deep copy with fresh ids, so editing the project's copy never
      // touches the template - and editing the template later never
      // retroactively changes lists already pulled into a project.
      const copy = JSON.parse(JSON.stringify(tpl));
      copy.id = makeId('tl');
      copy.sourceTemplateName = tpl.name;
      const statusIdMap = {};
      copy.statusOptions.forEach((s) => { const oldId = s.id; s.id = makeId('st'); statusIdMap[oldId] = s.id; });
      copy.tasks.forEach((t) => { t.id = makeId('tk'); t.vorgaengerId = null; });
      const projectItems = loadProjectLists();
      projectItems.push(copy);
      saveProjectLists(projectItems);
      if (sel) sel.value = '';
      renderProjectList();
    });
  }

  renderTemplateList();
  renderTemplateSelect();
  renderProjectList();

  // renderProjectList() liest die im Projekt übernommenen Tätigkeitslisten
  // projekt-gescoped (pKey()) - beim Wechsel zu einem anderen Projekt muss
  // sie neu gerendert werden, sonst zeigt sie weiter die Listen des vorher
  // geöffneten Projekts. renderTemplateList()/renderTemplateSelect() (die
  // projektübergreifenden Vorlagen) müssen dafür nicht neu laufen.
  const prevOnShowPE2 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE2) prevOnShowPE2();
    renderProjectList();
  };

  // ---------- Tätigkeitsliste editor page ----------
  let currentScope = null;
  let currentListId = null;

  function findCurrentList() {
    if (!currentScope || !currentListId) return null;
    return storeFor(currentScope).load().find((l) => l.id === currentListId) || null;
  }
  function saveCurrentList(list) {
    const store = storeFor(currentScope);
    const items = store.load();
    const idx = items.findIndex((l) => l.id === list.id);
    if (idx >= 0) items[idx] = list;
    store.save(items);
  }

  function openEditor(scope, id) {
    currentScope = scope;
    currentListId = id;
    if (window.levelbuildGo) window.levelbuildGo('taetigkeitsliste');
    renderEditor();
  }
  // Exposed for the router (called on nav to #taetigkeitsliste) and for
  // direct use from the Projekteinstellungen "Bearbeiten" buttons above.
  window.levelbuildOpenTaetigkeitsliste = openEditor;
  window.levelbuildOnShowTaetigkeitsliste = function () { renderEditor(); };

  function fmtStatusChip(s) {
    return `<span class="tl-status-chip" style="--tl-color:${esc(s.color)}">${esc(s.icon || '')} ${esc(s.label)}</span>`;
  }

  function renderEditor() {
    const titleEl = document.getElementById('tl-title');
    const crumbEl = document.getElementById('tl-crumb-name');
    const crumbParentEl = document.getElementById('tl-crumb-parent');
    const backLinkEl = document.getElementById('tl-back-link');
    const badgeEl = document.getElementById('tl-scope-badge');
    const hintEl = document.getElementById('tl-scope-hint');
    const statusListEl = document.getElementById('tl-status-list');
    const tbody = document.getElementById('tl-task-tbody');
    const emptyEl = document.getElementById('tl-task-empty');
    if (!titleEl || !tbody) return;

    // A template's "home" is the project-independent Vorlagen area on the
    // Projekte page, not any one project's Projekteinstellungen - keep the
    // back-link/breadcrumb pointing at wherever this list actually lives.
    if (crumbParentEl && backLinkEl) {
      if (currentScope === 'template') {
        crumbParentEl.textContent = 'Projekte · Vorlagen';
        crumbParentEl.href = '#projekte';
        backLinkEl.href = '#projekte';
      } else {
        crumbParentEl.textContent = 'Projekteinstellungen';
        crumbParentEl.href = '#projekteinstellungen';
        backLinkEl.href = '#projekteinstellungen';
      }
    }

    const list = findCurrentList();
    if (!list) {
      titleEl.textContent = 'Tätigkeitsliste';
      if (crumbEl) crumbEl.textContent = 'Tätigkeitsliste';
      if (badgeEl) badgeEl.hidden = true;
      if (hintEl) hintEl.textContent = 'Keine Tätigkeitsliste ausgewählt - bitte über Projekte · Vorlagen oder die Projekteinstellungen eines Projekts eine Liste zum Bearbeiten öffnen.';
      if (statusListEl) statusListEl.innerHTML = '';
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    titleEl.textContent = list.name;
    if (crumbEl) crumbEl.textContent = list.name;
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.textContent = currentScope === 'project' ? ('Projekt: ' + currentProjectLabel()) : 'Vorlage';
    }
    if (hintEl) {
      hintEl.textContent = currentScope === 'project'
        ? (list.sourceTemplateName ? `Übernommen aus der Vorlage "${list.sourceTemplateName}" - Änderungen hier wirken sich nur auf dieses Projekt aus.` : 'Nur diesem Projekt zugeordnet.')
        : 'Projektübergreifende Vorlage - Änderungen wirken sich nicht auf bereits in Projekte übernommene Kopien aus.';
    }

    // ---- status options ----
    if (statusListEl) {
      statusListEl.innerHTML = list.statusOptions.map((s) => `
        <span class="tl-status-row">
          ${fmtStatusChip(s)}
          <button type="button" class="icon-btn" data-remove-status="${esc(s.id)}" title="Entfernen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>`).join('');
      statusListEl.querySelectorAll('[data-remove-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          list.statusOptions = list.statusOptions.filter((s) => s.id !== btn.getAttribute('data-remove-status'));
          saveCurrentList(list);
          renderEditor();
        });
      });
    }

    // ---- tasks table ----
    if (emptyEl) emptyEl.hidden = list.tasks.length > 0;
    tbody.innerHTML = list.tasks.map((t) => {
      const vorgaenger = t.vorgaengerId ? list.tasks.find((x) => x.id === t.vorgaengerId) : null;
      const protokollName = t.dokuArt === 'protokoll' ? resolveProtokollName(t.protokollId, currentScope) : '';
      const doku = t.dokuArt === 'foto' ? 'Foto' : (t.dokuArt === 'protokoll' ? ('Protokoll' + (protokollName ? ' (' + esc(protokollName) + ')' : '')) : '–');
      return `<tr>
        <td>${esc(t.nr)}</td>
        <td>${t.titel ? esc(t.titel) : '<span class="stat-value empty">–</span>'}</td>
        <td>${t.fristTage != null && t.fristTage !== '' ? esc(t.fristTage) + ' Tage' : '–'}</td>
        <td>${t.rolle ? esc(t.rolle) : '–'}</td>
        <td>${doku}${t.dokuArt !== 'keine' && t.dokuPflichtZumAbhaken ? ' <span class="badge-mini">Pflicht</span>' : ''}</td>
        <td>${t.web ? '✓' : '–'}</td>
        <td>${t.mobile ? '✓' : '–'}</td>
        <td>${vorgaenger ? esc(vorgaenger.nr + ' ' + (vorgaenger.titel || '')) : '–'}</td>
        <td>
          <button type="button" class="icon-btn" data-edit-task="${esc(t.id)}" title="Bearbeiten">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          </button>
          <button type="button" class="icon-btn" data-remove-task="${esc(t.id)}" title="Löschen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-task]').forEach((btn) => {
      btn.addEventListener('click', () => openTaskModal(list, btn.getAttribute('data-edit-task')));
    });
    tbody.querySelectorAll('[data-remove-task]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-task');
        if (!confirm('Diese Tätigkeit wirklich löschen?')) return;
        list.tasks = list.tasks.filter((t) => t.id !== id);
        // Clear any dangling predecessor references left pointing at the
        // task that was just removed - not every task needs a predecessor.
        list.tasks.forEach((t) => { if (t.vorgaengerId === id) t.vorgaengerId = null; });
        saveCurrentList(list);
        renderEditor();
      });
    });
  }

  const statusAddBtn = document.getElementById('tl-status-add');
  if (statusAddBtn) {
    statusAddBtn.addEventListener('click', () => {
      const list = findCurrentList();
      if (!list) return;
      const labelEl = document.getElementById('tl-status-new-label');
      const colorEl = document.getElementById('tl-status-new-color');
      const iconEl = document.getElementById('tl-status-new-icon');
      const label = labelEl ? labelEl.value.trim() : '';
      if (!label) return;
      list.statusOptions.push({ id: makeId('st'), label, color: colorEl ? colorEl.value : '#2f6fed', icon: iconEl ? iconEl.value.trim() : '' });
      saveCurrentList(list);
      if (labelEl) labelEl.value = '';
      if (iconEl) iconEl.value = '';
      renderEditor();
    });
  }

  const renameBtn = document.getElementById('tl-rename');
  if (renameBtn) {
    renameBtn.addEventListener('click', () => {
      const list = findCurrentList();
      if (!list) return;
      const name = prompt('Neuer Name für diese Tätigkeitsliste:', list.name);
      if (!name || !name.trim()) return;
      list.name = name.trim();
      saveCurrentList(list);
      renderEditor();
      renderTemplateList();
      renderTemplateSelect();
      renderProjectList();
    });
  }

  const taskAddBtn = document.getElementById('tl-task-add');
  if (taskAddBtn) {
    taskAddBtn.addEventListener('click', () => {
      const list = findCurrentList();
      if (!list) return;
      const nextNr = list.tasks.length ? Math.max(...list.tasks.map((t) => parseInt(t.nr, 10) || 0)) + 1 : 1;
      const task = emptyTask(nextNr);
      list.tasks.push(task);
      saveCurrentList(list);
      renderEditor();
      openTaskModal(list, task.id);
    });
  }

  // ---- task edit modal (reuses the page-agnostic generic modal) ----
  function openTaskModal(list, taskId) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    if (!modalOverlay) return;
    const task = list.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const predecessorOptions = list.tasks
      .filter((t) => t.id !== task.id)
      .map((t) => `<option value="${esc(t.id)}" ${task.vorgaengerId === t.id ? 'selected' : ''}>${esc(t.nr)} - ${esc(t.titel || '(ohne Titel)')}</option>`)
      .join('');
    const availableProtokolle = protokolleFor(currentScope);
    const protokollOptions = availableProtokolle
      .map((p) => `<option value="${esc(p.id)}" ${task.protokollId === p.id ? 'selected' : ''}>${esc(p.name)} (${p.bausteine.length})</option>`)
      .join('');

    modalTitle.textContent = 'Tätigkeit bearbeiten';
    modalBody.innerHTML = `
      <div class="field-row">
        <div class="field" style="max-width:90px;">
          <label>Nr.</label>
          <div class="input-wrap"><input type="text" id="tk-nr" value="${esc(task.nr)}"></div>
        </div>
        <div class="field">
          <label>Titel</label>
          <div class="input-wrap"><input type="text" id="tk-titel" value="${esc(task.titel)}" placeholder="z. B. Gerüst freigeben"></div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Frist (Tage nach Projekt-/Bauabschnittstart)</label>
          <div class="input-wrap"><input type="number" id="tk-frist" min="0" value="${task.fristTage != null ? esc(task.fristTage) : ''}"></div>
        </div>
        <div class="field">
          <label>Verantwortliche Rolle</label>
          <div class="input-wrap"><input type="text" id="tk-rolle" value="${esc(task.rolle)}" placeholder="z. B. Bauleiter"></div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="field">
        <label class="muted">Dokumentation</label>
        <div class="input-wrap">
          <select id="tk-doku-art">
            <option value="keine" ${task.dokuArt === 'keine' ? 'selected' : ''}>Keine</option>
            <option value="foto" ${task.dokuArt === 'foto' ? 'selected' : ''}>Foto</option>
            <option value="protokoll" ${task.dokuArt === 'protokoll' ? 'selected' : ''}>Protokoll</option>
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field" id="tk-protokoll-typ-wrap" ${task.dokuArt === 'protokoll' ? '' : 'hidden'}>
        <label>Welches Protokoll?</label>
        <div class="input-wrap">
          <select id="tk-protokoll-select">
            <option value="">– Protokoll auswählen –</option>
            ${protokollOptions}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        ${availableProtokolle.length === 0 ? `<div style="font-size:11px; color:var(--gray-500); margin-top:4px;">Noch kein Protokoll ${currentScope === 'project' ? 'diesem Projekt zugeordnet' : 'angelegt'} - siehe Projekte &rsaquo; Vorlagen${currentScope === 'project' ? ' bzw. die Projekteinstellungen' : ''}.</div>` : ''}
      </div>
      <label class="toggle-item" style="padding:0; margin-bottom:10px;">
        <span class="toggle-label">Nachweis Pflicht zum Abhaken</span>
        <div class="switch${task.dokuPflichtZumAbhaken ? ' on' : ''}" id="tk-pflicht-switch"><div class="knob"></div></div>
      </label>
      <div class="hr"></div>
      <div class="field-row">
        <label class="toggle-item" style="padding:0;">
          <span class="toggle-label">Im Web anzeigen</span>
          <div class="switch${task.web ? ' on' : ''}" id="tk-web-switch"><div class="knob"></div></div>
        </label>
        <label class="toggle-item" style="padding:0;">
          <span class="toggle-label">Für mobile Nutzer anzeigen</span>
          <div class="switch${task.mobile ? ' on' : ''}" id="tk-mobile-switch"><div class="knob"></div></div>
        </label>
      </div>
      <div class="hr"></div>
      <div class="field">
        <label class="muted">Vorgänger (optional)</label>
        <div class="input-wrap">
          <select id="tk-vorgaenger">
            <option value="">– Kein Vorgänger –</option>
            ${predecessorOptions}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        <div style="font-size:11px; color:var(--gray-500); margin-top:4px;">Ist eine Tätigkeit erledigt, ihr Vorgänger aber nicht, geht eine Aufgabe an den Verantwortlichen (Polier/Bauleiter) des Vorgängers.</div>
      </div>
    `;
    modalFooter.innerHTML = `
      <button class="btn-primary" id="tk-save">Speichern</button>
      <button class="matt-tool-btn" id="tk-cancel">Abbrechen</button>
    `;
    modalOverlay.hidden = false;

    const dokuArtSel = document.getElementById('tk-doku-art');
    const protokollWrap = document.getElementById('tk-protokoll-typ-wrap');
    if (dokuArtSel) {
      dokuArtSel.addEventListener('change', () => {
        if (protokollWrap) protokollWrap.hidden = dokuArtSel.value !== 'protokoll';
      });
    }
    ['tk-pflicht-switch', 'tk-web-switch', 'tk-mobile-switch'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => el.classList.toggle('on'));
    });

    document.getElementById('tk-cancel').addEventListener('click', () => { modalOverlay.hidden = true; });
    document.getElementById('tk-save').addEventListener('click', () => {
      task.nr = document.getElementById('tk-nr').value.trim() || task.nr;
      task.titel = document.getElementById('tk-titel').value.trim();
      const fristVal = document.getElementById('tk-frist').value;
      task.fristTage = fristVal === '' ? null : parseInt(fristVal, 10);
      task.rolle = document.getElementById('tk-rolle').value.trim();
      task.dokuArt = document.getElementById('tk-doku-art').value;
      const protoEl = document.getElementById('tk-protokoll-select');
      task.protokollId = protoEl && protoEl.value ? protoEl.value : null;
      task.dokuPflichtZumAbhaken = document.getElementById('tk-pflicht-switch').classList.contains('on');
      task.web = document.getElementById('tk-web-switch').classList.contains('on');
      task.mobile = document.getElementById('tk-mobile-switch').classList.contains('on');
      const vg = document.getElementById('tk-vorgaenger').value;
      task.vorgaengerId = vg || null;
      saveCurrentList(list);
      modalOverlay.hidden = true;
      renderEditor();
    });
  }

  renderEditor();
})();

// ======================================================================
// Protokolle: Baustein-based data-collection masks, same project-
// independent template -> pull into project -> adapt pattern as
// Tätigkeitslisten above. Selectable from a Tätigkeit's "welches
// Protokoll?" field (see protokolleFor() near the top of this file) so a
// mobile Tätigkeitenliste view can later show the right mask per Mast.
// Only runs where #pr-template-list exists (the Projekte page's Vorlagen
// tab - always in the DOM in the merged shell).
// ======================================================================
(function () {
  const templateListEl = document.getElementById('pr-template-list');
  if (!templateListEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  const BAUSTEIN_TYPES = {
    text: { label: 'Textfeld', defaultLabel: 'Textfeld' },
    zahl: { label: 'Zahl', defaultLabel: 'Zahl' },
    foto: { label: 'Foto', defaultLabel: 'Foto' },
    checkbox: { label: 'Checkbox', defaultLabel: 'Ja / Nein' },
    auswahl: { label: 'Auswahl', defaultLabel: 'Auswahl' },
    datum: { label: 'Datum', defaultLabel: 'Datum' },
    unterschrift: { label: 'Unterschrift', defaultLabel: 'Unterschrift' },
    tabelle: { label: 'Tabelle', defaultLabel: 'Tabelle' },
    abschnitt: { label: 'Abschnitt', defaultLabel: 'Abschnittsüberschrift' },
  };

  function emptyProtokoll(name) {
    return { id: makeProtokollId('pr'), name, bausteine: [], pdfVorlage: null };
  }
  // Vorbefüllung einer Tabellen-Spalte: manche Spalten (z. B. "Tiefe [m]"
  // bei einer Rammgründung) stehen praktisch immer schon vorher fest - die
  // Handy-Vorlage soll sie dann automatisch zeigen, ohne dass der
  // Datenerfasser sie erst eintippen muss. "keine" lässt die Zellen wie
  // bisher leer.
  function defaultTabelleSpaltePrefill() {
    return { mode: 'keine', text: '', start: 1, schritt: 1, liste: '' };
  }
  // Berechnet den Vorbefüllungs-Wert für eine bestimmte Zeile einer Spalte -
  // wird sowohl bei einer frisch (noch unbeantworteten) angezeigten Tabelle
  // in der Handy-Vorschau hier im Editor als auch in der echten Handy-App
  // (handyapp.js, dort als identische Kopie, da eine eigene Datei ohne
  // gemeinsamen Scope) verwendet.
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
  // Hält b.columnPrefill in derselben Länge wie b.columns - wird nach jedem
  // Hinzufügen/Entfernen einer Spalte aufgerufen, damit die Indizes immer
  // zueinander passen.
  function syncTabelleSpaltenPrefill(b) {
    if (!Array.isArray(b.columnPrefill)) b.columnPrefill = [];
    const n = (b.columns || []).length;
    while (b.columnPrefill.length < n) b.columnPrefill.push(defaultTabelleSpaltePrefill());
    b.columnPrefill.length = n;
  }

  // ---------- Checkbox-Baustein: mehrere einzeln ankreuzbare Optionen,
  // optional mit einer eigenen Folgefrage pro Option (z. B. "Ja" -> "Grund"
  // als Textfeld, das erst erscheint, wenn "Ja" angekreuzt wird). Das war
  // eine explizite Nutzeranforderung: "verschiedene Checkboxen erstellt
  // werden können also z.b. eine Ja eine Nein... wenn auch ja gedrückt wird
  // das dann eine extra abfrage kommt".
  //
  // Eine Folgefrage ist bewusst nur für die "einfachen" Feldtypen möglich
  // (Text/Zahl/Datum/Auswahl) - Foto/Unterschrift/Tabelle/Checkbox brauchen
  // eigene, aufwendigere Wiring-Logik (Canvas/Datei-Upload/verschachtelte
  // Zeilen) und werden hier bewusst nicht als Folgefrage angeboten.
  const FOLGEFELD_TYPES = ['text', 'zahl', 'datum', 'auswahl'];
  const FOLGEFELD_TYPE_LABELS = { text: 'Textfeld', zahl: 'Zahl', datum: 'Datum', auswahl: 'Auswahl' };
  function defaultCheckboxOption(label) {
    return { id: makeProtokollId('opt'), label: label || 'Option', folgefeld: null };
  }
  // Eine Folgefrage ist ein eigenes, kleines Baustein-ähnliches Objekt - mit
  // denselben Grundeinstellungen (Beschriftung/Hilfetext/Pflichtfeld) wie ein
  // normaler Baustein, plus den zu ihrem Typ passenden Zusatzfeldern.
  function emptyFolgefeld(type) {
    const label = FOLGEFELD_TYPE_LABELS[type] || type;
    const f = { id: makeProtokollId('ff'), type, label, required: false, hilfetext: '', standardwert: '' };
    if (type === 'auswahl') { f.choices = ['Option 1', 'Option 2']; }
    if (type === 'zahl') { f.einheit = ''; f.min = ''; f.max = ''; }
    return f;
  }
  // Migriert/normalisiert b.optionen - sowohl für neu angelegte Checkbox-
  // Bausteine als auch für ältere, noch im alten Ja/Nein-Bool-Format
  // gespeicherte (dort gibt es kein b.optionen -> Standard-Optionen anlegen).
  function syncCheckboxOptionen(b) {
    if (!Array.isArray(b.optionen) || !b.optionen.length) {
      b.optionen = [defaultCheckboxOption('Ja'), defaultCheckboxOption('Nein')];
    }
  }

  function emptyBaustein(type) {
    const meta = BAUSTEIN_TYPES[type] || { defaultLabel: type };
    const b = {
      id: makeProtokollId('bs'), type, label: meta.defaultLabel, required: false,
      heading: '', quelle: 'manuell', masttafelSpalte: null,
      hilfetext: '', width: 'full', standardwert: '',
    };
    if (type === 'auswahl') { b.choices = ['Option 1', 'Option 2']; b.mehrfachauswahl = false; }
    if (type === 'tabelle') {
      b.columns = ['Spalte 1', 'Spalte 2'];
      b.rows = 1;
      b.columnPrefill = [defaultTabelleSpaltePrefill(), defaultTabelleSpaltePrefill()];
    }
    if (type === 'zahl') { b.einheit = ''; b.min = ''; b.max = ''; }
    if (type === 'foto') { b.mehrfach = false; b.maxAnzahl = ''; }
    if (type === 'text') { b.mehrzeilig = false; }
    if (type === 'abschnitt') { b.beschreibung = ''; }
    if (type === 'checkbox') { b.optionen = [defaultCheckboxOption('Ja'), defaultCheckboxOption('Nein')]; }
    return b;
  }
  // Field types where "diese Information kommt automatisch aus einer
  // Masttafel-Spalte" makes sense - a Foto/Unterschrift/Abschnitt/Tabelle
  // can't sensibly be auto-filled from a single spreadsheet cell. A
  // Mehrfachauswahl-Auswahl is also excluded - a spreadsheet cell only
  // ever holds one value, not several selected options at once. Checkbox
  // ist seit den mehreren einzeln ankreuzbaren Optionen (b.optionen) ebenso
  // ausgeschlossen - eine einzelne Tabellenzelle lässt sich nicht sinnvoll
  // auf mehrere unabhängige Checkboxen abbilden.
  const SOURCEABLE_TYPES = ['text', 'zahl', 'datum', 'auswahl'];
  // Baustein-Typen, die sich sinnvoll als einzeiliger Text auf die PDF-
  // Vorlage schreiben lassen. Foto/Unterschrift/Tabelle/Abschnitt haben
  // keinen einfachen Text-Wert (Bilder einbetten wäre eine eigene,
  // deutlich größere Funktion) und werden daher hier bewusst nicht zum
  // Platzieren angeboten.
  const PLACEABLE_BAUSTEIN_TYPES = ['text', 'zahl', 'datum', 'auswahl', 'checkbox'];
  // Types that can be placed at half width (side by side, e.g. "Breite" und
  // "Höhe" nebeneinander) - large controls (Foto/Tabelle/Unterschrift/
  // Abschnitt) always stay full width.
  const WIDTH_TYPES = ['text', 'zahl', 'datum', 'auswahl', 'checkbox'];
  const DEFAULT_VALUE_TYPES = ['text', 'zahl', 'datum'];
  const LOCK_SVG_SMALL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function storeForProtokoll(scope) {
    return scope === 'project'
      ? { load: loadProtokollProjectList, save: saveProtokollProjectList }
      : { load: loadProtokollTemplates, save: saveProtokollTemplates };
  }

  // ---------- Projekte-Vorlagen-Tab: template library ----------
  function renderTemplateList() {
    const items = loadProtokollTemplates();
    templateListEl.innerHTML = items.length
      ? items.map((p) => `
        <div class="col-config-row">
          <span>${esc(p.name)} <span class="badge-mini">${p.bausteine.length} Baustein${p.bausteine.length === 1 ? '' : 'e'}</span></span>
          <span style="display:flex;gap:8px;">
            <button class="link-action" data-edit-pr="${esc(p.id)}">Bearbeiten</button>
            <button class="link-action" data-delete-pr="${esc(p.id)}" style="color:var(--red);">Löschen</button>
          </span>
        </div>`).join('')
      : '<div class="changelog-empty">Noch keine Protokoll-Vorlagen angelegt.</div>';
    templateListEl.querySelectorAll('[data-edit-pr]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor('template', btn.getAttribute('data-edit-pr')));
    });
    templateListEl.querySelectorAll('[data-delete-pr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-pr');
        if (!confirm('Diese Vorlage wirklich löschen? Bereits in Projekte übernommene Kopien bleiben davon unberührt.')) return;
        saveProtokollTemplates(loadProtokollTemplates().filter((p) => p.id !== id));
        renderTemplateList();
        renderTemplateSelect();
      });
    });
  }

  function renderTemplateSelect() {
    const sel = document.getElementById('pr-project-add-select');
    if (!sel) return;
    const items = loadProtokollTemplates();
    sel.innerHTML = '<option value="">Vorlage auswählen…</option>' +
      items.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.bausteine.length})</option>`).join('');
  }

  // ---------- Projekteinstellungen: Protokolle in diesem Projekt ----------
  function renderProjectList() {
    const el = document.getElementById('pr-project-list');
    if (!el) return;
    const items = loadProtokollProjectList();
    el.innerHTML = items.length
      ? items.map((p) => `
        <div class="col-config-row">
          <span>${esc(p.name)} <span class="badge-mini">${p.bausteine.length} Baustein${p.bausteine.length === 1 ? '' : 'e'}</span></span>
          <span style="display:flex;gap:8px;">
            <button class="link-action" data-edit-pp="${esc(p.id)}">Bearbeiten</button>
            <button class="link-action" data-remove-pp="${esc(p.id)}" style="color:var(--red);">Entfernen</button>
          </span>
        </div>`).join('')
      : '<div class="changelog-empty">Diesem Projekt sind noch keine Protokolle zugeordnet.</div>';
    el.querySelectorAll('[data-edit-pp]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor('project', btn.getAttribute('data-edit-pp')));
    });
    el.querySelectorAll('[data-remove-pp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-pp');
        if (!confirm('Dieses Protokoll wirklich aus dem Projekt entfernen? Die projektspezifischen Anpassungen gehen dabei verloren, die Vorlage selbst bleibt erhalten.')) return;
        saveProtokollProjectList(loadProtokollProjectList().filter((p) => p.id !== id));
        renderProjectList();
      });
    });
  }

  const templateAddInput = document.getElementById('pr-template-new-name');
  const templateAddBtn = document.getElementById('pr-template-add');
  function doAddTemplate() {
    if (!templateAddInput) return;
    const name = templateAddInput.value.trim();
    if (!name) return;
    const items = loadProtokollTemplates();
    items.push(emptyProtokoll(name));
    saveProtokollTemplates(items);
    templateAddInput.value = '';
    renderTemplateList();
    renderTemplateSelect();
  }
  if (templateAddBtn) templateAddBtn.addEventListener('click', doAddTemplate);
  if (templateAddInput) templateAddInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddTemplate(); });

  const projectAddBtn = document.getElementById('pr-project-add');
  if (projectAddBtn) {
    projectAddBtn.addEventListener('click', () => {
      const sel = document.getElementById('pr-project-add-select');
      const id = sel ? sel.value : '';
      if (!id) return;
      const tpl = loadProtokollTemplates().find((p) => p.id === id);
      if (!tpl) return;
      // Deep copy with fresh ids - same independence guarantee as
      // Tätigkeitslisten: editing the project's copy never touches the
      // template, and editing the template later never retroactively
      // changes copies already pulled into a project.
      const copy = JSON.parse(JSON.stringify(tpl));
      copy.id = makeProtokollId('pr');
      copy.sourceTemplateName = tpl.name;
      copy.bausteine.forEach((b) => { b.id = makeProtokollId('bs'); });
      const items = loadProtokollProjectList();
      items.push(copy);
      saveProtokollProjectList(items);
      if (sel) sel.value = '';
      renderProjectList();
    });
  }

  window.levelbuildOnShowProjekteVorlagen = function () {
    renderTemplateList();
    renderTemplateSelect();
  };

  renderTemplateList();
  renderTemplateSelect();
  renderProjectList();

  // renderProjectList() liest die im Projekt übernommenen Protokolle
  // projekt-gescoped (pKey()) - beim Wechsel zu einem anderen Projekt muss
  // sie neu gerendert werden, sonst zeigt sie weiter die Protokolle des
  // vorher geöffneten Projekts.
  const prevOnShowPE3 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE3) prevOnShowPE3();
    renderProjectList();
  };

  // ---------- Protokoll editor (Bausteine + Handy-Vorschau) ----------
  let currentScope = null;
  let currentProtokollId = null;
  // Welche Seite der PDF-Vorlage im Platzierungs-Editor gerade angezeigt
  // wird - Session-Zustand, nicht persistiert, wird beim Wechsel zu einem
  // anderen Protokoll bzw. beim Hochladen einer neuen Vorlage zurückgesetzt.
  let pdfCurrentPage = 0;
  // Zoomstufe der Platzierungs-Vorschau (rein visuell/Session-Zustand) -
  // größer zoomen erlaubt genaueres Klicken/Ziehen beim Platzieren.
  const PDF_ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2, 2.5];
  let pdfZoom = 1;
  // Welches platzierte Feld gerade "ausgewählt" ist (Klick auf einen Marker
  // ohne Ziehen, oder Klick auf seine Zeile in der Felder-Liste) - lässt sich
  // dann per Pfeiltasten fein justieren.
  let pdfSelectedFeldId = null;
  // Beim Ziehen eines Markers: rasten X/Y automatisch an anderen Feldern auf
  // derselben Seite ein, wenn sie nahe genug beieinander liegen - erleichtert
  // eine gerade Ausrichtung mehrerer Felder in einer Zeile/Spalte erheblich.
  const PDF_SNAP_THRESHOLD = 0.012;
  // 1 PDF-Punkt = 1/72 Zoll; 1 Zoll = 25,4mm.
  const PDF_MM_PER_PT = 25.4 / 72;

  function findCurrentProtokoll() {
    if (!currentScope || !currentProtokollId) return null;
    return storeForProtokoll(currentScope).load().find((l) => l.id === currentProtokollId) || null;
  }
  function saveCurrentProtokoll(list) {
    const store = storeForProtokoll(currentScope);
    const items = store.load();
    const idx = items.findIndex((l) => l.id === list.id);
    if (idx >= 0) items[idx] = list;
    store.save(items);
  }

  function openEditor(scope, id) {
    currentScope = scope;
    currentProtokollId = id;
    pdfCurrentPage = 0;
    pdfZoom = 1;
    pdfSelectedFeldId = null;
    if (window.levelbuildGo) window.levelbuildGo('protokoll');
    renderEditor();
  }
  window.levelbuildOpenProtokoll = openEditor;
  window.levelbuildOnShowProtokoll = function () { renderEditor(); };

  // Renders one Baustein's row in the left-hand editable list. Kept
  // structural changes (add/delete/move) in a separate re-render from
  // plain field edits (label/choices/required) below, so typing in a label
  // input never rebuilds the DOM out from under the cursor.
  // Eine einzelne Spalten-Zeile im Tabellen-Baustein-Editor: Spaltenname +
  // Vorbefüllungs-Modus + je nach Modus passende Zusatzfelder + Entfernen-
  // Button (nur wenn mehr als eine Spalte übrig bleibt).
  function tabelleSpalteRowHtml(b, i, col) {
    const prefill = (b.columnPrefill && b.columnPrefill[i]) || defaultTabelleSpaltePrefill();
    const modeOptions = [
      { v: 'keine', l: 'Keine Vorbefüllung' },
      { v: 'text', l: 'Gleicher Text für alle Zeilen' },
      { v: 'fortlaufend', l: 'Fortlaufend nummeriert' },
      { v: 'liste', l: 'Werte pro Zeile (Liste)' },
    ];
    let extra = '';
    if (prefill.mode === 'text') {
      extra = `<input type="text" class="pr-tabelle-spalte-extra" data-tabelle-spalte-text="${esc(b.id)}" data-spalte-idx="${i}" value="${esc(prefill.text || '')}" placeholder="Text für alle Zeilen">`;
    } else if (prefill.mode === 'fortlaufend') {
      extra = `<span class="pr-tabelle-spalte-extra pr-tabelle-spalte-extra-zahlen">
        <input type="number" data-tabelle-spalte-start="${esc(b.id)}" data-spalte-idx="${i}" value="${esc(String(prefill.start != null ? prefill.start : 1))}" title="Startwert (Zeile 1)">
        <span>+</span>
        <input type="number" data-tabelle-spalte-schritt="${esc(b.id)}" data-spalte-idx="${i}" value="${esc(String(prefill.schritt != null ? prefill.schritt : 1))}" title="Schritt je weitere Zeile">
      </span>`;
    } else if (prefill.mode === 'liste') {
      extra = `<textarea class="pr-tabelle-spalte-extra pr-tabelle-spalte-liste" data-tabelle-spalte-liste="${esc(b.id)}" data-spalte-idx="${i}" placeholder="Ein Wert pro Zeile, von oben nach unten">${esc(prefill.liste || '')}</textarea>`;
    }
    return `<div class="pr-tabelle-spalte-row">
      <input type="text" class="pr-tabelle-spalte-name" data-tabelle-spalte-name="${esc(b.id)}" data-spalte-idx="${i}" value="${esc(col)}" placeholder="Spaltenname">
      <select data-tabelle-spalte-modus="${esc(b.id)}" data-spalte-idx="${i}">
        ${modeOptions.map((o) => `<option value="${o.v}"${prefill.mode === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>
      ${extra}
      ${(b.columns || []).length > 1 ? `<button type="button" class="icon-btn" data-tabelle-remove-spalte="${esc(b.id)}" data-spalte-idx="${i}" title="Spalte entfernen">✕</button>` : ''}
    </div>`;
  }

  // Editor für die (optionale) Folgefrage einer einzelnen Checkbox-Option -
  // dieselben Grundeinstellungen wie bei einem normalen Baustein
  // (Beschriftung/Hilfetext/Pflichtfeld), plus die zum Folgefrage-Typ
  // passenden Zusatzfelder (Auswahl-Optionen bzw. Einheit/Min/Max bei Zahl).
  function checkboxFolgefeldEditorHtml(b, optIdx, f) {
    const parts = [];
    parts.push(`<div class="field">
      <label>Beschriftung der Folgefrage</label>
      <div class="input-wrap"><input type="text" data-checkbox-folge-field="label" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc(f.label)}"></div>
    </div>`);
    parts.push(`<div class="field">
      <label>Hilfetext / Platzhalter (optional)</label>
      <div class="input-wrap"><input type="text" data-checkbox-folge-field="hilfetext" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc(f.hilfetext || '')}"></div>
    </div>`);
    if (f.type === 'auswahl') {
      parts.push(`<div class="field">
        <label>Optionen (mit Komma getrennt)</label>
        <div class="input-wrap"><input type="text" data-checkbox-folge-field="choices" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc((f.choices || []).join(', '))}"></div>
      </div>`);
    }
    if (f.type === 'zahl') {
      parts.push(`<div class="pr-baustein-row-grid">
        <div class="field pr-field-narrow"><label>Einheit</label><div class="input-wrap"><input type="text" data-checkbox-folge-field="einheit" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc(f.einheit || '')}"></div></div>
        <div class="field pr-field-narrow"><label>Min.</label><div class="input-wrap"><input type="number" data-checkbox-folge-field="min" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc(f.min == null ? '' : f.min)}"></div></div>
        <div class="field pr-field-narrow"><label>Max.</label><div class="input-wrap"><input type="number" data-checkbox-folge-field="max" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}" value="${esc(f.max == null ? '' : f.max)}"></div></div>
      </div>`);
    }
    parts.push(`<label class="toggle-item pr-field-narrow" style="padding:0;">
      <span class="toggle-label">Pflichtfeld (nur wenn diese Option angekreuzt ist)</span>
      <div class="switch${f.required ? ' on' : ''}" data-checkbox-folge-toggle="required" data-checkbox-owner="${esc(b.id)}" data-option-idx="${optIdx}"><div class="knob"></div></div>
    </label>`);
    return `<div class="pr-checkbox-folgefeld">${parts.join('')}</div>`;
  }
  // Eine einzelne Checkbox-Option: Name + Auswahl, ob (und mit welchem Typ)
  // beim Ankreuzen eine Folgefrage erscheinen soll + Entfernen-Button (nur
  // wenn mehr als eine Option übrig bleibt).
  function checkboxOptionRowHtml(b, i, opt) {
    const typeOptions = [{ v: '', l: 'Keine Folgefrage' }].concat(FOLGEFELD_TYPES.map((t) => ({ v: t, l: FOLGEFELD_TYPE_LABELS[t] })));
    const curType = opt.folgefeld ? opt.folgefeld.type : '';
    return `<div class="pr-checkbox-option-row">
      <div class="pr-checkbox-option-head">
        <input type="text" class="pr-checkbox-option-name" data-checkbox-option-label="${esc(b.id)}" data-option-idx="${i}" value="${esc(opt.label)}" placeholder="z. B. Ja">
        <select data-checkbox-option-folgetyp="${esc(b.id)}" data-option-idx="${i}">
          ${typeOptions.map((o) => `<option value="${o.v}"${curType === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}
        </select>
        ${(b.optionen || []).length > 1 ? `<button type="button" class="icon-btn" data-checkbox-remove-option="${esc(b.id)}" data-option-idx="${i}" title="Option entfernen">✕</button>` : ''}
      </div>
      ${opt.folgefeld ? checkboxFolgefeldEditorHtml(b, i, opt.folgefeld) : ''}
    </div>`;
  }

  function bausteinRowHtml(b, i, total) {
    const meta = BAUSTEIN_TYPES[b.type] || { label: b.type };
    const isAbschnitt = b.type === 'abschnitt';
    const isMulti = b.type === 'auswahl' && b.mehrfachauswahl;
    const canAuto = SOURCEABLE_TYPES.includes(b.type) && !isMulti;
    const parts = [];

    parts.push(`<div class="field">
      <label>Beschriftung</label>
      <div class="input-wrap"><input type="text" data-baustein-field="label" data-baustein-id="${esc(b.id)}" value="${esc(b.label)}"></div>
    </div>`);

    if (isAbschnitt) {
      parts.push(`<div class="field">
        <label>Beschreibung (optional, kleiner Text unter der Überschrift)</label>
        <div class="input-wrap"><input type="text" data-baustein-field="beschreibung" data-baustein-id="${esc(b.id)}" value="${esc(b.beschreibung || '')}" placeholder="z. B. Bitte je Bauabschnitt ein Foto"></div>
      </div>`);
    } else {
      parts.push(`<div class="field">
        <label>Überschrift (optional, erscheint über dem Feld)</label>
        <div class="input-wrap"><input type="text" data-baustein-field="heading" data-baustein-id="${esc(b.id)}" value="${esc(b.heading || '')}" placeholder="z. B. Bilder BA1-4"></div>
      </div>`);
      parts.push(`<div class="field">
        <label>Hilfetext / Platzhalter (optional)</label>
        <div class="input-wrap"><input type="text" data-baustein-field="hilfetext" data-baustein-id="${esc(b.id)}" value="${esc(b.hilfetext || '')}" placeholder="z. B. Bitte in Metern angeben"></div>
      </div>`);
    }

    if (b.type === 'auswahl') {
      parts.push(`<div class="field">
        <label>Optionen (mit Komma getrennt)</label>
        <div class="input-wrap"><input type="text" data-baustein-field="choices" data-baustein-id="${esc(b.id)}" value="${esc((b.choices || []).join(', '))}"></div>
      </div>`);
      parts.push(`<label class="toggle-item pr-field-narrow" style="padding:0;">
        <span class="toggle-label">Mehrfachauswahl erlauben</span>
        <div class="switch${b.mehrfachauswahl ? ' on' : ''}" data-baustein-field="mehrfachauswahl" data-baustein-id="${esc(b.id)}"><div class="knob"></div></div>
      </label>`);
    }

    if (b.type === 'checkbox') {
      syncCheckboxOptionen(b);
      parts.push(`<div class="field">
        <label>Checkbox-Optionen (z. B. "Ja" und "Nein") - jede einzeln ankreuzbar, optional mit eigener Folgefrage</label>
        <div class="pr-checkbox-optionen-list" data-checkbox-optionen-list="${esc(b.id)}">
          ${b.optionen.map((opt, oi) => checkboxOptionRowHtml(b, oi, opt)).join('')}
        </div>
        ${b.optionen.length < 8 ? `<button type="button" class="link-action" data-checkbox-add-option="${esc(b.id)}">+ Option hinzufügen</button>` : ''}
      </div>`);
    }

    if (b.type === 'tabelle') {
      syncTabelleSpaltenPrefill(b);
      parts.push(`<div class="field">
        <label>Spalten (bis zu 3) - optional pro Spalte vorbefüllen</label>
        <div class="pr-tabelle-spalten-list" data-tabelle-spalten-list="${esc(b.id)}">
          ${b.columns.map((col, ci) => tabelleSpalteRowHtml(b, ci, col)).join('')}
        </div>
        ${b.columns.length < 3 ? `<button type="button" class="link-action" data-tabelle-add-spalte="${esc(b.id)}">+ Spalte hinzufügen</button>` : ''}
      </div>`);
      parts.push(`<div class="field pr-field-narrow">
        <label>Anzahl Zeilen</label>
        <div class="input-wrap"><input type="number" min="1" max="50" data-baustein-field="rows" data-baustein-id="${esc(b.id)}" value="${esc(String(b.rows || 1))}"></div>
        <div style="font-size:11px; color:var(--gray-500);">So viele Zeilen zeigt die Handy-Vorlage von Anfang an (z. B. 12 für Tiefenstufen 1-12m) - weitere Zeilen lassen sich dort trotzdem noch per "+ Zeile" ergänzen.</div>
      </div>`);
    }

    if (b.type === 'zahl') {
      parts.push(`<div class="pr-baustein-row-grid">
        <div class="field pr-field-narrow">
          <label>Einheit</label>
          <div class="input-wrap"><input type="text" data-baustein-field="einheit" data-baustein-id="${esc(b.id)}" value="${esc(b.einheit || '')}" placeholder="z. B. m, kg"></div>
        </div>
        <div class="field pr-field-narrow">
          <label>Min.</label>
          <div class="input-wrap"><input type="number" data-baustein-field="min" data-baustein-id="${esc(b.id)}" value="${esc(b.min == null ? '' : b.min)}"></div>
        </div>
        <div class="field pr-field-narrow">
          <label>Max.</label>
          <div class="input-wrap"><input type="number" data-baustein-field="max" data-baustein-id="${esc(b.id)}" value="${esc(b.max == null ? '' : b.max)}"></div>
        </div>
      </div>`);
    }

    if (b.type === 'text') {
      parts.push(`<label class="toggle-item pr-field-narrow" style="padding:0;">
        <span class="toggle-label">Mehrzeilig (großes Textfeld)</span>
        <div class="switch${b.mehrzeilig ? ' on' : ''}" data-baustein-field="mehrzeilig" data-baustein-id="${esc(b.id)}"><div class="knob"></div></div>
      </label>`);
    }

    if (b.type === 'foto') {
      parts.push(`<label class="toggle-item pr-field-narrow" style="padding:0;">
        <span class="toggle-label">Mehrere Fotos erlauben</span>
        <div class="switch${b.mehrfach ? ' on' : ''}" data-baustein-field="mehrfach" data-baustein-id="${esc(b.id)}"><div class="knob"></div></div>
      </label>`);
      if (b.mehrfach) {
        parts.push(`<div class="field pr-field-narrow">
          <label>Max. Anzahl (optional)</label>
          <div class="input-wrap"><input type="number" min="2" data-baustein-field="maxAnzahl" data-baustein-id="${esc(b.id)}" value="${esc(b.maxAnzahl == null ? '' : b.maxAnzahl)}"></div>
        </div>`);
      }
    }

    const canDefault = (DEFAULT_VALUE_TYPES.includes(b.type) || (b.type === 'auswahl' && !isMulti)) && b.quelle !== 'masttafel';
    if (canDefault) {
      if (b.type === 'auswahl') {
        parts.push(`<div class="field pr-field-narrow">
          <label>Standardwert</label>
          <div class="input-wrap"><select data-baustein-field="standardwert" data-baustein-id="${esc(b.id)}">
            <option value="">Keiner</option>
            ${(b.choices || []).map((c) => `<option value="${esc(c)}"${b.standardwert === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          </select></div>
        </div>`);
      } else if (b.type === 'datum') {
        parts.push(`<div class="field pr-field-narrow">
          <label>Standardwert</label>
          <div class="input-wrap"><select data-baustein-field="standardwert" data-baustein-id="${esc(b.id)}">
            <option value=""${b.standardwert !== 'heute' ? ' selected' : ''}>Leer</option>
            <option value="heute"${b.standardwert === 'heute' ? ' selected' : ''}>Heutiges Datum</option>
          </select></div>
        </div>`);
      } else {
        parts.push(`<div class="field pr-field-narrow">
          <label>Standardwert (optional)</label>
          <div class="input-wrap"><input type="text" data-baustein-field="standardwert" data-baustein-id="${esc(b.id)}" value="${esc(b.standardwert || '')}"></div>
        </div>`);
      }
    }

    if (WIDTH_TYPES.includes(b.type)) {
      parts.push(`<div class="field pr-field-narrow">
        <label>Breite in der Maske</label>
        <div class="input-wrap"><select data-baustein-field="width" data-baustein-id="${esc(b.id)}">
          <option value="full"${b.width !== 'half' ? ' selected' : ''}>Volle Breite</option>
          <option value="half"${b.width === 'half' ? ' selected' : ''}>Halbe Breite (nebeneinander)</option>
        </select></div>
      </div>`);
    }

    if (canAuto) {
      parts.push(`<div class="field pr-field-narrow">
        <label>Quelle</label>
        <div class="input-wrap"><select data-baustein-field="quelle" data-baustein-id="${esc(b.id)}">
          <option value="manuell"${b.quelle !== 'masttafel' ? ' selected' : ''}>Manuelle Eingabe</option>
          <option value="masttafel"${b.quelle === 'masttafel' ? ' selected' : ''}>Aus Masttafel-Spalte</option>
        </select></div>
      </div>`);
      if (b.quelle === 'masttafel') {
        const cols = getKnownMasttafelColumns();
        if (!cols.length) {
          parts.push(`<div class="pr-field-hint">Keine Masttafel-Spalten gefunden - zuerst eine Masttafel importieren.</div>`);
        } else {
          const currentIdx = b.masttafelSpalte ? b.masttafelSpalte.idx : '';
          parts.push(`<div class="field pr-field-narrow">
            <label>Masttafel-Spalte</label>
            <div class="input-wrap"><select data-baustein-field="masttafelSpalte" data-baustein-id="${esc(b.id)}">
              <option value="">Bitte wählen...</option>
              ${cols.map((c) => `<option value="${esc(String(c.idx))}"${String(currentIdx) === String(c.idx) ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select></div>
          </div>`);
        }
      }
    }

    if (!isAbschnitt) {
      parts.push(`<label class="toggle-item pr-field-narrow" style="padding:0;">
        <span class="toggle-label">Pflichtfeld</span>
        <div class="switch${b.required ? ' on' : ''}" data-baustein-field="required" data-baustein-id="${esc(b.id)}"><div class="knob"></div></div>
      </label>`);
    }

    return `<div class="pr-baustein-row" data-baustein-id="${esc(b.id)}">
      <div class="pr-baustein-row-head">
        <span class="col-move-group">
          <button type="button" class="col-move-btn" data-move-baustein="up" data-baustein-idx="${i}" title="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="col-move-btn" data-move-baustein="down" data-baustein-idx="${i}" title="Nach unten" ${i === total - 1 ? 'disabled' : ''}>▼</button>
        </span>
        <span class="pr-baustein-type-badge">${esc(meta.label)}</span>
        <button type="button" class="icon-btn" data-duplicate-baustein="${esc(b.id)}" title="Baustein duplizieren">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
        <button type="button" class="icon-btn" data-delete-baustein="${esc(b.id)}" title="Baustein löschen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
      <div class="pr-baustein-row-body">${parts.join('')}</div>
    </div>`;
  }

  function renderBausteinList(list) {
    const el = document.getElementById('pr-baustein-list');
    const emptyEl = document.getElementById('pr-baustein-empty');
    if (!el) return;
    if (emptyEl) emptyEl.hidden = list.bausteine.length > 0;
    el.innerHTML = list.bausteine.map((b, i) => bausteinRowHtml(b, i, list.bausteine.length)).join('');
    el.querySelectorAll('[data-move-baustein]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.bausteinIdx, 10);
        const j = i + (btn.dataset.moveBaustein === 'up' ? -1 : 1);
        if (j < 0 || j >= list.bausteine.length) return;
        const tmp = list.bausteine[i];
        list.bausteine[i] = list.bausteine[j];
        list.bausteine[j] = tmp;
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-delete-baustein]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Diesen Baustein wirklich löschen?')) return;
        list.bausteine = list.bausteine.filter((b) => b.id !== btn.getAttribute('data-delete-baustein'));
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-duplicate-baustein]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orig = list.bausteine.find((x) => x.id === btn.getAttribute('data-duplicate-baustein'));
        if (!orig) return;
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = makeProtokollId('bs');
        copy.label = `${orig.label} (Kopie)`;
        const idx = list.bausteine.indexOf(orig);
        list.bausteine.splice(idx + 1, 0, copy);
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="label"]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-baustein-id'));
        if (!b) return;
        b.label = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="choices"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-baustein-id'));
        if (!b) return;
        b.choices = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
        saveCurrentProtokoll(list);
        // The Standardwert-Dropdown (Auswahl) is built from choices, so it
        // needs a full re-render, not just the phone preview.
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    // ---------- Tabellen-Baustein: Spalten einzeln (Name + Vorbefüllung) ----------
    el.querySelectorAll('[data-tabelle-spalte-name]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-tabelle-spalte-name'));
        const idx = parseInt(inp.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columns || isNaN(idx)) return;
        b.columns[idx] = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-spalte-modus]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-tabelle-spalte-modus'));
        const idx = parseInt(sel.getAttribute('data-spalte-idx'), 10);
        if (!b || isNaN(idx)) return;
        syncTabelleSpaltenPrefill(b);
        b.columnPrefill[idx] = Object.assign(defaultTabelleSpaltePrefill(), { mode: sel.value });
        saveCurrentProtokoll(list);
        // Je nach Modus ändern sich die angezeigten Zusatzfelder (Text/Start+
        // Schritt/Liste) - deshalb ein voller Re-Render, nicht nur die
        // Handy-Vorschau.
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-spalte-text]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-tabelle-spalte-text'));
        const idx = parseInt(inp.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columnPrefill || !b.columnPrefill[idx]) return;
        b.columnPrefill[idx].text = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-spalte-start]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-tabelle-spalte-start'));
        const idx = parseInt(inp.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columnPrefill || !b.columnPrefill[idx]) return;
        b.columnPrefill[idx].start = inp.value === '' ? '' : Number(inp.value);
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-spalte-schritt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-tabelle-spalte-schritt'));
        const idx = parseInt(inp.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columnPrefill || !b.columnPrefill[idx]) return;
        b.columnPrefill[idx].schritt = inp.value === '' ? '' : Number(inp.value);
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-spalte-liste]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-tabelle-spalte-liste'));
        const idx = parseInt(inp.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columnPrefill || !b.columnPrefill[idx]) return;
        b.columnPrefill[idx].liste = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-add-spalte]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === btn.getAttribute('data-tabelle-add-spalte'));
        if (!b || !b.columns || b.columns.length >= 3) return;
        b.columns.push(`Spalte ${b.columns.length + 1}`);
        syncTabelleSpaltenPrefill(b);
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-tabelle-remove-spalte]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === btn.getAttribute('data-tabelle-remove-spalte'));
        const idx = parseInt(btn.getAttribute('data-spalte-idx'), 10);
        if (!b || !b.columns || b.columns.length <= 1 || isNaN(idx)) return;
        b.columns.splice(idx, 1);
        if (Array.isArray(b.columnPrefill)) b.columnPrefill.splice(idx, 1);
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    // ---------- Checkbox-Baustein: Optionen + Folgefragen ----------
    el.querySelectorAll('[data-checkbox-option-label]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-checkbox-option-label'));
        const idx = parseInt(inp.getAttribute('data-option-idx'), 10);
        if (!b || !b.optionen || isNaN(idx)) return;
        b.optionen[idx].label = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-checkbox-option-folgetyp]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-checkbox-option-folgetyp'));
        const idx = parseInt(sel.getAttribute('data-option-idx'), 10);
        if (!b || !b.optionen || isNaN(idx)) return;
        b.optionen[idx].folgefeld = sel.value ? emptyFolgefeld(sel.value) : null;
        saveCurrentProtokoll(list);
        // Je nach gewähltem Folgefrage-Typ ändern sich die angezeigten
        // Zusatzfelder - deshalb ein voller Re-Render, nicht nur die Vorschau.
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-checkbox-add-option]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === btn.getAttribute('data-checkbox-add-option'));
        if (!b || !b.optionen || b.optionen.length >= 8) return;
        b.optionen.push(defaultCheckboxOption(`Option ${b.optionen.length + 1}`));
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-checkbox-remove-option]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === btn.getAttribute('data-checkbox-remove-option'));
        const idx = parseInt(btn.getAttribute('data-option-idx'), 10);
        if (!b || !b.optionen || b.optionen.length <= 1 || isNaN(idx)) return;
        b.optionen.splice(idx, 1);
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-checkbox-folge-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-checkbox-owner'));
        const idx = parseInt(inp.getAttribute('data-option-idx'), 10);
        const prop = inp.getAttribute('data-checkbox-folge-field');
        if (!b || !b.optionen || !b.optionen[idx] || !b.optionen[idx].folgefeld || isNaN(idx)) return;
        const f = b.optionen[idx].folgefeld;
        if (prop === 'choices') f.choices = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
        else f[prop] = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-checkbox-folge-toggle]').forEach((sw) => {
      sw.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === sw.getAttribute('data-checkbox-owner'));
        const idx = parseInt(sw.getAttribute('data-option-idx'), 10);
        const prop = sw.getAttribute('data-checkbox-folge-toggle');
        if (!b || !b.optionen || !b.optionen[idx] || !b.optionen[idx].folgefeld || isNaN(idx)) return;
        const f = b.optionen[idx].folgefeld;
        f[prop] = !f[prop];
        sw.classList.toggle('on', f[prop]);
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="required"]').forEach((sw) => {
      sw.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === sw.getAttribute('data-baustein-id'));
        if (!b) return;
        b.required = !b.required;
        sw.classList.toggle('on', b.required);
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="heading"]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-baustein-id'));
        if (!b) return;
        b.heading = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="quelle"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-baustein-id'));
        if (!b) return;
        b.quelle = sel.value;
        if (b.quelle !== 'masttafel') b.masttafelSpalte = null;
        saveCurrentProtokoll(list);
        // Structural change (shows/hides the Masttafel-Spalte sub-select) -
        // needs a full re-render, not just the preview.
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="masttafelSpalte"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-baustein-id'));
        if (!b) return;
        const cols = getKnownMasttafelColumns();
        const chosen = cols.find((c) => String(c.idx) === sel.value);
        b.masttafelSpalte = chosen ? { idx: chosen.idx, label: chosen.label } : null;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });

    // Plain text fields that only affect the phone preview, no structural
    // show/hide - a live 'input' listener is fine here.
    ['hilfetext', 'beschreibung', 'einheit', 'min', 'max', 'rows', 'maxAnzahl'].forEach((fieldName) => {
      el.querySelectorAll(`input[data-baustein-field="${fieldName}"]`).forEach((inp) => {
        inp.addEventListener('input', () => {
          const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-baustein-id'));
          if (!b) return;
          b[fieldName] = inp.value;
          saveCurrentProtokoll(list);
          renderPhonePreview(list);
        });
      });
    });
    // Standardwert is an <input> for Text/Zahl and a <select> for
    // Auswahl/Datum - wire both variants to the same property.
    el.querySelectorAll('input[data-baustein-field="standardwert"]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const b = list.bausteine.find((x) => x.id === inp.getAttribute('data-baustein-id'));
        if (!b) return;
        b.standardwert = inp.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('select[data-baustein-field="standardwert"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-baustein-id'));
        if (!b) return;
        b.standardwert = sel.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('select[data-baustein-field="width"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const b = list.bausteine.find((x) => x.id === sel.getAttribute('data-baustein-id'));
        if (!b) return;
        b.width = sel.value;
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
    // Toggles that change which sub-fields are visible need a full
    // re-render; Mehrzeilig only changes the phone preview.
    el.querySelectorAll('[data-baustein-field="mehrfachauswahl"]').forEach((sw) => {
      sw.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === sw.getAttribute('data-baustein-id'));
        if (!b) return;
        b.mehrfachauswahl = !b.mehrfachauswahl;
        if (b.mehrfachauswahl) { b.quelle = 'manuell'; b.masttafelSpalte = null; b.standardwert = ''; }
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="mehrfach"]').forEach((sw) => {
      sw.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === sw.getAttribute('data-baustein-id'));
        if (!b) return;
        b.mehrfach = !b.mehrfach;
        saveCurrentProtokoll(list);
        renderBausteinList(list);
        renderPhonePreview(list);
      });
    });
    el.querySelectorAll('[data-baustein-field="mehrzeilig"]').forEach((sw) => {
      sw.addEventListener('click', () => {
        const b = list.bausteine.find((x) => x.id === sw.getAttribute('data-baustein-id'));
        if (!b) return;
        b.mehrzeilig = !b.mehrzeilig;
        sw.classList.toggle('on', b.mehrzeilig);
        saveCurrentProtokoll(list);
        renderPhonePreview(list);
      });
    });
  }

  // Renders the live phone-frame preview from the current Bausteine - a
  // rough mobile approximation (not a pixel-perfect app mockup), enough to
  // judge field order, labels and required-ness before this Protokoll is
  // actually used to collect data on a device.
  function phoneFieldHtml(b) {
    const reqMark = b.required ? ' <span class="pr-req">*</span>' : '';
    const label = b.label || (BAUSTEIN_TYPES[b.type] ? BAUSTEIN_TYPES[b.type].label : '');
    const headingHtml = (b.type !== 'abschnitt' && b.heading) ? `<div class="pr-phone-section">${esc(b.heading)}</div>` : '';
    const widthClass = (WIDTH_TYPES.includes(b.type) && b.width === 'half') ? ' pr-phone-field-half' : '';
    if (b.type === 'abschnitt') {
      return `<div class="pr-phone-section-block">
        <div class="pr-phone-section">${esc(label)}</div>
        ${b.beschreibung ? `<div class="pr-phone-hint">${esc(b.beschreibung)}</div>` : ''}
      </div>`;
    }
    const hintHtml = b.hilfetext ? `<div class="pr-phone-hint">${esc(b.hilfetext)}</div>` : '';
    const isMulti = b.type === 'auswahl' && b.mehrfachauswahl;
    const isAuto = SOURCEABLE_TYPES.includes(b.type) && b.quelle === 'masttafel' && !isMulti;
    let control = '';
    if (isAuto) {
      const colLabel = b.masttafelSpalte ? b.masttafelSpalte.label : 'Masttafel-Spalte wählen';
      if (b.type === 'auswahl') {
        control = `<div class="pr-phone-select pr-phone-input-auto"><span>${LOCK_SVG_SMALL}${esc(colLabel)}</span><span class="pr-source-auto-badge">Auto</span></div>`;
      } else if (b.type === 'checkbox') {
        control = `<div class="pr-phone-checkbox pr-phone-input-auto"><span class="pr-phone-box"></span><span>${LOCK_SVG_SMALL}${esc(colLabel)}</span><span class="pr-source-auto-badge">Auto</span></div>`;
      } else {
        control = `<div class="pr-phone-input pr-phone-input-auto"><span>${LOCK_SVG_SMALL}${esc(colLabel)}</span><span class="pr-source-auto-badge">Auto</span></div>`;
      }
      return `<div class="pr-phone-field${widthClass}">${headingHtml}<span class="pr-phone-label">${esc(label)}${reqMark}</span>${control}${hintHtml}</div>`;
    }
    if (b.type === 'text') {
      const placeholder = b.standardwert || b.hilfetext || 'Text eingeben…';
      control = b.mehrzeilig
        ? `<div class="pr-phone-input pr-phone-input-multiline">${esc(placeholder)}</div>`
        : `<div class="pr-phone-input">${esc(placeholder)}</div>`;
    } else if (b.type === 'zahl') {
      const val = b.standardwert || '0';
      const unit = b.einheit ? ` ${esc(b.einheit)}` : '';
      const range = (b.min !== '' && b.min != null) || (b.max !== '' && b.max != null)
        ? ` <span class="pr-phone-range">(${b.min !== '' && b.min != null ? esc(String(b.min)) : '…'}–${b.max !== '' && b.max != null ? esc(String(b.max)) : '…'})</span>`
        : '';
      control = `<div class="pr-phone-input">${esc(val)}${unit}${range}</div>`;
    } else if (b.type === 'foto') {
      const maxTxt = b.mehrfach && b.maxAnzahl ? ` (max. ${esc(String(b.maxAnzahl))})` : '';
      control = `<div class="pr-phone-photo">${b.mehrfach ? 'Mehrere Fotos aufnehmen' : 'Foto aufnehmen'}${maxTxt}</div>`;
    } else if (b.type === 'checkbox') {
      syncCheckboxOptionen(b);
      control = `<div class="pr-phone-checkbox-list">${b.optionen.map((opt) => `
        <div class="pr-phone-checkbox"><span class="pr-phone-box"></span><span>${esc(opt.label)}</span></div>
        ${opt.folgefeld ? `<div class="pr-phone-checkbox-folge">↳ Folgefrage bei Ankreuzen: <strong>${esc(opt.folgefeld.label)}</strong> (${esc(FOLGEFELD_TYPE_LABELS[opt.folgefeld.type] || opt.folgefeld.type)})</div>` : ''}
      `).join('')}</div>`;
    } else if (b.type === 'auswahl') {
      if (isMulti) {
        const choices = (b.choices && b.choices.length ? b.choices : ['Option 1', 'Option 2']);
        control = `<div class="pr-phone-checklist">${choices.map((c) => `<div class="pr-phone-checkbox"><span class="pr-phone-box"></span><span>${esc(c)}</span></div>`).join('')}</div>`;
      } else {
        const val = b.standardwert || (b.choices && b.choices[0]) || 'Bitte wählen';
        control = `<div class="pr-phone-select"><span>${esc(val)}</span><span>⌄</span></div>`;
      }
    } else if (b.type === 'datum') {
      control = `<div class="pr-phone-input">${b.standardwert === 'heute' ? 'Heutiges Datum' : 'TT.MM.JJJJ'}</div>`;
    } else if (b.type === 'unterschrift') {
      control = `<div class="pr-phone-sign">Unterschriftsfeld</div>`;
    } else if (b.type === 'tabelle') {
      const cols = (b.columns && b.columns.length ? b.columns : ['Spalte 1', 'Spalte 2']).slice(0, 3);
      const rowCount = Math.max(1, Math.min(50, parseInt(b.rows, 10) || 1));
      // Zeigt bereits hier im Editor, wie die Vorbefüllung auf dem Handy
      // aussehen wird (z. B. "1, 2, 3, ..." bei "Fortlaufend nummeriert") -
      // Spalten ohne Vorbefüllung bleiben wie bisher "…".
      const rowsHtml = Array.from({ length: rowCount }).map((_, ri) => `<tr>${cols.map((c, ci) => {
        const prefill = (b.columnPrefill && b.columnPrefill[ci]) || defaultTabelleSpaltePrefill();
        const val = tabellePrefillValue(prefill, ri);
        return `<td>${val ? esc(val) : '…'}</td>`;
      }).join('')}</tr>`).join('');
      control = `<table class="pr-phone-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    }
    return `<div class="pr-phone-field${widthClass}">${headingHtml}<span class="pr-phone-label">${esc(label)}${reqMark}</span>${control}${hintHtml}</div>`;
  }

  // The Mastnummer is not a Baustein at all - since ein Protokoll immer über
  // eine Tätigkeitsliste einem Mast zugeordnet wird, steht sie fest und
  // automatisch ganz oben in jeder Maske, ohne dass dafür ein eigener
  // Baustein angelegt werden muss.
  function pinnedMastnummerFieldHtml() {
    return `<div class="pr-phone-field pr-phone-field-pinned">
      <span class="pr-phone-label">Mastnummer</span>
      <div class="pr-phone-input pr-phone-input-auto"><span>${LOCK_SVG_SMALL}Wird automatisch übernommen</span><span class="pr-source-auto-badge">Immer</span></div>
    </div>`;
  }

  // Groups consecutive halbe-Breite-Bausteine in pairs so they render
  // side by side, everything else stays full width in its own row.
  function renderBausteineRows(bausteine) {
    let html = '';
    let i = 0;
    while (i < bausteine.length) {
      const b = bausteine[i];
      const bIsHalf = WIDTH_TYPES.includes(b.type) && b.width === 'half';
      const next = bausteine[i + 1];
      const nextIsHalf = next && WIDTH_TYPES.includes(next.type) && next.width === 'half';
      if (bIsHalf && nextIsHalf) {
        html += `<div class="pr-phone-row">${phoneFieldHtml(b)}${phoneFieldHtml(next)}</div>`;
        i += 2;
      } else {
        html += phoneFieldHtml(b);
        i += 1;
      }
    }
    return html;
  }

  function renderPhonePreview(list) {
    const titleEl = document.getElementById('pr-phone-title');
    const bodyEl = document.getElementById('pr-phone-body');
    if (!bodyEl) return;
    if (titleEl) titleEl.textContent = list ? list.name : 'Protokoll';
    if (!list) {
      bodyEl.innerHTML = '';
      return;
    }
    if (list.bausteine.length === 0) {
      bodyEl.innerHTML = pinnedMastnummerFieldHtml() + '<div class="pr-phone-empty">Noch keine Bausteine - links hinzufügen oder oben per Beschreibung generieren, um die Vorschau zu sehen.</div>';
      return;
    }
    bodyEl.innerHTML = pinnedMastnummerFieldHtml() + renderBausteineRows(list.bausteine);
  }

  // ----------------------------------------------------------------------
  // "Maske per Beschreibung erstellen" - a regelbasierter (rule-based)
  // Text-Parser, KEIN echter KI-/Sprachmodell-Aufruf (diese App läuft
  // offline als statische HTML-Datei ohne Backend). Er zerlegt den
  // eingegebenen Text in Segmente (Zeilen bzw. durch Komma/Semikolon
  // getrennte Angaben, Klammerinhalte werden dabei nicht zerteilt) und
  // erkennt pro Segment Feldtyp, Pflicht-Kennzeichnung, Auswahl-Optionen,
  // eine optionale Überschrift sowie eine automatische Masttafel-Quelle.
  // ----------------------------------------------------------------------
  function splitDescriptionSegments(text) {
    const segments = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      let depth = 0;
      let cur = '';
      const parts = [];
      for (const ch of line) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if ((ch === ',' || ch === ';') && depth === 0) {
          parts.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) parts.push(cur);
      parts.forEach((p) => {
        const t = p.trim();
        if (t) segments.push(t);
      });
    }
    return segments;
  }

  function capitalizeFirst(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const AI_TYPE_KEYWORDS = [
    { re: /\b(auswahl|dropdown)\b/i, type: 'auswahl' },
    { re: /\bfotos?\b|\bbild(er)?\b/i, type: 'foto' },
    { re: /\bcheckbox\b|\bja\s*\/\s*nein\b|\bja\s+oder\s+nein\b/i, type: 'checkbox' },
    { re: /\bdatum\b/i, type: 'datum' },
    { re: /\bunterschrift\b|\bsignatur\b/i, type: 'unterschrift' },
    { re: /\bzahl(en)?\b|\bnummer\b|\banzahl\b|\bmenge\b/i, type: 'zahl' },
    { re: /\btabelle\b/i, type: 'tabelle' },
    { re: /\btext\b/i, type: 'text' },
  ];

  // Parses one text segment into a Baustein (or a pending-heading marker).
  function parseFieldSegment(rawSeg) {
    let seg = rawSeg.trim();

    // A segment ending in a colon (e.g. "Bilder BA1-4:") is treated as a
    // standalone Überschrift that attaches to the next generated field,
    // not as a field of its own - this is the documented convention for
    // grouping fields under a heading in the description textarea.
    if (/:$/.test(seg)) {
      return { heading: seg.replace(/:$/, '').trim() };
    }

    let required = false;
    let quelleAuto = false;
    let choices = null;
    let explicitType = null;

    const parenMatch = seg.match(/\(([^)]*)\)/);
    if (parenMatch) {
      const parenContent = parenMatch[1].trim();
      seg = (seg.slice(0, parenMatch.index) + seg.slice(parenMatch.index + parenMatch[0].length)).trim();
      if (/^(pflicht(feld)?|erforderlich)$/i.test(parenContent)) {
        required = true;
      } else if (parenContent.indexOf(',') !== -1) {
        choices = parenContent.split(',').map((s) => s.trim()).filter(Boolean);
        explicitType = 'auswahl';
      } else if (parenContent) {
        // Keep unrecognised parenthetical content as part of the label
        // instead of silently dropping information.
        seg = `${seg} (${parenContent})`.trim();
      }
    }

    if (/\b(pflicht(feld)?|erforderlich|zwingend)\b/i.test(seg)) {
      required = true;
      seg = seg.replace(/\b(als\s+)?pflicht(feld)?\b/gi, '')
        .replace(/\berforderlich\b/gi, '')
        .replace(/\bzwingend\b/gi, '')
        .trim();
    }

    if (/\bautomatisch\b/i.test(seg) || /\baus\s+(der\s+)?masttafel(-?spalte)?\b/i.test(seg)) {
      quelleAuto = true;
      seg = seg.replace(/\bautomatisch\b/gi, '')
        .replace(/\baus\s+(der\s+)?masttafel(-?spalte)?\b/gi, '')
        .trim();
    }

    let type = explicitType;
    // Always strip a recognised type keyword out of the label text (even
    // when the type was already fixed by a choices-list in parentheses,
    // e.g. "Status als Auswahl (Erledigt, ...)" should not leave "als
    // Auswahl" stuck in the label).
    for (const tk of AI_TYPE_KEYWORDS) {
      if (tk.re.test(seg)) {
        if (!type) type = tk.type;
        seg = seg.replace(tk.re, '').trim();
        break;
      }
    }
    if (!type) type = 'text';

    seg = seg.replace(/\bals\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-:\s]+|[-:\s]+$/g, '')
      .trim();

    const meta = BAUSTEIN_TYPES[type] || { defaultLabel: type };
    const label = capitalizeFirst(seg) || meta.defaultLabel;

    const b = emptyBaustein(type);
    b.label = label;
    b.required = required;
    if (choices) b.choices = choices;

    if (quelleAuto && SOURCEABLE_TYPES.includes(type)) {
      b.quelle = 'masttafel';
      const cols = getKnownMasttafelColumns();
      const labelLower = label.toLowerCase();
      const match = cols.find((c) => {
        const cl = c.label.toLowerCase();
        return cl === labelLower || cl.includes(labelLower) || labelLower.includes(cl);
      });
      b.masttafelSpalte = match ? { idx: match.idx, label: match.label } : null;
    }

    return { baustein: b };
  }

  function generateBausteineFromDescription(text) {
    const segments = splitDescriptionSegments(text);
    const result = [];
    let pendingHeading = '';
    segments.forEach((seg) => {
      const parsed = parseFieldSegment(seg);
      if (parsed.heading !== undefined) {
        pendingHeading = parsed.heading;
        return;
      }
      if (pendingHeading) {
        parsed.baustein.heading = pendingHeading;
        pendingHeading = '';
      }
      result.push(parsed.baustein);
    });
    return result;
  }

  function renderEditor() {
    const titleEl = document.getElementById('pr-title');
    const crumbEl = document.getElementById('pr-crumb-name');
    const crumbParentEl = document.getElementById('pr-crumb-parent');
    const backLinkEl = document.getElementById('pr-back-link');
    const badgeEl = document.getElementById('pr-scope-badge');
    const hintEl = document.getElementById('pr-scope-hint');
    if (!titleEl) return;

    if (crumbParentEl && backLinkEl) {
      if (currentScope === 'template') {
        crumbParentEl.textContent = 'Projekte · Vorlagen';
        crumbParentEl.href = '#projekte';
        backLinkEl.href = '#projekte';
      } else {
        crumbParentEl.textContent = 'Projekteinstellungen';
        crumbParentEl.href = '#projekteinstellungen';
        backLinkEl.href = '#projekteinstellungen';
      }
    }

    const list = findCurrentProtokoll();
    if (!list) {
      titleEl.textContent = 'Protokoll';
      if (crumbEl) crumbEl.textContent = 'Protokoll';
      if (badgeEl) badgeEl.hidden = true;
      if (hintEl) hintEl.textContent = 'Kein Protokoll ausgewählt - bitte über Projekte · Vorlagen oder die Projekteinstellungen eines Projekts ein Protokoll zum Bearbeiten öffnen.';
      renderMastPin(null);
      renderBausteinList({ bausteine: [] });
      renderPhonePreview(null);
      renderPdfPanel(null);
      return;
    }

    titleEl.textContent = list.name;
    if (crumbEl) crumbEl.textContent = list.name;
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.textContent = currentScope === 'project' ? ('Projekt: ' + currentProjectLabel()) : 'Vorlage';
    }
    if (hintEl) {
      hintEl.textContent = currentScope === 'project'
        ? (list.sourceTemplateName ? `Übernommen aus der Vorlage "${list.sourceTemplateName}" - Änderungen hier wirken sich nur auf dieses Projekt aus.` : 'Nur diesem Projekt zugeordnet.')
        : 'Projektübergreifende Vorlage - Änderungen wirken sich nicht auf bereits in Projekte übernommene Kopien aus.';
    }

    renderMastPin(list);
    renderBausteinList(list);
    renderPhonePreview(list);
    renderPdfPanel(list);
  }

  // ======================================================================
  // PDF-Vorlage: offizielles Dokument hochladen, Bausteine + feste
  // Systemfelder darauf platzieren, Vorlagen-Stil (Schriftart/-größe/Farbe)
  // einheitlich einstellen. Die eigentliche Erzeugung des ausgefüllten PDFs
  // (generateProtokollPdf, siehe weiter oben, außerhalb jeder IIFE) passiert
  // erst im Bautagebuch, sobald ein Datensatz für einen Mast vorliegt -
  // hier wird nur die Vorlage selbst konfiguriert.
  // ======================================================================
  function fieldLabelForPdfFeld(list, f) {
    if (f.kind === 'system') {
      const sf = PDF_SYSTEM_FELDER.find((s) => s.key === f.systemKey);
      return sf ? sf.label : f.systemKey;
    }
    const b = (list.bausteine || []).find((x) => x.id === f.bausteinId);
    if (!b) return '(gelöschter Baustein)';
    if (f.kind === 'tabelle') {
      const colLabel = (b.columns && b.columns[f.spalte]) || `Spalte ${(f.spalte || 0) + 1}`;
      return `${b.label}: ${colLabel}`;
    }
    return b.label;
  }
  // Wie fieldLabelForPdfFeld, aber nur für die Felder-Liste (nicht den
  // Marker auf dem Canvas): dort zusätzlich die Zeilennummer anhängen, da bei
  // einer Tabellen-Spalte jetzt mehrere gleich beschriftete Zeilen-Felder
  // nebeneinander in der Liste stehen und sonst nicht zu unterscheiden wären.
  function fieldListLabelForPdfFeld(list, f) {
    const base = fieldLabelForPdfFeld(list, f);
    return f.kind === 'tabelle' ? `${base} (Zeile ${(f.row || 0) + 1})` : base;
  }

  // Für einen Tabellen-Baustein wird nicht ein einzelnes Feld angeboten,
  // sondern eine eigene Option pro Spalte (jede Spalte braucht ihre eigene
  // X-Position und wird einzeln platziert; Y/Zeilenabstand gelten dann
  // automatisch als Vorschlag für alle Zeilen dieser Spalte darunter, siehe
  // renderPdfTabellenEinstellungenHtml). Reine Datenfunktion (kein DOM) -
  // wird vom Tippen-Autovervollständigungs-Popup (showPdfPlaceAutocomplete)
  // als Kandidatenliste genutzt; ersetzt das frühere Dropdown
  // (renderPdfFieldSelect), da Feld-Auswahl jetzt per Eintippen statt per
  // <select> läuft.
  function getPdfPlaceableOptions(list) {
    if (!list || !list.pdfVorlage) return [];
    const placed = new Set((list.pdfVorlage.felder || []).map((f) => {
      if (f.kind === 'tabelle') return 'tabelle::' + f.bausteinId + '::' + f.spalte;
      return f.kind + '::' + (f.kind === 'system' ? f.systemKey : f.bausteinId);
    }));
    const options = [];
    PDF_SYSTEM_FELDER.forEach((s) => {
      const val = 'system::' + s.key;
      if (!placed.has(val)) options.push({ val, label: s.label });
    });
    (list.bausteine || []).forEach((b) => {
      if (b.type === 'tabelle') {
        (b.columns || []).forEach((colLabel, idx) => {
          const val = 'tabelle::' + b.id + '::' + idx;
          if (!placed.has(val)) options.push({ val, label: `${b.label}: ${colLabel} (Tabelle)` });
        });
        return;
      }
      if (!PLACEABLE_BAUSTEIN_TYPES.includes(b.type)) return;
      const val = 'baustein::' + b.id;
      if (!placed.has(val)) {
        const typeLabel = BAUSTEIN_TYPES[b.type] ? BAUSTEIN_TYPES[b.type].label : b.type;
        options.push({ val, label: `${b.label} (${typeLabel})` });
      }
    });
    return options;
  }

  // Legt aus einer Options-"val" (Format siehe getPdfPlaceableOptions:
  // "system::key" / "baustein::id" / "tabelle::bausteinId::spalte") das neue
  // Feld an der geklickten Position an - bei einer Tabellenspalte gleich
  // alle Zeilen-Felder (siehe Kommentar bei der bisherigen Klick-Handler-
  // Logik). Ausgelagert aus dem Klick-Handler, damit sowohl der direkte
  // Klick-Handler als auch das neue Tippen-Popup dieselbe Anlege-Logik
  // benutzen.
  function createPdfFeldFromOption(list, val, xPct, yPct) {
    const parts = val.split('::');
    const kind = parts[0];
    if (kind === 'tabelle') {
      // Eine Tabellen-Spalte wird beim ersten Platzieren gleich mit ALLEN
      // Zeilen (b.rows der Tabelle, wie in der Handy-Vorlage eingestellt)
      // angelegt - jede Zeile ist danach aber ein komplett eigenständiges,
      // frei verschiebbares Feld (kein gemeinsamer Zeilenabstand mehr, der
      // sie zusammenhält). Der aktuell hinterlegte Zeilenabstand dient nur
      // als Vorschlag für die anfängliche Anordnung untereinander.
      const bausteinId = parts[1];
      const spalte = Number(parts[2]) || 0;
      const b = (list.bausteine || []).find((x) => x.id === bausteinId);
      const rowCount = Math.max(1, Math.min(50, parseInt(b && b.rows, 10) || 1));
      if (!list.pdfVorlage.tabellenEinstellungen) list.pdfVorlage.tabellenEinstellungen = {};
      const einst = list.pdfVorlage.tabellenEinstellungen[bausteinId] || defaultTabellenEinstellung();
      list.pdfVorlage.tabellenEinstellungen[bausteinId] = einst;
      const rowStep = Number(einst.zeilenhoeheYPct) || defaultTabellenEinstellung().zeilenhoeheYPct;
      const neueFelder = [];
      for (let i = 0; i < rowCount; i++) {
        const rowYPct = yPct + i * rowStep;
        if (rowYPct > 1) break;
        neueFelder.push({ id: makeProtokollId('pf'), kind: 'tabelle', bausteinId, spalte, row: i, page: pdfCurrentPage, xPct, yPct: rowYPct });
      }
      list.pdfVorlage.felder.push(...neueFelder);
      pdfSelectedFeldId = neueFelder.length ? neueFelder[0].id : null;
      return;
    }
    const feld = { id: makeProtokollId('pf'), kind, page: pdfCurrentPage, xPct, yPct };
    if (kind === 'system') {
      feld.systemKey = parts[1];
    } else {
      feld.bausteinId = parts[1];
    }
    list.pdfVorlage.felder.push(feld);
    pdfSelectedFeldId = feld.id;
  }

  // ---------- Tippen statt Dropdown: Autovervollständigungs-Popup ----------
  // Ersetzt den alten Ablauf "Feld im Dropdown wählen, dann auf die Vorlage
  // klicken" durch "auf die Vorlage klicken, dann den Feldnamen direkt an
  // dieser Stelle eintippen" (z. B. "Mastnummer") - passende Vorschläge
  // erscheinen sofort darunter. Das PDF selbst bleibt dabei unverändert
  // exakt das hochgeladene Original als Hintergrund; es ändert sich nur die
  // Bedienung der Feld-AUSWAHL, nicht das Platzierungs-/Rendering-Modell.
  let pdfPlacePopoverOutsideHandler = null;
  function closePdfPlaceAutocomplete() {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (wrap) {
      const pop = wrap.querySelector('.pr-pdf-place-popover');
      if (pop) pop.remove();
    }
    if (pdfPlacePopoverOutsideHandler) {
      document.removeEventListener('mousedown', pdfPlacePopoverOutsideHandler, true);
      pdfPlacePopoverOutsideHandler = null;
    }
  }
  function showPdfPlaceAutocomplete(list, xPct, yPct) {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (!wrap) return;
    closePdfPlaceAutocomplete();
    const options = getPdfPlaceableOptions(list);
    const pop = document.createElement('div');
    pop.className = 'pr-pdf-place-popover';
    pop.style.left = (xPct * 100) + '%';
    pop.style.top = (yPct * 100) + '%';
    if (!options.length) {
      pop.innerHTML = '<div class="pr-pdf-place-empty">Alle verfügbaren Felder sind bereits platziert</div>';
      wrap.appendChild(pop);
      pop.addEventListener('mousedown', (e) => e.stopPropagation());
      pop.addEventListener('click', (e) => e.stopPropagation());
      setTimeout(() => {
        pdfPlacePopoverOutsideHandler = (e) => { if (!pop.contains(e.target)) closePdfPlaceAutocomplete(); };
        document.addEventListener('mousedown', pdfPlacePopoverOutsideHandler, true);
      }, 0);
      return;
    }
    pop.innerHTML = `<input type="text" placeholder="Feldname eintippen…" autocomplete="off" spellcheck="false">
      <div class="pr-pdf-place-suggestions"></div>`;
    wrap.appendChild(pop);
    // Verhindert, dass ein Klick INS Popup (z. B. auf einen Vorschlag) vom
    // Canvas-Klick-Handler als weiterer, neuer Platzierungsklick missverstanden wird.
    pop.addEventListener('mousedown', (e) => e.stopPropagation());
    pop.addEventListener('click', (e) => e.stopPropagation());
    const input = pop.querySelector('input');
    const listEl = pop.querySelector('.pr-pdf-place-suggestions');
    let activeIdx = 0;
    let filtered = options;
    function renderSuggestions() {
      listEl.innerHTML = filtered.length
        ? filtered.map((o, i) => `<div class="pr-pdf-place-suggestion${i === activeIdx ? ' active' : ''}" data-idx="${i}">${esc(o.label)}</div>`).join('')
        : '<div class="pr-pdf-place-empty">Kein passendes Feld gefunden</div>';
      listEl.querySelectorAll('[data-idx]').forEach((row) => {
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          placeSelected(Number(row.getAttribute('data-idx')));
        });
      });
    }
    function placeSelected(idx) {
      const opt = filtered[idx];
      if (!opt) { closePdfPlaceAutocomplete(); return; }
      createPdfFeldFromOption(list, opt.val, xPct, yPct);
      saveCurrentProtokoll(list);
      closePdfPlaceAutocomplete();
      renderPdfPanel(list);
    }
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      filtered = q ? options.filter((o) => o.label.toLowerCase().indexOf(q) !== -1) : options;
      activeIdx = 0;
      renderSuggestions();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length) activeIdx = Math.min(filtered.length - 1, activeIdx + 1);
        renderSuggestions();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length) activeIdx = Math.max(0, activeIdx - 1);
        renderSuggestions();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered.length) placeSelected(activeIdx);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePdfPlaceAutocomplete();
      }
    });
    renderSuggestions();
    input.focus();
    // Klick außerhalb des Popups bricht die Platzierung ab, ohne ein Feld
    // anzulegen - erst im nächsten Tick registriert, damit der Klick, der
    // das Popup gerade geöffnet hat, es nicht sofort wieder schließt.
    setTimeout(() => {
      pdfPlacePopoverOutsideHandler = (e) => { if (!pop.contains(e.target)) closePdfPlaceAutocomplete(); };
      document.addEventListener('mousedown', pdfPlacePopoverOutsideHandler, true);
    }, 0);
  }

  // Wie weit dürfen X bzw. Y beim Ziehen voneinander abweichen, um noch als
  // "auf einer Linie" zu gelten und einzurasten - vergleicht das gezogene
  // Feld gegen alle anderen bereits platzierten Felder auf derselben Seite.
  function snapPdfPosition(list, feldId, xPct, yPct) {
    let guideX = null;
    let guideY = null;
    if (list && list.pdfVorlage) {
      (list.pdfVorlage.felder || []).filter((o) => o.page === pdfCurrentPage && o.id !== feldId).forEach((o) => {
        if (guideX === null && Math.abs(o.xPct - xPct) < PDF_SNAP_THRESHOLD) guideX = o.xPct;
        if (guideY === null && Math.abs(o.yPct - yPct) < PDF_SNAP_THRESHOLD) guideY = o.yPct;
      });
    }
    return {
      xPct: guideX !== null ? guideX : xPct,
      yPct: guideY !== null ? guideY : yPct,
      guideX,
      guideY,
    };
  }
  function clearPdfGuides() {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.pr-pdf-guide').forEach((g) => g.remove());
  }
  function showPdfGuides(guideX, guideY) {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (!wrap) return;
    clearPdfGuides();
    if (guideX !== null && guideX !== undefined) {
      const v = document.createElement('div');
      v.className = 'pr-pdf-guide pr-pdf-guide-v';
      v.style.left = (guideX * 100) + '%';
      wrap.appendChild(v);
    }
    if (guideY !== null && guideY !== undefined) {
      const h = document.createElement('div');
      h.className = 'pr-pdf-guide pr-pdf-guide-h';
      h.style.top = (guideY * 100) + '%';
      wrap.appendChild(h);
    }
  }

  // Marker per Ziehen verschieben (mit Einrasten an anderen Feldern) - ein
  // Klick OHNE nennenswerte Bewegung wählt den Marker stattdessen nur aus
  // (für die Pfeiltasten-Feinjustierung); das Entfernen läuft bewusst über
  // den eigenen "Entfernen"-Link in der Felder-Liste, nicht mehr per Klick
  // auf den Marker selbst, da ein Klick jetzt zum Ziehen/Auswählen gebraucht
  // wird.
  function wirePdfMarkerDrag(marker, feldId) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    marker.addEventListener('mousedown', (e) => {
      if (typeof e.button === 'number' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      marker.classList.add('dragging');
      const onMove = (ev) => {
        if (!dragging) return;
        if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) moved = true;
        const wrap = document.getElementById('pr-pdf-canvas-wrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const rawX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / (rect.width || 1)));
        const rawY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / (rect.height || 1)));
        const list = findCurrentProtokoll();
        const snapped = snapPdfPosition(list, feldId, rawX, rawY);
        marker.style.left = (snapped.xPct * 100) + '%';
        marker.style.top = (snapped.yPct * 100) + '%';
        marker.setAttribute('data-drag-x-pct', String(snapped.xPct));
        marker.setAttribute('data-drag-y-pct', String(snapped.yPct));
        showPdfGuides(snapped.guideX, snapped.guideY);
      };
      const onUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        clearPdfGuides();
        marker.classList.remove('dragging');
        if (moved && marker.getAttribute('data-drag-x-pct') != null) {
          const cur = findCurrentProtokoll();
          const feld = cur && cur.pdfVorlage && (cur.pdfVorlage.felder || []).find((x) => x.id === feldId);
          if (feld) {
            feld.xPct = Number(marker.getAttribute('data-drag-x-pct'));
            feld.yPct = Number(marker.getAttribute('data-drag-y-pct'));
            saveCurrentProtokoll(cur);
          }
          renderPdfPanel(findCurrentProtokoll());
        } else {
          pdfSelectedFeldId = (pdfSelectedFeldId === feldId) ? null : feldId;
          const cur = findCurrentProtokoll();
          renderPdfMarkers(cur);
          renderPdfFelderList(cur);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Bildet die Vorlagen-Stil-Schriftart (pdf-lib-Standardschriftart) auf eine
  // möglichst ähnliche CSS-Schriftfamilie ab, damit die Vorschau der echten
  // Platzierung im PDF möglichst nahekommt.
  function pdfFontCssFamily(key) {
    if (key === 'TimesRoman' || key === 'TimesRomanBold') return '"Times New Roman", Times, serif';
    if (key === 'Courier') return '"Courier New", Courier, monospace';
    return 'Arial, Helvetica, sans-serif';
  }
  function pdfFontCssWeight(key) {
    return (key === 'HelveticaBold' || key === 'TimesRomanBold') ? '700' : '400';
  }
  // Wie stark die aktuell sichtbare Vorschau gegenüber den echten PDF-Punkten
  // skaliert ist - berechnet direkt aus den (beim Upload gespeicherten)
  // Seitenmaßen und der tatsächlichen Breite des Vorschau-Containers, damit
  // die Schriftgröße der Marker synchron mit dem tatsächlich gerenderten PDF-
  // Hintergrund bleibt (unabhängig davon, ob/wann der asynchrone pdf.js-
  // Renderdurchlauf selbst fertig ist).
  function pdfCurrentScale(list) {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    const dims = pdfPageDimsFor(list, pdfCurrentPage);
    if (!wrap || !dims || !dims.w) return 1;
    const containerWidth = wrap.clientWidth || (wrap.getBoundingClientRect && wrap.getBoundingClientRect().width) || 0;
    if (!containerWidth) return 1;
    return containerWidth / dims.w;
  }

  // Markiert platzierte Felder NICHT mehr als blaue Badges, sondern als
  // reinen Text - in exakt der Schriftart/-größe/Farbe des Vorlagen-Stils und
  // genau an der Stelle, an der er später im generierten PDF landet. Das war
  // eine explizite Nutzerrückmeldung: Badges gaben keinen verlässlichen
  // Eindruck davon, wie die Beschriftung am Ende tatsächlich aussieht/sitzt.
  // Zum Ziehen/Auswählen reicht ein dezenter gestrichelter Rahmen bei Hover/
  // Auswahl (siehe CSS), im Ruhezustand ist es wirklich nur der Text.
  function renderPdfMarkers(list) {
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.pr-pdf-marker').forEach((m) => m.remove());
    clearPdfGuides();
    if (!list.pdfVorlage) return;
    const stil = list.pdfVorlage.vorlageStil || defaultVorlageStil();
    const scale = pdfCurrentScale(list);
    (list.pdfVorlage.felder || []).filter((f) => f.page === pdfCurrentPage).forEach((f) => {
      const marker = document.createElement('div');
      marker.className = 'pr-pdf-marker' + (f.id === pdfSelectedFeldId ? ' selected' : '');
      marker.style.left = (f.xPct * 100) + '%';
      marker.style.top = (f.yPct * 100) + '%';
      marker.style.fontFamily = pdfFontCssFamily(stil.fontFamily);
      marker.style.fontWeight = pdfFontCssWeight(stil.fontFamily);
      marker.style.fontSize = Math.max(6, stil.fontSize * scale) + 'px';
      marker.style.color = stil.farbe || '#1a1a1a';
      marker.textContent = fieldLabelForPdfFeld(list, f);
      marker.title = 'Ziehen zum Verschieben (rastet an anderen Feldern ein) · Klicken zum Auswählen für Pfeiltasten-Feinjustierung';
      marker.setAttribute('data-pdf-feld-id', f.id);
      // Jede Tabellen-Zelle (Zeile x Spalte) ist ein ganz normales, eigenes
      // Feld in dieser Liste - kein "Geister"-Sonderfall mehr: jede Zeile
      // lässt sich einzeln ziehen/auswählen, damit sich auch unregelmäßige
      // Tabellen-Layouts auf der Vorlage exakt nachbilden lassen.
      wirePdfMarkerDrag(marker, f.id);
      wrap.appendChild(marker);
    });
  }

  // 1 PDF-Punkt (pdf.js/pdf-lib-Einheit) entspricht 1/72 Zoll; Seitenmaße
  // liegen in pageSizes (aus dem asynchronen pdf.js-Ladevorgang beim Upload)
  // in Punkt vor. Ohne bekannte Seitenmaße (z. B. wenn pdf.js gerade nicht
  // verfügbar ist) wird ersatzweise in Prozent editiert.
  function pdfPageDimsFor(list, page) {
    const sizes = list && list.pdfVorlage && list.pdfVorlage.pageSizes;
    return (sizes && sizes[page]) ? sizes[page] : null;
  }

  // Fügt am Ende der Zeilen-Liste einer einzelnen Tabellen-Spalte (bausteinId
  // + spalte) einen kleinen "+ Zeile"-Link ein, mit dem sich - unabhängig von
  // allen anderen Zeilen - eine weitere, frei verschiebbare Zelle für genau
  // diese Spalte anlegen lässt (z. B. wenn die Tabelle mehr Zeilen braucht,
  // als beim ersten Platzieren angelegt wurden).
  function pdfTabelleAddRowButtonHtml(bausteinId, spalte) {
    return `<button type="button" class="link-action" data-pdf-tabelle-add-row="${esc(bausteinId)}" data-pdf-tabelle-add-row-spalte="${spalte}" style="margin:0 0 8px 20px;">+ Zeile für diese Spalte</button>`;
  }

  function renderPdfFelderList(list) {
    const el = document.getElementById('pr-pdf-felder-list');
    if (!el) return;
    if (!list.pdfVorlage || !(list.pdfVorlage.felder || []).length) {
      el.innerHTML = '<div class="changelog-empty" style="padding:8px 0;">Noch keine Felder auf der Vorlage platziert.</div>';
      return;
    }
    // Nach der jeweils zuletzt gelisteten Zeile einer Tabellen-Spalte wird
    // der "+ Zeile"-Link für genau diese Spalte angehängt - dafür merken, an
    // welcher Stelle jede Spalte (bausteinId+spalte) zuletzt in der Liste
    // auftaucht.
    const felder = list.pdfVorlage.felder;
    const lastSpalteIdx = {};
    felder.forEach((f, i) => { if (f.kind === 'tabelle') lastSpalteIdx[f.bausteinId + '::' + f.spalte] = i; });
    el.innerHTML = felder.map((f, i) => {
      const dims = pdfPageDimsFor(list, f.page);
      const xVal = dims ? (f.xPct * dims.w * PDF_MM_PER_PT) : (f.xPct * 100);
      const yVal = dims ? (f.yPct * dims.h * PDF_MM_PER_PT) : (f.yPct * 100);
      const unit = dims ? 'mm' : '%';
      const selected = f.id === pdfSelectedFeldId;
      let html = `
      <div class="pr-pdf-feld-row${selected ? ' selected' : ''}" data-pdf-feld-row="${esc(f.id)}">
        <span>${esc(fieldListLabelForPdfFeld(list, f))} <span class="badge-mini">Seite ${f.page + 1}</span></span>
        <span class="pr-pdf-feld-pos">
          <label>X <input type="number" step="0.5" data-pdf-feld-x="${esc(f.id)}" value="${xVal.toFixed(1)}"> ${unit}</label>
          <label>Y <input type="number" step="0.5" data-pdf-feld-y="${esc(f.id)}" value="${yVal.toFixed(1)}"> ${unit}</label>
        </span>
        <button type="button" class="link-action" data-remove-pdf-feld="${esc(f.id)}" style="color:var(--red);">Entfernen</button>
      </div>`;
      if (f.kind === 'tabelle' && lastSpalteIdx[f.bausteinId + '::' + f.spalte] === i) {
        html += pdfTabelleAddRowButtonHtml(f.bausteinId, f.spalte);
      }
      return html;
    }).join('');
    el.querySelectorAll('[data-remove-pdf-feld]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-pdf-feld');
        const cur = findCurrentProtokoll();
        if (!cur || !cur.pdfVorlage) return;
        cur.pdfVorlage.felder = cur.pdfVorlage.felder.filter((x) => x.id !== id);
        if (pdfSelectedFeldId === id) pdfSelectedFeldId = null;
        saveCurrentProtokoll(cur);
        renderPdfPanel(cur);
      });
    });
    el.querySelectorAll('[data-pdf-tabelle-add-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bausteinId = btn.getAttribute('data-pdf-tabelle-add-row');
        const spalte = Number(btn.getAttribute('data-pdf-tabelle-add-row-spalte'));
        const cur = findCurrentProtokoll();
        if (!cur || !cur.pdfVorlage) return;
        const colFields = (cur.pdfVorlage.felder || [])
          .filter((x) => x.kind === 'tabelle' && x.bausteinId === bausteinId && x.spalte === spalte)
          .sort((a, b) => a.row - b.row);
        if (!colFields.length) return;
        const last = colFields[colFields.length - 1];
        const prev = colFields.length > 1 ? colFields[colFields.length - 2] : null;
        // Abstand für die neue Zeile: aus den beiden zuletzt vorhandenen
        // Zeilen dieser Spalte ableiten (folgt also der tatsächlichen,
        // eventuell manuell angepassten Anordnung), sonst Standard-Vorschlag.
        const einst = (cur.pdfVorlage.tabellenEinstellungen && cur.pdfVorlage.tabellenEinstellungen[bausteinId]) || defaultTabellenEinstellung();
        const step = prev ? (last.yPct - prev.yPct) : (Number(einst.zeilenhoeheYPct) || defaultTabellenEinstellung().zeilenhoeheYPct);
        const neuesFeld = {
          id: makeProtokollId('pf'), kind: 'tabelle', bausteinId, spalte,
          row: last.row + 1, page: last.page,
          xPct: last.xPct, yPct: Math.min(1, last.yPct + step),
        };
        cur.pdfVorlage.felder.push(neuesFeld);
        pdfSelectedFeldId = neuesFeld.id;
        saveCurrentProtokoll(cur);
        renderPdfPanel(cur);
      });
    });
    function updatePdfFeldPosFromInput(id, axis, inputEl) {
      const cur = findCurrentProtokoll();
      if (!cur || !cur.pdfVorlage) return;
      const feld = (cur.pdfVorlage.felder || []).find((x) => x.id === id);
      if (!feld) return;
      const raw = Number(inputEl.value);
      if (isNaN(raw)) return;
      const dims = pdfPageDimsFor(cur, feld.page);
      const pct = dims ? Math.min(1, Math.max(0, (raw / PDF_MM_PER_PT) / dims[axis === 'x' ? 'w' : 'h'])) : Math.min(1, Math.max(0, raw / 100));
      if (axis === 'x') feld.xPct = pct; else feld.yPct = pct;
      saveCurrentProtokoll(cur);
      renderPdfMarkers(cur);
    }
    el.querySelectorAll('[data-pdf-feld-x]').forEach((inp) => {
      inp.addEventListener('change', () => updatePdfFeldPosFromInput(inp.getAttribute('data-pdf-feld-x'), 'x', inp));
    });
    el.querySelectorAll('[data-pdf-feld-y]').forEach((inp) => {
      inp.addEventListener('change', () => updatePdfFeldPosFromInput(inp.getAttribute('data-pdf-feld-y'), 'y', inp));
    });
    el.querySelectorAll('[data-pdf-feld-row]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('button')) return;
        const id = row.getAttribute('data-pdf-feld-row');
        pdfSelectedFeldId = (pdfSelectedFeldId === id) ? null : id;
        const cur = findCurrentProtokoll();
        renderPdfMarkers(cur);
        renderPdfFelderList(cur);
      });
    });
  }

  // Rendert die aktuelle Seite der PDF-Vorlage sichtbar auf das Canvas.
  // Rein optisch/optional - schlägt in Umgebungen ohne echten Canvas-2D-
  // Kontext (bzw. ohne pdf.js) fehl, was hier bewusst verschluckt wird:
  // das Platzieren von Feldern (prozentuale Position relativ zum
  // umgebenden Container) funktioniert unabhängig davon, ob die Vorschau
  // tatsächlich sichtbar gerendert werden konnte.
  async function renderPdfCanvasPage(list) {
    const canvas = document.getElementById('pr-pdf-canvas');
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (!canvas || !wrap || !list || !list.pdfVorlage || !window.pdfjsLib) return;
    try {
      const bytes = base64ToUint8Array(list.pdfVorlage.base64);
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(pdfCurrentPage + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      // wrap.clientWidth spiegelt bereits die aktuelle Zoomstufe wider (siehe
      // applyPdfZoom()), dadurch bleibt die sichtbare Vorschau unabhängig vom
      // Zoom exakt deckungsgleich mit den prozentual positionierten Markern.
      const containerWidth = wrap.clientWidth || baseViewport.width || 640;
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) { /* Vorschau optional, siehe Kommentar oben */ }
  }

  // Setzt die Breite von #pr-pdf-canvas-wrap gemäß pdfZoom - 100% entspricht
  // exakt der bisherigen festen max-width (640px), größere Zoomstufen machen
  // das Canvas breiter (der umgebende #pr-pdf-canvas-scroll-Container scrollt
  // dann horizontal), was genaueres Klicken/Ziehen beim Platzieren erlaubt.
  function applyPdfZoom() {
    const scrollEl = document.getElementById('pr-pdf-canvas-scroll');
    const wrap = document.getElementById('pr-pdf-canvas-wrap');
    if (wrap) {
      const naturalWidth = Math.min((scrollEl && scrollEl.clientWidth) || 640, 640) || 640;
      // max-width:640px aus dem Stylesheet würde eine per Zoom vergrößerte
      // Breite sonst wieder kappen - deshalb ab hier vollständig von JS
      // gesteuert (die CSS-Regel greift nur, bevor dieses Skript läuft).
      wrap.style.maxWidth = 'none';
      wrap.style.width = (naturalWidth * pdfZoom) + 'px';
    }
    const zoomLabel = document.getElementById('pr-pdf-zoom-label');
    if (zoomLabel) zoomLabel.textContent = Math.round(pdfZoom * 100) + '%';
    const zoomOutBtn = document.getElementById('pr-pdf-zoom-out');
    const zoomInBtn = document.getElementById('pr-pdf-zoom-in');
    if (zoomOutBtn) zoomOutBtn.disabled = pdfZoom <= PDF_ZOOM_LEVELS[0];
    if (zoomInBtn) zoomInBtn.disabled = pdfZoom >= PDF_ZOOM_LEVELS[PDF_ZOOM_LEVELS.length - 1];
  }

  function renderPdfPanel(list) {
    const uploadWrap = document.getElementById('pr-pdf-upload-wrap');
    const editorWrap = document.getElementById('pr-pdf-editor');
    if (!uploadWrap || !editorWrap) return;
    if (!list) {
      uploadWrap.hidden = true;
      editorWrap.hidden = true;
      return;
    }
    if (!list.pdfVorlage) {
      uploadWrap.hidden = false;
      editorWrap.hidden = true;
      return;
    }
    uploadWrap.hidden = true;
    editorWrap.hidden = false;
    const v = list.pdfVorlage;
    const numPages = v.numPages || 1;
    if (pdfCurrentPage >= numPages) pdfCurrentPage = Math.max(0, numPages - 1);
    const filenameEl = document.getElementById('pr-pdf-filename');
    if (filenameEl) filenameEl.textContent = v.fileName || 'PDF-Vorlage';
    const pageLabelEl = document.getElementById('pr-pdf-page-label');
    if (pageLabelEl) pageLabelEl.textContent = `Seite ${pdfCurrentPage + 1}/${numPages}`;
    const prevBtn = document.getElementById('pr-pdf-prev-page');
    const nextBtn = document.getElementById('pr-pdf-next-page');
    if (prevBtn) prevBtn.disabled = pdfCurrentPage <= 0;
    if (nextBtn) nextBtn.disabled = pdfCurrentPage >= numPages - 1;
    const stil = v.vorlageStil || defaultVorlageStil();
    const fontSel = document.getElementById('pr-pdf-font');
    if (fontSel) fontSel.innerHTML = PDF_FONT_OPTIONS.map((f) => `<option value="${esc(f.key)}"${stil.fontFamily === f.key ? ' selected' : ''}>${esc(f.label)}</option>`).join('');
    const sizeInput = document.getElementById('pr-pdf-fontsize');
    if (sizeInput) sizeInput.value = stil.fontSize;
    const farbeInput = document.getElementById('pr-pdf-farbe');
    if (farbeInput) farbeInput.value = stil.farbe;

    closePdfPlaceAutocomplete();
    applyPdfZoom();
    renderPdfMarkers(list);
    renderPdfFelderList(list);
    renderPdfCanvasPage(list);
  }

  function handlePdfUpload(file) {
    const list = findCurrentProtokoll();
    if (!list || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      const base64 = 'data:application/pdf;base64,' + uint8ToBase64Global(bytes);
      list.pdfVorlage = emptyPdfVorlage(file.name, base64, 1, []);
      pdfCurrentPage = 0;
      pdfZoom = 1;
      pdfSelectedFeldId = null;
      saveCurrentProtokoll(list);
      renderPdfPanel(list);
      // Seitenanzahl/-maße sind rein informativ für die Platzierungs-Vor-
      // schau - werden asynchron nachgeladen und aktualisieren die Anzeige,
      // sobald verfügbar (nur, wenn zwischenzeitlich nicht schon wieder eine
      // andere Vorlage hochgeladen wurde).
      if (window.pdfjsLib) {
        pdfjsLib.getDocument({ data: bytes.slice(0) }).promise.then(async (pdf) => {
          const numPages = pdf.numPages;
          const pageSizes = [];
          for (let p = 1; p <= numPages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            pageSizes.push({ w: vp.width, h: vp.height });
          }
          const cur = findCurrentProtokoll();
          if (cur && cur.pdfVorlage && cur.pdfVorlage.base64 === base64) {
            cur.pdfVorlage.numPages = numPages;
            cur.pdfVorlage.pageSizes = pageSizes;
            saveCurrentProtokoll(cur);
            renderPdfPanel(cur);
          }
        }).catch(() => { /* Seitenzahl/-maße optional */ });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const pdfDropzoneEl = document.getElementById('pr-pdf-dropzone');
  const pdfInputEl = document.getElementById('pr-pdf-input');
  if (pdfDropzoneEl && pdfInputEl) {
    pdfDropzoneEl.addEventListener('click', () => { pdfInputEl.value = ''; pdfInputEl.click(); });
    pdfDropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handlePdfUpload(file);
    });
    pdfInputEl.addEventListener('change', () => {
      const file = pdfInputEl.files[0];
      if (file) handlePdfUpload(file);
    });
  }
  const pdfRemoveBtn = document.getElementById('pr-pdf-remove');
  if (pdfRemoveBtn) {
    pdfRemoveBtn.addEventListener('click', () => {
      const list = findCurrentProtokoll();
      if (!list) return;
      if (!confirm('PDF-Vorlage wirklich entfernen? Alle darauf platzierten Felder gehen dabei verloren.')) return;
      list.pdfVorlage = null;
      pdfCurrentPage = 0;
      pdfZoom = 1;
      pdfSelectedFeldId = null;
      saveCurrentProtokoll(list);
      renderPdfPanel(list);
    });
  }
  const pdfPrevBtn = document.getElementById('pr-pdf-prev-page');
  const pdfNextBtn = document.getElementById('pr-pdf-next-page');
  if (pdfPrevBtn) {
    pdfPrevBtn.addEventListener('click', () => {
      if (pdfCurrentPage > 0) { pdfCurrentPage--; pdfSelectedFeldId = null; renderPdfPanel(findCurrentProtokoll()); }
    });
  }
  if (pdfNextBtn) {
    pdfNextBtn.addEventListener('click', () => {
      const list = findCurrentProtokoll();
      if (list && list.pdfVorlage && pdfCurrentPage < (list.pdfVorlage.numPages || 1) - 1) { pdfCurrentPage++; pdfSelectedFeldId = null; renderPdfPanel(list); }
    });
  }
  const pdfZoomOutBtn = document.getElementById('pr-pdf-zoom-out');
  const pdfZoomInBtn = document.getElementById('pr-pdf-zoom-in');
  function stepPdfZoom(dir) {
    const curIdx = PDF_ZOOM_LEVELS.indexOf(pdfZoom);
    const fromIdx = curIdx === -1 ? PDF_ZOOM_LEVELS.indexOf(1) : curIdx;
    const nextIdx = Math.min(PDF_ZOOM_LEVELS.length - 1, Math.max(0, fromIdx + dir));
    pdfZoom = PDF_ZOOM_LEVELS[nextIdx];
    const list = findCurrentProtokoll();
    if (list) renderPdfPanel(list);
  }
  if (pdfZoomOutBtn) pdfZoomOutBtn.addEventListener('click', () => stepPdfZoom(-1));
  if (pdfZoomInBtn) pdfZoomInBtn.addEventListener('click', () => stepPdfZoom(1));

  const pdfCanvasWrapEl = document.getElementById('pr-pdf-canvas-wrap');
  if (pdfCanvasWrapEl) {
    pdfCanvasWrapEl.addEventListener('click', (e) => {
      // Klicks auf einen bestehenden Marker (Ziehen/Auswählen, siehe
      // wirePdfMarkerDrag) oder in ein bereits offenes Tippen-Popup selbst
      // sollen hier kein zusätzliches neues Feld/Popup anlegen.
      if (e.target && e.target.closest && (e.target.closest('.pr-pdf-marker') || e.target.closest('.pr-pdf-place-popover'))) return;
      const list = findCurrentProtokoll();
      if (!list || !list.pdfVorlage) return;
      const rect = pdfCanvasWrapEl.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      const xPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / width));
      const yPct = Math.min(1, Math.max(0, (e.clientY - rect.top) / height));
      showPdfPlaceAutocomplete(list, xPct, yPct);
    });
  }

  // Pfeiltasten-Feinjustierung des gerade ausgewählten Markers (siehe
  // wirePdfMarkerDrag/renderPdfFelderList) - Umschalt+Pfeil bewegt in
  // größeren Schritten. Läuft nur, wenn die PDF-Vorlagen-Bearbeitung gerade
  // sichtbar ist und der Fokus nicht in einem Eingabefeld liegt (damit z. B.
  // das Tippen im Baustein-Editor nicht versehentlich Felder verschiebt).
  const PDF_NUDGE_STEP = 0.002;
  const PDF_NUDGE_STEP_BIG = 0.01;
  document.addEventListener('keydown', (e) => {
    if (!pdfSelectedFeldId) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const editorWrap = document.getElementById('pr-pdf-editor');
    if (!editorWrap || editorWrap.hidden) return;
    const active = document.activeElement;
    if (active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return;
    const list = findCurrentProtokoll();
    if (!list || !list.pdfVorlage) return;
    const feld = (list.pdfVorlage.felder || []).find((f) => f.id === pdfSelectedFeldId);
    if (!feld) return;
    e.preventDefault();
    const step = e.shiftKey ? PDF_NUDGE_STEP_BIG : PDF_NUDGE_STEP;
    if (e.key === 'ArrowUp') feld.yPct = Math.max(0, feld.yPct - step);
    if (e.key === 'ArrowDown') feld.yPct = Math.min(1, feld.yPct + step);
    if (e.key === 'ArrowLeft') feld.xPct = Math.max(0, feld.xPct - step);
    if (e.key === 'ArrowRight') feld.xPct = Math.min(1, feld.xPct + step);
    saveCurrentProtokoll(list);
    renderPdfMarkers(list);
    renderPdfFelderList(list);
  });

  const pdfFontSel = document.getElementById('pr-pdf-font');
  const pdfSizeInput = document.getElementById('pr-pdf-fontsize');
  const pdfFarbeInput = document.getElementById('pr-pdf-farbe');
  function updateVorlageStilFromInputs() {
    const list = findCurrentProtokoll();
    if (!list || !list.pdfVorlage) return;
    list.pdfVorlage.vorlageStil = {
      fontFamily: pdfFontSel ? pdfFontSel.value : 'Helvetica',
      fontSize: pdfSizeInput ? (Number(pdfSizeInput.value) || 10) : 10,
      farbe: pdfFarbeInput ? pdfFarbeInput.value : '#1a1a1a',
    };
    saveCurrentProtokoll(list);
  }
  if (pdfFontSel) pdfFontSel.addEventListener('change', updateVorlageStilFromInputs);
  if (pdfSizeInput) pdfSizeInput.addEventListener('change', updateVorlageStilFromInputs);
  if (pdfFarbeInput) pdfFarbeInput.addEventListener('change', updateVorlageStilFromInputs);

  // Erklärt im Editor (nicht nur im Handy-Vorschau-Teil), dass die
  // Mastnummer fest und automatisch am Anfang jeder Maske steht, sobald
  // dieses Protokoll über eine Tätigkeitsliste einem Mast zugeordnet wird -
  // dafür ist kein eigener Baustein nötig.
  function renderMastPin(list) {
    const el = document.getElementById('pr-mast-pin');
    if (!el) return;
    if (!list) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="pr-mast-pin-card">
      <span class="pr-mast-pin-icon">${LOCK_SVG_SMALL}</span>
      <div>
        <div class="pr-mast-pin-title">Mastnummer <span class="pr-source-auto-badge">Immer automatisch</span></div>
        <div class="pr-mast-pin-hint">Steht immer ganz oben in der Maske. Sobald dieses Protokoll über eine Tätigkeitsliste einem Mast zugeordnet ist, wird die Mastnummer automatisch aus der Masttafel übernommen - kein eigener Baustein nötig.</div>
      </div>
    </div>`;
  }

  document.querySelectorAll('[data-add-baustein]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = findCurrentProtokoll();
      if (!list) return;
      list.bausteine.push(emptyBaustein(btn.getAttribute('data-add-baustein')));
      saveCurrentProtokoll(list);
      renderBausteinList(list);
      renderPhonePreview(list);
    });
  });

  const renameBtn = document.getElementById('pr-rename');
  if (renameBtn) {
    renameBtn.addEventListener('click', () => {
      const list = findCurrentProtokoll();
      if (!list) return;
      const name = prompt('Neuer Name für dieses Protokoll:', list.name);
      if (!name || !name.trim()) return;
      list.name = name.trim();
      saveCurrentProtokoll(list);
      renderEditor();
      renderTemplateList();
      renderTemplateSelect();
      renderProjectList();
    });
  }

  const aiGenerateBtn = document.getElementById('pr-ai-generate');
  if (aiGenerateBtn) {
    aiGenerateBtn.addEventListener('click', () => {
      const list = findCurrentProtokoll();
      const inputEl = document.getElementById('pr-ai-input');
      const resultEl = document.getElementById('pr-ai-result');
      if (!list || !inputEl) return;
      const text = inputEl.value;
      if (!text.trim()) {
        if (resultEl) resultEl.textContent = 'Bitte zuerst kurz beschreiben, welche Felder die Maske haben soll.';
        return;
      }
      const generated = generateBausteineFromDescription(text);
      if (!generated.length) {
        if (resultEl) resultEl.textContent = 'Es konnten keine Felder aus dem Text erkannt werden - bitte anders formulieren.';
        return;
      }
      generated.forEach((b) => list.bausteine.push(b));
      saveCurrentProtokoll(list);
      renderBausteinList(list);
      renderPhonePreview(list);
      inputEl.value = '';
      const autoCount = generated.filter((b) => b.quelle === 'masttafel' && b.masttafelSpalte).length;
      const extra = autoCount ? ` (${autoCount} davon automatisch mit einer Masttafel-Spalte verknüpft)` : '';
      if (resultEl) resultEl.textContent = `${generated.length} Baustein${generated.length === 1 ? '' : 'e'} erstellt und unten hinzugefügt${extra}. Bitte prüfen und bei Bedarf anpassen.`;
    });
  }

  renderEditor();
})();

// ======================================================================
// Masttafel: real import (native file picker / drag-drop), parsed
// client-side with SheetJS, with Bauwerksnummer-keyed versioning,
// column show/hide + freeze + saved views, zoom, a Bauwerk detail modal
// and a downloadable Änderungsbericht.
// ======================================================================
(function () {
  const fileInput = document.getElementById('masttafel-file-input');
  if (!fileInput) return;

  // ---------- small helpers ----------
  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function normalize(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function formatDate(d) { return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`; }
  function formatDateTime(d) { return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

  // Chunked to avoid blowing the call stack on String.fromCharCode.apply
  // for larger files (a plain spread/apply over the whole array can hit
  // engine argument-count limits somewhere in the tens of thousands).
  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function cellText(ws, r, c) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) return '';
    const v = cell.w !== undefined ? cell.w : cell.v;
    if (v === undefined || v === null) return '';
    let s = String(v);
    if (cell.t === 'n' && /^-?\d+\.\d+$/.test(s)) s = s.replace('.', ',');
    return s;
  }

  function buildMergeMap(merges) {
    const map = {};
    merges.forEach((m) => {
      const rowspan = m.e.r - m.s.r + 1;
      const colspan = m.e.c - m.s.c + 1;
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) map[r + ',' + c] = { topR: m.s.r, topC: m.s.c, rowspan, colspan };
      }
    });
    return map;
  }

  function getColumnLabel(ws, mergeMap, range, headerEndRow, c) {
    const parts = [];
    let lastText = null;
    for (let r = range.s.r; r <= headerEndRow; r++) {
      const info = mergeMap[r + ',' + c];
      const topR = info ? info.topR : r;
      const topC = info ? info.topC : c;
      const text = cellText(ws, topR, topC).replace(/\n/g, ' ').trim();
      if (text && text !== lastText) { parts.push(text); lastText = text; }
    }
    return parts.length ? parts.join(' – ') : 'Spalte ' + (c - range.s.c + 1);
  }

  // Parses a worksheet into: column metadata (with a flattened, readable
  // label per leaf column), a rendered thead HTML string, and raw data
  // rows (one value per physical column + this row's own merge spans).
  function parseWorkbookSheet(ws) {
    const ref = ws['!ref'];
    if (!ref) return null;
    const range = XLSX.utils.decode_range(ref);
    const merges = ws['!merges'] || [];
    const mergeMap = buildMergeMap(merges);

    function rowHasVerticalMerge(r) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const info = mergeMap[r + ',' + c];
        if (info && info.rowspan > 1) return true;
      }
      return false;
    }

    let headerEndRow = range.s.r;
    for (let r = range.s.r; r <= range.e.r; r++) {
      if (rowHasVerticalMerge(r)) headerEndRow = r;
      else if (r > range.s.r) break;
    }

    const consumed = {};
    const headerRowsHtml = [];
    for (let r = range.s.r; r <= headerEndRow; r++) {
      let rowHtml = '';
      for (let c = range.s.c; c <= range.e.c; c++) {
        const key = r + ',' + c;
        if (consumed[key]) continue;
        const info = mergeMap[key];
        const isKeyCol = c === range.s.c ? ' class="key-col"' : '';
        if (info && info.topR === r && info.topC === c) {
          for (let rr = r; rr < r + info.rowspan; rr++) {
            for (let cc = c; cc < c + info.colspan; cc++) consumed[rr + ',' + cc] = true;
          }
          const attrs = [];
          if (info.rowspan > 1) attrs.push(`rowspan="${info.rowspan}"`);
          if (info.colspan > 1) attrs.push(`colspan="${info.colspan}"`);
          // Only the bottom-most header cell for a column is a "leaf" - the one
          // that actually maps to a single data column, as opposed to a group
          // heading like "Mast" or "Maße" spanning several columns underneath
          // it. Sort/filter controls are only added to leaf cells, so they
          // show up once per column, on the lowest header row, not on every
          // group heading above it too.
          const isLeaf = (r + info.rowspan - 1) === headerEndRow;
          if (isLeaf) attrs.push('data-leaf="1"');
          rowHtml += `<th ${attrs.join(' ')}${isKeyCol} data-col="${c - range.s.c}">${esc(cellText(ws, r, c)).replace(/\n/g, '<br>')}</th>`;
        } else if (!info) {
          consumed[key] = true;
          const leafAttr = r === headerEndRow ? ' data-leaf="1"' : '';
          rowHtml += `<th${leafAttr}${isKeyCol} data-col="${c - range.s.c}">${esc(cellText(ws, r, c)).replace(/\n/g, '<br>')}</th>`;
        }
      }
      headerRowsHtml.push(rowHtml);
    }
    // A dedicated "Index" column, placed first by default (kept separate from
    // the Bauwerksnummer cell so it doesn't crowd it with two badges) - like
    // any other column it can be dragged elsewhere via the Spalten-Panel,
    // this is just its starting position. Spans the full header height, like
    // the key column does.
    if (headerRowsHtml.length) {
      headerRowsHtml[0] = `<th rowspan="${headerRowsHtml.length}" class="idx-col-th" data-col="idx-col" data-leaf="1">Index</th>` + headerRowsHtml[0];
    }
    const theadHtml = headerRowsHtml.map((inner) => '<tr>' + inner + '</tr>').join('');

    const columns = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      columns.push({ idx: c - range.s.c, label: getColumnLabel(ws, mergeMap, range, headerEndRow, c) });
    }

    const bodyConsumed = {};
    const rows = [];
    for (let r = headerEndRow + 1; r <= range.e.r; r++) {
      const values = [];
      for (let c = range.s.c; c <= range.e.c; c++) values.push(cellText(ws, r, c));
      const rowMerges = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const key = r + ',' + c;
        if (bodyConsumed[key]) continue;
        const info = mergeMap[key];
        if (info && info.topR === r && info.topC === c && info.colspan > 1) {
          for (let cc = c; cc < c + info.colspan; cc++) bodyConsumed[r + ',' + cc] = true;
          rowMerges.push({ start: c - range.s.c, len: info.colspan });
        } else if (info) {
          bodyConsumed[key] = true;
        }
      }
      if (normalize(values[0]) === '') continue;
      rows.push({ values, merges: rowMerges });
    }

    return { columns, theadHtml, rows };
  }

  // ======================================================================
  // ---------- PDF import (Vektor-PDF + gescannte/Raster-PDF via OCR) ----
  // Masttafeln liegen nicht nur als Excel vor - der Kopf der Tabelle ist
  // laut Vorgabe immer derselbe (Bau-Nr./Betriebs-Nr. ganz links, danach
  // Mast/Aufsatz/Gründung/Einzelstützpunkt/System/Ausleger/Traversen-
  // Gruppen, zuletzt Bemerkungen), aber die Datei selbst kann drei
  // verschiedene Formen haben:
  //   1. Excel (siehe parseWorkbookSheet oben)
  //   2. "Vektor-PDF": der PDF-Export enthält einen echten Text-Layer
  //   3. gescanntes/Raster-PDF: nur ein Bild pro Seite, kein Text-Layer
  // Beide PDF-Varianten werden hier auf dieselbe Zeilen-/Spalten-
  // Rekonstruktion zurückgeführt: Text (aus dem PDF selbst oder aus einer
  // OCR-Erkennung auf dem gerenderten Seitenbild) wird in physische Zeilen
  // geclustert, Spaltengrenzen werden aus der x-Position der Wörter
  // hergeleitet, und Zeilen ohne eigene Bau-Nr. ("Fortsetzungszeilen") oder
  // mit einer Nummer in Klammern werden - wie beschrieben - der zuletzt
  // gesehenen Mastnummer zugeschlagen statt verworfen zu werden. Das
  // Ergebnis hat exakt dieselbe Form wie parseWorkbookSheet() oben, damit
  // importIntoStore() unverändert weiterverwendet werden kann.

  // Der feste Spaltenkopf einer DB-Masttafel - unabhängig davon, ob die
  // Datei als Excel, Vektor-PDF oder gescanntes PDF vorliegt, ist dieser
  // Kopf laut Vorgabe immer identisch. Statt ihn bei jedem PDF-Import neu
  // (und damit fehleranfällig, siehe z. B. bei OCR) aus dem Dokument selbst
  // herauszulesen, wird er hier fest hinterlegt - Wort für Wort identisch
  // mit dem, was parseWorkbookSheet() oben bereits aus einer echten
  // Masttafel-Exceldatei erzeugt (verifiziert anhand der hinterlegten
  // Referenzdatei "Hannover-Berlin Mast Ebsm 6107-105.xlsx"). Die 5 letzten
  // Einträge ("Bemerkungen") entsprechen einer im Original über 5 Spalten
  // verbundenen Zelle - das deckt sich mit der bestehenden Deduplizierung
  // dieser Wiederholung an anderer Stelle im Code (Mast-Detail-Seite).
  const MASTTAFEL_FIXED_COLUMNS = [
    'Bau-Nr. oder Betriebs- Nr.',
    'Mast – Zeichn. Nr. – Ebs 04.',
    'Mast – Maße – Fuß zum Gleis\r ⊥    ∥ bzw. Masttyp – mm x mm',
    'Mast – Maße – Profil der Eckstiele – (oder)\r Fußplatte Ebs – mm x mm',
    'Mast – Maße – Länge – m',
    'Mast – Maße – Ein- setz- tiefe\r E-Maß – m',
    'Mast – Höhenlage – SO\r über F.O.K\r e-Maß – m',
    'Mast – Höhenlage – Mast O.K.\r über SO – m',
    'Aufsatz – Zeichn.- Nr. Ebs – Länge – m',
    'Aufsatz – Bauart',
    'Abstand Mast VK bis\r Gleis- mitte – m',
    'Gründung – Zeichnung – Zeichn.-Nr. – Ebs 03.',
    'Gründung – Zeichnung – Bauart',
    'Gründung – Pfahlgründung – Profil – (oder) Rohr- durch- messer – mm x mm',
    'Gründung – Pfahlgründung – Länge (gesamt) – m',
    'Gründung – Pfahl- oder\r Fundamentstellung',
    'Gründung – x-Maß – m',
    'Gründung – Vergröße- rung der Fdm.-höhe\r / Kopf- verlän- gerung – m',
    'Gründung – Ankerbolzen – Durchmesser – mm',
    'Gründung – Ankerbolzen – Anzahl – St.',
    'Gründung – Ankerbolzen – Anordnung',
    'Gründung – Ankerbolzen – Länge – m',
    'Einzelstützpunkt – System – Zeichn.Nr. – Ebs',
    'Einzelstützpunkt – System – Bauart',
    'Einzelstützpunkt – Ausleger – Zeichn.Nr. – Ebs',
    'Einzelstützpunkt – Ausleger – Bauart',
    'Traversen – Zeichn.Nr. – Ebs',
    'Traversen – Bauart',
    'Bemerkungen',
    'Bemerkungen',
    'Bemerkungen',
    'Bemerkungen',
    'Bemerkungen',
  ];
  const MASTTAFEL_FIXED_COL_COUNT = MASTTAFEL_FIXED_COLUMNS.length;

  // Erkennt eine Bau-Nr./Betriebs-Nr. wie "48-15N", "4-1", "12-14n",
  // "AF48-23N", "10-31n" - optional in Klammern für die "gehört zu einer
  // benachbarten Mastnummer"-Sonderfälle, die der Nutzer beschrieben hat.
  const MAST_KEY_RE = /^\(?[A-Za-zÄÖÜäöü]{0,4}\d+[.,]?\d*-\d+[A-Za-zÄÖÜäöü]{0,3}n?\)?$/;
  function isMastKeyText(t) {
    return MAST_KEY_RE.test(normalize(t));
  }
  function isParenKeyText(t) {
    const n = normalize(t);
    return /^\(.+\)$/.test(n) && isMastKeyText(n.slice(1, -1));
  }

  // Gruppiert eine flache Liste von {str,x,y,w,h}-Textelementen (egal ob aus
  // dem PDF-Text-Layer oder aus einer OCR-Erkennung) zu physischen Zeilen,
  // toleriert dabei kleine y-Abweichungen zwischen benachbarten Wörtern
  // derselben gedruckten Zeile (unterschiedliche Grundlinien einzelner
  // Zeichen/Wörter).
  function clusterIntoLines(items, yTolerance) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    sorted.forEach((it) => {
      let line = lines.find((l) => Math.abs(l.y - it.y) <= yTolerance);
      if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
      line.items.push(it);
      line.y = (line.y * (line.items.length - 1) + it.y) / line.items.length;
    });
    lines.sort((a, b) => a.y - b.y);
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    return lines;
  }

  // Leitet Spaltengrenzen aus den x-Mittelpunkten der übergebenen Zeilen
  // (i. d. R. die Kopfzeilen) her: nah beieinanderliegende x-Mittelpunkte
  // werden zu einer Spalte zusammengefasst, danach werden die Mittelpunkte
  // zwischen benachbarten Spalten-Clustern als Grenzen zurückgegeben.
  function detectColumnBoundaries(lines, xTolerance) {
    const centers = [];
    lines.forEach((l) => l.items.forEach((it) => centers.push(it.x + it.w / 2)));
    centers.sort((a, b) => a - b);
    const clusters = [];
    centers.forEach((c) => {
      const last = clusters[clusters.length - 1];
      if (last && c - last.sum / last.n <= xTolerance) { last.sum += c; last.n++; }
      else clusters.push({ sum: c, n: 1 });
    });
    const clusterCenters = clusters.map((cl) => cl.sum / cl.n);
    const boundaries = [];
    for (let i = 0; i < clusterCenters.length - 1; i++) boundaries.push((clusterCenters[i] + clusterCenters[i + 1]) / 2);
    return { boundaries, clusterCenters };
  }
  function columnIndexForX(x, boundaries) {
    for (let i = 0; i < boundaries.length; i++) if (x < boundaries[i]) return i;
    return boundaries.length;
  }

  // Erzwingt genau targetCount Spalten-Mittelpunkte aus den tatsächlich
  // erkannten x-Clustern - unabhängig vom Quellformat (Vektor-PDF-Text oder
  // OCR) landen am Ende immer exakt MASTTAFEL_FIXED_COL_COUNT Spalten,
  // statt wie zuvor eine je nach Dokument/Erkennungsqualität schwankende
  // (und damit potenziell falsche) Anzahl:
  // - zu wenige erkannte Cluster (z. B. weil mehrere benachbarte Spalten
  //   in der Kopfzeile eng beieinanderliegen, oder weil auf dieser Seite
  //   ganze Spalten leer sind) -> zusätzliche, gleichmäßig verteilte
  //   Mittelpunkte werden in die jeweils größten Lücken eingefügt, bis die
  //   Zielzahl erreicht ist.
  // - zu viele erkannte Cluster (Rauschen) -> die beiden am dichtesten
  //   beieinanderliegenden werden so lange zusammengeführt, bis die
  //   Zielzahl erreicht ist.
  function resolveColumnBoundaries(candidateCenters, targetCount, minX, maxX) {
    let centers = [...candidateCenters].sort((a, b) => a - b);
    if (centers.length === 0) {
      centers = [];
      for (let i = 0; i < targetCount; i++) centers.push(minX + (maxX - minX) * (i + 0.5) / targetCount);
    } else if (centers.length > targetCount) {
      while (centers.length > targetCount) {
        let bestGap = Infinity, bestIdx = 0;
        for (let i = 0; i < centers.length - 1; i++) {
          const gap = centers[i + 1] - centers[i];
          if (gap < bestGap) { bestGap = gap; bestIdx = i; }
        }
        centers[bestIdx] = (centers[bestIdx] + centers[bestIdx + 1]) / 2;
        centers.splice(bestIdx + 1, 1);
      }
    } else if (centers.length < targetCount) {
      let withEnds = [minX, ...centers, maxX];
      while (withEnds.length - 2 < targetCount) {
        let bestGap = -1, bestIdx = 0;
        for (let i = 0; i < withEnds.length - 1; i++) {
          const gap = withEnds[i + 1] - withEnds[i];
          if (gap > bestGap) { bestGap = gap; bestIdx = i; }
        }
        withEnds.splice(bestIdx + 1, 0, (withEnds[bestIdx] + withEnds[bestIdx + 1]) / 2);
      }
      centers = withEnds.slice(1, -1);
    }
    const boundaries = [];
    for (let i = 0; i < centers.length - 1; i++) boundaries.push((centers[i] + centers[i + 1]) / 2);
    return boundaries;
  }

  // Liest die Vektor-Linien (gezeichnete Tabellenrahmen) einer Seite direkt
  // aus den PDF-Zeichenbefehlen aus (nicht aus Text!). Das funktioniert
  // unabhängig davon, ob die Zellwerte selbst als echter Text oder nur als
  // Kontur/Grafik vorliegen (siehe extractPageItems) - Tabellenrahmen in
  // DB-Masttafeln sind so gut wie immer gezeichnete Linien. Damit lassen
  // sich echte Zeilentrennungen zuverlässig bestimmen - deutlich robuster
  // als eine Schätzung allein aus (bei OCR oft ungenauen) Wortpositionen,
  // die bei eng beieinanderliegenden Tabellenzeilen mehrere echte Zeilen
  // fälschlich zu einer einzigen verschmelzen kann.
  async function extractHorizontalGridLines(page) {
    const OPS = pdfjsLib.OPS;
    const viewport = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();
    function multiply(A, B) {
      return [
        A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
        A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
        A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
      ];
    }
    function applyM(M, x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let pendingSegs = null;
    const strokedSegs = [];
    const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) { stack.push(ctm); }
      else if (fn === OPS.restore) { ctm = stack.pop() || ctm; }
      else if (fn === OPS.transform) { ctm = multiply(ctm, args); }
      else if (fn === OPS.constructPath) {
        const ops = args[0], nums = args[1];
        let j = 0, cx, cy, sx, sy;
        const segs = [];
        for (const op of ops) {
          if (op === OPS.rectangle) {
            const x = nums[j++], y = nums[j++], w = nums[j++], h = nums[j++];
            const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
            for (let k = 0; k < 4; k++) segs.push([applyM(ctm, c[k][0], c[k][1]), applyM(ctm, c[k + 1][0], c[k + 1][1])]);
          } else if (op === OPS.moveTo) { cx = nums[j++]; cy = nums[j++]; sx = cx; sy = cy; }
          else if (op === OPS.lineTo) { const x = nums[j++], y = nums[j++]; segs.push([applyM(ctm, cx, cy), applyM(ctm, x, y)]); cx = x; cy = y; }
          else if (op === OPS.curveTo) { j += 6; cx = nums[j - 2]; cy = nums[j - 1]; }
          else if (op === OPS.curveTo2) { j += 4; cx = nums[j - 2]; cy = nums[j - 1]; }
          else if (op === OPS.curveTo3) { j += 4; cx = nums[j - 2]; cy = nums[j - 1]; }
          else if (op === OPS.closePath) { segs.push([applyM(ctm, cx, cy), applyM(ctm, sx, sy)]); cx = sx; cy = sy; }
        }
        pendingSegs = segs;
      } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
        if (pendingSegs) strokedSegs.push(...pendingSegs);
        pendingSegs = null;
      } else if (FILL_OPS.has(fn)) {
        pendingSegs = null; // gefüllte Flächen = Glyphen-Konturen/Schraffuren, keine Rahmenlinien
      }
    }
    const lineYs = [];
    strokedSegs.forEach(([[x1, y1], [x2, y2]]) => {
      const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      if (dy < 0.5 && dx > 15) lineYs.push(viewport.height - (y1 + y2) / 2);
    });
    lineYs.sort((a, b) => a - b);
    const clustered = [];
    lineYs.forEach((y) => {
      const last = clustered[clustered.length - 1];
      if (last !== undefined && Math.abs(y - last) <= 1.5) return;
      clustered.push(y);
    });
    return clustered;
  }

  // Ordnet Textelemente anhand echter, aus dem PDF ausgelesener Rahmen-
  // linien (gridYs, siehe extractHorizontalGridLines) physischen Zeilen zu,
  // statt sie nur anhand ihrer eigenen (bei OCR ungenauen) y-Position zu
  // clustern. Gibt null zurück, wenn zu wenige Linien gefunden wurden, um
  // daraus verlässlich Zeilenbänder zu bilden - der Aufrufer soll dann auf
  // clusterIntoLines() zurückfallen.
  function clusterIntoLinesUsingGrid(items, gridYs) {
    if (!gridYs || gridYs.length < 3) return null;
    const sortedYs = [...gridYs].sort((a, b) => a - b);
    const bands = [];
    for (let i = 0; i < sortedYs.length - 1; i++) {
      const y0 = sortedYs[i], y1 = sortedYs[i + 1];
      if (y1 - y0 < 2) continue;
      bands.push({ y0, y1, items: [] });
    }
    if (!bands.length) return null;
    items.forEach((it) => {
      const band = bands.find((b) => it.y >= b.y0 - 0.5 && it.y < b.y1 + 0.5);
      if (band) band.items.push(it);
    });
    const populated = bands.filter((b) => b.items.length > 0);
    if (!populated.length) return null;
    // Nicht jede echte Zeilentrennung in einer Masttafel ist zwangsläufig
    // als durchgezogene Rahmenlinie vorhanden (manche Dokumente zeichnen nur
    // die äußeren/größeren Abschnittsgrenzen, nicht jede einzelne Zeile
    // dazwischen). Enthält ein Band mehr als eine unterschiedliche, klar
    // Bau-Nr.-artige Zeichenfolge, verbirgt es vermutlich mehrere echte
    // Tabellenzeilen (eine einzelne, korrekt abgegrenzte Zeile hat immer nur
    // eine eigene Bau-Nr.) - für genau dieses Band wird zusätzlich die
    // toleranzbasierte Clusterung angewendet, um es weiter aufzuteilen.
    const lines = [];
    populated.forEach((b) => {
      const keyCount = new Set(b.items.filter((it) => isMastKeyText(it.str)).map((it) => normalize(it.str))).size;
      if (keyCount > 1) {
        clusterIntoLines(b.items, 4).forEach((l) => lines.push(l));
      } else {
        lines.push({ y: (b.y0 + b.y1) / 2, items: b.items.slice().sort((a, c) => a.x - c.x) });
      }
    });
    lines.sort((a, b) => a.y - b.y);
    return lines.length ? lines : null;
  }

  // Baut aus den Datenzeilen einer Seite die eigentlichen Masttafel-Zeilen:
  // - eine Zeile, deren erste Spalte wie eine Bau-Nr. aussieht, startet
  //   einen neuen Mast-Datensatz.
  // - eine Zeile ohne (oder mit nicht passender) erster Spalte gehört immer
  //   zur zuletzt gesehenen Mastnummer (Fortsetzungszeile) - ihre Werte
  //   werden an die entsprechenden Spalten des laufenden Datensatzes
  //   angehängt statt verworfen zu werden.
  // - eine Zeile, deren erste Spalte eine in Klammern gesetzte Bau-Nr. ist,
  //   wird ebenfalls dem benachbarten Datensatz zugeordnet: bevorzugt dem
  //   vorherigen (wenn schon einer existiert), sonst - falls sie ganz am
  //   Anfang der Seite steht, bevor überhaupt ein Datensatz begonnen hat -
  //   wird sie gepuffert und dem nächsten Datensatz zugeschlagen, je nachdem
  //   was zuerst kommt.
  function buildRowsFromLines(lines, boundaries, colCount) {
    const rows = [];
    let pending = [];
    let current = null;
    function mergeInto(target, cells, includeCol0) {
      const start = includeCol0 ? 0 : 1;
      for (let i = start; i < colCount; i++) {
        if (!cells[i]) continue;
        target.values[i] = target.values[i] ? target.values[i] + ' / ' + cells[i] : cells[i];
      }
    }
    lines.forEach((line) => {
      const cells = new Array(colCount).fill('');
      line.items.forEach((it) => {
        const idx = Math.min(colCount - 1, columnIndexForX(it.x + it.w / 2, boundaries));
        cells[idx] = cells[idx] ? cells[idx] + ' ' + it.str : it.str;
      });
      if (cells.every((c) => !normalize(c))) return; // leere Zeile
      const key = normalize(cells[0]);
      if (isMastKeyText(key) && !isParenKeyText(key)) {
        current = { values: cells.slice(), merges: [] };
        rows.push(current);
        if (pending.length) {
          pending.forEach((p) => mergeInto(current, p, false));
          pending = [];
        }
      } else if (isParenKeyText(key)) {
        if (current) mergeInto(current, cells, false);
        else pending.push(cells);
      } else if (current) {
        mergeInto(current, cells, true);
      } else {
        pending.push(cells);
      }
    });
    return rows;
  }

  // Liest die Text-Elemente einer Seite ein: bevorzugt direkt aus dem PDF-
  // Text-Layer (schnell, zuverlässig - "Vektor-PDF"), fällt auf ein
  // gerendertes Canvas + Tesseract.js-OCR zurück, wenn eine Seite (fast)
  // keinen Text-Layer hat (gescanntes/Raster-PDF).
  async function extractPageItems(page) {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const vectorItems = textContent.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        str: it.str.trim(),
        x: it.transform[4],
        y: viewport.height - it.transform[5],
        w: it.width || 1,
        h: it.height || Math.abs(it.transform[3]) || 10,
      }));
    // Eine Seite kann durchaus reichlich "echten" Text enthalten (z. B. das
    // Schriftfeld/die Prüfvermerke rechts, die meist aus TrueType-Text
    // bestehen) und trotzdem für die eigentliche Masttafel-Tabelle KEINEN
    // brauchbaren Text-Layer haben - manche CAD-Plots wandeln Tabellentext
    // (häufig in SHX-Schriftarten gesetzt) beim PDF-Export in reine
    // Vektor-Konturen ohne echtes Text-Objekt um. Ein simples "gibt es
    // überhaupt Text auf der Seite" reicht deshalb nicht - stattdessen wird
    // hier geprüft, ob die Tabellen-typischen Signale (Kopfzeile "Bau-Nr."/
    // "Betriebs-Nr." oder mehrere Bau-Nr.-artige Werte wie "48-15N"/"4-1")
    // im extrahierten Text tatsächlich vorkommen. Nur wenn das zutrifft,
    // wird der Text-Layer verwendet - sonst wird auf OCR zurückgegriffen,
    // auch wenn die Seite (an anderer Stelle) durchaus Text enthielt.
    const joined = vectorItems.map((it) => it.str).join(' ');
    const hasHeaderText = /bau[\s-]*nr|betriebs[\s-]*nr/i.test(joined);
    const mastKeyTokenCount = vectorItems.filter((it) => isMastKeyText(it.str)).length;
    if (hasHeaderText || mastKeyTokenCount >= 3) {
      return { items: vectorItems, source: 'vector' };
    }
    if (!window.Tesseract) throw new Error('OCR-Bibliothek (Tesseract.js) nicht geladen - Seite ohne brauchbaren Text-Layer kann nicht gelesen werden.');
    const scale = 2.5;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const { data } = await Tesseract.recognize(canvas, 'deu');
    const items = (data.words || [])
      .filter((w) => w.text && w.text.trim())
      .map((w) => ({
        str: w.text.trim(),
        x: w.bbox.x0 / scale,
        y: w.bbox.y0 / scale,
        w: (w.bbox.x1 - w.bbox.x0) / scale,
        h: (w.bbox.y1 - w.bbox.y0) / scale,
      }));
    // Echte, aus dem PDF ausgelesene Tabellenrahmen-Linien (siehe
    // extractHorizontalGridLines) - falls vorhanden, deutlich zuverlässiger
    // für die Zeilen-Zuordnung als die (oft ungenauen) OCR-Wortpositionen
    // allein. Schlägt die Auswertung fehl, wird einfach mit leeren Linien
    // weitergemacht - der Aufrufer fällt dann auf die alte, toleranz-
    // basierte Zeilenclusterung zurück.
    let gridYs = [];
    try { gridYs = await extractHorizontalGridLines(page); } catch (e) { gridYs = []; }
    return { items, source: 'ocr', gridYs };
  }

  // Liest eine ganze PDF-Datei ein und liefert dasselbe {columns, theadHtml,
  // rows}-Format wie parseWorkbookSheet(). Der Spaltenkopf ist immer der
  // feste MASTTAFEL_FIXED_COLUMNS-Satz (siehe dort) - unabhängig vom
  // Quellformat. Seiten ohne die Spaltenüberschrift "Bau-Nr."/"Betriebs-Nr."
  // (z. B. das Deckblatt mit Prüfvermerken und Lageskizze) werden
  // übersprungen.
  async function parsePdfFile(arrayBuffer, onProgress) {
    if (!window.pdfjsLib) throw new Error('PDF-Bibliothek (pdf.js) nicht geladen.');
    // pdf.js übernimmt den übergebenen ArrayBuffer als Transferable und
    // "entleert" ihn dabei (detached) - der Aufrufer braucht dieselben
    // Bytes hinterher aber noch einmal, um die Datei zum erneuten
    // Herunterladen einzubetten. Deshalb hier eine Kopie übergeben statt
    // des Originals.
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const colCount = MASTTAFEL_FIXED_COL_COUNT;
    const columns = MASTTAFEL_FIXED_COLUMNS.map((label, idx) => ({ idx, label }));
    const allRows = [];
    const warnings = [];
    let usedOcr = false;
    let tablePagesFound = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      // Eine einzelne Seite, die sich (aus welchem Grund auch immer - z. B.
      // ein unerwartetes PDF-Feature beim Rendern für OCR) nicht auslesen
      // lässt, soll nicht den kompletten Import einer mehrseitigen Datei
      // abbrechen - sie wird übersprungen und vermerkt, die übrigen Seiten
      // werden trotzdem ausgewertet.
      let extracted;
      try {
        extracted = await extractPageItems(page);
      } catch (err) {
        warnings.push(`Seite ${p}: konnte nicht gelesen werden (${err && err.message ? err.message : err}) - übersprungen.`);
        continue;
      }
      const { items, source, gridYs } = extracted;
      if (source === 'ocr') usedOcr = true;
      if (!items.length) continue;
      // "Bau-Nr." bzw. "Betriebs-Nr." kann im Text-Layer (oder in der OCR-
      // Erkennung) über mehrere einzelne Text-Fragmente verteilt sein (z. B.
      // "Bau-Nr." / "oder" / "Betriebs-" / "Nr." als separate Fragmente) -
      // deshalb wird der gesamte Seitentext zusammengefügt und darin
      // gesucht, statt nur jedes Fragment einzeln zu prüfen.
      const joinedPageText = items.map((it) => it.str).join(' ');
      const hasKeyHeader = /bau[\s-]*nr|betriebs[\s-]*nr/i.test(joinedPageText);
      // Bei einer OCR-Seite kann "Bau-Nr." selbst mal danebenerkannt werden -
      // mehrere klar Bau-Nr.-artige Werte (z. B. "48-15N") sind ein genauso
      // starkes Signal dafür, dass dies die Tabellenseite ist.
      const mastKeyTokenCount = items.filter((it) => isMastKeyText(it.str)).length;
      if (!hasKeyHeader && mastKeyTokenCount < 3) continue; // Deckblatt/Titelseite ohne Tabelle
      tablePagesFound++;

      // Zeilen-Rekonstruktion: bei OCR bevorzugt anhand echter, aus dem PDF
      // ausgelesener Rahmenlinien (siehe extractHorizontalGridLines) - das
      // verhindert, dass mehrere eng beieinanderliegende echte Tabellen-
      // zeilen fälschlich zu einer einzigen verschmelzen (die (oft
      // ungenauen) reinen OCR-Wortpositionen allein hatten genau das
      // verursacht). Nur wenn dafür zu wenige Linien gefunden wurden - oder
      // bei Vektor-Text, wo echte Zeichenpositionen ohnehin präzise sind -
      // wird auf die toleranzbasierte Clusterung zurückgefallen.
      let lines = source === 'ocr' ? clusterIntoLinesUsingGrid(items, gridYs) : null;
      if (!lines) lines = clusterIntoLines(items, 4);

      let headerEnd = lines.findIndex((l) => l.items.length && isMastKeyText(l.items[0].str) && !isParenKeyText(l.items[0].str));
      if (headerEnd === -1) headerEnd = Math.min(lines.length, 6);
      const headerLines = lines.slice(0, headerEnd);
      const dataLines = lines.slice(headerEnd);

      // Spaltengrenzen: Kandidaten aus Kopf- UND Datenzeilen zusammen
      // sammeln (Kopfzellen sind praktisch nie leer, auch wenn einzelne
      // Datenspalten es auf dieser Seite sind - das verbessert die
      // Trefferquote gegenüber "nur Kopfzeilen"), danach immer auf exakt
      // MASTTAFEL_FIXED_COL_COUNT Spalten normalisieren statt eine je nach
      // Dokument schwankende (und damit potenziell falsche) Anzahl zu
      // übernehmen.
      const calibrationLines = headerLines.length ? headerLines.concat(dataLines) : dataLines;
      const { clusterCenters } = detectColumnBoundaries(calibrationLines, 12);
      const allXs = items.map((it) => it.x + it.w / 2);
      const minX = Math.min(...allXs), maxX = Math.max(...allXs);
      const boundaries = resolveColumnBoundaries(clusterCenters, colCount, minX, maxX);
      if (clusterCenters.length !== colCount) {
        warnings.push(`Seite ${p}: automatisch ${clusterCenters.length} statt ${colCount} Spalten erkannt - fehlende/zusätzliche Spalten wurden rechnerisch ausgeglichen. Bitte die Werte dieser Seite in der Vorschau besonders sorgfältig prüfen.`);
      }

      const pageRows = buildRowsFromLines(dataLines, boundaries, colCount);
      allRows.push(...pageRows);
    }
    if (!tablePagesFound) throw new Error('In dieser PDF-Datei wurde keine Masttafel-Tabelle gefunden (Spalte "Bau-Nr." bzw. "Betriebs-Nr." nicht erkannt).');
    const theadHtml = '<tr>' + columns.map((c) => `<th data-leaf="1" data-col="${c.idx}">${esc(c.label)}</th>`).join('') + '</tr>';
    return { columns, theadHtml, rows: allRows, warnings, usedOcr };
  }

  // ---------- versioned data store ----------
  const MT = {
    columns: [],
    theadHtml: '',
    rowsByKey: new Map(),
    changesLog: [],
    files: [],
    showAllVersions: false,
    zoom: 100,
    hiddenGroups: [],
    frozenGroups: [],
    configGroups: [],
    // The "Index" (Bearbeitungsstand) is the construction-industry revision
    // letter of the Masttafel document (e.g. "Index A", "Index B") - separate
    // from our internal per-row version numbers, which only track real diffs.
    currentIndex: null,
    // Column order: null/empty = natural (original) order, showing the nice
    // merged multi-row header exactly as imported. Otherwise an array of
    // config-group objects ({start,end,label}) in the user's chosen order.
    columnOrder: null,
    // Sort: sortCol is a physical column index (number) or 'idx-col', as a
    // string, or null for unsorted.
    sortCol: null,
    sortDir: 'asc',
    // Filters: colKey ('idx-col' or a physical column index as string) ->
    // Set of allowed normalized values. Absence of a key means "no filter".
    filters: new Map(),
    // Bauwerksnummern (normalized) currently checked via the row-selection
    // checkboxes - only a delete action exists on them for now, but more
    // bulk actions are expected to hang off this same selection later.
    selectedKeys: new Set(),
    // ---- Bauabschnitte (construction-phase sections) ----
    // All of the data fields above (columns/theadHtml/rowsByKey/changesLog/
    // files/currentIndex) always describe the CURRENTLY ACTIVE Bauabschnitt -
    // switching sections snapshots them out into `sections` and loads the
    // newly selected one back into these same top-level fields, so every
    // existing render/import function above keeps working unmodified.
    sections: new Map(),
    bauabschnitte: [],
    activeBauabschnittId: null,
  };

  // The subset of MT fields that belong to one Bauabschnitt's data, as
  // opposed to view/UI state (column order, zoom, filters, ...) which stays
  // shared across all Bauabschnitte.
  const SECTION_FIELDS = ['columns', 'theadHtml', 'rowsByKey', 'changesLog', 'files', 'currentIndex'];

  function emptySection() {
    return { columns: [], theadHtml: '', rowsByKey: new Map(), changesLog: [], files: [], currentIndex: null };
  }
  function snapshotActiveSection() {
    const snap = {};
    SECTION_FIELDS.forEach((f) => { snap[f] = MT[f]; });
    return snap;
  }
  function applySection(sec) {
    SECTION_FIELDS.forEach((f) => { MT[f] = sec[f]; });
  }

  // ---- persistence: survive navigating to another tab and back ----
  // Everything above lived only in memory, so clicking "Formular" and then
  // "Übersicht" again reloaded this script from scratch and lost it all.
  // rowsByKey (a Map) is serialized as an array of [key, entry] pairs; Sets
  // in `filters` the same way saved views already do it.
  function serializeSection(sec) {
    return {
      columns: sec.columns,
      theadHtml: sec.theadHtml,
      rowsByKey: [...sec.rowsByKey.entries()],
      changesLog: sec.changesLog,
      files: sec.files,
      currentIndex: sec.currentIndex,
    };
  }
  function deserializeSection(obj) {
    // Older persisted state (saved before the file-delete feature existed)
    // may have file entries without an id - backfill one so they can still
    // be individually deleted.
    const files = (obj.files || []).map((f, i) => f.id ? f : { ...f, id: 'f-legacy-' + i + '-' + Math.random().toString(36).slice(2, 6) });
    return {
      columns: obj.columns || [],
      theadHtml: obj.theadHtml || '',
      rowsByKey: new Map(obj.rowsByKey || []),
      changesLog: obj.changesLog || [],
      files,
      currentIndex: obj.currentIndex || null,
    };
  }
  function saveMasttafelState() {
    // Sections already snapshotted away (from switching Bauabschnitte
    // earlier) plus whatever is live right now - unless the live view is
    // the merged "Alle Bauabschnitte" one, which is never itself persisted.
    const sectionsOut = {};
    MT.sections.forEach((sec, id) => { sectionsOut[id] = serializeSection(sec); });
    if (MT.activeBauabschnittId && MT.activeBauabschnittId !== '__all__') {
      sectionsOut[MT.activeBauabschnittId] = serializeSection(snapshotActiveSection());
    }
    const payload = {
      activeBauabschnittId: MT.activeBauabschnittId,
      sections: sectionsOut,
      ui: {
        columnOrder: MT.columnOrder,
        hiddenGroups: MT.hiddenGroups,
        frozenGroups: MT.frozenGroups,
        sortCol: MT.sortCol,
        sortDir: MT.sortDir,
        filters: [...MT.filters.entries()].map(([k, v]) => [k, [...v]]),
        zoom: MT.zoom,
        showAllVersions: MT.showAllVersions,
      },
    };
    try { localStorage.setItem(pKey(MASTTAFEL_STATE_KEY), JSON.stringify(payload)); } catch (e) { /* quota or serialization issue - the in-memory state for this page load is unaffected */ }
  }
  // Returns the previously active Bauabschnitt id (or '__all__'), if any -
  // populates MT.sections and the shared view/UI state as a side effect.
  function loadMasttafelState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
    // Always reset first, whether or not this project has saved data - this
    // function is now also called when switching to a *different* project
    // (see loadForCurrentProject()/levelbuildOnShowUebersicht below), and a
    // project that has never had a Masttafel imported has no saved state at
    // all. The early-return-without-resetting that used to be here left
    // MT.sections (and every UI setting: Spaltenreihenfolge, Filter, Zoom,
    // Sortierung, ausgeblendete/fixierte Spalten, Alle-Versionen-Toggle)
    // holding onto whatever the *previous* project had - which is exactly
    // why an imported Masttafel kept "leaking" into every other project.
    MT.sections = new Map();
    const saved_sections = (saved && saved.sections) || {};
    Object.keys(saved_sections).forEach((id) => { MT.sections.set(id, deserializeSection(saved_sections[id])); });
    const ui = (saved && saved.ui) || {};
    MT.columnOrder = backfillIdxColOrder(ui.columnOrder);
    MT.hiddenGroups = ui.hiddenGroups || [];
    MT.frozenGroups = ui.frozenGroups || [];
    MT.sortCol = ui.sortCol || null;
    MT.sortDir = ui.sortDir || 'asc';
    MT.filters = new Map((ui.filters || []).map(([k, arr]) => [k, new Set(arr)]));
    MT.zoom = ui.zoom || 100;
    MT.showAllVersions = !!ui.showAllVersions;
    return (saved && saved.activeBauabschnittId) || null;
  }

  // The read-only "Alle Bauabschnitte anzeigen" view: every section's masts
  // combined into one table. Assumes all Bauabschnitte were imported from
  // the same Masttafel template (same columns) - takes the column layout
  // from whichever section has one, and unions the rest.
  function buildAllSectionsView() {
    const merged = emptySection();
    MT.bauabschnitte.forEach((b) => {
      const sec = MT.sections.get(b.id);
      if (!sec) return;
      if (!merged.columns.length && sec.columns.length) {
        merged.columns = sec.columns;
        merged.theadHtml = sec.theadHtml;
      }
      sec.rowsByKey.forEach((entry, key) => merged.rowsByKey.set(key, entry));
      merged.changesLog.push(...sec.changesLog);
      merged.files.push(...sec.files.map((f) => ({ ...f, sectionName: b.name })));
      if (sec.currentIndex) merged.currentIndex = sec.currentIndex;
    });
    return merged;
  }

  // Switches the active Bauabschnitt (or '__all__' for the merged read-only
  // view), snapshotting whatever was live before switching away from it.
  function switchBauabschnitt(id) {
    if (MT.activeBauabschnittId && MT.activeBauabschnittId !== '__all__') {
      MT.sections.set(MT.activeBauabschnittId, snapshotActiveSection());
    }
    MT.activeBauabschnittId = id;
    if (id === '__all__') {
      applySection(buildAllSectionsView());
    } else {
      applySection(MT.sections.get(id) || emptySection());
    }
    renderBauabschnittSwitchers();
    updateImportAvailability();
    updateImportedVisibility();
    renderExpandedTable();
    renderCompactPreview();
    renderFileList();
    updateChangesSummary();
  }

  // Renders the two Bauabschnitt-Umschalter instances (compact + expanded
  // panel headers) from the current Bauabschnitte list, with "Alle
  // Bauabschnitte anzeigen" always offered as the first option.
  function renderBauabschnittSwitchers() {
    const switchers = document.querySelectorAll('.ba-switcher');
    const activeEntry = MT.bauabschnitte.find((b) => b.id === MT.activeBauabschnittId);
    const currentLabel = MT.activeBauabschnittId === '__all__'
      ? 'Alle Bauabschnitte'
      : (activeEntry ? activeEntry.name : 'Kein Bauabschnitt');
    const items = [{ id: '__all__', name: 'Alle Bauabschnitte anzeigen' }, ...MT.bauabschnitte];
    switchers.forEach((sw) => {
      const label = sw.querySelector('.segment-current');
      if (label) label.textContent = currentLabel;
      const menu = sw.querySelector('.segment-menu');
      if (!menu) return;
      menu.innerHTML = MT.bauabschnitte.length
        ? items.map((it) => `<div class="segment-menu-item${it.id === MT.activeBauabschnittId ? ' active' : ''}" data-ba="${esc(it.id)}">${esc(it.name)}</div>`).join('')
        : '<div class="segment-menu-item disabled">Keine Bauabschnitte angelegt</div>';
      menu.querySelectorAll('[data-ba]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          switchBauabschnitt(item.getAttribute('data-ba'));
          menu.setAttribute('hidden', '');
        });
      });
    });
  }

  // Import only makes sense while a single real Bauabschnitt is active -
  // not in the merged "Alle Bauabschnitte" view, and not before any
  // Bauabschnitt has been created in Projekteinstellungen.
  function updateImportAvailability() {
    const disabled = !MT.activeBauabschnittId || MT.activeBauabschnittId === '__all__';
    document.querySelectorAll('[data-import-trigger]').forEach((zone) => {
      zone.classList.toggle('dropzone-disabled', disabled);
    });
    const hintEl = document.getElementById('matt-import-hint');
    if (!hintEl) return;
    if (!MT.activeBauabschnittId) {
      hintEl.textContent = 'Bitte zunächst einen Bauabschnitt in den Projekteinstellungen anlegen.';
      hintEl.hidden = false;
    } else if (MT.activeBauabschnittId === '__all__') {
      hintEl.textContent = 'Import ist nur innerhalb eines einzelnen Bauabschnitts möglich - bitte einen auswählen.';
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
    }
  }

  // Shows/hides the empty-state dropzone vs. the imported table for both the
  // compact and expanded views, based on whether the currently active
  // Bauabschnitt (or merged view) actually has any data - re-evaluated on
  // every Bauabschnitt switch, not just once on first-ever import.
  function updateImportedVisibility() {
    const hasData = MT.rowsByKey.size > 0;
    ['compact', 'expanded'].forEach((scope) => {
      const emptyEl = document.getElementById('matt-empty-' + scope);
      const importedEl = document.getElementById('matt-imported-' + scope);
      if (emptyEl) emptyEl.style.display = hasData ? 'none' : '';
      if (importedEl) importedEl.hidden = !hasData;
    });
  }

  function importIntoStore(parsed, fileMeta) {
    MT.columns = parsed.columns;
    MT.theadHtml = parsed.theadHtml;
    if (fileMeta.index) MT.currentIndex = fileMeta.index;
    const summary = { newKeys: 0, changedKeys: 0, unchangedKeys: 0 };

    parsed.rows.forEach((row) => {
      const rawKey = row.values[0];
      const key = normalize(rawKey);
      if (!key) return;
      const existing = MT.rowsByKey.get(key);
      if (!existing) {
        MT.rowsByKey.set(key, {
          displayKey: rawKey,
          currentIndex: fileMeta.index || null,
          versions: [{ version: 1, values: row.values, merges: row.merges, importedAt: fileMeta.importedAt, fileName: fileMeta.name, index: fileMeta.index || null }],
        });
        summary.newKeys++;
        return;
      }
      // The Index is a whole-document revision stamp: it applies to every mast
      // present in this import, whether or not that particular mast's own data
      // changed - so this is updated unconditionally (when the import has one),
      // independent of the diff/versioning logic below.
      if (fileMeta.index) existing.currentIndex = fileMeta.index;

      const latest = existing.versions[existing.versions.length - 1];
      const diffs = [];
      for (let i = 0; i < row.values.length; i++) {
        const a = normalize(latest.values[i]);
        const b = normalize(row.values[i]);
        if (a !== b) {
          diffs.push({ colLabel: MT.columns[i] ? MT.columns[i].label : 'Spalte ' + (i + 1), oldVal: latest.values[i], newVal: row.values[i] });
        }
      }
      if (diffs.length === 0) { summary.unchangedKeys++; return; }
      const newVersion = latest.version + 1;
      existing.versions.push({ version: newVersion, values: row.values, merges: row.merges, importedAt: fileMeta.importedAt, fileName: fileMeta.name, index: existing.currentIndex });
      diffs.forEach((d) => {
        MT.changesLog.push({
          key: existing.displayKey, fromVersion: latest.version, toVersion: newVersion,
          colLabel: d.colLabel, oldVal: d.oldVal, newVal: d.newVal,
          importedAt: fileMeta.importedAt, fileName: fileMeta.name,
          fromIndex: latest.index || null, toIndex: existing.currentIndex || null,
        });
      });
      summary.changedKeys++;
    });

    return summary;
  }

  // ---------- rendering ----------
  function renderDataRowHtml(values, merges, opts) {
    opts = opts || {};
    const covered = {};
    (merges || []).forEach((m) => { for (let i = m.start; i < m.start + m.len; i++) covered[i] = m; });
    let html = '<tr' + (opts.rowClass ? ` class="${opts.rowClass}"` : '') + (opts.dataAttrs || '') + '>';
    // Row-selection checkbox - always the very first cell, mapped to this
    // Bauwerk's key (not the version), so checking it on any of its rows
    // (e.g. in "Alle Versionen anzeigen") selects the whole Standort.
    html += `<td class="sel-col"><input type="checkbox" data-select-key="${esc(values[0])}" ${opts.selected ? 'checked' : ''}></td>`;
    // Column order to render in: 'idx-col' (the Index) first, then natural
    // physical columns (0..N-1) by default - or a custom group order (groups
    // move as a whole, columns within a group keep their original relative
    // order; 'idx-col' is just another group and can end up anywhere) once
    // the user has rearranged columns via the Spalten-Panel.
    let order;
    if (opts.columnOrder && opts.columnOrder.length) {
      order = [];
      opts.columnOrder.forEach((g) => {
        if (g.start === 'idx-col') { order.push('idx-col'); return; }
        for (let i = g.start; i <= g.end; i++) order.push(i);
      });
    } else {
      order = ['idx-col'];
      for (let i = 0; i < values.length; i++) order.push(i);
    }
    for (const i of order) {
      if (i === 'idx-col') {
        // Kept as its own cell (rather than folded into the Bauwerksnummer
        // one) so it isn't crowded with the version badge there.
        html += `<td class="idx-col" data-col="idx-col">${opts.indexValue ? esc(opts.indexValue) : ''}</td>`;
        continue;
      }
      if (covered[i] && covered[i].start !== i) continue;
      const spanLen = (covered[i] && covered[i].len > 1) ? covered[i].len : 1;
      const attrs = ['data-col="' + i + '"'];
      if (spanLen > 1) attrs.push(`colspan="${spanLen}"`);
      const classes = [];
      if (i === 0) classes.push('key-col');
      // Only ever set when the caller explicitly passes changedCols (i.e. only
      // while "Alle Versionen anzeigen" is active) - never in the default view.
      if (opts.changedCols) {
        for (let k = i; k < i + spanLen; k++) {
          if (opts.changedCols.has(k)) { classes.push('cell-changed'); break; }
        }
      }
      if (classes.length) attrs.push(`class="${classes.join(' ')}"`);
      if (i === 0) {
        attrs.push(`data-bauwerk="${esc(values[0])}"`);
        const vBadge = opts.versionBadge ? ` <span class="ver-badge${opts.versionBadgeCurrent ? ' current' : ''}">${esc(opts.versionBadge)}</span>` : '';
        html += `<td ${attrs.join(' ')}>${esc(values[i])}${vBadge}</td>`;
      } else {
        html += `<td ${attrs.join(' ')}>${esc(values[i])}</td>`;
      }
    }
    return html + '</tr>';
  }

  // Compares each version to its immediate successor and returns, per version
  // number, the set of physical-column indices whose value differs from the
  // neighbouring version (whitespace-insensitive). Used to mark exactly the
  // affected columns in red - but only ever called when the caller is about
  // to render the "Alle Versionen anzeigen" (all-versions) view.
  function computeChangedColsMap(versions) {
    const map = new Map();
    versions.forEach((v) => map.set(v.version, new Set()));
    for (let i = 0; i < versions.length - 1; i++) {
      const a = versions[i], b = versions[i + 1];
      for (let c = 0; c < a.values.length; c++) {
        if (normalize(a.values[c]) !== normalize(b.values[c])) {
          map.get(a.version).add(c);
          map.get(b.version).add(c);
        }
      }
    }
    return map;
  }

  // `entries` (optional) lets the caller pass an already filtered/sorted list
  // of Bauwerk entries; defaults to all of them in their natural (import) order.
  // `columnOrder` (optional) is a custom group order, threaded through to
  // renderDataRowHtml so the physical cells come out in that order too.
  function buildTbodyHtml(showAllVersions, entries, columnOrder) {
    let html = '';
    (entries || [...MT.rowsByKey.values()]).forEach((entry) => {
      const versions = entry.versions;
      const latest = versions[versions.length - 1];
      const hasHistory = versions.length > 1;
      if (!showAllVersions) {
        // Default view: never compute or apply changed-column highlighting here,
        // even if this Bauwerk has more than one version. The Index value, on the
        // other hand, is shown for every mast (not just changed ones) since it's
        // a whole-document revision stamp, independent of per-row versioning.
        html += renderDataRowHtml(latest.values, latest.merges, {
          versionBadge: hasHistory ? 'v' + latest.version : null,
          versionBadgeCurrent: true,
          indexValue: entry.currentIndex || null,
          dataAttrs: ` data-key="${esc(entry.displayKey)}" data-version="${latest.version}"`,
          columnOrder,
          selected: MT.selectedKeys.has(normalize(entry.displayKey)),
        });
      } else {
        const changedMap = hasHistory ? computeChangedColsMap(versions) : null;
        for (let i = versions.length - 1; i >= 0; i--) {
          const v = versions[i];
          const isLatest = v.version === latest.version;
          // The latest row always shows the Masttafel's current Index (kept up to
          // date on every import, even for unchanged masts); a historical row
          // shows the Index that was in effect when that older version was captured.
          const rowIndex = isLatest ? entry.currentIndex : v.index;
          html += renderDataRowHtml(v.values, v.merges, {
            rowClass: isLatest ? '' : 'row-historical',
            versionBadge: hasHistory ? 'v' + v.version + (isLatest ? ' (aktuell)' : '') : null,
            versionBadgeCurrent: isLatest,
            indexValue: rowIndex || null,
            dataAttrs: ` data-key="${esc(entry.displayKey)}" data-version="${v.version}"`,
            changedCols: changedMap ? changedMap.get(v.version) : null,
            columnOrder,
            selected: MT.selectedKeys.has(normalize(entry.displayKey)),
          });
        }
      }
    });
    return html;
  }

  // Backward-compat: a custom column order saved (in localStorage, either as
  // the live UI state or a named saved view) before the Index column became
  // movable won't have an 'idx-col' entry - add it at the front (its default
  // position) rather than have it silently vanish when that older order is
  // applied to the current, idx-col-aware render functions.
  function backfillIdxColOrder(order) {
    if (!order || !order.length) return order || null;
    if (order.some((g) => g.start === 'idx-col')) return order;
    return [{ start: 'idx-col', end: 'idx-col', label: 'Index' }, ...order];
  }

  function buildConfigGroups() {
    // The Index is a virtual "column" (not one of the physical spreadsheet
    // columns in MT.columns) - included here, first by default, so it shows
    // up in the Spalten-Panel and can be dragged/moved like any other column
    // via the same up/down controls, instead of being permanently fixed.
    const groups = [{ start: 'idx-col', end: 'idx-col', label: 'Index' }];
    MT.columns.forEach((col) => {
      const last = groups[groups.length - 1];
      if (last && last.label === col.label && last.start !== 'idx-col') {
        last.end = col.idx;
      } else {
        groups.push({ start: col.idx, end: col.idx, label: col.label });
      }
    });
    return groups;
  }

  // True if `order` is exactly the natural (import) group order - in that
  // case we keep using the original, nicely merged multi-row header instead
  // of the simplified flattened one.
  function isNaturalOrder(order) {
    const natural = buildConfigGroups();
    if (!order || order.length !== natural.length) return false;
    return order.every((g, i) => g.start === natural[i].start && g.end === natural[i].end);
  }

  // Builds a single-row header (group label + colspan per group, in the given
  // custom order) - used only once the user has actually rearranged columns,
  // since a reordered multi-row merged header can no longer be represented
  // faithfully by the original Excel merge structure.
  function buildFlattenedTheadInner(order) {
    let rowHtml = '';
    order.forEach((g) => {
      if (g.start === 'idx-col') {
        rowHtml += `<th class="idx-col-th" data-col="idx-col" data-leaf="1">Index</th>`;
        return;
      }
      const span = g.end - g.start + 1;
      // A flattened header is always a single row, so every cell in it is
      // by definition the bottom-most (leaf) cell for its column/group.
      const attrs = [`data-col="${g.start}"`, 'data-leaf="1"'];
      if (span > 1) attrs.push(`colspan="${span}"`);
      if (g.start === 0) attrs.push('class="key-col"');
      rowHtml += `<th ${attrs.join(' ')}>${esc(g.label)}</th>`;
    });
    return '<tr>' + rowHtml + '</tr>';
  }

  // Prepends a select-all checkbox <th> to whichever thead HTML is about to
  // be rendered (natural multi-row header or the flattened single-row one),
  // spanning every header row - same idea as the always-present key column.
  function injectSelectColumn(theadInner) {
    if (!theadInner) return theadInner;
    const rowCount = (theadInner.match(/<tr>/g) || []).length || 1;
    return theadInner.replace('<tr>', `<tr><th class="sel-col" rowspan="${rowCount}"><input type="checkbox" id="matt-select-all" title="Alle auswählen"></th>`);
  }

  // ---------- row selection (checkboxes) ----------
  function updateSelectAllCheckbox(entries) {
    const cb = document.getElementById('matt-select-all');
    if (!cb) return;
    const keys = entries.map((e) => normalize(e.displayKey));
    cb.checked = keys.length > 0 && keys.every((k) => MT.selectedKeys.has(k));
    cb.indeterminate = !cb.checked && keys.some((k) => MT.selectedKeys.has(k));
  }

  // Shows the contextual selection toolbar once at least one Standort is
  // checked - only a delete action lives here for now, but it's built to
  // grow (more bulk actions are expected to join it later).
  function updateSelectionToolbar() {
    const group = document.getElementById('matt-selection-group');
    const status = document.getElementById('matt-selection-status');
    if (!group || !status) return;
    if (MT.selectedKeys.size === 0) {
      group.hidden = true;
      return;
    }
    group.hidden = false;
    status.textContent = `${MT.selectedKeys.size} ausgewählt`;
  }

  // Deletes every currently-selected Bauwerk entirely (all of its versions),
  // along with any Änderungsbericht entries referencing it.
  function deleteSelectedBauwerke() {
    if (MT.selectedKeys.size === 0) return;
    const count = MT.selectedKeys.size;
    if (!confirm(`${count} Standort${count === 1 ? '' : 'e'} wirklich löschen? Das entfernt auch die gesamte Versionshistorie.`)) return;
    const displayKeysToDelete = new Set();
    MT.selectedKeys.forEach((key) => {
      const entry = MT.rowsByKey.get(key);
      if (entry) displayKeysToDelete.add(entry.displayKey);
      MT.rowsByKey.delete(key);
    });
    MT.changesLog = MT.changesLog.filter((c) => !displayKeysToDelete.has(c.key));
    MT.selectedKeys = new Set();
    renderExpandedTable();
    renderCompactPreview();
    updateChangesSummary();
  }

  // Reads the value used for sorting/filtering a given column on a Bauwerk
  // entry - its Index (a document-level attribute) or one of its physical
  // spreadsheet columns (read from its currently-displayed/latest version).
  function getSortValue(entry, colKey) {
    if (colKey === 'idx-col') return entry.currentIndex || '';
    const latest = entry.versions[entry.versions.length - 1];
    return latest.values[colKey];
  }

  // Whitespace-insensitive, numeric-aware (handles German "1.234,56" decimals)
  // comparison used for both sorting and matching filter values.
  function compareValues(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === '' && nb === '') return 0;
    const fa = parseFloat(na.replace(/\./g, '').replace(',', '.'));
    const fb = parseFloat(nb.replace(/\./g, '').replace(',', '.'));
    if (na !== '' && nb !== '' && !isNaN(fa) && !isNaN(fb)) return fa - fb;
    return na.localeCompare(nb, 'de', { numeric: true, sensitivity: 'base' });
  }

  // Applies MT.filters (AND across columns) and MT.sortCol/sortDir to the
  // full list of Bauwerk entries, returning the list to actually render.
  function getFilteredSortedEntries() {
    let entries = [...MT.rowsByKey.values()];
    if (MT.filters.size) {
      entries = entries.filter((entry) => {
        for (const [colKey, allowed] of MT.filters.entries()) {
          const col = colKey === 'idx-col' ? 'idx-col' : parseInt(colKey, 10);
          if (!allowed.has(normalize(getSortValue(entry, col)))) return false;
        }
        return true;
      });
    }
    if (MT.sortCol) {
      const col = MT.sortCol === 'idx-col' ? 'idx-col' : parseInt(MT.sortCol, 10);
      const dir = MT.sortDir === 'desc' ? -1 : 1;
      entries.sort((a, b) => compareValues(getSortValue(a, col), getSortValue(b, col)) * dir);
    }
    return entries;
  }

  function renderExpandedTable() {
    const wrap = document.querySelector('#matt-imported-expanded .masttafel-table-wrap');
    if (!wrap) return;
    const entries = getFilteredSortedEntries();
    const customOrder = (MT.columnOrder && MT.columnOrder.length && !isNaturalOrder(MT.columnOrder)) ? MT.columnOrder : null;
    const theadInner = injectSelectColumn(customOrder ? buildFlattenedTheadInner(customOrder) : MT.theadHtml);
    const tbody = buildTbodyHtml(MT.showAllVersions, entries, customOrder);
    wrap.innerHTML = `<table class="masttafel-table">${theadInner ? '<thead>' + theadInner + '</thead>' : ''}<tbody>${tbody}</tbody></table>`;
    applyColumnVisibility();
    applyZoom();
    updateFrozenOffsets();
    augmentHeaderControls();
    updateFilterStatus();
    updateSelectAllCheckbox(entries);
    updateSelectionToolbar();
    // Every mutation that actually changes what's on screen (import, switch
    // Bauabschnitt, sort/filter/reorder columns, toggle "Alle Versionen")
    // ends up calling this render function, so it's the one reliable place
    // to persist - see saveMasttafelState() for what/how.
    saveMasttafelState();
  }

  function renderCompactPreview() {
    const wrap = document.querySelector('#matt-imported-compact .masttafel-table-wrap');
    if (!wrap) return;
    const tbody = buildTbodyHtml(false);
    wrap.innerHTML = `<table class="masttafel-table">${MT.theadHtml ? '<thead>' + MT.theadHtml + '</thead>' : ''}<tbody>${tbody}</tbody></table>`;
  }

  function applyColumnVisibility() {
    const table = document.querySelector('#matt-imported-expanded .masttafel-table');
    if (!table) return;
    table.querySelectorAll('[data-col]').forEach((cell) => {
      const raw = cell.getAttribute('data-col');
      const isIdx = raw === 'idx-col';
      const idx = isIdx ? null : parseInt(raw, 10);
      const hidden = MT.hiddenGroups.some((g) => (isIdx ? g.start === 'idx-col' : (g.start !== 'idx-col' && idx >= g.start && idx <= g.end)));
      cell.classList.toggle('col-hidden', hidden);
    });
  }

  function applyZoom() {
    const wrap = document.querySelector('#matt-imported-expanded .masttafel-table-wrap');
    if (!wrap) return;
    wrap.style.fontSize = (MT.zoom / 100 * 10.5).toFixed(2) + 'px';
    const label = document.getElementById('matt-zoom-label');
    if (label) label.textContent = MT.zoom + '%';
  }

  // True if a cell's raw data-col attribute ("idx-col" or a physical column
  // index as a string) falls inside a given group ({start,end}, where start/
  // end are either both 'idx-col' or both numbers).
  function colInGroup(raw, g) {
    if (g.start === 'idx-col') return raw === 'idx-col';
    if (raw === 'idx-col') return false;
    const idx = parseInt(raw, 10);
    return idx >= g.start && idx <= g.end;
  }

  function updateFrozenOffsets() {
    const table = document.querySelector('#matt-imported-expanded .masttafel-table');
    if (!table) return;
    // always-frozen key column (idx 0) plus any user-frozen groups, in
    // left-to-right order. 'idx-col' sorts as if it were column -1 so a
    // frozen Index (which defaults to the first position) still lines up
    // first, ahead of the physical columns.
    const sortKey = (g) => (g.start === 'idx-col' ? -1 : g.start);
    const groups = [{ start: 0, end: 0 }].concat(
      MT.frozenGroups.filter((g) => g.start !== 0).sort((a, b) => sortKey(a) - sortKey(b))
    );
    const firstRow = table.querySelector('tbody tr') || table.querySelector('thead tr');
    // The select-all/row checkboxes sit in their own always-frozen column
    // ahead of the key column - offset everything else by its actual
    // rendered width (varies with zoom) instead of assuming a fixed size.
    const selCell = firstRow ? firstRow.querySelector('.sel-col') : null;
    let offset = selCell ? selCell.getBoundingClientRect().width : 0;
    groups.forEach((g) => {
      const cell = firstRow ? firstRow.querySelector(`[data-col="${g.start}"]`) : null;
      const width = cell ? cell.getBoundingClientRect().width : 0;
      table.querySelectorAll(`[data-col]`).forEach((c) => {
        if (colInGroup(c.getAttribute('data-col'), g)) {
          c.classList.add('col-frozen');
          c.style.left = offset + 'px';
        }
      });
      offset += width;
    });
    // un-freeze anything no longer in a frozen group
    table.querySelectorAll('.col-frozen').forEach((c) => {
      const raw = c.getAttribute('data-col');
      const stillFrozen = groups.some((g) => colInGroup(raw, g));
      if (!stillFrozen) {
        c.classList.remove('col-frozen');
        c.style.left = '';
      }
    });
  }

  // ---------- sort / filter header controls ----------
  const SORT_ICON_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="7 10 12 5 17 10"/><polyline points="7 14 12 19 17 14"/></svg>';
  const FILTER_ICON_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="4 4 20 4 14 13 14 19 10 21 10 13 4 4"/></svg>';

  // Adds a small sort + filter control to every header cell after each render
  // (post-processed via the DOM, like applyColumnVisibility/updateFrozenOffsets
  // do, rather than baked into the theadHtml string).
  function augmentHeaderControls() {
    const table = document.querySelector('#matt-imported-expanded .masttafel-table');
    if (!table) return;
    // Only leaf header cells (the bottom-most row for a column) get sort/
    // filter controls - a group heading like "Mast" or "Maße" spanning
    // several columns above them doesn't need its own icons too.
    table.querySelectorAll('thead th[data-leaf]').forEach((th) => {
      const colKey = th.getAttribute('data-col');
      th.classList.remove('th-sorted', 'th-sort-asc', 'th-sort-desc', 'th-filtered');
      const controls = document.createElement('span');
      controls.className = 'th-controls';
      controls.innerHTML =
        `<span class="th-sort" data-sort-col="${colKey}" title="Sortieren">${SORT_ICON_SVG}</span>` +
        `<span class="th-filter" data-filter-col="${colKey}" title="Filtern">${FILTER_ICON_SVG}</span>`;
      th.appendChild(controls);
      if (MT.sortCol === colKey) {
        th.classList.add('th-sorted', MT.sortDir === 'desc' ? 'th-sort-desc' : 'th-sort-asc');
      }
      if (MT.filters.has(colKey)) th.classList.add('th-filtered');
    });
  }

  function updateFilterStatus() {
    const group = document.getElementById('matt-filter-group');
    const status = document.getElementById('matt-filter-status');
    if (!group || !status) return;
    if (MT.filters.size === 0) {
      group.hidden = true;
      return;
    }
    group.hidden = false;
    status.textContent = `${MT.filters.size} Spaltenfilter aktiv`;
  }

  // ---------- filter popover (a small anchored panel, not the big modal) ----------
  let filterPopoverEl = null;
  function closeFilterPopover() {
    if (filterPopoverEl) { filterPopoverEl.remove(); filterPopoverEl = null; }
  }

  // Excel-style "distinct values" filter, shown as a compact panel anchored
  // right under the clicked funnel icon - much lighter-weight than opening
  // the big centered modal for a single-column filter.
  function openColumnFilterPopover(colKey, anchorEl) {
    closeFilterPopover();
    const col = colKey === 'idx-col' ? 'idx-col' : parseInt(colKey, 10);
    const colLabel = colKey === 'idx-col' ? 'Index' : (MT.columns[col] ? MT.columns[col].label : 'Spalte');
    const seen = new Map();
    MT.rowsByKey.forEach((entry) => {
      const raw = getSortValue(entry, col);
      const norm = normalize(raw);
      if (!seen.has(norm)) seen.set(norm, raw && String(raw).trim() ? raw : '(leer)');
    });
    const distinct = [...seen.entries()].sort((a, b) => compareValues(a[1], b[1]));
    const active = MT.filters.get(colKey);

    const pop = document.createElement('div');
    pop.className = 'th-filter-popover';
    pop.innerHTML = `
      <div class="th-filter-popover-header">
        <span>${esc(colLabel)}</span>
        <span class="th-filter-popover-close" id="tf-close" title="Schließen">×</span>
      </div>
      <div class="th-filter-popover-search">
        <input type="text" id="tf-search" placeholder="Werte durchsuchen…">
      </div>
      <div class="th-filter-popover-actions">
        <button type="button" class="link-action" id="tf-all">Alle</button>
        <button type="button" class="link-action" id="tf-none">Keine</button>
      </div>
      <div class="th-filter-popover-list" id="tf-list">
        ${distinct.length ? distinct.map(([norm, disp]) => `
          <label class="th-filter-popover-row" data-search="${esc(disp.toLowerCase())}">
            <input type="checkbox" data-filter-val="${esc(norm)}" ${(!active || active.has(norm)) ? 'checked' : ''}>
            <span>${esc(disp)}</span>
          </label>`).join('') : '<div class="th-filter-popover-empty">Keine Werte vorhanden.</div>'}
      </div>
      <div class="th-filter-popover-footer">
        <button type="button" class="matt-tool-btn" id="tf-clear">Entfernen</button>
        <button type="button" class="btn-primary" id="tf-apply">Übernehmen</button>
      </div>`;
    document.body.appendChild(pop);
    filterPopoverEl = pop;

    // position under the icon, clamped so it never runs off-screen
    const rect = anchorEl.getBoundingClientRect();
    const popW = 230;
    let left = Math.min(rect.left, window.innerWidth - popW - 12);
    left = Math.max(8, left);
    let top = rect.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    if (top + 340 > window.innerHeight) {
      pop.style.top = Math.max(8, rect.top - 6) + 'px';
      pop.style.transform = 'translateY(-100%)';
    }

    const searchInput = pop.querySelector('#tf-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      pop.querySelectorAll('.th-filter-popover-row').forEach((row) => {
        row.style.display = row.getAttribute('data-search').includes(q) ? '' : 'none';
      });
    });
    pop.querySelector('#tf-all').addEventListener('click', () => {
      pop.querySelectorAll('.th-filter-popover-row:not([style*="display: none"]) [data-filter-val]').forEach((cb) => { cb.checked = true; });
    });
    pop.querySelector('#tf-none').addEventListener('click', () => {
      pop.querySelectorAll('.th-filter-popover-row:not([style*="display: none"]) [data-filter-val]').forEach((cb) => { cb.checked = false; });
    });
    pop.querySelector('#tf-close').addEventListener('click', closeFilterPopover);
    pop.querySelector('#tf-apply').addEventListener('click', () => {
      const checked = [...pop.querySelectorAll('[data-filter-val]')].filter((cb) => cb.checked).map((cb) => cb.getAttribute('data-filter-val'));
      if (checked.length === 0 || checked.length === distinct.length) {
        MT.filters.delete(colKey);
      } else {
        MT.filters.set(colKey, new Set(checked));
      }
      closeFilterPopover();
      renderExpandedTable();
    });
    pop.querySelector('#tf-clear').addEventListener('click', () => {
      MT.filters.delete(colKey);
      closeFilterPopover();
      renderExpandedTable();
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }

  // ---------- generic modal ----------
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  const modalBoxEl = document.getElementById('modal-box');
  // opts.wide: breiterer Modal-Dialog (derzeit nur für die PDF-Masttafel-
  // Vorschau, die deutlich mehr Spalten anzeigen muss als übliche Dialoge).
  function openModal(title, bodyHtml, footerHtml, opts) {
    if (!modalOverlay) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml || '';
    if (modalBoxEl) modalBoxEl.classList.toggle('modal-box-wide', !!(opts && opts.wide));
    modalOverlay.hidden = false;
  }
  function closeModal() {
    if (modalOverlay) modalOverlay.hidden = true;
  }
  const modalClose = document.getElementById('modal-close');
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ---------- column config panel ----------
  function openColumnConfig() {
    const natural = buildConfigGroups();
    MT.configGroups = natural;
    // Working copy of the current display order (custom if one is set and
    // still matches the current column set, otherwise natural/import order).
    let order = (MT.columnOrder && MT.columnOrder.length === natural.length)
      ? MT.columnOrder.map((g) => natural.find((n) => n.start === g.start && n.end === g.end) || g)
      : natural.slice();

    function rowsHtml() {
      return order.map((g, i) => {
        const hidden = MT.hiddenGroups.some((h) => h.start === g.start && h.end === g.end);
        const frozen = MT.frozenGroups.some((f) => f.start === g.start && f.end === g.end);
        return `<div class="col-config-row">
          <span class="col-move-group">
            <button type="button" class="col-move-btn" data-move="up" data-order-idx="${i}" title="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="col-move-btn" data-move="down" data-order-idx="${i}" title="Nach unten" ${i === order.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
          <label class="col-config-check">
            <input type="checkbox" data-cfg-visible="${i}" ${hidden ? '' : 'checked'}>
            ${esc(g.label)}
          </label>
          <label class="col-config-check muted">
            <input type="checkbox" data-cfg-frozen="${i}" ${frozen ? 'checked' : ''}>
            Fixieren
          </label>
        </div>`;
      }).join('');
    }

    const savedViews = getSavedViews();
    const viewsHtml = savedViews.length
      ? `<div class="col-config-views"><div class="subheading" style="margin-top:16px;">Gespeicherte Ansichten</div>${savedViews.map((v, i) =>
          `<div class="col-config-row"><span>${esc(v.name)}</span><span style="display:flex;gap:8px;">
            <button class="link-action" data-load-view="${i}">Laden</button>
            <button class="link-action" data-delete-view="${i}" style="color:var(--red);">Löschen</button>
          </span></div>`).join('')}</div>`
      : '';
    openModal(
      'Spalten konfigurieren',
      `<div class="col-config-hint">Mit den Pfeilen lässt sich die Reihenfolge der Spalten anpassen.</div>
       <div class="col-config-list" id="col-config-list">${rowsHtml()}</div>${viewsHtml}`,
      `<button class="btn-primary" id="cfg-save-view">Als Ansicht speichern</button>
       <button class="matt-tool-btn" id="cfg-reset">Zurücksetzen</button>
       <button class="matt-tool-btn" id="cfg-done">Fertig</button>`
    );

    function wireRows() {
      const list = document.getElementById('col-config-list');
      if (!list) return;
      list.querySelectorAll('[data-cfg-visible]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const g = order[parseInt(cb.dataset.cfgVisible, 10)];
          MT.hiddenGroups = MT.hiddenGroups.filter((h) => !(h.start === g.start && h.end === g.end));
          if (!cb.checked) MT.hiddenGroups.push(g);
          applyColumnVisibility();
          updateFrozenOffsets();
          saveMasttafelState();
        });
      });
      list.querySelectorAll('[data-cfg-frozen]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const g = order[parseInt(cb.dataset.cfgFrozen, 10)];
          MT.frozenGroups = MT.frozenGroups.filter((f) => !(f.start === g.start && f.end === g.end));
          if (cb.checked) MT.frozenGroups.push(g);
          updateFrozenOffsets();
          saveMasttafelState();
        });
      });
      list.querySelectorAll('[data-move]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.dataset.orderIdx, 10);
          const j = i + (btn.dataset.move === 'up' ? -1 : 1);
          if (j < 0 || j >= order.length) return;
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
          MT.columnOrder = order.slice();
          renderExpandedTable();
          list.innerHTML = rowsHtml();
          wireRows();
        });
      });
    }
    wireRows();

    modalBody.querySelectorAll('[data-load-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyView(savedViews[parseInt(btn.dataset.loadView, 10)]);
        closeModal();
      });
    });
    modalBody.querySelectorAll('[data-delete-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const views = getSavedViews();
        views.splice(parseInt(btn.dataset.deleteView, 10), 1);
        saveSavedViews(views);
        renderViewSwitcher();
        openColumnConfig();
      });
    });
    document.getElementById('cfg-save-view').addEventListener('click', () => {
      const name = prompt('Name für diese Ansicht:');
      if (!name) return;
      const views = getSavedViews();
      views.push({
        name,
        hiddenGroups: MT.hiddenGroups,
        frozenGroups: MT.frozenGroups,
        zoom: MT.zoom,
        columnOrder: MT.columnOrder,
        sortCol: MT.sortCol,
        sortDir: MT.sortDir,
        filters: [...MT.filters.entries()].map(([k, v]) => [k, [...v]]),
      });
      saveSavedViews(views);
      renderViewSwitcher();
      closeModal();
    });
    document.getElementById('cfg-reset').addEventListener('click', () => {
      MT.hiddenGroups = [];
      MT.frozenGroups = [];
      MT.zoom = 100;
      MT.columnOrder = null;
      MT.sortCol = null;
      MT.sortDir = 'asc';
      MT.filters = new Map();
      renderExpandedTable();
      const cur = document.getElementById('matt-view-current');
      if (cur) cur.textContent = 'Standardansicht';
      openColumnConfig();
    });
    document.getElementById('cfg-done').addEventListener('click', closeModal);
  }

  // ---------- saved views (localStorage) ----------
  const VIEWS_KEY = 'levelbuild_masttafel_views';
  migrateToProjectScopedKey(VIEWS_KEY);
  function getSavedViews() {
    try { return JSON.parse(localStorage.getItem(pKey(VIEWS_KEY)) || '[]'); } catch (e) { return []; }
  }
  function saveSavedViews(views) {
    try { localStorage.setItem(pKey(VIEWS_KEY), JSON.stringify(views)); } catch (e) { /* ignore */ }
  }
  function applyView(view) {
    MT.hiddenGroups = view.hiddenGroups || [];
    MT.frozenGroups = view.frozenGroups || [];
    MT.zoom = view.zoom || 100;
    MT.columnOrder = backfillIdxColOrder(view.columnOrder);
    MT.sortCol = view.sortCol || null;
    MT.sortDir = view.sortDir || 'asc';
    MT.filters = new Map((view.filters || []).map(([k, arr]) => [k, new Set(arr)]));
    // Order/sort/filter change which rows appear and the header structure
    // itself, not just CSS classes on an already-rendered table, so a full
    // re-render is needed here (it also re-applies zoom/visibility/freeze).
    renderExpandedTable();
    const cur = document.getElementById('matt-view-current');
    if (cur) cur.textContent = view.name;
  }
  function renderViewSwitcher() {
    const menu = document.getElementById('matt-view-menu');
    if (!menu) return;
    const views = getSavedViews();
    menu.innerHTML = `<div class="segment-menu-item active" data-view="__default">Standardansicht</div>` +
      views.map((v, i) => `<div class="segment-menu-item" data-view="${i}">${esc(v.name)}</div>`).join('');
    menu.querySelectorAll('.segment-menu-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.querySelectorAll('.segment-menu-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        const cur = document.getElementById('matt-view-current');
        if (item.dataset.view === '__default') {
          MT.hiddenGroups = []; MT.frozenGroups = []; MT.zoom = 100;
          MT.columnOrder = null; MT.sortCol = null; MT.sortDir = 'asc'; MT.filters = new Map();
          renderExpandedTable();
          if (cur) cur.textContent = 'Standardansicht';
        } else {
          applyView(views[parseInt(item.dataset.view, 10)]);
        }
        menu.setAttribute('hidden', '');
      });
    });
  }

  // ---------- Bauwerk (Standort) detail page ----------
  // Clicking a mast's key cell opens a dedicated page (mast-detail.html) -
  // richer and more legible than a modal for something with this much
  // versioned data. A full page navigation loses this page's in-memory MT
  // store, so the relevant data is handed off via sessionStorage first.
  // Findet heraus, zu welchem Bauabschnitt ein bestimmter Mast physisch
  // gehört - unabhängig davon, ob gerade genau dieser Bauabschnitt aktiv
  // ist, ein anderer, oder die zusammengeführte "Alle Bauabschnitte"-Ansicht
  // (die selbst keine Herkunft pro Zeile mitführt). Wird gebraucht, um eine
  // manuell erfasste Bauabweichung (siehe levelbuildAddManualMastVersion
  // weiter unten) an der richtigen Stelle in den echten, projekt-gescopten
  // Daten zu speichern, ganz gleich welche Ansicht der Nutzer gerade offen
  // hatte, als er den Mast angeklickt hat.
  function rowsByKeyOf(bauabschnittId) {
    if (bauabschnittId === MT.activeBauabschnittId) return MT.rowsByKey;
    const sec = MT.sections.get(bauabschnittId);
    return sec ? sec.rowsByKey : null;
  }
  function findBauabschnittIdForMastKey(mastKey) {
    for (const b of MT.bauabschnitte) {
      const rbk = rowsByKeyOf(b.id);
      if (rbk && rbk.has(mastKey)) return b.id;
    }
    return null;
  }

  function openMastDetailPage(key) {
    const normKey = normalize(key);
    const entry = MT.rowsByKey.get(normKey);
    if (!entry) return;
    const activeEntry = MT.bauabschnitte.find((b) => b.id === MT.activeBauabschnittId);
    const bauabschnittName = MT.activeBauabschnittId === '__all__'
      ? 'Alle Bauabschnitte'
      : (activeEntry ? activeEntry.name : '–');
    const bauabschnittId = MT.activeBauabschnittId === '__all__'
      ? findBauabschnittIdForMastKey(normKey)
      : MT.activeBauabschnittId;
    const payload = {
      key: entry.displayKey,
      mastKey: normKey,
      bauabschnittId,
      currentIndex: entry.currentIndex || null,
      columns: MT.columns,
      versions: entry.versions.map((v) => ({
        version: v.version, values: v.values, index: v.index || null, importedAt: v.importedAt,
        manualType: v.manualType || null, manualLabel: v.manualLabel || null,
        manualGrund: v.manualGrund || '', manualNachweise: v.manualNachweise || [],
      })),
      bauabschnittName,
      projectLabel: currentProjectLabel(),
    };
    try { sessionStorage.setItem('levelbuild_mast_detail', JSON.stringify(payload)); } catch (e) { /* ignore */ }
    if (window.levelbuildGo) window.levelbuildGo('mast-detail');
    else window.location.href = 'mast-detail.html';
  }

  // Legt für einen bestimmten Mast eine neue, manuell erfasste Version an -
  // für Bauabweichungen (Statik-Freigabe, Planänderung per E-Mail o. ä.), die
  // im Gegensatz zu einem normalen Masttafel-Reimport nicht aus einer Excel-
  // Datei kommen, sondern direkt auf der Mast-Detail-Seite eingetragen
  // werden (siehe die Mast-Detail-IIFE weiter unten). patch:
  // { valuesByIdx: {idx: neuerWert, ...}, manualGrund, manualNachweise }.
  // Schreibt direkt in die echten (aktiven ODER inaktiven) Bauabschnitts-
  // Daten, speichert sie, und aktualisiert außerdem das sessionStorage-
  // Handoff, damit die Mast-Detail-Seite die neue Version sofort sieht, ohne
  // dass die Masttafel dafür neu geladen werden müsste.
  window.levelbuildAddManualMastVersion = function (bauabschnittId, mastKey, patch) {
    const rbk = rowsByKeyOf(bauabschnittId);
    if (!rbk) return null;
    const entry = rbk.get(mastKey);
    if (!entry || !entry.versions.length) return null;
    const latest = entry.versions[entry.versions.length - 1];
    const newValues = latest.values.slice();
    Object.keys(patch.valuesByIdx || {}).forEach((idxStr) => {
      newValues[Number(idxStr)] = patch.valuesByIdx[idxStr];
    });
    const newVersion = {
      version: latest.version + 1,
      values: newValues,
      index: entry.currentIndex || latest.index || null, // Index bleibt bewusst unverändert
      importedAt: new Date().toISOString(),
      fileName: null,
      manualType: 'umplanung',
      manualLabel: 'Umplanung/Braunstrich',
      manualGrund: patch.manualGrund || '',
      manualNachweise: patch.manualNachweise || [],
    };
    entry.versions.push(newVersion);
    saveMasttafelState();
    if (bauabschnittId === MT.activeBauabschnittId || MT.activeBauabschnittId === '__all__') {
      renderExpandedTable();
      renderCompactPreview();
      updateChangesSummary();
    }
    // Sessionstorage-Handoff nur aktualisieren, wenn es tatsächlich noch
    // genau diesen Mast betrifft (Nutzer könnte inzwischen einen anderen
    // Mast geöffnet haben).
    try {
      const raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null');
      if (raw && raw.mastKey === mastKey) {
        raw.currentIndex = entry.currentIndex || null;
        raw.versions.push({
          version: newVersion.version, values: newVersion.values, index: newVersion.index, importedAt: newVersion.importedAt,
          manualType: newVersion.manualType, manualLabel: newVersion.manualLabel,
          manualGrund: newVersion.manualGrund, manualNachweise: newVersion.manualNachweise,
        });
        sessionStorage.setItem('levelbuild_mast_detail', JSON.stringify(raw));
      }
    } catch (e) { /* ignore */ }
    return newVersion;
  };

  // Event delegation: works for freshly re-rendered tables too
  document.addEventListener('click', (e) => {
    const cell = e.target.closest('.masttafel-table td.key-col[data-bauwerk]');
    if (cell) {
      e.stopPropagation();
      openMastDetailPage(cell.getAttribute('data-bauwerk'));
    }
  });

  // Row-selection checkboxes - delegated since rows are fully rebuilt on
  // every render. Checking a row's box selects that whole Bauwerk (syncing
  // any other rows sharing the same key, e.g. when "Alle Versionen anzeigen"
  // shows several rows per Standort); the select-all box mirrors whatever's
  // currently visible after filtering/sorting.
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-select-key]');
    if (cb) {
      const key = normalize(cb.getAttribute('data-select-key'));
      if (cb.checked) MT.selectedKeys.add(key); else MT.selectedKeys.delete(key);
      document.querySelectorAll('[data-select-key]').forEach((other) => {
        if (normalize(other.getAttribute('data-select-key')) === key) other.checked = cb.checked;
      });
      updateSelectAllCheckbox(getFilteredSortedEntries());
      updateSelectionToolbar();
      return;
    }
    const selectAll = e.target.closest('#matt-select-all');
    if (selectAll) {
      const entries = getFilteredSortedEntries();
      const keys = entries.map((en) => normalize(en.displayKey));
      if (selectAll.checked) keys.forEach((k) => MT.selectedKeys.add(k));
      else keys.forEach((k) => MT.selectedKeys.delete(k));
      document.querySelectorAll('[data-select-key]').forEach((cbEl) => {
        cbEl.checked = MT.selectedKeys.has(normalize(cbEl.getAttribute('data-select-key')));
      });
      updateSelectionToolbar();
    }
  });

  // Header sort/filter icons - also delegated, since the header is fully
  // rebuilt on every render (default order or flattened custom order alike).
  document.addEventListener('click', (e) => {
    const sortEl = e.target.closest('.th-sort');
    if (sortEl) {
      e.stopPropagation();
      closeFilterPopover();
      const colKey = sortEl.getAttribute('data-sort-col');
      if (MT.sortCol === colKey) {
        MT.sortDir = MT.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        MT.sortCol = colKey;
        MT.sortDir = 'asc';
      }
      renderExpandedTable();
      return;
    }
    const filterEl = e.target.closest('.th-filter');
    if (filterEl) {
      e.stopPropagation();
      openColumnFilterPopover(filterEl.getAttribute('data-filter-col'), filterEl);
      return;
    }
    // Any other click (outside the popover itself, which stops propagation)
    // closes an open filter popover.
    closeFilterPopover();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFilterPopover(); });

  // ---------- Änderungsbericht ----------
  function openChangeReport() {
    if (MT.changesLog.length === 0) {
      openModal('Änderungsbericht', '<div class="changelog-empty" style="padding:24px 0;">Noch keine Änderungen vorhanden.</div>', `<button class="matt-tool-btn" id="rep-close">Schließen</button>`);
      document.getElementById('rep-close').addEventListener('click', closeModal);
      return;
    }
    const rowsHtml = MT.changesLog.slice().reverse().map((c) => `
      <tr>
        <td class="key-col">${esc(c.key)}</td>
        <td>${esc(c.colLabel)}</td>
        <td>${c.oldVal ? esc(c.oldVal) : '–'}</td>
        <td>${c.newVal ? esc(c.newVal) : '–'}</td>
        <td>v${c.fromVersion} → v${c.toVersion}</td>
        <td>${c.fromIndex || c.toIndex ? `${c.fromIndex ? esc(c.fromIndex) : '–'} → ${c.toIndex ? esc(c.toIndex) : '–'}` : '–'}</td>
        <td>${esc(formatDateTime(new Date(c.importedAt)))}</td>
      </tr>`).join('');
    openModal(
      'Änderungsbericht',
      `<div class="masttafel-table-wrap" style="max-height:420px;">
        <table class="masttafel-table report-table">
          <thead><tr><th class="key-col">Bau-Nr.</th><th>Spalte</th><th>Alter Wert</th><th>Neuer Wert</th><th>Version</th><th>Index</th><th>Eingelesen am</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`,
      `<button class="btn-primary" id="rep-download-pdf">Als PDF herunterladen</button>
       <button class="matt-tool-btn" id="rep-download">Als Excel herunterladen</button>
       <button class="matt-tool-btn" id="rep-close">Schließen</button>`
    );
    document.getElementById('rep-close').addEventListener('click', closeModal);
    document.getElementById('rep-download').addEventListener('click', downloadChangeReport);
    document.getElementById('rep-download-pdf').addEventListener('click', downloadChangeReportPDF);
  }

  function downloadChangeReport() {
    const aoa = [['Bau-Nr.', 'Spalte', 'Alter Wert', 'Neuer Wert', 'Version', 'Index', 'Eingelesen am']];
    MT.changesLog.forEach((c) => {
      const idx = c.fromIndex || c.toIndex ? `${c.fromIndex || '-'} -> ${c.toIndex || '-'}` : '-';
      aoa.push([c.key, c.colLabel, c.oldVal, c.newVal, `v${c.fromVersion} -> v${c.toVersion}`, idx, formatDateTime(new Date(c.importedAt))]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Änderungsbericht');
    XLSX.writeFile(wb, 'Aenderungsbericht_Masttafel.xlsx');
  }

  // Builds the Änderungsbericht as a landscape PDF: one small table per
  // Bauwerk with real version history, styled like the live Masttafel
  // table - grouped two-level headers, the version shown right with the
  // Bauwerksnummer, Index as its own trailing column. Unlike the live
  // table though, each Bauwerk's table only includes the columns that
  // actually changed somewhere in its history, so it stays narrow and
  // readable instead of cramming in all ~30 spreadsheet columns.
  function downloadChangeReportPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Die PDF-Erstellung konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 28;
    const topMargin = 56;
    const blue = [47, 111, 237];
    const gray = [138, 148, 166];
    const grayLine = [228, 231, 236];
    const red = [224, 67, 43];
    const orange = [232, 98, 44];

    function drawHeader() {
      doc.setFillColor(blue[0], blue[1], blue[2]);
      doc.rect(0, 0, pageWidth, 42, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Änderungsbericht – Masttafel', marginX, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        `${currentProjectLabel()} · Erstellt am ${formatDateTime(new Date())}`,
        marginX, 32
      );
      doc.setTextColor(0, 0, 0);
    }

    function drawFooter(pageNum, pageCount) {
      doc.setDrawColor(grayLine[0], grayLine[1], grayLine[2]);
      doc.setLineWidth(0.75);
      doc.line(marginX, pageHeight - 22, pageWidth - marginX, pageHeight - 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text('levelbuild', marginX, pageHeight - 10);
      doc.text(`Seite ${pageNum} von ${pageCount}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    // A column's flattened label looks like "Mast – Höhenlage – Mast O.K.
    // über SO" (built while importing, from the merged Excel header). Split
    // it back into a group prefix and a leaf name so the report can rebuild
    // the same two-level grouped header the live table shows.
    function splitLabel(label) {
      const parts = String(label || '').split(' – ');
      if (parts.length <= 1) return { group: '', leaf: label || '' };
      return { group: parts.slice(0, -1).join(' – '), leaf: parts[parts.length - 1] };
    }

    // Builds a 2-row autoTable head (group row + leaf row) for the given
    // physical column indices, bookended by a rowSpan-2 "Bauwerk" column and
    // a rowSpan-2 "Index" column. Columns without a group prefix (single-
    // level labels) get a rowSpan-2 cell of their own instead of an empty
    // group cell above them.
    function buildGroupedHead(cols) {
      const row0 = [{ content: 'Bauwerk', rowSpan: 2, styles: { valign: 'middle' } }];
      const row1 = [];
      const meta = cols.map((i) => ({ idx: i, ...splitLabel(MT.columns[i] ? MT.columns[i].label : 'Spalte ' + (i + 1)) }));
      let k = 0;
      while (k < meta.length) {
        const cur = meta[k];
        if (!cur.group) {
          row0.push({ content: cur.leaf, rowSpan: 2, styles: { valign: 'middle' } });
          k++;
        } else {
          let span = 1;
          while (k + span < meta.length && meta[k + span].group === cur.group) span++;
          row0.push({ content: cur.group, colSpan: span });
          for (let j = 0; j < span; j++) row1.push({ content: meta[k + j].leaf });
          k += span;
        }
      }
      row0.push({ content: 'Index', rowSpan: 2, styles: { valign: 'middle' } });
      return [row0, row1];
    }

    // Only Bauwerke with real version history (i.e. where a change was
    // actually detected) are included - every one of their versions
    // becomes a row, oldest first.
    const changedEntries = [...MT.rowsByKey.values()].filter((e) => e.versions.length > 1);

    if (changedEntries.length === 0) {
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('Noch keine Änderungen vorhanden.', marginX, topMargin + 10);
      doc.save('Aenderungsbericht_Masttafel.pdf');
      return;
    }

    drawHeader();
    let y = topMargin;

    changedEntries.forEach((entry) => {
      const changedMap = computeChangedColsMap(entry.versions);
      // Union of every column that changed anywhere in this Bauwerk's
      // history - the only columns worth showing for it - with any columns
      // the user currently has hidden on screen left out too.
      const relevantSet = new Set();
      changedMap.forEach((set) => set.forEach((c) => relevantSet.add(c)));
      const relevantCols = [...relevantSet]
        .filter((i) => !MT.hiddenGroups.some((h) => i >= h.start && i <= h.end))
        .sort((a, b) => a - b);
      if (relevantCols.length === 0) return;

      const latestVersion = entry.versions[entry.versions.length - 1].version;
      const body = [];
      const rowMeta = [];
      entry.versions.forEach((v) => {
        const isLatest = v.version === latestVersion;
        const rowIndexVal = isLatest ? entry.currentIndex : v.index;
        body.push([
          `${entry.displayKey}\nv${v.version}${isLatest ? ' (aktuell)' : ''}`,
          ...relevantCols.map((i) => (v.values[i] != null && v.values[i] !== '' ? v.values[i] : '–')),
          rowIndexVal || '–',
        ]);
        rowMeta.push({ isLatest, changedCols: changedMap.get(v.version) });
      });

      // Keep a Bauwerk's block from starting right at the bottom edge - if
      // there isn't room for a heading plus a couple of rows, start fresh.
      if (y > pageHeight - 130) { doc.addPage(); drawHeader(); y = topMargin; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(gray[0], gray[1], gray[2]);
      doc.text(`Bauwerk ${entry.displayKey}`, marginX, y);
      doc.setTextColor(0, 0, 0);

      const lastCol = relevantCols.length + 1;
      doc.autoTable({
        startY: y + 6,
        margin: { top: topMargin, left: marginX, right: marginX, bottom: 26 },
        head: buildGroupedHead(relevantCols),
        body,
        styles: { fontSize: 7.5, cellPadding: 4, textColor: [30, 33, 38], lineColor: grayLine, lineWidth: 0.4, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [242, 244, 247], textColor: [60, 66, 75], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 90, halign: 'left' },
          [lastCol]: { cellWidth: 34, halign: 'center' },
        },
        theme: 'grid',
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const meta = rowMeta[data.row.index];
          if (!meta) return;
          if (data.column.index === 0) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = meta.isLatest ? blue : gray;
            return;
          }
          if (data.column.index === lastCol) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = orange;
            return;
          }
          const physIdx = data.column.index - 1;
          const isChanged = meta.changedCols && meta.changedCols.has(relevantCols[physIdx]);
          if (isChanged) {
            data.cell.styles.textColor = red;
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [253, 236, 234];
          } else if (!meta.isLatest) {
            data.cell.styles.textColor = gray;
          }
        },
        didDrawPage: () => { drawHeader(); },
      });

      y = doc.lastAutoTable.finalY + 22;
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      drawFooter(p, pageCount);
    }

    doc.save('Aenderungsbericht_Masttafel.pdf');
  }

  // ---------- file list (with real re-download + delete) ----------
  function renderFileList() {
    const list = document.getElementById('matt-file-list');
    if (!list) return;
    // In the merged "Alle Bauabschnitte anzeigen" view, files are tagged with
    // sectionName and are a read-only snapshot (never written back to
    // MT.sections) - deleting from there wouldn't map to any real section, so
    // the delete button is hidden for those rows.
    list.innerHTML = MT.files.map((f) => `
      <div class="file-row">
        <span class="file-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        </span>
        <div class="file-meta">
          <span class="file-name">${esc(f.name)}${f.sectionName ? ' <span class="file-section-tag">' + esc(f.sectionName) + '</span>' : ''}</span>
          <span class="file-sub">Eingelesen am ${formatDate(new Date(f.importedAt))}${f.index ? ' · Index ' + esc(f.index) : ''} · Wajih Tfaili</span>
        </div>
        <a class="icon-btn" title="Herunterladen" href="${f.url}" download="${esc(f.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
        </a>
        ${f.sectionName ? '' : `
        <button class="icon-btn" title="Datei entfernen" data-delete-file="${esc(f.id)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>`}
      </div>`).join('');
    list.querySelectorAll('[data-delete-file]').forEach((btn) => {
      btn.addEventListener('click', () => deleteFile(btn.getAttribute('data-delete-file')));
    });
  }

  function deleteFile(id) {
    if (!id) return;
    const f = MT.files.find((x) => x.id === id);
    if (!f) return;
    if (!confirm(`"${f.name}" aus der Dateiliste entfernen? Bereits eingelesene Mastdaten aus dieser Datei bleiben in der Masttafel erhalten.`)) return;
    MT.files = MT.files.filter((x) => x.id !== id);
    renderFileList();
    saveMasttafelState();
  }

  function updateChangesSummary() {
    const el = document.getElementById('matt-changes-summary');
    const reportBtn = document.getElementById('matt-open-report');
    const reportBtn2 = document.getElementById('matt-open-report-2');
    if (reportBtn) reportBtn.disabled = MT.changesLog.length === 0;
    if (reportBtn2) reportBtn2.disabled = MT.changesLog.length === 0;
    if (!el) return;
    if (MT.changesLog.length === 0) {
      el.innerHTML = '<div class="changelog-empty">Noch keine Änderungen vorhanden</div>';
      return;
    }
    const changedKeyCount = new Set(MT.changesLog.map((c) => c.key)).size;
    el.innerHTML = `<div class="changelog-summary">${changedKeyCount} Bauwerk${changedKeyCount === 1 ? '' : 'e'} mit neuer Version · ${MT.changesLog.length} geänderte Werte</div>`;
  }

  // ---------- import flow ----------
  function runImport(file, indexLetter) {
    if (!file) return;
    // Import always applies to exactly one Bauabschnitt - not reachable
    // through the UI while it's disabled, but guard here too.
    if (!MT.activeBauabschnittId || MT.activeBauabschnittId === '__all__') {
      alert('Bitte zuerst einen Bauabschnitt auswählen, bevor Daten importiert werden.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseWorkbookSheet(ws);
        if (!parsed) throw new Error('empty sheet');
        const importedAt = new Date().toISOString();
        const summary = importIntoStore(parsed, { name: file.name, importedAt, index: indexLetter || null });

        // A data: URL (rather than a blob: URL from URL.createObjectURL) so the
        // re-download link is a plain string - it survives being persisted to
        // localStorage and read back on a later page load, whereas a blob URL
        // only stays valid for this one in-memory session.
        const mimeType = file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const fileId = 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        MT.files.push({ id: fileId, name: file.name, importedAt, index: indexLetter || null, url: 'data:' + mimeType + ';base64,' + uint8ToBase64(data) });

        updateImportedVisibility();
        renderExpandedTable();
        renderCompactPreview();
        renderFileList();
        updateChangesSummary();
        // War bislang vergessen: ohne diesen Aufruf blieb ein frisch
        // eingelesener Excel-Import nur im Arbeitsspeicher dieser
        // Seitenansicht - beim nächsten Seitenwechsel (oder Neuladen) war er
        // wieder weg, solange nicht zufällig noch eine andere Aktion (Zoom,
        // Datei löschen, ...) eine Speicherung ausgelöst hat.
        saveMasttafelState();

        const msg = summary.changedKeys > 0
          ? `${file.name}: ${summary.newKeys} neu, ${summary.changedKeys} mit Änderungen (neue Version), ${summary.unchangedKeys} unverändert.`
          : `${file.name}: ${summary.newKeys} neu, ${summary.unchangedKeys} unverändert – keine Änderungen erkannt.`;
        console.log(msg);
      } catch (err) {
        console.error('Masttafel-Import fehlgeschlagen:', err);
        alert('Diese Datei konnte nicht gelesen werden. Bitte eine gültige Excel-Datei (.xlsx/.xls) auswählen.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Wird als Fortschrittsanzeige während des (bei OCR ggf. länger
  // dauernden) PDF-Einlesens verwendet - ein einfaches Modal ohne
  // Aktions-Buttons.
  function openProgressModal(title, text) {
    openModal(title, `<div class="import-progress" id="pdf-import-progress">${esc(text)}</div>`, '');
  }

  async function runPdfImport(file, indexLetter) {
    if (!file) return;
    if (!MT.activeBauabschnittId || MT.activeBauabschnittId === '__all__') {
      alert('Bitte zuerst einen Bauabschnitt auswählen, bevor Daten importiert werden.');
      return;
    }
    openProgressModal('Masttafel wird gelesen …', 'PDF wird geöffnet …');
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parsePdfFile(buf, (p, n) => {
        const el = document.getElementById('pdf-import-progress');
        if (el) el.textContent = `Seite ${p} von ${n} wird gelesen${p === n ? ' – OCR kann bei gescannten Seiten etwas dauern …' : ' …'}`;
      });
      closeModal();
      openPdfReviewModal(parsed, file, new Uint8Array(buf), indexLetter);
    } catch (err) {
      console.error('PDF-Masttafel-Import fehlgeschlagen:', err);
      closeModal();
      alert('Diese PDF-Datei konnte nicht automatisch eingelesen werden: ' + (err && err.message ? err.message : err));
    }
  }

  // Zeigt eine editierbare Vorschau der aus der PDF erkannten Zeilen, bevor
  // wirklich importiert wird - Text-Extraktion aus Vektor-PDFs und vor allem
  // OCR auf gescannten Seiten kann im Einzelfall danebenliegen (z. B. bei
  // schlechter Scanqualität oder ungewöhnlichen Zeichen), daher hier die
  // Möglichkeit, einzelne Zellen vor dem Übernehmen noch zu korrigieren,
  // statt sich blind auf die automatische Erkennung zu verlassen.
  function openPdfReviewModal(parsed, file, bytes, indexLetter) {
    const warnHtml = parsed.warnings && parsed.warnings.length
      ? `<div class="import-warnings">${parsed.warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join('')}</div>` : '';
    const sourceNote = parsed.usedOcr
      ? '<div class="import-ocr-note">Mindestens eine Seite dieser Datei hatte keinen Text-Layer und wurde per OCR (Texterkennung auf dem gescannten Seitenbild) gelesen. Bitte die Werte unten sorgfältig prüfen, bevor importiert wird - OCR kann bei schlechter Scanqualität einzelne Zeichen falsch erkennen.</div>'
      : '<div class="import-ocr-note">Der Text wurde direkt aus der PDF-Datei extrahiert und automatisch den Spalten zugeordnet. Bitte kurz prüfen, bevor importiert wird.</div>';
    const theadRow = '<tr>' + parsed.columns.map((c) => `<th>${esc(c.label)}</th>`).join('') + '</tr>';
    const rowsHtml = parsed.rows.map((row, r) => `<tr>${row.values.map((v, c) => `<td><input data-r="${r}" data-c="${c}" value="${esc(v)}"></td>`).join('')}</tr>`).join('');
    openModal(
      `Masttafel-Vorschau: ${esc(file.name)}`,
      `<div class="pdf-review">
        ${sourceNote}
        ${warnHtml}
        <div class="pdf-review-meta">${parsed.rows.length} Zeile${parsed.rows.length === 1 ? '' : 'n'} erkannt · ${parsed.columns.length} Spalten · erste Spalte = Bau-Nr./Betriebs-Nr.</div>
        <div class="pdf-review-table-wrap"><table class="pdf-review-table"><thead>${theadRow}</thead><tbody>${rowsHtml}</tbody></table></div>
      </div>`,
      `<button class="btn-primary" id="pdf-import-confirm">Übernehmen &amp; importieren</button>
       <button class="matt-tool-btn" id="pdf-import-cancel">Abbrechen</button>`,
      { wide: true }
    );
    const cancelBtn = document.getElementById('pdf-import-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    const confirmBtn = document.getElementById('pdf-import-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      document.querySelectorAll('.pdf-review-table input[data-r]').forEach((inp) => {
        const r = Number(inp.getAttribute('data-r'));
        const c = Number(inp.getAttribute('data-c'));
        if (parsed.rows[r]) parsed.rows[r].values[c] = inp.value;
      });
      closeModal();
      commitPdfImport(parsed, file, bytes, indexLetter);
    });
  }

  function commitPdfImport(parsed, file, bytes, indexLetter) {
    const importedAt = new Date().toISOString();
    const summary = importIntoStore({ columns: parsed.columns, theadHtml: parsed.theadHtml, rows: parsed.rows }, { name: file.name, importedAt, index: indexLetter || null });
    const mimeType = file.type || 'application/pdf';
    const fileId = 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    MT.files.push({ id: fileId, name: file.name, importedAt, index: indexLetter || null, url: 'data:' + mimeType + ';base64,' + uint8ToBase64(bytes) });

    updateImportedVisibility();
    renderExpandedTable();
    renderCompactPreview();
    renderFileList();
    updateChangesSummary();
    saveMasttafelState();

    const msg = summary.changedKeys > 0
      ? `${file.name}: ${summary.newKeys} neu, ${summary.changedKeys} mit Änderungen (neue Version), ${summary.unchangedKeys} unverändert.`
      : `${file.name}: ${summary.newKeys} neu, ${summary.unchangedKeys} unverändert – keine Änderungen erkannt.`;
    console.log(msg);
  }

  // Entscheidet anhand der Dateiendung, welcher der beiden Einlese-Wege
  // (Excel via SheetJS, PDF via pdf.js/OCR) verwendet wird.
  function dispatchImport(file, indexLetter) {
    if (/\.pdf$/i.test(file.name)) runPdfImport(file, indexLetter);
    else runImport(file, indexLetter);
  }

  // Asks (optionally) for the Index / Bearbeitungsstand of this Masttafel-Datei
  // - a construction-drawing revision letter (e.g. "A", "B") - before the file
  // is actually read and imported. Left blank, the previous known Index for
  // this Masttafel simply carries over unchanged.
  function promptForIndexAndImport(file) {
    openModal(
      'Masttafel importieren',
      `<div class="import-prompt">
        <div class="import-prompt-file">
          <span class="file-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </span>
          <span>${esc(file.name)}</span>
        </div>
        <div class="field">
          <label>Index (Bearbeitungsstand), falls vorhanden</label>
          <div class="input-wrap">
            <input type="text" id="import-index-input" maxlength="4" placeholder="z. B. A">
          </div>
        </div>
      </div>`,
      `<button class="btn-primary" id="import-confirm">Importieren</button>
       <button class="matt-tool-btn" id="import-cancel">Abbrechen</button>`
    );
    const input = document.getElementById('import-index-input');
    const doImport = () => {
      const idx = input ? input.value.trim().toUpperCase() : '';
      closeModal();
      dispatchImport(file, idx || null);
    };
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doImport(); });
    }
    document.getElementById('import-cancel').addEventListener('click', closeModal);
    document.getElementById('import-confirm').addEventListener('click', doImport);
  }

  document.querySelectorAll('[data-import-trigger]').forEach((zone) => {
    zone.addEventListener('click', (e) => {
      e.preventDefault();
      if (zone.classList.contains('dropzone-disabled')) return;
      fileInput.value = '';
      fileInput.click();
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (zone.classList.contains('dropzone-disabled')) return;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) promptForIndexAndImport(file);
    });
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) promptForIndexAndImport(file);
  });

  // ---------- toolbar wiring ----------
  const zoomIn = document.getElementById('matt-zoom-in');
  const zoomOut = document.getElementById('matt-zoom-out');
  if (zoomIn) zoomIn.addEventListener('click', () => { MT.zoom = Math.min(200, MT.zoom + 10); applyZoom(); updateFrozenOffsets(); saveMasttafelState(); });
  if (zoomOut) zoomOut.addEventListener('click', () => { MT.zoom = Math.max(50, MT.zoom - 10); applyZoom(); updateFrozenOffsets(); saveMasttafelState(); });

  const openColumnsBtn = document.getElementById('matt-open-columns');
  if (openColumnsBtn) openColumnsBtn.addEventListener('click', openColumnConfig);

  const allVersionsSwitch = document.getElementById('matt-allversions-switch');
  if (allVersionsSwitch) {
    allVersionsSwitch.addEventListener('click', () => {
      MT.showAllVersions = !MT.showAllVersions;
      allVersionsSwitch.classList.toggle('on', MT.showAllVersions);
      renderExpandedTable();
    });
  }

  const reportBtn = document.getElementById('matt-open-report');
  const reportBtn2 = document.getElementById('matt-open-report-2');
  if (reportBtn) reportBtn.addEventListener('click', openChangeReport);
  if (reportBtn2) reportBtn2.addEventListener('click', openChangeReport);

  const clearFiltersBtn = document.getElementById('matt-clear-filters');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      MT.filters = new Map();
      renderExpandedTable();
    });
  }

  const deleteSelectedBtn = document.getElementById('matt-delete-selected');
  if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedBauwerke);

  renderViewSwitcher();

  // Bauabschnitte: load the list (created/named in Projekteinstellungen) and
  // restore whichever Bauabschnitt (or "Alle") was active before - along
  // with all previously imported data and view/sort/filter/zoom state -
  // from localStorage, so switching to another tab and back (e.g. Formular)
  // no longer wipes the Masttafel. Falls back to the first Bauabschnitt if
  // nothing was saved yet, or if the previously active one was since deleted.
  // Pulled out into its own function (instead of just running inline once)
  // because this whole merged-file app only ever executes its top-level
  // script once - loadMasttafelState()/loadBauabschnitte() are project-
  // scoped (see pKey() in app.js), so if the user opens a *different*
  // project after this page has already loaded once, MT.sections would
  // otherwise keep showing whichever project happened to be current at
  // that first load, even though the correct data was actually saved under
  // that other project's own key. loadForCurrentProject() is what makes a
  // project switch (see levelbuildOnShowUebersicht below) actually pick that
  // up instead of silently continuing to show the previous project's data.
  function loadForCurrentProject() {
    MT.bauabschnitte = loadBauabschnitte();
    const restoredId = loadMasttafelState();
    const restoredIdStillValid = restoredId && (restoredId === '__all__' || MT.bauabschnitte.some((b) => b.id === restoredId));
    MT.activeBauabschnittId = restoredIdStillValid ? restoredId : (MT.bauabschnitte.length ? MT.bauabschnitte[0].id : null);
    applySection(
      MT.activeBauabschnittId === '__all__' ? buildAllSectionsView()
        : (MT.activeBauabschnittId ? (MT.sections.get(MT.activeBauabschnittId) || emptySection()) : emptySection())
    );
    renderBauabschnittSwitchers();
    updateImportAvailability();
    updateImportedVisibility();
    renderExpandedTable();
    renderCompactPreview();
    renderFileList();
    updateChangesSummary();
  }
  loadForCurrentProject();
  let lastLoadedProjectId = currentProjectId();

  // Exposed for the single-page-app shell (see the router script at the end
  // of the merged HTML file). This script now only ever runs once (there's
  // no more per-page reload to re-sync things), so anything that could go
  // stale while the user was on a different page - the Bauabschnitte list
  // (may have changed via Projekteinstellungen), a switch to a whole
  // *different* project (see loadForCurrentProject() above), and the
  // expanded table's sticky column offsets (measured as 0 while this page
  // was display:none) - needs an explicit refresh hook, called every time
  // the router navigates back to Übersicht (and, for the offsets, when
  // expanding the Masttafel).
  window.levelbuildOnShowUebersicht = function () {
    if (currentProjectId() !== lastLoadedProjectId) {
      // A different project was opened since the last time this page was
      // shown - MT.sections etc. still hold the previous project's data in
      // memory, so a full reload (not just the lighter Bauabschnitte-list
      // refresh below) is required.
      lastLoadedProjectId = currentProjectId();
      loadForCurrentProject();
      updateFrozenOffsets();
      return;
    }
    const freshList = loadBauabschnitte();
    MT.bauabschnitte = freshList;
    const stillValid = MT.activeBauabschnittId === '__all__' || freshList.some((b) => b.id === MT.activeBauabschnittId);
    if (!stillValid) {
      switchBauabschnitt(freshList.length ? freshList[0].id : null);
    } else {
      renderBauabschnittSwitchers();
      updateImportAvailability();
    }
    updateFrozenOffsets();
  };
})();

// ======================================================================
// Mast-Detail (Standort): reads the data handed off by openMastDetailPage()
// in the Masttafel above via sessionStorage, and renders the Mastdaten
// panel - Index, an interactive version-history chip row, and the full set
// of imported fields, with changed-vs-previous-version fields highlighted.
// Only runs on mast-detail.html (guarded by the #md-mastdaten-body element).
// ======================================================================
(function () {
  const body = document.getElementById('md-mastdaten-body');
  if (!body) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function normalize(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }

  // The flattened label (e.g. "Mast – Höhenlage – Mast O.K. über SO – m")
  // ends in the Excel's own "units" header row (m, mm x mm, St., ...) - that
  // row already reads fine as part of the Masttafel table's header, but is
  // just noise once a field already has a name and a value here, so drop it.
  function stripUnitSuffix(label) {
    const parts = String(label || '').split(' – ');
    if (parts.length <= 1) return label || '';
    const last = parts[parts.length - 1].trim();
    const isUnit = /^(mm|cm|dm|km|m|kg|g|t|°|%|st\.?|stk\.?)(\s?x\s?(mm|cm|m))?\.?$/i.test(last);
    return isUnit ? parts.slice(0, -1).join(' – ') : label;
  }

  // A single Excel header cell merged across several physical columns (e.g.
  // "Bemerkungen" spanning 5 columns) otherwise ends up as the same label
  // repeated once per column here, almost all of them blank. Group any run
  // of consecutive columns sharing an identical label into one field.
  function groupColumns(columns) {
    const groups = [];
    (columns || []).forEach((col, i) => {
      const last = groups[groups.length - 1];
      if (last && last.label === col.label) {
        last.idxs.push(i);
      } else {
        groups.push({ label: col.label, idxs: [i] });
      }
    });
    return groups;
  }

  let raw = null;
  let versions = null;
  let latestVersion = null;
  let selected = null;

  function fmtDateTime(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '–';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function nachweisLinksHtml(nachweise) {
    if (!nachweise || !nachweise.length) return '';
    return `<div class="nachweis-list">${nachweise.map((n, i) =>
      `<a class="nachweis-chip" href="${n.dataUrl}" download="${esc(n.name || ('Nachweis-' + (i + 1)))}" title="${esc(n.name || '')}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${esc(n.name || 'Nachweis')}
      </a>`).join('')}</div>`;
  }

  function render() {
    if (!raw) return;
    const v = versions.find((x) => x.version === selected);
    const prev = versions.find((x) => x.version === selected - 1);
    const isLatest = selected === latestVersion;
    const rowIndex = isLatest ? raw.currentIndex : v.index;
    const isManual = v.manualType === 'umplanung';

    const crumbKey = document.getElementById('md-crumb-key');
    if (crumbKey) crumbKey.textContent = `${raw.key} - ${selected}`;
    document.title = `${raw.key} - ${selected} · levelbuild`;

    const indexHero = rowIndex
      ? `<div class="mast-index-hero"><span class="mast-index-hero-label">Aktueller Bearbeitungsstand</span><span class="mast-index-hero-value">Index ${esc(rowIndex)}</span></div>`
      : '';

    const chips = versions.map((x) =>
      `<span class="ver-chip${x.version === selected ? ' active' : ''}${x.manualType === 'umplanung' ? ' ver-chip-manual' : ''}" data-goto-version="${x.version}">v${x.version}${x.version === latestVersion ? ' (aktuell)' : ''}${x.manualType === 'umplanung' ? ' · Umplanung/Braunstrich' : ''}</span>`
    ).join('');

    const manualInfo = isManual
      ? `<div class="manual-version-box">
          <div class="manual-version-badge">Umplanung/Braunstrich</div>
          <div class="manual-version-meta">Erfasst am ${esc(fmtDateTime(v.importedAt))}</div>
          ${v.manualGrund ? `<div class="manual-version-grund">${esc(v.manualGrund)}</div>` : ''}
          ${nachweisLinksHtml(v.manualNachweise)}
        </div>`
      : '';

    const fields = groupColumns(raw.columns).map((g) => {
      // Prefer the first non-empty cell among the merged columns - Excel
      // only ever stores the real value in the top-left one anyway.
      let val = '';
      for (const i of g.idxs) {
        const cand = v.values[i];
        if (cand != null && String(cand).trim() !== '') { val = cand; break; }
      }
      const changed = !!prev && g.idxs.some((i) => normalize(prev.values[i]) !== normalize(v.values[i]));
      const label = stripUnitSuffix(g.label);
      // Longer free-text fields (like "Bemerkungen") get more breathing
      // room as a full-width note instead of a cramped two-column stat.
      const isNote = String(val).length > 28;
      return `<div class="stat${changed ? ' stat-changed' : ''}${isNote ? ' stat-note' : ''}">
        <span class="stat-label">${esc(label)}</span>
        <span class="stat-value${val ? '' : ' empty'}">${val ? esc(val) : '–'}</span>
      </div>`;
    }).join('');

    body.innerHTML = `
      ${indexHero}
      <div class="stat-row">
        <div class="stat"><span class="stat-label">Mastnummer</span><span class="stat-value">${esc(raw.key)}</span></div>
        <div class="stat"><span class="stat-label">Version</span><span class="stat-value">v${selected}${isLatest ? ' (aktuell)' : ''}</span></div>
      </div>
      ${versions.length > 1 ? `<div class="ver-chip-row">${chips}</div>` : ''}
      ${manualInfo}
      <div class="hr"></div>
      <div class="bauwerk-fields">${fields}</div>
    `;
    body.querySelectorAll('[data-goto-version]').forEach((chip) => {
      chip.addEventListener('click', () => {
        selected = parseInt(chip.getAttribute('data-goto-version'), 10);
        render();
      });
    });
  }

  // Liste vergangener Bauabweichungen (nur die manuell erfassten Versionen)
  // im rechten Seitenpanel - unabhängig davon, welche Version gerade in
  // der Mastdaten-Karte ausgewählt ist.
  function renderBauabweichungList() {
    const listEl = document.getElementById('md-bauabweichung-list');
    const countEl = document.getElementById('md-bauabweichung-count');
    if (!listEl) return;
    const manualVersions = raw ? versions.filter((x) => x.manualType === 'umplanung') : [];
    if (countEl) countEl.textContent = String(manualVersions.length);
    if (!manualVersions.length) {
      listEl.innerHTML = raw ? '<div class="changelog-empty">Noch keine Bauabweichung für diesen Mast erfasst.</div>' : '';
      return;
    }
    listEl.innerHTML = manualVersions.slice().reverse().map((v) => `
      <div class="col-config-row" style="align-items:flex-start; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between; width:100%; gap:8px;">
          <span class="badge-mini">v${v.version} · Umplanung</span>
          <span style="font-size:11px; color:var(--gray-500);">${esc(fmtDateTime(v.importedAt))}</span>
        </div>
        ${v.manualGrund ? `<div style="font-size:12px; color:var(--text);">${esc(v.manualGrund)}</div>` : ''}
        ${nachweisLinksHtml(v.manualNachweise)}
      </div>`).join('');
  }

  // ---------- Bauabweichung erfassen (Modal) ----------
  let pendingNachweise = [];

  function bauabweichungFieldRows() {
    const latest = versions[versions.length - 1];
    return groupColumns(raw.columns).map((g, gi) => {
      let val = '';
      for (const i of g.idxs) {
        const cand = latest.values[i];
        if (cand != null && String(cand).trim() !== '') { val = cand; break; }
      }
      const label = stripUnitSuffix(g.label);
      return `<div class="field" style="margin-bottom:8px;">
        <label>${esc(label)}</label>
        <div class="input-wrap"><input type="text" data-ba-field-group="${gi}" value="${esc(val)}"></div>
      </div>`;
    }).join('');
  }

  function renderNachweisList() {
    const el = document.getElementById('ba-nachweis-list');
    if (!el) return;
    el.innerHTML = pendingNachweise.map((n, i) => `
      <span class="nachweis-chip" data-nachweis-remove="${i}" title="${esc(n.name)}" style="cursor:pointer;">
        ${esc(n.name)} <span style="opacity:.6;">✕</span>
      </span>`).join('');
    el.querySelectorAll('[data-nachweis-remove]').forEach((chip) => {
      chip.addEventListener('click', () => {
        pendingNachweise.splice(parseInt(chip.getAttribute('data-nachweis-remove'), 10), 1);
        renderNachweisList();
      });
    });
  }

  function openBauabweichungModal() {
    if (!raw || !raw.bauabschnittId) {
      alert('Dieser Mast konnte keinem Bauabschnitt eindeutig zugeordnet werden - Bauabweichung kann nicht erfasst werden.');
      return;
    }
    pendingNachweise = [];
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    if (!modalOverlay) return;

    modalTitle.textContent = `Bauabweichung erfassen · Mast ${raw.key}`;
    modalBody.innerHTML = `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:10px;">
        Für Änderungen durch Statik-Freigabe, E-Mail o. ä. Erzeugt eine neue Version (v${versions[versions.length - 1].version + 1}) dieses Masts mit dem Vermerk „Umplanung/Braunstrich". Der Index (Bearbeitungsstand) bleibt dabei unverändert.
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Grund / Beschreibung der Bauabweichung <span style="color:var(--red);">*</span></label>
        <div class="input-wrap"><textarea id="ba-grund" rows="3" placeholder="z. B. Statik hat Auflagerpunkt angepasst, siehe E-Mail vom ..."></textarea></div>
      </div>
      <div class="hr"></div>
      <div class="subheading" style="margin-bottom:6px;">Masttafel-Werte (bei Bedarf anpassen)</div>
      <div id="ba-field-rows">${bauabweichungFieldRows()}</div>
      <div class="hr"></div>
      <div class="field">
        <label>Nachweis (E-Mail, Statik-PDF, o. ä.)</label>
        <div class="input-wrap" style="display:flex; gap:8px;">
          <button type="button" class="matt-tool-btn" id="ba-nachweis-add">Datei hinzufügen</button>
          <input type="file" id="ba-nachweis-input" style="display:none;">
        </div>
        <div id="ba-nachweis-list" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;"></div>
      </div>
    `;
    modalFooter.innerHTML = `
      <button class="btn-primary" id="ba-save">Bauabweichung speichern</button>
      <button class="matt-tool-btn" id="ba-cancel">Abbrechen</button>
    `;
    modalOverlay.hidden = false;
    renderNachweisList();

    const fileBtn = document.getElementById('ba-nachweis-add');
    const fileInput = document.getElementById('ba-nachweis-input');
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          pendingNachweise.push({ name: file.name, dataUrl: reader.result });
          renderNachweisList();
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    }

    document.getElementById('ba-cancel').addEventListener('click', () => { modalOverlay.hidden = true; });
    document.getElementById('ba-save').addEventListener('click', () => {
      const grundEl = document.getElementById('ba-grund');
      const grund = grundEl ? grundEl.value.trim() : '';
      if (!grund) {
        alert('Bitte einen Grund für die Bauabweichung angeben.');
        return;
      }
      if (!confirm('Wirklich eine neue Version mit dem Vermerk "Umplanung/Braunstrich" für diesen Mast anlegen? Dies lässt sich nicht rückgängig machen.')) {
        return;
      }
      const groups = groupColumns(raw.columns);
      const valuesByIdx = {};
      document.querySelectorAll('[data-ba-field-group]').forEach((input) => {
        const gi = parseInt(input.getAttribute('data-ba-field-group'), 10);
        const group = groups[gi];
        if (!group) return;
        // Denselben neuen Wert auf alle zusammengeführten Spalten dieser
        // Gruppe schreiben (z. B. "Bemerkungen" über mehrere Spalten hinweg),
        // damit spätere Versions-Diffs konsistent bleiben.
        group.idxs.forEach((idx) => { valuesByIdx[idx] = input.value; });
      });
      const result = window.levelbuildAddManualMastVersion(raw.bauabschnittId, raw.mastKey, {
        valuesByIdx, manualGrund: grund, manualNachweise: pendingNachweise,
      });
      modalOverlay.hidden = true;
      if (!result) {
        alert('Bauabweichung konnte nicht gespeichert werden - Mast wurde in den Daten nicht gefunden.');
        return;
      }
      openFromSession();
    });
  }

  const addBtn = document.getElementById('md-bauabweichung-add');
  if (addBtn) addBtn.addEventListener('click', openBauabweichungModal);

  // Re-reads sessionStorage (written by openMastDetailPage() in the
  // Masttafel above, right before navigating here) and renders. In the
  // single-page-app shell this script only runs once at initial load - when
  // sessionStorage very likely has nothing in it yet, since the user hasn't
  // clicked a Standort - so this is exposed as window.levelbuildMastDetailRender
  // and called again by the router every time it switches to this page.
  function openFromSession() {
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    if (!raw || !raw.versions || !raw.versions.length) {
      raw = null;
      body.innerHTML = '<div class="changelog-empty">Diese Seite wurde nicht über die Masttafel geöffnet - keine Mast-Daten vorhanden.</div>';
      if (addBtn) addBtn.disabled = true;
      renderBauabweichungList();
      return;
    }
    const projektEl = document.getElementById('md-projekt');
    if (projektEl) projektEl.textContent = raw.projectLabel || '–';
    const baEl = document.getElementById('md-bauabschnitt');
    if (baEl) baEl.textContent = raw.bauabschnittName || '–';
    versions = raw.versions;
    latestVersion = versions[versions.length - 1].version;
    selected = latestVersion;
    if (addBtn) addBtn.disabled = false;
    render();
    renderBauabweichungList();
  }

  window.levelbuildMastDetailRender = openFromSession;
  openFromSession();
})();

// ======================================================================
// Mast-Detail: Tätigkeitsliste zuordnen - welche (projekt-)Tätigkeitsliste
// für diesen einen Mast gilt, plus ein informativer Blick auf ihre
// Aufgaben und deren aktuellen Abhaken-Status. Das eigentliche Abhaken und
// Protokolle ausfüllen passiert in der separaten Handy-App (handyapp.html);
// hier auf der Desktop-Seite lässt sich die Zuordnung setzen und der Stand
// einsehen. Only runs on mast-detail.html (guarded by #md-tl-select).
// ======================================================================
(function () {
  const selectEl = document.getElementById('md-tl-select');
  if (!selectEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function normalize(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }
  // Uses the same normalized form as MT.rowsByKey's own keys (and thus what
  // the Handy-App looks the Mast up under too) - displayKey is only the
  // original, cosmetically-formatted text.
  function currentMastKey() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? normalize(raw.key) : null;
  }
  // Cosmetically-formatted Anzeige-Label (nicht normalisiert) - genutzt für
  // den "Alle Dokumente dieses Masts"-Sprung zur Dokumente-Seite, damit dort
  // dieselbe Schreibweise wie in der Mastmaske selbst vorbefüllt wird.
  function currentMastLabel() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? String(raw.key || '') : '';
  }

  function render() {
    const mastKey = currentMastKey();
    const tasksEl = document.getElementById('md-tl-tasks');
    const countEl = document.getElementById('md-taetigkeiten-count');
    if (!mastKey) {
      selectEl.disabled = true;
      selectEl.innerHTML = '<option value="">–</option>';
      if (tasksEl) tasksEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      return;
    }
    selectEl.disabled = false;
    const lists = loadTlProjectList();
    const assignments = loadMastTlAssignments();
    const currentId = assignments[mastKey] || '';
    selectEl.innerHTML = '<option value="">Keine zugeordnet</option>' +
      lists.map((l) => `<option value="${esc(l.id)}"${l.id === currentId ? ' selected' : ''}>${esc(l.name)} (${l.tasks.length})</option>`).join('');
    const list = lists.find((l) => l.id === currentId);
    if (countEl) countEl.textContent = list ? String(list.tasks.length) : '0';
    if (tasksEl) {
      if (!list) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diesem Mast ist noch keine Tätigkeitsliste zugeordnet - danach lassen sich Aufgaben und Protokolle in der Handy-App für genau diesen Mast bearbeiten.</div>';
      } else if (!list.tasks.length) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diese Tätigkeitsliste hat noch keine Aufgaben.</div>';
      } else {
        const statusMap = loadMastTaskStatus()[mastKey] || {};
        tasksEl.innerHTML = list.tasks.map((t) => {
          const statusId = statusMap[t.id] || (list.statusOptions[0] && list.statusOptions[0].id);
          const status = list.statusOptions.find((s) => s.id === statusId) || list.statusOptions[0];
          return `<div class="col-config-row">
            <span>${t.nr != null ? esc(String(t.nr)) + '. ' : ''}${esc(t.titel || '(ohne Titel)')}</span>
            ${status ? `<span class="badge-mini" style="background:${esc(status.color)}22; color:${esc(status.color)};">${esc(status.icon || '')} ${esc(status.label)}</span>` : ''}
          </div>`;
        }).join('');
      }
    }
  }

  selectEl.addEventListener('change', () => {
    const mastKey = currentMastKey();
    if (!mastKey) return;
    const assignments = loadMastTlAssignments();
    if (selectEl.value) assignments[mastKey] = selectEl.value;
    else delete assignments[mastKey];
    saveMastTlAssignments(assignments);
    render();
  });

  // ----------------------------------------------------------------------
  // "Datensätze": zeigt die in der Handy-App über die Tätigkeitsliste
  // ausgefüllten und gespeicherten Protokolle für genau diesen Mast an -
  // rein lesend, gruppiert je Protokoll-Instanz. Quelle: loadMastProtokollDaten()
  // (Form: { [mastKey]: { [protokollId]: { [bausteinId]: wert } } }), die
  // Baustein-Definitionen (Label/Typ/Spalten) kommen aus loadProtokollProjectList().
  // ----------------------------------------------------------------------
  function formatBausteinValueHtml(b, val) {
    if (b.type === 'checkbox') {
      return val === true ? 'Ja' : (val === false ? 'Nein' : null);
    }
    if (b.type === 'auswahl' && b.mehrfachauswahl) {
      const arr = Array.isArray(val) ? val.filter(Boolean) : [];
      return arr.length ? esc(arr.join(', ')) : null;
    }
    if (b.type === 'unterschrift') {
      return val ? `<img src="${val}" alt="Unterschrift" style="max-width:170px; max-height:64px; border:1px solid var(--gray-200); border-radius:6px; background:#fff;">` : null;
    }
    if (b.type === 'foto') {
      const arr = Array.isArray(val) ? val.filter(Boolean) : (val ? [val] : []);
      if (!arr.length) return null;
      return `<div style="display:flex; gap:6px; flex-wrap:wrap;">${arr.map((src) => `<img src="${esc(src)}" style="width:56px; height:56px; object-fit:cover; border-radius:6px; border:1px solid var(--gray-200);">`).join('')}</div>`;
    }
    if (b.type === 'tabelle') {
      if (!Array.isArray(val) || !val.length) return null;
      const cols = (b.columns && b.columns.length ? b.columns : ['Spalte 1', 'Spalte 2']).slice(0, 3);
      return `<table style="width:100%; border-collapse:collapse; font-size:11.5px;">
        <thead><tr>${cols.map((c) => `<th style="text-align:left; border-bottom:1px solid var(--gray-200); padding:3px 6px;">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${val.map((r) => `<tr>${cols.map((c, i) => `<td style="padding:3px 6px; border-bottom:1px solid var(--gray-100);">${esc((r && r[i]) || '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    }
    if (val === '' || val == null) return null;
    return esc(String(val));
  }

  function renderDatensaetze(mastKey) {
    const listEl = document.getElementById('md-datensaetze-list');
    const countEl = document.getElementById('md-datensaetze-count');
    if (!listEl) return;
    if (!mastKey) {
      listEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      return;
    }
    const allDaten = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
    const forMast = allDaten[mastKey] || {};
    const protokolle = (typeof loadProtokollProjectList === 'function') ? loadProtokollProjectList() : [];
    // Gespeichert wird je Tätigkeit (taskId), nicht je Vorlage (protokollId) -
    // siehe Kommentar bei loadMastProtokollDaten(): mehrere Tätigkeiten können
    // dieselbe Vorlage nutzen und brauchen trotzdem je einen eigenen
    // Datensatz. Für die Anzeige wird zusätzlich der Tätigkeitstitel
    // aufgelöst, damit z.B. zwei "Fotodokumentation"-Datensätze zu
    // verschiedenen Arbeitsschritten unterscheidbar bleiben.
    const entries = Object.keys(forMast).map((taskId) => {
      const entry = forMast[taskId] || {};
      const protokollId = entry.protokollId;
      const protokoll = protokolle.find((p) => p.id === protokollId);
      const answers = entry.answers || {};
      const hasAny = Object.keys(answers).some((k) => {
        const v = answers[k];
        return v !== '' && v != null && !(Array.isArray(v) && v.length === 0);
      });
      const taskInfo = findTaetigkeitById(taskId);
      return { taskId, protokollId, protokoll, answers, hasAny, taskTitel: taskInfo ? taskInfo.titel : null };
    }).filter((e) => e.hasAny);

    if (countEl) countEl.textContent = String(entries.length);
    if (!entries.length) {
      listEl.innerHTML = '<div class="changelog-empty">Für diesen Mast wurden noch keine Protokoll-Daten aus der Handy-App gespeichert.</div>';
      return;
    }
    // Kompakte Darstellung: jeder Datensatz ist nur eine Kopfzeile
    // "<Protokollname> Datensatz" - die eigentlichen Felder werden erst
    // beim Aufklappen (Klick auf die Kopfzeile) gerendert/sichtbar.
    listEl.innerHTML = entries.map((e, i) => {
      const name = e.protokoll ? e.protokoll.name : '(gelöschtes Protokoll)';
      // Tätigkeitstitel anhängen, sobald ermittelbar - wichtig, sobald
      // dieselbe Vorlage bei mehreren Tätigkeiten hinterlegt ist (sonst
      // sähen mehrere Karten hier identisch aus, obwohl sie zu
      // unterschiedlichen Arbeitsschritten gehören).
      const headerLabel = e.taskTitel ? `${name} – ${e.taskTitel}` : name;
      let fieldsHtml = '<div class="changelog-empty">Vorlage wurde gelöscht - Rohdaten nicht mehr zuordenbar.</div>';
      if (e.protokoll) {
        fieldsHtml = e.protokoll.bausteine
          .filter((b) => b.type !== 'abschnitt')
          .map((b) => {
            const html = formatBausteinValueHtml(b, e.answers[b.id]);
            if (html == null) return '';
            return `<div class="ds-field"><div class="ds-field-label">${esc(b.label || '')}</div><div class="ds-field-value">${html}</div></div>`;
          })
          .join('');
        if (!fieldsHtml) fieldsHtml = '<div class="changelog-empty">Keine ausgefüllten Felder.</div>';
      }
      // Bereits erzeugte offizielle PDF-Dokumente zu genau diesem Mast +
      // Protokoll anzeigen (siehe generateProtokollPdf / "PDF-Protokoll
      // erstellen" im Bautagebuch) - das ist die in der Mastmaske
      // gewünschte Verlinkung zu den Dokumenten.
      // Dokumente werden seit ihrer Einführung mit d.taskId gespeichert
      // (siehe addDokument() im PDF-Erstellen-Handler) - für ältere
      // Dokumente ohne taskId (vor dieser Umstellung erzeugt) wird auf den
      // reinen Vorlagen-Abgleich zurückgefallen, damit sie nicht plötzlich
      // aus der Anzeige verschwinden.
      const docsForEntry = (typeof loadDokumente === 'function') ? loadDokumente().filter((d) => d.mastKey === mastKey && (d.taskId ? d.taskId === e.taskId : d.protokollId === e.protokollId)) : [];
      let docsHtml = '';
      if (docsForEntry.length) {
        docsHtml = `<div class="ds-docs">
          <div class="ds-docs-title">Erstellte PDF-Dokumente</div>
          ${docsForEntry.map((d) => `<div class="ds-doc-row"><span>${esc(d.betreff || 'Dokument')}</span><button type="button" class="link-action" data-ds-doc-download="${esc(d.id)}">Herunterladen</button></div>`).join('')}
        </div>`;
      }
      return `<div class="ds-card">
        <div class="ds-card-header" data-ds-toggle="${i}">
          <span>${esc(headerLabel)} Datensatz</span>
          <svg class="ds-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="ds-card-body" id="ds-card-body-${i}" hidden>${fieldsHtml}${docsHtml}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-ds-toggle]').forEach((header) => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        if (!body) return;
        const willOpen = body.hasAttribute('hidden');
        if (willOpen) body.removeAttribute('hidden');
        else body.setAttribute('hidden', '');
        header.classList.toggle('ds-card-header-open', willOpen);
      });
    });
    listEl.querySelectorAll('[data-ds-doc-download]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doc = (typeof loadDokumente === 'function' ? loadDokumente() : []).find((d) => d.id === btn.getAttribute('data-ds-doc-download'));
        if (!doc) return;
        try {
          const a = document.createElement('a');
          a.href = doc.pdfBase64;
          a.download = (doc.betreff || 'Protokoll').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err) { /* unkritisch, z. B. in Testumgebungen ohne echte Download-Navigation */ }
      });
    });
    // "Alle Dokumente dieses Masts" springt zur Dokumente-Seite und trägt
    // den Standort-Namen dort einmalig als Betreff/Mast-Filter vor (siehe
    // DOK_PREFILL_MAST_KEY, gelesen von der Dokumente-Seiten-IIFE weiter
    // unten - ein einmaliger sessionStorage-Wert, kein dauerhafter Zustand).
    const allDocsBtn = document.getElementById('md-docs-alle-link');
    if (allDocsBtn) {
      const anyDocs = entries.some((e) => (typeof loadDokumente === 'function' ? loadDokumente() : []).some((d) => d.mastKey === mastKey && d.protokollId === e.protokollId));
      allDocsBtn.hidden = !anyDocs;
      allDocsBtn.onclick = () => {
        try { sessionStorage.setItem('levelbuild_dok_prefill_mast', currentMastLabel()); } catch (err) { /* ignore */ }
        if (window.levelbuildGo) window.levelbuildGo('dokumente');
      };
    }
  }

  // Chain onto the existing render hook (rather than overwrite it) so both
  // the Mastdaten panel above and this Tätigkeitsliste panel stay in sync
  // every time the router shows this page for a (possibly different) Mast.
  const prevRender = window.levelbuildMastDetailRender;
  window.levelbuildMastDetailRender = function () {
    if (prevRender) prevRender();
    render();
    renderDatensaetze(currentMastKey());
  };
  render();
  renderDatensaetze(currentMastKey());
})();

// ======================================================================
// Bautagebücher: Liste. Only runs on the Bautagebuch-Liste page (guarded
// by #btl-list).
// ======================================================================
(function () {
  const listEl = document.getElementById('btl-list');
  if (!listEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatum(iso) {
    if (!iso) return '–';
    const parts = String(iso).split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
  }
  function statusBadgeHtml(status) {
    const map = {
      offen: { label: 'Offen', bg: 'var(--yellow)', color: '#6b5300' },
      abgeschlossen: { label: 'Abgeschlossen', bg: '#c9f2d8', color: '#136b3a' },
    };
    const s = map[status] || map.offen;
    return `<span class="badge-mini" style="background:${s.bg}; color:${s.color};">${esc(s.label)}</span>`;
  }

  function openBautagebuch(id) {
    try { sessionStorage.setItem('levelbuild_bautagebuch_detail', JSON.stringify({ id })); } catch (e) { /* ignore */ }
    window.levelbuildGo('bautagebuch-detail');
  }

  function render() {
    const reports = loadBautagebuecher().slice().sort((a, b) => {
      return String(b.datum || '').localeCompare(String(a.datum || '')) || ((b.nummer || 0) - (a.nummer || 0));
    });
    const countEl = document.getElementById('btl-count');
    if (countEl) countEl.textContent = String(reports.length);
    if (!reports.length) {
      listEl.innerHTML = '<div class="changelog-empty">Noch keine Bautagebücher für dieses Projekt vorhanden - über „Neues Bautagebuch" oben rechts anlegen.</div>';
      return;
    }
    listEl.innerHTML = `<table class="bt-list-table">
      <thead><tr><th>Nr.</th><th>Datum</th><th>Gewerk</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${reports.map((r) => `<tr data-open-bt="${esc(r.id)}">
          <td>${esc(r.nummer)}</td>
          <td>${esc(fmtDatum(r.datum))}</td>
          <td>${esc(r.trade || '–')}</td>
          <td>${statusBadgeHtml(r.status)}</td>
          <td class="bt-list-row-actions">
            <span class="icon-btn" data-delete-bt="${esc(r.id)}" title="Löschen">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
    listEl.querySelectorAll('[data-open-bt]').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-bt]')) return;
        openBautagebuch(tr.getAttribute('data-open-bt'));
      });
    });
    listEl.querySelectorAll('[data-delete-bt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Dieses Bautagebuch wirklich löschen?')) return;
        const id = btn.getAttribute('data-delete-bt');
        saveBautagebuecher(loadBautagebuecher().filter((r) => r.id !== id));
        render();
      });
    });
  }

  const addBtn = document.getElementById('btl-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const reports = loadBautagebuecher();
      const report = makeBautagebuchEintrag({ nummer: nextBautagebuchNummer(reports) });
      reports.push(report);
      saveBautagebuecher(reports);
      openBautagebuch(report.id);
    });
  }

  const projektCrumb = document.getElementById('btl-crumb-projekt');
  if (projektCrumb) projektCrumb.textContent = currentProjectLabel();

  window.levelbuildOnShowBautagebuchListe = function () {
    const pc = document.getElementById('btl-crumb-projekt');
    if (pc) pc.textContent = currentProjectLabel();
    render();
  };
  render();
})();

// ======================================================================
// Bautagebuch-Detail: das einzelne Bautagebuch mit seinen vier Unter-
// ansichten (Bautagesbericht, Druckbericht, Daten aus letztem Tagebuch
// übernehmen, Stammdaten). Only runs on the Bautagebuch-Detail page
// (guarded by #btd-tab-bautagesbericht).
// ======================================================================
(function () {
  const rootEl = document.getElementById('btd-tab-bautagesbericht');
  if (!rootEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatum(iso) {
    if (!iso) return '–';
    const parts = String(iso).split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
  }

  // ---------- aktuelles Bautagebuch lesen/schreiben ----------
  function currentReportId() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_bautagebuch_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? raw.id : null;
  }
  function currentReport() {
    const id = currentReportId();
    if (!id) return null;
    return loadBautagebuecher().find((r) => r.id === id) || null;
  }
  // Lädt die Liste, findet den aktuellen Bericht, lässt `mutator` ihn direkt
  // verändern, speichert die ganze Liste wieder und rendert neu.
  function updateReport(mutator) {
    const id = currentReportId();
    if (!id) return;
    const list = loadBautagebuecher();
    const report = list.find((r) => r.id === id);
    if (!report) return;
    mutator(report);
    saveBautagebuecher(list);
    renderAll();
  }

  // ---------- kleiner, lokaler Modal-Helfer (teilt sich die eine globale
  // #modal-overlay mit den anderen Seiten-IIFEs) ----------
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');
  function openModal(title, bodyHtml, footerHtml) {
    if (!modalOverlay) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml || '';
    modalOverlay.hidden = false;
  }
  function closeModal() {
    if (modalOverlay) modalOverlay.hidden = true;
  }
  const modalCloseBtn = document.getElementById('modal-close');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  function fieldHtml(id, label, type, value, extra) {
    if (type === 'checkbox') {
      return `<label class="field" style="flex-direction:row; align-items:center; gap:8px;">
        <input type="checkbox" id="${id}" ${value ? 'checked' : ''} style="width:auto;">
        <span>${esc(label)}</span>
      </label>`;
    }
    return `<div class="field">
      <label>${esc(label)}</label>
      <div class="input-wrap"><input type="${type || 'text'}" id="${id}" value="${esc(value == null ? '' : value)}" ${extra || ''}></div>
    </div>`;
  }

  // ---------- Tab-Umschaltung (lokal, keine Seiten-Navigation) ----------
  function showBtdTab(name) {
    document.querySelectorAll('#page-bautagebuch-detail .btd-tabpanel').forEach((p) => {
      p.classList.toggle('active', p.id === 'btd-tab-' + name);
    });
    document.querySelectorAll('#page-bautagebuch-detail .sidebar [data-btd-tab]').forEach((li) => {
      li.classList.toggle('active', li.getAttribute('data-btd-tab') === name);
    });
    if (name === 'druckbericht') renderDruckbericht();
    if (name === 'uebernehmen') renderUebernehmen();
    if (name === 'stammdaten') renderStammdaten();
  }
  document.querySelectorAll('#page-bautagebuch-detail .sidebar [data-btd-tab]').forEach((li) => {
    li.addEventListener('click', () => showBtdTab(li.getAttribute('data-btd-tab')));
  });

  // Collapsible Panels (Chevron im panel-header) - generisch für alle
  // Panels dieser Seite.
  document.querySelectorAll('#page-bautagebuch-detail [data-panel-toggle]').forEach((chev) => {
    chev.addEventListener('click', () => {
      const panel = chev.closest('.panel');
      if (panel) panel.classList.toggle('collapsed');
    });
  });

  // ---------- Header/Subbar ----------
  function renderHeader() {
    const r = currentReport();
    const crumbEl = document.getElementById('btd-crumb');
    if (!r) {
      if (crumbEl) crumbEl.textContent = 'Bautagebuch';
      return;
    }
    if (crumbEl) crumbEl.textContent = `Bautagebuch ${r.nummer != null ? '#' + r.nummer : ''}`.trim();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('btd-meta-projekt', currentProjectLabel());
    set('btd-meta-nummer', r.nummer != null ? String(r.nummer) : '–');
    set('btd-meta-datum', fmtDatum(r.datum));
    set('btd-meta-trade', r.trade || '–');
    const statusMap = { offen: { label: 'Offen', cls: '' }, abgeschlossen: { label: 'Abgeschlossen', cls: 'bt-status-done' } };
    const s = statusMap[r.status] || statusMap.offen;
    set('btd-status-label', s.label);
    const pill = document.getElementById('btd-status-pill');
    if (pill) pill.classList.toggle('bt-status-done', r.status === 'abgeschlossen');
  }

  const statusPill = document.getElementById('btd-status-pill');
  const statusMenu = document.getElementById('btd-status-menu');
  if (statusPill && statusMenu) {
    statusPill.addEventListener('click', (e) => {
      e.stopPropagation();
      statusMenu.hidden = !statusMenu.hidden;
    });
    statusMenu.querySelectorAll('[data-set-status]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const status = item.getAttribute('data-set-status');
        statusMenu.hidden = true;
        updateReport((r) => { r.status = status; });
      });
    });
    document.addEventListener('click', () => { statusMenu.hidden = true; });
  }

  // ---------- Wetter ----------
  function renderWetter() {
    const r = currentReport();
    const cardsEl = document.getElementById('btd-wetter-cards');
    const countEl = document.getElementById('btd-wetter-count');
    if (!r || !cardsEl) return;
    const entries = (r.wetter || []).slice().sort((a, b) => String(a.uhrzeit || '').localeCompare(String(b.uhrzeit || '')));
    if (countEl) countEl.textContent = String(entries.length);
    if (!entries.length) {
      cardsEl.innerHTML = '<div class="changelog-empty">Noch keine Wetter-Einträge.</div>';
      return;
    }
    cardsEl.innerHTML = entries.map((w) => `
      <div class="bt-weather-card" data-edit-wetter="${esc(w.id)}">
        <div class="bt-weather-card-top">
          <span class="bt-weather-time">${esc(w.uhrzeit || '–')} Uhr</span>
          <span class="icon-btn" data-delete-wetter="${esc(w.id)}" title="Löschen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </span>
        </div>
        <div class="bt-weather-temp">${w.temperaturC != null && w.temperaturC !== '' ? esc(w.temperaturC) + ' °C' : '–'} ${esc(w.bedingung || '')}</div>
        <div class="bt-weather-niederschlag">${w.niederschlagMm != null && w.niederschlagMm !== '' ? esc(w.niederschlagMm) : '0,00'} mm</div>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="badge-mini bt-druckrelevant-badge${w.druckrelevant ? ' bt-druckrelevant-on' : ''}" data-toggle-druckrelevant="${esc(w.id)}">${w.druckrelevant ? 'Druckrelevant' : 'Nicht druckrelevant'}</span>
          ${w.quelle === 'auto' ? '<span class="badge-mini" title="Automatisch für dieses Datum abgerufen" style="background:var(--blue-light); color:var(--blue);">Automatisch</span>' : ''}
        </div>
      </div>`).join('');

    cardsEl.querySelectorAll('[data-toggle-druckrelevant]').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = badge.getAttribute('data-toggle-druckrelevant');
        updateReport((r2) => {
          const w = (r2.wetter || []).find((x) => x.id === id);
          if (w) w.druckrelevant = !w.druckrelevant;
        });
      });
    });
    cardsEl.querySelectorAll('[data-delete-wetter]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Diesen Wetter-Eintrag löschen?')) return;
        const id = btn.getAttribute('data-delete-wetter');
        updateReport((r2) => { r2.wetter = (r2.wetter || []).filter((w) => w.id !== id); });
      });
    });
    cardsEl.querySelectorAll('[data-edit-wetter]').forEach((card) => {
      card.addEventListener('click', () => openWetterModal(card.getAttribute('data-edit-wetter')));
    });
  }
  function openWetterModal(id) {
    const r = currentReport();
    if (!r) return;
    const w = id ? (r.wetter || []).find((x) => x.id === id) : { uhrzeit: '', temperaturC: '', bedingung: '', niederschlagMm: '', druckrelevant: false };
    if (!w) return;
    openModal(id ? 'Wetter-Eintrag bearbeiten' : 'Wetter-Eintrag hinzufügen', `
      ${fieldHtml('wm-uhrzeit', 'Uhrzeit', 'time', w.uhrzeit)}
      ${fieldHtml('wm-temp', 'Temperatur (°C)', 'number', w.temperaturC)}
      ${fieldHtml('wm-bedingung', 'Bedingung (z. B. Sonnig, Bewölkt, Regen)', 'text', w.bedingung)}
      ${fieldHtml('wm-niederschlag', 'Niederschlag (mm)', 'number', w.niederschlagMm, 'step="0.1"')}
      ${fieldHtml('wm-druckrelevant', 'Druckrelevant', 'checkbox', w.druckrelevant)}
    `, `<button class="btn-primary" id="wm-save">Speichern</button>`);
    document.getElementById('wm-save').addEventListener('click', () => {
      // Sobald ein Eintrag von Hand angelegt/geändert wurde, gilt er als
      // "manuell" - ein automatischer Wetter-Refresh überschreibt ihn dann
      // nicht mehr (siehe autoFetchWetterIfNeeded, das nur quelle:'auto'
      // Einträge ersetzt).
      const data = {
        uhrzeit: document.getElementById('wm-uhrzeit').value,
        temperaturC: document.getElementById('wm-temp').value,
        bedingung: document.getElementById('wm-bedingung').value.trim(),
        niederschlagMm: document.getElementById('wm-niederschlag').value,
        druckrelevant: document.getElementById('wm-druckrelevant').checked,
        quelle: 'manuell',
      };
      updateReport((r2) => {
        if (!r2.wetter) r2.wetter = [];
        if (id) {
          Object.assign(r2.wetter.find((x) => x.id === id), data);
        } else {
          r2.wetter.push(Object.assign({ id: makeMastDataId('wtr') }, data));
        }
      });
      closeModal();
    });
  }
  const wetterAddBtn = document.getElementById('btd-wetter-add');
  if (wetterAddBtn) wetterAddBtn.addEventListener('click', (e) => { e.stopPropagation(); openWetterModal(null); });
  const wetterRefreshBtn = document.getElementById('btd-wetter-refresh');
  if (wetterRefreshBtn) wetterRefreshBtn.addEventListener('click', (e) => { e.stopPropagation(); autoFetchWetterIfNeeded(true); });

  // Holt für das aktuelle Datum automatisch Wetterdaten (Open-Meteo) und
  // ersetzt damit alle bisherigen quelle:'auto'-Einträge - manuell
  // angelegte/bearbeitete Einträge bleiben unangetastet. Ohne `force` wird
  // nur geholt, wenn noch GAR keine Wetter-Einträge vorhanden sind (z. B.
  // frisch angelegtes Bautagebuch).
  let wetterFetchToken = 0;
  async function autoFetchWetterIfNeeded(force) {
    const r = currentReport();
    if (!r) return;
    if (!force && (r.wetter || []).length) return;
    const myToken = ++wetterFetchToken;
    const cardsEl = document.getElementById('btd-wetter-cards');
    if (cardsEl) cardsEl.innerHTML = '<div class="changelog-empty">Wetterdaten für dieses Datum werden geladen…</div>';
    try {
      const fetched = await fetchWetterFuerDatum(r.datum);
      if (myToken !== wetterFetchToken) return; // Datum wurde inzwischen erneut geändert
      updateReport((r2) => {
        const manual = (r2.wetter || []).filter((w) => w.quelle !== 'auto');
        r2.wetter = fetched.concat(manual);
      });
    } catch (e) {
      if (myToken !== wetterFetchToken) return;
      if (cardsEl) cardsEl.innerHTML = '<div class="changelog-empty">Wetterdaten konnten nicht automatisch geladen werden (keine Internetverbindung oder Wetterdienst nicht erreichbar). Bitte ggf. manuell über „+" ergänzen, oder über das Aktualisieren-Symbol erneut versuchen.</div>';
    }
  }

  // ---------- Arbeitszeit ----------
  function renderArbeitszeit() {
    const r = currentReport();
    const el = document.getElementById('btd-arbeitszeit-value');
    if (!r || !el) return;
    const az = r.arbeitszeit || {};
    el.textContent = (az.von || az.bis) ? `${az.von || '–'} Uhr - ${az.bis || '–'} Uhr` : '–';
  }
  const arbeitszeitEditBtn = document.getElementById('btd-arbeitszeit-edit');
  if (arbeitszeitEditBtn) {
    arbeitszeitEditBtn.addEventListener('click', () => {
      const r = currentReport();
      if (!r) return;
      const az = r.arbeitszeit || {};
      openModal('Arbeitszeit bearbeiten', `
        ${fieldHtml('az-von', 'Von', 'time', az.von)}
        ${fieldHtml('az-bis', 'Bis', 'time', az.bis)}
      `, `<button class="btn-primary" id="az-save">Speichern</button>`);
      document.getElementById('az-save').addEventListener('click', () => {
        const von = document.getElementById('az-von').value;
        const bis = document.getElementById('az-bis').value;
        updateReport((r2) => { r2.arbeitszeit = { von, bis }; });
        closeModal();
      });
    });
  }

  // ---------- Anwesend (Personaleinsatz) / Geräte (Geräteeinsatz) - beide
  // rekursive Baum-Tabellen, aber jeweils mit eigener, an die echte
  // levelbuild-Maske angelehnter Erfassung (personaleinsatzModalHtml und
  // geraeteEinsatzModalHtml weiter unten). Projekt/Kostenstelle und Datum
  // werden dort automatisch aus dem laufenden Projekt/Bautagebuch
  // übernommen (nur lesend), die Leistungszeit wird aus der Arbeitszeit
  // des Berichts vorbelegt, kann aber pro Einsatz angepasst werden.

  // Rechnet die Nettoarbeitszeit (Leistungszeit abzüglich Pause) in Stunden.
  function computeNettoStunden(von, bis, pauseH) {
    if (!von || !bis) return null;
    const vParts = von.split(':').map(Number);
    const bParts = bis.split(':').map(Number);
    if (vParts.length < 2 || bParts.length < 2 || vParts.some(Number.isNaN) || bParts.some(Number.isNaN)) return null;
    let minutes = (bParts[0] * 60 + bParts[1]) - (vParts[0] * 60 + vParts[1]);
    if (minutes < 0) minutes += 24 * 60; // Einsatz über Mitternacht hinweg
    const pause = parseFloat(String(pauseH == null ? 0 : pauseH).replace(',', '.')) || 0;
    const netto = (minutes / 60) - pause;
    return Math.max(0, Math.round(netto * 100) / 100);
  }
  function fmtStd(n) {
    return n == null ? '–' : String(n).replace('.', ',');
  }
  function selectOptionsHtml(options, selected) {
    return options.map((o) => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }
  // Merkt sich (nur im Speicher, für die Dauer der Sitzung) die zuletzt
  // benutzten Personaleinsatz-Werte, wenn "Eingabe merken" angehakt war -
  // damit "Speichern & Neu" direkt mit denselben Werten vorbelegt öffnet.
  let personalMerkenDefaults = null;
  function personaleinsatzModalHtml(node, r) {
    const gewerk = node.gewerk || r.trade || '';
    const gewerkOptions = (gewerk && !PERSONAL_GEWERK_OPTIONS.includes(gewerk)) ? [gewerk].concat(PERSONAL_GEWERK_OPTIONS) : PERSONAL_GEWERK_OPTIONS;
    const qualifikation = node.qualifikation || '';
    const qualiOptions = (qualifikation && !PERSONAL_QUALIFIKATION_OPTIONS.includes(qualifikation)) ? [qualifikation].concat(PERSONAL_QUALIFIKATION_OPTIONS) : PERSONAL_QUALIFIKATION_OPTIONS;
    const von = node.zeitraumVon || (r.arbeitszeit && r.arbeitszeit.von) || '';
    const bis = node.zeitraumBis || (r.arbeitszeit && r.arbeitszeit.bis) || '';
    const pause = node.pause != null ? node.pause : 0;
    const netto = computeNettoStunden(von, bis, pause);
    // Kostenstelle = Projekt (Name+Nr.) des aktuell offenen Projekts, Datum =
    // Datum dieses Bautagebuchs - beides nur lesend, da ein Bautagebuch
    // immer genau einem Projekt und einem Tag zugeordnet ist.
    const projektName = currentProjectLabel().replace(/^\d+\s*-\s*/, '');
    return `
      <div class="pe-section-label">Kostenstelle</div>
      <div class="field-row">
        <div class="field"><label>Kostenstelle</label><div class="input-wrap"><input type="text" value="${esc(projektName)}" disabled></div></div>
        <div class="field"><label>Kostenstellen-Nr.</label><div class="input-wrap"><input type="text" value="${esc(currentProjectId())}" disabled></div></div>
      </div>
      <div class="field"><label>Datum</label><div class="input-wrap"><input type="text" value="${esc(fmtDatum(r.datum))}" disabled></div></div>
      <div class="hr" style="margin: 14px 0;"></div>
      <div class="pe-section-label">Personal</div>
      <div class="field-row">
        ${fieldHtml('pe-eigenpersonal', 'Eigenpersonal?', 'checkbox', node.eigenpersonal !== false)}
        ${fieldHtml('pe-aussenvertraglich', 'außervertraglich?', 'checkbox', !!node.aussenvertraglich)}
      </div>
      <div class="field">
        <label>Gewerk</label>
        <div class="input-wrap">
          <select id="pe-gewerk">${selectOptionsHtml(gewerkOptions, gewerk)}</select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Leistungszeit von</label><div class="input-wrap"><input type="time" id="pe-von" value="${esc(von)}"></div></div>
        <div class="field"><label>Leistungszeit bis</label><div class="input-wrap"><input type="time" id="pe-bis" value="${esc(bis)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Pause (in h)</label><div class="input-wrap"><input type="number" step="0.25" min="0" id="pe-pause" value="${esc(pause)}"></div></div>
        <div class="field"><label>Nettozeit (in h)</label><div class="input-wrap"><input type="text" id="pe-netto" value="${esc(fmtStd(netto))}" disabled></div></div>
      </div>
      <div class="field">
        <label>Qualifikation</label>
        <div class="input-wrap">
          <select id="pe-qualifikation">
            <option value=""${qualifikation ? '' : ' selected'}>– auswählen –</option>
            ${selectOptionsHtml(qualiOptions, qualifikation)}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field">
        <label>Anzahl</label>
        <div class="input-wrap"><input type="number" min="0" id="pe-anzahl" value="${esc(node.anzahl != null ? node.anzahl : 1)}"></div>
      </div>
      <div class="field-row">
        <button type="button" class="matt-tool-btn" id="pe-anzahl-plus" style="flex:1;">+</button>
        <button type="button" class="matt-tool-btn" id="pe-anzahl-minus" style="flex:1;">-</button>
      </div>
      <div class="field">
        <label>Bemerkung</label>
        <div class="input-wrap"><textarea id="pe-bemerkung" rows="3" class="pe-textarea">${esc(node.bemerkung || '')}</textarea></div>
      </div>
      <label class="field pe-merken-row">
        <input type="checkbox" id="pe-merken" ${personalMerkenDefaults ? 'checked' : ''}>
        <span>Eingabe merken</span>
        <span class="pe-merken-info" title="Merkt sich die eingegebenen Werte (Gewerk, Qualifikation, Zeiten, Pause) für die nächste Erfassung.">i</span>
      </label>
    `;
  }
  function readPersonaleinsatzModal() {
    const von = document.getElementById('pe-von').value;
    const bis = document.getElementById('pe-bis').value;
    const pause = parseFloat(String(document.getElementById('pe-pause').value).replace(',', '.')) || 0;
    const gewerk = document.getElementById('pe-gewerk').value;
    const qualifikation = document.getElementById('pe-qualifikation').value;
    const anzahl = parseInt(document.getElementById('pe-anzahl').value, 10) || 0;
    const eigenpersonal = document.getElementById('pe-eigenpersonal').checked;
    const aussenvertraglich = document.getElementById('pe-aussenvertraglich').checked;
    const bemerkung = document.getElementById('pe-bemerkung').value.trim();
    const merken = document.getElementById('pe-merken').checked;
    const bezeichnung = [gewerk, qualifikation].filter(Boolean).join(' – ') || 'Personaleinsatz';
    return {
      data: { bezeichnung, zeitraumVon: von, zeitraumBis: bis, anzahl, gewerk, qualifikation, pause, eigenpersonal, aussenvertraglich, bemerkung },
      merken,
    };
  }
  function openPersonaleinsatzModal(mode, targetId) {
    const r = currentReport();
    if (!r) return;
    let node = { eigenpersonal: true, aussenvertraglich: false, gewerk: '', qualifikation: '', pause: 0, anzahl: 1, bemerkung: '', zeitraumVon: '', zeitraumBis: '' };
    let title = 'neuen Personaleinsatz hinzufügen';
    if (mode === 'edit') {
      const found = btFindNode(r.anwesend || [], targetId);
      if (found) node = found;
      title = 'Personaleinsatz bearbeiten';
    } else if (mode === 'add-child') {
      title = 'Unter-Personaleinsatz hinzufügen';
    }
    if (mode !== 'edit' && personalMerkenDefaults) node = Object.assign({}, node, personalMerkenDefaults);
    const canSaveNew = mode !== 'edit';
    openModal(title, personaleinsatzModalHtml(node, r), `
      <button type="button" class="matt-tool-btn" id="pe-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="pe-save">Speichern</button>
      ${canSaveNew ? '<button type="button" class="btn-primary" id="pe-save-new">Speichern &amp; Neu</button>' : ''}
    `);
    document.getElementById('pe-cancel').addEventListener('click', closeModal);
    const vonEl = document.getElementById('pe-von');
    const bisEl = document.getElementById('pe-bis');
    const pauseEl = document.getElementById('pe-pause');
    const nettoEl = document.getElementById('pe-netto');
    function recalcNetto() { nettoEl.value = fmtStd(computeNettoStunden(vonEl.value, bisEl.value, pauseEl.value)); }
    [vonEl, bisEl, pauseEl].forEach((el) => el.addEventListener('input', recalcNetto));
    const anzahlEl = document.getElementById('pe-anzahl');
    document.getElementById('pe-anzahl-plus').addEventListener('click', () => { anzahlEl.value = (parseInt(anzahlEl.value, 10) || 0) + 1; });
    document.getElementById('pe-anzahl-minus').addEventListener('click', () => { anzahlEl.value = Math.max(0, (parseInt(anzahlEl.value, 10) || 0) - 1); });
    function doSave(reopenFresh) {
      const { data, merken } = readPersonaleinsatzModal();
      personalMerkenDefaults = merken
        ? { eigenpersonal: data.eigenpersonal, aussenvertraglich: data.aussenvertraglich, gewerk: data.gewerk, qualifikation: data.qualifikation, pause: data.pause, zeitraumVon: data.zeitraumVon, zeitraumBis: data.zeitraumBis }
        : null;
      updateReport((r2) => {
        if (!r2.anwesend) r2.anwesend = [];
        if (mode === 'edit') {
          const found = btFindNode(r2.anwesend, targetId);
          if (found) Object.assign(found, data);
        } else if (mode === 'add-child') {
          const parent = btFindNode(r2.anwesend, targetId);
          if (parent) {
            if (!parent.children) parent.children = [];
            parent.children.push(makeBautagebuchTreeNode(data));
          }
        } else {
          r2.anwesend.push(makeBautagebuchTreeNode(data));
        }
      });
      if (reopenFresh) openPersonaleinsatzModal(mode, targetId);
      else closeModal();
    }
    document.getElementById('pe-save').addEventListener('click', () => doSave(false));
    const saveNewBtn = document.getElementById('pe-save-new');
    if (saveNewBtn) saveNewBtn.addEventListener('click', () => doSave(true));
  }

  // ---------- Geräte (Geräteeinsatz) ----------
  let geraeteMerkenDefaults = null;
  function geraeteBezeichnungOptionsHtml(gruppenstufe, alleAnzeigen, selected) {
    let list = (alleAnzeigen || !gruppenstufe) ? Object.values(GERAETE_KATALOG).flat() : (GERAETE_KATALOG[gruppenstufe] || []);
    if (selected && !list.includes(selected)) list = [selected].concat(list);
    return `<option value=""${selected ? '' : ' selected'}>– auswählen –</option>` + selectOptionsHtml(list, selected);
  }
  function geraeteEinsatzModalHtml(node, r) {
    const gewerk = node.gewerk || r.trade || '';
    const gewerkOptions = (gewerk && !PERSONAL_GEWERK_OPTIONS.includes(gewerk)) ? [gewerk].concat(PERSONAL_GEWERK_OPTIONS) : PERSONAL_GEWERK_OPTIONS;
    const von = node.zeitraumVon || (r.arbeitszeit && r.arbeitszeit.von) || '';
    const bis = node.zeitraumBis || (r.arbeitszeit && r.arbeitszeit.bis) || '';
    const pause = node.pause != null ? node.pause : 0;
    const netto = computeNettoStunden(von, bis, pause);
    const projektName = currentProjectLabel().replace(/^\d+\s*-\s*/, '');
    const gruppenstufe = node.gruppenstufe || '';
    const abweichendeEinheit = !!node.abweichendeEinheit;
    return `
      <div class="pe-section-label">Mandant / Niederlassung</div>
      <div class="field-row">
        <div class="field"><label>Mandant</label><div class="input-wrap"><input type="text" value="${esc(GERAETE_MANDANT.name)}" disabled></div></div>
        <div class="field"><label>&nbsp;</label><div class="input-wrap"><input type="text" value="${esc(GERAETE_MANDANT.nr)}" disabled></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Niederlassung</label><div class="input-wrap"><input type="text" value="${esc(GERAETE_NIEDERLASSUNG.name)}" disabled></div></div>
        <div class="field"><label>&nbsp;</label><div class="input-wrap"><input type="text" value="${esc(GERAETE_NIEDERLASSUNG.nr)}" disabled></div></div>
      </div>
      <div class="hr" style="margin: 14px 0;"></div>
      <div class="pe-section-label">Kostenstelle</div>
      <div class="field-row">
        <div class="field"><label>Kostenstelle</label><div class="input-wrap"><input type="text" value="${esc(projektName)}" disabled></div></div>
        <div class="field"><label>Kostenstellen-Nr.</label><div class="input-wrap"><input type="text" value="${esc(currentProjectId())}" disabled></div></div>
      </div>
      <div class="field"><label>Datum</label><div class="input-wrap"><input type="text" value="${esc(fmtDatum(r.datum))}" disabled></div></div>
      <div class="hr" style="margin: 14px 0;"></div>
      <div class="pe-section-label">Geräte / Maschinen</div>
      <div class="field-row">
        ${fieldHtml('ge-eigengeraet', 'Eigengerät?', 'checkbox', node.eigengeraet !== false)}
        ${fieldHtml('ge-aussenvertraglich', 'außervertraglich?', 'checkbox', !!node.aussenvertraglich)}
      </div>
      <div class="field">
        <label>Gewerk</label>
        <div class="input-wrap">
          <select id="ge-gewerk">${selectOptionsHtml(gewerkOptions, gewerk)}</select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Leistungszeit von</label><div class="input-wrap"><input type="time" id="ge-von" value="${esc(von)}"></div></div>
        <div class="field"><label>Leistungszeit bis</label><div class="input-wrap"><input type="time" id="ge-bis" value="${esc(bis)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Pause (in h)</label><div class="input-wrap"><input type="number" step="0.25" min="0" id="ge-pause" value="${esc(pause)}"></div></div>
        <div class="field"><label>Nettozeit (in h)</label><div class="input-wrap"><input type="text" id="ge-netto" value="${esc(fmtStd(netto))}" disabled></div></div>
      </div>
      <label class="field pe-merken-row">
        <input type="checkbox" id="ge-abweichende-einheit" ${abweichendeEinheit ? 'checked' : ''}>
        <span>abweichende Einheit?</span>
      </label>
      <div class="field" id="ge-einheit-field" style="${abweichendeEinheit ? '' : 'display:none;'}">
        <label>Einheit</label>
        <div class="input-wrap">
          <select id="ge-einheit">${selectOptionsHtml(GERAETE_EINHEIT_OPTIONS, node.einheit || 'Stunden')}</select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field">
        <label>Gruppenstufenbezeichnung</label>
        <div class="input-wrap">
          <select id="ge-gruppenstufe">
            <option value=""${gruppenstufe ? '' : ' selected'}>– auswählen –</option>
            ${selectOptionsHtml(GERAETE_GRUPPENSTUFEN, gruppenstufe)}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field">
        <label>Geräte-Bezeichnung</label>
        <div class="input-wrap">
          <select id="ge-bezeichnung">${geraeteBezeichnungOptionsHtml(gruppenstufe, !!node.alleAnzeigen, node.geraeteBezeichnung || '')}</select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Geräte-KST</label><div class="input-wrap"><input type="text" id="ge-kst" value="${esc(node.geraeteKst || '')}"></div></div>
        <label class="field pe-merken-row" style="align-self:center;">
          <input type="checkbox" id="ge-alle-anzeigen" ${node.alleAnzeigen ? 'checked' : ''}>
          <span>alle anzeigen?</span>
        </label>
      </div>
      <div class="field">
        <label>Anzahl</label>
        <div class="input-wrap"><input type="number" min="0" id="ge-anzahl" value="${esc(node.anzahl != null ? node.anzahl : 1)}"></div>
      </div>
      <div class="field-row">
        <button type="button" class="matt-tool-btn" id="ge-anzahl-plus" style="flex:1;">+</button>
        <button type="button" class="matt-tool-btn" id="ge-anzahl-minus" style="flex:1;">-</button>
      </div>
      <div class="field">
        <label>Bemerkung</label>
        <div class="input-wrap"><textarea id="ge-bemerkung" rows="3" class="pe-textarea">${esc(node.bemerkung || '')}</textarea></div>
      </div>
      <label class="field pe-merken-row">
        <input type="checkbox" id="ge-merken" ${geraeteMerkenDefaults ? 'checked' : ''}>
        <span>Eingabe merken</span>
        <span class="pe-merken-info" title="Merkt sich die eingegebenen Werte (Gewerk, Gruppenstufe, Zeiten, Pause) für die nächste Erfassung.">i</span>
      </label>
    `;
  }
  function readGeraeteEinsatzModal() {
    const von = document.getElementById('ge-von').value;
    const bis = document.getElementById('ge-bis').value;
    const pause = parseFloat(String(document.getElementById('ge-pause').value).replace(',', '.')) || 0;
    const gewerk = document.getElementById('ge-gewerk').value;
    const eigengeraet = document.getElementById('ge-eigengeraet').checked;
    const aussenvertraglich = document.getElementById('ge-aussenvertraglich').checked;
    const abweichendeEinheit = document.getElementById('ge-abweichende-einheit').checked;
    const einheit = abweichendeEinheit ? document.getElementById('ge-einheit').value : 'Stück';
    const gruppenstufe = document.getElementById('ge-gruppenstufe').value;
    const geraeteBezeichnung = document.getElementById('ge-bezeichnung').value;
    const geraeteKst = document.getElementById('ge-kst').value.trim();
    const alleAnzeigen = document.getElementById('ge-alle-anzeigen').checked;
    const anzahl = parseInt(document.getElementById('ge-anzahl').value, 10) || 0;
    const bemerkung = document.getElementById('ge-bemerkung').value.trim();
    const merken = document.getElementById('ge-merken').checked;
    const bezeichnung = geraeteBezeichnung || gruppenstufe || 'Gerät';
    return {
      data: { bezeichnung, zeitraumVon: von, zeitraumBis: bis, anzahl, gewerk, eigengeraet, aussenvertraglich, abweichendeEinheit, einheit, gruppenstufe, geraeteBezeichnung, geraeteKst, alleAnzeigen, pause, bemerkung },
      merken,
    };
  }
  function openGeraeteModal(mode, targetId) {
    const r = currentReport();
    if (!r) return;
    let node = { eigengeraet: true, aussenvertraglich: false, gewerk: '', gruppenstufe: '', geraeteBezeichnung: '', geraeteKst: '', alleAnzeigen: false, abweichendeEinheit: false, einheit: 'Stück', pause: 0, anzahl: 1, bemerkung: '', zeitraumVon: '', zeitraumBis: '' };
    let title = 'Neues Gerät anlegen';
    if (mode === 'edit') {
      const found = btFindNode(r.geraete || [], targetId);
      if (found) node = found;
      title = 'Gerät bearbeiten';
    } else if (mode === 'add-child') {
      title = 'Unter-Gerät hinzufügen';
    }
    if (mode !== 'edit' && geraeteMerkenDefaults) node = Object.assign({}, node, geraeteMerkenDefaults);
    const canSaveNew = mode !== 'edit';
    openModal(title, geraeteEinsatzModalHtml(node, r), `
      <button type="button" class="matt-tool-btn" id="ge-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="ge-save">Speichern</button>
      ${canSaveNew ? '<button type="button" class="btn-primary" id="ge-save-new">Speichern &amp; Neu</button>' : ''}
    `);
    document.getElementById('ge-cancel').addEventListener('click', closeModal);
    const vonEl = document.getElementById('ge-von');
    const bisEl = document.getElementById('ge-bis');
    const pauseEl = document.getElementById('ge-pause');
    const nettoEl = document.getElementById('ge-netto');
    function recalcNetto() { nettoEl.value = fmtStd(computeNettoStunden(vonEl.value, bisEl.value, pauseEl.value)); }
    [vonEl, bisEl, pauseEl].forEach((el) => el.addEventListener('input', recalcNetto));
    const anzahlEl = document.getElementById('ge-anzahl');
    document.getElementById('ge-anzahl-plus').addEventListener('click', () => { anzahlEl.value = (parseInt(anzahlEl.value, 10) || 0) + 1; });
    document.getElementById('ge-anzahl-minus').addEventListener('click', () => { anzahlEl.value = Math.max(0, (parseInt(anzahlEl.value, 10) || 0) - 1); });
    const einheitCheck = document.getElementById('ge-abweichende-einheit');
    const einheitField = document.getElementById('ge-einheit-field');
    einheitCheck.addEventListener('change', () => { einheitField.style.display = einheitCheck.checked ? '' : 'none'; });
    const gruppenstufeEl = document.getElementById('ge-gruppenstufe');
    const alleAnzeigenEl = document.getElementById('ge-alle-anzeigen');
    const bezeichnungEl = document.getElementById('ge-bezeichnung');
    function refreshBezeichnungOptions() {
      const current = bezeichnungEl.value;
      bezeichnungEl.innerHTML = geraeteBezeichnungOptionsHtml(gruppenstufeEl.value, alleAnzeigenEl.checked, current);
    }
    gruppenstufeEl.addEventListener('change', refreshBezeichnungOptions);
    alleAnzeigenEl.addEventListener('change', refreshBezeichnungOptions);
    function doSave(reopenFresh) {
      const { data, merken } = readGeraeteEinsatzModal();
      geraeteMerkenDefaults = merken
        ? { eigengeraet: data.eigengeraet, aussenvertraglich: data.aussenvertraglich, gewerk: data.gewerk, gruppenstufe: data.gruppenstufe, abweichendeEinheit: data.abweichendeEinheit, einheit: data.einheit, pause: data.pause, zeitraumVon: data.zeitraumVon, zeitraumBis: data.zeitraumBis }
        : null;
      updateReport((r2) => {
        if (!r2.geraete) r2.geraete = [];
        if (mode === 'edit') {
          const found = btFindNode(r2.geraete, targetId);
          if (found) Object.assign(found, data);
        } else if (mode === 'add-child') {
          const parent = btFindNode(r2.geraete, targetId);
          if (parent) {
            if (!parent.children) parent.children = [];
            parent.children.push(makeBautagebuchTreeNode(data));
          }
        } else {
          r2.geraete.push(makeBautagebuchTreeNode(data));
        }
      });
      if (reopenFresh) openGeraeteModal(mode, targetId);
      else closeModal();
    }
    document.getElementById('ge-save').addEventListener('click', () => doSave(false));
    const saveNewBtn2 = document.getElementById('ge-save-new');
    if (saveNewBtn2) saveNewBtn2.addEventListener('click', () => doSave(true));
  }
  // sectionKey: 'anwesend' | 'geraete'
  function renderTree(sectionKey, bodyElId, countElId) {
    const r = currentReport();
    const bodyEl = document.getElementById(bodyElId);
    const countEl = document.getElementById(countElId);
    if (!r || !bodyEl) return;
    const nodes = r[sectionKey] || [];
    const total = nodes.reduce((sum, n) => sum + btSumAnzahl(n), 0);
    if (countEl) countEl.textContent = String(total);
    if (!nodes.length) {
      bodyEl.innerHTML = `<tr><td colspan="4"><div class="changelog-empty">Noch keine Einträge.</div></td></tr>`;
      return;
    }
    const rowsHtml = [];
    function walk(list, depth) {
      list.forEach((n) => {
        const hasChildren = n.children && n.children.length;
        const zeitraum = (n.zeitraumVon || n.zeitraumBis) ? `${n.zeitraumVon || '–'} Uhr - ${n.zeitraumBis || '–'} Uhr` : '–';
        rowsHtml.push(`<tr data-tree-row="${esc(n.id)}">
          <td><span class="bt-tree-cell" style="padding-left:${depth * 18}px;">${hasChildren ? `<span class="bt-tree-chev" data-tree-toggle="${esc(n.id)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"/></svg></span>` : '<span class="bt-tree-chev-spacer"></span>'}${esc(n.bezeichnung || '(ohne Bezeichnung)')}</span></td>
          <td>${esc(zeitraum)}</td>
          <td>${esc(String(btSumAnzahl(n)))}</td>
          <td class="bt-tree-actions">
            <span class="icon-btn" data-tree-add-child="${esc(n.id)}" title="Unterposition hinzufügen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </span>
            <span class="icon-btn" data-tree-edit="${esc(n.id)}" title="Bearbeiten">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </span>
            <span class="icon-btn" data-tree-delete="${esc(n.id)}" title="Löschen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </span>
          </td>
        </tr>`);
        if (hasChildren) walk(n.children, depth + 1);
      });
    }
    walk(nodes, 0);
    bodyEl.innerHTML = rowsHtml.join('');

    bodyEl.querySelectorAll('[data-tree-add-child]').forEach((btn) => {
      btn.addEventListener('click', () => openTreeNodeModal(sectionKey, 'add-child', btn.getAttribute('data-tree-add-child')));
    });
    bodyEl.querySelectorAll('[data-tree-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openTreeNodeModal(sectionKey, 'edit', btn.getAttribute('data-tree-edit')));
    });
    bodyEl.querySelectorAll('[data-tree-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Diesen Eintrag (inkl. eventueller Unterpositionen) wirklich löschen?')) return;
        const id = btn.getAttribute('data-tree-delete');
        updateReport((r2) => { btRemoveNode(r2[sectionKey] || [], id); });
      });
    });
  }
  function openTreeNodeModal(sectionKey, mode, targetId) {
    if (sectionKey === 'anwesend') { openPersonaleinsatzModal(mode, targetId); return; }
    if (sectionKey === 'geraete') { openGeraeteModal(mode, targetId); return; }
  }
  rootEl.addEventListener('click', (e) => {
    const chev = e.target.closest('[data-tree-toggle]');
    if (!chev) return;
    const row = chev.closest('tr');
    if (row) row.classList.toggle('bt-tree-row-collapsed');
    // Einfache Sichtbarkeits-Umschaltung der direkt folgenden, tiefer
    // eingerückten Zeilen (bis zur nächsten Zeile auf gleicher/geringerer
    // Tiefe) - ohne die Baumstruktur dafür erneut aufbauen zu müssen.
    const thisDepth = parseInt(chev.closest('.bt-tree-cell').style.paddingLeft, 10) || 0;
    let sib = row.nextElementSibling;
    const collapsed = row.classList.contains('bt-tree-row-collapsed');
    while (sib) {
      const cell = sib.querySelector('.bt-tree-cell');
      const depth = cell ? (parseInt(cell.style.paddingLeft, 10) || 0) : 0;
      if (depth <= thisDepth) break;
      sib.style.display = collapsed ? 'none' : '';
      sib = sib.nextElementSibling;
    }
  });
  const anwesendAddBtn = document.getElementById('btd-anwesend-add');
  if (anwesendAddBtn) anwesendAddBtn.addEventListener('click', (e) => { e.stopPropagation(); openTreeNodeModal('anwesend', 'add', null); });
  const geraeteAddBtn = document.getElementById('btd-geraete-add');
  if (geraeteAddBtn) geraeteAddBtn.addEventListener('click', (e) => { e.stopPropagation(); openTreeNodeModal('geraete', 'add', null); });

  // ---------- Leistungen (flache Liste) ----------
  function renderLeistungen() {
    const r = currentReport();
    const el = document.getElementById('btd-leistungen-list');
    const countEl = document.getElementById('btd-leistungen-count');
    if (!r || !el) return;
    const items = r.leistungen || [];
    if (countEl) countEl.textContent = String(items.length);
    if (!items.length) { el.innerHTML = '<div class="changelog-empty">Noch keine Leistungen erfasst.</div>'; return; }
    el.innerHTML = items.map((it) => {
      const pos = (it.lvArtNr && it.lvDetailartNr && it.lvPosNr) ? lvPosNummer(it.lvArtNr, it.lvDetailartNr, it.lvPosNr) : '';
      return `
      <div class="col-config-row" data-edit-leistung="${esc(it.id)}" style="cursor:pointer;">
        <span>${pos ? `<span class="lv-tree-leistung-nr">${esc(pos)}</span> ` : ''}${esc(it.bezeichnung || '(ohne Bezeichnung)')}${it.menge ? ' · ' + esc(it.menge) + ' ' + esc(it.einheit || '') : ''}</span>
        <span class="icon-btn" data-delete-leistung="${esc(it.id)}" title="Löschen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </span>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-edit-leistung]').forEach((row) => {
      row.addEventListener('click', (e) => { if (e.target.closest('[data-delete-leistung]')) return; openLeistungModal(row.getAttribute('data-edit-leistung')); });
    });
    el.querySelectorAll('[data-delete-leistung]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Diese Leistung löschen?')) return;
        const id = btn.getAttribute('data-delete-leistung');
        updateReport((r2) => { r2.leistungen = (r2.leistungen || []).filter((x) => x.id !== id); });
      });
    });
  }

  // Die drei Felder Beschreibung Leistung / Detail-Art / Art bilden - von
  // unten nach oben gelesen - die 3 Ebenen der LV-Positionsnummer: Art ist
  // die erste (oberste) Nummer, Detail-Art die zweite, Beschreibung
  // Leistung die dritte. Die volle LV-Pos. (z. B. "02.05.0401") ergibt
  // sich erst als Konkatenation, sobald alle drei ausgewählt sind - siehe
  // lvPosNummer() weiter oben. "Allg. LV laden" schaltet die Quelle
  // zwischen dem für dieses Projekt importierten LV (Leistungsverzeichnis-
  // Seite) und einem kleinen eingebauten Demo-LV um.
  const LV_ART_KLASSE_OPTIONS = ['Grundleistung', 'Nachtragsleistung', 'Regieleistung', 'Sonstige'];
  const LEISTUNG_EINHEIT_OPTIONS = ['Stück', 'm', 'm²', 'm³', 'h', 't', 'lfm'];
  let leistungMerkenDefaults = null;
  function currentLvArtenList(useGeneric) {
    if (useGeneric) return GENERIC_LV_ARTEN;
    const lv = loadLv();
    const arten = lv && lv.arten ? lv.arten : [];
    return arten.length ? arten : GENERIC_LV_ARTEN;
  }
  function lvArtOptionsHtml(arten, selectedNr) {
    return `<option value=""${selectedNr ? '' : ' selected'}>– auswählen –</option>` +
      arten.map((a) => `<option value="${esc(a.nr)}"${a.nr === selectedNr ? ' selected' : ''}>${esc(a.nr)} ${esc(a.bezeichnung)}</option>`).join('');
  }
  function lvDetailartOptionsHtml(arten, artNr, selectedNr) {
    const art = arten.find((a) => a.nr === artNr);
    const list = art ? art.detailarten : [];
    return `<option value=""${selectedNr ? '' : ' selected'}>– auswählen –</option>` +
      list.map((d) => `<option value="${esc(d.nr)}"${d.nr === selectedNr ? ' selected' : ''}>${esc(artNr)}.${esc(d.nr)} ${esc(d.bezeichnung)}</option>`).join('');
  }
  function lvLeistungOptionsHtml(arten, artNr, detailartNr, selectedNr) {
    const art = arten.find((a) => a.nr === artNr);
    const detailart = art ? art.detailarten.find((d) => d.nr === detailartNr) : null;
    const list = detailart ? detailart.leistungen : [];
    return `<option value=""${selectedNr ? '' : ' selected'}>– auswählen –</option>` +
      list.map((l) => `<option value="${esc(l.nr)}"${l.nr === selectedNr ? ' selected' : ''}>${esc(l.beschreibung)}</option>`).join('');
  }
  // Zeigt die einer Leistung zugeordneten Standorte (aus der Masttafel) als
  // kleine Chips an - Zuordnung selbst passiert über den Button "Standorte
  // zuordnen" (öffnet die Ankreuz-Auswahl, siehe openStandorteAuswahlModal).
  function standorteChipsHtml(list) {
    const arr = list || [];
    if (!arr.length) return '<div class="changelog-empty">Noch keine Standorte zugeordnet.</div>';
    return `<div class="lm-standorte-chips">${arr.map((s) => `<span class="lm-standort-chip">${esc(s)}</span>`).join('')}</div>`;
  }
  // Ankreuz-Auswahl der Standorte (aus der importierten Masttafel, gefiltert
  // auf den aktuell gewählten Bauabschnitt, falls einer ausgewählt ist).
  // Ersetzt kurzzeitig den Inhalt des einen gemeinsam genutzten Modals -
  // deshalb bekommt sie den kompletten aktuellen Formular-Stand (snapshot)
  // übergeben und reicht ihn beim Abbrechen/Übernehmen unverändert bzw. mit
  // aktualisierten Standorten wieder an openLeistungModal zurück, statt die
  // bereits eingegebenen Werte zu verwerfen.
  function openStandorteAuswahlModal(id, snapshot, bauabschnittId) {
    const alle = getMastNummernForBauabschnitt(bauabschnittId);
    const selected = new Set(snapshot.standorte || []);
    const listHtml = alle.length
      ? alle.map((m) => `
        <label class="lm-standort-check-row">
          <input type="checkbox" value="${esc(m)}" ${selected.has(m) ? 'checked' : ''}>
          <span>${esc(m)}</span>
        </label>`).join('')
      : '<div class="changelog-empty">Für diesen Bauabschnitt wurden noch keine Standorte aus einer Masttafel eingelesen.</div>';
    openModal('Standorte zuordnen', `
      <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:10px;">Bitte die Standorte ankreuzen, die dieser Leistung zugeordnet werden sollen.</div>
      <div id="lm-standort-check-list">${listHtml}</div>
    `, `
      <button type="button" class="matt-tool-btn" id="lm-standort-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="lm-standort-confirm">Übernehmen</button>
    `);
    document.getElementById('lm-standort-cancel').addEventListener('click', () => openLeistungModal(id, snapshot));
    document.getElementById('lm-standort-confirm').addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('#lm-standort-check-list input[type="checkbox"]:checked')).map((c) => c.value);
      snapshot.standorte = checked;
      openLeistungModal(id, snapshot);
    });
  }
  function leistungModalHtml(item, r) {
    const useGeneric = !!item.allgLvLaden;
    const arten = currentLvArtenList(useGeneric);
    const projektName = currentProjectLabel().replace(/^\d+\s*-\s*/, '');
    const bauabschnitte = loadBauabschnitte();
    const von = item.von || (r.arbeitszeit && r.arbeitszeit.von) || '';
    const bis = item.bis || (r.arbeitszeit && r.arbeitszeit.bis) || '';
    const std = computeNettoStunden(von, bis, 0);
    const kmStartNum = item.kmStart != null ? parseFloat(item.kmStart) : NaN;
    const kmEndeNum = item.kmEnde != null ? parseFloat(item.kmEnde) : NaN;
    const leistungM = (!Number.isNaN(kmStartNum) && !Number.isNaN(kmEndeNum)) ? Math.round(Math.abs(kmEndeNum - kmStartNum) * 1000 * 100) / 100 : null;
    const lvPos = (item.lvArtNr && item.lvDetailartNr && item.lvPosNr) ? lvPosNummer(item.lvArtNr, item.lvDetailartNr, item.lvPosNr) : '';
    return `
      <div class="lm-accordion" data-lm-section="kostenstelle">
        <div class="lm-accordion-head"><span class="lm-accordion-chev">&rsaquo;</span><span>Kostenstelle</span></div>
        <div class="lm-accordion-body" hidden>
          <div class="field-row">
            <div class="field"><label>Kostenstelle</label><div class="input-wrap"><input type="text" value="${esc(projektName)}" disabled></div></div>
            <div class="field"><label>Kostenstellen-Nr.</label><div class="input-wrap"><input type="text" value="${esc(currentProjectId())}" disabled></div></div>
          </div>
        </div>
      </div>
      <div class="lm-accordion" data-lm-section="bauabschnitt">
        <div class="lm-accordion-head"><span class="lm-accordion-chev">&rsaquo;</span><span>Bauabschnitt</span></div>
        <div class="lm-accordion-body" hidden>
          <div class="field">
            <label>Bauabschnitt</label>
            <div class="input-wrap">
              <select id="lm-bauabschnitt">
                <option value=""${item.bauabschnittId ? '' : ' selected'}>– kein Bauabschnitt –</option>
                ${bauabschnitte.map((b) => `<option value="${esc(b.id)}"${b.id === item.bauabschnittId ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
              </select>
              <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
            </div>
          </div>
        </div>
      </div>
      <div class="lm-accordion" data-lm-section="art">
        <div class="lm-accordion-head"><span class="lm-accordion-chev">&rsaquo;</span><span>Art</span></div>
        <div class="lm-accordion-body" hidden>
          <div class="field">
            <label>Art der Leistung</label>
            <div class="input-wrap">
              <select id="lm-artklasse">
                <option value=""${item.artKlasse ? '' : ' selected'}>– auswählen –</option>
                ${selectOptionsHtml(LV_ART_KLASSE_OPTIONS, item.artKlasse || '')}
              </select>
              <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
            </div>
          </div>
        </div>
      </div>
      <div class="lm-accordion lm-accordion-open" data-lm-section="leistung">
        <div class="lm-accordion-head"><span class="lm-accordion-chev">&rsaquo;</span><span>Leistung</span></div>
        <div class="lm-accordion-body">
          <div class="field">
            <label>Beschreibung Leistung</label>
            <div class="input-wrap">
              <select id="lm-beschreibung-lv">${lvLeistungOptionsHtml(arten, item.lvArtNr, item.lvDetailartNr, item.lvPosNr)}</select>
              <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
            </div>
          </div>
          <div class="field">
            <label>Detail-Art</label>
            <div class="input-wrap">
              <select id="lm-detailart">${lvDetailartOptionsHtml(arten, item.lvArtNr, item.lvDetailartNr)}</select>
              <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
            </div>
          </div>
          <div class="field">
            <label>Art</label>
            <div class="input-wrap">
              <select id="lm-art">${lvArtOptionsHtml(arten, item.lvArtNr)}</select>
              <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>LV-Pos.</label><div class="input-wrap"><input type="text" id="lm-lvpos" value="${esc(lvPos)}" disabled></div></div>
            <label class="field pe-merken-row" style="align-self:center;">
              <input type="checkbox" id="lm-allg-lv" ${useGeneric ? 'checked' : ''}>
              <span>Allg. LV laden</span>
            </label>
          </div>
        </div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="lm-details-highlight field-row">
        ${fieldHtml('lm-vertraglich', 'a. Vertr?', 'checkbox', item.vertraglich !== false)}
        ${fieldHtml('lm-aussenvertraglich', 'außervertraglich?', 'checkbox', !!item.aussenvertraglich)}
      </div>
      <label class="field pe-merken-row" style="margin-top:4px;">
        <input type="checkbox" id="lm-nu-leistung" ${item.nuLeistung ? 'checked' : ''}>
        <span>NU-Leistung</span>
      </label>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field-row">
        <div class="field"><label>Beginn</label><div class="input-wrap"><input type="date" id="lm-beginn" value="${esc(item.beginn || r.datum)}"></div></div>
        <div class="field"><label>Ende</label><div class="input-wrap"><input type="date" id="lm-ende" value="${esc(item.ende || item.beginn || r.datum)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>von</label><div class="input-wrap"><input type="time" id="lm-von" value="${esc(von)}"></div></div>
        <div class="field"><label>bis</label><div class="input-wrap"><input type="time" id="lm-bis" value="${esc(bis)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>KM Start</label><div class="input-wrap"><input type="number" step="0.001" id="lm-km-start" value="${esc(item.kmStart != null ? item.kmStart : '')}"></div></div>
        <div class="field"><label>KM Ende</label><div class="input-wrap"><input type="number" step="0.001" id="lm-km-ende" value="${esc(item.kmEnde != null ? item.kmEnde : '')}"></div></div>
      </div>
      <div class="field">
        <label>Standorte</label>
        <div id="lm-standorte-list">${standorteChipsHtml(item.standorte)}</div>
        <input type="hidden" id="lm-standorte" value='${esc(JSON.stringify(item.standorte || []))}'>
        <button type="button" class="matt-tool-btn lm-standorte-btn" id="lm-standorte-btn">Standorte zuordnen</button>
      </div>
      <div class="field-row">
        <div class="field"><label>Std. gesamt</label><div class="input-wrap"><input type="text" id="lm-std-gesamt" value="${esc(fmtStd(std))}" disabled></div></div>
        <div class="field"><label>Leistung (m)</label><div class="input-wrap"><input type="text" id="lm-leistung-m" value="${esc(leistungM != null ? String(leistungM).replace('.', ',') : '–')}" disabled></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Menge</label><div class="input-wrap"><input type="number" step="0.01" id="lm-menge" value="${esc(item.menge != null ? item.menge : '')}"></div></div>
        <div class="field">
          <label>Einheit</label>
          <div class="input-wrap">
            <select id="lm-einheit">${selectOptionsHtml(LEISTUNG_EINHEIT_OPTIONS, item.einheit || 'Stück')}</select>
            <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
        </div>
      </div>
      <div class="field">
        <label>Beschreibung</label>
        <div class="input-wrap"><textarea id="lm-beschreibung" rows="3" class="pe-textarea">${esc(item.beschreibung || '')}</textarea></div>
      </div>
      <div class="lm-accordion" data-lm-section="status">
        <div class="lm-accordion-head"><span class="lm-accordion-chev">&rsaquo;</span><span>Statusinformation</span></div>
        <div class="lm-accordion-body" hidden>
          <div style="font-size:12.5px; color:var(--gray-500);">${item.id ? 'Angelegt am ' + esc(fmtDatum(r.datum)) : 'Wird beim Speichern angelegt.'}</div>
        </div>
      </div>
      <label class="field pe-merken-row" style="margin-top:10px;">
        <input type="checkbox" id="lm-merken" ${leistungMerkenDefaults ? 'checked' : ''}>
        <span>Eingabe merken</span>
        <span class="pe-merken-info" title="Merkt sich Bauabschnitt, Art-Klassifizierung, LV-Quelle, Zeiten und Einheit für die nächste Erfassung.">i</span>
      </label>
    `;
  }
  function readLeistungModal() {
    const bauabschnittId = document.getElementById('lm-bauabschnitt').value;
    const artKlasse = document.getElementById('lm-artklasse').value;
    const lvArtNr = document.getElementById('lm-art').value;
    const lvDetailartNr = document.getElementById('lm-detailart').value;
    const lvPosNr = document.getElementById('lm-beschreibung-lv').value;
    const allgLvLaden = document.getElementById('lm-allg-lv').checked;
    const arten = currentLvArtenList(allgLvLaden);
    const art = arten.find((a) => a.nr === lvArtNr);
    const detailart = art ? art.detailarten.find((d) => d.nr === lvDetailartNr) : null;
    const leistung = detailart ? detailart.leistungen.find((l) => l.nr === lvPosNr) : null;
    const vertraglich = document.getElementById('lm-vertraglich').checked;
    const aussenvertraglich = document.getElementById('lm-aussenvertraglich').checked;
    const nuLeistung = document.getElementById('lm-nu-leistung').checked;
    const beginn = document.getElementById('lm-beginn').value;
    const ende = document.getElementById('lm-ende').value;
    const von = document.getElementById('lm-von').value;
    const bis = document.getElementById('lm-bis').value;
    const kmStartRaw = document.getElementById('lm-km-start').value;
    const kmEndeRaw = document.getElementById('lm-km-ende').value;
    let standorte = [];
    try { standorte = JSON.parse(document.getElementById('lm-standorte').value || '[]'); } catch (e) { standorte = []; }
    const mengeRaw = document.getElementById('lm-menge').value;
    const einheit = document.getElementById('lm-einheit').value;
    const beschreibung = document.getElementById('lm-beschreibung').value.trim();
    const merken = document.getElementById('lm-merken').checked;
    const bezeichnung = (leistung && leistung.beschreibung) || (detailart && detailart.bezeichnung) || (art && art.bezeichnung) || 'Leistung';
    return {
      data: {
        bezeichnung, bauabschnittId, artKlasse,
        lvArtNr, lvArtBezeichnung: art ? art.bezeichnung : '',
        lvDetailartNr, lvDetailartBezeichnung: detailart ? detailart.bezeichnung : '',
        lvPosNr, lvBeschreibung: leistung ? leistung.beschreibung : '',
        allgLvLaden, vertraglich, aussenvertraglich, nuLeistung,
        beginn, ende, von, bis,
        kmStart: kmStartRaw === '' ? null : parseFloat(kmStartRaw),
        kmEnde: kmEndeRaw === '' ? null : parseFloat(kmEndeRaw),
        standorte,
        menge: mengeRaw === '' ? null : parseFloat(mengeRaw), einheit,
        beschreibung,
      },
      merken,
    };
  }
  // `overrideItem` wird benutzt, um nach der Standorte-Auswahl (oder nach
  // deren Abbruch) das Formular mit genau dem Stand wieder zu öffnen, den
  // der Nutzer vorher schon eingegeben hatte (siehe openStandorteAuswahlModal)
  // - ohne das würden alle bis dahin eingegebenen Felder verloren gehen,
  // weil sich Leistung-Formular und Standorte-Auswahl dasselbe eine Modal
  // teilen.
  function openLeistungModal(id, overrideItem) {
    const r = currentReport();
    if (!r) return;
    let item = {
      vertraglich: true, aussenvertraglich: false, nuLeistung: false, allgLvLaden: false, einheit: 'Stück',
      beginn: r.datum, ende: r.datum, von: '', bis: '', kmStart: null, kmEnde: null, standorte: [],
      menge: null, beschreibung: '', bauabschnittId: '', artKlasse: '', lvArtNr: '', lvDetailartNr: '', lvPosNr: '',
    };
    let title = 'neue Leistung anlegen';
    if (overrideItem) {
      item = overrideItem;
      title = id ? 'Leistung bearbeiten' : 'neue Leistung anlegen';
    } else if (id) {
      const found = (r.leistungen || []).find((x) => x.id === id);
      if (found) item = found;
      title = 'Leistung bearbeiten';
    } else if (leistungMerkenDefaults) {
      item = Object.assign({}, item, leistungMerkenDefaults);
    }
    const canSaveNew = !id;
    openModal(title, leistungModalHtml(item, r), `
      <button type="button" class="matt-tool-btn" id="lm-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="lm-save">Speichern</button>
      ${canSaveNew ? '<button type="button" class="btn-primary" id="lm-save-new">Speichern &amp; Neu</button>' : ''}
    `);
    wireLeistungModal(id);
  }
  function wireLeistungModal(id) {
    document.getElementById('lm-cancel').addEventListener('click', closeModal);
    document.getElementById('lm-standorte-btn').addEventListener('click', () => {
      const snapshot = readLeistungModal().data;
      openStandorteAuswahlModal(id, snapshot, document.getElementById('lm-bauabschnitt').value);
    });
    document.querySelectorAll('#modal-body .lm-accordion-head').forEach((head) => {
      head.addEventListener('click', () => {
        const section = head.closest('.lm-accordion');
        const nowOpen = !section.classList.contains('lm-accordion-open');
        section.classList.toggle('lm-accordion-open', nowOpen);
        const body = section.querySelector('.lm-accordion-body');
        body.hidden = !nowOpen;
      });
    });
    const artSel = document.getElementById('lm-art');
    const detailartSel = document.getElementById('lm-detailart');
    const beschreibungSel = document.getElementById('lm-beschreibung-lv');
    const lvPosEl = document.getElementById('lm-lvpos');
    const allgLvCheck = document.getElementById('lm-allg-lv');
    function currentArten() { return currentLvArtenList(allgLvCheck.checked); }
    function recalcLvPos() {
      const artNr = artSel.value, detailartNr = detailartSel.value, posNr = beschreibungSel.value;
      lvPosEl.value = (artNr && detailartNr && posNr) ? lvPosNummer(artNr, detailartNr, posNr) : '';
    }
    artSel.addEventListener('change', () => {
      const arten = currentArten();
      detailartSel.innerHTML = lvDetailartOptionsHtml(arten, artSel.value, '');
      beschreibungSel.innerHTML = lvLeistungOptionsHtml(arten, artSel.value, '', '');
      recalcLvPos();
    });
    detailartSel.addEventListener('change', () => {
      const arten = currentArten();
      beschreibungSel.innerHTML = lvLeistungOptionsHtml(arten, artSel.value, detailartSel.value, '');
      recalcLvPos();
    });
    beschreibungSel.addEventListener('change', recalcLvPos);
    allgLvCheck.addEventListener('change', () => {
      const arten = currentArten();
      artSel.innerHTML = lvArtOptionsHtml(arten, '');
      detailartSel.innerHTML = lvDetailartOptionsHtml(arten, '', '');
      beschreibungSel.innerHTML = lvLeistungOptionsHtml(arten, '', '', '');
      recalcLvPos();
    });
    const vonEl = document.getElementById('lm-von');
    const bisEl = document.getElementById('lm-bis');
    const stdEl = document.getElementById('lm-std-gesamt');
    function recalcStd() { stdEl.value = fmtStd(computeNettoStunden(vonEl.value, bisEl.value, 0)); }
    vonEl.addEventListener('input', recalcStd);
    bisEl.addEventListener('input', recalcStd);
    const kmStartEl = document.getElementById('lm-km-start');
    const kmEndeEl = document.getElementById('lm-km-ende');
    const leistungMEl = document.getElementById('lm-leistung-m');
    function recalcLeistungM() {
      const a = parseFloat(kmStartEl.value), b = parseFloat(kmEndeEl.value);
      if (Number.isNaN(a) || Number.isNaN(b)) { leistungMEl.value = '–'; return; }
      leistungMEl.value = String(Math.round(Math.abs(b - a) * 1000 * 100) / 100).replace('.', ',');
    }
    kmStartEl.addEventListener('input', recalcLeistungM);
    kmEndeEl.addEventListener('input', recalcLeistungM);
    const beginnEl = document.getElementById('lm-beginn');
    const endeEl = document.getElementById('lm-ende');
    beginnEl.dataset.prev = beginnEl.value;
    beginnEl.addEventListener('change', () => {
      if (!endeEl.value || endeEl.value === beginnEl.dataset.prev) endeEl.value = beginnEl.value;
      beginnEl.dataset.prev = beginnEl.value;
    });
    function doSave(reopenFresh) {
      const { data, merken } = readLeistungModal();
      leistungMerkenDefaults = merken
        ? { bauabschnittId: data.bauabschnittId, artKlasse: data.artKlasse, allgLvLaden: data.allgLvLaden, einheit: data.einheit, von: data.von, bis: data.bis }
        : null;
      updateReport((r2) => {
        if (!r2.leistungen) r2.leistungen = [];
        if (id) {
          const found = r2.leistungen.find((x) => x.id === id);
          if (found) Object.assign(found, data);
        } else {
          r2.leistungen.push(Object.assign({ id: makeMastDataId('lst') }, data));
        }
      });
      if (reopenFresh) openLeistungModal(null);
      else closeModal();
    }
    document.getElementById('lm-save').addEventListener('click', () => doSave(false));
    const saveNewBtn = document.getElementById('lm-save-new');
    if (saveNewBtn) saveNewBtn.addEventListener('click', () => doSave(true));
  }
  const leistungenAddBtn = document.getElementById('btd-leistungen-add');
  if (leistungenAddBtn) leistungenAddBtn.addEventListener('click', (e) => { e.stopPropagation(); openLeistungModal(null); });

  // ---------- PDF-Protokoll erstellen (aus einem Ereignis, das einen
  // abgeschlossenen Protokoll-Datensatz repräsentiert) ----------
  // Wandelt den rohen, im Handy-Formular gespeicherten Baustein-Wert in eine
  // für das PDF sinnvolle Textdarstellung um (Checkbox -> Ja/Nein, Datum ->
  // TT.MM.JJJJ, Mehrfachauswahl-Array -> kommagetrennt, alles andere ->
  // einfach als String).
  // `answers` (optional) ist die volle Antworten-Map des Protokolls - wird
  // nur für Checkbox-Bausteine gebraucht, um zusätzlich zum Ankreuz-Zustand
  // auch den Wert einer eventuellen Folgefrage anzuhängen (gespeichert unter
  // dem eigenen Schlüssel "<bausteinId>__ff__<optionId>", siehe
  // handyapp.js/collectAnswers).
  function bausteinDisplayValue(b, raw, answers) {
    if (b.type === 'checkbox') {
      const optionen = Array.isArray(b.optionen) ? b.optionen : [];
      if (!raw || typeof raw !== 'object') return '';
      return optionen.filter((opt) => raw[opt.id] === true).map((opt) => {
        let text = opt.label;
        if (opt.folgefeld && answers) {
          const ffVal = answers[b.id + '__ff__' + opt.id];
          if (ffVal !== '' && ffVal != null) text += ` (${opt.folgefeld.label}: ${ffVal})`;
        }
        return text;
      }).join(', ');
    }
    if (raw == null || raw === '') return '';
    if (b.type === 'datum') return fmtDatum(raw);
    if (Array.isArray(raw)) return raw.join(', ');
    return String(raw);
  }
  // Tätigkeitslisten (und damit die Aufgaben mit ihrem protokollId) leben in
  // diesem Prototyp immer projekt-gescoped (siehe MAST_TL_ASSIGNMENT_KEY-
  // Kommentar weiter oben) - das referenzierte Protokoll liegt deshalb immer
  // in loadProtokollProjectList(), nie in den projektübergreifenden
  // Protokoll-Vorlagen.
  function resolveProjectProtokollById(id) {
    if (!id) return null;
    return loadProtokollProjectList().find((p) => p.id === id) || null;
  }
  // Bestes verfügbares Anzeige-Label für einen Mast anhand seines internen
  // Schlüssels - sucht über alle Bauabschnitte des aktuellen Projekts in der
  // persistierten Masttafel-Rohdaten-Struktur (rowsByKey liegt dort als
  // Array von [key, entry]-Paaren vor, siehe serializeSection in der
  // Masttafel-IIFE). Fällt auf den Schlüssel selbst zurück, falls nichts
  // gefunden wird (z. B. Mast zwischenzeitlich gelöscht).
  function resolveMastLabelForPdf(mastKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null');
      const sections = (saved && saved.sections) || {};
      for (const id of Object.keys(sections)) {
        const rows = sections[id] && sections[id].rowsByKey;
        if (!Array.isArray(rows)) continue;
        const found = rows.find((pair) => Array.isArray(pair) && pair[0] === mastKey);
        if (found && found[1]) return found[1].displayKey || mastKey;
      }
    } catch (e) { /* ignore */ }
    return mastKey;
  }
  // Liefert das konfigurierte Protokoll (mit hinterlegter PDF-Vorlage) für
  // ein Ereignis, oder null, wenn dieses Ereignis keinen PDF-fähigen
  // Protokoll-Abschluss repräsentiert (z. B. ein manuell angelegtes
  // Ereignis, oder eine Tätigkeit ohne Protokoll/ohne PDF-Vorlage).
  function ereignisPdfProtokoll(it) {
    if (!it || !it.mastKey || !it.protokollId) return null;
    const protokoll = resolveProjectProtokollById(it.protokollId);
    if (!protokoll || !protokoll.pdfVorlage) return null;
    return protokoll;
  }
  function openPdfErstellenModal(ereignisId) {
    const r = currentReport();
    if (!r) return;
    const it = (r.ereignisse || []).find((x) => x.id === ereignisId);
    const protokoll = it && ereignisPdfProtokoll(it);
    if (!it || !protokoll) return;
    const mastLabel = resolveMastLabelForPdf(it.mastKey);
    const defaultBetreff = `${protokoll.name} – ${mastLabel}`;
    openModal('PDF-Protokoll erstellen', `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:4px;">
        Erzeugt automatisch ein ausgefülltes PDF aus der hinterlegten Vorlage von "${esc(protokoll.name)}" mit den Antworten dieses Datensatzes - es muss nichts von Hand nachgetragen werden. Das Dokument wird anschließend unter "Dokumente" gespeichert und in der Mastmaske verlinkt.
      </div>
      ${fieldHtml('pdfgen-betreff', 'Betreff', 'text', defaultBetreff)}
      ${fieldHtml('pdfgen-ersteller', 'Ersteller', 'text', '')}
      ${fieldHtml('pdfgen-datenerfasser', 'Datenerfasser', 'text', '')}
      <div id="pdfgen-error" style="font-size:12px; color:var(--red);"></div>
    `, `<button class="btn-primary" id="pdfgen-save">PDF erstellen</button>`);
    const saveBtn = document.getElementById('pdfgen-save');
    saveBtn.addEventListener('click', async () => {
      const betreff = document.getElementById('pdfgen-betreff').value.trim() || defaultBetreff;
      const ersteller = document.getElementById('pdfgen-ersteller').value.trim();
      const datenerfasser = document.getElementById('pdfgen-datenerfasser').value.trim();
      const errEl = document.getElementById('pdfgen-error');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Wird erstellt…';
      if (errEl) errEl.textContent = '';
      try {
        // Nach taskId lesen (nicht protokollId) - siehe Kommentar bei
        // loadMastProtokollDaten(). it.taskId kommt aus pushEreignisFuerHeute()
        // beim Tätigkeits-Abschluss und ist bei jedem PDF-fähigen Ereignis
        // gesetzt (siehe ereignisPdfProtokoll(), das nur dann true liefert,
        // wenn diese Tätigkeit ihrerseits eine gültige protokollId hat).
        const answers = ((loadMastProtokollDaten()[it.mastKey] || {})[it.taskId] || {}).answers || {};
        const bausteinValues = {};
        (protokoll.bausteine || []).forEach((b) => {
          // Tabellen-Bausteine bewusst NICHT durch bausteinDisplayValue
          // schicken - das würde die Zeilen/Spalten-Struktur zu einer
          // einzigen, kaum brauchbaren Zeichenkette zusammenfassen
          // (Array.isArray-Zweig dort). generateProtokollPdf braucht das
          // rohe Zeilen-Array, um jede Zelle einzeln an ihre Spalten-Position
          // zu schreiben.
          bausteinValues[b.id] = (b.type === 'tabelle')
            ? (Array.isArray(answers[b.id]) ? answers[b.id] : [])
            : bausteinDisplayValue(b, answers[b.id], answers);
        });
        const systemValues = {
          mastnummer: mastLabel,
          datum: fmtDatum(r.datum),
          betreff, ersteller, datenerfasser,
          protokollname: protokoll.name,
          // Kommt nicht aus der Handy-Vorlage (dort gibt es dafür kein Feld),
          // sondern ist über das aktuell offene Projekt automatisch bekannt.
          projektname: currentProjectName(),
        };
        const pdfBase64 = await generateProtokollPdf(protokoll, bausteinValues, systemValues);
        const doc = addDokument({
          id: makeMastDataId('doc'),
          betreff, mastKey: it.mastKey, mastLabel,
          datum: r.datum,
          ersteller, datenerfasser,
          protokollId: protokoll.id, protokollName: protokoll.name,
          taskId: it.taskId || null,
          pdfBase64,
          createdAt: new Date().toISOString(),
        });
        updateReport((r2) => {
          const evt = (r2.ereignisse || []).find((x) => x.id === ereignisId);
          if (evt) evt.dokumentId = doc.id;
        });
        closeModal();
      } catch (e) {
        if (errEl) errEl.textContent = 'PDF konnte nicht erstellt werden: ' + (e && e.message ? e.message : String(e));
        saveBtn.disabled = false;
        saveBtn.textContent = 'PDF erstellen';
      }
    });
  }

  // ---------- Ereignisse (flache Liste) ----------
  function renderEreignisse() {
    const r = currentReport();
    const el = document.getElementById('btd-ereignisse-list');
    const countEl = document.getElementById('btd-ereignisse-count');
    if (!r || !el) return;
    const items = (r.ereignisse || []).slice().sort((a, b) => String(a.uhrzeit || '').localeCompare(String(b.uhrzeit || '')));
    if (countEl) countEl.textContent = String(items.length);
    if (!items.length) { el.innerHTML = '<div class="changelog-empty">Noch keine Ereignisse erfasst.</div>'; return; }
    el.innerHTML = items.map((it) => {
      const protokoll = ereignisPdfProtokoll(it);
      let pdfActionHtml = '';
      if (it.dokumentId) {
        pdfActionHtml = `<span class="badge-mini" title="PDF wurde bereits erstellt - siehe Dokumente" style="background:var(--blue-light); color:var(--blue);">PDF erstellt</span>`;
      } else if (protokoll) {
        pdfActionHtml = `<button type="button" class="link-action" data-pdf-erstellen="${esc(it.id)}">PDF-Protokoll erstellen</button>`;
      }
      return `
      <div class="col-config-row" data-edit-ereignis="${esc(it.id)}" style="cursor:pointer;">
        <span>${it.uhrzeit ? esc(it.uhrzeit) + ' Uhr · ' : ''}${esc(it.titel || '(ohne Titel)')}</span>
        <span style="display:flex; align-items:center; gap:10px;">
          ${pdfActionHtml}
          <span class="icon-btn" data-delete-ereignis="${esc(it.id)}" title="Löschen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </span>
        </span>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-edit-ereignis]').forEach((row) => {
      row.addEventListener('click', (e) => { if (e.target.closest('[data-delete-ereignis]') || e.target.closest('[data-pdf-erstellen]')) return; openEreignisModal(row.getAttribute('data-edit-ereignis')); });
    });
    el.querySelectorAll('[data-pdf-erstellen]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPdfErstellenModal(btn.getAttribute('data-pdf-erstellen'));
      });
    });
    el.querySelectorAll('[data-delete-ereignis]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Dieses Ereignis löschen?')) return;
        const id = btn.getAttribute('data-delete-ereignis');
        updateReport((r2) => { r2.ereignisse = (r2.ereignisse || []).filter((x) => x.id !== id); });
      });
    });
  }
  function openEreignisModal(id) {
    const r = currentReport();
    if (!r) return;
    const it = id ? (r.ereignisse || []).find((x) => x.id === id) : { uhrzeit: '', titel: '', beschreibung: '' };
    if (!it) return;
    openModal(id ? 'Ereignis bearbeiten' : 'Ereignis hinzufügen', `
      ${fieldHtml('em-uhrzeit', 'Uhrzeit', 'time', it.uhrzeit)}
      ${fieldHtml('em-titel', 'Titel', 'text', it.titel)}
      ${fieldHtml('em-beschreibung', 'Beschreibung', 'text', it.beschreibung)}
    `, `<button class="btn-primary" id="em-save">Speichern</button>`);
    document.getElementById('em-save').addEventListener('click', () => {
      const data = {
        uhrzeit: document.getElementById('em-uhrzeit').value,
        titel: document.getElementById('em-titel').value.trim(),
        beschreibung: document.getElementById('em-beschreibung').value.trim(),
      };
      updateReport((r2) => {
        if (!r2.ereignisse) r2.ereignisse = [];
        if (id) Object.assign(r2.ereignisse.find((x) => x.id === id), data);
        else r2.ereignisse.push(Object.assign({ id: makeMastDataId('evt') }, data));
      });
      closeModal();
    });
  }
  const ereignisseAddBtn = document.getElementById('btd-ereignisse-add');
  if (ereignisseAddBtn) ereignisseAddBtn.addEventListener('click', (e) => { e.stopPropagation(); openEreignisModal(null); });

  // ---------- Konfigurieren (Sichtbarkeit der Abschnitte) ----------
  function applySectionVisibility() {
    const r = currentReport();
    if (!r) return;
    const visible = (r.config && r.config.visibleSections) || BAUTAGEBUCH_DEFAULT_SECTIONS;
    document.querySelectorAll('#btd-tab-bautagesbericht [data-bt-section]').forEach((panel) => {
      panel.style.display = visible.indexOf(panel.getAttribute('data-bt-section')) !== -1 ? '' : 'none';
    });
  }
  const configureBtn = document.getElementById('btd-configure-btn');
  if (configureBtn) {
    configureBtn.addEventListener('click', () => {
      const r = currentReport();
      if (!r) return;
      const visible = (r.config && r.config.visibleSections) || BAUTAGEBUCH_DEFAULT_SECTIONS;
      const labels = { wetter: 'Wetter', arbeitszeit: 'Arbeitszeit', anwesend: 'Anwesend', geraete: 'Geräte', leistungen: 'Leistungen', ereignisse: 'Ereignisse' };
      openModal('Bautagesbericht konfigurieren', `
        <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:10px;">Welche Bereiche sollen im Bautagesbericht angezeigt werden?</div>
        ${BAUTAGEBUCH_DEFAULT_SECTIONS.map((key) => `
          <label class="field" style="flex-direction:row; align-items:center; gap:8px;">
            <input type="checkbox" data-cfg-section="${key}" ${visible.indexOf(key) !== -1 ? 'checked' : ''} style="width:auto;">
            <span>${esc(labels[key])}</span>
          </label>`).join('')}
      `, `<button class="btn-primary" id="cfg-save">Speichern</button>`);
      document.getElementById('cfg-save').addEventListener('click', () => {
        const chosen = Array.from(document.querySelectorAll('[data-cfg-section]:checked')).map((el) => el.getAttribute('data-cfg-section'));
        updateReport((r2) => { r2.config = { visibleSections: chosen }; });
        closeModal();
      });
    });
  }

  // ---------- Druckbericht ----------
  function renderDruckbericht() {
    const r = currentReport();
    const el = document.getElementById('btd-druckbericht-body');
    if (!r || !el) return;
    function treeToHtml(nodes, depth) {
      return (nodes || []).map((n) => `
        <div style="padding-left:${depth * 16}px; padding:3px 0; border-top:1px solid var(--gray-100);">
          <strong>${esc(n.bezeichnung || '–')}</strong>
          <span style="color:var(--gray-500); font-size:12px;"> · ${(n.zeitraumVon || n.zeitraumBis) ? esc(n.zeitraumVon || '–') + ' - ' + esc(n.zeitraumBis || '–') + ' Uhr' : '–'} · Anzahl ${esc(String(btSumAnzahl(n)))}</span>
        </div>
        ${treeToHtml(n.children, depth + 1)}`).join('');
    }
    const az = r.arbeitszeit || {};
    el.innerHTML = `
      <h3 style="margin:0 0 4px;">Bautagesbericht Nr. ${esc(r.nummer)} - ${esc(fmtDatum(r.datum))}</h3>
      <div style="color:var(--gray-500); font-size:12.5px; margin-bottom:14px;">${esc(currentProjectLabel())} · ${esc(r.trade || '–')} · Status: ${r.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}</div>

      <div class="subheading">Wetter</div>
      ${(r.wetter || []).length ? (r.wetter.map((w) => `<div style="padding:3px 0;">${esc(w.uhrzeit || '–')} Uhr · ${w.temperaturC != null && w.temperaturC !== '' ? esc(w.temperaturC) + ' °C' : '–'} ${esc(w.bedingung || '')} · ${w.niederschlagMm || '0'} mm ${w.druckrelevant ? '· <strong>druckrelevant</strong>' : ''}</div>`).join('')) : '<div class="changelog-empty" style="padding:8px 0;">Keine Einträge.</div>'}

      <div class="subheading" style="margin-top:16px;">Arbeitszeit</div>
      <div style="padding:3px 0;">${(az.von || az.bis) ? `${az.von || '–'} Uhr - ${az.bis || '–'} Uhr` : '–'}</div>

      <div class="subheading" style="margin-top:16px;">Anwesend</div>
      ${(r.anwesend || []).length ? treeToHtml(r.anwesend, 0) : '<div class="changelog-empty" style="padding:8px 0;">Keine Einträge.</div>'}

      <div class="subheading" style="margin-top:16px;">Geräte</div>
      ${(r.geraete || []).length ? treeToHtml(r.geraete, 0) : '<div class="changelog-empty" style="padding:8px 0;">Keine Einträge.</div>'}

      <div class="subheading" style="margin-top:16px;">Leistungen</div>
      ${(r.leistungen || []).length ? (r.leistungen.map((it) => `<div style="padding:3px 0;">${esc(it.bezeichnung || '–')}${it.menge ? ' · ' + esc(it.menge) + ' ' + esc(it.einheit || '') : ''}${it.bemerkung ? ' · ' + esc(it.bemerkung) : ''}</div>`).join('')) : '<div class="changelog-empty" style="padding:8px 0;">Keine Einträge.</div>'}

      <div class="subheading" style="margin-top:16px;">Ereignisse</div>
      ${(r.ereignisse || []).length ? (r.ereignisse.map((it) => `<div style="padding:3px 0;">${it.uhrzeit ? esc(it.uhrzeit) + ' Uhr · ' : ''}${esc(it.titel || '–')}${it.beschreibung ? ' - ' + esc(it.beschreibung) : ''}</div>`).join('')) : '<div class="changelog-empty" style="padding:8px 0;">Keine Einträge.</div>'}
    `;
  }
  const printBtn = document.getElementById('btd-print-btn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  // ---------- Daten aus letztem Tagebuch übernehmen ----------
  function renderUebernehmen() {
    const r = currentReport();
    const sel = document.getElementById('btd-uebernehmen-select');
    if (!r || !sel) return;
    const others = loadBautagebuecher()
      .filter((x) => x.id !== r.id)
      .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
    sel.innerHTML = '<option value="">– bitte wählen –</option>' +
      others.map((o) => `<option value="${esc(o.id)}">Nr. ${esc(o.nummer)} - ${esc(fmtDatum(o.datum))}${o.trade ? ' (' + esc(o.trade) + ')' : ''}</option>`).join('');
    const btn = document.getElementById('btd-uebernehmen-btn');
    if (btn) btn.disabled = true;
  }
  const uebernehmenSelect = document.getElementById('btd-uebernehmen-select');
  const uebernehmenBtn = document.getElementById('btd-uebernehmen-btn');
  if (uebernehmenSelect && uebernehmenBtn) {
    uebernehmenSelect.addEventListener('change', () => { uebernehmenBtn.disabled = !uebernehmenSelect.value; });
    uebernehmenBtn.addEventListener('click', () => {
      const sourceId = uebernehmenSelect.value;
      if (!sourceId) return;
      if (!window.confirm('Arbeitszeit, Anwesenheit und Geräte aus dem ausgewählten Bautagebuch übernehmen? Bestehende Einträge in diesen Bereichen werden dabei überschrieben.')) return;
      const source = loadBautagebuecher().find((x) => x.id === sourceId);
      if (!source) return;
      updateReport((r2) => {
        r2.arbeitszeit = JSON.parse(JSON.stringify(source.arbeitszeit || {}));
        r2.anwesend = JSON.parse(JSON.stringify(source.anwesend || []));
        r2.geraete = JSON.parse(JSON.stringify(source.geraete || []));
      });
      showBtdTab('bautagesbericht');
    });
  }

  // ---------- Stammdaten ----------
  function renderStammdaten() {
    const r = currentReport();
    if (!r) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('btd-sd-nummer', r.nummer);
    set('btd-sd-datum', r.datum);
    set('btd-sd-trade', r.trade || '');
    set('btd-sd-status', r.status || 'offen');
  }
  const sdSaveBtn = document.getElementById('btd-sd-save');
  if (sdSaveBtn) {
    sdSaveBtn.addEventListener('click', () => {
      const nummer = parseInt(document.getElementById('btd-sd-nummer').value, 10) || 0;
      const datum = document.getElementById('btd-sd-datum').value;
      const trade = document.getElementById('btd-sd-trade').value.trim();
      const status = document.getElementById('btd-sd-status').value;
      const datumChanged = datum !== (currentReport() || {}).datum;
      updateReport((r2) => { r2.nummer = nummer; r2.datum = datum; r2.trade = trade; r2.status = status; });
      // Das Wetter gehört zu einem bestimmten Tag - ändert sich das Datum,
      // müssen die automatisch gezogenen Einträge neu für den neuen Tag
      // geholt werden (manuell angelegte Einträge bleiben unangetastet).
      if (datumChanged) autoFetchWetterIfNeeded(true);
    });
  }

  // ---------- alles neu rendern ----------
  function renderAll() {
    renderHeader();
    renderWetter();
    renderArbeitszeit();
    renderTree('anwesend', 'btd-anwesend-body', 'btd-anwesend-count');
    renderTree('geraete', 'btd-geraete-body', 'btd-geraete-count');
    renderLeistungen();
    renderEreignisse();
    applySectionVisibility();
  }

  window.levelbuildOnShowBautagebuchDetail = function () {
    showBtdTab('bautagesbericht');
    renderAll();
    autoFetchWetterIfNeeded(false);
  };
  renderAll();
  autoFetchWetterIfNeeded(false);
})();

// ======================================================================
// Dokumente: Liste der automatisch aus Protokoll-Datensätzen erzeugten,
// ausgefüllten PDFs (siehe generateProtokollPdf + "PDF-Protokoll erstellen"
// im Bautagebuch, weiter oben). Diese Seite ist rein lesend/verwaltend -
// filtert (Betreff/Mast/Datum/Ersteller/Datenerfasser/Protokoll), öffnet
// zum Herunterladen und löscht - erzeugt wird hier nichts.
// ======================================================================
(function () {
  const tbodyEl = document.getElementById('dok-tbody');
  if (!tbodyEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatum(iso) {
    if (!iso) return '–';
    const parts = String(iso).split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
  }
  function fmtDatumZeit(iso) {
    if (!iso) return '–';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return iso; }
  }

  // Session-Zustand (nicht persistiert) - eine Textzeile pro filterbarer
  // Spalte; "datum" wird exakt verglichen (Datumsauswahl), alle anderen als
  // case-insensitive Teilstring.
  let filters = { betreff: '', mastLabel: '', datum: '', ersteller: '', datenerfasser: '', protokollName: '' };

  function matchesFilters(doc) {
    return Object.keys(filters).every((key) => {
      const f = (filters[key] || '').trim();
      if (!f) return true;
      if (key === 'datum') return doc.datum === f;
      return String(doc[key] || '').toLowerCase().includes(f.toLowerCase());
    });
  }

  function downloadDokument(doc) {
    try {
      const a = document.createElement('a');
      a.href = doc.pdfBase64;
      a.download = (doc.betreff || 'Protokoll').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* z. B. in Testumgebungen ohne echte Download-Navigation - unkritisch */ }
  }

  // Einmaliger Deep-Link von der Mastmaske ("Alle Dokumente dieses Masts")
  // in Form eines sessionStorage-Werts - wird hier gelesen, als Mast-Filter
  // übernommen und sofort wieder gelöscht (kein dauerhafter Zustand, sonst
  // würde ein späterer normaler Besuch der Dokumente-Seite ungewollt weiter
  // gefiltert bleiben).
  function applyMastPrefillIfAny() {
    let prefill;
    try { prefill = sessionStorage.getItem('levelbuild_dok_prefill_mast'); } catch (e) { prefill = null; }
    if (!prefill) return;
    try { sessionStorage.removeItem('levelbuild_dok_prefill_mast'); } catch (e) { /* ignore */ }
    filters.mastLabel = prefill;
    const input = document.querySelector('[data-dok-filter="mastLabel"]');
    if (input) input.value = prefill;
  }

  function render() {
    const crumbEl = document.getElementById('dok-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();
    applyMastPrefillIfAny();

    const all = loadDokumente().slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const items = all.filter(matchesFilters);
    const countEl = document.getElementById('dok-count');
    if (countEl) countEl.textContent = String(items.length);
    const emptyEl = document.getElementById('dok-empty');
    const wrapEl = document.querySelector('.dok-table-wrap');
    if (!all.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrapEl) wrapEl.hidden = true;
      tbodyEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (wrapEl) wrapEl.hidden = false;
    if (!items.length) {
      tbodyEl.innerHTML = '<tr><td colspan="8" class="changelog-empty" style="padding:14px 0;">Keine Dokumente entsprechen den aktuellen Filtern.</td></tr>';
      return;
    }
    tbodyEl.innerHTML = items.map((doc) => `
      <tr data-dok-id="${esc(doc.id)}">
        <td>${esc(doc.betreff || '–')}</td>
        <td>${esc(doc.mastLabel || doc.mastKey || '–')}</td>
        <td>${esc(fmtDatum(doc.datum))}</td>
        <td>${esc(doc.ersteller || '–')}</td>
        <td>${esc(doc.datenerfasser || '–')}</td>
        <td>${esc(doc.protokollName || '–')}</td>
        <td>${esc(fmtDatumZeit(doc.createdAt))}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="link-action" data-dok-download="${esc(doc.id)}">Herunterladen</button>
          <button type="button" class="link-action" data-dok-delete="${esc(doc.id)}" style="color:var(--red);">Löschen</button>
        </td>
      </tr>`).join('');
    tbodyEl.querySelectorAll('[data-dok-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = loadDokumente().find((d) => d.id === btn.getAttribute('data-dok-download'));
        if (doc) downloadDokument(doc);
      });
    });
    tbodyEl.querySelectorAll('[data-dok-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Dieses Dokument wirklich löschen?')) return;
        const id = btn.getAttribute('data-dok-delete');
        saveDokumente(loadDokumente().filter((d) => d.id !== id));
        render();
      });
    });
  }

  document.querySelectorAll('[data-dok-filter]').forEach((input) => {
    input.addEventListener('input', () => {
      filters[input.getAttribute('data-dok-filter')] = input.value;
      render();
    });
  });
  const clearBtn = document.getElementById('dok-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filters = { betreff: '', mastLabel: '', datum: '', ersteller: '', datenerfasser: '', protokollName: '' };
      document.querySelectorAll('[data-dok-filter]').forEach((input) => { input.value = ''; });
      render();
    });
  }

  window.levelbuildOnShowDokumente = render;
  render();
})();
