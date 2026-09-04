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
  // unabhängige Modal-Grundgerüst am Anfang von intra.html) ----------
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
  // Laden) aufgerufen - siehe showPage() weiter unten in intra.html.
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
  'levelbuild_taetigkeitsarten_projekt',
  'levelbuild_mast_taetigkeitsliste',
  'levelbuild_mast_taetigkeitsliste_regeln',
  'levelbuild_mast_taetigkeitsliste_manuell',
  'levelbuild_mast_aufgaben_status',
  'levelbuild_mast_protokoll_daten',
  'levelbuild_mast_fotos',
  'levelbuild_bautagebuecher',
  'levelbuild_mast_task_abschluss',
  'levelbuild_dokumente',
  'levelbuild_einkauf_positionen',
  'levelbuild_einkauf_einstellungen',
  'levelbuild_bestellungen',
  'levelbuild_elementensammlungen',
  'levelbuild_element_daten',
  'levelbuild_element_aktive_sammlung',
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
// Nutzer-Wunsch: "der ereich für den Masttafel Infport soll in einem
// Übergeordneten Bereich namens Elemente geschoben werden. Die Masttafel
// selber ist eine Elementensammlung, Es muss eine Wahl geben z.B.
// Elementensammlung Masttafel, Schweißliste, Weichen/Schwellen Liste,
// Kabeltiefbau Elemente u.s.w. Alle Logiken werden auch auf diese Anderen
// Elemente Gezogen." - Schritt 1 (bewusst klein gehalten, siehe Nutzer:
// "Mach mal schritt für schritt übertreib mal nicht"): Masttafel bleibt
// technisch 100% unverändert (die riesige, gewachsene Masttafel-IIFE weiter
// unten wird NICHT angefasst), wird aber als eingebauter erster Eintrag in
// einer neuen, projektweiten Liste von "Elementensammlungen" geführt.
// Zusätzliche, frei benannte Elementensammlungen (z. B. "Schweißliste")
// bekommen einen GENERISCHEN Import + dieselbe Versionierungs-Logik wie die
// Masttafel (zeilenweiser, whitespace-unempfindlicher Diff gegen die
// jeweils letzte Version, Schlüssel = erste Spalte) - siehe
// importGenericElementIntoStore()/esNormalize() unten, bewusst als
// eigenständige, neue Funktionen (nicht die bestehende Masttafel-Import-
// Pipeline umgebaut/wiederverwendet), um die bestehende, gut getestete
// Masttafel-Logik nicht anzufassen. Bauabschnitte-Gruppierung, Tätigkeits-
// listen-Zuordnung, Fertigstellungsliste-Integration usw. für diese neuen
// Sammlungen sind bewusst noch NICHT Teil dieses Schritts.
// ======================================================================
const ELEMENTENSAMMLUNGEN_KEY = 'levelbuild_elementensammlungen';
migrateToProjectScopedKey(ELEMENTENSAMMLUNGEN_KEY);
// Der eingebaute "Masttafel"-Eintrag wird NIE mitgespeichert (siehe
// saveElementensammlungen unten) - er wird bei jedem Laden frisch vorne
// angehängt, damit er immer als erster, nicht löschbarer Eintrag erscheint,
// ohne eine Migration für Bestandsprojekte zu brauchen.
function loadElementensammlungen() {
  let list;
  try { list = JSON.parse(localStorage.getItem(pKey(ELEMENTENSAMMLUNGEN_KEY)) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  return [{ id: 'masttafel', name: 'Masttafel', type: 'masttafel', builtin: true }].concat(list);
}
function saveElementensammlungen(list) {
  const persistable = (list || []).filter((s) => s && s.type !== 'masttafel');
  try { localStorage.setItem(pKey(ELEMENTENSAMMLUNGEN_KEY), JSON.stringify(persistable)); } catch (e) { /* ignore */ }
}
function makeElementensammlungId() {
  return 'es-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Nutzer-Wunsch (Folgeturn 3): "es wird gefragt welche Sammlung wollen sie
// anlegen dort gibt es eine auswahl von Elementenvorlagen die
// Projektübergeordnet schon angelegt wurden ... dann muss dieses feste
// Format eingelesen werden" - Elementenvorlagen sind, genau wie die
// bestehenden Tätigkeitslisten-/Protokoll-Vorlagen, projektübergreifend und
// leben deshalb bewusst OHNE pKey()/Projekt-Scoping. Jede Vorlage hat ein
// FESTES Spalten-Format (columns: [{idx, label}]), einmalig festgelegt durch
// Einlesen einer Beispieldatei beim Anlegen (siehe parseGenericElementSheet
// weiter unten, verwaltet im neuen "Elementenvorlagen"-Panel auf der
// Projekte-Seite unter Vorlagen). Eine Elementensammlung in einem Projekt
// wird danach immer aus genau einer solchen Vorlage erzeugt (Deep-Copy des
// Formats, siehe createElementensammlungAusVorlage) - ein freier, formatloser
// Name ist bewusst nicht mehr möglich.
const ELEMENT_TEMPLATES_KEY = 'levelbuild_elementenvorlagen';
function loadElementTemplates() {
  try {
    const list = JSON.parse(localStorage.getItem(ELEMENT_TEMPLATES_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}
function saveElementTemplates(list) {
  try { localStorage.setItem(ELEMENT_TEMPLATES_KEY, JSON.stringify(list || [])); } catch (e) { /* ignore */ }
}
function makeElementTemplateId() {
  return 'et-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// Cascade-Helfer (analog zum bestehenden Muster für Tätigkeitslisten-
// Vorlagen -> Projekt): Deep-Copy des Vorlagen-Formats in eine neue,
// projekteigene Sammlung. Spätere Änderungen an der Vorlage wirken sich
// dadurch bewusst NICHT rückwirkend auf schon angelegte Sammlungen aus.
function createElementensammlungAusVorlage(vorlage) {
  return {
    id: makeElementensammlungId(),
    name: vorlage.name,
    type: 'custom',
    vorlageId: vorlage.id,
    columns: JSON.parse(JSON.stringify(vorlage.columns || [])),
    createdAt: new Date().toISOString(),
  };
}

// Nutzer-Wunsch (Folgeturn): "die Maske eines Elementes muss immer so
// aussehen wie die Maske der Masttafel" - eine Elementensammlung bekommt
// deshalb dieselbe Bauabschnitt-Gliederung wie die Masttafel (sections je
// Bauabschnitt, ein "Alle Bauabschnitte anzeigen"-Zustand), plus Zoom und
// Spalten ein-/ausblenden nach demselben Bedienkonzept - eine eigene, von
// MASTTAFEL_STATE_KEY komplett getrennte Struktur, damit die Masttafel-
// Logik unberührt bleibt: { [sammlungId]: { activeBauabschnittId, zoom,
// hiddenCols, sections: { [bauabschnittId]: { rowsByKey, changesLog, files } } } }.
// Das Spalten-Format selbst liegt NICHT mehr hier (war Schritt-2-Stand),
// sondern fest auf der Elementensammlung selbst (sammlung.columns, aus der
// Elementenvorlage übernommen, siehe createElementensammlungAusVorlage
// oben) - alle Bauabschnitte einer Sammlung teilen sich also zwingend
// dasselbe Format. rowsByKey wie bei der Masttafel als Array von [key,
// entry]-Paaren serialisiert (Map ist nicht JSON-fähig), entry =
// { displayKey, versions: [{version, values, importedAt, fileName}] }.
const ELEMENT_DATEN_KEY = 'levelbuild_element_daten';
migrateToProjectScopedKey(ELEMENT_DATEN_KEY);
// Migriert eine einzelne Sammlung auf die aktuelle Form (sections-Form ohne
// section.columns) - fängt sowohl noch ältere Alt-Daten (ganz ohne sections)
// als auch den Schritt-2-Stand (mit section.columns) ab, damit nichts crasht.
function migrateElementEntry(entry) {
  if (!entry) return { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
  if (!entry.sections) {
    if (!entry.rowsByKey) return { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
    const bas = loadBauabschnitte();
    const targetId = bas.length ? bas[0].id : 'ba-migriert';
    entry = {
      activeBauabschnittId: targetId,
      zoom: 100,
      hiddenCols: [],
      sections: { [targetId]: { rowsByKey: entry.rowsByKey || [], changesLog: entry.changesLog || [], files: entry.files || [] } },
    };
  }
  Object.keys(entry.sections).forEach((baId) => { delete entry.sections[baId].columns; });
  return entry;
}
function loadElementDaten() {
  let map;
  try { map = JSON.parse(localStorage.getItem(pKey(ELEMENT_DATEN_KEY)) || '{}'); } catch (e) { map = {}; }
  Object.keys(map).forEach((id) => { map[id] = migrateElementEntry(map[id]); });
  return map;
}
function saveElementDaten(map) {
  try { localStorage.setItem(pKey(ELEMENT_DATEN_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
function deleteElementDatenFor(sammlungId) {
  const map = loadElementDaten();
  if (sammlungId in map) { delete map[sammlungId]; saveElementDaten(map); }
}
// Analog zu deleteMasttafelSectionData() - wird von der Bauabschnitt-Löschen-
// Aktion in Projekteinstellungen für ALLE Elementensammlungen zugleich
// aufgerufen (nicht nur die aktuell angezeigte), damit keine verwaisten
// Bauabschnitt-Daten übrig bleiben.
function deleteElementSectionData(bauabschnittId) {
  const map = loadElementDaten();
  let changed = false;
  Object.keys(map).forEach((id) => {
    if (map[id].sections && bauabschnittId in map[id].sections) {
      delete map[id].sections[bauabschnittId];
      changed = true;
    }
  });
  if (changed) saveElementDaten(map);
}

// Nutzer-Wunsch (Folgeturn 10): "genau die selben Logiken ... mache alles
// auf einmal" - generisches Gegenstück zu window.levelbuildAddManualMastVersion
// (siehe Masttafel-IIFE weiter unten) für Bauabweichung/Umplanung auf
// generischen Elementensammlungen. patch: { valuesByIdx: {idx: neuerWert},
// manualGrund, manualNachweise }. Schreibt direkt in die echten Element-
// Daten UND aktualisiert den sessionStorage-Handoff der Element-Detail-
// Seite, damit diese die neue Version sofort sieht, ohne dass die
// Elemente-Übersicht dafür neu geladen werden müsste. rowKey ist bereits
// der normalisierte Schlüssel (siehe openElementDetailPage()).
function levelbuildAddManualElementVersion(sammlungId, bauabschnittId, rowKey, patch) {
  const map = loadElementDaten();
  const entry = map[sammlungId];
  const sec = entry && entry.sections ? entry.sections[bauabschnittId] : null;
  if (!sec) return null;
  const rowsByKeyMap = new Map(sec.rowsByKey || []);
  const rowEntry = rowsByKeyMap.get(rowKey);
  if (!rowEntry || !rowEntry.versions.length) return null;
  const latest = rowEntry.versions[rowEntry.versions.length - 1];
  const newValues = latest.values.slice();
  Object.keys(patch.valuesByIdx || {}).forEach((idxStr) => {
    newValues[Number(idxStr)] = patch.valuesByIdx[idxStr];
  });
  const newVersion = {
    version: latest.version + 1,
    values: newValues,
    importedAt: new Date().toISOString(),
    fileName: null,
    manualType: 'umplanung',
    manualLabel: 'Umplanung/Braunstrich',
    manualGrund: patch.manualGrund || '',
    manualNachweise: patch.manualNachweise || [],
  };
  rowEntry.versions.push(newVersion);
  saveElementDaten(map);
  try {
    const raw = JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null');
    if (raw && raw.sammlungId === sammlungId && raw.rowKey === rowKey) {
      raw.versions.push(newVersion);
      sessionStorage.setItem('levelbuild_element_detail', JSON.stringify(raw));
    }
  } catch (e) { /* ignore */ }
  return newVersion;
}
window.levelbuildAddManualElementVersion = levelbuildAddManualElementVersion;

// ======================================================================
// Nutzer-Wunsch (Folgeturn 7): "die App hat dann in einem Projekt natürlich
// die Option die verschiedenen Elementlisten aufzumachen" mit "voller
// Parität wie Mast-Detail (3 Tabs)" für Nicht-Masttafel-Elementensammlungen.
// Das sind PARALLELE, generische Gegenstücke zu MAST_TL_ASSIGNMENT_KEY/
// MAST_TL_MANUAL_KEY/MAST_TASK_STATUS_KEY/MAST_TASK_ABSCHLUSS_KEY/
// MAST_FOTOS_KEY (siehe dort) - Masttafel selbst bleibt unverändert und
// nutzt weiterhin ausschließlich ihre eigenen, unangetasteten Stores. Extra
// Verschachtelungsebene sammlungId, weil es (anders als bei der Masttafel)
// mehrere Sammlungen gleichzeitig geben kann.
const ELEMENT_TL_ASSIGNMENT_KEY = 'levelbuild_element_taetigkeitsliste';
const ELEMENT_TL_MANUAL_KEY = 'levelbuild_element_taetigkeitsliste_manuell';
const ELEMENT_TASK_STATUS_KEY = 'levelbuild_element_aufgaben_status';
const ELEMENT_TASK_ABSCHLUSS_KEY = 'levelbuild_element_task_abschluss';
const ELEMENT_FOTOS_KEY = 'levelbuild_element_fotos';
migrateToProjectScopedKey(ELEMENT_TL_ASSIGNMENT_KEY);
migrateToProjectScopedKey(ELEMENT_TL_MANUAL_KEY);
migrateToProjectScopedKey(ELEMENT_TASK_STATUS_KEY);
migrateToProjectScopedKey(ELEMENT_TASK_ABSCHLUSS_KEY);
migrateToProjectScopedKey(ELEMENT_FOTOS_KEY);

// { [sammlungId]: { [rowKey]: taetigkeitslisteId } }
function loadElementTlAssignments() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_TL_ASSIGNMENT_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementTlAssignments(map) {
  try { localStorage.setItem(pKey(ELEMENT_TL_ASSIGNMENT_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [sammlungId]: { [rowKey]: true } } - wie MAST_TL_MANUAL_KEY: schützt eine
// bewusst einzeln gesetzte Zuordnung vor einer künftigen Regel-Automatik
// (für generische Sammlungen gibt es aktuell noch keinen Regel-Motor wie bei
// der Masttafel - dieses Flag ist dafür bereits vorbereitet, aber momentan
// nur beim manuellen Mehrfachauswahl-Zuordnen relevant).
function loadElementTlManuell() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_TL_MANUAL_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementTlManuell(map) {
  try { localStorage.setItem(pKey(ELEMENT_TL_MANUAL_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [sammlungId]: { [rowKey]: { [taskId]: statusOptionId } } }
function loadElementTaskStatus() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_TASK_STATUS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementTaskStatus(map) {
  try { localStorage.setItem(pKey(ELEMENT_TASK_STATUS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [sammlungId]: { [rowKey]: { [taskId]: { datum: 'YYYY-MM-DD' } } } }
function loadElementTaskAbschluss() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_TASK_ABSCHLUSS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementTaskAbschluss(map) {
  try { localStorage.setItem(pKey(ELEMENT_TASK_ABSCHLUSS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}
// { [sammlungId]: { [rowKey]: [{ id, dataUrl, name, addedAt }] } }
function loadElementFotos() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_FOTOS_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementFotos(map) {
  try { localStorage.setItem(pKey(ELEMENT_FOTOS_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
}

// Whitespace-unempfindlicher Vergleich, exakt wie im Masttafel-Import (siehe
// dortiges normalize()) - eigenständige Kopie, damit diese Datei hier von
// der Masttafel-IIFE komplett unabhängig bleibt.
function esNormalize(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}
function esNormalizeLower(v) {
  return esNormalize(v).toLowerCase();
}
// Nutzer-Wunsch: "Ja also immer ab Spalte 1 abwärz der Kopf muss halt
// erkannt werden" - liest eine xlsx-Datei generisch ein: Kopfzeile = erste
// Zeile mit mindestens 2 ausgefüllten Zellen (robuster als stur "immer Zeile
// 1", falls z. B. eine leere Titelzeile davorsteht), Spalten-Label = Zellen-
// text dieser Zeile (Fallback "Spalte N" bei leerer Kopfzeile). Bewusst kein
// Merge-Zellen-/Mehrzeilen-Header-Rekonstruktion wie bei der Masttafel (dort
// nötig wegen der komplexen PDF-Herkunft) und bewusst kein PDF/OCR-Import -
// das ist bei der Masttafel-spezifischen 33-Spalten-Erkennung eng an das
// eine bekannte Masttafel-Layout gekoppelt und lässt sich nicht generisch
// auf beliebige Elementensammlungen übertragen. Wird heute nur noch beim
// EINMALIGEN Anlegen/Bearbeiten einer Elementenvorlage verwendet (dort wird
// aus einer Beispieldatei das feste Format abgeleitet) - der laufende Import
// in eine Sammlung läuft seitdem gegen dieses feste Format, siehe
// parseFixedFormatSheet() unten.
function parseGenericElementSheet(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = 0;
  for (let r = 0; r < aoa.length; r++) {
    const filled = (aoa[r] || []).filter((c) => String(c == null ? '' : c).trim() !== '').length;
    if (filled >= 2) { headerRowIdx = r; break; }
  }
  const headerRow = aoa[headerRowIdx] || [];
  const colCount = Math.max(headerRow.length, ...(aoa.slice(headerRowIdx + 1).map((r) => r.length)), 1);
  const columns = [];
  for (let c = 0; c < colCount; c++) {
    const label = String(headerRow[c] == null ? '' : headerRow[c]).trim() || `Spalte ${c + 1}`;
    columns.push({ idx: c, label });
  }
  const rows = aoa.slice(headerRowIdx + 1)
    .filter((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''))
    .map((r) => ({ values: columns.map((c) => (r[c.idx] == null ? '' : String(r[c.idx]))) }));
  return { columns, rows };
}
// Nutzer-Wunsch (Folgeturn 3): Import einer Elementensammlung läuft gegen
// das FESTE Format ihrer Elementenvorlage, nicht mehr gegen eine pro Import
// neu erkannte Kopfzeile. Sucht in der Kopfzeile der Datei für jede
// erwartete Spalten-Bezeichnung (Groß-/Kleinschreibung und Leerraum werden
// ignoriert) die passende Spalte und ordnet die Werte in der festen
// Reihenfolge der Vorlage an - die Spaltenreihenfolge in der Datei selbst
// spielt also keine Rolle. Fehlt eine erwartete Spalte in der Datei, bleibt
// sie in jeder Zeile leer; solche fehlenden Spalten werden als "missing"
// zurückgegeben, damit die UI den Nutzer warnen kann.
function parseFixedFormatSheet(ws, fixedColumns) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = 0;
  for (let r = 0; r < aoa.length; r++) {
    const filled = (aoa[r] || []).filter((c) => String(c == null ? '' : c).trim() !== '').length;
    if (filled >= 2) { headerRowIdx = r; break; }
  }
  const headerRow = aoa[headerRowIdx] || [];
  const fileColIndexByLabel = new Map();
  headerRow.forEach((cell, i) => {
    const key = esNormalizeLower(cell);
    if (key && !fileColIndexByLabel.has(key)) fileColIndexByLabel.set(key, i);
  });
  const missing = [];
  const mapping = fixedColumns.map((c) => {
    const idx = fileColIndexByLabel.get(esNormalizeLower(c.label));
    if (idx === undefined) missing.push(c.label);
    return idx;
  });
  const rows = aoa.slice(headerRowIdx + 1)
    .filter((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''))
    .map((r) => ({ values: mapping.map((idx) => (idx === undefined || r[idx] == null) ? '' : String(r[idx])) }));
  return { rows, missing };
}
// ======================================================================
// Nutzer-Wunsch (Folgeturn 11): "eine Möglichkeit ... in den Excel Dateien
// die eingelesen werden einen Link zu einem Dokumentenpfad mir rein zu
// setzen. Wenn dann aber eingelesen wird wird wirklich die Datei zu dem
// Standort hinterlegt und auch in der App angezeugt." Konkretisiert: eine
// Spalte mit Namensschema "Datenpfad <Dokumentname>" (z. B. "Datenpfad
// Lagepläne") wird NIE als normale Tabellenspalte übernommen - ihr Zellwert
// ist ein lokaler Ordner-/Dateipfad, der beim Import aufgelöst wird (über
// die File System Access API, siehe ensureOrdnerZugriff/findEntryByRelativePath
// unten) und als echtes Dokument am jeweiligen Datensatz (Mast bzw.
// generisches Element) hinterlegt wird - sichtbar über die "Dokumente"-
// Kachel im Verknüpfungen-Panel (Mast-Detail/Element-Detail) und im
// "Fotos & Dokumente"-Tab der Handy-App. Gilt für Masttafel UND
// Elementensammlungen gleichermaßen (siehe parseWorkbookSheet-Änderung
// unten für die Masttafel, bzw. hier für Elementensammlungen - dort ist
// keine Änderung an parseFixedFormatSheet nötig, da sie ohnehin nur exakt
// die in der Vorlage definierten Spalten übernimmt und alles andere
// ignoriert).
//
// Browser dürfen aus Sicherheitsgründen nicht selbstständig auf einen
// beliebigen lokalen Dateipfad zugreifen, nur weil er als Text in einer
// Zelle steht - das ist technisch nicht möglich, unabhängig von der
// Implementierung. Die File System Access API (showDirectoryPicker) ist
// der einzige Weg: der Nutzer verknüpft EINMAL (Projekteinstellungen oder
// bei Bedarf direkt beim Import) einen übergeordneten Ordner; danach werden
// Pfade aus der Excel-Datei relativ zu diesem verknüpften Ordner aufgelöst
// (oder per Dateiname-Suche gefunden, falls die exakte Ordnerstruktur nicht
// übereinstimmt). Nur in Chrome/Edge (u. ä.) verfügbar - Firefox/Safari
// unterstützen diese API bislang nicht, dort bleibt der Pfad unaufgelöst.
// ======================================================================

// Erkennt "Datenpfad <Name>"-Spalten in der ROHEN Kopfzeile einer Excel-
// Datei (unabhängig vom sonstigen Spaltenformat) und liest je Datenzeile
// den Pfad-Wert aus. keyColumnLabel (optional): bei Elementensammlungen
// liegt die Schlüsselspalte nicht zwingend an Position 0 der Datei, sondern
// wird - wie beim übrigen Import auch - über ihre Vorlagen-Bezeichnung in
// der echten Kopfzeile gesucht (fehlt sie, wird Position 0 angenommen, wie
// bei der Masttafel, deren Bau-Nr.-Spalte immer ganz links steht).
// Windows legt beim "Pfad kopieren" (Rechtsklick/Umschalt+Rechtsklick im
// Explorer) automatisch Anführungszeichen um den Pfad - ein sehr gängiger
// Weg, wie Nutzer überhaupt an einen Pfad zum Einfügen kommen. Damit ein so
// eingefügter Pfad nicht an genau diesem Umstand scheitert, werden ein
// einzelnes umschließendes Anführungszeichen-Paar (gerade oder typografisch)
// hier großzügig entfernt, bevor der Pfad weiterverwendet wird.
function stripPathQuotes(p) {
  const s = String(p == null ? '' : p).trim();
  const m = /^["'“”‘’](.*)["'“”‘’]$/.exec(s);
  return m ? m[1].trim() : s;
}
function extractDatenpfadRefs(ws, keyColumnLabel) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = 0;
  for (let r = 0; r < aoa.length; r++) {
    const filled = (aoa[r] || []).filter((c) => String(c == null ? '' : c).trim() !== '').length;
    if (filled >= 2) { headerRowIdx = r; break; }
  }
  const headerRow = aoa[headerRowIdx] || [];
  const defs = [];
  headerRow.forEach((cell, i) => {
    const label = String(cell == null ? '' : cell).trim();
    const m = /^Datenpfad\b[:\-\s]*(.*)$/i.exec(label);
    if (m) defs.push({ idx: i, docType: (m[1] || '').trim() || 'Dokument' });
  });
  if (!defs.length) return [];
  let keyIdx = 0;
  if (keyColumnLabel) {
    const found = headerRow.findIndex((c) => esNormalizeLower(c) === esNormalizeLower(keyColumnLabel));
    if (found >= 0) keyIdx = found;
  }
  const refs = [];
  aoa.slice(headerRowIdx + 1).forEach((row) => {
    const rawKey = row[keyIdx];
    const key = String(rawKey == null ? '' : rawKey).trim();
    if (!key) return;
    defs.forEach((d) => {
      const raw = row[d.idx];
      const pathVal = stripPathQuotes(raw);
      if (pathVal) refs.push({ rowKey: rawKey, docType: d.docType, path: pathVal });
    });
  });
  return refs;
}

// ---------- Ordner-Verknüpfung (File System Access API) ----------
// Der einmal verknüpfte Ordner-Handle wird in IndexedDB abgelegt (nicht
// localStorage - Handles sind nicht JSON-serialisierbar, IndexedDB kann sie
// aber direkt strukturiert klonen), projekt-gescoped über denselben
// pKey()-Mechanismus wie alles andere.
const DATENPFAD_DB_NAME = 'levelbuild_datenpfad_db';
const DATENPFAD_DB_STORE = 'ordner';
function openDatenpfadDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB nicht verfügbar')); return; }
    const req = indexedDB.open(DATENPFAD_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DATENPFAD_DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveOrdnerHandle(key, handle) {
  const db = await openDatenpfadDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATENPFAD_DB_STORE, 'readwrite');
    tx.objectStore(DATENPFAD_DB_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function loadOrdnerHandle(key) {
  const db = await openDatenpfadDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATENPFAD_DB_STORE, 'readonly');
    const req = tx.objectStore(DATENPFAD_DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function clearOrdnerHandle(key) {
  const db = await openDatenpfadDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATENPFAD_DB_STORE, 'readwrite');
    tx.objectStore(DATENPFAD_DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function datenpfadOrdnerDbKey() { return pKey('datenpfad_ordner'); }

// promptIfMissing=true darf NUR direkt aus einem Klick-Handler heraus
// aufgerufen werden (showDirectoryPicker()/requestPermission() verlangen
// eine echte Nutzer-Geste, sonst wirft der Browser einen SecurityError) -
// beim automatischen Import (FileReader.onload) also immer false, dort wird
// nur eine bereits erteilte Berechtigung stillschweigend geprüft.
async function ensureOrdnerZugriff(promptIfMissing) {
  if (!window.showDirectoryPicker) return { ok: false, reason: 'unsupported' };
  const dbKey = datenpfadOrdnerDbKey();
  let handle = null;
  try { handle = await loadOrdnerHandle(dbKey); } catch (e) { handle = null; }
  if (handle) {
    try {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') return { ok: true, handle };
      if (perm === 'prompt' && promptIfMissing) {
        const req = await handle.requestPermission({ mode: 'read' });
        if (req === 'granted') return { ok: true, handle };
      }
    } catch (e) { /* Handle ungültig/veraltet - unten neu verknüpfen */ }
  }
  if (!promptIfMissing) return { ok: false, reason: handle ? 'permission' : 'not-linked' };
  try {
    const newHandle = await window.showDirectoryPicker();
    await saveOrdnerHandle(dbKey, newHandle);
    return { ok: true, handle: newHandle };
  } catch (e) {
    return { ok: false, reason: 'cancelled' };
  }
}
async function getVerknuepfterOrdnerName() {
  try {
    const handle = await loadOrdnerHandle(datenpfadOrdnerDbKey());
    return handle ? handle.name : null;
  } catch (e) { return null; }
}
async function trenneOrdner() {
  try { await clearOrdnerHandle(datenpfadOrdnerDbKey()); } catch (e) { /* ignore */ }
}

// ---------- Pfad-Auflösung innerhalb des verknüpften Ordners ----------
function splitPathSegments(p) {
  return String(p || '').split(/[\\/]+/).map((s) => s.trim()).filter(Boolean);
}
async function walkDownFromSegments(rootHandle, segments) {
  let cur = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = await cur.getDirectoryHandle(segments[i]);
  }
  const last = segments[segments.length - 1];
  try {
    return { kind: 'file', handle: await cur.getFileHandle(last) };
  } catch (e) {
    return { kind: 'dir', handle: await cur.getDirectoryHandle(last) };
  }
}
async function searchByNameRecursive(dirHandle, targetNameLower, budget) {
  if (budget.visited > budget.limit) return null;
  const subDirs = [];
  for await (const [name, handle] of dirHandle.entries()) {
    budget.visited++;
    if (budget.visited > budget.limit) return null;
    if (name.toLowerCase() === targetNameLower) {
      return { kind: handle.kind === 'file' ? 'file' : 'dir', handle };
    }
    if (handle.kind === 'directory') subDirs.push(handle);
  }
  for (const sub of subDirs) {
    const found = await searchByNameRecursive(sub, targetNameLower, budget);
    if (found) return found;
  }
  return null;
}
// Versucht, einen absoluten lokalen Pfad (wie er in der Excel-Zelle steht)
// innerhalb des verknüpften Ordners zu finden - erst relativ (Name des
// verknüpften Ordners taucht im Pfad auf, alles danach wird durchlaufen),
// dann als kompletter Pfad relativ zur Wurzel selbst, zuletzt per
// rekursiver Dateiname-Suche im gesamten verknüpften Baum (begrenzt, um
// sehr große Ordnerstrukturen nicht unbegrenzt zu durchsuchen).
async function findEntryByRelativePath(rootHandle, absolutePath) {
  const segments = splitPathSegments(absolutePath);
  if (!segments.length) return null;
  const rootNameLower = rootHandle.name.toLowerCase();
  const idx = segments.findIndex((s) => s.toLowerCase() === rootNameLower);
  if (idx >= 0 && idx < segments.length - 1) {
    try { return await walkDownFromSegments(rootHandle, segments.slice(idx + 1)); } catch (e) { /* weiter */ }
  }
  try { return await walkDownFromSegments(rootHandle, segments); } catch (e) { /* weiter */ }
  const target = segments[segments.length - 1].toLowerCase();
  try { return await searchByNameRecursive(rootHandle, target, { visited: 0, limit: 8000 }); } catch (e) { return null; }
}
async function fileHandleToDatenpfadDoc(fileHandle, meta) {
  const file = await fileHandle.getFile();
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const mime = file.type || 'application/octet-stream';
  return {
    id: 'dp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: file.name,
    typ: meta.docType,
    quellPfad: meta.path,
    size: file.size,
    mime,
    url: 'data:' + mime + ';base64,' + uint8ToBase64Global(bytes),
    attachedAt: new Date().toISOString(),
    sourceFile: meta.sourceFileName || null,
  };
}
async function resolveDatenpfadEntry(rootHandle, ref) {
  const found = await findEntryByRelativePath(rootHandle, ref.path);
  if (!found) return { ref, docs: [] };
  if (found.kind === 'file') {
    const doc = await fileHandleToDatenpfadDoc(found.handle, ref);
    return { ref, docs: [doc] };
  }
  const docs = [];
  for await (const [, entry] of found.handle.entries()) {
    if (entry.kind === 'file') docs.push(await fileHandleToDatenpfadDoc(entry, ref));
  }
  return { ref, docs };
}
// Löst alle "Datenpfad …"-Verweise einer Import-Datei auf und ruft attachFn
// (rowKeyRaw, docs[]) für jeden Treffer auf. Läuft NACH dem eigentlichen
// (synchronen) Datenimport, da sie selbst asynchron ist - der Import selbst
// wartet nicht darauf. onStatus (optional) wird mit einem Abschluss-Objekt
// {attached, notFound, linked, reason} aufgerufen, sobald fertig - z. B. um
// den Nutzer auf einen noch nicht verknüpften Ordner hinzuweisen.
async function resolveAndAttachDatenpfade(refs, sourceFileName, attachFn, promptIfMissing, onStatus) {
  if (!refs || !refs.length) { if (onStatus) onStatus({ attached: 0, notFound: 0, linked: true, reason: null }); return; }
  const access = await ensureOrdnerZugriff(!!promptIfMissing);
  if (!access.ok) { if (onStatus) onStatus({ attached: 0, notFound: 0, linked: false, reason: access.reason }); return; }
  let attached = 0, notFound = 0;
  for (const ref of refs) {
    try {
      const result = await resolveDatenpfadEntry(access.handle, Object.assign({}, ref, { sourceFileName }));
      if (result.docs.length) { attachFn(ref.rowKey, result.docs); attached += result.docs.length; }
      else notFound++;
    } catch (e) { notFound++; }
  }
  if (onStatus) onStatus({ attached, notFound, linked: true, reason: null });
}

// Wird nach JEDEM Excel-Import (Masttafel + Elementensammlungen) mit den
// gefundenen Datenpfad-Verweisen dieser Datei aufgerufen. Versucht zunächst
// still (ohne Berechtigungs-Dialog) aufzulösen - ist noch kein Ordner
// verknüpft (oder die Berechtigung abgelaufen), wird ein kleines Modal mit
// einem "Ordner verknüpfen"-Button gezeigt (dessen eigener Klick eine
// gültige Nutzer-Geste für showDirectoryPicker() ist). attachFn(rowKeyRaw,
// docs[]) hinterlegt die gefundenen Dokumente projektspezifisch.
function handleDatenpfadAfterImport(refs, fileName, attachFn) {
  if (!refs || !refs.length) return;
  const docTypeNames = Array.from(new Set(refs.map((r) => r.docType)));
  resolveAndAttachDatenpfade(refs, fileName, attachFn, false, (status) => {
    if (status.linked) {
      if (status.attached || status.notFound) {
        console.log(`Datenpfad-Import: ${status.attached} Dokument(e) hinterlegt, ${status.notFound} Verweis(e) nicht gefunden.`);
      }
      return;
    }
    if (status.reason === 'unsupported') {
      alert('Diese Datei enthält Datenpfad-Verweise (' + docTypeNames.join(', ') + '), aber dieser Browser unterstützt das automatische Einlesen lokaler Dateien nicht (nur Chrome/Edge u. ä.). Die Dokumente müssen manuell hinzugefügt werden.');
      return;
    }
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');
    if (!overlay || !titleEl || !bodyEl || !footerEl) return;
    titleEl.textContent = 'Ordner für Dokumente verknüpfen';
    bodyEl.innerHTML = `<div style="font-size:13px; color:var(--gray-500); line-height:1.5;">
      Diese Datei enthält ${refs.length} Datenpfad-Verweis(e) (${esc(docTypeNames.join(', '))}). Um diese Dokumente automatisch einzulesen, muss einmalig ein übergeordneter Ordner verknüpft werden - der Browser fragt danach einmalig nach der Berechtigung.
    </div>`;
    footerEl.innerHTML = `<button type="button" class="matt-tool-btn" id="dp-link-cancel">Später</button>
      <button type="button" class="btn-primary" id="dp-link-now">Ordner verknüpfen</button>`;
    overlay.hidden = false;
    function esc(v) { const d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    const cancelBtn = document.getElementById('dp-link-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { overlay.hidden = true; });
    const linkBtn = document.getElementById('dp-link-now');
    if (linkBtn) linkBtn.addEventListener('click', () => {
      resolveAndAttachDatenpfade(refs, fileName, attachFn, true, (status2) => {
        overlay.hidden = true;
        if (status2.linked) {
          alert(`Ordner verknüpft: ${status2.attached} Dokument(e) hinterlegt${status2.notFound ? ', ' + status2.notFound + ' Verweis(e) nicht gefunden' : ''}.`);
        } else if (status2.reason !== 'cancelled') {
          alert('Ordner konnte nicht verknüpft werden.');
        }
      });
    });
  });
}

// ---------- Speicher der aufgelösten Dokumente ----------
// Mast-Dokumente: { [mastKeyNormalized]: [doc, ...] } - eigener, von
// DOKUMENTE_KEY (Protokoll-generierte PDFs) unabhängiger Speicher, analog
// zum übrigen "paralleles System statt bestehenden Code verändern"-Muster
// dieser Codebasis.
const MAST_DOKUMENTE_KEY = 'levelbuild_mast_datenpfad_dokumente';
migrateToProjectScopedKey(MAST_DOKUMENTE_KEY);
function loadMastDatenpfadDokumente() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_DOKUMENTE_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastDatenpfadDokumente(m) {
  try { localStorage.setItem(pKey(MAST_DOKUMENTE_KEY), JSON.stringify(m)); } catch (e) { /* ignore */ }
}
function attachMastDatenpfadDokumente(mastKeyRaw, docs) {
  if (!docs || !docs.length) return;
  const key = esNormalize(mastKeyRaw);
  if (!key) return;
  const map = loadMastDatenpfadDokumente();
  map[key] = (map[key] || []).concat(docs);
  saveMastDatenpfadDokumente(map);
}
function getMastDatenpfadDokumente(mastKeyRaw) {
  return loadMastDatenpfadDokumente()[esNormalize(mastKeyRaw)] || [];
}

// Element-Dokumente: { [sammlungId]: { [bauabschnittId]: { [rowKeyNormalized]: [doc, ...] } } }
const ELEMENT_DOKUMENTE_KEY = 'levelbuild_element_datenpfad_dokumente';
migrateToProjectScopedKey(ELEMENT_DOKUMENTE_KEY);
function loadElementDatenpfadDokumente() {
  try { return JSON.parse(localStorage.getItem(pKey(ELEMENT_DOKUMENTE_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveElementDatenpfadDokumente(m) {
  try { localStorage.setItem(pKey(ELEMENT_DOKUMENTE_KEY), JSON.stringify(m)); } catch (e) { /* ignore */ }
}
function attachElementDatenpfadDokumente(sammlungId, bauabschnittId, rowKeyRaw, docs) {
  if (!docs || !docs.length) return;
  const key = esNormalize(rowKeyRaw);
  if (!key) return;
  const map = loadElementDatenpfadDokumente();
  const s = map[sammlungId] || {};
  const b = s[bauabschnittId] || {};
  b[key] = (b[key] || []).concat(docs);
  s[bauabschnittId] = b;
  map[sammlungId] = s;
  saveElementDatenpfadDokumente(map);
}
function getElementDatenpfadDokumente(sammlungId, bauabschnittId, rowKeyRaw) {
  const map = loadElementDatenpfadDokumente();
  const s = map[sammlungId] || {};
  const b = s[bauabschnittId] || {};
  return b[esNormalize(rowKeyRaw)] || [];
}

// Versionierung/Diff exakt wie Masttafel importIntoStore (zeilenweiser,
// whitespace-unempfindlicher Vergleich gegen die jeweils letzte Version, pro
// geändertem Feld ein eigener changesLog-Eintrag für den Änderungsbericht,
// neue Version nur bei tatsächlicher Änderung) - eigenständige, von der
// Masttafel-IIFE unabhängige Funktion. Import landet immer im übergebenen
// Bauabschnitt dieser Sammlung. Schlüssel = erste Spalte (values[0]).
function importGenericElementIntoStore(sammlungId, bauabschnittId, fixedColumns, parsedRows, fileMeta) {
  const map = loadElementDaten();
  const entry = map[sammlungId] || { activeBauabschnittId: bauabschnittId, zoom: 100, hiddenCols: [], sections: {} };
  const section = entry.sections[bauabschnittId] || { rowsByKey: [], changesLog: [], files: [] };
  const rowsByKeyMap = new Map(section.rowsByKey || []);
  const summary = { newKeys: 0, changedKeys: 0, unchangedKeys: 0 };
  parsedRows.forEach((row) => {
    const rawKey = row.values[0];
    const key = esNormalize(rawKey);
    if (!key) return;
    const existing = rowsByKeyMap.get(key);
    if (!existing) {
      rowsByKeyMap.set(key, { displayKey: rawKey, versions: [{ version: 1, values: row.values, importedAt: fileMeta.importedAt, fileName: fileMeta.name }] });
      summary.newKeys++;
      return;
    }
    const latest = existing.versions[existing.versions.length - 1];
    const diffs = [];
    for (let i = 0; i < row.values.length; i++) {
      const a = esNormalize(latest.values[i]);
      const b = esNormalize(row.values[i]);
      if (a !== b) diffs.push({ colLabel: fixedColumns[i] ? fixedColumns[i].label : 'Spalte ' + (i + 1), oldVal: latest.values[i], newVal: row.values[i] });
    }
    if (!diffs.length) { summary.unchangedKeys++; return; }
    const newVersion = latest.version + 1;
    existing.versions.push({ version: newVersion, values: row.values, importedAt: fileMeta.importedAt, fileName: fileMeta.name });
    section.changesLog = section.changesLog || [];
    diffs.forEach((d) => {
      section.changesLog.push({
        key: existing.displayKey, fromVersion: latest.version, toVersion: newVersion,
        colLabel: d.colLabel, oldVal: d.oldVal, newVal: d.newVal,
        importedAt: fileMeta.importedAt, fileName: fileMeta.name,
      });
    });
    summary.changedKeys++;
  });
  section.rowsByKey = Array.from(rowsByKeyMap.entries());
  section.files = (section.files || []).concat([fileMeta]);
  entry.sections[bauabschnittId] = section;
  entry.activeBauabschnittId = bauabschnittId;
  map[sammlungId] = entry;
  saveElementDaten(map);
  return summary;
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
        deleteElementSectionData(id);
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
// Bestelldaten (Einkauf): projekt-gescopte Vorbelegung für neue
// Bestellungen (Kostenstelle, Bauvorhaben, Einkäufer, Lieferanschrift) -
// siehe EINKAUF_EINSTELLUNGEN_KEY weiter oben. Nur aktiv, wenn #eke-save
// existiert (Projekteinstellungen-Seite).
// ======================================================================
(function () {
  const saveBtn = document.getElementById('eke-save');
  if (!saveBtn) return;

  const FIELD_IDS = {
    kostenstelle: 'eke-kostenstelle',
    bauvorhaben: 'eke-bauvorhaben',
    einkaeuferName: 'eke-einkaeufer-name',
    einkaeuferTelefon: 'eke-einkaeufer-telefon',
    einkaeuferEmail: 'eke-einkaeufer-email',
    lieferanschriftFirma: 'eke-lieferanschrift-firma',
    lieferanschriftZusatz: 'eke-lieferanschrift-zusatz',
    lieferanschriftStrasse: 'eke-lieferanschrift-strasse',
    lieferanschriftPlzOrt: 'eke-lieferanschrift-plzort',
  };

  function render() {
    const obj = loadEinkaufEinstellungen();
    Object.keys(FIELD_IDS).forEach((key) => {
      const el = document.getElementById(FIELD_IDS[key]);
      if (el) el.value = obj[key] || '';
    });
    const hint = document.getElementById('eke-saved-hint');
    if (hint) hint.style.display = 'none';
  }

  saveBtn.addEventListener('click', () => {
    const obj = {};
    Object.keys(FIELD_IDS).forEach((key) => {
      const el = document.getElementById(FIELD_IDS[key]);
      obj[key] = el ? el.value.trim() : '';
    });
    saveEinkaufEinstellungen(obj);
    const hint = document.getElementById('eke-saved-hint');
    if (hint) {
      hint.style.display = 'block';
      setTimeout(() => { hint.style.display = 'none'; }, 2500);
    }
  });

  const prevOnShowPE4 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE4) prevOnShowPE4();
    render();
  };

  render();
})();

// ======================================================================
// Projekteinstellungen: Dokumentenordner-Verknüpfung (Datenpfad-Import,
// siehe Kommentar bei extractDatenpfadRefs/ensureOrdnerZugriff weiter oben
// in app.js). Only runs on Projekteinstellungen (guarded by #dp-ordner-link).
// ======================================================================
(function () {
  const linkBtn = document.getElementById('dp-ordner-link');
  if (!linkBtn) return;
  const unlinkBtn = document.getElementById('dp-ordner-unlink');
  const statusEl = document.getElementById('dp-ordner-status');
  const hintEl = document.getElementById('dp-ordner-hint');

  function showHint(text) {
    if (!hintEl) return;
    hintEl.textContent = text;
    hintEl.style.display = text ? 'block' : 'none';
  }

  async function refreshStatus() {
    if (!window.showDirectoryPicker) {
      if (statusEl) statusEl.textContent = 'Nicht unterstützt';
      linkBtn.disabled = true;
      if (unlinkBtn) unlinkBtn.style.display = 'none';
      showHint('Dieser Browser unterstützt das Verknüpfen eines lokalen Ordners nicht (nur Chrome/Edge u. ä.).');
      return;
    }
    let name = null;
    try { name = await getVerknuepfterOrdnerName(); } catch (e) { name = null; }
    if (name) {
      if (statusEl) statusEl.textContent = name;
      if (unlinkBtn) unlinkBtn.style.display = '';
      linkBtn.textContent = 'Anderen Ordner verknüpfen';
      showHint('');
    } else {
      if (statusEl) statusEl.textContent = 'Noch kein Ordner verknüpft';
      if (unlinkBtn) unlinkBtn.style.display = 'none';
      linkBtn.textContent = 'Ordner verknüpfen';
      showHint('');
    }
  }

  linkBtn.addEventListener('click', () => {
    // Direkter Klick-Handler = gültige Nutzer-Geste für showDirectoryPicker().
    ensureOrdnerZugriff(true).then((res) => {
      if (res.ok) { refreshStatus(); return; }
      if (res.reason !== 'cancelled') showHint('Ordner konnte nicht verknüpft werden.');
    });
  });
  if (unlinkBtn) {
    unlinkBtn.addEventListener('click', () => {
      if (!confirm('Verknüpfung mit dem Dokumentenordner entfernen? Bereits eingelesene Dokumente bleiben erhalten, künftige Datenpfad-Importe müssen den Ordner erneut verknüpfen.')) return;
      trenneOrdner().then(refreshStatus);
    });
  }

  const prevOnShowPE6 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE6) prevOnShowPE6();
    refreshStatus();
  };

  refreshStatus();
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
  // Eigenständige Kopie von taskProtokollIds (Tätigkeitslisten-Editor-IIFE,
  // Zeile ~3307) - jede Seiten-IIFE hat ihren eigenen Scope, siehe
  // Codebase-Konvention. Liest die einer Tätigkeit zugeordneten Protokoll-
  // IDs, egal ob als (neueres) Array protokollIds oder (älteres) Einzelfeld
  // protokollId gespeichert.
  function taskProtokollIdsFzl(t) {
    if (!t) return [];
    if (Array.isArray(t.protokollIds)) return t.protokollIds;
    if (t.protokollId) return [t.protokollId];
    return [];
  }
  function buildTaskColumns(usedLists) {
    const map = new Map();
    usedLists.forEach((l) => {
      (l.tasks || []).forEach((t) => {
        const titel = String(t.titel || '').trim();
        const key = titel ? ('titel::' + titel.toLowerCase()) : ('solo::' + l.id + '::' + t.id);
        const label = titel || `(ohne Titel) – ${l.name}`;
        if (!map.has(key)) map.set(key, { key, label, entries: [] });
        map.get(key).entries.push({
          listId: l.id, listName: l.name, taskId: t.id, taetigkeitsartId: t.taetigkeitsartId || null,
          protokollIds: t.dokuArt === 'protokoll' ? taskProtokollIdsFzl(t) : [],
        });
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
      entries: [{
        listId: list.id, listName: list.name, taskId: t.id, taetigkeitsartId: t.taetigkeitsartId || null,
        protokollIds: t.dokuArt === 'protokoll' ? taskProtokollIdsFzl(t) : [],
      }],
    }));
  }

  // Nutzer-Wunsch: "Beit tätigkeiten welche 2 Protokolle zugeordnet haben
  // muss die ansicht in der Fertigstellungliste auch in 2 Getilt werden...
  // Das hat nichts mit der / oder so zu tun sodern damit das der Tätigkeit
  // 2 Protokolle zugeorndet wurden." - eine Tätigkeit mit mehreren
  // zugeordneten Protokollen (Oder-Auswahl, siehe Handy-App-Redesign) wird
  // NICHT als eine gemeinsame Spalte gezeigt, sondern als je eine
  // Unterspalte PRO Protokoll, gruppiert unter dem Tätigkeitsnamen als
  // gemeinsame Kopfzeile (siehe taskGroupRowHtml). Läuft NACH
  // buildTaskColumns()/buildSingleListColumns() und VOR buildAllColumns(),
  // damit Masttafel-Spalten (nie aufgeteilt) unberührt bleiben. Die Union
  // der Protokoll-IDs wird über ALLE (in der Gesamtansicht ggf. aus
  // mehreren Listen zusammengeführten) Tätigkeits-Varianten dieser Spalte
  // gebildet - protokollIds verweisen projektweit auf dieselbe Protokoll-
  // Kopie (loadProtokollProjectList()), sind also über Listen hinweg direkt
  // vergleichbar, kein Name-Abgleich nötig.
  function expandProtokollSplitColumns(taskCols) {
    const protokolle = (typeof loadProtokollProjectList === 'function') ? loadProtokollProjectList() : [];
    const protokollName = (id) => { const p = protokolle.find((x) => x.id === id); return p ? p.name : '(gelöschtes Protokoll)'; };
    const result = [];
    (taskCols || []).forEach((c) => {
      const idOrder = [];
      const idSet = new Set();
      (c.entries || []).forEach((e) => {
        (e.protokollIds || []).forEach((pid) => { if (!idSet.has(pid)) { idSet.add(pid); idOrder.push(pid); } });
      });
      if (idOrder.length < 2) { result.push(c); return; }
      idOrder.forEach((pid) => {
        result.push({
          key: c.key + '::pr::' + pid,
          label: protokollName(pid),
          entries: c.entries,
          isProtokollSplit: true,
          protokollId: pid,
          parentKey: c.key,
          parentLabel: c.label,
        });
      });
    });
    return result;
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
  // Nutzer-Wunsch: "zwischen diesen Arten unterschieden und einzelne Arten
  // können in Summe oder Kombination angezeigt werden" - null bedeutet
  // "Alle Arten" (Standard, keine Einschränkung); ist ein Set gesetzt,
  // werden nur noch Aufgaben-Spalten gezeigt, die (mindestens) einer der
  // ausgewählten Arten angehören ("Kombination" mehrerer Arten = mehrere
  // gleichzeitig ausgewählt). Der Sonderwert '__none__' steht für
  // Tätigkeiten ohne zugeordnete Art. Betrifft nur Aufgaben-Spalten -
  // Standort-/Masttafel-Spalten bleiben davon unberührt.
  let fzlArtFilter = null;
  function colTaetigkeitsartIds(c) {
    if (!c || c.isMt) return [];
    const set = new Set();
    (c.entries || []).forEach((e) => { if (e.taetigkeitsartId) set.add(e.taetigkeitsartId); });
    return Array.from(set);
  }
  function applyFzlArtFilter(cols) {
    if (!fzlArtFilter || !fzlArtFilter.size) return cols;
    return cols.filter((c) => {
      if (c.isMt) return true;
      const ids = colTaetigkeitsartIds(c);
      if (!ids.length) return fzlArtFilter.has('__none__');
      return ids.some((id) => fzlArtFilter.has(id));
    });
  }
  // Rendert den Art-Umschalter im Panel-Header (gleiches Bedienkonzept wie
  // renderFzlListSwitcher, aber als Mehrfachauswahl-Checkbox-Menü statt
  // Einzelauswahl, da mehrere Arten gleichzeitig/"in Kombination" gezeigt
  // werden können sollen). Blendet sich selbst aus, solange dem Projekt
  // noch keine einzige Tätigkeitsart zugeordnet ist.
  function renderFzlArtSwitcher() {
    const sw = document.querySelector('.fzl-art-switcher');
    if (!sw) return;
    const arten = (typeof loadTaetigkeitsartProjectList === 'function') ? loadTaetigkeitsartProjectList() : [];
    if (!arten.length) { sw.hidden = true; return; }
    sw.hidden = false;
    const label = sw.querySelector('.segment-current');
    if (label) {
      const n = fzlArtFilter ? fzlArtFilter.size : 0;
      label.textContent = !n ? 'Alle Arten' : (n === 1 ? (arten.concat([{ id: '__none__', name: 'Ohne Art' }]).find((a) => fzlArtFilter.has(a.id)) || {}).name || 'Alle Arten' : `${n} Arten`);
    }
    const menu = sw.querySelector('.segment-menu');
    if (!menu) return;
    const items = arten.concat([{ id: '__none__', name: 'Ohne Art', color: '#8a94a6' }]);
    menu.innerHTML = `<div class="segment-menu-item fzl-art-all${!fzlArtFilter || !fzlArtFilter.size ? ' active' : ''}" data-fzl-art-all>Alle Arten</div>` +
      items.map((a) => `
        <label class="segment-menu-item fzl-art-menu-item">
          <input type="checkbox" data-fzl-art-check="${esc(a.id)}" ${fzlArtFilter && fzlArtFilter.has(a.id) ? 'checked' : ''}>
          <span class="tl-status-chip" style="--tl-color:${esc(a.color || '#8a94a6')}">${esc(a.name)}</span>
        </label>`).join('');
    const allItem = menu.querySelector('[data-fzl-art-all]');
    if (allItem) allItem.addEventListener('click', (e) => {
      e.stopPropagation();
      fzlArtFilter = null;
      render();
    });
    menu.querySelectorAll('[data-fzl-art-check]').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-fzl-art-check');
        if (!fzlArtFilter) fzlArtFilter = new Set();
        if (cb.checked) fzlArtFilter.add(id); else fzlArtFilter.delete(id);
        if (!fzlArtFilter.size) fzlArtFilter = null;
        render();
      });
    });
  }

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
    // Protokoll-Unterspalte (siehe expandProtokollSplitColumns): gehört das
    // zugeordnete Aufgaben-Exemplar an diesem Standort überhaupt zu diesem
    // Protokoll, gilt es nicht als "erledigt/offen" für DIESE Unterspalte,
    // sondern schlicht als "entfällt" (siehe bodyRowsHtml für die exakt
    // gleiche Logik).
    if (c.isProtokollSplit && !(match.protokollIds || []).includes(c.protokollId)) {
      return { display: 'Entfällt', sortKey: 'zzz9-entfaellt' };
    }
    const done = mastAbschluss[match.taskId];
    if (done && done.datum) {
      if (c.isProtokollSplit) {
        const pd = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
        const filledPid = ((pd[m.mastKey] || {})[match.taskId] || {}).protokollId || null;
        if (filledPid !== c.protokollId) return { display: 'Entfällt', sortKey: 'zzz9-entfaellt' };
      }
      return { display: fmtDatumFzl(done.datum), sortKey: done.datum };
    }
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
    if (c.isProtokollSplit && !(match.protokollIds || []).includes(c.protokollId)) return { na: true, val: '' };
    const done = mastAbschluss[match.taskId];
    if (done && done.datum && c.isProtokollSplit) {
      const pd = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
      const filledPid = ((pd[m.mastKey] || {})[match.taskId] || {}).protokollId || null;
      if (filledPid !== c.protokollId) return { na: true, val: '' };
    }
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
    renderFzlArtSwitcher();

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

    const rawTaskCols = isGesamt ? buildTaskColumns(usedLists) : buildSingleListColumns(activeList);
    const allTaskCols = expandProtokollSplitColumns(rawTaskCols);
    const mtCols = (typeof getKnownMasttafelColumns === 'function') ? getKnownMasttafelColumns() : [];
    const allCols = buildAllColumns(allTaskCols, mtCols);
    const protokollDaten = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
    const config = currentFzlConfig(allCols);
    const hiddenSet = new Set(config.hidden || []);
    const frozenSet = new Set(config.frozen || []);
    const visibleCols = applyFzlArtFilter(orderedAllColumns(allCols, config).filter((c) => !hiddenSet.has(c.key)));

    if (!visibleCols.length) {
      return { ok: false, message: fzlArtFilter && fzlArtFilter.size
        ? 'Keine Spalte entspricht der aktuellen Art-Auswahl - über „Alle Arten" oben wieder zurücksetzen.'
        : 'In der aktuellen Ansicht sind keine Spalten ausgewählt - über „Spalten konfigurieren" wieder welche einblenden.' };
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
      protokollDaten,
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
  // Die (erste) Tätigkeitsart einer Spalte - bei einer in der Gesamtansicht
  // zusammengeführten Spalte (mehrere gleichnamige Tätigkeiten aus
  // verschiedenen Listen) kann das theoretisch uneinheitlich sein; für die
  // Gruppierungs-Kopfzeile wird dann bewusst nur die erste gefundene Art
  // gezeigt, statt die Spalte künstlich aufzuteilen.
  function colArtInfo(c) {
    const ids = colTaetigkeitsartIds(c);
    return ids.length ? resolveTaetigkeitsart(ids[0]) : null;
  }
  // Nutzer-Wunsch: "Vielleicht eine Zeile davor wo das dann drinne steht so
  // übergeordnet" - eine zusätzliche, schmale Kopfzeile ÜBER der normalen
  // Spaltenkopfzeile, die zusammenhängende Aufgaben-Spalten derselben
  // Tätigkeitsart farblich gruppiert. Bewusst KEIN echtes colspan: sowohl
  // das Fixieren/Frozen-Offset (updateFzlFrozenOffsets) als auch das Ziehen
  // einer Spalte per Griff (wireHeaderDrag) rechnen mit genau einer <th> pro
  // Spalten-Key in JEDER Kopfzeile - eine <th> pro Spalte bleibt daher auch
  // hier bestehen, nur die Beschriftung erscheint ausschließlich auf der
  // jeweils ersten Spalte einer zusammenhängenden Gruppe (farbige
  // Hintergrundfläche + Unterstrich signalisieren den Zusammenhang optisch).
  function artRowHtml(d) {
    if (!d.visibleCols.some((c) => colArtInfo(c))) return ''; // keine Spalte hat überhaupt eine Art -> Zeile ganz weglassen
    let prevArtId = null;
    let html = '<tr class="fzl-art-row"><th class="fzl-mast-col-head fzl-art-cell" data-fzl-col="__standort__"></th>';
    d.visibleCols.forEach((c) => {
      const art = colArtInfo(c);
      const isFirstOfRun = !art || art.id !== prevArtId;
      prevArtId = art ? art.id : null;
      const style = art ? `background:${esc(art.color)}22; box-shadow: inset 0 -2px 0 ${esc(art.color)};` : '';
      const label = art && isFirstOfRun ? `<span class="fzl-art-row-label" style="color:${esc(art.color)}">${esc(art.name)}</span>` : '';
      html += `<th class="fzl-task-head fzl-art-cell" data-fzl-col="${escAttrFzl(c.key)}" style="${style}">${label}</th>`;
    });
    html += '</tr>';
    return html;
  }
  // Nutzer-Wunsch: "Beit tätigkeiten welche 2 Protokolle zugeordnet haben
  // muss die ansicht in der Fertigstellungliste auch in 2 Getilt werden...
  // z.B. ist ... die Tätigkeit Rammen/Bohren ... zwei möglichkeiten" - eine
  // zusätzliche schmale Kopfzeile ÜBER der normalen Spaltenkopfzeile, die
  // die (durch expandProtokollSplitColumns) aufgeteilten Protokoll-
  // Unterspalten wieder optisch unter dem gemeinsamen Tätigkeitsnamen
  // zusammenfasst (z.B. "Rammen/Bohren" über "Rammen"|"Bohren") - exakt
  // dasselbe Prinzip wie die Tätigkeitsart-Kopfzeile (artRowHtml) direkt
  // oberhalb, nur für eine andere Gruppierungsebene; beide Zeilen können
  // gleichzeitig erscheinen (Art UND Protokoll-Aufteilung). Bewusst KEIN
  // echtes colspan, aus demselben Grund wie bei artRowHtml (Frozen-Offset/
  // Spalten-Drag rechnen mit genau einer <th> pro Spalten-Key in jeder
  // Kopfzeile).
  function taskGroupRowHtml(d) {
    if (!d.visibleCols.some((c) => c.isProtokollSplit)) return ''; // keine aufgeteilte Spalte vorhanden -> Zeile ganz weglassen
    let prevParentKey = null;
    let html = '<tr class="fzl-taskgroup-row"><th class="fzl-mast-col-head fzl-taskgroup-cell" data-fzl-col="__standort__"></th>';
    d.visibleCols.forEach((c) => {
      const isSplit = !!c.isProtokollSplit;
      const isFirstOfRun = !isSplit || c.parentKey !== prevParentKey;
      prevParentKey = isSplit ? c.parentKey : null;
      const label = isSplit && isFirstOfRun ? `<span class="fzl-taskgroup-row-label">${esc(c.parentLabel)}</span>` : '';
      html += `<th class="fzl-task-head fzl-taskgroup-cell${isSplit ? ' fzl-taskgroup-cell-active' : ''}" data-fzl-col="${escAttrFzl(c.key)}">${label}</th>`;
    });
    html += '</tr>';
    return html;
  }
  function headRowHtml(d) {
    let html = `<tr class="fzl-head-row"><th class="fzl-mast-col-head${fzlSortCol === '__standort__' ? ' th-sorted' : ''}" data-fzl-col="__standort__">${headerLabelHtml('Standort', '__standort__')}</th>`;
    d.visibleCols.forEach((c) => {
      const cls = 'fzl-task-head' + (c.isMt ? ' fzl-mt-head' : '') + (fzlSortCol === c.key ? ' th-sorted' : '');
      const tip = c.isMt ? 'Masttafel-Spalte' : ((c.isProtokollSplit ? `Protokoll "${c.label}" der Tätigkeit "${c.parentLabel}" – ` : '') + 'Aufgabe aus: ' + c.entries.map((e) => e.listName).filter((v, i, arr) => arr.indexOf(v) === i).join(', '));
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
          } else if (c.isProtokollSplit && !(match.protokollIds || []).includes(c.protokollId)) {
            // Diese Tätigkeits-Variante (in der tatsächlich zugeordneten
            // Liste) ist diesem Protokoll gar nicht zugeordnet - z.B. wenn
            // dieselbe Tätigkeit in einer anderen Liste ein anderes
            // Protokoll-Set hat. Dann gilt für diese Unterspalte "entfällt",
            // unabhängig vom Erledigt-Status.
            rowHtml += `<td class="fzl-cell fzl-cell-na" data-fzl-col="${escAttrFzl(c.key)}">entfällt</td>`;
          } else {
            const done = mastAbschluss[match.taskId];
            // Nutzer-Wunsch: "Das hat nichts mit der / oder so zu tun sodern
            // damit das der Tätigkeit 2 Protokolle zugeorndet wurden" - bei
            // einer Protokoll-Unterspalte zeigt NUR die Unterspalte des
            // tatsächlich ausgefüllten Protokolls das Datum, alle anderen
            // Unterspalten dieser Tätigkeit zeigen "entfällt" (siehe
            // Bildvorgabe: Rammen/Bohren -> Rammen=Datum, Bohren=entfällt).
            let filledPid = null;
            if (c.isProtokollSplit && done && done.datum) {
              filledPid = ((d.protokollDaten[m.mastKey] || {})[match.taskId] || {}).protokollId || null;
            }
            if (done && done.datum && c.isProtokollSplit && filledPid !== c.protokollId) {
              rowHtml += `<td class="fzl-cell fzl-cell-na" data-fzl-col="${escAttrFzl(c.key)}">entfällt</td>`;
            } else if (done && done.datum) {
              const taskTitelForModal = c.isProtokollSplit ? c.parentLabel : c.label;
              rowHtml += `<td class="fzl-cell fzl-cell-done" data-fzl-col="${escAttrFzl(c.key)}" data-fzl-mast="${escAttrFzl(m.mastKey)}" data-fzl-task="${escAttrFzl(match.taskId)}" data-fzl-mast-label="${escAttrFzl(m.label)}" data-fzl-task-titel="${escAttrFzl(taskTitelForModal)}" data-fzl-list-name="${escAttrFzl(match.listName)}" title="Klicken für das Ereignis (Details)">${esc(fmtDatumFzl(done.datum))}</td>`;
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

  // ---------- "Ereignis"-Detail: Nutzer-Wunsch: "in der Fertigstellungsliste
  // muss es die möglichkeit geben auf ein datum drauf zu klicken dann kommt
  // man in das sogenannte ereignis also alle daten... erstellte dokumente
  // oder hinterlegte bilder... wer hat die tätigkeit wann abgeschlossen
  // welcher standort". Ein Klick auf eine grüne Abschluss-Zelle öffnet ein
  // Modal, das alle für genau dieses eine Paar (Standort, Tätigkeit)
  // tatsächlich vorhandenen Daten bündelt: das Bautagebuch-Ereignis (siehe
  // pushEreignisFuerHeute), die Protokoll-Antworten (falls die Tätigkeit per
  // Protokoll dokumentiert wird), daraus erzeugte PDF-Dokumente (dort - und
  // NUR dort - ist "wer" als Ersteller/Datenerfasser bekannt) sowie die für
  // den Standort hinterlegten Fotos. Bewusst ehrlich: wo Daten schlicht
  // nicht existieren (z.B. "wer", solange nie ein PDF erzeugt wurde), wird
  // das klar als "nicht erfasst" angezeigt statt etwas zu erfinden. Fotos
  // sind im Datenmodell nur je Standort (nicht je Tätigkeit) gespeichert
  // (siehe loadMastFotos) und werden entsprechend gekennzeichnet. ----------
  function fzlFormatBausteinValue(b, val) {
    if (!b) return null;
    if (b.type === 'checkbox') return val === true ? 'Ja' : (val === false ? 'Nein' : null);
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
  function downloadDokumentFzl(doc) {
    try {
      const a = document.createElement('a');
      a.href = doc.pdfBase64;
      a.download = (doc.betreff || 'Protokoll').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* z.B. in Testumgebungen ohne echte Download-Navigation - unkritisch */ }
  }
  function openFzlEreignisModal(mastKey, taskId, mastLabel, taskTitel, listName) {
    if (!mastKey || !taskId) return;
    const abschluss = (loadMastTaskAbschluss()[mastKey] || {})[taskId] || null;
    const task = findTaetigkeitById(taskId);
    const titel = taskTitel || (task ? task.titel : '') || '(ohne Titel)';

    // Bautagebuch-Ereignis(se) zu genau diesem (Standort, Tätigkeit) - kann
    // theoretisch mehrfach vorkommen (Tätigkeit zurückgesetzt und erneut
    // abgeschlossen), deshalb als Liste statt Einzelwert.
    const ereignisse = [];
    (loadBautagebuecher() || []).forEach((bt) => {
      (bt.ereignisse || []).forEach((e) => {
        if (e.mastKey === mastKey && e.taskId === taskId) ereignisse.push(Object.assign({ berichtDatum: bt.datum }, e));
      });
    });
    ereignisse.sort((a, b) => String(a.berichtDatum + (a.uhrzeit || '')).localeCompare(String(b.berichtDatum + (b.uhrzeit || ''))));

    // Protokoll-Antworten, falls diese Tätigkeit per Protokoll dokumentiert wird.
    const protokollDaten = (loadMastProtokollDaten()[mastKey] || {})[taskId] || null;
    const protokoll = protokollDaten ? loadProtokollProjectList().find((p) => p.id === protokollDaten.protokollId) : null;

    // Erstellte PDF-Dokumente zu genau dieser Tätigkeit an diesem Mast - die
    // einzige Stelle, an der "wer" (Ersteller/Datenerfasser) tatsächlich
    // erfasst ist. Ältere Dokumente ohne taskId (vor der Umstellung auf
    // taskId-Schlüsselung erzeugt) fallen auf den Vorlagen-Abgleich zurück.
    const docs = loadDokumente().filter((d) => d.mastKey === mastKey && (d.taskId ? d.taskId === taskId : (protokollDaten && d.protokollId === protokollDaten.protokollId)));
    const wer = docs.length ? Array.from(new Set(docs.map((d) => d.ersteller || d.datenerfasser).filter(Boolean))).join(', ') : '';

    // Fotos: im aktuellen Datenmodell nur je Standort erfasst, nicht je
    // Tätigkeit - deshalb klar als "gesamter Standort" gekennzeichnet, statt
    // fälschlich so zu tun, als gehörten sie zu genau dieser Tätigkeit.
    const fotos = loadMastFotos()[mastKey] || [];

    const infoRow = (label, value) => `<div class="fzl-evt-row"><div class="fzl-evt-label">${esc(label)}</div><div class="fzl-evt-value">${value}</div></div>`;
    const emptyHtml = (text) => `<div class="changelog-empty" style="padding:4px 0;">${esc(text)}</div>`;

    let html = '<div class="fzl-evt-modal">';
    html += '<div class="fzl-evt-section">';
    html += infoRow('Standort', esc(mastLabel || mastKey || '–'));
    html += infoRow('Tätigkeit', esc(titel));
    if (listName) html += infoRow('Tätigkeitsliste', esc(listName));
    html += infoRow('Abgeschlossen am', abschluss && abschluss.datum ? esc(fmtDatumFzl(abschluss.datum)) : '<span class="changelog-empty" style="padding:0; display:inline-block;">nicht erfasst</span>');
    html += infoRow('Abgeschlossen von', wer ? esc(wer) : '<span class="changelog-empty" style="padding:0; display:inline-block;">nicht erfasst (nur bekannt, wenn dazu ein PDF-Dokument erstellt wurde)</span>');
    html += '</div>';

    html += '<div class="fzl-evt-section"><div class="fzl-evt-section-title">Ereignis im Bautagebuch</div>';
    html += ereignisse.length
      ? ereignisse.map((e) => `<div class="fzl-evt-ereignis"><div class="fzl-evt-ereignis-head">${esc(fmtDatumFzl(e.berichtDatum))} · ${esc(e.uhrzeit || '')}</div><div>${esc(e.titel || '')}</div>${e.beschreibung ? `<div class="fzl-evt-ereignis-desc">${esc(e.beschreibung)}</div>` : ''}</div>`).join('')
      : emptyHtml('Kein Bautagebuch-Ereignis zu dieser Tätigkeit gefunden.');
    html += '</div>';

    html += '<div class="fzl-evt-section"><div class="fzl-evt-section-title">Protokoll-Antworten</div>';
    if (!protokollDaten || !protokoll) {
      html += emptyHtml('Für diese Tätigkeit liegen keine Protokoll-Daten vor.');
    } else {
      const fieldsHtml = (protokoll.bausteine || [])
        .filter((b) => b.type !== 'abschnitt')
        .map((b) => {
          const v = fzlFormatBausteinValue(b, protokollDaten.answers ? protokollDaten.answers[b.id] : undefined);
          if (v == null) return '';
          return `<div class="ds-field"><div class="ds-field-label">${esc(b.label || '')}</div><div class="ds-field-value">${v}</div></div>`;
        }).join('');
      html += `<div class="fzl-evt-protokoll-name">${esc(protokoll.name)}</div>` + (fieldsHtml || emptyHtml('Keine ausgefüllten Felder.'));
    }
    html += '</div>';

    html += '<div class="fzl-evt-section"><div class="fzl-evt-section-title">Erstellte Dokumente</div>';
    html += docs.length
      ? docs.map((d) => `<div class="fzl-evt-doc-row"><span>${esc(d.betreff || 'Dokument')} <span class="changelog-empty" style="padding:0; display:inline;">(${esc(d.ersteller || '–')}${d.datenerfasser ? ' / ' + esc(d.datenerfasser) : ''})</span></span><button type="button" class="link-action" data-fzl-doc-download="${esc(d.id)}">Herunterladen</button></div>`).join('')
      : emptyHtml('Keine PDF-Dokumente zu dieser Tätigkeit erstellt.');
    html += '</div>';

    html += '<div class="fzl-evt-section"><div class="fzl-evt-section-title">Fotos am Standort (gesamter Standort, nicht tätigkeitsspezifisch)</div>';
    html += fotos.length
      ? `<div class="fzl-evt-fotos">${fotos.map((f) => `<img src="${esc(f.dataUrl)}" alt="${esc(f.name || 'Foto')}" title="${esc(f.name || '')}">`).join('')}</div>`
      : emptyHtml('Keine Fotos zu diesem Standort hinterlegt.');
    html += '</div></div>';

    openModalFzl('Ereignis', html, '<button type="button" class="matt-tool-btn" id="fzl-evt-close">Schließen</button>');
    const closeBtn = document.getElementById('fzl-evt-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModalFzl);
    modalBodyFzl.querySelectorAll('[data-fzl-doc-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = docs.find((d) => d.id === btn.getAttribute('data-fzl-doc-download'));
        if (doc) downloadDokumentFzl(doc);
      });
    });
  }
  // Delegiert (statt bei jedem render()/refreshBody() neu zu verdrahten) -
  // contentEl selbst bleibt über beide Update-Arten hinweg dasselbe
  // DOM-Element, nur sein innerHTML wechselt.
  contentEl.addEventListener('click', (e) => {
    const cell = e.target && e.target.closest ? e.target.closest('.fzl-cell-done') : null;
    if (!cell) return;
    const mastKey = cell.getAttribute('data-fzl-mast');
    const taskId = cell.getAttribute('data-fzl-task');
    if (!mastKey || !taskId) return;
    openFzlEreignisModal(mastKey, taskId, cell.getAttribute('data-fzl-mast-label'), cell.getAttribute('data-fzl-task-titel'), cell.getAttribute('data-fzl-list-name'));
  });

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
            ${artRowHtml(d)}
            ${taskGroupRowHtml(d)}
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
    const taskCols = expandProtokollSplitColumns(isGesamt ? buildTaskColumns(usedLists) : buildSingleListColumns(activeList));
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
        // Bei einer Protokoll-Unterspalte (siehe expandProtokollSplitColumns)
        // in dieser flachen Liste zusätzlich den Tätigkeitsnamen mit
        // anzeigen ("Rammen/Bohren – Rammen"), da hier - anders als in der
        // Tabelle selbst - keine gruppierende Kopfzeile existiert, die das
        // sonst optisch klarstellen würde.
        const displayLabel = c.isProtokollSplit ? `${c.parentLabel} – ${c.label}` : c.label;
        return `<div class="col-config-row" data-fzl-row-idx="${i}">
          <span class="col-drag-handle" draggable="true" data-fzl-drag-idx="${i}" title="Ziehen, um die Reihenfolge zu ändern">${DRAG_HANDLE_SVG}</span>
          <label class="col-config-check">
            <input type="checkbox" data-fzl-cfg-visible="${i}" ${hidden ? '' : 'checked'}>
            ${esc(displayLabel)}
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
// Tätigkeitenarten: kleiner, fest pflegbarer Stammdatensatz (z. B. "Einkauf",
// "Lieferung", "Ausführung"), mit dem sich jede Tätigkeit einer Kategorie
// zuordnen lässt. Nutzer-Wunsch: "im Vorlagenbereich einen Stammdatensatz...
// anpassbar... werden immer in Kompletheit mit in ein Projekt gezogen wenn
// die Tätigkeitenliste in das Projekt gezogen wird". Anders als Protokolle
// (die gezielt einzeln in ein Projekt gezogen werden) gibt es hier bewusst
// KEINE eigene "in Projekt übernehmen"-Aktion - siehe
// cascadeTaetigkeitsartenInsProjekt(), die automatisch beim Übernehmen einer
// Tätigkeitsliste ins Projekt aufgerufen wird (siehe projectAddBtn weiter
// unten) und dabei die komplette globale Vorlagenliste in die editierbare
// Projekt-Kopie mergt, ohne bereits dort individuell angepasste Arten
// anzufassen.
// ======================================================================
const TAETIGKEITSART_TEMPLATES_KEY = 'levelbuild_taetigkeitsarten_vorlagen'; // global (Vorlage, kein Projektbezug)
const TAETIGKEITSART_PROJECT_KEY = 'levelbuild_taetigkeitsarten_projekt'; // pKey-gescoped
const TAETIGKEITSART_SEEDED_KEY = 'levelbuild_taetigkeitsarten_seeded';
migrateToProjectScopedKey(TAETIGKEITSART_PROJECT_KEY);

function makeTaetigkeitsartId() {
  return 'ta-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// Einmalige Erstbefüllung mit ein paar Beispiel-Arten (aus dem Nutzer-
// Wunsch übernommen), damit die Funktion beim allerersten Öffnen nicht leer
// wirkt. Läuft dank TAETIGKEITSART_SEEDED_KEY garantiert nur genau einmal -
// löscht der Nutzer danach alle Arten wieder, kommen sie nicht erneut.
function seedTaetigkeitsartTemplatesIfNeeded() {
  try {
    if (localStorage.getItem(TAETIGKEITSART_SEEDED_KEY)) return;
    localStorage.setItem(TAETIGKEITSART_SEEDED_KEY, '1');
    if (localStorage.getItem(TAETIGKEITSART_TEMPLATES_KEY) != null) return;
    const defaults = [
      { id: makeTaetigkeitsartId(), name: 'Einkauf', color: '#8a63d2' },
      { id: makeTaetigkeitsartId(), name: 'Lieferung', color: '#e08a2c' },
      { id: makeTaetigkeitsartId(), name: 'Ausführung', color: '#2f6fed' },
    ];
    localStorage.setItem(TAETIGKEITSART_TEMPLATES_KEY, JSON.stringify(defaults));
  } catch (e) { /* ignore */ }
}
function loadTaetigkeitsartTemplates() {
  seedTaetigkeitsartTemplatesIfNeeded();
  try { return JSON.parse(localStorage.getItem(TAETIGKEITSART_TEMPLATES_KEY) || '[]'); } catch (e) { return []; }
}
function saveTaetigkeitsartTemplates(list) {
  try { localStorage.setItem(TAETIGKEITSART_TEMPLATES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function loadTaetigkeitsartProjectList() {
  try { return JSON.parse(localStorage.getItem(pKey(TAETIGKEITSART_PROJECT_KEY)) || '[]'); } catch (e) { return []; }
}
function saveTaetigkeitsartProjectList(list) {
  try { localStorage.setItem(pKey(TAETIGKEITSART_PROJECT_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
// Ergänzt die Projekt-Kopie um alle globalen Vorlagen-Arten, die dort noch
// fehlen (erkannt über sourceTemplateId) - lässt bereits im Projekt
// vorhandene (ggf. umbenannte) Arten unangetastet. Wird beim Übernehmen
// einer Tätigkeitsliste ins Projekt aufgerufen, damit die Arten "immer in
// Kompletheit" mitkommen, ohne dass der Nutzer sie separat zuordnen muss.
function cascadeTaetigkeitsartenInsProjekt() {
  const templates = loadTaetigkeitsartTemplates();
  if (!templates.length) return;
  const projectList = loadTaetigkeitsartProjectList();
  const existingSourceIds = new Set(projectList.map((a) => a.sourceTemplateId).filter(Boolean));
  let changed = false;
  templates.forEach((tpl) => {
    if (existingSourceIds.has(tpl.id)) return;
    projectList.push({ id: makeTaetigkeitsartId(), name: tpl.name, color: tpl.color, sourceTemplateId: tpl.id });
    changed = true;
  });
  if (changed) saveTaetigkeitsartProjectList(projectList);
}
// Ergänzt die Projekt-Protokoll-Liste um alle Vorlagen-Protokolle, die von
// den Tätigkeiten einer (gerade ins Projekt gezogenen) Tätigkeitsliste per
// protokollIds referenziert werden und dort noch fehlen (erkannt über
// sourceTemplateId, damit ein bereits von einer anderen Liste übernommenes
// Protokoll nicht doppelt kopiert wird). Nutzer-Wunsch: "wenn eine
// Tätigkeitenliste in ein Projekt gezogen wird [soll] mit der
// Tätigkeitenliste auch alle Protokollvorlagen mit in das Projekt gezogen
// werden" - analog zu cascadeTaetigkeitsartenInsProjekt() oben, nur für
// Protokolle statt Arten. Gibt { idMap, neuUebernommen } zurück: idMap
// bildet jede referenzierte Vorlagen-Protokoll-ID auf ihre (neue oder schon
// vorhandene) Projekt-Kopie-ID ab - damit der Aufrufer die protokollIds der
// kopierten Tätigkeiten passend umschreiben kann; neuUebernommen listet die
// Namen der dabei tatsächlich frisch kopierten Protokolle (für die Meldung
// an den Nutzer - bereits vorhandene Kopien werden dort nicht erneut
// genannt).
function cascadeProtokolleInsProjektFuerListe(tpl) {
  const idMap = {};
  const neuUebernommen = [];
  if (!tpl || !Array.isArray(tpl.tasks)) return { idMap, neuUebernommen };
  const referencedIds = new Set();
  tpl.tasks.forEach((t) => {
    (Array.isArray(t.protokollIds) ? t.protokollIds : (t.protokollId ? [t.protokollId] : []))
      .forEach((pid) => { if (pid) referencedIds.add(pid); });
  });
  if (!referencedIds.size) return { idMap, neuUebernommen };
  const templates = loadProtokollTemplates();
  const projectList = loadProtokollProjectList();
  let changed = false;
  referencedIds.forEach((refId) => {
    const existing = projectList.find((p) => p.sourceTemplateId === refId);
    if (existing) { idMap[refId] = existing.id; return; }
    const tplProtokoll = templates.find((p) => p.id === refId);
    if (!tplProtokoll) return; // Vorlage zwischenzeitlich gelöscht - nichts zu übernehmen
    const copy = JSON.parse(JSON.stringify(tplProtokoll));
    copy.id = makeProtokollId('pr');
    copy.sourceTemplateId = tplProtokoll.id;
    copy.sourceTemplateName = tplProtokoll.name;
    (copy.bausteine || []).forEach((b) => { b.id = makeProtokollId('bs'); });
    projectList.push(copy);
    idMap[refId] = copy.id;
    neuUebernommen.push(tplProtokoll.name);
    changed = true;
  });
  if (changed) saveProtokollProjectList(projectList);
  return { idMap, neuUebernommen };
}
// Liefert die einer Tätigkeit zugeordnete Art (Projekt-gescoped) - oder
// null, falls (noch) keine gewählt bzw. die Art zwischenzeitlich gelöscht
// wurde.
function resolveTaetigkeitsart(taetigkeitsartId) {
  if (!taetigkeitsartId) return null;
  return loadTaetigkeitsartProjectList().find((a) => a.id === taetigkeitsartId) || null;
}
// Wie protokolleFor(scope): eine Tätigkeit in einer projektunabhängigen
// Vorlage kann seit dem Nutzer-Feedback "die Tätigkeitenart muss ja aber
// einer Tätigkeit auch zugeordnet werden können" bereits DORT eine Art
// bekommen (aus den globalen Vorlagen-Arten) - nicht erst nach dem
// Übernehmen ins Projekt. Beim Übernehmen wird diese Vorlagen-Art-ID dann
// über sourceTemplateId auf die passende Projekt-Kopie umgemappt (siehe
// projectAddBtn-Handler weiter unten), damit sie dort weiterhin stimmt.
function taetigkeitsartenFor(scope) {
  return scope === 'project' ? loadTaetigkeitsartProjectList() : loadTaetigkeitsartTemplates();
}
function resolveTaetigkeitsartFor(taetigkeitsartId, scope) {
  if (!taetigkeitsartId) return null;
  return taetigkeitsartenFor(scope).find((a) => a.id === taetigkeitsartId) || null;
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
// { [mastKey]: true } - Standorte, deren Tätigkeitslisten-Zuordnung einzeln
// (Mast-Detail-Dropdown oder Mehrfachauswahl in der Masttafel) manuell
// gesetzt wurde. Nutzer-Wunsch: "man muss eine Tätigkeitenliste an einem
// Standort einzeln nur für diesen Standort auch nochmal anpassen können" -
// applyMastTlRegeln() lässt Standorte mit dieser Markierung unangetastet,
// damit ein späteres erneutes Anwenden der Regeln eine bewusste
// Einzel-Anpassung nicht wieder verwirft. Reines Set (Wert immer true),
// kein Bestandteil der eigentlichen Zuordnung selbst.
const MAST_TL_MANUAL_KEY = 'levelbuild_mast_taetigkeitsliste_manuell';
migrateToProjectScopedKey(MAST_TL_MANUAL_KEY);
function loadMastTlManuell() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_TL_MANUAL_KEY)) || '{}'); } catch (e) { return {}; }
}
function saveMastTlManuell(map) {
  try { localStorage.setItem(pKey(MAST_TL_MANUAL_KEY), JSON.stringify(map)); } catch (e) { /* ignore */ }
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
// Automatische Zuordnung von Tätigkeitslisten zu Standorten per Regeln
// ("wenn Spalte X das und das ist, dann Liste Y"), plus die Grundlage für
// die Mehrfachauswahl-Zuordnung in der Masttafel. Nutzer-Wunsch: "Es muss
// also eine Möglichkeit geben mehrere Masten auszuwählen und ihnen eine
// Tätigkeitenliste zuzuordnen. Zudem muss es die Möglichkeit geben die
// Tätigkeitenlisten über wenn-dann Bedingugen Automatisch zuzuordnen [...]
// auch mehrfach bedingungen. Nachträglich lässt sich natürlich immer auch
// nochmal anpassen." Regeln sind project-scoped, werden in der Reihenfolge
// ihrer Liste ausgewertet (Priorität = Position, erste passende Regel
// gewinnt) und schreiben - genau wie die manuelle Zuordnung auf der
// Mast-Detail-Seite bzw. die neue Mehrfachauswahl in der Masttafel - direkt
// in MAST_TL_ASSIGNMENT_KEY. Das automatische Zuordnen ist ein einmaliger,
// vom Nutzer explizit ausgelöster Vorgang ("Regeln jetzt anwenden"), kein
// laufender Hintergrundprozess - manuelle Anpassungen danach bleiben also
// so lange bestehen, bis die Regeln erneut angewendet werden.
// ======================================================================
const MAST_TL_REGELN_KEY = 'levelbuild_mast_taetigkeitsliste_regeln';
migrateToProjectScopedKey(MAST_TL_REGELN_KEY);
function loadMastTlRegeln() {
  try { return JSON.parse(localStorage.getItem(pKey(MAST_TL_REGELN_KEY)) || '[]'); } catch (e) { return []; }
}
function saveMastTlRegeln(list) {
  try { localStorage.setItem(pKey(MAST_TL_REGELN_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeRegelId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
const MAST_TL_REGEL_OPERATOREN = [
  { value: 'gleich', label: 'ist gleich' },
  { value: 'ungleich', label: 'ist ungleich' },
  { value: 'enthaelt', label: 'enthält' },
  { value: 'nicht_enthaelt', label: 'enthält nicht' },
  { value: 'nicht_leer', label: 'ist nicht leer' },
  { value: 'leer', label: 'ist leer' },
];
function emptyMastTlRegel(taetigkeitslisteId) {
  return {
    id: makeRegelId('regel'),
    taetigkeitslisteId: taetigkeitslisteId || '',
    verknuepfung: 'UND',
    bedingungen: [{ id: makeRegelId('bed'), spalte: '', operator: 'gleich', wert: '' }],
  };
}
// Liefert für jeden im Projekt eingelesenen Mast (über alle Bauabschnitte
// hinweg) dessen aktuelle Spaltenwerte als {Spaltenlabel: Zellwert}-Objekt,
// aus der jeweils neuesten Version - Grundlage für das Auswerten der
// Zuordnungs-Regeln. key ist derselbe normalisierte Schlüssel, den
// MAST_TL_ASSIGNMENT_KEY und alle anderen Mast-bezogenen Speicher schon
// verwenden (siehe getMastNummernForBauabschnitt() oben).
function getMastColumnValuesForRules() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(pKey(MASTTAFEL_STATE_KEY)) || 'null'); } catch (e) { saved = null; }
  const result = [];
  if (!saved || !saved.sections) return result;
  Object.keys(saved.sections).forEach((secId) => {
    const sec = saved.sections[secId];
    if (!sec || !sec.rowsByKey || !sec.columns) return;
    sec.rowsByKey.forEach((pair) => {
      const key = pair[0];
      const entry = pair[1];
      if (!entry || !Array.isArray(entry.versions) || !entry.versions.length) return;
      const latest = entry.versions[entry.versions.length - 1];
      const values = {};
      sec.columns.forEach((c) => { values[c.label] = (latest.values || [])[c.idx]; });
      result.push({ key, displayKey: entry.displayKey, bauabschnittId: secId, values });
    });
  });
  return result;
}

// ======================================================================
// Fotos-Sammelseite: führt alle im Projekt tatsächlich vorhandenen Fotos
// unabhängig von ihrer Quelle zu EINER Liste zusammen. Nutzer-Wunsch:
// "unter fotos sollen die fotos wie folgt angezeigt werden alle fotos die
// durch die mastfatel und sonst wie ankommen sollen hier erscheinen".
// Zwei Quellen im aktuellen Datenmodell tragen echte Fotodateien: (1) die
// allgemeine Fotos-Ablage eines Standorts (loadMastFotos - in der Handy-App
// über Mast-Detail &rsaquo; Fotos aufgenommen; "durch die Masttafel", weil
// jeder Standort aus einer eingelesenen Masttafel stammt) und (2) Foto-
// Bausteine innerhalb eines ausgefüllten Protokolls (loadMastProtokollDaten -
// "und sonst wie ankommen"). Bewusst NICHT einbezogen: die Nachweis-Anhänge
// einer manuellen Bauabweichung (levelbuildAddManualMastVersion) - das sind
// laut UI-Beschriftung explizit generische Belege ("E-Mail, Statik-PDF,
// o. ä."), keine Fotos, und würden diese Galerie mit Nicht-Bildern verwässern.
// Rein lesend - Fotos selbst werden weiterhin nur in der Handy-App
// aufgenommen/gelöscht.
// ======================================================================
function collectAllProjectFotos() {
  const result = [];
  const mastLabels = {};
  (typeof getMastColumnValuesForRules === 'function' ? getMastColumnValuesForRules() : []).forEach((m) => {
    mastLabels[m.key] = m.displayKey || m.key;
  });
  function labelFor(mastKey) { return mastLabels[mastKey] || mastKey; }

  // ---- Quelle 1: Standort-Fotos (Mast-Detail > Fotos in der Handy-App) ----
  const mastFotos = (typeof loadMastFotos === 'function') ? loadMastFotos() : {};
  Object.keys(mastFotos).forEach((mastKey) => {
    (mastFotos[mastKey] || []).forEach((f) => {
      if (!f || !f.dataUrl) return;
      result.push({
        id: 'mf-' + f.id,
        dataUrl: f.dataUrl,
        name: f.name || 'Foto',
        addedAt: f.addedAt || null,
        mastKey,
        mastLabel: labelFor(mastKey),
        quelle: 'standort',
        quelleLabel: 'Standort-Foto',
      });
    });
  });

  // ---- Quelle 2: Foto-Bausteine innerhalb ausgefüllter Protokolle ----
  const protokollDaten = (typeof loadMastProtokollDaten === 'function') ? loadMastProtokollDaten() : {};
  const protokolle = (typeof loadProtokollProjectList === 'function') ? loadProtokollProjectList() : [];
  const abschluss = (typeof loadMastTaskAbschluss === 'function') ? loadMastTaskAbschluss() : {};
  Object.keys(protokollDaten).forEach((mastKey) => {
    const forMast = protokollDaten[mastKey] || {};
    Object.keys(forMast).forEach((taskId) => {
      const entry = forMast[taskId] || {};
      const protokoll = protokolle.find((p) => p.id === entry.protokollId);
      if (!protokoll || !Array.isArray(protokoll.bausteine)) return;
      const task = (typeof findTaetigkeitById === 'function') ? findTaetigkeitById(taskId) : null;
      // Kein eigener Zeitstempel je Baustein-Antwort im Datenmodell - das
      // Abschlussdatum der Tätigkeit ist die ehrlichste verfügbare Näherung
      // dafür, wann das Foto entstanden ist (fehlt es, bleibt das Datum
      // leer statt eines erfundenen Werts).
      const addedAt = (abschluss[mastKey] && abschluss[mastKey][taskId] && abschluss[mastKey][taskId].datum) || null;
      protokoll.bausteine.forEach((b) => {
        if (b.type !== 'foto') return;
        const val = entry.answers ? entry.answers[b.id] : undefined;
        const arr = Array.isArray(val) ? val.filter(Boolean) : (val ? [val] : []);
        arr.forEach((dataUrl, idx) => {
          result.push({
            id: 'pf-' + mastKey + '-' + taskId + '-' + b.id + '-' + idx,
            dataUrl,
            name: (b.label || 'Foto') + (task && task.titel ? ' - ' + task.titel : ''),
            addedAt,
            mastKey,
            mastLabel: labelFor(mastKey),
            quelle: 'protokoll',
            quelleLabel: 'Protokoll-Foto',
            taskTitel: task ? task.titel : null,
            protokollName: protokoll.name,
            bausteinLabel: b.label || null,
          });
        });
      });
    });
  });

  return result;
}

// ======================================================================
// Dokumente/Pläne-Sammelseiten: führt, analog zu collectAllProjectFotos()
// oben, alle im Projekt tatsächlich vorhandenen Dokumente unabhängig von
// ihrer Quelle zu EINER Liste zusammen. Nutzer-Wunsch: "es können und werden
// ja schon Dokumente hochgeladen und auch Pläne an anderer Stelle im System
// [...] die Informationen [sollen] dann auch wirklich hier im richtigen
// Bereich landen." Drei Quellen tragen echte Dokumente im aktuellen
// Datenmodell: (1) automatisch erzeugte Protokoll-PDFs (loadDokumente -
// entstehen im Bautagebuch), (2) per "Datenpfad <Name>"-Spalte beim
// Masttafel-Import verknüpfte Dokumente (loadMastDatenpfadDokumente) und (3)
// dieselbe Datenpfad-Verknüpfung bei generischen Elementensammlungen
// (loadElementDatenpfadDokumente). Rein lesend - Dokumente selbst entstehen
// weiterhin nur an ihrer jeweiligen Quelle (Bautagebuch bzw. Datenpfad-Import).
// isPlanDocType() trennt die beiden Sammelseiten (Pläne vs. übrige
// Dokumente): eine Datenpfad-Spalte "Datenpfad Lageplan"/"Datenpfad
// Übersichtsplan" o.ä. wird als Plan eingeordnet, alles andere (inkl. aller
// Protokoll-PDFs, die nie Pläne sind) als normales Dokument.
// ======================================================================
function isPlanDocType(typ) {
  return /plan|zeichnung|grundriss|schema/i.test(String(typ || ''));
}
function collectAllProjectDokumente() {
  const result = [];
  const mastLabels = {};
  (typeof getMastColumnValuesForRules === 'function' ? getMastColumnValuesForRules() : []).forEach((m) => {
    mastLabels[m.key] = m.displayKey || m.key;
  });
  function mastLabelFor(mastKey) { return mastLabels[mastKey] || mastKey; }

  // ---- Quelle 1: automatisch erzeugte Protokoll-PDFs ----
  const protokollDocs = (typeof loadDokumente === 'function') ? loadDokumente() : [];
  protokollDocs.forEach((d) => {
    if (!d || !d.pdfBase64) return;
    result.push({
      id: 'pd-' + d.id,
      name: d.betreff || d.protokollName || 'Protokoll-PDF',
      typ: d.protokollName || 'Protokoll-PDF',
      url: d.pdfBase64,
      mime: 'application/pdf',
      standortKey: d.mastKey || null,
      standortLabel: d.mastLabel || (d.mastKey ? mastLabelFor(d.mastKey) : null),
      addedAt: d.createdAt || d.datum || null,
      quelle: 'protokoll',
      quelleLabel: 'Protokoll-PDF',
      isPlan: false,
      sourceId: d.id,
    });
  });

  // ---- Quelle 2: Datenpfad-Dokumente je Mast (Masttafel-Import) ----
  const mastDocs = (typeof loadMastDatenpfadDokumente === 'function') ? loadMastDatenpfadDokumente() : {};
  Object.keys(mastDocs).forEach((mastKey) => {
    (mastDocs[mastKey] || []).forEach((doc) => {
      if (!doc || !doc.url) return;
      result.push({
        id: 'dpm-' + doc.id,
        name: doc.name || 'Dokument',
        typ: doc.typ || 'Dokument',
        url: doc.url,
        mime: doc.mime || 'application/octet-stream',
        size: doc.size || 0,
        standortKey: mastKey,
        standortLabel: mastLabelFor(mastKey),
        addedAt: doc.attachedAt || null,
        quelle: 'datenpfad-mast',
        quelleLabel: 'Datenpfad · Standort',
        isPlan: isPlanDocType(doc.typ),
        sourceFile: doc.sourceFile || null,
      });
    });
  });

  // ---- Quelle 3: Datenpfad-Dokumente je generisches Element ----
  const elementDocs = (typeof loadElementDatenpfadDokumente === 'function') ? loadElementDatenpfadDokumente() : {};
  const sammlungen = (typeof loadElementensammlungen === 'function') ? loadElementensammlungen() : [];
  const elementDaten = (typeof loadElementDaten === 'function') ? loadElementDaten() : {};
  function elementRowLabel(sammlungId, bauabschnittId, rowKey) {
    const entry = elementDaten[sammlungId];
    const section = entry && entry.sections ? entry.sections[bauabschnittId] : null;
    if (!section || !section.rowsByKey) return rowKey;
    const pair = section.rowsByKey.find((p) => p[0] === rowKey);
    return pair && pair[1] ? (pair[1].displayKey || rowKey) : rowKey;
  }
  Object.keys(elementDocs).forEach((sammlungId) => {
    const sammlung = sammlungen.find((s) => s.id === sammlungId);
    const byBauabschnitt = elementDocs[sammlungId] || {};
    Object.keys(byBauabschnitt).forEach((bauabschnittId) => {
      const byRow = byBauabschnitt[bauabschnittId] || {};
      Object.keys(byRow).forEach((rowKey) => {
        (byRow[rowKey] || []).forEach((doc) => {
          if (!doc || !doc.url) return;
          result.push({
            id: 'dpe-' + doc.id,
            name: doc.name || 'Dokument',
            typ: doc.typ || 'Dokument',
            url: doc.url,
            mime: doc.mime || 'application/octet-stream',
            size: doc.size || 0,
            standortKey: sammlungId + ':' + rowKey,
            standortLabel: elementRowLabel(sammlungId, bauabschnittId, rowKey) + (sammlung ? ' (' + sammlung.name + ')' : ''),
            addedAt: doc.attachedAt || null,
            quelle: 'datenpfad-element',
            quelleLabel: 'Datenpfad · Element',
            isPlan: isPlanDocType(doc.typ),
            sourceFile: doc.sourceFile || null,
          });
        });
      });
    });
  });

  return result;
}

function normalizeRegelWert(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
function bedingungMatches(bedingung, values) {
  const cellVal = normalizeRegelWert(values ? values[bedingung.spalte] : '');
  const testVal = normalizeRegelWert(bedingung.wert);
  switch (bedingung.operator) {
    case 'gleich': return cellVal === testVal;
    case 'ungleich': return cellVal !== testVal;
    case 'enthaelt': return testVal !== '' && cellVal.includes(testVal);
    case 'nicht_enthaelt': return testVal === '' || !cellVal.includes(testVal);
    case 'leer': return cellVal === '';
    case 'nicht_leer': return cellVal !== '';
    default: return false;
  }
}
function regelMatches(regel, values) {
  if (!regel || !Array.isArray(regel.bedingungen) || !regel.bedingungen.length) return false;
  const bedingungen = regel.bedingungen.filter((b) => b.spalte);
  if (!bedingungen.length) return false;
  return regel.verknuepfung === 'ODER'
    ? bedingungen.some((b) => bedingungMatches(b, values))
    : bedingungen.every((b) => bedingungMatches(b, values));
}
// Wertet alle Regeln (in ihrer gespeicherten Reihenfolge = Priorität, erste
// passende Regel je Mast gewinnt) über alle Masten des Projekts aus und
// schreibt Treffer in MAST_TL_ASSIGNMENT_KEY. Masten, auf die keine Regel
// zutrifft, bleiben unverändert (weder gelöscht noch überschrieben) - eine
// zuvor manuell (oder von einer vorherigen Regelanwendung) gesetzte
// Zuordnung bleibt also bestehen, wenn jetzt keine Regel mehr zutrifft.
function applyMastTlRegeln() {
  const regeln = loadMastTlRegeln();
  const masten = getMastColumnValuesForRules();
  const assignments = loadMastTlAssignments();
  const manuell = loadMastTlManuell();
  let angepasst = 0;
  let uebersprungen = 0;
  masten.forEach((m) => {
    // Standorte, die einzeln (Mast-Detail oder Mehrfachauswahl) manuell
    // zugeordnet wurden, bleiben von der Regel-Automatik unangetastet.
    if (manuell[m.key]) { uebersprungen++; return; }
    const treffer = regeln.find((r) => regelMatches(r, m.values));
    if (!treffer) return;
    if (assignments[m.key] !== treffer.taetigkeitslisteId) angepasst++;
    assignments[m.key] = treffer.taetigkeitslisteId;
  });
  saveMastTlAssignments(assignments);
  return { angepasst, geprueft: masten.length, uebersprungen, regelnAnzahl: regeln.length };
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

// ======================================================================
// Einkauf: eigener Bereich, in dem Material-Positionen angelegt, einem
// oder mehreren Masten/Standorten (aus der Masttafel) zugeordnet und als
// "eingekauft" markiert werden können. Projekt-gescoped, analog zu den
// übrigen *_projekt-Speichern. Ein "Einkaufsbericht" (PDF, siehe
// downloadEinkaufsberichtPDF in der Einkauf-IIFE weiter unten) listet dann
// genau die als eingekauft markierten Positionen auf - also das, was
// tatsächlich bestellt wurde.
// { id, material, menge, einheit, standorte: string[] (Mastnummern),
//   notiz, eingekauft: bool, eingekauftAm: iso-Datum|null, createdAt }
// ======================================================================
// Fest hinterlegtes Firmen-Briefkopf-Logo (SPITZKE) fuer den Bestellungs-PDF-
// Kopf - vom Nutzer als Referenzbild bereitgestellt, exakt so im Dokumentkopf
// zu uebernehmen (siehe downloadBestellungPDF in der Einkauf-IIFE). Als PNG-
// Data-URL eingebettet, damit kein zusaetzlicher Netzwerk-Request beim PDF-
// Erstellen noetig ist.
const EINKAUF_LOGO_BASE64 = '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HuI43rFjx8aNG4vF4tmzZ/fu3YuITz75pO/71Wr18OHDW7ZsWTjm4cOHz507p7V+8MEHReS9995zzZ5vuummnp6et956i5kXL168cePGmZmZAwcODA4O3nPPPUuWLNm+ffvIyIjW+q677urs7GzSaffu3fv379+6deu6deu+kMzzVJX6rZAXIoKe591668ZardLR0bF27drmaXduw47j2O3xzeZoMN8ozf3avP7w4cPbtm2bnJw8d+7c4ODgt7/9bWvtuXPnmt3TrLWHDh165513Lly4EMfx7t2777nnnkwmc/To0SiK3njjjR07dixsaTM1NfXBBx9s3brVGPPxxx97nrdly5Y777zTiaAjR46IyL333vvxxx83Go133323o6Pj/vvvf+GFF8IwnJqaevLJJx9//PG2tjaYzzafnZ3dtWvXN7/5zT179lzrLLKUGClcB2ZEhGxOB4HHzJ7nxXH88ssv/+IXvzhy5IhTRay1R44cqVarC7v9ueJSt9wBwBgzODhYLBaDIBgfH+/t7dVau8bmTV1rYmLi8OHDa9euzeVy9Xq9VCp1dnZu3rz5+PHjvu8//fTTnZ2ds7OzzbubmZnp6elpb2/fuHHj2bNntdYtLS35fP706dMtLS0zMzObN28uFAo9PT1jY2OuRrxcLmcyGacBOomxUCxcuHDhnnvuaW1t7ezsHBkZ+UIqI1Ji/FbgE+3IiFgRALx06VJXV/ejjz565swZa22SJG5FxnHcLB5yzQQcMZzEeOONN5588knXlyCXy+0/sL8yW9m/f3+SJE0ubdu27cEHH8zn89Zaz/Omp6er1eqZM2eiKHKmAhEFQdC8pVwu55rfHDp0qF6vuw+6cOFCR0dHuVzO5XJ79+6tVqvHjx8Pw/DRRx/92c9+9h/+w3/4yle+4nleqVQ6cODAX//1X09OTroTM0RkcnLSHernmJkeTpniGpxABAS2ghBkMnk/k2WRiYnJXbt2TU1NukZmQRAQUW9vb7OPf5IkO3bsmJiYOHfu3FtvvbVkyRLXw0ZEGo0GAGzYsOHSpUuvv/5aLpcvlopu/TUajampqZaWliRJoijKZrNr1qx57bXXWltbM5lM014Pw7BYLLo77OzsvP3225999tnOzs7Ozk7HSdeEipnXr1//8ssvv/nmm+VyOZ/Pb9++/Z577mlpaXnnnXe+973vPf300wCwZ8+eo0ePbty48Zlnnlm5cqXnea7RelPQpcRIcW2GIDLzzOzsMq0BgEjdeuutK1euyOfzSqkoitzp2s2Sa631+vXrz58/PzExsXHjxkKhMDs7G8fxs88+e/HixV27dj344IMPP/wwKHr//fez2ax7V7VazWazP//5z48fPz46Orp8+fL169dv2LBhcHCwWq02bX0nc+a0DqJ77rln69atZ8+edb03oyiamppyB8dkMplvfOMbAPDDH/4wm82OjIzcd999hULh7bffDsPQHQpTLBbjOM7n89///veJ6NixY659m4gUi8UvpLo1JcZvE4gokwlmZmeUUsuXL3/22WfK5VIYhk5pIaIdO3asXr26tbXV+W1bW1tzudzk5KTrbZPL5b72ta9Za3/4wx/ecccdURQd2H9gNmkcP3ny//Qv/sR9RHd393e+8x1jzKuvvjowMBAEwYEDB6ampo4dO/a1r32t6fWK4zibzbq3JEnywQcfhGG4Z8+eP/uzPxORs2fPDgwMZLNZY8zMzMyxY8eGh4d9329paSkWi++88447ti+TyezZs4eZP/jgg29961tE5Ijd0dHxwx/+sFqtHjhw4N577/1CiJHWfP9W+KUMgGYGATMyNpHPF3OZDAJcuDB46dKl/v7+3t7eM2fOLF26dHR0tKOjw9myzhy31g4PDzdVLKeczMzMlMtlY8yxY8eClmK+VOxr7dSION/yg5nHxsbcOdzOoF+3bl0ul3PqzeDg4JIlS5qHZhhjzp49OzU15drUuv6CxWLR2QlJkhw8eLClpWXx4sVa6ziOT5w4kSTJ+vXrfd8/fvy4MaZcLnd3d7v+Os6NNjw8PDw8vGbNmiAIlFJXHNCREiMFzB/LjfP+KfjkOKQrfVefRN9+paGvNPBTpKrUb5dL6lqUAIBfb4NLyZAS47cJTp1o7v0LFYlmdsavNJqzyxfy59PKiTFmYd80WNDrydn9C3NGXFTxikZSzb+6QMoVGSLNBJPmi83bcNcvlHjOGaWUSnvXprjMAWWMmZ2ddWdQLHQBwTWOvftsDcpa61akMaZWq/m+f8WYAOBe9zzPxfjy+bxzAQNAo9FwB4UtHLBWqymlcrkcAExOTjZPIs7lclEUudytIAgQsdFoVKvVlpYWz/MajUa9XkfEXC6XyWSaA1YqlTAM8/m861ebJEmj0SgUCgsDJtcT6TnfN6RVIbxv39433ngzDKNisVQo5F20rpnZYYxxIsUF5prbarOXJszHwpl5fHz8v/7X/7pq1Spr7Q9+8IM4jnfu3NnX1+f7fjNvr16v//jHP87lcp2dna+88srIyMh7773X29tbKBQGBwddeCGXyznRkSTJ888/f/bs2Z07dxaLxVKpdOTIkTNnzuzcuTOKovb29v/yX/5LtVp9/fXXb7vttqGhoWeeeSaKovfff3/jxo2vv/76xx9/bIzJZDKlUqlJvJdffvnChQsHDx5ctWoVM//7f//vx8fHjx49un79ekiPGkuxULFZtWrVgw8+uGhRt8vjOHnyZBiG7pgiRKxUKjMzM9baZnihiSiKmtxwzlCttbV2bGxs6dKl999//0033bR///6mCsTMu3bt6u7udjka1Wr10Ucf/frXv75z504RqdVqLjSxcPzp6emnnnrq29/+9t69e5VSW7ZseeSRR/r7+3t6ei5evPjQQw994xvfuOOOO06cOFGv12+55ZaHH364XC7XajUAePTRR+++++7e3t7mgL7vf/Ob33z66acbjUalUjl58uTjjz/+ne98BxHdW64/UmLcoGg06qOjI9PT08aYRqMxODhYr9ffeOMNAHj11VdHRka2bdtWqVQmJyeHhoacrHDywVr70UcfNY+xGxwcbG1t7e/vd3qRU8N835+YmGgaMxcvXhwdHe3q6nJMKxaLLu9jdHQUEdeuXbtkyZKFQslaG8exY0ulUnGv1+v1EydOdHR0uD+JiLvzcrl86tSpAwcOjI6OOr1o27Zt77zzjlvxzdi208Tc9ZVKxQm0jo4Od/ZASowUc8tPa+/YseOvv/762bPngiDYsGFDNps9d+6ciDz44IPPP/88M3d1dXV1dbkTIt2SNcZYawcHB90Rjy6GcMcddzhlqaen58CBA7/85S/37t3b1E+MMR999NH69evz+Twzu3X87LPPvvTSS85CcLrTwlKNXC5XLBafeeaZ999/3/M896fTp08PDAyUy+Xe3t6f//znr7/++v79+7XW7oL9+/e3t7d7nnf77bc//PDDLgAfx/GePXvGxsbcyIcPHx4YGHDHMrmYRnPw1PhOMbf4EtO49767HnrwUWE5euzo66+/ft999zmbWyk1PT29efNmt4sv9BS99dZbExMTJ0+e/OEPf9jb23v33XfHcbx///4zZ84s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';

const EINKAUF_KEY = 'levelbuild_einkauf_positionen';
migrateToProjectScopedKey(EINKAUF_KEY);
function loadEinkaufPositionen() {
  try { return JSON.parse(localStorage.getItem(pKey(EINKAUF_KEY)) || '[]'); } catch (e) { return []; }
}
function saveEinkaufPositionen(list) {
  try { localStorage.setItem(pKey(EINKAUF_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeEinkaufId() {
  return 'ek-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ======================================================================
// Lieferanten: einfache, projektübergreifende Stammdaten-Verwaltung (wie
// die Tätigkeitenarten-Vorlagen) - im Vorlagenbereich gepflegt, bei jeder
// Bestellung aus einer Liste auswählbar. Bewusst NICHT projekt-gescoped,
// da ein Lieferant typischerweise über mehrere Projekte hinweg genutzt
// wird. Eine Bestellung speichert die Lieferanten-Felder als eigenen,
// unabhängig editierbaren Schnappschuss (siehe BESTELLUNGEN_KEY unten) -
// eine spätere Änderung am Stammdatensatz wirkt sich also nicht rückwirkend
// auf bereits erstellte Bestellungen aus.
// { id, name, strasse, plzOrt, kontaktName, kontaktTelefon, kontaktEmail }
// ======================================================================
const LIEFERANTEN_KEY = 'levelbuild_lieferanten';
function loadLieferanten() {
  try { return JSON.parse(localStorage.getItem(LIEFERANTEN_KEY) || '[]'); } catch (e) { return []; }
}
function saveLieferanten(list) {
  try { localStorage.setItem(LIEFERANTEN_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeLieferantId() {
  return 'lf-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ======================================================================
// Einkauf-Einstellungen: projekt-gescoped hinterlegte Vorbelegung für neue
// Bestellungen (Kostenstelle, Bauvorhaben, Einkäufer, Lieferanschrift) -
// wird in Projekteinstellungen gepflegt und beim Öffnen des Bestellung-
// Modals als Startwert übernommen, bleibt dort aber pro Bestellung
// überschreibbar (siehe openBestellungModal in der Einkauf-IIFE).
// ======================================================================
const EINKAUF_EINSTELLUNGEN_KEY = 'levelbuild_einkauf_einstellungen';
migrateToProjectScopedKey(EINKAUF_EINSTELLUNGEN_KEY);
function loadEinkaufEinstellungen() {
  let obj;
  try { obj = JSON.parse(localStorage.getItem(pKey(EINKAUF_EINSTELLUNGEN_KEY)) || 'null'); } catch (e) { obj = null; }
  return Object.assign({
    kostenstelle: '', bauvorhaben: '',
    einkaeuferName: '', einkaeuferTelefon: '', einkaeuferEmail: '',
    lieferanschriftFirma: '', lieferanschriftZusatz: '', lieferanschriftStrasse: '', lieferanschriftPlzOrt: '',
  }, obj || {});
}
function saveEinkaufEinstellungen(obj) {
  try { localStorage.setItem(pKey(EINKAUF_EINSTELLUNGEN_KEY), JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

// ======================================================================
// Bestellungen: eine Bestellung bündelt eine oder mehrere Einkaufs-
// positionen (inkl. deren Standorte) zu einem einzigen Bestell-PDF im
// Spitzke-Layout (siehe downloadBestellungPDF). Projekt-gescoped. Sobald
// Positionen einer Bestellung zugeordnet werden, gelten sie als
// eingekauft (siehe EINKAUF_KEY: eingekauft/eingekauftAm/bestellungId).
// ======================================================================
const BESTELLUNGEN_KEY = 'levelbuild_bestellungen';
migrateToProjectScopedKey(BESTELLUNGEN_KEY);
function loadBestellungen() {
  try { return JSON.parse(localStorage.getItem(pKey(BESTELLUNGEN_KEY)) || '[]'); } catch (e) { return []; }
}
function saveBestellungen(list) {
  try { localStorage.setItem(pKey(BESTELLUNGEN_KEY), JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function makeBestellungId() {
  return 'best-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
      dokuArt: 'keine', protokollIds: [], dokuPflichtZumAbhaken: false,
      web: true, mobile: true, vorgaengerId: null, taetigkeitsartId: null,
      statusOptions: defaultStatusOptions(),
    };
  }
  // Liefert die einer Tätigkeit zugeordneten Protokoll-IDs als Array - einer
  // Tätigkeit können seit dem Nutzer-Wunsch "auch mehrere Protokolle
  // zugeordnet werden können" nun mehrere Protokolle zugeordnet sein statt
  // nur eines. Ältere Tätigkeiten haben noch das alte, einzelne Feld
  // "protokollId" - das wird hier beim Lesen transparent auf ein
  // Ein-Element-Array abgebildet, ohne die gespeicherten Daten anzufassen
  // (die Migration passiert erst beim nächsten Speichern der Tätigkeit im
  // Bearbeiten-Fenster).
  function taskProtokollIds(task) {
    if (!task) return [];
    if (Array.isArray(task.protokollIds)) return task.protokollIds;
    if (task.protokollId) return [task.protokollId];
    return [];
  }
  // Statusoptionen (z.B. Nicht erledigt / In Arbeit / Erledigt) gelten seit
  // dem Nutzer-Feedback "die Statusoption ... auf die einzelnen Tätigkeiten
  // übertragen, nicht übergeordnet auf die ganze Tätigkeitenliste" pro
  // Tätigkeit, nicht mehr pro Liste. Bereits vorhandene (ältere) Tätigkeiten
  // ohne eigene statusOptions fallen für die Anzeige auf die (weiterhin
  // vorhandenen, aber im UI nicht mehr direkt editierbaren) statusOptions
  // der Liste zurück, statt sofort schweigend auf den Hart-Default zu
  // springen - eine bereits vom Nutzer angepasste Liste geht so nicht
  // verloren, sondern dient nur noch als Ausgangspunkt beim ersten Bearbeiten
  // der einzelnen Tätigkeit.
  function taskStatusOptions(task, list) {
    if (task && Array.isArray(task.statusOptions) && task.statusOptions.length) return task.statusOptions;
    if (list && Array.isArray(list.statusOptions) && list.statusOptions.length) return list.statusOptions;
    return defaultStatusOptions();
  }
  // Resolves a task's chosen Protokolle (by id, scoped like the surrounding
  // list) to ihre aktuellen Namen - live nachgeschlagen statt die Namen auf
  // der Tätigkeit zu duplizieren, damit eine spätere Protokoll-Umbenennung
  // überall wirkt, ohne jede Tätigkeit anfassen zu müssen. Eine Tätigkeit
  // kann inzwischen mehreren Protokollen zugeordnet sein (Oder-Verknüpfung -
  // siehe openTaskModal), daher Array rein/raus statt einer einzelnen ID.
  function resolveProtokollNames(protokollIds, scope) {
    const ids = Array.isArray(protokollIds) ? protokollIds : (protokollIds ? [protokollIds] : []);
    if (!ids.length) return [];
    const available = protokolleFor(scope);
    return ids.map((id) => {
      const p = available.find((x) => x.id === id);
      return p ? p.name : '(gelöschtes Protokoll)';
    });
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
      // Nutzer-Wunsch: die Tätigkeitenarten (z. B. Einkauf/Lieferung/
      // Ausführung) werden "immer in Kompletheit mit in ein Projekt
      // gezogen", sobald hier eine Tätigkeitsliste ins Projekt übernommen
      // wird - ergänzt fehlende globale Arten in die Projekt-Kopie, ohne
      // bereits vorhandene (ggf. angepasste) Arten anzufassen. Muss VOR dem
      // Kopieren der Tätigkeiten laufen, damit unten die Projekt-Pendants
      // schon existieren, wenn eine in der Vorlage bereits gewählte Art
      // umgemappt wird.
      cascadeTaetigkeitsartenInsProjekt();
      const projectArtenList = loadTaetigkeitsartProjectList();
      // Nutzer-Wunsch: "wenn eine Tätigkeitenliste in ein Projekt gezogen
      // wird [soll] mit der Tätigkeitenliste auch alle Protokollvorlagen mit
      // in das Projekt gezogen werden" - analog zum Tätigkeitenarten-Cascade
      // oben, muss ebenfalls VOR dem Kopieren der Tätigkeiten laufen, damit
      // unten protokollIds direkt auf die neuen Projekt-Kopien umgemappt
      // werden können.
      const protokollCascade = cascadeProtokolleInsProjektFuerListe(tpl);
      // Deep copy with fresh ids, so editing the project's copy never
      // touches the template - and editing the template later never
      // retroactively changes lists already pulled into a project.
      const copy = JSON.parse(JSON.stringify(tpl));
      copy.id = makeId('tl');
      copy.sourceTemplateName = tpl.name;
      copy.tasks.forEach((t) => {
        t.id = makeId('tk');
        t.vorgaengerId = null;
        // Jede Tätigkeit bekommt beim Übernehmen ins Projekt ihre eigenen,
        // frisch ge-id-eten Statusoptionen - Quelle ist die Tätigkeit selbst
        // (falls schon eigene statusOptions vorhanden), sonst die (alte)
        // Vorlagen-weite Liste als Ausgangspunkt, sonst der Hart-Default.
        const src = taskStatusOptions(t, copy);
        t.statusOptions = src.map((s) => ({ id: makeId('st'), label: s.label, color: s.color, icon: s.icon }));
        // War in der Vorlage bereits eine Tätigkeitsart gewählt, referenziert
        // t.taetigkeitsartId noch die globale Vorlagen-Art-ID - die ist in
        // der Projekt-Kopie ungültig (dort gelten die frischen IDs aus dem
        // Cascade oben). Auf das per sourceTemplateId erkennbare
        // Projekt-Pendant ummappen, damit die Auswahl erhalten bleibt.
        if (t.taetigkeitsartId) {
          const match = projectArtenList.find((a) => a.sourceTemplateId === t.taetigkeitsartId);
          t.taetigkeitsartId = match ? match.id : null;
        }
        // Gleiches Prinzip für die referenzierten Protokolle: die Vorlage
        // verweist per protokollIds noch auf die globalen Vorlagen-
        // Protokoll-IDs - über protokollCascade.idMap (oben ermittelt) auf
        // die frischen Projekt-Kopien umschreiben, sonst würde die Handy-App
        // (die Protokolle nur projekt-gescoped nachschlägt) das Protokoll
        // dieser Tätigkeit nicht finden.
        if (Array.isArray(t.protokollIds) && t.protokollIds.length) {
          t.protokollIds = t.protokollIds.map((pid) => protokollCascade.idMap[pid]).filter(Boolean);
        }
      });
      const projectItems = loadProjectLists();
      projectItems.push(copy);
      saveProjectLists(projectItems);
      if (sel) sel.value = '';
      renderProjectList();
      // Meldung an den Nutzer: mit der Tätigkeitsliste werden automatisch
      // auch alle von ihr referenzierten Protokollvorlagen ins Projekt
      // gezogen - nur die dabei tatsächlich neu kopierten nennen (schon
      // vorhandene Projekt-Kopien, z. B. von einer zuvor übernommenen
      // anderen Liste, werden nicht erneut aufgeführt).
      if (protokollCascade.neuUebernommen.length) {
        alert('"' + tpl.name + '" wurde ins Projekt übernommen. Mit der Tätigkeitsliste wurden automatisch auch folgende zugehörige Protokollvorlagen mit in das Projekt übernommen:\n\n- ' + protokollCascade.neuUebernommen.join('\n- '));
      }
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

  // Nutzer-Feedback: die Badge-Zähler ("X Tätigkeiten") in diesem Vorlagen-
  // Panel blieben nach dem Bearbeiten einer Vorlage (z. B. Aufgaben
  // hinzufügen) auf dem alten Stand stehen, bis die ganze Seite neu geladen
  // wurde - renderTemplateList()/renderTemplateSelect() liefen bisher nur
  // EINMAL beim ersten Ausführen dieser IIFE, nicht bei jedem erneuten
  // Aufruf der "Projekte · Vorlagen"-Seite (die eigentliche Tätigkeitsliste
  // wird ja über den separaten Editor bearbeitet und man kehrt per
  // Zurück-Link hierher zurück, ohne dass die Seite neu lädt). Wie die
  // übrigen onShow-Hooks verkettet (siehe prevOnShowPE2 oben), damit ein
  // später registrierter Hook (Protokolle-Vorlagen-Bereich) diesen hier
  // nicht überschreibt, sondern ergänzt.
  const prevOnShowPV1 = window.levelbuildOnShowProjekteVorlagen;
  window.levelbuildOnShowProjekteVorlagen = function () {
    if (prevOnShowPV1) prevOnShowPV1();
    renderTemplateList();
    renderTemplateSelect();
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

    // Statusoptionen werden nicht mehr übergeordnet für die ganze Liste
    // gepflegt, sondern pro Tätigkeit im "Tätigkeit bearbeiten"-Fenster
    // (siehe openTaskModal weiter unten) - hier gibt es dafür bewusst keinen
    // Panel-Block mehr.

    // ---- tasks table ----
    if (emptyEl) emptyEl.hidden = list.tasks.length > 0;
    tbody.innerHTML = list.tasks.map((t) => {
      const vorgaenger = t.vorgaengerId ? list.tasks.find((x) => x.id === t.vorgaengerId) : null;
      const protokollNames = t.dokuArt === 'protokoll' ? resolveProtokollNames(taskProtokollIds(t), currentScope) : [];
      const doku = t.dokuArt === 'foto' ? 'Foto' : (t.dokuArt === 'protokoll' ? ('Protokoll' + (protokollNames.length ? ' (' + esc(protokollNames.join(', ')) + ')' : '')) : '–');
      const art = resolveTaetigkeitsartFor(t.taetigkeitsartId, currentScope);
      return `<tr>
        <td>${esc(t.nr)}</td>
        <td>${t.titel ? esc(t.titel) : '<span class="stat-value empty">–</span>'}</td>
        <td>${art ? `<span class="tl-status-chip" style="--tl-color:${esc(art.color)}">${esc(art.name)}</span>` : '–'}</td>
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
    // Lokale Arbeitskopie - wird wie alle anderen Felder in diesem Modal
    // erst beim Klick auf "Speichern" tatsächlich auf die Tätigkeit
    // übernommen, damit "Abbrechen" nichts vorzeitig verändert. Fällt beim
    // ersten Öffnen auf die (alten, listenweiten) statusOptions der Liste
    // zurück, falls diese eine Tätigkeit noch keine eigenen hat.
    let tkStatusOptions = JSON.parse(JSON.stringify(taskStatusOptions(task, list)));

    const predecessorOptions = list.tasks
      .filter((t) => t.id !== task.id)
      .map((t) => `<option value="${esc(t.id)}" ${task.vorgaengerId === t.id ? 'selected' : ''}>${esc(t.nr)} - ${esc(t.titel || '(ohne Titel)')}</option>`)
      .join('');
    const availableProtokolle = protokolleFor(currentScope);
    // Lokale Arbeitskopie wie tkStatusOptions oben - erst beim Speichern auf
    // die Tätigkeit übernommen. Dropdown zum Hinzufügen (wie vorher, nur
    // jetzt mehrfach nutzbar) + Chips zur Anzeige der bereits gewählten
    // Protokolle (gleiche Optik wie die Standorte-Chips im Bautagebuch),
    // statt einer Ankreuz-Liste.
    let tkProtokollIds = taskProtokollIds(task).slice();
    // Tätigkeitenarten (z. B. Einkauf/Lieferung/Ausführung) existieren nur
    // Bereits in einer noch projektunabhängigen Vorlage auswählbar (Nutzer-
    // Wunsch: "die Tätigkeitenart muss ja aber einer Tätigkeit auch
    // zugeordnet werden können") - dort aus den globalen Vorlagen-Arten,
    // in einem Projekt aus dessen (per cascadeTaetigkeitsartenInsProjekt()
    // automatisch übernommener) Projekt-Kopie. Beim späteren Übernehmen
    // dieser Liste ins Projekt wird eine hier schon gewählte Art auf ihr
    // Projekt-Pendant umgemappt, siehe projectAddBtn-Handler.
    const availableArten = taetigkeitsartenFor(currentScope);
    const artOptionsHtml = availableArten
      .map((a) => `<option value="${esc(a.id)}" ${task.taetigkeitsartId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`)
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
      <div class="field">
        <label>Art der Tätigkeit</label>
        <div class="input-wrap">
          <select id="tk-taetigkeitsart">
            <option value="">– Keine Art –</option>
            ${artOptionsHtml}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        ${availableArten.length === 0 ? `<div style="font-size:11px; color:var(--gray-500); margin-top:4px;">Noch keine Tätigkeitenarten ${currentScope === 'project' ? 'diesem Projekt zugeordnet' : 'angelegt'} - siehe Projekte &rsaquo; Vorlagen &rsaquo; Tätigkeitenarten.</div>` : ''}
        <div style="font-size:11px; color:var(--gray-500); margin-top:4px;">Dient der Gruppierung/Filterung in der Fertigstellungsliste - z. B. um dort nur "Einkauf" oder nur "Ausführung" (oder eine Kombination) anzuzeigen.</div>
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
        <label>Welche Protokolle?</label>
        <div id="tk-protokoll-chips" class="lm-standorte-chips"></div>
        <div class="input-wrap">
          <select id="tk-protokoll-add-select">
            <option value="">+ Protokoll hinzufügen</option>
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        ${availableProtokolle.length === 0 ? `<div style="font-size:11px; color:var(--gray-500); margin-top:4px;">Noch kein Protokoll ${currentScope === 'project' ? 'diesem Projekt zugeordnet' : 'angelegt'} - siehe Projekte &rsaquo; Vorlagen${currentScope === 'project' ? ' bzw. die Projekteinstellungen' : ''}.</div>` : ''}
        <div style="font-size:11px; color:var(--gray-500); margin-top:6px;">Sind mehrere Protokolle zugeordnet, wählt der Nutzer je Standort/Mast beim Öffnen der Tätigkeit in der App eins davon aus - ist eines für diesen einen Mast ausgefüllt, ist das andere nur für diesen Mast gesperrt (Oder-Verknüpfung, gilt nicht für andere Masten).</div>
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
        <label class="muted">Statusoptionen (nur für diese Tätigkeit)</label>
        <div style="font-size:11px; color:var(--gray-500); margin:-2px 0 8px;">Gilt nur für diese eine Tätigkeit - z. B. Nicht erledigt / In Arbeit / Erledigt, mit eigener Farbe und Symbol.</div>
        <div id="tk-status-list" class="tl-status-list"></div>
        <div class="field-row" style="align-items:flex-end; margin-top:8px;">
          <div class="field">
            <label>Bezeichnung</label>
            <div class="input-wrap"><input type="text" id="tk-status-new-label" placeholder="z. B. In Arbeit"></div>
          </div>
          <div class="field" style="max-width:70px;">
            <label>Farbe</label>
            <div class="input-wrap"><input type="color" id="tk-status-new-color" value="#2f6fed" style="padding:2px; height:34px;"></div>
          </div>
          <div class="field" style="max-width:70px;">
            <label>Symbol</label>
            <div class="input-wrap"><input type="text" id="tk-status-new-icon" maxlength="2" placeholder="✓"></div>
          </div>
          <button type="button" class="matt-tool-btn" id="tk-status-add" style="height:34px;">Hinzufügen</button>
        </div>
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

    // Chips zeigen die bereits zugeordneten Protokolle (Optik wie die
    // Standorte-Chips im Bautagebuch); das Dropdown darunter bietet nur noch
    // die NICHT bereits zugeordneten Protokolle an und fügt beim Auswählen
    // einen weiteren Chip hinzu - so bleibt die vertraute Dropdown-Bedienung
    // erhalten, erlaubt aber jetzt mehrere statt nur einer Auswahl.
    function renderTkProtokollUI() {
      const chipsEl = document.getElementById('tk-protokoll-chips');
      const selectEl = document.getElementById('tk-protokoll-add-select');
      if (!chipsEl || !selectEl) return;
      chipsEl.innerHTML = tkProtokollIds.length
        ? tkProtokollIds.map((id) => {
            const p = availableProtokolle.find((x) => x.id === id);
            const name = p ? p.name : '(gelöschtes Protokoll)';
            return `<span class="lm-standort-chip">${esc(name)}<button type="button" class="chip-remove" data-remove-tk-protokoll="${esc(id)}" title="Entfernen">×</button></span>`;
          }).join('')
        : '<div class="changelog-empty">Noch kein Protokoll zugeordnet.</div>';
      const remaining = availableProtokolle.filter((p) => tkProtokollIds.indexOf(p.id) === -1);
      selectEl.innerHTML = `<option value="">+ Protokoll hinzufügen</option>` +
        remaining.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.bausteine.length} Feld${p.bausteine.length === 1 ? '' : 'er'})</option>`).join('');
      chipsEl.querySelectorAll('[data-remove-tk-protokoll]').forEach((btn) => {
        btn.addEventListener('click', () => {
          tkProtokollIds = tkProtokollIds.filter((id) => id !== btn.getAttribute('data-remove-tk-protokoll'));
          renderTkProtokollUI();
        });
      });
    }
    renderTkProtokollUI();
    const tkProtokollAddSelect = document.getElementById('tk-protokoll-add-select');
    if (tkProtokollAddSelect) {
      tkProtokollAddSelect.addEventListener('change', () => {
        const val = tkProtokollAddSelect.value;
        if (val && tkProtokollIds.indexOf(val) === -1) tkProtokollIds.push(val);
        renderTkProtokollUI();
      });
    }

    function renderTkStatusList() {
      const el = document.getElementById('tk-status-list');
      if (!el) return;
      el.innerHTML = tkStatusOptions.map((s) => `
        <span class="tl-status-row">
          ${fmtStatusChip(s)}
          <button type="button" class="icon-btn" data-remove-tk-status="${esc(s.id)}" title="Entfernen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>`).join('');
      el.querySelectorAll('[data-remove-tk-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          tkStatusOptions = tkStatusOptions.filter((s) => s.id !== btn.getAttribute('data-remove-tk-status'));
          renderTkStatusList();
        });
      });
    }
    renderTkStatusList();
    const tkStatusAddBtn = document.getElementById('tk-status-add');
    if (tkStatusAddBtn) {
      tkStatusAddBtn.addEventListener('click', () => {
        const labelEl = document.getElementById('tk-status-new-label');
        const colorEl = document.getElementById('tk-status-new-color');
        const iconEl = document.getElementById('tk-status-new-icon');
        const label = labelEl ? labelEl.value.trim() : '';
        if (!label) return;
        tkStatusOptions.push({ id: makeId('st'), label, color: colorEl ? colorEl.value : '#2f6fed', icon: iconEl ? iconEl.value.trim() : '' });
        if (labelEl) labelEl.value = '';
        if (iconEl) iconEl.value = '';
        renderTkStatusList();
      });
    }

    document.getElementById('tk-cancel').addEventListener('click', () => { modalOverlay.hidden = true; });
    document.getElementById('tk-save').addEventListener('click', () => {
      task.nr = document.getElementById('tk-nr').value.trim() || task.nr;
      task.titel = document.getElementById('tk-titel').value.trim();
      const fristVal = document.getElementById('tk-frist').value;
      task.fristTage = fristVal === '' ? null : parseInt(fristVal, 10);
      task.rolle = document.getElementById('tk-rolle').value.trim();
      const artSel = document.getElementById('tk-taetigkeitsart');
      task.taetigkeitsartId = artSel && artSel.value ? artSel.value : null;
      task.dokuArt = document.getElementById('tk-doku-art').value;
      task.protokollIds = tkProtokollIds.slice();
      delete task.protokollId; // altes Einzelauswahl-Feld - Migration auf protokollIds abgeschlossen
      task.dokuPflichtZumAbhaken = document.getElementById('tk-pflicht-switch').classList.contains('on');
      task.web = document.getElementById('tk-web-switch').classList.contains('on');
      task.mobile = document.getElementById('tk-mobile-switch').classList.contains('on');
      const vg = document.getElementById('tk-vorgaenger').value;
      task.vorgaengerId = vg || null;
      task.statusOptions = tkStatusOptions;
      saveCurrentList(list);
      modalOverlay.hidden = true;
      renderEditor();
    });
  }

  renderEditor();
})();

// ======================================================================
// Automatische Zuordnung: Regeln, die einem Standort anhand seiner
// Masttafel-Werte automatisch eine Tätigkeitsliste zuweisen (siehe
// applyMastTlRegeln() etc. weiter oben in app.js für das Datenmodell/die
// Auswertung). Nutzer-Wunsch: kein eigenes Panel, sondern als Tabelle im
// selben Panel wie "Tätigkeitslisten in diesem Projekt" (siehe HTML). Nur
// auf der Projekteinstellungen-Seite (guarded durch #mtr-tbody). Eigenes
// IIFE-Scope mit eigenem openModal/closeModal-Wrapper, wie im Rest der
// Datei üblich.
// ======================================================================
(function () {
  const tbody = document.getElementById('mtr-tbody');
  if (!tbody) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

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

  function listName(id) {
    const l = loadTlProjectList().find((x) => x.id === id);
    return l ? l.name : '(gelöschte Liste)';
  }
  function operatorLabel(op) {
    const o = MAST_TL_REGEL_OPERATOREN.find((x) => x.value === op);
    return o ? o.label : op;
  }
  function bedingungSummary(b) {
    if (!b.spalte) return '…';
    return `„${b.spalte}" ${operatorLabel(b.operator)}${(b.operator !== 'leer' && b.operator !== 'nicht_leer') ? ` „${b.wert}"` : ''}`;
  }
  function regelSummaryHtml(r) {
    const bedingungen = (r.bedingungen || []).filter((b) => b.spalte);
    if (!bedingungen.length) return '<span style="color:var(--gray-500);">Noch keine Bedingung festgelegt.</span>';
    const verknuepfungLabel = r.verknuepfung === 'ODER' ? ' ODER ' : ' UND ';
    return 'WENN ' + bedingungen.map((b) => esc(bedingungSummary(b))).join(verknuepfungLabel);
  }

  function render() {
    const items = loadMastTlRegeln();
    const wrapEl = document.getElementById('mtr-wrap');
    const emptyEl = document.getElementById('mtr-empty');
    if (!items.length) {
      if (wrapEl) wrapEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      tbody.innerHTML = '';
      return;
    }
    if (wrapEl) wrapEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    tbody.innerHTML = items.map((r, i) => `
      <tr data-regel-id="${esc(r.id)}">
        <td>
          <span class="col-move-group">
            <button type="button" class="col-move-btn" data-move-regel="up" data-regel-idx="${i}" title="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="col-move-btn" data-move-regel="down" data-regel-idx="${i}" title="Nach unten" ${i === items.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
        </td>
        <td style="font-size:12px; color:var(--gray-600);">${regelSummaryHtml(r)}</td>
        <td><b>${esc(listName(r.taetigkeitslisteId))}</b></td>
        <td style="white-space:nowrap;">
          <button type="button" class="link-action" data-edit-regel="${esc(r.id)}">Bearbeiten</button>
          <button type="button" class="link-action" data-delete-regel="${esc(r.id)}" style="color:var(--red);">Löschen</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-move-regel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-regel-idx'), 10);
        const dir = btn.getAttribute('data-move-regel');
        const list = loadMastTlRegeln();
        const swapWith = dir === 'up' ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= list.length) return;
        const tmp = list[idx]; list[idx] = list[swapWith]; list[swapWith] = tmp;
        saveMastTlRegeln(list);
        render();
      });
    });
    tbody.querySelectorAll('[data-edit-regel]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor(btn.getAttribute('data-edit-regel')));
    });
    tbody.querySelectorAll('[data-delete-regel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-regel');
        if (!confirm('Diese Regel wirklich löschen?')) return;
        saveMastTlRegeln(loadMastTlRegeln().filter((r) => r.id !== id));
        render();
      });
    });
  }

  // ---------- Bedingungen-Editor innerhalb des Regel-Modals ----------
  let editingRegel = null; // Arbeitskopie, erst bei "Speichern" persistiert

  function spalteOptionsHtml(selected) {
    const cols = getKnownMasttafelColumns();
    if (!cols.length) return `<option value="${esc(selected || '')}">${esc(selected || '(keine Masttafel-Spalten gefunden)')}</option>`;
    return cols.map((c) => `<option value="${esc(c.label)}"${c.label === selected ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  }
  function operatorOptionsHtml(selected) {
    return MAST_TL_REGEL_OPERATOREN.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  }
  function bedingungRowHtml(b, i) {
    const wertDisabled = (b.operator === 'leer' || b.operator === 'nicht_leer');
    return `<div class="field-row" data-bedingung-row="${i}" style="align-items:flex-end;">
      <div class="field" style="flex:1.3;">
        <label>${i === 0 ? 'Spalte' : ''}</label>
        <div class="input-wrap"><select data-bedingung-spalte="${i}">${spalteOptionsHtml(b.spalte)}</select></div>
      </div>
      <div class="field">
        <label>${i === 0 ? 'Bedingung' : ''}</label>
        <div class="input-wrap"><select data-bedingung-operator="${i}">${operatorOptionsHtml(b.operator)}</select></div>
      </div>
      <div class="field">
        <label>${i === 0 ? 'Wert' : ''}</label>
        <div class="input-wrap"><input type="text" data-bedingung-wert="${i}" value="${esc(b.wert)}" ${wertDisabled ? 'disabled' : ''}></div>
      </div>
      <button type="button" class="col-move-btn" data-bedingung-remove="${i}" title="Bedingung entfernen" ${editingRegel.bedingungen.length <= 1 ? 'disabled' : ''}>✕</button>
    </div>`;
  }
  function renderBedingungenList() {
    const el = document.getElementById('mtr-bedingungen-list');
    if (!el) return;
    el.innerHTML = editingRegel.bedingungen.map((b, i) => bedingungRowHtml(b, i)).join('');
    el.querySelectorAll('[data-bedingung-spalte]').forEach((sel) => {
      sel.addEventListener('change', () => {
        editingRegel.bedingungen[parseInt(sel.getAttribute('data-bedingung-spalte'), 10)].spalte = sel.value;
      });
    });
    el.querySelectorAll('[data-bedingung-operator]').forEach((sel) => {
      sel.addEventListener('change', () => {
        editingRegel.bedingungen[parseInt(sel.getAttribute('data-bedingung-operator'), 10)].operator = sel.value;
        renderBedingungenList();
      });
    });
    el.querySelectorAll('[data-bedingung-wert]').forEach((inp) => {
      inp.addEventListener('input', () => {
        editingRegel.bedingungen[parseInt(inp.getAttribute('data-bedingung-wert'), 10)].wert = inp.value;
      });
    });
    el.querySelectorAll('[data-bedingung-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (editingRegel.bedingungen.length <= 1) return;
        editingRegel.bedingungen.splice(parseInt(btn.getAttribute('data-bedingung-remove'), 10), 1);
        renderBedingungenList();
      });
    });
  }

  function openEditor(id) {
    const existing = id ? loadMastTlRegeln().find((r) => r.id === id) : null;
    editingRegel = existing ? JSON.parse(JSON.stringify(existing)) : emptyMastTlRegel('');
    if (!editingRegel.bedingungen.length) editingRegel.bedingungen.push({ id: makeRegelId('bed'), spalte: '', operator: 'gleich', wert: '' });
    // Individuelle Standort-Kopien (siehe individualizeForMast() auf der
    // Mast-Detail-Seite) sind exklusiv für genau einen Mast gedacht - eine
    // Automatik-Regel darf nie eine solche Kopie als Ziel haben, sonst
    // würde sie potenziell mehreren Standorten zugewiesen.
    const lists = loadTlProjectList().filter((l) => !l.mastKey);
    const body = `
      <div class="field">
        <label>Tätigkeitsliste</label>
        <div class="input-wrap">
          <select id="mtr-edit-list">
            <option value="">Tätigkeitsliste auswählen…</option>
            ${lists.map((l) => `<option value="${esc(l.id)}"${l.id === editingRegel.taetigkeitslisteId ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="hr"></div>
      <div class="subheading" style="margin-bottom:0;">Bedingungen</div>
      <div id="mtr-bedingungen-list"></div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:8px; flex-wrap:wrap;">
        <button type="button" class="matt-tool-btn" id="mtr-bedingung-add">+ Bedingung hinzufügen</button>
        <select id="mtr-verknuepfung" style="margin-left:auto;">
          <option value="UND"${editingRegel.verknuepfung !== 'ODER' ? ' selected' : ''}>Alle Bedingungen müssen zutreffen (UND)</option>
          <option value="ODER"${editingRegel.verknuepfung === 'ODER' ? ' selected' : ''}>Mindestens eine Bedingung muss zutreffen (ODER)</option>
        </select>
      </div>
    `;
    const footer = `
      <button class="btn-primary" id="mtr-edit-save">Speichern</button>
      <button class="matt-tool-btn" id="mtr-edit-cancel">Abbrechen</button>
    `;
    openModal(existing ? 'Regel bearbeiten' : 'Neue Regel', body, footer);
    renderBedingungenList();
    document.getElementById('mtr-bedingung-add').addEventListener('click', () => {
      editingRegel.bedingungen.push({ id: makeRegelId('bed'), spalte: '', operator: 'gleich', wert: '' });
      renderBedingungenList();
    });
    document.getElementById('mtr-verknuepfung').addEventListener('change', (e) => { editingRegel.verknuepfung = e.target.value; });
    document.getElementById('mtr-edit-cancel').addEventListener('click', closeModal);
    document.getElementById('mtr-edit-save').addEventListener('click', () => {
      const listSel = document.getElementById('mtr-edit-list');
      editingRegel.taetigkeitslisteId = listSel ? listSel.value : '';
      if (!editingRegel.taetigkeitslisteId) { alert('Bitte eine Tätigkeitsliste auswählen.'); return; }
      if (!editingRegel.bedingungen.some((b) => b.spalte)) { alert('Bitte mindestens eine Bedingung mit ausgewählter Spalte festlegen.'); return; }
      const list = loadMastTlRegeln();
      const idx = list.findIndex((r) => r.id === editingRegel.id);
      if (idx >= 0) list[idx] = editingRegel; else list.push(editingRegel);
      saveMastTlRegeln(list);
      closeModal();
      render();
      // Nutzer-Wunsch: eine "wenn-dann"-Regel soll wirken, sobald sie
      // gespeichert ist - kein zusätzlicher Klick auf "Regeln jetzt
      // anwenden" nötig, der leicht übersehen wird (führte dazu, dass eine
      // gerade erst angelegte Regel scheinbar "nichts tat"). Der separate
      // Button bleibt trotzdem bestehen, für den Fall, dass später neue
      // Masttafel-Daten importiert werden, ohne dass sich an den Regeln
      // selbst etwas ändert.
      showApplyResult(applyMastTlRegeln());
    });
  }

  function showApplyResult(result) {
    const hint = document.getElementById('mtr-apply-hint');
    let text;
    if (result.geprueft === 0) {
      text = 'Keine Standorte gefunden - zuerst eine Masttafel importieren.';
    } else {
      text = `${result.angepasst} von ${result.geprueft} Standort${result.geprueft === 1 ? '' : 'en'} wurde${result.angepasst === 1 ? '' : 'n'} anhand der Regeln (neu) zugeordnet.`;
      if (result.uebersprungen) {
        text += ` ${result.uebersprungen} manuell zugeordnete${result.uebersprungen === 1 ? 'r' : ''} Standort${result.uebersprungen === 1 ? '' : 'e'} wurde${result.uebersprungen === 1 ? '' : 'n'} dabei nicht verändert.`;
      }
    }
    if (hint) {
      hint.textContent = text;
      hint.style.display = 'block';
      setTimeout(() => { hint.style.display = 'none'; }, 4000);
    } else {
      alert(text);
    }
  }

  const addBtn = document.getElementById('mtr-add');
  if (addBtn) addBtn.addEventListener('click', () => openEditor(null));

  const applyBtn = document.getElementById('mtr-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const regeln = loadMastTlRegeln();
      if (!regeln.length) { alert('Es sind noch keine Regeln angelegt.'); return; }
      showApplyResult(applyMastTlRegeln());
    });
  }

  render();

  // Die Regelliste ist project-scoped - beim Wechsel des Projekts muss sie
  // neu geladen werden, sonst zeigt sie weiter die Regeln des vorher
  // geöffneten Projekts.
  const prevOnShowPE5 = window.levelbuildOnShowProjekteinstellungen;
  window.levelbuildOnShowProjekteinstellungen = function () {
    if (prevOnShowPE5) prevOnShowPE5();
    render();
  };
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

  // Verkettet (nicht überschrieben) - die Tätigkeitslisten-Vorlagen-IIFE
  // registriert oben bereits denselben Hook für ihr eigenes Panel; würde
  // hier einfach zugewiesen statt verkettet, ginge deren Badge-Aktualisierung
  // verloren (genau der Bug, den der Nutzer gemeldet hat: "0 Tätigkeiten"
  // trotz hinzugefügter Aufgaben, weil das Panel nach dem Bearbeiten nie neu
  // gerendert wurde).
  const prevOnShowPV2 = window.levelbuildOnShowProjekteVorlagen;
  window.levelbuildOnShowProjekteVorlagen = function () {
    if (prevOnShowPV2) prevOnShowPV2();
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
// Tätigkeitenarten-Vorlagen: einfache, projektübergreifende Stammdaten-
// Verwaltung (Name + Farbe) auf der Projekte-Seite unter Vorlagen. Die
// tatsächliche Projekt-Kopie (inkl. des automatischen "in Kompletheit mit
// ins Projekt ziehen") lebt in cascadeTaetigkeitsartenInsProjekt() weiter
// oben (top-level, siehe nahe protokolleFor) - hier geht es nur um die
// Vorlagen selbst. Nur aktiv, wenn #ta-template-list existiert (Projekte-
// Seite, Tab "Vorlagen", immer im DOM in der zusammengeführten Shell).
// ======================================================================
(function () {
  const listEl = document.getElementById('ta-template-list');
  if (!listEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function render() {
    const items = loadTaetigkeitsartTemplates();
    listEl.innerHTML = items.length
      ? items.map((a) => `
        <div class="col-config-row">
          <span class="tl-status-chip" style="--tl-color:${esc(a.color)}">${esc(a.name)}</span>
          <button type="button" class="link-action" data-delete-ta="${esc(a.id)}" style="color:var(--red);">Löschen</button>
        </div>`).join('')
      : '<div class="changelog-empty">Noch keine Tätigkeitenarten angelegt.</div>';
    listEl.querySelectorAll('[data-delete-ta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-ta');
        if (!confirm('Diese Art wirklich löschen? Bereits in Projekte übernommene Kopien bleiben davon unberührt.')) return;
        saveTaetigkeitsartTemplates(loadTaetigkeitsartTemplates().filter((a) => a.id !== id));
        render();
      });
    });
  }

  const addBtn = document.getElementById('ta-template-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const nameEl = document.getElementById('ta-template-new-name');
      const colorEl = document.getElementById('ta-template-new-color');
      const name = nameEl ? nameEl.value.trim() : '';
      if (!name) return;
      const items = loadTaetigkeitsartTemplates();
      items.push({ id: makeTaetigkeitsartId(), name, color: colorEl ? colorEl.value : '#2f6fed' });
      saveTaetigkeitsartTemplates(items);
      if (nameEl) nameEl.value = '';
      render();
    });
  }

  render();
})();

// ======================================================================
// Lieferanten-Stammdaten: einfache, projektübergreifende Verwaltung (wie
// die Tätigkeitenarten-Vorlagen oben) auf der Projekte-Seite unter
// Vorlagen - bei jeder Bestellung im Bereich Einkauf auswählbar (siehe
// openBestellungModal in der Einkauf-IIFE weiter unten). Nur aktiv, wenn
// #lf-template-list existiert.
// ======================================================================
(function () {
  const listEl = document.getElementById('lf-template-list');
  if (!listEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

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

  function render() {
    const items = loadLieferanten();
    listEl.innerHTML = items.length
      ? items.map((l) => `
        <div class="col-config-row" data-lf-row="${esc(l.id)}">
          <div style="flex:1;">
            <div style="font-weight:600;">${esc(l.name || '–')}</div>
            <div style="font-size:12px; color:var(--gray-500);">${esc(l.strasse || '')}${l.strasse && l.plzOrt ? ', ' : ''}${esc(l.plzOrt || '')}${(l.kontaktName || l.kontaktTelefon) ? ' · ' + esc([l.kontaktName, l.kontaktTelefon].filter(Boolean).join(' · ')) : ''}</div>
          </div>
          <button type="button" class="link-action" data-edit-lf="${esc(l.id)}">Bearbeiten</button>
          <button type="button" class="link-action" data-delete-lf="${esc(l.id)}" style="color:var(--red);">Löschen</button>
        </div>`).join('')
      : '<div class="changelog-empty">Noch keine Lieferanten angelegt.</div>';
    listEl.querySelectorAll('[data-edit-lf]').forEach((btn) => {
      btn.addEventListener('click', () => openLieferantModal(btn.getAttribute('data-edit-lf')));
    });
    listEl.querySelectorAll('[data-delete-lf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-lf');
        if (!confirm('Diesen Lieferanten wirklich löschen? Bereits erstellte Bestellungen bleiben davon unberührt.')) return;
        saveLieferanten(loadLieferanten().filter((l) => l.id !== id));
        render();
      });
    });
  }

  function lieferantModalHtml(item) {
    return `
      <div class="field">
        <label>Name</label>
        <div class="input-wrap"><input type="text" id="lf-name" value="${esc(item.name || '')}" placeholder="z. B. Hahn Stahlrohrhandel GmbH"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Straße</label><div class="input-wrap"><input type="text" id="lf-strasse" value="${esc(item.strasse || '')}"></div></div>
        <div class="field"><label>PLZ / Ort</label><div class="input-wrap"><input type="text" id="lf-plzort" value="${esc(item.plzOrt || '')}"></div></div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="subheading" style="margin-bottom:0;">Ansprechpartner beim Lieferanten</div>
      <div class="field-row">
        <div class="field"><label>Name</label><div class="input-wrap"><input type="text" id="lf-kontakt-name" value="${esc(item.kontaktName || '')}"></div></div>
        <div class="field"><label>Telefon</label><div class="input-wrap"><input type="text" id="lf-kontakt-telefon" value="${esc(item.kontaktTelefon || '')}"></div></div>
      </div>
      <div class="field">
        <label>E-Mail</label>
        <div class="input-wrap"><input type="email" id="lf-kontakt-email" value="${esc(item.kontaktEmail || '')}"></div>
      </div>
    `;
  }

  function openLieferantModal(id) {
    let item = { name: '', strasse: '', plzOrt: '', kontaktName: '', kontaktTelefon: '', kontaktEmail: '' };
    let title = 'Lieferant hinzufügen';
    if (id) {
      const found = loadLieferanten().find((x) => x.id === id);
      if (found) item = found;
      title = 'Lieferant bearbeiten';
    }
    openModal(title, lieferantModalHtml(item), `
      <button type="button" class="matt-tool-btn" id="lf-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="lf-save">Speichern</button>
    `);
    document.getElementById('lf-cancel').addEventListener('click', closeModal);
    document.getElementById('lf-save').addEventListener('click', () => {
      const name = document.getElementById('lf-name').value.trim();
      if (!name) { alert('Bitte einen Namen eingeben.'); return; }
      const data = {
        name,
        strasse: document.getElementById('lf-strasse').value.trim(),
        plzOrt: document.getElementById('lf-plzort').value.trim(),
        kontaktName: document.getElementById('lf-kontakt-name').value.trim(),
        kontaktTelefon: document.getElementById('lf-kontakt-telefon').value.trim(),
        kontaktEmail: document.getElementById('lf-kontakt-email').value.trim(),
      };
      const list = loadLieferanten();
      if (id) {
        const existing = list.find((x) => x.id === id);
        if (existing) Object.assign(existing, data);
      } else {
        list.push(Object.assign({ id: makeLieferantId() }, data));
      }
      saveLieferanten(list);
      closeModal();
      render();
    });
  }

  const addBtn = document.getElementById('lf-template-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openLieferantModal(null));

  window.levelbuildOnShowLieferanten = render;
  render();
})();

// ======================================================================
// Elementenvorlagen: projektübergreifende, feste Formate für Elemente-
// Sammlungen (Nutzer-Wunsch, Folgeturn 3 - siehe Kommentar bei
// ELEMENT_TEMPLATES_KEY weiter oben). Verwaltung analog zum Lieferanten-
// Panel (modal-gesteuert), nur mit einem zusätzlichen Schritt: eine
// Beispieldatei einlesen, deren erkannte Kopfzeile das feste Format wird.
// Nur aktiv, wenn #et-template-list existiert (Vorlagen-Tab der Projekte-
// Seite).
// ======================================================================
(function () {
  const listEl = document.getElementById('et-template-list');
  if (!listEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

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

  function render() {
    const items = loadElementTemplates();
    listEl.innerHTML = items.length
      ? items.map((t) => {
          const cols = t.columns || [];
          const preview = cols.length ? cols.slice(0, 4).map((c) => c.label).join(', ') + (cols.length > 4 ? ' …' : '') : 'kein Format festgelegt';
          return `
        <div class="col-config-row" data-et-row="${esc(t.id)}">
          <div style="flex:1;">
            <div style="font-weight:600;">${esc(t.name)}</div>
            <div style="font-size:12px; color:var(--gray-500);">${cols.length} Spalten: ${esc(preview)}</div>
          </div>
          <button type="button" class="link-action" data-edit-et="${esc(t.id)}">Bearbeiten</button>
          <button type="button" class="link-action" data-delete-et="${esc(t.id)}" style="color:var(--red);">Löschen</button>
        </div>`;
        }).join('')
      : '<div class="changelog-empty">Noch keine Elementenvorlagen angelegt.</div>';
    listEl.querySelectorAll('[data-edit-et]').forEach((btn) => {
      btn.addEventListener('click', () => openElementTemplateModal(btn.getAttribute('data-edit-et')));
    });
    listEl.querySelectorAll('[data-delete-et]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-et');
        if (!confirm('Diese Elementenvorlage wirklich löschen? Bereits daraus angelegte Elementensammlungen in Projekten bleiben davon unberührt (sie behalten ihr bisheriges Format).')) return;
        saveElementTemplates(loadElementTemplates().filter((t) => t.id !== id));
        render();
      });
    });
  }

  function columnsPreviewHtml(cols) {
    if (!cols || !cols.length) return '<div class="changelog-empty" style="margin-top:8px;">Noch kein Format festgelegt - zuerst eine Beispieldatei einlesen.</div>';
    return `<div class="col-config-list" style="margin-top:8px;">${cols.map((c) => `<div class="col-config-row"><span>${esc(c.label)}</span></div>`).join('')}</div>`;
  }

  function openElementTemplateModal(id) {
    let item = { name: '', columns: [] };
    let title = 'Elementenvorlage anlegen';
    if (id) {
      const found = loadElementTemplates().find((x) => x.id === id);
      if (found) item = found;
      title = 'Elementenvorlage bearbeiten';
    }
    let pendingColumns = (item.columns || []).slice();
    openModal(title, `
      <div class="field">
        <label>Name</label>
        <div class="input-wrap"><input type="text" id="et-name" value="${esc(item.name || '')}" placeholder="z. B. Schweißliste"></div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="subheading" style="margin-bottom:0;">Festes Format</div>
      <div style="font-size:12px; color:var(--gray-500); margin-top:-4px;">
        Beispieldatei einlesen - die erkannte Kopfzeile wird zum festen, dauerhaften Format dieser Vorlage (erste Spalte ist der eindeutige Schlüssel, analog zur Mastnummer bei der Masttafel).
      </div>
      <button type="button" class="matt-tool-btn" id="et-import-btn" style="align-self:flex-start; margin-top:8px;">Beispieldatei einlesen (.xlsx)</button>
      <input type="file" id="et-file-input" accept=".xlsx,.xls" hidden>
      <div id="et-columns-preview">${columnsPreviewHtml(pendingColumns)}</div>
    `, `
      <button type="button" class="matt-tool-btn" id="et-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="et-save">Speichern</button>
    `);

    document.getElementById('et-import-btn').addEventListener('click', () => document.getElementById('et-file-input').click());
    document.getElementById('et-file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bytes = new Uint8Array(evt.target.result);
          const wb = XLSX.read(bytes, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const parsed = parseGenericElementSheet(ws);
          if (!parsed.columns.length) { alert('In dieser Datei konnte keine Kopfzeile erkannt werden.'); return; }
          pendingColumns = parsed.columns;
          const preview = document.getElementById('et-columns-preview');
          if (preview) preview.innerHTML = columnsPreviewHtml(pendingColumns);
        } catch (err) {
          alert('Datei konnte nicht gelesen werden - bitte eine gültige xlsx-Datei wählen.');
        }
      };
      reader.readAsArrayBuffer(file);
    });

    document.getElementById('et-cancel').addEventListener('click', closeModal);
    document.getElementById('et-save').addEventListener('click', () => {
      const name = document.getElementById('et-name').value.trim();
      if (!name) { alert('Bitte einen Namen eingeben.'); return; }
      if (!pendingColumns.length) { alert('Bitte zuerst eine Beispieldatei einlesen, um das feste Format festzulegen.'); return; }
      const list = loadElementTemplates();
      if (id) {
        const existing = list.find((x) => x.id === id);
        if (existing) { existing.name = name; existing.columns = pendingColumns; }
      } else {
        list.push({ id: makeElementTemplateId(), name, columns: pendingColumns, createdAt: new Date().toISOString() });
      }
      saveElementTemplates(list);
      closeModal();
      render();
    });
  }

  const addBtn = document.getElementById('et-template-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openElementTemplateModal(null));

  window.levelbuildOnShowElementTemplates = render;
  render();
})();

// ======================================================================
// Benutzerverwaltung (Projekte-Seite, Tab „Vorlagen"): listet alle Konten
// aus der Firestore-Collection 'users' (siehe ensureUserProfile in
// firebase-sync.js - legt bei jedem ersten Login automatisch ein Profil mit
// Rolle an). Nutzer-Wunsch: "Richte zudem eine Benutzerdatenbank ein. Ich
// selber bin der Admin Supreme." Nur sichtbar für Konten mit Rolle 'admin'
// oder 'supreme_admin' (window.intraCurrentUser, gesetzt sobald
// window.intraUserReady erfüllt ist); Rollen ändern kann ausschließlich
// 'supreme_admin'. Rein Firestore-basiert (keine localStorage-Daten, keine
// Projekt-Bindung) - unabhängig von pKey()/currentProjectId(). Nur aktiv,
// wenn #usr-list existiert (Projekte-Seite) UND Firebase geladen ist.
// ======================================================================
(function () {
  const listEl = document.getElementById('usr-list');
  const panelEl = document.getElementById('usr-panel');
  if (!listEl || !panelEl || typeof firebase === 'undefined' || !firebase.firestore) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtTimestamp(ts) {
    if (!ts) return '–';
    try {
      const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return '–';
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return '–'; }
  }

  const ROLE_LABELS = { supreme_admin: 'Supreme Admin', admin: 'Admin', user: 'Benutzer' };
  const ROLE_OPTIONS = ['user', 'admin', 'supreme_admin'];

  function renderUsers(users, me) {
    const canEdit = me && me.role === 'supreme_admin';
    if (!users.length) {
      listEl.innerHTML = '<div class="changelog-empty">Noch keine Benutzer angemeldet.</div>';
      return;
    }
    // Supreme Admin(s) zuerst, dann Admins, dann Benutzer; innerhalb gleicher
    // Rolle alphabetisch nach E-Mail - macht die eigene/oberste Rolle sofort
    // sichtbar statt in einer beliebig sortierten Liste suchen zu müssen.
    const order = { supreme_admin: 0, admin: 1, user: 2 };
    const sorted = users.slice().sort((a, b) => {
      const oa = order[a.role] != null ? order[a.role] : 3;
      const ob = order[b.role] != null ? order[b.role] : 3;
      if (oa !== ob) return oa - ob;
      return String(a.email || '').localeCompare(String(b.email || ''), 'de');
    });
    listEl.innerHTML = sorted.map((u) => `
      <div class="file-row" data-usr-row="${esc(u.id)}" style="align-items:center;">
        <div class="file-meta">
          <span class="file-name">${esc(u.email || '(ohne E-Mail)')}${me && u.id === me.uid ? ' <span class="file-section-tag">Sie</span>' : ''}${u.active === false ? ' <span class="file-section-tag" style="color:var(--red);">deaktiviert</span>' : ''}</span>
          <span class="file-sub">Erstellt ${fmtTimestamp(u.createdAt)} · Zuletzt angemeldet ${fmtTimestamp(u.lastLogin)}</span>
        </div>
        ${canEdit && !(u.id === me.uid)
          ? `<select data-usr-role-select="${esc(u.id)}" style="width:150px; flex:0 0 auto;">${ROLE_OPTIONS.map((r) => `<option value="${r}"${r === u.role ? ' selected' : ''}>${esc(ROLE_LABELS[r] || r)}</option>`).join('')}</select>`
          : `<span class="ver-badge${u.role === 'supreme_admin' ? ' current' : ''}" style="flex:0 0 auto;">${esc(ROLE_LABELS[u.role] || u.role || 'Benutzer')}</span>`}
      </div>`).join('');
    if (canEdit) {
      listEl.querySelectorAll('[data-usr-role-select]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const uid = sel.getAttribute('data-usr-role-select');
          const newRole = sel.value;
          firebase.firestore().collection('users').doc(uid).update({ role: newRole }).catch((e) => {
            alert('Rolle konnte nicht geändert werden: ' + (e && e.message ? e.message : e));
          });
        });
      });
    }
  }

  function loadAndRender(me) {
    firebase.firestore().collection('users').get().then((snap) => {
      const users = [];
      snap.forEach((doc) => users.push(Object.assign({ id: doc.id }, doc.data())));
      renderUsers(users, me);
    }).catch((e) => {
      listEl.innerHTML = '<div class="changelog-empty">Benutzerliste konnte nicht geladen werden (' + esc(e && e.message ? e.message : String(e)) + ').</div>';
    });
  }

  if (!window.intraUserReady) return;
  window.intraUserReady.then((me) => {
    if (!me || (me.role !== 'admin' && me.role !== 'supreme_admin')) return; // Panel bleibt hidden für normale Benutzer
    panelEl.hidden = false;
    loadAndRender(me);
  });
})();

// ======================================================================
// Diagnose-Protokoll (Projekte-Seite, Tab „Vorlagen") - Desktop-Gegenstück
// zum "Diagnose"-Knopf in der Handy-App (siehe dort renderDiagnoseLog()).
// Zeigt das von logDebugEvent() (firebase-sync.js) mitgeschriebene
// Protokoll als Text mit Kopieren-Knopf. Rein lesend, kein Rollen-Gate -
// reine Betriebsdiagnose. Only runs when #diag-text existiert.
// ======================================================================
(function () {
  const textEl = document.getElementById('diag-text');
  if (!textEl) return;

  function fmtDiagTs(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) { return String(iso); }
  }
  function render() {
    let list;
    try { list = JSON.parse(localStorage.getItem('levelbuild_debug_log') || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    const countEl = document.getElementById('diag-count');
    if (countEl) countEl.textContent = String(list.length);
    textEl.textContent = list.length
      ? list.slice().reverse().map((e) => {
          const status = e.ok === true ? 'OK' : (e.ok === false ? 'FEHLER' : '·');
          return `[${fmtDiagTs(e.ts)}] ${e.device || '?'} · ${status} · ${e.action}\n${e.detail}`;
        }).join('\n\n')
      : 'Noch keine Einträge.';
  }

  const refreshBtn = document.getElementById('diag-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', render);
  const copyBtn = document.getElementById('diag-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textEl.textContent);
        copyBtn.textContent = 'Kopiert!';
      } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        copyBtn.textContent = 'Bitte manuell kopieren (markiert)';
      }
      setTimeout(() => { copyBtn.textContent = 'In Zwischenablage kopieren'; }, 2500);
    });
  }

  const prevRenderDiag = window.levelbuildOnShowProjekteVorlagen;
  window.levelbuildOnShowProjekteVorlagen = function () {
    if (prevRenderDiag) prevRenderDiag();
    render();
  };
  render();
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

    // "Datenpfad <Name>"-Spalten (siehe extractDatenpfadRefs weiter oben)
    // werden nie als normale Tabellenspalte übernommen - weder im
    // Tabellenkopf (theadHtml) noch in den Zeilenwerten/Versionen, da ihr
    // Zellwert ein Datei-Pfad ist, kein Anzeigewert. Vorher ermitteln,
    // welche rohen Spaltenpositionen das betrifft, und einen fortlaufenden,
    // lückenlosen Index für alle übrigen Spalten vergeben - dieser
    // bereinigte Index landet in columns[].idx, den data-col-Attributen und
        // den Zeilenwerten, nicht die rohe Blattposition. (Angenommen wird,
    // dass Datenpfad-Spalten einfache, nicht mit Nachbarn verbundene
    // Einzelspalten sind - bei einer Masttafel realistisch, da sie kein Teil
    // des festen, mehrzeiligen Kopfzeilen-Layouts sind.)
    const excludedRawCols = new Set();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const label = getColumnLabel(ws, mergeMap, range, headerEndRow, c);
      if (/^Datenpfad\b/i.test(String(label || '').trim())) excludedRawCols.add(c);
    }
    const keptIdxByRawCol = new Map();
    {
      let n = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (excludedRawCols.has(c)) continue;
        keptIdxByRawCol.set(c, n);
        n++;
      }
    }

    const consumed = {};
    const headerRowsHtml = [];
    for (let r = range.s.r; r <= headerEndRow; r++) {
      let rowHtml = '';
      for (let c = range.s.c; c <= range.e.c; c++) {
        const key = r + ',' + c;
        if (consumed[key]) continue;
        if (excludedRawCols.has(c)) { consumed[key] = true; continue; }
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
          rowHtml += `<th ${attrs.join(' ')}${isKeyCol} data-col="${keptIdxByRawCol.get(c)}">${esc(cellText(ws, r, c)).replace(/\n/g, '<br>')}</th>`;
        } else if (!info) {
          consumed[key] = true;
          const leafAttr = r === headerEndRow ? ' data-leaf="1"' : '';
          rowHtml += `<th${leafAttr}${isKeyCol} data-col="${keptIdxByRawCol.get(c)}">${esc(cellText(ws, r, c)).replace(/\n/g, '<br>')}</th>`;
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
      if (excludedRawCols.has(c)) continue;
      columns.push({ idx: keptIdxByRawCol.get(c), label: getColumnLabel(ws, mergeMap, range, headerEndRow, c) });
    }

    const bodyConsumed = {};
    const rows = [];
    for (let r = headerEndRow + 1; r <= range.e.r; r++) {
      const values = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (excludedRawCols.has(c)) continue;
        values.push(cellText(ws, r, c));
      }
      const rowMerges = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const key = r + ',' + c;
        if (bodyConsumed[key]) continue;
        if (excludedRawCols.has(c)) { bodyConsumed[key] = true; continue; }
        const info = mergeMap[key];
        if (info && info.topR === r && info.topC === c && info.colspan > 1) {
          for (let cc = c; cc < c + info.colspan; cc++) bodyConsumed[r + ',' + cc] = true;
          rowMerges.push({ start: keptIdxByRawCol.get(c), len: info.colspan });
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
      doc.text('Intra', marginX, pageHeight - 10);
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
        // Siehe Kommentar bei extractDatenpfadRefs/handleDatenpfadAfterImport
        // weiter oben in app.js: "Datenpfad <Name>"-Spalten sind bereits aus
        // parsed.columns/rows entfernt (parseWorkbookSheet) - hier nur noch
        // die eigentlichen Pfad-Werte für die spätere Dokumenten-Auflösung
        // einsammeln.
        const datenpfadRefs = extractDatenpfadRefs(ws, null);
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
        handleDatenpfadAfterImport(datenpfadRefs, file.name, attachMastDatenpfadDokumente);
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

  // Nutzer-Wunsch: "es muss eine Möglichkeit geben mehrere Masten
  // auszuwählen und ihnen eine Tätigkeitenliste zuzuordnen" - bislang ging
  // das nur einzeln auf der Mast-Detail-Seite. Nutzt dieselbe Checkbox-
  // Auswahl (MT.selectedKeys), die "Löschen" schon anbietet, und schreibt
  // direkt in MAST_TL_ASSIGNMENT_KEY - exakt denselben Speicher, den auch
  // die Mast-Detail-Seite und die Regel-Automatik (siehe
  // applyMastTlRegeln() weiter oben in app.js) verwenden, sodass sich
  // einzelne Standorte danach dort weiterhin individuell nachjustieren
  // lassen.
  function openBulkAssignTlModal() {
    if (MT.selectedKeys.size === 0) return;
    const count = MT.selectedKeys.size;
    // Individuelle Standort-Kopien (siehe individualizeForMast() auf der
    // Mast-Detail-Seite) sind exklusiv für genau einen Mast gedacht - bei
    // einer Mehrfachauswahl werden nur die allgemeinen Projekt-Listen
    // angeboten, damit eine solche Kopie nicht versehentlich mehreren
    // Standorten gleichzeitig zugewiesen wird.
    const lists = loadTlProjectList().filter((l) => !l.mastKey);
    modalTitle.textContent = `Tätigkeitsliste für ${count} Standort${count === 1 ? '' : 'e'} zuordnen`;
    modalBody.innerHTML = `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:10px;">
        Bereits bestehende Zuordnungen der ausgewählten Standorte werden dabei überschrieben. Einzelne Standorte lassen sich danach jederzeit auf der Mast-Detail-Seite individuell anpassen.
      </div>
      <div class="field">
        <label>Tätigkeitsliste</label>
        <div class="input-wrap">
          <select id="matt-bulk-tl-select">
            <option value="">Keine (Zuordnung entfernen)</option>
            ${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.tasks.length})</option>`).join('')}
          </select>
        </div>
      </div>
    `;
    modalFooter.innerHTML = `
      <button class="btn-primary" id="matt-bulk-tl-save">Zuordnen</button>
      <button class="matt-tool-btn" id="matt-bulk-tl-cancel">Abbrechen</button>
    `;
    modalOverlay.hidden = false;
    const cancelBtn = document.getElementById('matt-bulk-tl-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    const saveBtn = document.getElementById('matt-bulk-tl-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const selId = document.getElementById('matt-bulk-tl-select').value;
        const assignments = loadMastTlAssignments();
        MT.selectedKeys.forEach((key) => {
          if (selId) assignments[key] = selId; else delete assignments[key];
        });
        saveMastTlAssignments(assignments);
        // Wie die Einzel-Zuordnung auf der Mast-Detail-Seite gilt auch eine
        // hier per Mehrfachauswahl getroffene Zuordnung als manuell - eine
        // spätere Regel-Anwendung (Projekteinstellungen) lässt diese
        // Standorte danach in Ruhe (siehe MAST_TL_MANUAL_KEY in app.js).
        const manuell = loadMastTlManuell();
        MT.selectedKeys.forEach((key) => { manuell[key] = true; });
        saveMastTlManuell(manuell);
        closeModal();
        const gewaehlt = lists.find((l) => l.id === selId);
        alert(gewaehlt
          ? `"${gewaehlt.name}" wurde ${count} Standort${count === 1 ? '' : 'en'} zugeordnet.`
          : `Zuordnung für ${count} Standort${count === 1 ? '' : 'e'} entfernt.`);
      });
    }
  }
  const assignTlSelectedBtn = document.getElementById('matt-assign-tl-selected');
  if (assignTlSelectedBtn) assignTlSelectedBtn.addEventListener('click', openBulkAssignTlModal);

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
    const crumbProjekt = document.getElementById('md-crumb-projekt');
    if (crumbProjekt) crumbProjekt.textContent = raw.projectLabel || currentProjectLabel();
    document.title = `${raw.key} - ${selected} · Intra`;

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
  // Prüft für einen einzelnen Baustein, ob er (je nach Typ passend) als
  // "beantwortet" gilt - exakte Kopie der gleichnamigen Funktion in
  // handyapp.js (siehe dort für den Hintergrund). Wichtig für Checkbox- und
  // Tabelle-Bausteine: eine unberührte Checkbox liefert immer ein Objekt wie
  // "{optA:false, optB:false}" (nie null/''), eine unbefüllte Tabelle immer
  // ein Array leerer Zellen - eine generische "ist überhaupt ein Wert da?"-
  // Prüfung (wie renderDatensaetze() vorher direkt inline hatte) zählt beides
  // fälschlich als "beantwortet", obwohl nichts angekreuzt/eingetragen wurde.
  // Das führte dazu, dass ein leer gespeichertes Protokoll trotzdem als
  // Datensatz auftauchte bzw. (in der Handy-App) eine Tätigkeit als
  // "Erledigt" anzeigte/andere Protokolle sperrte, obwohl nichts ausgefüllt
  // war - genau der gemeldete "Checken der Tätigkeiten funktioniert nicht
  // ganz"-Bug.
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
  function protokollHatEchteAntworten(protokoll, answers) {
    if (!protokoll || !Array.isArray(protokoll.bausteine)) return false;
    return protokoll.bausteine.some((b) => {
      if (b.type === 'abschnitt') return false;
      return isBausteinAnswered(b, (answers || {})[b.id]);
    });
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
  // Statusoptionen gelten seit dem Nutzer-Feedback ("Statusoption ... auf
  // die einzelnen Tätigkeiten übertragen, nicht übergeordnet auf die ganze
  // Tätigkeitenliste") pro Tätigkeit - Fallback auf die (ältere) Listen-
  // weite Konfiguration bzw. den Hart-Default, falls eine Tätigkeit noch
  // keine eigenen statusOptions hat. Eigene Kopie dieser kleinen Funktion,
  // da diese IIFE ihr eigenes, unabhängiges Scope hat (siehe Kommentar am
  // Dateianfang zu diesem Muster).
  function taskStatusOptions(t, list) {
    if (t && Array.isArray(t.statusOptions) && t.statusOptions.length) return t.statusOptions;
    if (list && Array.isArray(list.statusOptions) && list.statusOptions.length) return list.statusOptions;
    return [
      { id: 'st-default-open', label: 'Nicht erledigt', color: '#8a94a6', icon: '○' },
      { id: 'st-default-done', label: 'Erledigt', color: '#3fb950', icon: '✓' },
    ];
  }
  function makeLocalId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ----------------------------------------------------------------------
  // Standort-individuelle Kopie: Nutzer-Wunsch: eine einem Standort
  // zugeordnete Tätigkeitsliste muss sich für GENAU diesen einen Standort
  // anpassen lassen können, ohne die Projekt-Tätigkeitsliste (die evtl.
  // andere Standorte teilen) oder die übergeordnete Vorlage zu verändern -
  // "selbe Logik mit den Protokollen, die in der Liste dann sind". Statt
  // eines eigenen Speichers/einer eigenen Editor-UI lebt die individuelle
  // Kopie einfach als ganz normaler Eintrag in derselben
  // levelbuild_taetigkeitslisten_projekt-Liste (bzw. für Protokolle in
  // levelbuild_protokolle_projekt), nur mit einem zusätzlichen `mastKey`-
  // Feld markiert - bearbeitet wird sie über den bereits bestehenden
  // Tätigkeitsliste-Editor (window.levelbuildOpenTaetigkeitsliste), es
  // entsteht also bewusst KEIN neuer Bereich auf dieser Seite.
  // ----------------------------------------------------------------------

  // Kopiert die von den Tasks der Liste referenzierten (bislang projekt-
  // weiten) Protokolle in frische, mastKey-markierte Kopien - analog zu
  // cascadeProtokolleInsProjektFuerListe() weiter oben in app.js, nur
  // "Projekt -> Standort" statt "Vorlage -> Projekt". Gibt eine
  // altePid -> neuePid-Map zurück, mit der die kopierten Tasks unten auf
  // die neuen, exklusiven Protokoll-Kopien umgeschrieben werden.
  function cascadeProtokolleFuerStandort(mastKey, list) {
    const idMap = {};
    const referencedIds = new Set();
    (list.tasks || []).forEach((t) => {
      (Array.isArray(t.protokollIds) ? t.protokollIds : []).forEach((pid) => { if (pid) referencedIds.add(pid); });
    });
    if (!referencedIds.size) return idMap;
    const projectProtokolle = loadProtokollProjectList();
    let changed = false;
    referencedIds.forEach((refId) => {
      const src = projectProtokolle.find((p) => p.id === refId);
      if (!src) return;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = makeProtokollId('pr');
      copy.mastKey = mastKey;
      copy.sourceProjectProtokollId = src.id;
      (copy.bausteine || []).forEach((b) => { b.id = makeProtokollId('bs'); });
      projectProtokolle.push(copy);
      idMap[refId] = copy.id;
      changed = true;
    });
    if (changed) saveProtokollProjectList(projectProtokolle);
    return idMap;
  }

  // Legt (falls noch nicht geschehen) eine unabhängige, mastKey-markierte
  // Kopie der aktuell zugeordneten Tätigkeitsliste an, ordnet sie diesem
  // Mast zu (als "manuell", siehe MAST_TL_MANUAL_KEY - eine spätere
  // Regel-Anwendung lässt diesen Standort dann in Ruhe) und öffnet direkt
  // den bestehenden Editor dafür. Ist die aktuell zugeordnete Liste bereits
  // die individuelle Kopie dieses Standorts, wird sie ohne Rückfrage
  // direkt zum Bearbeiten geöffnet.
  function individualizeForMast(mastKey, mastLabel) {
    const assignments = loadMastTlAssignments();
    const currentId = assignments[mastKey];
    const sourceList = currentId ? loadTlProjectList().find((l) => l.id === currentId) : null;
    if (!sourceList) {
      alert('Bitte zuerst oben eine Tätigkeitsliste zuordnen, bevor sie individuell angepasst werden kann.');
      return;
    }
    if (sourceList.mastKey === mastKey) {
      window.levelbuildOpenTaetigkeitsliste('project', sourceList.id);
      return;
    }
    if (!confirm(`Für „${mastLabel}" eine eigene, unabhängige Kopie von „${sourceList.name}" anlegen? Änderungen daran wirken sich danach nur auf diesen einen Standort aus - die Projekt-Liste (und alle anderen Standorte, die sie ggf. nutzen) sowie die übergeordnete Vorlage bleiben unverändert.`)) return;

    const protokollIdMap = cascadeProtokolleFuerStandort(mastKey, sourceList);
    const copy = JSON.parse(JSON.stringify(sourceList));
    copy.id = makeLocalId('tl');
    copy.mastKey = mastKey;
    copy.sourceProjectListId = sourceList.id;
    copy.tasks.forEach((t) => {
      t.id = makeLocalId('tk');
      // Wie beim Vorlage->Projekt-Übernehmen: jede Aufgabe bekommt ihre
      // eigenen, frisch ge-id-eten Statusoptionen, damit auch Umbenennungen
      // der Status-Pillen die geteilte Projekt-Liste nicht antasten.
      const srcStatus = taskStatusOptions(t, sourceList);
      t.statusOptions = srcStatus.map((s) => ({ id: makeLocalId('st'), label: s.label, color: s.color, icon: s.icon }));
      if (Array.isArray(t.protokollIds) && t.protokollIds.length) {
        t.protokollIds = t.protokollIds.map((pid) => protokollIdMap[pid]).filter(Boolean);
      }
    });
    const lists = loadTlProjectList();
    lists.push(copy);
    saveTlProjectList(lists);

    assignments[mastKey] = copy.id;
    saveMastTlAssignments(assignments);
    const manuell = loadMastTlManuell();
    manuell[mastKey] = true;
    saveMastTlManuell(manuell);

    window.levelbuildOpenTaetigkeitsliste('project', copy.id);
  }

  function render() {
    const mastKey = currentMastKey();
    const tasksEl = document.getElementById('md-tl-tasks');
    const countEl = document.getElementById('md-taetigkeiten-count');
    const hintEl = document.getElementById('md-tl-manual-hint');
    if (!mastKey) {
      selectEl.disabled = true;
      selectEl.innerHTML = '<option value="">–</option>';
      if (tasksEl) tasksEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      if (hintEl) hintEl.hidden = true;
      return;
    }
    selectEl.disabled = false;
    const allLists = loadTlProjectList();
    // Individuelle Standort-Kopien (siehe individualizeForMast() oben) sind
    // exklusiv für genau einen Mast gedacht - im Dropdown erscheinen daher
    // nur die allgemeinen Projekt-Listen plus (falls vorhanden) die
    // individuelle Kopie GENAU dieses Masts, nicht die anderer Standorte.
    const lists = allLists.filter((l) => !l.mastKey || l.mastKey === mastKey);
    const assignments = loadMastTlAssignments();
    const currentId = assignments[mastKey] || '';
    selectEl.innerHTML = '<option value="">Keine zugeordnet</option>' +
      lists.map((l) => `<option value="${esc(l.id)}"${l.id === currentId ? ' selected' : ''}>${esc(l.name)}${l.mastKey ? ' (individuelle Kopie)' : ''} (${l.tasks.length})</option>`).join('');
    const list = lists.find((l) => l.id === currentId);
    if (countEl) countEl.textContent = list ? String(list.tasks.length) : '0';
    const individualizeBtn = document.getElementById('md-tl-individualize');
    if (individualizeBtn) {
      if (!list) {
        individualizeBtn.hidden = true;
      } else {
        individualizeBtn.hidden = false;
        individualizeBtn.textContent = list.mastKey === mastKey
          ? 'Individuelle Kopie dieses Standorts bearbeiten'
          : 'Für diesen Standort individuell anpassen';
      }
    }
    // Nutzer-Wunsch: eine hier einzeln (manuell) für genau diesen Mast
    // gesetzte Zuordnung soll bestehen bleiben, auch wenn später erneut
    // "Regeln jetzt anwenden" (Projekteinstellungen) läuft - siehe
    // applyMastTlRegeln(). Der Hinweis + Reset-Link macht sichtbar, dass
    // (und wie) das rückgängig gemacht werden kann.
    if (hintEl) {
      const manuell = loadMastTlManuell();
      if (manuell[mastKey]) {
        hintEl.hidden = false;
        hintEl.innerHTML = 'Manuell zugeordnet - wird von der automatischen Regel-Zuordnung nicht mehr verändert. <button type="button" class="link-action" id="md-tl-reset-manual">Automatik wieder zulassen</button>';
        const resetBtn = document.getElementById('md-tl-reset-manual');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            const m = loadMastTlManuell();
            delete m[mastKey];
            saveMastTlManuell(m);
            render();
          });
        }
      } else {
        hintEl.hidden = true;
      }
    }
    if (tasksEl) {
      if (!list) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diesem Mast ist noch keine Tätigkeitsliste zugeordnet - danach lassen sich Aufgaben und Protokolle in der Handy-App für genau diesen Mast bearbeiten.</div>';
      } else if (!list.tasks.length) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diese Tätigkeitsliste hat noch keine Aufgaben.</div>';
      } else {
        const statusMap = loadMastTaskStatus()[mastKey] || {};
        tasksEl.innerHTML = list.tasks.map((t) => {
          const opts = taskStatusOptions(t, list);
          const statusId = statusMap[t.id] || (opts[0] && opts[0].id);
          const status = opts.find((s) => s.id === statusId) || opts[0];
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
    // Eine hier am Mast-Detail einzeln getroffene Auswahl gilt als manuell -
    // applyMastTlRegeln() lässt diesen Standort danach in Ruhe (siehe
    // MAST_TL_MANUAL_KEY oben in app.js), bis der Nutzer über den
    // "Automatik wieder zulassen"-Link (siehe render()) das Gegenteil sagt.
    const manuell = loadMastTlManuell();
    manuell[mastKey] = true;
    saveMastTlManuell(manuell);
    render();
  });

  const individualizeBtnEl = document.getElementById('md-tl-individualize');
  if (individualizeBtnEl) {
    individualizeBtnEl.addEventListener('click', () => {
      const mastKey = currentMastKey();
      if (!mastKey) return;
      individualizeForMast(mastKey, currentMastLabel());
    });
  }

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
      // Bausteinweise (typ-bewusste) Prüfung, wenn die Vorlage noch existiert
      // - nur so werden leere Checkbox-/Tabelle-Bausteine korrekt als "nicht
      // beantwortet" erkannt (siehe isBausteinAnswered oben). Vorlage
      // gelöscht: grobe Ersatzprüfung, damit ein Datensatz mit Rohdaten nicht
      // komplett verschwindet, nur weil sich nichts mehr typgenau prüfen lässt.
      const hasAny = protokoll ? protokollHatEchteAntworten(protokoll, answers) : Object.keys(answers).some((k) => {
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
// Mast-Detail: Verknüpfungen-Kachel "Dokumente" - zeigt die Anzahl der über
// den Datenpfad-Import automatisch hinterlegten Dokumente (siehe
// MAST_DOKUMENTE_KEY/attachMastDatenpfadDokumente weiter oben in app.js) und
// öffnet eine einfache Liste mit Download-Links, im selben Stil wie die
// Datei-Liste der Masttafel (.file-row, siehe style.css). Eigenständige
// IIFE, chaint sich zusätzlich in window.levelbuildMastDetailRender ein.
// Only runs on mast-detail.html (guarded by #md-dok-tile).
// ======================================================================
(function () {
  const tile = document.getElementById('md-dok-tile');
  if (!tile) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtDatumKurz(iso) {
    const s = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  }
  function currentKey() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? raw.key : null;
  }

  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  function openList() {
    const key = currentKey();
    if (!key || !modalOverlay) return;
    const docs = (typeof getMastDatenpfadDokumente === 'function') ? getMastDatenpfadDokumente(key) : [];
    modalTitle.textContent = `Dokumente · Mast ${key}`;
    modalBody.innerHTML = docs.length ? docs.map((d) => `
      <div class="file-row">
        <span class="file-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>
        <div class="file-meta">
          <span class="file-name">${esc(d.name)} <span class="file-section-tag">${esc(d.typ)}</span></span>
          <span class="file-sub">${fmtBytes(d.size)} · hinzugefügt am ${fmtDatumKurz(d.attachedAt)}${d.sourceFile ? ' · aus ' + esc(d.sourceFile) : ''}</span>
        </div>
        <a class="icon-btn" title="Herunterladen" href="${d.url}" download="${esc(d.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
        </a>
      </div>`).join('') : '<div class="changelog-empty">Noch keine Dokumente über einen Datenpfad-Import hinterlegt.</div>';
    modalFooter.innerHTML = `<button type="button" class="matt-tool-btn" id="md-dok-close">Schließen</button>`;
    modalOverlay.hidden = false;
    const closeBtn = document.getElementById('md-dok-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { modalOverlay.hidden = true; });
  }
  tile.addEventListener('click', openList);

  function renderCount() {
    const countEl = document.getElementById('md-dok-count');
    if (!countEl) return;
    const key = currentKey();
    const n = key && typeof getMastDatenpfadDokumente === 'function' ? getMastDatenpfadDokumente(key).length : 0;
    countEl.textContent = `${n} Dokument${n === 1 ? '' : 'e'}`;
  }

  const prevRenderDok = window.levelbuildMastDetailRender;
  window.levelbuildMastDetailRender = function () {
    if (prevRenderDok) prevRenderDok();
    renderCount();
  };
  renderCount();
})();

// ======================================================================
// Mast-Detail: Verknüpfungen-Kacheln "Fotos"/"Ereignisse"/"Bautagebücher" -
// Nutzer-Wunsch: "andere Dokumenten Fotos Ereignis und Bautagesbericht
// Kacheln gefüllt werden, so wie es logisch ist". Fotos zählt/verlinkt wie
// die Dokumente-Kachel oben (nur Ziel Fotos-Seite statt Dokumente-Seite,
// per sessionStorage-Deep-Link genau wie "Alle Dokumente dieses Masts"),
// Ereignisse/Bautagebücher sind rein lesende Zähl-Kacheln (keine eigene
// Standort-gefilterte Ansicht in Bautagebuch-Liste vorhanden), verlinken
// aber trotzdem zur Bautagebuch-Liste für den nächsten Schritt. Eigenständige
// IIFE, chaint sich zusätzlich in window.levelbuildMastDetailRender ein.
// Only runs on mast-detail.html (guarded by #md-foto-tile).
// ======================================================================
(function () {
  const fotoTile = document.getElementById('md-foto-tile');
  if (!fotoTile) return;

  function currentMastKeyNorm() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? raw.mastKey : null;
  }
  function currentMastLabelDisplay() {
    let raw;
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_mast_detail') || 'null'); } catch (e) { raw = null; }
    return raw ? raw.key : null;
  }

  fotoTile.addEventListener('click', () => {
    // Fotos-Seite filtert nach mastKey (normalisiert), im Unterschied zur
    // Dokumente-Seite (die zusätzlich per Label matcht) - deshalb hier
    // bewusst den normalisierten Schlüssel übergeben, nicht das Display-Label.
    const keyNorm = currentMastKeyNorm();
    if (keyNorm) { try { sessionStorage.setItem('levelbuild_foto_prefill_mast', keyNorm); } catch (e) { /* ignore */ } }
    if (window.levelbuildGo) window.levelbuildGo('fotos');
  });

  const ereignisTile = document.getElementById('md-ereignis-tile');
  if (ereignisTile) {
    ereignisTile.addEventListener('click', () => { if (window.levelbuildGo) window.levelbuildGo('bautagebuch-liste'); });
  }
  const btTile = document.getElementById('md-bt-tile');
  if (btTile) {
    btTile.addEventListener('click', () => { if (window.levelbuildGo) window.levelbuildGo('bautagebuch-liste'); });
  }

  function renderCounts() {
    const keyNorm = currentMastKeyNorm();
    const labelDisplay = currentMastLabelDisplay();

    const fotoCountEl = document.getElementById('md-foto-count');
    if (fotoCountEl) {
      const all = (typeof collectAllProjectFotos === 'function') ? collectAllProjectFotos() : [];
      const n = keyNorm ? all.filter((f) => f.mastKey === keyNorm).length : 0;
      fotoCountEl.textContent = `${n} Foto${n === 1 ? '' : 's'}`;
    }

    const bautagebuecher = (typeof loadBautagebuecher === 'function') ? loadBautagebuecher() : [];
    const ereignisCountEl = document.getElementById('md-ereignis-count');
    if (ereignisCountEl) {
      let n = 0;
      if (keyNorm) {
        bautagebuecher.forEach((r) => { (r.ereignisse || []).forEach((e) => { if (e.mastKey === keyNorm) n++; }); });
      }
      ereignisCountEl.textContent = `${n} Ereignis${n === 1 ? '' : 'se'}`;
    }

    const btCountEl = document.getElementById('md-bt-count');
    if (btCountEl) {
      let n = 0;
      if (keyNorm || labelDisplay) {
        bautagebuecher.forEach((r) => {
          const viaEreignis = (r.ereignisse || []).some((e) => e.mastKey === keyNorm);
          const viaLeistung = (r.leistungen || []).some((l) => (l.standorte || []).includes(labelDisplay));
          if (viaEreignis || viaLeistung) n++;
        });
      }
      btCountEl.textContent = `${n} ${n === 1 ? 'Bautagebuch' : 'Bautagebücher'}`;
    }
  }

  const prevRenderTiles = window.levelbuildMastDetailRender;
  window.levelbuildMastDetailRender = function () {
    if (prevRenderTiles) prevRenderTiles();
    renderCounts();
  };
  renderCounts();
})();

// ======================================================================
// Element-Detail (generische Elementensammlungen, Nutzer-Wunsch Folgeturn
// 9: "jedes Element ... genau wie wenn ich auf einen Mast klicke dann auch
// die selbe maske"): liest den von openElementDetailPage() (siehe
// Elemente-IIFE weiter oben) übergebenen Datensatz aus sessionStorage und
// rendert das Datensätze-Panel - Version-Chip-Reihe + alle importierten
// Spaltenwerte, mit Hervorhebung geänderter Felder ggü. der Vorversion.
// Bewusst eigenständig von den beiden Mast-Detail-IIFEs oben (eigenes
// Scope, eigener sessionStorage-Key 'levelbuild_element_detail'), damit
// sich Masttafel und generische Elemente niemals gegenseitig überschreiben
// können. Only runs on the element-detail page (guarded by #ed-datensaetze-body).
// ======================================================================
(function () {
  const body = document.getElementById('ed-datensaetze-body');
  if (!body) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function normalize(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  }
  // Eigene Kopien dieser kleinen Helfer (siehe Mast-Detail-IIFE oben,
  // fmtDateTime/nachweisLinksHtml) - dieses Scope bleibt unabhängig.
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

  let raw = null;
  let versions = null;
  let latestVersion = null;
  let selected = null;
  // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - Merker,
  // um zwischen "wirklich ein neues Element geöffnet" und "dieselbe Seite
  // wurde nur erneut gerendert" (z. B. weil der Router showPage() für
  // dieselbe Navigation mehrfach aufruft, oder weil "Bauabweichung
  // erfassen" window.levelbuildElementDetailRender() erneut aufruft) zu
  // unterscheiden - robuster als ein einmalig "verbrauchtes" initialVersion-
  // Feld im sessionStorage-Handoff, das bei einem doppelten Aufruf sonst
  // beim zweiten Mal schon wieder leer wäre.
  let lastRowKey = null;
  let lastKnownLatestVersion = null;

  function render() {
    if (!raw) return;
    const v = versions.find((x) => x.version === selected);
    const prev = versions.find((x) => x.version === selected - 1);
    const isLatest = selected === latestVersion;

    const crumbSammlung = document.getElementById('ed-crumb-sammlung');
    if (crumbSammlung) crumbSammlung.textContent = raw.sammlungName || 'Sammlung';
    const crumbKey = document.getElementById('ed-crumb-key');
    if (crumbKey) crumbKey.textContent = `${raw.key} - ${selected}`;
    document.title = `${raw.key} - ${selected} · Intra`;

    // Nutzer-Wunsch (Folgeturn 10): "genau die selben Logiken ... mache
    // alles auf einmal" - spiegelt Mast-Detail's Allgemein-Panel
    // (#md-projekt/#md-bauabschnitt), hier zusätzlich mit dem Sammlungs-
    // namen statt der (bei Mast-Detail ohnehin statischen) Bauwerkstruktur.
    const projektEl = document.getElementById('ed-projekt');
    if (projektEl) projektEl.textContent = raw.projectLabel || currentProjectLabel();
    const sammlungNameEl = document.getElementById('ed-sammlung-name');
    if (sammlungNameEl) sammlungNameEl.textContent = raw.sammlungName || '–';
    const baEl = document.getElementById('ed-bauabschnitt');
    if (baEl) baEl.textContent = raw.bauabschnittName || '–';

    const chips = versions.map((x) =>
      `<span class="ver-chip${x.version === selected ? ' active' : ''}${x.manualType === 'umplanung' ? ' ver-chip-manual' : ''}" data-goto-el-version="${x.version}">v${x.version}${x.version === latestVersion ? ' (aktuell)' : ''}${x.manualType === 'umplanung' ? ' · Umplanung/Braunstrich' : ''}</span>`
    ).join('');

    const isManual = v.manualType === 'umplanung';
    const manualInfo = isManual
      ? `<div class="manual-version-box">
          <div class="manual-version-badge">Umplanung/Braunstrich</div>
          <div class="manual-version-meta">Erfasst am ${esc(fmtDateTime(v.importedAt))}</div>
          ${v.manualGrund ? `<div class="manual-version-grund">${esc(v.manualGrund)}</div>` : ''}
          ${nachweisLinksHtml(v.manualNachweise)}
        </div>`
      : '';

    const fields = (raw.columns || []).map((c) => {
      const val = v.values[c.idx];
      const prevVal = prev ? prev.values[c.idx] : undefined;
      const changed = !!prev && normalize(prevVal) !== normalize(val);
      const isNote = String(val || '').length > 28;
      return `<div class="stat${changed ? ' stat-changed' : ''}${isNote ? ' stat-note' : ''}">
        <span class="stat-label">${esc(c.label)}</span>
        <span class="stat-value${val ? '' : ' empty'}">${val ? esc(val) : '–'}</span>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="stat-row">
        <div class="stat"><span class="stat-label">Element</span><span class="stat-value">${esc(raw.key)}</span></div>
        <div class="stat"><span class="stat-label">Version</span><span class="stat-value">v${selected}${isLatest ? ' (aktuell)' : ''}</span></div>
      </div>
      ${versions.length > 1 ? `<div class="ver-chip-row">${chips}</div>` : ''}
      ${manualInfo}
      <div class="hr"></div>
      <div class="bauwerk-fields">${fields}</div>
    `;
    body.querySelectorAll('[data-goto-el-version]').forEach((chip) => {
      chip.addEventListener('click', () => {
        selected = parseInt(chip.getAttribute('data-goto-el-version'), 10);
        render();
      });
    });
  }

  // Re-reads sessionStorage (written by openElementDetailPage() right
  // before navigating here) - exposed as window.levelbuildElementDetailRender
  // and called again by the router every time it switches to this page
  // (same pattern as window.levelbuildMastDetailRender above).
  function openFromSession() {
    try { raw = JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null'); } catch (e) { raw = null; }
    if (!raw || !raw.versions || !raw.versions.length) {
      raw = null;
      body.innerHTML = '<div class="changelog-empty">Diese Seite wurde nicht über eine Elementensammlung geöffnet - keine Daten vorhanden.</div>';
      const crumbSammlung = document.getElementById('ed-crumb-sammlung');
      if (crumbSammlung) crumbSammlung.textContent = 'Sammlung';
      const crumbKey = document.getElementById('ed-crumb-key');
      if (crumbKey) crumbKey.textContent = 'Element';
      const projektEl = document.getElementById('ed-projekt');
      if (projektEl) projektEl.textContent = '–';
      const sammlungNameEl = document.getElementById('ed-sammlung-name');
      if (sammlungNameEl) sammlungNameEl.textContent = '–';
      const baEl = document.getElementById('ed-bauabschnitt');
      if (baEl) baEl.textContent = '–';
      lastRowKey = null;
      lastKnownLatestVersion = null;
      return;
    }
    versions = raw.versions;
    latestVersion = versions[versions.length - 1].version;
    // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - kam der
    // Klick aus der "Alle Versionen anzeigen"-Tabelle für eine bestimmte
    // Version, wird direkt diese Version ausgewählt statt immer der
    // aktuellsten - aber NUR bei einer echten Navigation zu einem (ggf.
    // selben) Element. Ein bloßes erneutes Rendern derselben, bereits
    // offenen Seite (Router ruft window.levelbuildElementDetailRender()
    // z. B. nach "Bauabweichung erfassen" erneut auf) lässt die aktuelle
    // Auswahl unangetastet, springt aber automatisch zur neuen aktuellsten
    // Version, sobald tatsächlich eine neue Version hinzugekommen ist.
    const isNewNavigation = raw.rowKey !== lastRowKey;
    if (isNewNavigation) {
      selected = (raw.initialVersion && versions.some((v) => v.version === raw.initialVersion))
        ? raw.initialVersion
        : latestVersion;
    } else if (latestVersion !== lastKnownLatestVersion) {
      selected = latestVersion;
    } else if (!versions.some((v) => v.version === selected)) {
      selected = latestVersion;
    }
    lastRowKey = raw.rowKey;
    lastKnownLatestVersion = latestVersion;
    render();
  }

  window.levelbuildElementDetailRender = openFromSession;
  openFromSession();
})();

// ======================================================================
// Element-Detail: Tätigkeitsliste zuordnen - spiegelt die Mast-Detail-
// Tätigkeitsliste-IIFE oben, schreibt/liest aber die eigenen ELEMENT_TL_*-
// Speicher (je Sammlung + normalisiertem Zeilen-Schlüssel verschachtelt,
// statt nur je Mast), damit Masttafel-Zuordnungen davon unberührt bleiben.
// Only runs on the element-detail page (guarded by #ed-tl-select).
// ======================================================================
(function () {
  const selectEl = document.getElementById('ed-tl-select');
  if (!selectEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function currentRaw() {
    try { return JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null'); } catch (e) { return null; }
  }

  // Eigene Kopie dieser kleinen Funktion, da diese IIFE ihr eigenes,
  // unabhängiges Scope hat (siehe Kommentar am Dateianfang zu diesem Muster).
  function taskStatusOptions(t, list) {
    if (t && Array.isArray(t.statusOptions) && t.statusOptions.length) return t.statusOptions;
    if (list && Array.isArray(list.statusOptions) && list.statusOptions.length) return list.statusOptions;
    return [
      { id: 'st-default-open', label: 'Nicht erledigt', color: '#8a94a6', icon: '○' },
      { id: 'st-default-done', label: 'Erledigt', color: '#3fb950', icon: '✓' },
    ];
  }

  function render() {
    const raw = currentRaw();
    const tasksEl = document.getElementById('ed-tl-tasks');
    const countEl = document.getElementById('ed-taetigkeiten-count');
    const hintEl = document.getElementById('ed-tl-manual-hint');
    if (!raw || !raw.sammlungId || !raw.rowKey) {
      selectEl.disabled = true;
      selectEl.innerHTML = '<option value="">–</option>';
      if (tasksEl) tasksEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      if (hintEl) hintEl.hidden = true;
      return;
    }
    selectEl.disabled = false;
    const sammlungId = raw.sammlungId;
    const rowKey = raw.rowKey;
    // Standort-individuelle Kopien (mastKey gesetzt) sind exklusiv für einen
    // Mast gedacht und tauchen hier bewusst nicht in der Auswahl auf.
    const lists = loadTlProjectList().filter((l) => !l.mastKey);
    const allAssignments = loadElementTlAssignments();
    const assignments = allAssignments[sammlungId] || {};
    const currentId = assignments[rowKey] || '';
    selectEl.innerHTML = '<option value="">Keine zugeordnet</option>' +
      lists.map((l) => `<option value="${esc(l.id)}"${l.id === currentId ? ' selected' : ''}>${esc(l.name)} (${l.tasks.length})</option>`).join('');
    const list = lists.find((l) => l.id === currentId);
    if (countEl) countEl.textContent = list ? String(list.tasks.length) : '0';

    if (hintEl) {
      const allManuell = loadElementTlManuell();
      const manuell = allManuell[sammlungId] || {};
      if (manuell[rowKey]) {
        hintEl.hidden = false;
        hintEl.innerHTML = 'Manuell zugeordnet - wird von der automatischen Regel-Zuordnung nicht mehr verändert. <button type="button" class="link-action" id="ed-tl-reset-manual">Automatik wieder zulassen</button>';
        const resetBtn = document.getElementById('ed-tl-reset-manual');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            const m = loadElementTlManuell();
            if (m[sammlungId]) delete m[sammlungId][rowKey];
            saveElementTlManuell(m);
            render();
          });
        }
      } else {
        hintEl.hidden = true;
      }
    }

    if (tasksEl) {
      if (!list) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diesem Eintrag ist noch keine Tätigkeitsliste zugeordnet - danach lassen sich Aufgaben in der Handy-App für genau diesen Eintrag bearbeiten.</div>';
      } else if (!list.tasks.length) {
        tasksEl.innerHTML = '<div class="changelog-empty">Diese Tätigkeitsliste hat noch keine Aufgaben.</div>';
      } else {
        const allStatus = loadElementTaskStatus();
        const statusMap = (allStatus[sammlungId] || {})[rowKey] || {};
        tasksEl.innerHTML = list.tasks.map((t) => {
          const opts = taskStatusOptions(t, list);
          const statusId = statusMap[t.id] || (opts[0] && opts[0].id);
          const status = opts.find((s) => s.id === statusId) || opts[0];
          return `<div class="col-config-row">
            <span>${t.nr != null ? esc(String(t.nr)) + '. ' : ''}${esc(t.titel || '(ohne Titel)')}</span>
            ${status ? `<span class="badge-mini" style="background:${esc(status.color)}22; color:${esc(status.color)};">${esc(status.icon || '')} ${esc(status.label)}</span>` : ''}
          </div>`;
        }).join('');
      }
    }
  }

  selectEl.addEventListener('change', () => {
    const raw = currentRaw();
    if (!raw || !raw.sammlungId || !raw.rowKey) return;
    const sammlungId = raw.sammlungId;
    const rowKey = raw.rowKey;
    const allAssignments = loadElementTlAssignments();
    allAssignments[sammlungId] = allAssignments[sammlungId] || {};
    if (selectEl.value) allAssignments[sammlungId][rowKey] = selectEl.value;
    else delete allAssignments[sammlungId][rowKey];
    saveElementTlAssignments(allAssignments);

    // Eine hier am Element-Detail einzeln getroffene Auswahl gilt als
    // manuell (analog zu MAST_TL_MANUAL_KEY bei der Masttafel).
    const allManuell = loadElementTlManuell();
    allManuell[sammlungId] = allManuell[sammlungId] || {};
    allManuell[sammlungId][rowKey] = true;
    saveElementTlManuell(allManuell);
    render();
  });

  // Chain onto the existing render hook (rather than overwrite it) so both
  // Element-Detail-IIFEs stay in sync every time the router shows this page
  // for a (possibly different) Element.
  const prevRender = window.levelbuildElementDetailRender;
  window.levelbuildElementDetailRender = function () {
    if (prevRender) prevRender();
    render();
  };
  render();
})();

// ======================================================================
// Element-Detail: Bauabweichung/Umplanung erfassen - Nutzer-Wunsch
// (Folgeturn 10): "genau die selben Logiken ... mache alles auf einmal".
// Spiegelt die Bauabweichung-Logik aus der Mast-Detail-IIFE oben
// (openBauabweichungModal/window.levelbuildAddManualMastVersion), nutzt
// dafür aber die eigene, generische window.levelbuildAddManualElementVersion()
// (siehe ELEMENT_DATEN_KEY-Speicher oben in app.js) - Masttafel-Daten
// bleiben davon komplett unberührt. Only runs on the element-detail page
// (guarded by #ed-bauabweichung-add).
// ======================================================================
(function () {
  const addBtn = document.getElementById('ed-bauabweichung-add');
  if (!addBtn) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
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

  function currentRaw() {
    try { return JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null'); } catch (e) { return null; }
  }

  function renderList() {
    const raw = currentRaw();
    const listEl = document.getElementById('ed-bauabweichung-list');
    const countEl = document.getElementById('ed-bauabweichung-count');
    addBtn.disabled = !raw;
    if (!listEl) return;
    const manualVersions = (raw && raw.versions) ? raw.versions.filter((x) => x.manualType === 'umplanung') : [];
    if (countEl) countEl.textContent = String(manualVersions.length);
    if (!manualVersions.length) {
      listEl.innerHTML = raw ? '<div class="changelog-empty">Noch keine Bauabweichung für diesen Eintrag erfasst.</div>' : '';
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

  let pendingNachweise = [];

  function fieldRows() {
    const raw = currentRaw();
    if (!raw) return '';
    const latest = raw.versions[raw.versions.length - 1];
    return (raw.columns || []).map((c) => `
      <div class="field" style="margin-bottom:8px;">
        <label>${esc(c.label)}</label>
        <div class="input-wrap"><input type="text" data-ba-field-idx="${c.idx}" value="${esc(latest.values[c.idx] || '')}"></div>
      </div>`).join('');
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

  function openBauabweichungModalEl() {
    const raw = currentRaw();
    if (!raw || !raw.bauabschnittId) {
      alert('Dieser Eintrag konnte keinem Bauabschnitt eindeutig zugeordnet werden - Bauabweichung kann nicht erfasst werden.');
      return;
    }
    pendingNachweise = [];
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    if (!modalOverlay) return;

    modalTitle.textContent = `Bauabweichung erfassen · ${raw.key}`;
    modalBody.innerHTML = `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:10px;">
        Für Änderungen durch Statik-Freigabe, E-Mail o. ä. Erzeugt eine neue Version (v${raw.versions[raw.versions.length - 1].version + 1}) dieses Eintrags mit dem Vermerk „Umplanung/Braunstrich".
      </div>
      <div class="field" style="margin-bottom:10px;">
        <label>Grund / Beschreibung der Bauabweichung <span style="color:var(--red);">*</span></label>
        <div class="input-wrap"><textarea id="ba-grund" rows="3" placeholder="z. B. Statik hat Auflagerpunkt angepasst, siehe E-Mail vom ..."></textarea></div>
      </div>
      <div class="hr"></div>
      <div class="subheading" style="margin-bottom:6px;">Werte (bei Bedarf anpassen)</div>
      <div id="ba-field-rows">${fieldRows()}</div>
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
      if (!confirm('Wirklich eine neue Version mit dem Vermerk "Umplanung/Braunstrich" für diesen Eintrag anlegen? Dies lässt sich nicht rückgängig machen.')) {
        return;
      }
      const valuesByIdx = {};
      document.querySelectorAll('[data-ba-field-idx]').forEach((input) => {
        valuesByIdx[parseInt(input.getAttribute('data-ba-field-idx'), 10)] = input.value;
      });
      const result = window.levelbuildAddManualElementVersion(raw.sammlungId, raw.bauabschnittId, raw.rowKey, {
        valuesByIdx, manualGrund: grund, manualNachweise: pendingNachweise,
      });
      modalOverlay.hidden = true;
      if (!result) {
        alert('Bauabweichung konnte nicht gespeichert werden - Eintrag wurde in den Daten nicht gefunden.');
        return;
      }
      if (window.levelbuildElementDetailRender) window.levelbuildElementDetailRender();
    });
  }

  addBtn.addEventListener('click', openBauabweichungModalEl);

  // Chain onto the existing render hook (rather than overwrite it) so all
  // drei Element-Detail-IIFEs (Datensätze, Tätigkeitsliste, Bauabweichung)
  // synchron bleiben, wenn der Router diese Seite (für ein anderes
  // Element) erneut anzeigt.
  const prevRender = window.levelbuildElementDetailRender;
  window.levelbuildElementDetailRender = function () {
    if (prevRender) prevRender();
    renderList();
  };
  renderList();
})();

// ======================================================================
// Element-Detail: Verknüpfungen-Kachel "Dokumente" - spiegelt die
// gleichnamige Mast-Detail-IIFE oben 1:1, nur gegen den generischen
// ELEMENT_DOKUMENTE_KEY-Speicher statt MAST_DOKUMENTE_KEY. Eigenständige
// IIFE, chaint sich zusätzlich in window.levelbuildElementDetailRender ein.
// Only runs on element-detail.html (guarded by #ed-dok-tile).
// ======================================================================
(function () {
  const tile = document.getElementById('ed-dok-tile');
  if (!tile) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtDatumKurz(iso) {
    const s = String(iso || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
  }
  function currentRaw() {
    try { return JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null'); } catch (e) { return null; }
  }

  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  function openList() {
    const raw = currentRaw();
    if (!raw || !modalOverlay) return;
    const docs = (typeof getElementDatenpfadDokumente === 'function') ? getElementDatenpfadDokumente(raw.sammlungId, raw.bauabschnittId, raw.rowKey) : [];
    modalTitle.textContent = `Dokumente · ${raw.key}`;
    modalBody.innerHTML = docs.length ? docs.map((d) => `
      <div class="file-row">
        <span class="file-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>
        <div class="file-meta">
          <span class="file-name">${esc(d.name)} <span class="file-section-tag">${esc(d.typ)}</span></span>
          <span class="file-sub">${fmtBytes(d.size)} · hinzugefügt am ${fmtDatumKurz(d.attachedAt)}${d.sourceFile ? ' · aus ' + esc(d.sourceFile) : ''}</span>
        </div>
        <a class="icon-btn" title="Herunterladen" href="${d.url}" download="${esc(d.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
        </a>
      </div>`).join('') : '<div class="changelog-empty">Noch keine Dokumente über einen Datenpfad-Import hinterlegt.</div>';
    modalFooter.innerHTML = `<button type="button" class="matt-tool-btn" id="ed-dok-close">Schließen</button>`;
    modalOverlay.hidden = false;
    const closeBtn = document.getElementById('ed-dok-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { modalOverlay.hidden = true; });
  }
  tile.addEventListener('click', openList);

  function renderCount() {
    const countEl = document.getElementById('ed-dok-count');
    if (!countEl) return;
    const raw = currentRaw();
    const n = raw && typeof getElementDatenpfadDokumente === 'function' ? getElementDatenpfadDokumente(raw.sammlungId, raw.bauabschnittId, raw.rowKey).length : 0;
    countEl.textContent = `${n} Dokument${n === 1 ? '' : 'e'}`;
  }

  const prevRenderDok = window.levelbuildElementDetailRender;
  window.levelbuildElementDetailRender = function () {
    if (prevRenderDok) prevRenderDok();
    renderCount();
  };
  renderCount();
})();

// ======================================================================
// Element-Detail: Verknüpfungen-Kachel "Fotos" - zählt/verlinkt die
// Standort-Fotos dieses Elements (ELEMENT_FOTOS_KEY, siehe weiter oben in
// app.js), spiegelt die Mast-Detail-Fotos-Kachel. Ereignisse/Bautagebücher
// bleiben für generische Elemente bewusst außen vor - beide Speicher
// (Bautagebuch-Leistungen.standorte, Ereignis.mastKey) sind aktuell fest auf
// echte Masttafel-Standorte bezogen, nicht auf generische Elemente erweitert.
// Only runs on element-detail.html (guarded by #ed-foto-tile).
// ======================================================================
(function () {
  const tile = document.getElementById('ed-foto-tile');
  if (!tile) return;

  function currentRaw() {
    try { return JSON.parse(sessionStorage.getItem('levelbuild_element_detail') || 'null'); } catch (e) { return null; }
  }

  tile.addEventListener('click', () => { if (window.levelbuildGo) window.levelbuildGo('fotos'); });

  function renderCount() {
    const countEl = document.getElementById('ed-foto-count');
    if (!countEl) return;
    const raw = currentRaw();
    const map = (typeof loadElementFotos === 'function') ? loadElementFotos() : {};
    const n = raw && map[raw.sammlungId] && map[raw.sammlungId][raw.rowKey] ? map[raw.sammlungId][raw.rowKey].length : 0;
    countEl.textContent = `${n} Foto${n === 1 ? '' : 's'}`;
  }

  const prevRenderFoto = window.levelbuildElementDetailRender;
  window.levelbuildElementDetailRender = function () {
    if (prevRenderFoto) prevRenderFoto();
    renderCount();
  };
  renderCount();
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
  // Intra-Maske angelehnter Erfassung (personaleinsatzModalHtml und
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
// Dokumente-Sammelseite: aggregierte Kachel-Galerie über
// collectAllProjectDokumente() (Filter !isPlan - Pläne haben ihre eigene,
// parallele Seite unten), nach demselben Muster wie die Fotos-Seite (Filter
// Standort/Quelle, Sortierung, Suche, Lightbox/Vorschau über das gemeinsame
// #modal-overlay). Rein lesend für Datenpfad-Dokumente (entstehen nur beim
// Import); Protokoll-PDFs bleiben zusätzlich löschbar (wie bisher), da sie
// eigenständig erzeugte App-Daten sind, keine importierten Verweise.
// ======================================================================
(function () {
  const gridEl = document.getElementById('dok-grid');
  if (!gridEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatumZeitDok(iso) {
    if (!iso) return '–';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      return `${m[3]}.${m[2]}.${m[1]}`;
    }
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return String(iso); }
  }
  function fmtBytesDok(n) {
    n = Number(n) || 0;
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const modalOverlayDok = document.getElementById('modal-overlay');
  const modalTitleDok = document.getElementById('modal-title');
  const modalBodyDok = document.getElementById('modal-body');
  const modalFooterDok = document.getElementById('modal-footer');
  function openModalDok(title, bodyHtml, footerHtml) {
    if (!modalOverlayDok) return;
    modalTitleDok.textContent = title;
    modalBodyDok.innerHTML = bodyHtml;
    modalFooterDok.innerHTML = footerHtml || '';
    modalOverlayDok.hidden = false;
  }
  function closeModalDok() { if (modalOverlayDok) modalOverlayDok.hidden = true; }

  let filterStandort = '';
  let filterQuelle = '';
  let sortMode = 'neu';
  let searchQuery = '';

  function downloadDoc(d) {
    try {
      const a = document.createElement('a');
      a.href = d.url;
      a.download = (d.name || 'Dokument').replace(/[\\/:*?"<>|]+/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* z. B. in Testumgebungen ohne echte Download-Navigation - unkritisch */ }
  }

  function deleteDocIfPossible(d) {
    if (d.quelle !== 'protokoll' || !d.sourceId) return false;
    if (!window.confirm('Dieses Dokument wirklich löschen?')) return true;
    saveDokumente(loadDokumente().filter((x) => x.id !== d.sourceId));
    return true;
  }

  function openPreview(d) {
    const isImg = /^image\//.test(d.mime || '');
    const isPdf = /pdf/i.test(d.mime || '') || /\.pdf$/i.test(d.name || '');
    const preview = isImg
      ? `<img src="${d.url}" alt="${esc(d.name)}" style="max-width:100%; border-radius:8px;">`
      : isPdf
        ? `<iframe src="${d.url}" style="width:100%; height:60vh; border:1px solid var(--gray-200); border-radius:8px;"></iframe>`
        : `<div class="changelog-empty">Keine Vorschau verfügbar - bitte herunterladen.</div>`;
    const html = `
      <div class="fo-lightbox">
        ${preview}
        <div class="fo-lightbox-info">
          <div class="fzl-evt-row"><div class="fzl-evt-label">Standort/Element</div><div class="fzl-evt-value">${esc(d.standortLabel || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Typ</div><div class="fzl-evt-value">${esc(d.typ || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Quelle</div><div class="fzl-evt-value">${esc(d.quelleLabel || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Datum</div><div class="fzl-evt-value">${esc(fmtDatumZeitDok(d.addedAt))}</div></div>
          ${d.size ? `<div class="fzl-evt-row"><div class="fzl-evt-label">Größe</div><div class="fzl-evt-value">${esc(fmtBytesDok(d.size))}</div></div>` : ''}
          ${d.sourceFile ? `<div class="fzl-evt-row"><div class="fzl-evt-label">Quelldatei</div><div class="fzl-evt-value">${esc(d.sourceFile)}</div></div>` : ''}
        </div>
      </div>`;
    const canDelete = d.quelle === 'protokoll';
    openModalDok(d.name || 'Dokument', html,
      '<button type="button" class="matt-tool-btn" id="dok-lb-download">Herunterladen</button>' +
      (canDelete ? '<button type="button" class="matt-tool-btn matt-tool-btn-danger" id="dok-lb-delete">Löschen</button>' : '') +
      '<button type="button" class="matt-tool-btn" id="dok-lb-close">Schließen</button>');
    const dl = document.getElementById('dok-lb-download');
    if (dl) dl.addEventListener('click', () => downloadDoc(d));
    const del = document.getElementById('dok-lb-delete');
    if (del) del.addEventListener('click', () => { if (deleteDocIfPossible(d)) { closeModalDok(); render(); } });
    const cl = document.getElementById('dok-lb-close');
    if (cl) cl.addEventListener('click', closeModalDok);
  }

  function populateStandortFilterDok(items) {
    const sel = document.getElementById('dok-filter-standort');
    if (!sel) return;
    const distinct = new Map();
    items.forEach((d) => { if (d.standortKey && !distinct.has(d.standortKey)) distinct.set(d.standortKey, d.standortLabel); });
    const sorted = Array.from(distinct.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de', { numeric: true }));
    const current = sel.value;
    sel.innerHTML = '<option value="">Alle Standorte</option>' + sorted.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
    if (sorted.some(([key]) => key === current)) sel.value = current;
  }

  // Einmaliger Deep-Link von der Mastmaske ("Alle Dokumente dieses Masts")
  // in Form eines sessionStorage-Werts - wird hier gelesen, als
  // Standort-Filter übernommen und sofort wieder gelöscht.
  function applyMastPrefillIfAny() {
    let prefill;
    try { prefill = sessionStorage.getItem('levelbuild_dok_prefill_mast'); } catch (e) { prefill = null; }
    if (!prefill) return;
    try { sessionStorage.removeItem('levelbuild_dok_prefill_mast'); } catch (e) { /* ignore */ }
    filterStandort = prefill;
  }

  function render() {
    const crumbEl = document.getElementById('dok-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();
    applyMastPrefillIfAny();

    const all = (typeof collectAllProjectDokumente === 'function') ? collectAllProjectDokumente().filter((d) => !d.isPlan) : [];
    populateStandortFilterDok(all);

    // Standort-Filter kann entweder ein exakter Schlüssel sein (aus dem
    // Dropdown) oder - beim Deep-Link von der Mastmaske - das Label
    // (mastLabel), das dort per sessionStorage übergeben wird.
    let items = all.filter((d) => {
      if (filterStandort && d.standortKey !== filterStandort && d.standortLabel !== filterStandort) return false;
      if (filterQuelle && d.quelle !== filterQuelle) return false;
      if (searchQuery) {
        const hay = [d.standortLabel, d.name, d.typ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    items.sort((a, b) => {
      if (sortMode === 'standort') return String(a.standortLabel || '').localeCompare(String(b.standortLabel || ''), 'de', { numeric: true });
      const da = String(a.addedAt || '');
      const db = String(b.addedAt || '');
      return sortMode === 'alt' ? da.localeCompare(db) : db.localeCompare(da);
    });

    const countEl = document.getElementById('dok-count');
    if (countEl) countEl.textContent = String(items.length);
    const emptyEl = document.getElementById('dok-empty');

    if (!all.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Noch keine Dokumente in diesem Projekt.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (!items.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Keine Dokumente entsprechen der aktuellen Filterung/Suche.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    gridEl.innerHTML = items.map((d) => `
      <div class="fo-card" data-dok-id="${esc(d.id)}">
        <div class="fo-thumb">${/^image\//.test(d.mime || '') ? `<img src="${d.url}" alt="${esc(d.name)}" loading="lazy">` : `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="margin:auto; color:var(--gray-400);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`}</div>
        <div class="fo-meta">
          <span class="fo-meta-date">${esc(fmtDatumZeitDok(d.addedAt))}</span>
          <span class="fo-meta-tag fo-meta-tag-${d.quelle === 'protokoll' ? 'protokoll' : 'standort'}">${esc(d.typ || d.quelleLabel)}</span>
        </div>
        <div class="fo-meta-standort">${esc(d.standortLabel || '–')}</div>
      </div>`).join('');

    gridEl.querySelectorAll('[data-dok-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const d = items.find((x) => x.id === card.getAttribute('data-dok-id'));
        if (d) openPreview(d);
      });
    });
  }

  const standortSel = document.getElementById('dok-filter-standort');
  if (standortSel) standortSel.addEventListener('change', () => { filterStandort = standortSel.value; render(); });
  const quelleSel = document.getElementById('dok-filter-quelle');
  if (quelleSel) quelleSel.addEventListener('change', () => { filterQuelle = quelleSel.value; render(); });
  const sortSel = document.getElementById('dok-sort');
  if (sortSel) sortSel.addEventListener('change', () => { sortMode = sortSel.value; render(); });
  const searchInput = document.getElementById('dok-search');
  if (searchInput) searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); render(); });
  const clearBtn = document.getElementById('dok-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterStandort = '';
      filterQuelle = '';
      sortMode = 'neu';
      searchQuery = '';
      if (standortSel) standortSel.value = '';
      if (quelleSel) quelleSel.value = '';
      if (sortSel) sortSel.value = 'neu';
      if (searchInput) searchInput.value = '';
      render();
    });
  }

  window.levelbuildOnShowDokumente = render;
  render();
})();

// ======================================================================
// Pläne-Sammelseite: identisches Muster wie die Dokumente-Seite direkt
// darüber, nur gefiltert auf isPlan (siehe collectAllProjectDokumente() /
// isPlanDocType() weiter oben) - bewusst eine eigenständige IIFE (eigenes
// #pl-grid) statt eines Umschalters auf der Dokumente-Seite, analog zum
// "eigene Seite statt bestehenden Code verändern"-Muster dieser Codebasis.
// ======================================================================
(function () {
  const gridEl = document.getElementById('pl-grid');
  if (!gridEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatumZeitPl(iso) {
    if (!iso) return '–';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return String(iso); }
  }

  const modalOverlayPl = document.getElementById('modal-overlay');
  const modalTitlePl = document.getElementById('modal-title');
  const modalBodyPl = document.getElementById('modal-body');
  const modalFooterPl = document.getElementById('modal-footer');
  function openModalPl(title, bodyHtml, footerHtml) {
    if (!modalOverlayPl) return;
    modalTitlePl.textContent = title;
    modalBodyPl.innerHTML = bodyHtml;
    modalFooterPl.innerHTML = footerHtml || '';
    modalOverlayPl.hidden = false;
  }
  function closeModalPl() { if (modalOverlayPl) modalOverlayPl.hidden = true; }

  let filterStandort = '';
  let filterTyp = '';
  let sortMode = 'neu';
  let searchQuery = '';

  function downloadPlan(d) {
    try {
      const a = document.createElement('a');
      a.href = d.url;
      a.download = (d.name || 'Plan').replace(/[\\/:*?"<>|]+/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* unkritisch */ }
  }

  function openPreviewPl(d) {
    const isImg = /^image\//.test(d.mime || '');
    const isPdf = /pdf/i.test(d.mime || '') || /\.pdf$/i.test(d.name || '');
    const preview = isImg
      ? `<img src="${d.url}" alt="${esc(d.name)}" style="max-width:100%; border-radius:8px;">`
      : isPdf
        ? `<iframe src="${d.url}" style="width:100%; height:60vh; border:1px solid var(--gray-200); border-radius:8px;"></iframe>`
        : `<div class="changelog-empty">Keine Vorschau verfügbar - bitte herunterladen.</div>`;
    const html = `
      <div class="fo-lightbox">
        ${preview}
        <div class="fo-lightbox-info">
          <div class="fzl-evt-row"><div class="fzl-evt-label">Standort/Element</div><div class="fzl-evt-value">${esc(d.standortLabel || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Typ</div><div class="fzl-evt-value">${esc(d.typ || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Datum</div><div class="fzl-evt-value">${esc(fmtDatumZeitPl(d.addedAt))}</div></div>
          ${d.sourceFile ? `<div class="fzl-evt-row"><div class="fzl-evt-label">Quelldatei</div><div class="fzl-evt-value">${esc(d.sourceFile)}</div></div>` : ''}
        </div>
      </div>`;
    openModalPl(d.name || 'Plan', html,
      '<button type="button" class="matt-tool-btn" id="pl-lb-download">Herunterladen</button>' +
      '<button type="button" class="matt-tool-btn" id="pl-lb-close">Schließen</button>');
    const dl = document.getElementById('pl-lb-download');
    if (dl) dl.addEventListener('click', () => downloadPlan(d));
    const cl = document.getElementById('pl-lb-close');
    if (cl) cl.addEventListener('click', closeModalPl);
  }

  function populateFiltersPl(items) {
    const standortSel = document.getElementById('pl-filter-standort');
    if (standortSel) {
      const distinct = new Map();
      items.forEach((d) => { if (d.standortKey && !distinct.has(d.standortKey)) distinct.set(d.standortKey, d.standortLabel); });
      const sorted = Array.from(distinct.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de', { numeric: true }));
      const current = standortSel.value;
      standortSel.innerHTML = '<option value="">Alle Standorte</option>' + sorted.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
      if (sorted.some(([key]) => key === current)) standortSel.value = current;
    }
    const typSel = document.getElementById('pl-filter-typ');
    if (typSel) {
      const types = Array.from(new Set(items.map((d) => d.typ).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de'));
      const current = typSel.value;
      typSel.innerHTML = '<option value="">Alle Typen</option>' + types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      if (types.includes(current)) typSel.value = current;
    }
  }

  function applyMastPrefillIfAnyPl() {
    let prefill;
    try { prefill = sessionStorage.getItem('levelbuild_plan_prefill_mast'); } catch (e) { prefill = null; }
    if (!prefill) return;
    try { sessionStorage.removeItem('levelbuild_plan_prefill_mast'); } catch (e) { /* ignore */ }
    filterStandort = prefill;
  }

  function render() {
    const crumbEl = document.getElementById('pl-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();
    applyMastPrefillIfAnyPl();

    const all = (typeof collectAllProjectDokumente === 'function') ? collectAllProjectDokumente().filter((d) => d.isPlan) : [];
    populateFiltersPl(all);

    let items = all.filter((d) => {
      if (filterStandort && d.standortKey !== filterStandort && d.standortLabel !== filterStandort) return false;
      if (filterTyp && d.typ !== filterTyp) return false;
      if (searchQuery) {
        const hay = [d.standortLabel, d.name, d.typ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    items.sort((a, b) => {
      if (sortMode === 'standort') return String(a.standortLabel || '').localeCompare(String(b.standortLabel || ''), 'de', { numeric: true });
      const da = String(a.addedAt || '');
      const db = String(b.addedAt || '');
      return sortMode === 'alt' ? da.localeCompare(db) : db.localeCompare(da);
    });

    const countEl = document.getElementById('pl-count');
    if (countEl) countEl.textContent = String(items.length);
    const emptyEl = document.getElementById('pl-empty');

    if (!all.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Noch keine Pläne in diesem Projekt - Pläne entstehen automatisch, sobald beim Masttafel-/Elemente-Import eine Spalte „Datenpfad Lageplan" (o. ä.) mit einem Plan-Dokument verknüpft wurde.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (!items.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Keine Pläne entsprechen der aktuellen Filterung/Suche.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    gridEl.innerHTML = items.map((d) => `
      <div class="fo-card" data-pl-id="${esc(d.id)}">
        <div class="fo-thumb">${/^image\//.test(d.mime || '') ? `<img src="${d.url}" alt="${esc(d.name)}" loading="lazy">` : `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="margin:auto; color:var(--gray-400);"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`}</div>
        <div class="fo-meta">
          <span class="fo-meta-date">${esc(fmtDatumZeitPl(d.addedAt))}</span>
          <span class="fo-meta-tag fo-meta-tag-standort">${esc(d.typ || 'Plan')}</span>
        </div>
        <div class="fo-meta-standort">${esc(d.standortLabel || '–')}</div>
      </div>`).join('');

    gridEl.querySelectorAll('[data-pl-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const d = items.find((x) => x.id === card.getAttribute('data-pl-id'));
        if (d) openPreviewPl(d);
      });
    });
  }

  const standortSel = document.getElementById('pl-filter-standort');
  if (standortSel) standortSel.addEventListener('change', () => { filterStandort = standortSel.value; render(); });
  const typSel = document.getElementById('pl-filter-typ');
  if (typSel) typSel.addEventListener('change', () => { filterTyp = typSel.value; render(); });
  const sortSel = document.getElementById('pl-sort');
  if (sortSel) sortSel.addEventListener('change', () => { sortMode = sortSel.value; render(); });
  const searchInput = document.getElementById('pl-search');
  if (searchInput) searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); render(); });
  const clearBtn = document.getElementById('pl-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterStandort = '';
      filterTyp = '';
      sortMode = 'neu';
      searchQuery = '';
      if (standortSel) standortSel.value = '';
      if (typSel) typSel.value = '';
      if (sortSel) sortSel.value = 'neu';
      if (searchInput) searchInput.value = '';
      render();
    });
  }

  window.levelbuildOnShowPlaene = render;
  render();
})();

// ======================================================================
// Übersicht: Verknüpfungen-Kacheln (Projekt-weite Summen) - Nutzer-Wunsch:
// "auch die Übersicht Seite ... andere Dokumenten Fotos Ereignis und
// Bautagesbericht Kacheln gefüllt werden, so wie es logisch ist." Zählt über
// das GESAMTE Projekt (nicht auf einen einzelnen Standort begrenzt, anders
// als die gleichnamigen Kacheln auf Mast-/Element-Detail) und verlinkt in
// die jeweilige Sammelseite. Eigenständige IIFE, chaint sich zusätzlich in
// window.levelbuildOnShowUebersicht ein. Only runs when #ov-dok-tile exists.
// ======================================================================
(function () {
  const tile = document.getElementById('ov-dok-tile');
  if (!tile) return;

  const goTo = (name) => { if (window.levelbuildGo) window.levelbuildGo(name); };
  tile.addEventListener('click', () => goTo('dokumente'));
  const planTile = document.getElementById('ov-plan-tile');
  if (planTile) planTile.addEventListener('click', () => goTo('plaene'));
  const fotoTile = document.getElementById('ov-foto-tile');
  if (fotoTile) fotoTile.addEventListener('click', () => goTo('fotos'));
  const ereignisTile = document.getElementById('ov-ereignis-tile');
  if (ereignisTile) ereignisTile.addEventListener('click', () => goTo('bautagebuch-liste'));
  const btTile = document.getElementById('ov-bt-tile');
  if (btTile) btTile.addEventListener('click', () => goTo('bautagebuch-liste'));

  function render() {
    const alleDok = (typeof collectAllProjectDokumente === 'function') ? collectAllProjectDokumente() : [];
    const dokCountEl = document.getElementById('ov-dok-count');
    if (dokCountEl) { const n = alleDok.filter((d) => !d.isPlan).length; dokCountEl.textContent = `${n} Dokument${n === 1 ? '' : 'e'}`; }
    const planCountEl = document.getElementById('ov-plan-count');
    if (planCountEl) { const n = alleDok.filter((d) => d.isPlan).length; planCountEl.textContent = `${n} ${n === 1 ? 'Plan' : 'Pläne'}`; }

    const fotoCountEl = document.getElementById('ov-foto-count');
    if (fotoCountEl) {
      const n = (typeof collectAllProjectFotos === 'function') ? collectAllProjectFotos().length : 0;
      fotoCountEl.textContent = `${n} Foto${n === 1 ? '' : 's'}`;
    }

    const bautagebuecher = (typeof loadBautagebuecher === 'function') ? loadBautagebuecher() : [];
    const ereignisCountEl = document.getElementById('ov-ereignis-count');
    if (ereignisCountEl) {
      const n = bautagebuecher.reduce((sum, r) => sum + (r.ereignisse || []).length, 0);
      ereignisCountEl.textContent = `${n} Ereignis${n === 1 ? '' : 'se'}`;
    }
    const btCountEl = document.getElementById('ov-bt-count');
    if (btCountEl) { const n = bautagebuecher.length; btCountEl.textContent = `${n} ${n === 1 ? 'Bautagebuch' : 'Bautagebücher'}`; }
  }

  const prevRenderOv = window.levelbuildOnShowUebersicht;
  window.levelbuildOnShowUebersicht = function () {
    if (prevRenderOv) prevRenderOv();
    render();
  };
  render();
})();

// ======================================================================
// Fotos-Seite: aggregierte Kachel-Galerie über collectAllProjectFotos()
// (siehe dort für die Zusammenführung der Quellen) - Nutzer-Wunsch: "unter
// fotos sollen die fotos wie folgt angezeugt werden alle fotos die durch
// die mastfatel und sonst wie ankommen sollen hier erscheinen". Rein
// lesend, mit Filter (Standort/Quelle), Sortierung, Suche und einer
// Lightbox-Ansicht über das gemeinsame #modal-overlay - dieselbe lokale
// Modal-Helfer-Verdrahtung wie in anderen Seiten-IIFEs (z. B.
// Fertigstellungsliste), siehe Kommentar dort. Nur aktiv, wenn #fo-grid
// existiert (Fotos-Seite).
// ======================================================================
(function () {
  const gridEl = document.getElementById('fo-grid');
  if (!gridEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return iso ? String(iso) : '';
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
  // addedAt ist entweder ein reines Datum (YYYY-MM-DD, bei Protokoll-Fotos
  // über das Abschlussdatum der Tätigkeit angenähert - siehe
  // collectAllProjectFotos) oder ein voller ISO-Zeitstempel (bei Standort-
  // Fotos, new Date().toISOString() aus der Handy-App) - beide Formen
  // müssen lesbar dargestellt werden können.
  function fmtDatumZeitFo(iso) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return fmtDatum(iso);
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return String(iso); }
  }

  const modalOverlayFo = document.getElementById('modal-overlay');
  const modalTitleFo = document.getElementById('modal-title');
  const modalBodyFo = document.getElementById('modal-body');
  const modalFooterFo = document.getElementById('modal-footer');
  function openModalFo(title, bodyHtml, footerHtml) {
    if (!modalOverlayFo) return;
    modalTitleFo.textContent = title;
    modalBodyFo.innerHTML = bodyHtml;
    modalFooterFo.innerHTML = footerHtml || '';
    modalOverlayFo.hidden = false;
  }
  function closeModalFo() { if (modalOverlayFo) modalOverlayFo.hidden = true; }

  let filterStandort = '';
  let filterQuelle = '';
  let sortMode = 'neu';
  let searchQuery = '';

  function downloadFoto(f) {
    try {
      const a = document.createElement('a');
      a.href = f.dataUrl;
      a.download = (f.name || 'Foto').replace(/[\\/:*?"<>|]+/g, '_') + '.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* z. B. in Testumgebungen ohne echte Download-Navigation - unkritisch */ }
  }

  function openLightbox(f) {
    const html = `
      <div class="fo-lightbox">
        <img src="${f.dataUrl}" alt="${esc(f.name || 'Foto')}">
        <div class="fo-lightbox-info">
          <div class="fzl-evt-row"><div class="fzl-evt-label">Standort</div><div class="fzl-evt-value">${esc(f.mastLabel || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Quelle</div><div class="fzl-evt-value">${esc(f.quelleLabel || '–')}</div></div>
          <div class="fzl-evt-row"><div class="fzl-evt-label">Datum</div><div class="fzl-evt-value">${f.addedAt ? esc(fmtDatumZeitFo(f.addedAt)) : '<span class="changelog-empty" style="padding:0; display:inline-block;">nicht erfasst</span>'}</div></div>
          ${f.protokollName ? `<div class="fzl-evt-row"><div class="fzl-evt-label">Protokoll</div><div class="fzl-evt-value">${esc(f.protokollName)}</div></div>` : ''}
          ${f.taskTitel ? `<div class="fzl-evt-row"><div class="fzl-evt-label">Tätigkeit</div><div class="fzl-evt-value">${esc(f.taskTitel)}</div></div>` : ''}
        </div>
      </div>`;
    openModalFo(f.name || 'Foto', html,
      '<button type="button" class="matt-tool-btn" id="fo-lb-download">Herunterladen</button>' +
      '<button type="button" class="matt-tool-btn" id="fo-lb-close">Schließen</button>');
    const dl = document.getElementById('fo-lb-download');
    if (dl) dl.addEventListener('click', () => downloadFoto(f));
    const cl = document.getElementById('fo-lb-close');
    if (cl) cl.addEventListener('click', closeModalFo);
  }

  // Standort-Filter-Dropdown wird aus den tatsächlich vorkommenden Fotos
  // gespeist (nicht aus allen Masten der Masttafel) - ein Standort ohne
  // ein einziges Foto würde sonst nur eine leere Auswahl erzeugen.
  function populateStandortFilter(fotos) {
    const sel = document.getElementById('fo-filter-standort');
    if (!sel) return;
    const distinct = new Map();
    fotos.forEach((f) => { if (f.mastKey && !distinct.has(f.mastKey)) distinct.set(f.mastKey, f.mastLabel); });
    const sorted = Array.from(distinct.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de', { numeric: true }));
    const current = sel.value;
    sel.innerHTML = '<option value="">Alle Standorte</option>' + sorted.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('');
    if (sorted.some(([key]) => key === current)) sel.value = current;
  }

  // Einmaliger Deep-Link von der Mastmaske (Verknüpfungen-Kachel "Fotos") -
  // wird hier gelesen, als Standort-Filter übernommen und sofort wieder
  // gelöscht, analog zum "Alle Dokumente dieses Masts"-Deep-Link.
  function applyMastPrefillIfAnyFo() {
    let prefill;
    try { prefill = sessionStorage.getItem('levelbuild_foto_prefill_mast'); } catch (e) { prefill = null; }
    if (!prefill) return;
    try { sessionStorage.removeItem('levelbuild_foto_prefill_mast'); } catch (e) { /* ignore */ }
    filterStandort = prefill;
  }

  function render() {
    const crumbEl = document.getElementById('fo-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();
    applyMastPrefillIfAnyFo();

    const all = (typeof collectAllProjectFotos === 'function') ? collectAllProjectFotos() : [];
    populateStandortFilter(all);

    let items = all.filter((f) => {
      if (filterStandort && f.mastKey !== filterStandort) return false;
      if (filterQuelle && f.quelle !== filterQuelle) return false;
      if (searchQuery) {
        const hay = [f.mastLabel, f.taskTitel, f.protokollName, f.name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    items.sort((a, b) => {
      if (sortMode === 'standort') return String(a.mastLabel || '').localeCompare(String(b.mastLabel || ''), 'de', { numeric: true });
      const da = String(a.addedAt || '');
      const db = String(b.addedAt || '');
      return sortMode === 'alt' ? da.localeCompare(db) : db.localeCompare(da);
    });

    const countEl = document.getElementById('fo-count');
    if (countEl) countEl.textContent = String(items.length);
    const emptyEl = document.getElementById('fo-empty');

    if (!all.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Noch keine Fotos in diesem Projekt - Fotos entstehen in der Handy-App über Mast-Detail › Fotos oder beim Ausfüllen eines Protokolls mit einem Foto-Baustein.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (!items.length) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'Keine Fotos entsprechen der aktuellen Filterung/Suche.'; }
      gridEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    gridEl.innerHTML = items.map((f) => `
      <div class="fo-card" data-fo-id="${esc(f.id)}">
        <div class="fo-thumb"><img src="${f.dataUrl}" alt="${esc(f.name || 'Foto')}" loading="lazy"></div>
        <div class="fo-meta">
          <span class="fo-meta-date">${f.addedAt ? esc(fmtDatumZeitFo(f.addedAt)) : '–'}</span>
          <span class="fo-meta-tag fo-meta-tag-${esc(f.quelle)}">${esc(f.quelleLabel)}</span>
        </div>
        <div class="fo-meta-standort">${esc(f.mastLabel || '–')}</div>
      </div>`).join('');

    gridEl.querySelectorAll('[data-fo-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const f = items.find((x) => x.id === card.getAttribute('data-fo-id'));
        if (f) openLightbox(f);
      });
    });
  }

  const standortSel = document.getElementById('fo-filter-standort');
  if (standortSel) standortSel.addEventListener('change', () => { filterStandort = standortSel.value; render(); });
  const quelleSel = document.getElementById('fo-filter-quelle');
  if (quelleSel) quelleSel.addEventListener('change', () => { filterQuelle = quelleSel.value; render(); });
  const sortSel = document.getElementById('fo-sort');
  if (sortSel) sortSel.addEventListener('change', () => { sortMode = sortSel.value; render(); });
  const searchInput = document.getElementById('fo-search');
  if (searchInput) searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); render(); });
  const clearBtn = document.getElementById('fo-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterStandort = '';
      filterQuelle = '';
      sortMode = 'neu';
      searchQuery = '';
      if (standortSel) standortSel.value = '';
      if (quelleSel) quelleSel.value = '';
      if (sortSel) sortSel.value = 'neu';
      if (searchInput) searchInput.value = '';
      render();
    });
  }

  window.levelbuildOnShowFotos = render;
  render();
})();

// ======================================================================
// Elemente: Nutzer-Wunsch: "der ereich für den Masttafel Infport soll in
// einem Übergeordneten Bereich namens Elemente geschoben werden. Die
// Masttafel selber ist eine Elementensammlung, Es muss eine Wahl geben z.B.
// Elementensammlung Masttafel, Schweißliste, Weichen/Schwellen Liste,
// Kabeltiefbau Elemente u.s.w. Alle Logiken werden auch auf diese Anderen
// Elemente Gezogen." - Schritt 1 (siehe Kommentar bei
// ELEMENTENSAMMLUNGEN_KEY weiter oben für die genaue Abgrenzung): Masttafel
// bleibt unangetastet, wird hier nur als Eintrag in einer Auswahl geführt
// ("Zur Masttafel-Ansicht" öffnet die bestehende, unveränderte Übersicht-
// Seite mit bereits ausgeklappter Masttafel). Zusätzliche, frei benannte
// Elementensammlungen bekommen eine eigene, generische Tabellen-Ansicht mit
// xlsx-Import + derselben Versionierung wie die Masttafel. Nur aktiv, wenn
// #el-content existiert (Elemente-Seite).
// ======================================================================
(function () {
  const contentEl = document.getElementById('el-content');
  if (!contentEl) return;

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function fmtDatumZeitEl(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso || '');
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) { return String(iso || ''); }
  }
  // Wie fmtDatumZeitEl, aber ohne Uhrzeit - für die Datei-Zeile im
  // "Allgemein"-Kopf, exakt im selben Format wie die Masttafel
  // (formatDate() in der Masttafel-IIFE: "Eingelesen am DD.MM.YYYY").
  function fmtDatumEl(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso || '');
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    } catch (e) { return String(iso || ''); }
  }

  // Nutzer-Wunsch (Folgeturn 4): "Es muss Klick sein und dann öffnet sich
  // die Elementensammlung ... es wäre besser wenn man unter Elemente nur die
  // Namen der Elementliste sieht ... Erst wenn ich auf den Namen der Liste
  // dann klicke öffnet sich das Fenster" - ersetzt das bisherige Dropdown
  // (.el-sammlung-switcher) durch eine echte Liste: die Elemente-Seite
  // landet immer zuerst auf der Übersichtsliste aller Sammlungen (Masttafel
  // steht dort schon fest drin), erst ein Klick auf einen Namen öffnet die
  // Detailansicht mit Import/Bauabschnitten/Zoom/Spalten/Änderungsbericht.
  // Bewusst NICHT persistiert (kein localStorage) - beim erneuten Aufrufen
  // der Seite (auch nach einem Seitenwechsel) startet man wieder auf der
  // Liste, exakt wie beschrieben.
  let elView = 'list';
  let elActiveId = null;
  // Mehrfachauswahl (Löschen / Tätigkeitsliste zuordnen) in der generischen
  // Sammlungs-Tabelle - wie elView/elActiveId bewusst nicht persistiert.
  // elSelectedKeys hält NORMALISIERTE Schlüssel (esNormalize), analog zu
  // MT.selectedKeys in der Masttafel-IIFE. elSelectionSammlungId sorgt
  // dafür, dass eine Auswahl beim Wechsel zu einer anderen Sammlung
  // zurückgesetzt wird (sonst könnten Schlüssel einer fremden Sammlung
  // "ausgewählt" bleiben).
  let elSelectedKeys = new Set();
  let elSelectionSammlungId = null;

  function elListRowSubtitle(s) {
    if (s.type === 'masttafel') return 'Fest eingebaut · Mastdaten (xlsx/PDF-Import)';
    const map = loadElementDaten();
    const entry = map[s.id];
    let rowCount = 0;
    if (entry) Object.values(entry.sections || {}).forEach((sec) => { rowCount += (sec.rowsByKey || []).length; });
    const colInfo = (s.columns || []).length ? `${s.columns.length} Spalten` : 'kein Format';
    return `${colInfo} · ${rowCount} Zeile${rowCount === 1 ? '' : 'n'} importiert`;
  }

  function elListRowHtml(s) {
    return `
      <div class="el-sammlung-row" data-el-open="${esc(s.id)}">
        <span class="el-sammlung-row-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        </span>
        <span class="el-sammlung-row-main">
          <span class="el-sammlung-row-name">${esc(s.name)}${s.builtin ? ' <span class="changelog-empty" style="padding:0; display:inline;">(fest)</span>' : ''}</span>
          <span class="el-sammlung-row-sub">${elListRowSubtitle(s)}</span>
        </span>
        <span class="chev-mini-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
        </span>
      </div>`;
  }

  function renderListView(sammlungen) {
    contentEl.innerHTML = `<div class="el-sammlung-list">${sammlungen.map((s) => elListRowHtml(s)).join('')}</div>`;
    contentEl.querySelectorAll('[data-el-open]').forEach((row) => {
      row.addEventListener('click', () => {
        elActiveId = row.getAttribute('data-el-open');
        elView = 'detail';
        render();
      });
    });
  }

  // Nutzer-Wunsch (Folgeturn 5): "wenn man auf Masttafel klickt will ich
  // wirklich das sich diese Maske hier öffnet" - der reale Masttafel-Block
  // (#overview-expanded, physisch von der Übersicht-Seite hierher verschoben,
  // siehe intra.html) wird nur noch ein-/ausgeblendet, NIE mehr per
  // innerHTML neu gebaut - dadurch bleibt die riesige, unveränderte
  // Masttafel-IIFE in app.js komplett unangetastet und funktionsfähig.
  function showMasttafelPanel() {
    if (contentEl) contentEl.innerHTML = '';
    const wrap = document.getElementById('overview-expanded');
    if (wrap) wrap.style.display = 'block';
    // Aktualisiert Projektwechsel-Erkennung, Bauabschnitt-Liste und die
    // Sticky-Spalten-Offsets (die während display:none als 0 gemessen
    // würden) - dieselbe Aktualisierung, die früher beim Aufruf der
    // Übersicht-Seite lief.
    if (window.levelbuildOnShowUebersicht) window.levelbuildOnShowUebersicht();
  }
  function hideMasttafelPanel() {
    const wrap = document.getElementById('overview-expanded');
    if (wrap) wrap.style.display = 'none';
  }

  // Nutzer-Wunsch: "die Maske eines Elementes muss immer so aussehen wie die
  // Maske der Masttafel" - dieselben Bausteine wie im Masttafel-Toolbar
  // (Bauabschnitt-Segmentumschalter oben links, Zoom + Spalten-Konfiguration
  // im matt-toolbar), inkl. einer "Alle Bauabschnitte anzeigen"-Sammelsicht
  // (dort ist der Import bewusst gesperrt, exakt wie bei der Masttafel, da
  // ein Import ja genau einem Bauabschnitt zugeordnet werden muss).
  function activeBauabschnittFor(entry, bas) {
    if (!bas.length) return null;
    if (entry.activeBauabschnittId === '__all__') return '__all__';
    if (entry.activeBauabschnittId && bas.some((b) => b.id === entry.activeBauabschnittId)) return entry.activeBauabschnittId;
    return bas[0].id;
  }

  // Der Bauabschnitt-Umschalter wird - anders als z. B. der Masttafel-eigene
  // .ba-switcher, der fest im statischen HTML steht - bei jedem render() neu
  // ins #el-content eingefügt. Das Öffnen/Schließen ist im übrigen Code nur
  // EINMALIG beim Skript-Start für die zu diesem Zeitpunkt bereits
  // vorhandenen [data-toggle-segment-menu]-Elemente verdrahtet, würde also
  // für diesen dynamisch erzeugten Umschalter nicht greifen - deshalb hier
  // separat verdrahtet.
  function wireDynamicSegmentToggle(root) {
    root.querySelectorAll('[data-toggle-segment-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        if (!menu) return;
        const isOpen = !menu.hasAttribute('hidden');
        document.querySelectorAll('.segment-menu').forEach((m) => m.setAttribute('hidden', ''));
        if (!isOpen) menu.removeAttribute('hidden');
      });
    });
  }

  // Wie das einmalige, globale ".panel-header"-Klick-Handling (app.js Zeile
  // ~27) bzw. die globale ".dropzone"-Drag-Feedback-Verdrahtung (Zeile
  // ~266) - beide greifen nur bei Elementen, die schon beim Skript-Start im
  // DOM standen. Der "Allgemein"-Kopf + das Tabellen-Panel der generischen
  // Elementensammlungen werden aber bei jedem render() neu per innerHTML
  // gebaut, brauchen also dieselbe Logik hier noch einmal, lokal verdrahtet.
  function wireDynamicPanelToggle(root) {
    root.querySelectorAll('.panel-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-segment-menu]') || e.target.closest('.segment-menu')) return;
        const panel = header.closest('.panel');
        if (panel) panel.classList.toggle('collapsed');
      });
    });
  }

  function wireDynamicDropzones(root, onFile) {
    root.querySelectorAll('[data-el-import-trigger]').forEach((zone) => {
      const fileInput = root.querySelector('#el-file-input');
      zone.addEventListener('click', (e) => {
        e.preventDefault();
        if (!fileInput) return;
        fileInput.value = '';
        fileInput.click();
      });
      ['dragenter', 'dragover'].forEach((evt) => {
        zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      });
      ['dragleave'].forEach((evt) => {
        zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('drag-over'); });
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) onFile(file);
      });
    });
  }

  function renderBaSwitcher(sammlungId, bas, activeBa) {
    const sw = contentEl.querySelector('.el-ba-switcher');
    if (!sw) return;
    const label = sw.querySelector('.segment-current');
    const activeName = activeBa === '__all__' ? 'Alle Bauabschnitte anzeigen' : ((bas.find((b) => b.id === activeBa) || {}).name || 'Bauabschnitt');
    if (label) label.textContent = activeName;
    const menu = sw.querySelector('.segment-menu');
    if (!menu) return;
    const items = bas.concat([{ id: '__all__', name: 'Alle Bauabschnitte anzeigen' }]);
    menu.innerHTML = items.map((it) =>
      `<div class="segment-menu-item${it.id === activeBa ? ' active' : ''}" data-el-ba="${esc(it.id)}">${esc(it.name)}</div>`
    ).join('');
    menu.querySelectorAll('[data-el-ba]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const map = loadElementDaten();
        const entry = map[sammlungId] || { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
        entry.activeBauabschnittId = item.getAttribute('data-el-ba');
        map[sammlungId] = entry;
        saveElementDaten(map);
        menu.setAttribute('hidden', '');
        // Zeilen (und damit auch die zugehörigen Schlüssel) wechseln mit dem
        // Bauabschnitt komplett - eine bestehende Auswahl gehört sonst zu
        // Zeilen, die gar nicht mehr angezeigt werden.
        elSelectedKeys = new Set();
        render();
      });
    });
  }

  function adjustZoom(sammlungId, delta) {
    const map = loadElementDaten();
    const entry = map[sammlungId] || { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
    entry.zoom = Math.max(50, Math.min(200, (entry.zoom || 100) + delta));
    map[sammlungId] = entry;
    saveElementDaten(map);
    render();
  }

  // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - Umschalter
  // für "Alle Versionen anzeigen", je Sammlung gespeichert (analog zu Zoom
  // oben), spiegelt Masttafel's MT.showAllVersions-Toggle (matt-allversions-switch).
  function toggleShowAllVersionsEl(sammlungId) {
    const map = loadElementDaten();
    const entry = map[sammlungId] || { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
    entry.showAllVersions = !entry.showAllVersions;
    map[sammlungId] = entry;
    saveElementDaten(map);
    render();
  }

  const BA_SWITCHER_ICON_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1.03H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1.03z"/></svg>';

  // Nutzer-Wunsch (Folgeturn 6): "die anderen Listen sollen genau so eine
  // Maske haben ... auch mit der Versionierungslogik" - konkret zunächst der
  // "Kopf" der Masttafel-Maske: ein "Allgemein"-Panel (Datei-Dropzone +
  // Dateiliste links, "Änderungen"-Zusammenfassung + Änderungsbericht-Link
  // rechts) über einem zweiten Panel mit Bauabschnitt-Switcher/Toolbar/
  // Tabelle - exakt dieselben CSS-Klassen wie die echte, statische
  // Masttafel-Maske (siehe #overview-expanded in intra.html), nur mit
  // dynamischen Daten aus dem generischen Elementensammlungs-Speicher.
  function fileRowHtml(f) {
    return `
      <div class="file-row">
        <span class="file-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        </span>
        <div class="file-meta">
          <span class="file-name">${esc(f.name)}</span>
          <span class="file-sub">Eingelesen am ${esc(fmtDatumEl(f.importedAt))} · Wajih Tfaili</span>
        </div>
        ${f.url ? `<a class="icon-btn" title="Herunterladen" href="${f.url}" download="${esc(f.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
        </a>` : ''}
        <button type="button" class="icon-btn" title="Datei entfernen" data-el-delete-file="${esc(f.id)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>`;
  }

  // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - eigene
  // Kopie von Masttafel's computeChangedColsMap() (siehe dort), verwendet
  // esNormalize statt normalize, aber identische Logik: vergleicht jede
  // Version mit ihrer unmittelbaren Nachfolge-Version und liefert je
  // Versionsnummer die Menge der abweichenden Spalten-Indizes zurück - nur
  // gebraucht, wenn "Alle Versionen anzeigen" aktiv ist.
  function computeChangedColsMapEl(versions) {
    const map = new Map();
    versions.forEach((v) => map.set(v.version, new Set()));
    for (let i = 0; i < versions.length - 1; i++) {
      const a = versions[i], b = versions[i + 1];
      for (let c = 0; c < a.values.length; c++) {
        if (esNormalize(a.values[c]) !== esNormalize(b.values[c])) {
          map.get(a.version).add(c);
          map.get(b.version).add(c);
        }
      }
    }
    return map;
  }

  function genericSammlungHtml(sammlung) {
    const map = loadElementDaten();
    const entry = map[sammlung.id] || { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
    const bas = loadBauabschnitte();
    const cols = sammlung.columns || [];

    if (!bas.length) {
      return `
        <div class="el-toolbar">
          <button type="button" class="link-action" id="el-rename-sammlung">Umbenennen</button>
          <button type="button" class="link-action" id="el-delete-sammlung" style="color:var(--red);">Sammlung löschen</button>
        </div>
        <div class="changelog-empty">Es sind noch keine Bauabschnitte angelegt. Lege zuerst in den Projekteinstellungen mindestens einen Bauabschnitt an, um Daten für "${esc(sammlung.name)}" zu importieren.</div>`;
    }
    if (!cols.length) {
      return `
        <div class="el-toolbar">
          <button type="button" class="link-action" id="el-rename-sammlung">Umbenennen</button>
          <button type="button" class="link-action" id="el-delete-sammlung" style="color:var(--red);">Sammlung löschen</button>
        </div>
        <div class="changelog-empty">Diese Sammlung hat kein festes Format hinterlegt (die zugrundeliegende Elementenvorlage fehlt oder hat kein Format). Bitte über Projekte → Vorlagen → Elementenvorlagen prüfen.</div>`;
    }

    const activeBa = activeBauabschnittFor(entry, bas);
    const isAll = activeBa === '__all__';
    const zoom = entry.zoom || 100;
    const hiddenCols = entry.hiddenCols || [];
    // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - spiegelt
    // Masttafel's MT.showAllVersions-Umschalter (siehe matt-allversions-switch)
    // 1:1 für die generische Tabelle, hier je Sammlung statt je Masttafel
    // gespeichert (analog zu zoom/hiddenCols).
    const showAllVersions = !!entry.showAllVersions;
    const sec = (!isAll && activeBa) ? (entry.sections[activeBa] || { rowsByKey: [], changesLog: [], files: [] }) : null;

    let rows = [];
    if (isAll) {
      bas.forEach((b) => {
        const s = entry.sections[b.id];
        if (!s) return;
        (s.rowsByKey || []).forEach((pair) => rows.push(Object.assign({ baName: b.name, baId: b.id }, pair[1])));
      });
    } else {
      rows = ((sec && sec.rowsByKey) || []).map((pair) => pair[1]);
    }
    rows.sort((a, b) => String(a.displayKey || '').localeCompare(String(b.displayKey || ''), 'de', { numeric: true }));
    const visibleCols = cols.filter((c) => !hiddenCols.includes(c.idx));
    const changesLog = sec ? (sec.changesLog || []) : [];
    const changesLogCount = changesLog.length;
    const files = sec ? (sec.files || []) : [];

    // ---------- "Allgemein"-Kopf: Datei-Dropzone + Dateiliste + Änderungen ----------
    const changesSummaryHtml = changesLogCount
      ? `<div class="changelog-summary">${new Set(changesLog.map((c) => c.key)).size} Bauwerk${new Set(changesLog.map((c) => c.key)).size === 1 ? '' : 'e'} mit neuer Version · ${changesLogCount} geänderte Werte</div>`
      : `<div class="changelog-empty">Noch keine Änderungen vorhanden</div>`;
    const dropzoneDisabledAttr = isAll ? ' style="opacity:.5; pointer-events:none;" title="Erst einen Bauabschnitt auswählen, um zu importieren"' : '';

    const allgemeinPanelHtml = `
      <div class="panel el-head-panel">
        <div class="panel-header">
          <span>Allgemein</span>
          <div class="panel-actions">
            <span class="icon-btn" title="Bearbeiten">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </span>
            <span class="chev" data-panel-toggle>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            </span>
          </div>
        </div>
        <div class="panel-body two-col">
          <div class="subcol">
            <div class="subheading">${esc(sammlung.name)} Datei</div>
            <div class="masttafel-empty dropzone small" id="el-datei-empty" data-el-import-trigger${dropzoneDisabledAttr}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><path d="M5 21h14"/></svg>
              <span>Datei hierher ziehen</span>
              <span class="hint">oder klicken zum Hochladen – auch für weitere Versionen</span>
            </div>
            <input type="file" id="el-file-input" accept=".xlsx,.xls" hidden>
            <div class="file-list" id="el-file-list">${files.map(fileRowHtml).join('')}</div>
          </div>
          <div class="subcol">
            <div class="subheading">Änderungen</div>
            <div id="el-changes-summary">${changesSummaryHtml}</div>
            <button type="button" class="link-action" id="el-open-report" ${changesLogCount ? '' : 'disabled'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
              Änderungsbericht öffnen
            </button>
          </div>
        </div>
      </div>`;

    // ---------- Tabellen-Panel (Bauabschnitt-Switcher im Kopf, wie Masttafel) ----------
    const baSwitcherHtml = `
      <div class="segment-switcher el-ba-switcher">
        <button class="segment-switcher-btn" type="button" data-toggle-segment-menu>
          ${BA_SWITCHER_ICON_SVG}
          <span class="segment-current">Bauabschnitt</span>
          <svg class="chev-mini" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="segment-menu" hidden></div>
      </div>`;

    const toolbarHtml = `
      <div class="matt-toolbar">
        <div class="matt-toolbar-group">
          <button class="matt-tool-btn" id="el-zoom-out" title="Verkleinern">−</button>
          <span class="matt-zoom-label" id="el-zoom-label">${zoom}%</span>
          <button class="matt-tool-btn" id="el-zoom-in" title="Vergrößern">+</button>
        </div>
        <div class="matt-toolbar-group">
          <button class="matt-tool-btn" id="el-open-columns">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="10.5" y="3" width="7" height="18" rx="1"/><rect x="18" y="3" width="3" height="18" rx="1"/></svg>
            Spalten
          </button>
        </div>
        <div class="matt-toolbar-group">
          <label class="matt-toggle-label">
            <span class="switch small${showAllVersions ? ' on' : ''}" id="el-allversions-switch"><span class="knob"></span></span>
            Alle Versionen anzeigen
          </label>
        </div>
        <div class="matt-toolbar-group matt-selection-group" id="el-selection-group" hidden>
          <span class="matt-selection-status" id="el-selection-status"></span>
          <button class="matt-tool-btn" id="el-assign-tl-selected">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Tätigkeitsliste zuordnen
          </button>
          <button class="matt-tool-btn matt-tool-btn-danger" id="el-delete-selected">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Löschen
          </button>
        </div>
        <div class="matt-toolbar-spacer"></div>
        <div class="matt-toolbar-group">
          <button type="button" class="matt-tool-btn" id="el-open-report-2" ${changesLogCount ? '' : 'disabled'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
            Änderungsbericht
          </button>
          <button type="button" class="link-action" id="el-rename-sammlung">Umbenennen</button>
          <button type="button" class="link-action" id="el-delete-sammlung" style="color:var(--red);">Sammlung löschen</button>
        </div>
      </div>`;

    // Mehrfachauswahl-Spalte nur außerhalb der "Alle Bauabschnitte"-
    // Sammelsicht (wie beim Import) - sonst wäre nicht eindeutig, aus
    // welchem Bauabschnitt eine ausgewählte Zeile stammt.
    const selColHtml = !isAll ? '<th class="sel-col" rowspan="1"><input type="checkbox" id="el-select-all" title="Alle auswählen"></th>' : '';
    const theadHtml = `<tr>${selColHtml}${isAll ? '<th>Bauabschnitt</th>' : ''}${visibleCols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
    // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - spiegelt
    // Masttafel's buildTbodyHtml() (siehe dort): im Standard nur die letzte
    // Version je Eintrag, bei aktivem "Alle Versionen anzeigen" eine Zeile
    // je Version (neueste zuerst) mit rot hervorgehobenen geänderten
    // Zellen (computeChangedColsMapEl) und abgeblasster ".row-historical"-
    // Optik für ältere Versionen - exakt wie bei der Masttafel-Tabelle.
    const tbodyHtml = rows.map((rowEntry) => {
      const versions = rowEntry.versions;
      const latest = versions[versions.length - 1];
      const hasHistory = versions.length > 1;
      const baCell = isAll ? `<td>${esc(rowEntry.baName || '')}</td>` : '';
      const rowKeyAttr = esc(esNormalize(rowEntry.displayKey));
      const rowBaAttr = esc(rowEntry.baId || activeBa || '');
      const selected = elSelectedKeys.has(esNormalize(rowEntry.displayKey));

      function selCellHtml() {
        return !isAll ? `<td class="sel-col"><input type="checkbox" data-el-select-key="${esc(rowEntry.displayKey)}" ${selected ? 'checked' : ''}></td>` : '';
      }
      function rowHtml(v, opts) {
        opts = opts || {};
        const vBadge = hasHistory ? `<span class="ver-badge${opts.isLatest ? ' current' : ''}">v${v.version}${opts.isLatest ? ' (aktuell)' : ''}</span>` : '';
        const cellsHtml = visibleCols.map((c, ci) => {
          const changed = opts.changedCols && opts.changedCols.has(c.idx);
          return `<td${changed ? ' class="cell-changed"' : ''}>${esc(v.values[c.idx])}${ci === 0 ? vBadge : ''}</td>`;
        }).join('');
        const rowClass = 'dok-table-row-clickable' + (opts.historical ? ' row-historical' : '');
        // data-el-row-version markiert, welche konkrete Version angeklickt
        // wurde - die Element-Detail-Seite öffnet dann direkt diese Version
        // (statt immer nur die aktuelle), siehe openElementDetailPage().
        return `<tr class="${rowClass}" data-el-row-key="${rowKeyAttr}" data-el-row-ba="${rowBaAttr}" data-el-row-version="${v.version}">${selCellHtml()}${baCell}${cellsHtml}</tr>`;
      }

      if (!showAllVersions) {
        return rowHtml(latest, { isLatest: true });
      }
      const changedMap = hasHistory ? computeChangedColsMapEl(versions) : null;
      let html = '';
      for (let i = versions.length - 1; i >= 0; i--) {
        const v = versions[i];
        const isLatest = v.version === latest.version;
        html += rowHtml(v, {
          isLatest,
          historical: !isLatest,
          changedCols: changedMap ? changedMap.get(v.version) : null,
        });
      }
      return html;
    }).join('');

    const tableBodyHtml = rows.length
      ? `<div class="dok-table-wrap" id="el-table-wrap" style="font-size:${(zoom / 100 * 10.5).toFixed(2)}px;">
          <table class="dok-table">
            <thead>${theadHtml}</thead>
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>`
      : `<div class="masttafel-empty dropzone large" id="el-empty-expanded" data-el-import-trigger${dropzoneDisabledAttr}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
          <span>${isAll ? 'Noch keine Daten in irgendeinem Bauabschnitt' : 'Noch keine Daten vorhanden'}</span>
          <span class="hint">${isAll ? '' : 'Datei hierher ziehen oder klicken, um ' + esc(sammlung.name) + '-Daten einzulesen'}</span>
        </div>`;

    const tabelPanelHtml = `
      <div class="panel el-table-panel" style="margin-top:16px;">
        <div class="panel-header">
          <span class="panel-header-left">
            <span>${esc(sammlung.name)}</span>
            ${baSwitcherHtml}
          </span>
          <div class="panel-actions">
            <span class="icon-btn" title="Bearbeiten">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </span>
            <span class="chev" data-panel-toggle>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            </span>
          </div>
        </div>
        ${toolbarHtml}
        <div class="panel-body" style="padding:0;">
          ${tableBodyHtml}
        </div>
      </div>`;

    return allgemeinPanelHtml + tabelPanelHtml;
  }

  // Nutzer-Wunsch (Folgeturn 9): "jedes Element in einer Liste muss
  // aufgemacht werden können genau wie wenn ich auf einen Mast klicke" -
  // spiegelt openMastDetailPage() (siehe Masttafel-IIFE weiter oben) 1:1,
  // schreibt den Handoff aber unter einem eigenen sessionStorage-Key
  // ('levelbuild_element_detail'), damit sich Masttafel- und generische
  // Element-Detailseiten niemals gegenseitig überschreiben können.
  function openElementDetailPage(sammlung, rowEntry, bauabschnittId, bauabschnittName, initialVersion) {
    const payload = {
      sammlungId: sammlung.id,
      sammlungName: sammlung.name,
      key: rowEntry.displayKey,
      rowKey: esNormalize(rowEntry.displayKey),
      bauabschnittId: bauabschnittId || null,
      bauabschnittName: bauabschnittName || '–',
      columns: sammlung.columns || [],
      versions: rowEntry.versions,
      projectLabel: currentProjectLabel(),
      // Nutzer-Wunsch (Folgeturn 11): "Die Versionslogic fehlt noch" - beim
      // Klick auf eine bestimmte Version in der "Alle Versionen anzeigen"-
      // Tabelle öffnet die Detailseite direkt bei genau dieser Version
      // (statt immer nur der aktuellsten), siehe Element-Detail-IIFE.
      initialVersion: initialVersion || null,
    };
    try { sessionStorage.setItem('levelbuild_element_detail', JSON.stringify(payload)); } catch (e) { /* ignore */ }
    if (window.levelbuildGo) window.levelbuildGo('element-detail');
  }

  function openColumnsModalEl(sammlungId, cols, hiddenCols) {
    const rowsHtml = cols.map((c) => `
      <label class="col-config-row" style="cursor:pointer;">
        <span style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" data-el-col="${c.idx}" ${hiddenCols.includes(c.idx) ? '' : 'checked'}>
          ${esc(c.label)}
        </span>
      </label>`).join('');
    openModalEl('Spalten konfigurieren', `<div class="col-config-list">${rowsHtml}</div>`, `
      <button type="button" class="matt-tool-btn" id="el-cols-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="el-cols-apply">Übernehmen</button>
    `);
    document.getElementById('el-cols-cancel').addEventListener('click', closeModalEl);
    document.getElementById('el-cols-apply').addEventListener('click', () => {
      const hidden = Array.from(modalBodyEl.querySelectorAll('[data-el-col]')).filter((cb) => !cb.checked).map((cb) => parseInt(cb.getAttribute('data-el-col'), 10));
      const map = loadElementDaten();
      const entry = map[sammlungId];
      if (entry) { entry.hiddenCols = hidden; saveElementDaten(map); }
      closeModalEl();
      render();
    });
  }

  // Nutzer-Wunsch (Folgeturn 3): Import läuft gegen das feste Format der
  // Sammlung (sammlung.columns, aus der Elementenvorlage übernommen) statt
  // gegen eine pro Datei neu erkannte Kopfzeile - siehe parseFixedFormatSheet.
  // Zeigt nach dem Import dieselbe Art Rückmeldung wie die Masttafel ("X neu,
  // Y mit Änderungen, Z unverändert"), plus eine Warnung, falls einzelne
  // erwartete Spalten in der Datei nicht gefunden wurden.
  function handleImportFile(sammlung, bauabschnittId, file) {
    if (!file || !sammlung || !bauabschnittId) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bytes = new Uint8Array(evt.target.result);
        const wb = XLSX.read(bytes, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseFixedFormatSheet(ws, sammlung.columns || []);
        if (!parsed.rows.length) { alert('Die Datei enthält keine erkennbaren Datenzeilen unter der Kopfzeile.'); return; }
        // "Datenpfad <Name>"-Spalten sind in parseFixedFormatSheet ohnehin
        // schon außen vor (es werden nur die in der Vorlage definierten
        // Spalten übernommen) - hier nur die Pfad-Werte für die Dokumenten-
        // Auflösung einsammeln, siehe extractDatenpfadRefs weiter oben.
        const keyColLabel = sammlung.columns && sammlung.columns[0] ? sammlung.columns[0].label : null;
        const datenpfadRefs = extractDatenpfadRefs(ws, keyColLabel);
        // url: data-URL (nicht blob:) wie bei der Masttafel (uint8ToBase64Global,
        // siehe dort) - übersteht das Speichern in localStorage und ist beim
        // nächsten Laden noch als echter Download-Link nutzbar.
        const mimeType = file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const fileMeta = { id: 'ef-' + Date.now().toString(36), name: file.name, importedAt: new Date().toISOString(), url: 'data:' + mimeType + ';base64,' + uint8ToBase64Global(bytes) };
        const summary = importGenericElementIntoStore(sammlung.id, bauabschnittId, sammlung.columns || [], parsed.rows, fileMeta);
        render();
        const summaryMsg = summary.changedKeys > 0
          ? `${file.name}: ${summary.newKeys} neu, ${summary.changedKeys} mit Änderungen (neue Version), ${summary.unchangedKeys} unverändert.`
          : `${file.name}: ${summary.newKeys} neu, ${summary.unchangedKeys} unverändert – keine Änderungen erkannt.`;
        const warnMsg = parsed.missing.length ? `\n\nHinweis: Diese Spalten aus dem festen Format wurden in der Datei nicht gefunden und blieben leer: ${parsed.missing.join(', ')}.` : '';
        alert(summaryMsg + warnMsg);
        handleDatenpfadAfterImport(datenpfadRefs, file.name, (rowKeyRaw, docs) => attachElementDatenpfadDokumente(sammlung.id, bauabschnittId, rowKeyRaw, docs));
      } catch (err) {
        alert('Datei konnte nicht gelesen werden - bitte eine gültige xlsx-Datei wählen.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Wie deleteFile() der Masttafel: entfernt nur den Datei-Eintrag aus der
  // Liste (Re-Download/Nachvollziehbarkeit), lässt bereits eingelesene
  // Zeilen/Versionen unangetastet.
  function deleteElFile(sammlungId, bauabschnittId, fileId) {
    if (!fileId) return;
    const map = loadElementDaten();
    const entry = map[sammlungId];
    const sec = entry && entry.sections[bauabschnittId];
    if (!sec) return;
    const f = (sec.files || []).find((x) => x.id === fileId);
    if (!f) return;
    if (!window.confirm(`"${f.name}" aus der Dateiliste entfernen? Bereits eingelesene Daten aus dieser Datei bleiben erhalten.`)) return;
    sec.files = (sec.files || []).filter((x) => x.id !== fileId);
    saveElementDaten(map);
    render();
  }

  // ---------- Änderungsbericht (analog Masttafel, xlsx-Export) ----------
  function openChangeReportEl(sammlung, bauabschnittId, entry) {
    const sec = entry.sections[bauabschnittId] || {};
    const changesLog = sec.changesLog || [];
    if (!changesLog.length) {
      openModalEl('Änderungsbericht', '<div class="changelog-empty" style="padding:24px 0;">Noch keine Änderungen vorhanden.</div>', `<button type="button" class="matt-tool-btn" id="el-rep-close">Schließen</button>`);
      document.getElementById('el-rep-close').addEventListener('click', closeModalEl);
      return;
    }
    const rowsHtml = changesLog.slice().reverse().map((c) => `
      <tr>
        <td class="key-col">${esc(c.key)}</td>
        <td>${esc(c.colLabel)}</td>
        <td>${c.oldVal ? esc(c.oldVal) : '–'}</td>
        <td>${c.newVal ? esc(c.newVal) : '–'}</td>
        <td>v${c.fromVersion} → v${c.toVersion}</td>
        <td>${esc(fmtDatumZeitEl(c.importedAt))}</td>
      </tr>`).join('');
    openModalEl('Änderungsbericht', `
      <div class="dok-table-wrap" style="max-height:420px;">
        <table class="dok-table">
          <thead><tr><th class="key-col">Schlüssel</th><th>Spalte</th><th>Alter Wert</th><th>Neuer Wert</th><th>Version</th><th>Eingelesen am</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `, `
      <button type="button" class="matt-tool-btn" id="el-rep-download">Als Excel herunterladen</button>
      <button type="button" class="matt-tool-btn" id="el-rep-close">Schließen</button>
    `);
    document.getElementById('el-rep-close').addEventListener('click', closeModalEl);
    document.getElementById('el-rep-download').addEventListener('click', () => downloadChangeReportEl(sammlung, changesLog));
  }

  function downloadChangeReportEl(sammlung, changesLog) {
    const aoa = [['Schlüssel', 'Spalte', 'Alter Wert', 'Neuer Wert', 'Version', 'Eingelesen am']];
    changesLog.forEach((c) => {
      aoa.push([c.key, c.colLabel, c.oldVal, c.newVal, `v${c.fromVersion} -> v${c.toVersion}`, fmtDatumZeitEl(c.importedAt)]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Änderungsbericht');
    const safeName = String(sammlung.name || 'Elemente').replace(/[^a-z0-9äöüß_-]+/gi, '_');
    XLSX.writeFile(wb, `Aenderungsbericht_${safeName}.xlsx`);
  }

  // ---------- Mehrfachauswahl (wie Masttafel: Löschen / Tätigkeitsliste zuordnen) ----------
  function updateElSelectionToolbar() {
    const group = document.getElementById('el-selection-group');
    const status = document.getElementById('el-selection-status');
    if (!group || !status) return;
    if (elSelectedKeys.size === 0) { group.hidden = true; return; }
    group.hidden = false;
    status.textContent = `${elSelectedKeys.size} ausgewählt`;
  }

  function wireElSelection(root) {
    const cbs = Array.from(root.querySelectorAll('[data-el-select-key]'));
    const selectAll = root.querySelector('#el-select-all');
    function syncSelectAll() {
      if (!selectAll) return;
      selectAll.checked = cbs.length > 0 && cbs.every((cb) => elSelectedKeys.has(esNormalize(cb.getAttribute('data-el-select-key'))));
      selectAll.indeterminate = !selectAll.checked && cbs.some((cb) => elSelectedKeys.has(esNormalize(cb.getAttribute('data-el-select-key'))));
    }
    cbs.forEach((cb) => {
      cb.addEventListener('change', () => {
        const key = esNormalize(cb.getAttribute('data-el-select-key'));
        if (cb.checked) elSelectedKeys.add(key); else elSelectedKeys.delete(key);
        syncSelectAll();
        updateElSelectionToolbar();
      });
    });
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        cbs.forEach((cb) => {
          const key = esNormalize(cb.getAttribute('data-el-select-key'));
          if (selectAll.checked) elSelectedKeys.add(key); else elSelectedKeys.delete(key);
          cb.checked = selectAll.checked;
        });
        updateElSelectionToolbar();
      });
    }
    syncSelectAll();
    updateElSelectionToolbar();
  }

  // Wie deleteSelectedBauwerke() der Masttafel: löscht die kompletten
  // Einträge (alle Versionen) der ausgewählten Zeilen, plus zugehörige
  // Änderungsbericht-Einträge.
  function deleteSelectedElRows(sammlungId, bauabschnittId) {
    if (elSelectedKeys.size === 0) return;
    const count = elSelectedKeys.size;
    if (!window.confirm(`${count} Eintrag${count === 1 ? '' : 'e'} wirklich löschen? Das entfernt auch die gesamte Versionshistorie.`)) return;
    const map = loadElementDaten();
    const entry = map[sammlungId];
    const sec = entry && entry.sections[bauabschnittId];
    if (!sec) return;
    const rowsByKeyMap = new Map(sec.rowsByKey || []);
    const displayKeysToDelete = new Set();
    elSelectedKeys.forEach((key) => {
      const rowEntry = rowsByKeyMap.get(key);
      if (rowEntry) displayKeysToDelete.add(rowEntry.displayKey);
      rowsByKeyMap.delete(key);
    });
    sec.rowsByKey = Array.from(rowsByKeyMap.entries());
    sec.changesLog = (sec.changesLog || []).filter((c) => !displayKeysToDelete.has(c.key));
    saveElementDaten(map);
    elSelectedKeys = new Set();
    render();
  }

  // Wie openBulkAssignTlModal() der Masttafel (siehe dort), aber generisch:
  // schreibt in ELEMENT_TL_ASSIGNMENT_KEY/ELEMENT_TL_MANUAL_KEY statt
  // MAST_TL_ASSIGNMENT_KEY/MAST_TL_MANUAL_KEY, jeweils zusätzlich unter der
  // aktuellen sammlungId genestet (siehe Datenmodell weiter oben in app.js).
  function openBulkAssignTlModalEl(sammlungId) {
    if (elSelectedKeys.size === 0) return;
    const count = elSelectedKeys.size;
    const lists = loadTlProjectList().filter((l) => !l.mastKey);
    openModalEl(`Tätigkeitsliste für ${count} Eintrag${count === 1 ? '' : 'e'} zuordnen`, `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:10px;">
        Bereits bestehende Zuordnungen der ausgewählten Einträge werden dabei überschrieben.
      </div>
      <div class="field">
        <label>Tätigkeitsliste</label>
        <div class="input-wrap">
          <select id="el-bulk-tl-select">
            <option value="">Keine (Zuordnung entfernen)</option>
            ${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.tasks.length})</option>`).join('')}
          </select>
        </div>
      </div>
    `, `
      <button class="btn-primary" id="el-bulk-tl-save">Zuordnen</button>
      <button class="matt-tool-btn" id="el-bulk-tl-cancel">Abbrechen</button>
    `);
    const cancelBtn = document.getElementById('el-bulk-tl-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModalEl);
    const saveBtn = document.getElementById('el-bulk-tl-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const selId = document.getElementById('el-bulk-tl-select').value;
        const assignments = loadElementTlAssignments();
        assignments[sammlungId] = assignments[sammlungId] || {};
        elSelectedKeys.forEach((key) => {
          if (selId) assignments[sammlungId][key] = selId; else delete assignments[sammlungId][key];
        });
        saveElementTlAssignments(assignments);
        const manuell = loadElementTlManuell();
        manuell[sammlungId] = manuell[sammlungId] || {};
        elSelectedKeys.forEach((key) => { manuell[sammlungId][key] = true; });
        saveElementTlManuell(manuell);
        closeModalEl();
        const gewaehlt = lists.find((l) => l.id === selId);
        alert(gewaehlt
          ? `"${gewaehlt.name}" wurde ${count} Eintrag${count === 1 ? '' : 'en'} zugeordnet.`
          : `Zuordnung für ${count} Eintrag${count === 1 ? '' : 'e'} entfernt.`);
      });
    }
  }

  function renderDetailView(active) {
    if (active.type === 'masttafel') {
      showMasttafelPanel();
      return;
    }
    hideMasttafelPanel();

    // Auswahl (Löschen/Tätigkeitsliste zuordnen) gehört zu genau einer
    // Sammlung - beim Wechsel zu einer anderen Sammlung zurücksetzen, sonst
    // blieben Schlüssel einer fremden Sammlung "ausgewählt" im Hintergrund.
    if (elSelectionSammlungId !== active.id) {
      elSelectedKeys = new Set();
      elSelectionSammlungId = active.id;
    }

    const backHtml = `<button type="button" class="link-action el-back-link" id="el-back-to-list">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
      Zurück zur Übersicht
    </button>`;
    const headingHtml = `<div class="subheading" style="margin:10px 0 12px;">${esc(active.name)}</div>`;
    contentEl.innerHTML = backHtml + headingHtml + genericSammlungHtml(active);
    wireDynamicSegmentToggle(contentEl);
    wireDynamicPanelToggle(contentEl);

    const backBtn = document.getElementById('el-back-to-list');
    if (backBtn) backBtn.addEventListener('click', () => {
      elView = 'list';
      elActiveId = null;
      render();
    });

    {
      const map = loadElementDaten();
      const entry = map[active.id] || { activeBauabschnittId: null, zoom: 100, hiddenCols: [], sections: {} };
      const bas = loadBauabschnitte();
      const activeBa = activeBauabschnittFor(entry, bas);
      if (bas.length) renderBaSwitcher(active.id, bas, activeBa);

      wireElSelection(contentEl);
      const assignTlBtn = document.getElementById('el-assign-tl-selected');
      if (assignTlBtn) assignTlBtn.addEventListener('click', () => openBulkAssignTlModalEl(active.id));
      const deleteSelectedBtn = document.getElementById('el-delete-selected');
      if (deleteSelectedBtn && activeBa && activeBa !== '__all__') {
        deleteSelectedBtn.addEventListener('click', () => deleteSelectedElRows(active.id, activeBa));
      }

      const zoomOutBtn = document.getElementById('el-zoom-out');
      const zoomInBtn = document.getElementById('el-zoom-in');
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => adjustZoom(active.id, -10));
      if (zoomInBtn) zoomInBtn.addEventListener('click', () => adjustZoom(active.id, 10));

      const colsBtn = document.getElementById('el-open-columns');
      if (colsBtn) colsBtn.addEventListener('click', () => {
        if (!active.columns || !active.columns.length) return;
        openColumnsModalEl(active.id, active.columns, entry.hiddenCols || []);
      });

      const allVersionsSwitch = document.getElementById('el-allversions-switch');
      if (allVersionsSwitch) allVersionsSwitch.addEventListener('click', () => toggleShowAllVersionsEl(active.id));

      // Wie bei der Masttafel (matt-open-report / matt-open-report-2) gibt es
      // denselben Änderungsbericht-Auslöser zweimal (Allgemein-Kopf + Toolbar).
      const reportBtn = document.getElementById('el-open-report');
      const reportBtn2 = document.getElementById('el-open-report-2');
      const openReport = () => {
        if (!activeBa || activeBa === '__all__') return;
        openChangeReportEl(active, activeBa, entry);
      };
      if (reportBtn) reportBtn.addEventListener('click', openReport);
      if (reportBtn2) reportBtn2.addEventListener('click', openReport);

      const fileInput = document.getElementById('el-file-input');
      if (fileInput && activeBa && activeBa !== '__all__') {
        wireDynamicDropzones(contentEl, (file) => handleImportFile(active, activeBa, file));
        fileInput.addEventListener('change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (file) handleImportFile(active, activeBa, file);
          fileInput.value = '';
        });
      }

      contentEl.querySelectorAll('[data-el-delete-file]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!activeBa || activeBa === '__all__') return;
          deleteElFile(active.id, activeBa, btn.getAttribute('data-el-delete-file'));
        });
      });

      // Nutzer-Wunsch (Folgeturn 9): "jedes Element in einer Liste muss
      // aufgemacht werden können genau wie wenn ich auf einen Mast klicke" -
      // Klick auf eine Tabellenzeile (außerhalb der Auswahl-Checkbox-Spalte)
      // öffnet dieselbe Art Maske wie Mast-Detail, hier für generische
      // Elemente (siehe openElementDetailPage() unten).
      contentEl.querySelectorAll('tr[data-el-row-key]').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.sel-col')) return;
          const rowKey = tr.getAttribute('data-el-row-key');
          const rowBaId = tr.getAttribute('data-el-row-ba');
          const sec = entry.sections[rowBaId];
          if (!sec) return;
          const pair = (sec.rowsByKey || []).find((p) => p[0] === rowKey);
          if (!pair) return;
          const baEntry = bas.find((b) => b.id === rowBaId);
          // Nutzer-Wunsch (Folgeturn 11): bei aktivem "Alle Versionen
          // anzeigen" trägt jede Zeile ihre eigene Versionsnummer
          // (data-el-row-version) - ein Klick auf eine ältere Version
          // öffnet die Element-Detail-Seite direkt bei genau dieser
          // Version, statt immer nur bei der aktuellsten.
          const clickedVersion = parseInt(tr.getAttribute('data-el-row-version'), 10) || null;
          openElementDetailPage(active, pair[1], rowBaId, baEntry ? baEntry.name : '', clickedVersion);
        });
      });
    }

    const renameBtn = document.getElementById('el-rename-sammlung');
    if (renameBtn) renameBtn.addEventListener('click', () => {
      const name = window.prompt('Neuer Name für diese Elementensammlung:', active.name);
      if (!name || !name.trim()) return;
      const list = loadElementensammlungen().filter((s) => s.type !== 'masttafel');
      const entry = list.find((s) => s.id === active.id);
      if (entry) { entry.name = name.trim(); saveElementensammlungen(list); render(); }
    });
    const deleteBtn = document.getElementById('el-delete-sammlung');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (!window.confirm(`"${active.name}" inkl. aller importierten Daten wirklich löschen?`)) return;
      const list = loadElementensammlungen().filter((s) => s.type !== 'masttafel' && s.id !== active.id);
      saveElementensammlungen(list);
      deleteElementDatenFor(active.id);
      elView = 'list';
      elActiveId = null;
      render();
    });
  }

  function render() {
    const crumbEl = document.getElementById('el-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();

    const sammlungen = loadElementensammlungen();
    if (elView !== 'detail' || !elActiveId || !sammlungen.some((s) => s.id === elActiveId)) {
      elView = 'list';
      elActiveId = null;
      hideMasttafelPanel();
      renderListView(sammlungen);
      return;
    }
    const active = sammlungen.find((s) => s.id === elActiveId);
    renderDetailView(active);
  }

  // Nutzer-Wunsch: "die anderen Listen sollen genau so eine Maske haben" -
  // auch von außen aufrufbar (siehe [data-goto-elemente-masttafel] auf der
  // Übersicht-Seite), um direkt in die Masttafel-Detailansicht zu springen.
  window.levelbuildOpenMasttafelInElemente = function () {
    elActiveId = 'masttafel';
    elView = 'detail';
    render();
  };

  // Teilt sich die globale #modal-overlay mit den anderen Seiten-IIFEs
  // (gleiches Muster wie z. B. bei der Fertigstellungsliste), verdrahtet
  // sich aber unabhängig.
  const modalOverlayEl = document.getElementById('modal-overlay');
  const modalTitleEl = document.getElementById('modal-title');
  const modalBodyEl = document.getElementById('modal-body');
  const modalFooterEl = document.getElementById('modal-footer');
  function openModalEl(title, bodyHtml, footerHtml) {
    if (!modalOverlayEl) return;
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = bodyHtml;
    modalFooterEl.innerHTML = footerHtml || '';
    modalOverlayEl.hidden = false;
  }
  function closeModalEl() { if (modalOverlayEl) modalOverlayEl.hidden = true; }

  // Nutzer-Wunsch (Folgeturn 3): "es wird gefragt welche Sammlung wollen sie
  // anlegen dort gibt es eine auswahl von Elementenvorlagen die
  // Projektübergeordnet schon angelegt wurden" - ersetzt das bisherige
  // freie Namens-Modal komplett durch eine Mehrfachauswahl der global
  // angelegten Elementenvorlagen (weiterhin mehrere auf einmal möglich).
  function openVorlagenPickerModal() {
    const templates = loadElementTemplates();
    if (!templates.length) {
      openModalEl('Neue Elementensammlung anlegen', `
        <div class="changelog-empty" style="padding:12px 0;">Es sind noch keine Elementenvorlagen angelegt. Lege zuerst unter Projekte → Vorlagen → Elementenvorlagen ein festes Format an (z. B. Schweißliste), bevor du hier eine Sammlung daraus anlegen kannst.</div>
      `, `
        <button type="button" class="matt-tool-btn" id="el-vorlagen-close">Schließen</button>
        <button type="button" class="btn-primary" id="el-vorlagen-goto">Zu den Elementenvorlagen</button>
      `);
      document.getElementById('el-vorlagen-close').addEventListener('click', closeModalEl);
      document.getElementById('el-vorlagen-goto').addEventListener('click', () => {
        closeModalEl();
        levelbuildGo('projekte');
        setTimeout(() => {
          const tab = document.querySelector('[data-tab="vorlagen"]');
          if (tab) tab.click();
        }, 0);
      });
      return;
    }
    const rowsHtml = templates.map((t) => `
      <label class="col-config-row" style="cursor:pointer;">
        <span style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" data-el-vorlage="${esc(t.id)}">
          <span>
            <div style="font-weight:600;">${esc(t.name)}</div>
            <div style="font-size:12px; color:var(--gray-500);">${(t.columns || []).length} Spalten</div>
          </span>
        </span>
      </label>`).join('');
    openModalEl('Neue Elementensammlung anlegen', `
      <div style="font-size:12px; color:var(--gray-500); margin-bottom:8px;">
        Welche Elementensammlung(en) möchtest du anlegen? Jede übernimmt das feste Format ihrer Vorlage - mehrere sind auf einmal möglich.
      </div>
      <div class="col-config-list">${rowsHtml}</div>
    `, `
      <button type="button" class="matt-tool-btn" id="el-vorlagen-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="el-vorlagen-apply">Anlegen</button>
    `);
    document.getElementById('el-vorlagen-cancel').addEventListener('click', closeModalEl);
    document.getElementById('el-vorlagen-apply').addEventListener('click', () => {
      const checked = Array.from(modalBodyEl.querySelectorAll('[data-el-vorlage]')).filter((cb) => cb.checked).map((cb) => cb.getAttribute('data-el-vorlage'));
      if (!checked.length) { closeModalEl(); return; }
      const list = loadElementensammlungen().filter((s) => s.type !== 'masttafel');
      let lastId = null;
      checked.forEach((vorlageId) => {
        const vorlage = templates.find((t) => t.id === vorlageId);
        if (!vorlage) return;
        const neu = createElementensammlungAusVorlage(vorlage);
        list.push(neu);
        lastId = neu.id;
      });
      saveElementensammlungen(list);
      if (lastId) { elActiveId = lastId; elView = 'detail'; }
      closeModalEl();
      render();
    });
  }

  const addBtn = document.getElementById('el-add-sammlung');
  if (addBtn) addBtn.addEventListener('click', () => openVorlagenPickerModal());

  // Jeder (erneute) Seitenaufruf landet bewusst zuerst auf der Liste (siehe
  // Kommentar bei elView oben) - eigener Einstiegspunkt statt einfach nur
  // render(), damit ein zwischenzeitlich in einer Detailansicht verändertes
  // elView/elActiveId beim nächsten Seitenwechsel zuverlässig zurückgesetzt wird.
  function goToElementeList() {
    elView = 'list';
    elActiveId = null;
    render();
  }
  window.levelbuildOnShowElemente = goToElementeList;

  // Das echte Masttafel-Panel (physisch hierher verschoben, siehe
  // showMasttafelPanel/hideMasttafelPanel) bringt seinen eigenen
  // "Zurück"-Link sowie ein Verkleinern-Icon mit, die ursprünglich nur das
  // Panel selbst versteckt haben (data-collapse-masttafel, weiterhin aktiv
  // und harmlos). Zusätzlich müssen beide jetzt die Elemente-Seite zurück
  // auf die Sammlungen-Liste setzen, sonst bliebe #el-content leer.
  function backToElementeListFromMasttafel() {
    elView = 'list';
    elActiveId = null;
    render();
  }
  const backLinkMatt = document.getElementById('matt-panel-back-link');
  if (backLinkMatt) backLinkMatt.addEventListener('click', backToElementeListFromMasttafel);
  const collapseIconMatt = document.getElementById('matt-panel-collapse-icon');
  if (collapseIconMatt) collapseIconMatt.addEventListener('click', backToElementeListFromMasttafel);

  goToElementeList();
})();

// Kompaktes Masttafel-Widget auf der Übersicht (siehe #overview-default)
// verlinkt jetzt auf die echte, nach Elemente verschobene Maske statt sie
// selbst anzuzeigen: erst zur Elemente-Seite wechseln, dann (im nächsten
// Tick, damit #el-content bereits existiert) die Masttafel-Detailansicht
// öffnen.
document.querySelectorAll('[data-goto-elemente-masttafel]').forEach((el) => {
  el.addEventListener('click', () => {
    levelbuildGo('elemente');
    setTimeout(() => {
      if (window.levelbuildOpenMasttafelInElemente) window.levelbuildOpenMasttafelInElemente();
    }, 0);
  });
});

// ======================================================================
// Einkauf: Material-Positionen anlegen, einem oder mehreren Standorten
// (Masten aus der Masttafel) zuordnen, und zu Bestellungen bündeln. Eine
// Bestellung fasst eine oder mehrere ausgewählte Positionen (inkl. deren
// Standorte) zu einem einzigen Bestell-PDF im Spitzke-Layout zusammen
// (siehe downloadBestellungPDF) - die enthaltenen Positionen gelten danach
// als bestellt und sind dieser Bestellung zugeordnet (pos.bestellungId).
// Nur aktiv, wenn #ek-tbody existiert (Einkauf-Seite). Persistiert
// projekt-gescoped über loadEinkaufPositionen()/loadBestellungen() (siehe
// EINKAUF_KEY/BESTELLUNGEN_KEY weiter oben).
// ======================================================================
(function () {
  const tbodyEl = document.getElementById('ek-tbody');
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
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function linesOf() {
    return Array.prototype.filter.call(arguments, Boolean).join('\n');
  }

  const EK_EINHEIT_OPTIONS = ['Stück', 'Palette', 'lfm', 'm', 'm²', 'm³', 't', 'kg', 'Rolle', 'Satz'];
  function selectOptionsHtml(options, selected) {
    return options.map((o) => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`).join('');
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

  function standorteChipsHtml(list) {
    const arr = list || [];
    if (!arr.length) return '<div class="changelog-empty">Noch keine Standorte zugeordnet.</div>';
    return `<div class="lm-standorte-chips">${arr.map((s) => `<span class="lm-standort-chip">${esc(s)}</span>`).join('')}</div>`;
  }

  // Ankreuz-Auswahl aller im Projekt eingelesenen Masten (über alle
  // Bauabschnitte hinweg) - Einkauf ist bewusst nicht auf einen einzelnen
  // Bauabschnitt beschränkt, da eine Material-Position sich auch auf
  // mehrere Bauabschnitte gleichzeitig beziehen kann.
  function openStandorteAuswahlModal(snapshot) {
    const alle = getMastNummernForBauabschnitt(null);
    const selected = new Set(snapshot.standorte || []);
    const listHtml = alle.length
      ? alle.map((m) => `
        <label class="lm-standort-check-row">
          <input type="checkbox" value="${esc(m)}" ${selected.has(m) ? 'checked' : ''}>
          <span>${esc(m)}</span>
        </label>`).join('')
      : '<div class="changelog-empty">Es wurden noch keine Standorte aus einer Masttafel eingelesen.</div>';
    openModal('Standorte zuordnen', `
      <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:10px;">Bitte die Standorte ankreuzen, die dieser Einkaufsposition zugeordnet werden sollen.</div>
      <div id="ek-standort-check-list">${listHtml}</div>
    `, `
      <button type="button" class="matt-tool-btn" id="ek-standort-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="ek-standort-confirm">Übernehmen</button>
    `);
    document.getElementById('ek-standort-cancel').addEventListener('click', () => openPositionModal(snapshot.id, snapshot));
    document.getElementById('ek-standort-confirm').addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('#ek-standort-check-list input[type="checkbox"]:checked')).map((c) => c.value);
      snapshot.standorte = checked;
      openPositionModal(snapshot.id, snapshot);
    });
  }

  function positionModalHtml(item) {
    return `
      <div class="field">
        <label>Material</label>
        <div class="input-wrap"><input type="text" id="ek-material" value="${esc(item.material || '')}" placeholder="z. B. Stahlrohre 323,9x14,2mm"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Menge</label><div class="input-wrap"><input type="number" step="0.01" id="ek-menge" value="${esc(item.menge != null ? item.menge : '')}"></div></div>
        <div class="field">
          <label>Einheit</label>
          <div class="input-wrap">
            <select id="ek-einheit">${selectOptionsHtml(EK_EINHEIT_OPTIONS, item.einheit || 'Stück')}</select>
            <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
          </div>
        </div>
      </div>
      <div class="field">
        <label>Standorte</label>
        <div id="ek-standorte-list">${standorteChipsHtml(item.standorte)}</div>
        <input type="hidden" id="ek-standorte" value='${esc(JSON.stringify(item.standorte || []))}'>
        <button type="button" class="matt-tool-btn" id="ek-standorte-btn">Standorte zuordnen</button>
      </div>
      <div class="field">
        <label>Notiz</label>
        <div class="input-wrap"><textarea id="ek-notiz" rows="2" class="pe-textarea">${esc(item.notiz || '')}</textarea></div>
      </div>
    `;
  }

  function openPositionModal(id, overrideItem) {
    let item = { material: '', menge: null, einheit: 'Stück', standorte: [], notiz: '', bestellungId: null };
    let title = 'Position hinzufügen';
    if (overrideItem) {
      item = overrideItem;
      title = id ? 'Position bearbeiten' : 'Position hinzufügen';
    } else if (id) {
      const found = loadEinkaufPositionen().find((x) => x.id === id);
      if (found) item = found;
      title = 'Position bearbeiten';
    }
    item.id = id || item.id;
    openModal(title, positionModalHtml(item), `
      <button type="button" class="matt-tool-btn" id="ek-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="ek-save">Speichern</button>
    `);
    document.getElementById('ek-cancel').addEventListener('click', closeModal);
    document.getElementById('ek-standorte-btn').addEventListener('click', () => {
      const snapshot = readPositionModal();
      snapshot.id = id;
      openStandorteAuswahlModal(snapshot);
    });
    document.getElementById('ek-save').addEventListener('click', () => {
      const data = readPositionModal();
      if (!data.material) { alert('Bitte einen Material-Namen eingeben.'); return; }
      const list = loadEinkaufPositionen();
      if (id) {
        const existing = list.find((x) => x.id === id);
        if (existing) Object.assign(existing, data);
      } else {
        list.push(Object.assign({ id: makeEinkaufId(), bestellungId: null, eingekauft: false, eingekauftAm: null, createdAt: new Date().toISOString() }, data));
      }
      saveEinkaufPositionen(list);
      closeModal();
      render();
    });
  }

  function readPositionModal() {
    const material = document.getElementById('ek-material').value.trim();
    const mengeRaw = document.getElementById('ek-menge').value;
    const einheit = document.getElementById('ek-einheit').value;
    let standorte = [];
    try { standorte = JSON.parse(document.getElementById('ek-standorte').value || '[]'); } catch (e) { standorte = []; }
    const notiz = document.getElementById('ek-notiz').value.trim();
    return { material, menge: mengeRaw === '' ? null : parseFloat(mengeRaw), einheit, standorte, notiz };
  }

  // ---------- Auswahl (Checkboxen) für "Bestellung erstellen" ----------
  let selectedIds = new Set();

  function updateBestellungBtn() {
    const btn = document.getElementById('ek-bestellung-btn');
    if (!btn) return;
    btn.textContent = `Bestellung erstellen (${selectedIds.size})`;
    btn.disabled = selectedIds.size === 0;
  }

  // ---------- Tabelle / Filter (Positionen) ----------
  let filters = { material: '', standort: '', status: '' };

  function matchesFilters(pos) {
    if (filters.material && !String(pos.material || '').toLowerCase().includes(filters.material.toLowerCase())) return false;
    if (filters.standort && !(pos.standorte || []).some((s) => String(s).toLowerCase().includes(filters.standort.toLowerCase()))) return false;
    if (filters.status === 'offen' && pos.bestellungId) return false;
    if (filters.status === 'bestellt' && !pos.bestellungId) return false;
    return true;
  }

  function statusChipHtml(pos) {
    return pos.bestellungId
      ? '<span class="tl-status-chip" style="--tl-color:#2f9e58;">Bestellt</span>'
      : '<span class="tl-status-chip" style="--tl-color:#8a94a6;">Offen</span>';
  }

  function render() {
    const crumbEl = document.getElementById('ek-crumb-projekt');
    if (crumbEl) crumbEl.textContent = currentProjectLabel();

    const bestellungenMap = new Map(loadBestellungen().map((b) => [b.id, b]));
    const all = loadEinkaufPositionen().slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    // Ausgewählte IDs, die nicht mehr existieren oder inzwischen bestellt
    // sind (z. B. durch eine parallele Aktion), aus der Auswahl entfernen.
    const stillSelectable = new Set(all.filter((p) => !p.bestellungId).map((p) => p.id));
    Array.from(selectedIds).forEach((id) => { if (!stillSelectable.has(id)) selectedIds.delete(id); });
    updateBestellungBtn();

    const items = all.filter(matchesFilters);
    const countEl = document.getElementById('ek-count');
    if (countEl) countEl.textContent = String(items.length);
    const emptyEl = document.getElementById('ek-empty');
    const wrapEl = document.getElementById('ek-wrap');
    if (!all.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrapEl) wrapEl.hidden = true;
      tbodyEl.innerHTML = '';
      renderBestellungen();
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (wrapEl) wrapEl.hidden = false;
    if (!items.length) {
      tbodyEl.innerHTML = '<tr><td colspan="9" class="changelog-empty" style="padding:14px 0;">Keine Positionen entsprechen den aktuellen Filtern.</td></tr>';
      renderBestellungen();
      return;
    }
    tbodyEl.innerHTML = items.map((pos) => {
      const bestellung = pos.bestellungId ? bestellungenMap.get(pos.bestellungId) : null;
      return `
      <tr data-ek-id="${esc(pos.id)}">
        <td>${pos.bestellungId ? '' : `<input type="checkbox" data-ek-select="${esc(pos.id)}" ${selectedIds.has(pos.id) ? 'checked' : ''}>`}</td>
        <td>${esc(pos.material || '–')}</td>
        <td>${pos.menge != null ? esc(String(pos.menge).replace('.', ',')) : '–'}</td>
        <td>${esc(pos.einheit || '–')}</td>
        <td>${standorteChipsHtml(pos.standorte)}</td>
        <td>${esc(pos.notiz || '–')}</td>
        <td>${statusChipHtml(pos)}</td>
        <td>${bestellung ? esc(bestellung.bestellnummer || '–') : '–'}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="link-action" data-ek-edit="${esc(pos.id)}">Bearbeiten</button>
          <button type="button" class="link-action" data-ek-delete="${esc(pos.id)}" style="color:var(--red);">Löschen</button>
        </td>
      </tr>`;
    }).join('');

    tbodyEl.querySelectorAll('[data-ek-select]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-ek-select');
        if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBestellungBtn();
      });
    });
    tbodyEl.querySelectorAll('[data-ek-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openPositionModal(btn.getAttribute('data-ek-edit')));
    });
    tbodyEl.querySelectorAll('[data-ek-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Diese Einkaufsposition wirklich löschen?')) return;
        const id = btn.getAttribute('data-ek-delete');
        saveEinkaufPositionen(loadEinkaufPositionen().filter((x) => x.id !== id));
        selectedIds.delete(id);
        render();
      });
    });

    renderBestellungen();
  }

  document.querySelectorAll('[data-ek-filter]').forEach((input) => {
    input.addEventListener('input', () => {
      filters[input.getAttribute('data-ek-filter')] = input.value;
      render();
    });
    input.addEventListener('change', () => {
      filters[input.getAttribute('data-ek-filter')] = input.value;
      render();
    });
  });
  const clearBtn = document.getElementById('ek-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filters = { material: '', standort: '', status: '' };
      document.querySelectorAll('[data-ek-filter]').forEach((input) => { input.value = ''; });
      render();
    });
  }
  const addBtn = document.getElementById('ek-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openPositionModal(null));
  const bestellungBtn = document.getElementById('ek-bestellung-btn');
  if (bestellungBtn) {
    bestellungBtn.addEventListener('click', () => {
      if (!selectedIds.size) return;
      openBestellungModal(Array.from(selectedIds));
    });
  }

  // ---------- Bestellungen-Liste ----------
  function renderBestellungen() {
    const list = loadBestellungen().slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const tbody = document.getElementById('ekb-tbody');
    const countEl = document.getElementById('ekb-count');
    const emptyEl = document.getElementById('ekb-empty');
    const wrapEl = document.getElementById('ekb-wrap');
    if (countEl) countEl.textContent = String(list.length);
    if (!list.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrapEl) wrapEl.hidden = true;
      if (tbody) tbody.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (wrapEl) wrapEl.hidden = false;
    if (!tbody) return;
    tbody.innerHTML = list.map((b) => `
      <tr data-ekb-id="${esc(b.id)}">
        <td>${esc(b.bestellnummer || '–')}</td>
        <td>${esc(fmtDatum(b.datumVom))}</td>
        <td>${esc(b.lieferantName || '–')}</td>
        <td>${(b.positionen || []).length}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="link-action" data-ekb-pdf="${esc(b.id)}">PDF herunterladen</button>
          <button type="button" class="link-action" data-ekb-delete="${esc(b.id)}" style="color:var(--red);">Löschen</button>
        </td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-ekb-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = loadBestellungen().find((x) => x.id === btn.getAttribute('data-ekb-pdf'));
        if (b) downloadBestellungPDF(b);
      });
    });
    tbody.querySelectorAll('[data-ekb-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Diese Bestellung wirklich löschen? Die zugehörigen Positionen werden wieder als offen markiert.')) return;
        const id = btn.getAttribute('data-ekb-delete');
        const b = loadBestellungen().find((x) => x.id === id);
        saveBestellungen(loadBestellungen().filter((x) => x.id !== id));
        if (b) {
          const posList = loadEinkaufPositionen();
          (b.positionen || []).forEach((bp) => {
            const p = posList.find((x) => x.id === bp.id);
            if (p && p.bestellungId === id) { p.bestellungId = null; p.eingekauft = false; p.eingekauftAm = null; }
          });
          saveEinkaufPositionen(posList);
        }
        render();
      });
    });
  }

  // ---------- Bestellung-Modal (Kopfdaten erfassen) ----------
  function bestellungModalHtml(positionen) {
    const einstellungen = loadEinkaufEinstellungen();
    const lieferanten = loadLieferanten();
    return `
      <div class="field-row">
        <div class="field"><label>Bestellnummer</label><div class="input-wrap"><input type="text" id="best-nummer" placeholder="z. B. BES-2627-10100080"></div></div>
        <div class="field"><label>Datum vom</label><div class="input-wrap"><input type="date" id="best-datum" value="${esc(todayIso())}"></div></div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field-row">
        <div class="field"><label>Kostenstelle</label><div class="input-wrap"><input type="text" id="best-kostenstelle" value="${esc(einstellungen.kostenstelle)}"></div></div>
        <div class="field"><label>Bauvorhaben</label><div class="input-wrap"><input type="text" id="best-bauvorhaben" value="${esc(einstellungen.bauvorhaben)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Einkäufer Name</label><div class="input-wrap"><input type="text" id="best-einkaeufer-name" value="${esc(einstellungen.einkaeuferName)}"></div></div>
        <div class="field"><label>Einkäufer Telefon</label><div class="input-wrap"><input type="text" id="best-einkaeufer-telefon" value="${esc(einstellungen.einkaeuferTelefon)}"></div></div>
      </div>
      <div class="field"><label>Einkäufer E-Mail</label><div class="input-wrap"><input type="email" id="best-einkaeufer-email" value="${esc(einstellungen.einkaeuferEmail)}"></div></div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field-row">
        <div class="field"><label>Ansprechpartner (intern) Name</label><div class="input-wrap"><input type="text" id="best-ansprechpartner-name"></div></div>
        <div class="field"><label>Ansprechpartner Telefon</label><div class="input-wrap"><input type="text" id="best-ansprechpartner-telefon"></div></div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field">
        <label>Lieferant</label>
        <div class="input-wrap">
          <select id="best-lieferant-select">
            <option value="">– manuell eingeben –</option>
            ${lieferanten.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}
          </select>
          <span class="chev-select"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
      </div>
      <div class="field">
        <label>Lieferant Name</label>
        <div class="input-wrap"><input type="text" id="best-lieferant-name"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Lieferant Straße</label><div class="input-wrap"><input type="text" id="best-lieferant-strasse"></div></div>
        <div class="field"><label>Lieferant PLZ / Ort</label><div class="input-wrap"><input type="text" id="best-lieferant-plzort"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Kontakt Name</label><div class="input-wrap"><input type="text" id="best-kontakt-name"></div></div>
        <div class="field"><label>Kontakt Telefon</label><div class="input-wrap"><input type="text" id="best-kontakt-telefon"></div></div>
      </div>
      <div class="field"><label>Kontakt E-Mail</label><div class="input-wrap"><input type="email" id="best-kontakt-email"></div></div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="subheading" style="margin-bottom:0;">Lieferanschrift</div>
      <div class="field-row">
        <div class="field"><label>Firma</label><div class="input-wrap"><input type="text" id="best-lieferanschrift-firma" value="${esc(einstellungen.lieferanschriftFirma)}"></div></div>
        <div class="field"><label>Zusatz</label><div class="input-wrap"><input type="text" id="best-lieferanschrift-zusatz" value="${esc(einstellungen.lieferanschriftZusatz)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Straße</label><div class="input-wrap"><input type="text" id="best-lieferanschrift-strasse" value="${esc(einstellungen.lieferanschriftStrasse)}"></div></div>
        <div class="field"><label>PLZ / Ort</label><div class="input-wrap"><input type="text" id="best-lieferanschrift-plzort" value="${esc(einstellungen.lieferanschriftPlzOrt)}"></div></div>
      </div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field-row">
        <div class="field"><label>Ihre Referenz</label><div class="input-wrap"><input type="text" id="best-referenz"></div></div>
        <div class="field"><label>Ihre Angebotsnr.</label><div class="input-wrap"><input type="text" id="best-angebotsnr"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Ihr Angebot vom</label><div class="input-wrap"><input type="date" id="best-angebot-vom"></div></div>
        <div class="field"><label>Lieferdatum</label><div class="input-wrap"><input type="date" id="best-lieferdatum"></div></div>
      </div>
      <div class="field"><label>Lieferbedingung</label><div class="input-wrap"><input type="text" id="best-lieferbedingung" placeholder="z. B. ab Werk"></div></div>
      <div class="hr" style="margin:14px 0;"></div>
      <div class="field">
        <label>Positionen (${positionen.length})</label>
        <div style="font-size:12.5px; color:var(--gray-500); line-height:1.6;">
          ${positionen.map((p) => `${esc(p.material)} — ${p.menge != null ? esc(String(p.menge).replace('.', ',')) : '–'} ${esc(p.einheit || '')} (${esc((p.standorte || []).join(', ') || 'keine Standorte')})`).join('<br>')}
        </div>
      </div>
    `;
  }

  function openBestellungModal(positionIds) {
    const allPositions = loadEinkaufPositionen();
    const positionen = positionIds.map((id) => allPositions.find((p) => p.id === id)).filter(Boolean);
    if (!positionen.length) return;
    openModal(`Bestellung erstellen (${positionen.length} Position${positionen.length === 1 ? '' : 'en'})`, bestellungModalHtml(positionen), `
      <button type="button" class="matt-tool-btn" id="best-cancel">Abbrechen</button>
      <button type="button" class="btn-primary" id="best-save">Bestellung erstellen</button>
    `);
    document.getElementById('best-cancel').addEventListener('click', closeModal);
    document.getElementById('best-lieferant-select').addEventListener('change', (e) => {
      const lf = loadLieferanten().find((l) => l.id === e.target.value);
      if (!lf) return;
      document.getElementById('best-lieferant-name').value = lf.name || '';
      document.getElementById('best-lieferant-strasse').value = lf.strasse || '';
      document.getElementById('best-lieferant-plzort').value = lf.plzOrt || '';
      document.getElementById('best-kontakt-name').value = lf.kontaktName || '';
      document.getElementById('best-kontakt-telefon').value = lf.kontaktTelefon || '';
      document.getElementById('best-kontakt-email').value = lf.kontaktEmail || '';
    });
    document.getElementById('best-save').addEventListener('click', () => {
      const bestellnummer = document.getElementById('best-nummer').value.trim();
      if (!bestellnummer) { alert('Bitte eine Bestellnummer eingeben.'); return; }
      const datumVom = document.getElementById('best-datum').value || todayIso();
      const bestellung = {
        id: makeBestellungId(),
        bestellnummer,
        datumVom,
        kostenstelle: document.getElementById('best-kostenstelle').value.trim(),
        bauvorhaben: document.getElementById('best-bauvorhaben').value.trim(),
        einkaeuferName: document.getElementById('best-einkaeufer-name').value.trim(),
        einkaeuferTelefon: document.getElementById('best-einkaeufer-telefon').value.trim(),
        einkaeuferEmail: document.getElementById('best-einkaeufer-email').value.trim(),
        ansprechpartnerName: document.getElementById('best-ansprechpartner-name').value.trim(),
        ansprechpartnerTelefon: document.getElementById('best-ansprechpartner-telefon').value.trim(),
        lieferantId: document.getElementById('best-lieferant-select').value || null,
        lieferantName: document.getElementById('best-lieferant-name').value.trim(),
        lieferantStrasse: document.getElementById('best-lieferant-strasse').value.trim(),
        lieferantPlzOrt: document.getElementById('best-lieferant-plzort').value.trim(),
        kontaktName: document.getElementById('best-kontakt-name').value.trim(),
        kontaktTelefon: document.getElementById('best-kontakt-telefon').value.trim(),
        kontaktEmail: document.getElementById('best-kontakt-email').value.trim(),
        lieferanschriftFirma: document.getElementById('best-lieferanschrift-firma').value.trim(),
        lieferanschriftZusatz: document.getElementById('best-lieferanschrift-zusatz').value.trim(),
        lieferanschriftStrasse: document.getElementById('best-lieferanschrift-strasse').value.trim(),
        lieferanschriftPlzOrt: document.getElementById('best-lieferanschrift-plzort').value.trim(),
        ihreReferenz: document.getElementById('best-referenz').value.trim(),
        ihreAngebotsnr: document.getElementById('best-angebotsnr').value.trim(),
        ihrAngebotVom: document.getElementById('best-angebot-vom').value,
        lieferdatum: document.getElementById('best-lieferdatum').value,
        lieferbedingung: document.getElementById('best-lieferbedingung').value.trim(),
        druckdatum: todayIso(),
        positionen: positionen.map((p) => ({ id: p.id, material: p.material, menge: p.menge, einheit: p.einheit, standorte: (p.standorte || []).slice() })),
        createdAt: new Date().toISOString(),
      };
      const bestellungen = loadBestellungen();
      bestellungen.push(bestellung);
      saveBestellungen(bestellungen);

      const posList = loadEinkaufPositionen();
      positionIds.forEach((id) => {
        const p = posList.find((x) => x.id === id);
        if (p) { p.bestellungId = bestellung.id; p.eingekauft = true; p.eingekauftAm = datumVom; }
      });
      saveEinkaufPositionen(posList);

      selectedIds.clear();
      closeModal();
      render();
      downloadBestellungPDF(bestellung);
    });
  }

  // ---------- Bestellung-PDF (Spitzke-Layout) ----------
  function downloadBestellungPDF(bestellung) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Die PDF-Erstellung konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 50;
    const grayLine = [200, 204, 210];

    // Briefkopf-Logo oben rechts (fest hinterlegtes Firmenlogo)
    const logoWidth = 128;
    const logoHeight = Math.round(logoWidth * (310 / 264));
    try {
      doc.addImage('data:image/png;base64,' + EINKAUF_LOGO_BASE64, 'PNG', pageWidth - marginX - logoWidth, 32, logoWidth, logoHeight);
    } catch (e) { /* z. B. in Testumgebungen ohne echtes Bild-Decoding - unkritisch */ }

    // Lieferant-Adresse oben links (Empfängerfeld)
    let y = 64;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    [bestellung.lieferantName, bestellung.lieferantStrasse, bestellung.lieferantPlzOrt].filter(Boolean).forEach((line) => {
      doc.text(line, marginX, y);
      y += 13;
    });

    // Überschrift
    const headY = 190;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Bestellung Nr. ${bestellung.bestellnummer || ''} vom ${fmtDatum(bestellung.datumVom)}`, marginX, headY);

    // Gerahmte Kopfdaten-Tabelle (2x2-Feldgruppen, per rowSpan analog zur
    // Referenzvorlage: Einkäufer spannt Kostenstelle+Bauvorhaben,
    // Lieferanschrift spannt Referenz/Angebotsnr./Angebot vom).
    const bold = (content, extra) => Object.assign({ content, styles: { fontStyle: 'bold' } }, extra || {});
    const rows = [
      [bold('Kostenstelle'), bestellung.kostenstelle || '', bold('Einkäufer', { rowSpan: 2 }), { content: linesOf(bestellung.einkaeuferName, bestellung.einkaeuferTelefon, bestellung.einkaeuferEmail), rowSpan: 2 }],
      [bold('Bauvorhaben'), bestellung.bauvorhaben || ''],
      [bold('Ansprechpartner'), linesOf(bestellung.ansprechpartnerName, bestellung.ansprechpartnerTelefon), bold('Kontakt'), linesOf(bestellung.kontaktName, bestellung.kontaktTelefon, bestellung.kontaktEmail)],
      [bold('Lieferanschrift', { rowSpan: 3 }), { content: linesOf(bestellung.lieferanschriftFirma, bestellung.lieferanschriftZusatz, bestellung.lieferanschriftStrasse, bestellung.lieferanschriftPlzOrt), rowSpan: 3 }, bold('Ihre Referenz'), bestellung.ihreReferenz || ''],
      [bold('Ihre Angebotsnr.'), bestellung.ihreAngebotsnr || ''],
      [bold('Ihr Angebot vom'), bestellung.ihrAngebotVom ? fmtDatum(bestellung.ihrAngebotVom) : ''],
      [bold('Lieferdatum'), fmtDatum(bestellung.lieferdatum), bold('Druckdatum'), fmtDatum(bestellung.druckdatum)],
      [bold('Lieferbedingung'), bestellung.lieferbedingung || ''],
    ];
    doc.autoTable({
      startY: headY + 16,
      margin: { left: marginX, right: marginX },
      body: rows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 6, textColor: [20, 22, 26], lineColor: grayLine, lineWidth: 0.6, valign: 'top', overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 154 }, 2: { cellWidth: 92 }, 3: { cellWidth: 154 } },
    });

    // Linienlose Positionstabelle - je Position eine Zeile mit Bezeichnung/
    // Menge/Einheit, direkt darunter die zugehörigen Standorte.
    let posY = doc.lastAutoTable.finalY + 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Bestellte Positionen', marginX, posY);

    const posBody = [];
    (bestellung.positionen || []).forEach((p) => {
      posBody.push([p.material || '–', p.menge != null ? String(p.menge).replace('.', ',') : '–', p.einheit || '–']);
      posBody.push([{ content: 'Standorte: ' + ((p.standorte || []).join(', ') || '–'), colSpan: 3, styles: { fontStyle: 'italic', textColor: [110, 118, 132], fontSize: 8.5 } }]);
    });
    doc.autoTable({
      startY: posY + 10,
      margin: { left: marginX, right: marginX },
      head: [['Bezeichnung', 'Menge', 'Einheit']],
      body: posBody,
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: { top: 4, bottom: 4, left: 0, right: 8 }, textColor: [20, 22, 26], overflow: 'linebreak' },
      headStyles: { fontStyle: 'bold', fontSize: 9.5 },
      columnStyles: { 1: { cellWidth: 70 }, 2: { cellWidth: 70 } },
    });

    doc.save(`Bestellung_${(bestellung.bestellnummer || 'ohne-Nummer').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`);
  }

  window.levelbuildOnShowEinkauf = render;
  render();
})();
