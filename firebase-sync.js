/* =========================================================================
   Intra - Firebase-Anbindung
   =========================================================================
   Zwei Aufgaben in einer Datei:

   1) LOGIN: Vor der eigentlichen App (intra.html / handyapp.html) wird
      ein Vollbild-Overlay mit E-Mail/Passwort-Login gezeigt. Erst nach
      erfolgreichem Login wird das Overlay entfernt.

   2) CLOUD-ABGLEICH: Alle bisherigen localStorage-Daten (Projekte,
      Masttafel, Protokolle, ...) werden automatisch mit einer gemeinsamen
      Firestore-Datenbank abgeglichen, damit PC und jedes Handy dieselben,
      aktuellen Daten sehen - ohne dass app.js/handyapp.js dafür verändert
      werden mussten. Große eingebettete Fotos/Dokumente (Base64-Data-URLs)
      werden dabei automatisch nach Firebase Storage ausgelagert (Firestore
      erlaubt maximal 1 MB pro Dokument), die App selbst merkt davon nichts,
      weil an ihrer Stelle einfach ein Link auf die Datei gespeichert wird.

   Technischer Ablauf, kurz zusammengefasst:
   - localStorage.setItem/removeItem werden "umhüllt" (nicht ersetzt): die
     App schreibt weiterhin ganz normal lokal, zusätzlich wird im Hintergrund
     (leicht verzögert, gesammelt) derselbe Schlüssel zu Firestore hochgeladen.
   - Beim ersten Login auf einem Gerät wird entweder (a) die Cloud-Datenbank
     erstmalig mit den schon vorhandenen lokalen Daten befüllt (falls die
     Cloud noch leer ist - Schutz vor Datenverlust beim Umstieg), oder (b)
     der aktuelle Cloud-Stand lokal übernommen. intra.html/handyapp.js warten
     mit ihrem allerersten Rendern auf window.intraUserReady, damit die App
     direkt mit den frischen Daten startet - kein Neuladen der Seite nötig.
   - Ändert sich etwas auf einem ANDEREN Gerät, wird das per Firestore-
     Echtzeit-Listener erkannt und die Seite lädt automatisch neu.
   ========================================================================= */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyA-MRmPOJV5HkMeLX3HdwHkAD4v4TsL2T8",
    authDomain: "intra-cd86e.firebaseapp.com",
    projectId: "intra-cd86e",
    storageBucket: "intra-cd86e.firebasestorage.app",
    messagingSenderId: "561313924463",
    appId: "1:561313924463:web:aef91beb08864be695949a",
    measurementId: "G-YM15L5LV02"
  };

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var storage = firebase.storage();

  var SYNC_COLLECTION = 'sync_data';
  var BLOB_SIZE_THRESHOLD = 40 * 1024; // ab 40 KB wird ein Base64-Feld ausgelagert
  var MAX_DOC_CHARS = 900000; // Sicherheitsabstand zum 1-MB-Firestore-Limit

  // -----------------------------------------------------------------------
  // Diagnose-Protokoll: Nutzer-Wunsch "füge irgendwas ein wo du immer genau
  // sehen kannst was ich gemacht habe und wann und wie ... so dass du immer
  // selber auslesen kannst" - da Claude keinen Login/Firebase-Console-Zugriff
  // hat, schreibt die App jeden wichtigen Schritt (Aktion UND Sync-Versuch
  // mit Erfolg/Fehlergrund) mit.
  //
  // WICHTIG (Bugfix "Handy zeigt nur PC-Einträge im Diagnose-Protokoll"):
  // ursprünglich schrieben ALLE Geräte in EINEN gemeinsamen Schlüssel
  // (levelbuild_debug_log) - jedes Gerät las die komplette Liste, hängte
  // seinen eigenen Eintrag an und schrieb die GANZE Liste zurück. Das ist
  // ein klassisches "Lost Update"-Problem: schreibt Gerät A kurz nachdem
  // Gerät B etwas hochgeladen hat, aber BEVOR A's lokale Kopie den über den
  // Firestore-Listener nachgelieferten Eintrag von B schon übernommen hat,
  // überschreibt A's nächster Schreibvorgang B's Einträge komplett. Bei
  // vielen schnellen Schreibvorgängen auf einem Gerät (z.B. PC bleibt offen
  // und speichert wiederholt) verliert das andere Gerät praktisch immer.
  // Fix: jedes Gerät bekommt eine eigene, stabile Geräte-ID und schreibt NUR
  // noch in seinen EIGENEN Schlüssel (levelbuild_debug_log__<id>) - dadurch
  // kann sich kein Gerät mehr gegenseitig überschreiben. Zur Anzeige werden
  // alle vorhandenen Geräte-Protokolle zusammengeführt, siehe
  // window.intraGetDebugLog() weiter unten.
  var DEBUG_LOG_PREFIX = 'levelbuild_debug_log__';
  var DEBUG_LOG_MAX = 400;
  function deviceLabel() {
    return /handyapp\.html/i.test(location.pathname) ? 'Handy' : 'PC';
  }
  var DEVICE_ID = (function () {
    var idKey = '__intra_device_id';
    var id;
    try { id = localStorage.getItem(idKey); } catch (e) { id = null; }
    if (!id) {
      id = deviceLabel() + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(idKey, id); } catch (e) { /* ignore */ }
    }
    return id;
  })();
  var DEVICE_DEBUG_LOG_KEY = DEBUG_LOG_PREFIX + DEVICE_ID;
  function logDebugEvent(action, detail, ok) {
    try {
      var list;
      try { list = JSON.parse(localStorage.getItem(DEVICE_DEBUG_LOG_KEY) || '[]'); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.push({
        ts: new Date().toISOString(),
        device: deviceLabel(),
        user: (auth.currentUser && auth.currentUser.email) || null,
        action: action,
        detail: detail || '',
        ok: (ok === undefined || ok === null) ? null : !!ok,
      });
      if (list.length > DEBUG_LOG_MAX) list = list.slice(list.length - DEBUG_LOG_MAX);
      localStorage.setItem(DEVICE_DEBUG_LOG_KEY, JSON.stringify(list));
    } catch (e) { /* Diagnose-Protokoll darf die App nie zum Absturz bringen */ }
  }
  window.intraLogEvent = logDebugEvent;
  // Führt die Protokolle ALLER bekannten Geräte (jeweils eigener
  // levelbuild_debug_log__*-Schlüssel) zu einer einzigen, zeitlich
  // sortierten Liste zusammen - für die Diagnose-Ansicht in app.js/
  // handyapp.js, damit dort trotz getrennter Schlüssel weiterhin EIN
  // Protokoll mit den Einträgen aller Geräte zu sehen ist.
  window.intraGetDebugLog = function () {
    var merged = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(DEBUG_LOG_PREFIX) === 0) {
          try {
            var part = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(part)) merged = merged.concat(part);
          } catch (e) { /* einzelnes defektes Geräte-Protokoll ignorieren */ }
        }
      }
      merged.sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    } catch (e) { /* ignore */ }
    return merged;
  };

  // -----------------------------------------------------------------------
  // Overlay: Login-Formular + Ladeanzeige
  // -----------------------------------------------------------------------
  var styleTag = document.createElement('style');
  styleTag.textContent = [
    '#lb-auth-overlay{position:fixed;inset:0;z-index:999999;background:linear-gradient(160deg,#eef2fb,#f7f8fa);',
    'display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
    '#lb-auth-box{width:100%;max-width:340px;background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 20px 50px rgba(20,22,28,.14);}',
    '#lb-auth-box h1{font-size:19px;font-weight:800;color:#1d2433;margin:0 0 4px;letter-spacing:-0.01em;}',
    '#lb-auth-box p.lb-sub{font-size:13px;color:#667085;margin:0 0 20px;line-height:1.4;}',
    '#lb-auth-box label{display:block;font-size:12px;font-weight:700;color:#344054;margin:0 0 6px;}',
    '#lb-auth-box input{width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:10px;padding:11px 12px;font-size:14px;margin-bottom:14px;outline:none;transition:border-color .15s ease,box-shadow .15s ease;}',
    '#lb-auth-box input:focus{border-color:#2f6fed;box-shadow:0 0 0 3px #eaf2ff;}',
    '#lb-auth-box button{width:100%;background:linear-gradient(135deg,#2f6fed 0%,#1d4fb8 100%);color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px -3px rgba(47,111,237,.5);}',
    '#lb-auth-box button:active{transform:scale(0.98);}',
    '#lb-auth-error{color:#e0432b;font-size:12.5px;margin:-6px 0 14px;line-height:1.4;display:none;}',
    '#lb-auth-error.show{display:block;}',
    '#lb-auth-loading{display:flex;flex-direction:column;align-items:center;gap:14px;color:#667085;font-size:13.5px;text-align:center;}',
    '.lb-spinner{width:34px;height:34px;border-radius:50%;border:3px solid #e4e7ec;border-top-color:#2f6fed;animation:lb-spin .8s linear infinite;}',
    '@keyframes lb-spin{to{transform:rotate(360deg);}}'
  ].join('');
  document.head.appendChild(styleTag);

  var overlay = document.createElement('div');
  overlay.id = 'lb-auth-overlay';

  function renderLoading(message) {
    overlay.innerHTML =
      '<div id="lb-auth-loading">' +
      '<div class="lb-spinner"></div>' +
      '<div>' + escapeHtml(message || 'Bitte warten…') + '</div>' +
      '</div>';
  }

  function renderLoginForm(errorMessage) {
    overlay.innerHTML =
      '<div id="lb-auth-box">' +
      '<h1>Intra</h1>' +
      '<p class="lb-sub">Bitte anmelden, um auf die gemeinsamen Projektdaten zuzugreifen.</p>' +
      '<div id="lb-auth-error" class="' + (errorMessage ? 'show' : '') + '">' + escapeHtml(errorMessage || '') + '</div>' +
      '<form id="lb-auth-form">' +
      '<label for="lb-auth-email">E-Mail</label>' +
      '<input id="lb-auth-email" type="email" autocomplete="username" required>' +
      '<label for="lb-auth-pass">Passwort</label>' +
      '<input id="lb-auth-pass" type="password" autocomplete="current-password" required>' +
      '<button type="submit">Anmelden</button>' +
      '</form>' +
      '</div>';
    var form = document.getElementById('lb-auth-form');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = document.getElementById('lb-auth-email').value.trim();
      var pass = document.getElementById('lb-auth-pass').value;
      renderLoading('Anmeldung läuft…');
      auth.signInWithEmailAndPassword(email, pass).catch(function (err) {
        renderLoginForm(loginErrorMessage(err));
      });
    });
  }

  function loginErrorMessage(err) {
    var code = err && err.code;
    if (code === 'auth/invalid-email') return 'Ungültige E-Mail-Adresse.';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'E-Mail oder Passwort falsch.';
    }
    if (code === 'auth/too-many-requests') return 'Zu viele Versuche. Bitte kurz warten und erneut versuchen.';
    if (code === 'auth/network-request-failed') return 'Keine Internetverbindung.';
    return 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mountOverlay() {
    renderLoading('Wird geladen…');
    document.body.appendChild(overlay);
    document.documentElement.style.visibility = '';
  }
  if (document.body) {
    mountOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', mountOverlay);
  }

  function hideOverlay() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // -----------------------------------------------------------------------
  // localStorage "umhüllen": jeder Schreibvorgang der App landet weiterhin
  // ganz normal lokal, wird zusätzlich (verzögert) zu Firestore hochgeladen.
  // -----------------------------------------------------------------------
  var isHydrating = false;
  var origSetItem = localStorage.setItem.bind(localStorage);
  var origRemoveItem = localStorage.removeItem.bind(localStorage);
  var pendingUploads = {};

  // -----------------------------------------------------------------------
  // Dauerhafte Warteschlange ("dieser Schlüssel muss noch hochgeladen
  // werden") - Nutzer-Meldung: "hab genau das wie vorhin gemacht" + "es
  // wurde zurückgesetzt" (die App lud neu, bevor die Daten ankamen). Der
  // GRUNDLEGENDE Fehler: pendingUploads oben lebt nur im Arbeitsspeicher
  // dieser einen Seitenansicht. Lädt die Seite neu - ob durch die App selbst
  // (initialSync()/scheduleReload() unten) oder weil iOS/Android eine im
  // Hintergrund liegende Browser-Seite beendet, was auf dem Handy sehr
  // schnell nach dem Speichern passieren kann - ist dieser Zwischenspeicher
  // komplett weg. Die Daten selbst bleiben zwar sicher in localStorage (das
  // übersteht einen Reload), aber NICHTS erinnert sich mehr daran, dass sie
  // noch hochgeladen werden müssen - der 700ms-Timer bzw. der pagehide-
  // Sofort-Upload (siehe flushPendingUploads) sind beide bereits Geschichte.
  // Fix: JEDE geplante Änderung wird zusätzlich SOFORT (synchron, per
  // origSetItem - bewusst nicht der öffentliche localStorage.setItem, sonst
  // würde sich diese Warteschlange selbst als "zu synchronisieren" eintragen)
  // in einem eigenen, dauerhaften Schlüssel vermerkt. Bei jedem App-Start
  // (retryPendingQueueOnStartup(), aufgerufen bevor überhaupt Cloud-Daten
  // gezogen werden) wird diese Liste zuerst abgearbeitet - unabhängig davon,
  // ob die vorherige Seitenansicht sauber beendet wurde oder abrupt verschwand.
  var PENDING_QUEUE_KEY = '__intra_pending_sync_keys';
  function loadPendingQueue() {
    try {
      var q = JSON.parse(origGetItem(PENDING_QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
  }
  function origGetItem(key) { return localStorage.getItem(key); } // getItem wird nie umhüllt, rein zur Konsistenz benannt
  function markPendingInQueue(key) {
    try {
      var q = loadPendingQueue();
      if (q.indexOf(key) === -1) { q.push(key); origSetItem(PENDING_QUEUE_KEY, JSON.stringify(q)); }
    } catch (e) { /* ignore */ }
  }
  function unmarkPendingInQueue(key) {
    try {
      var q = loadPendingQueue().filter(function (k) { return k !== key; });
      origSetItem(PENDING_QUEUE_KEY, JSON.stringify(q));
    } catch (e) { /* ignore */ }
  }

  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (isHydrating) return;
    scheduleUpload(key, value);
  };
  localStorage.removeItem = function (key) {
    origRemoveItem(key);
    if (isHydrating) return;
    scheduleDelete(key);
  };

  function docIdFor(key) {
    return String(key).replace(/\//g, '_').slice(0, 1500);
  }

  // Verfolgt alle GERADE laufenden Uploads (egal welcher Schlüssel) - Basis
  // für window.intraWaitForPendingUploads() weiter unten: die Handy-App
  // kann damit vor dem Schließen eines Formulars aktiv abwarten, bis der
  // Upload wirklich bestätigt ist, statt sich auf einen unsichtbaren
  // Hintergrundvorgang zu verlassen (Nutzer-Idee: "füge vielleicht
  // Ladebildschirm hinzu welcher erst schließen wenn hochgeladen ist").
  var inFlightUploads = [];
  function runUpload(key, value, reason) {
    var p = uploadKey(key, value).then(function () {
      unmarkPendingInQueue(key);
      if (key !== DEVICE_DEBUG_LOG_KEY) logDebugEvent('sync_upload', key + ' (' + reason + ')', true);
    }).catch(function (e) {
      // Bewusst NICHT aus der Warteschlange entfernt - ein fehlgeschlagener
      // Versuch bleibt vorgemerkt und wird beim nächsten App-Start erneut
      // versucht (retryPendingQueueOnStartup), statt verloren zu gehen.
      console.warn('Intra-Sync: Hochladen fehlgeschlagen für', key, e);
      if (key !== DEVICE_DEBUG_LOG_KEY) logDebugEvent('sync_upload', key + ' (' + reason + '): ' + (e && e.message ? e.message : e), false);
    });
    inFlightUploads.push(p);
    p.then(function () {
      var idx = inFlightUploads.indexOf(p);
      if (idx !== -1) inFlightUploads.splice(idx, 1);
    });
    return p;
  }
  // Wartet, bis alle GERADE anstehenden/laufenden Uploads abgeschlossen sind
  // (egal ob Erfolg oder Fehler - Fehler bleiben ohnehin in der dauerhaften
  // Warteschlange und werden automatisch nachgeholt). Löst zuerst noch
  // wartende 700ms-Debounce-Timer sofort aus (wie flushPendingUploads),
  // damit nichts unnötig lange in der Warteschleife hängt. timeoutMs
  // begrenzt die maximale Wartezeit (Standard 20s) - läuft die Zeit ab,
  // wird trotzdem aufgelöst (mit false), damit die UI nicht für immer
  // hängen bleibt; der Upload läuft im Hintergrund weiter bzw. wird beim
  // nächsten App-Start automatisch nachgeholt.
  window.intraWaitForPendingUploads = function (timeoutMs) {
    flushPendingUploads();
    var settle = Promise.all(inFlightUploads.slice()).then(function () { return true; });
    var ms = timeoutMs || 20000;
    return Promise.race([
      settle,
      new Promise(function (resolve) { setTimeout(function () { resolve(false); }, ms); }),
    ]);
  };
  function scheduleUpload(key, value) {
    if (key !== PENDING_QUEUE_KEY) markPendingInQueue(key);
    if (pendingUploads[key]) clearTimeout(pendingUploads[key].timer);
    var entry = { value: value, timer: null };
    entry.timer = setTimeout(function () {
      delete pendingUploads[key];
      runUpload(key, value, 'Timer');
    }, 700);
    pendingUploads[key] = entry;
  }

  // Nutzer-gemeldeter Bug: ein Foto in einem Protokoll aufgenommen und eine
  // Tätigkeit abgehakt, lokal auf dem Handy blieb es erhalten, in der Cloud
  // (und damit auf der Web-Version) kam es aber nie an, ganz ohne
  // Fehlermeldung. Ursache: scheduleUpload() wartet bewusst 700ms, bevor der
  // eigentliche Upload überhaupt startet (mehrere schnelle Änderungen am
  // selben Schlüssel sollen sich zu einem Upload bündeln) - verlässt man die
  // Seite (App-Wechsel, Bildschirm sperren, Tab schließen) innerhalb dieser
  // 700ms, pausiert/verwirft der Browser diesen Timer, der Upload startet
  // dann nie. Deshalb hier zusätzlich: sobald die Seite in den Hintergrund
  // geht oder geschlossen wird, alle noch wartenden Uploads SOFORT auslösen,
  // statt auf den Timer zu warten. Keine 100%-Garantie (ein bereits
  // begonnener Netzwerk-Request kann bei einem harten Schließen trotzdem
  // abbrechen - DESHALB zusätzlich die dauerhafte Warteschlange oben, die
  // genau diesen Rest-Fall beim nächsten App-Start nachholt), aber deckt den
  // weit häufigeren Fall ab, dass die Seite nach dem Speichern normal
  // verlassen/in den Hintergrund geschickt wird.
  function flushPendingUploads() {
    Object.keys(pendingUploads).forEach(function (key) {
      var entry = pendingUploads[key];
      clearTimeout(entry.timer);
      delete pendingUploads[key];
      runUpload(key, entry.value, 'Sofort - Seite verlassen');
    });
  }
  // Beim App-Start aufgerufen (vor initialSync/pullAllFromCloud): jeder noch
  // offene Posten aus einer vorherigen, abgebrochenen Sitzung wird mit dem
  // AKTUELLEN localStorage-Wert (der einen Reload/Absturz übersteht) erneut
  // hochgeladen. Läuft bewusst VOR dem Cloud-Abgleich, damit ein lokal noch
  // nicht hochgeladener Stand nicht durch einen älteren Cloud-Stand verdeckt
  // wird, und wird abgewartet, bevor initialSync ggf. neu lädt.
  function retryPendingQueueOnStartup() {
    var queue = loadPendingQueue();
    if (!queue.length) return Promise.resolve();
    logDebugEvent('sync_retry_queue', queue.length + ' offene(r) Posten aus vorheriger Sitzung: ' + queue.join(', '), null);
    return Promise.all(queue.map(function (key) {
      var value = localStorage.getItem(key);
      if (value == null) { unmarkPendingInQueue(key); return Promise.resolve(); }
      return runUpload(key, value, 'Wiederholung nach Neustart');
    }));
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushPendingUploads();
  });
  window.addEventListener('pagehide', flushPendingUploads);

  function scheduleDelete(key) {
    if (pendingUploads[key]) { clearTimeout(pendingUploads[key].timer); delete pendingUploads[key]; }
    db.collection(SYNC_COLLECTION).doc(docIdFor(key)).delete().then(function () {
      logDebugEvent('sync_delete', key, true);
    }).catch(function (e) {
      console.warn('Intra-Sync: Löschen fehlgeschlagen für', key, e);
      logDebugEvent('sync_delete', key + ': ' + (e && e.message ? e.message : e), false);
    });
  }

  // Läuft rekursiv durch ein geparstes JSON-Objekt und sammelt alle
  // Base64-Data-URL-Felder oberhalb der Größenschwelle (Pfad + Wert).
  function collectBlobs(value, path, out) {
    if (typeof value === 'string') {
      if (value.length > BLOB_SIZE_THRESHOLD && /^data:[^;]+;base64,/.test(value)) {
        out.push({ path: path.slice(), value: value });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectBlobs(value[i], path.concat(i), out);
      return;
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) { collectBlobs(value[k], path.concat(k), out); });
    }
  }

  function setAtPath(root, path, newValue) {
    var node = root;
    for (var i = 0; i < path.length - 1; i++) node = node[path[i]];
    node[path[path.length - 1]] = newValue;
  }

  function uploadDataUrlToStorage(dataUrl, hintPath) {
    return fetch(dataUrl)
      .then(function (res) { return res.blob(); })
      .then(function (blob) {
        var safeName = hintPath.join('_').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
        var id = safeName + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var ref = storage.ref().child('synced_blobs/' + id);
        return ref.put(blob).then(function () { return ref.getDownloadURL(); });
      });
  }

  // Lädt einen einzelnen localStorage-Schlüssel zu Firestore hoch. Große
  // eingebettete Fotos/Dokumente werden vorher nach Storage ausgelagert -
  // NUR in der Kopie, die zu Firestore geht (die lokale Kopie im Browser
  // bleibt unverändert, damit sich am bisherigen Verhalten der App nichts
  // ändert).
  function uploadKey(key, rawValue) {
    var parsed;
    try { parsed = JSON.parse(rawValue); }
    catch (e) { return saveDocForKey(key, rawValue); }

    var blobs = [];
    collectBlobs(parsed, [], blobs);
    if (blobs.length === 0) return saveDocForKey(key, rawValue);

    var clone = JSON.parse(rawValue);
    var blobFailures = [];
    var uploads = blobs.map(function (b) {
      return uploadDataUrlToStorage(b.value, [key].concat(b.path))
        .then(function (url) { setAtPath(clone, b.path, url || ''); })
        .catch(function (e) {
          console.warn('Intra-Sync: Storage-Upload fehlgeschlagen für', key, b.path, e);
          blobFailures.push(b.path.join('.') + ': ' + (e && e.message ? e.message : e));
          setAtPath(clone, b.path, '');
        });
    });
    return Promise.all(uploads).then(function () {
      if (blobFailures.length) {
        logDebugEvent('sync_blob_upload', key + ' - ' + blobFailures.length + ' von ' + blobs.length + ' Datei(en) fehlgeschlagen: ' + blobFailures.join(' | '), false);
      } else if (blobs.length) {
        logDebugEvent('sync_blob_upload', key + ' - ' + blobs.length + ' Datei(en) hochgeladen', true);
      }
      return saveDocForKey(key, JSON.stringify(clone));
    });
  }

  // WICHTIG: wirft absichtlich weiter (kein eigenes .catch() mehr hier) -
  // der Aufrufer (runUpload) protokolliert Erfolg/Misserfolg zentral im
  // Diagnose-Log; ein hier verschluckter Fehler wäre dort nie sichtbar
  // gewesen (genau das hat die Fehlersuche beim Nutzer erschwert: der Fehler
  // landete nur in der Browser-Konsole, die niemand außer ihm selbst sieht).
  function saveDocForKey(key, valueString) {
    if (valueString.length > MAX_DOC_CHARS) {
      var msg = 'übersprungen - zu groß für Firestore (' + valueString.length + ' Zeichen, Limit ' + MAX_DOC_CHARS + ')';
      console.warn('Intra-Sync:', msg, key);
      return Promise.reject(new Error(msg));
    }
    return db.collection(SYNC_COLLECTION).doc(docIdFor(key)).set({
      key: key,
      value: valueString,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (auth.currentUser && auth.currentUser.email) || null
    });
  }

  // -----------------------------------------------------------------------
  // Erststart: Cloud leer -> lokale Daten hochladen (Schutz vor Datenverlust).
  // Cloud hat schon Daten -> lokal übernehmen + einmalig neu laden.
  // -----------------------------------------------------------------------
  function seedCloudFromLocalStorage() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    var chain = Promise.resolve();
    keys.forEach(function (key) {
      // PENDING_QUEUE_KEY ist reine, geräte-lokale Buchhaltung (welche
      // Schlüssel auf DIESEM Gerät noch hochgeladen werden müssen) - hat in
      // der gemeinsamen Cloud-Datenbank nichts verloren. Ohne diese Ausnahme
      // würde ein Erststart (leere Cloud) sie versehentlich mit hochladen,
      // und jede spätere lokale Änderung daran (die den normalen
      // localStorage.setItem-Wrapper bewusst umgeht, siehe markPendingInQueue)
      // würde auf ANDEREN Geräten als "änderte sich remote" ankommen, ohne
      // je wieder aktualisiert zu werden - ein stiller Karteileichen-Eintrag.
      if (key === PENDING_QUEUE_KEY) return;
      chain = chain.then(function () {
        var value = localStorage.getItem(key);
        if (value == null) return;
        return uploadKey(key, value);
      });
    });
    return chain;
  }

  function pullAllFromCloud() {
    return db.collection(SYNC_COLLECTION).get().then(function (snap) {
      isHydrating = true;
      try {
        snap.forEach(function (doc) {
          var data = doc.data();
          if (data && typeof data.value === 'string') {
            var lsKey = data.key || doc.id;
            origSetItem(lsKey, data.value);
          }
        });
      } finally {
        isHydrating = false;
      }
    });
  }

  // WICHTIG (Fehlerursache des Nutzer-gemeldeten Bugs "Handy speichert
  // erfolgreich, PC zeigt trotzdem den alten Stand"): intra.html/handyapp.js
  // rendern ihre allererste Seite/Ansicht GANZ AM ENDE ihres eigenen
  // <script>-Blocks, also synchron und SOFORT beim Laden - unabhängig davon,
  // ob diese Funktion hier (asynchron, ein Firestore-Roundtrip) schon fertig
  // ist. Früher wurde dieses Wettrennen mit einem einmaligen location.reload()
  // "gelöst" (sessionStorage-Flag, damit es nicht in eine Endlosschleife
  // läuft) - das Problem dabei: das Flag blieb für den GESAMTEN Browser-Tab
  // gesetzt, also fand dieser Reload nur beim allerersten Laden der Seite in
  // dieser Sitzung statt. Bei JEDEM weiteren Neuladen (z.B. ausgelöst vom
  // Echtzeit-Listener unten, weil sich auf einem anderen Gerät etwas
  // geändert hat) wurde zwar der frische Cloud-Stand ganz normal in
  // localStorage geschrieben, aber die Seite hatte sich bereits VORHER (mit
  // den noch alten, nicht aktualisierten Werten) fertig gerendert - und weil
  // kein weiterer Reload mehr erzwungen wurde, blieb genau dieser veraltete
  // Stand sichtbar stehen, obwohl in localStorage (und in der Cloud) längst
  // die richtigen Daten lagen. Der eigentliche Fix: kein Reload mehr nötig -
  // intra.html/handyapp.js warten jetzt stattdessen mit ihrem allerersten
  // Rendern auf window.intraUserReady (wird erst erfüllt, NACHDEM diese
  // Funktion hier fertig ist), sodass die erste Anzeige garantiert schon die
  // frischen, gerade übernommenen Cloud-Daten zeigt.
  function initialSync() {
    return db.collection(SYNC_COLLECTION).limit(1).get().then(function (snap) {
      if (snap.empty) {
        renderLoading('Erststart: vorhandene Daten werden in die Cloud übertragen…');
        logDebugEvent('login_sync', 'Erststart - Cloud leer, lade lokale Daten hoch', true);
        return seedCloudFromLocalStorage();
      }
      renderLoading('Daten werden geladen…');
      logDebugEvent('login_sync', 'Cloud hat Daten - übernehme Cloud-Stand lokal', true);
      return pullAllFromCloud();
    });
  }

  // -----------------------------------------------------------------------
  // Laufender Abgleich: Änderungen von anderen Geräten übernehmen und die
  // Seite neu laden, damit die App die neuen Daten sicher anzeigt.
  // -----------------------------------------------------------------------
  var reloadTimer = null;
  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(function () { location.reload(); }, 1200);
  }

  function startRealtimeListener() {
    db.collection(SYNC_COLLECTION).onSnapshot(function (snap) {
      var changedRemotely = false;
      var changedKeys = [];
      snap.docChanges().forEach(function (change) {
        if (change.doc.metadata.hasPendingWrites) return; // eigener, noch unbestätigter Schreibvorgang
        var data = change.doc.data();
        var lsKey = (data && data.key) || change.doc.id;
        // WICHTIG: kein Diagnose-Protokoll-Schlüssel (levelbuild_debug_log__*
        // - jedes Gerät hat seit dem Lost-Update-Fix seinen eigenen) darf
        // jemals einen Reload auslösen. Sie werden - wie jeder andere
        // Schlüssel - laufend mitsynchronisiert, ändern sich aber sehr
        // häufig (bei praktisch jeder Aktion/jedem Sync-Versuch). Ohne diese
        // Ausnahme entsteht eine Endlosschleife: jede neue Log-Zeile wird
        // hochgeladen -> der eigene Echtzeit-Listener sieht die Änderung ->
        // plant einen Reload -> der Reload selbst erzeugt neue Log-Zeilen
        // (Erststart/Wiederholung-Einträge) -> die wiederum einen weiteren
        // Reload auslösen, usw. Nutzer-gemeldeter Bug ("es wurde
        // zurückgesetzt") war genau das: die Seite lud sich durch das
        // Diagnose-Protokoll selbst laufend neu, mitten im eigentlichen
        // Speichern/Hochladen. Der Wert wird trotzdem ganz normal lokal
        // übernommen (damit das Protokoll auf allen Geräten sichtbar
        // bleibt), nur eben ohne Reload.
        if (lsKey.indexOf(DEBUG_LOG_PREFIX) === 0) {
          if (change.type === 'removed') { isHydrating = true; try { origRemoveItem(lsKey); } finally { isHydrating = false; } return; }
          var dlValue = data && data.value;
          if (typeof dlValue === 'string' && localStorage.getItem(lsKey) !== dlValue) {
            isHydrating = true;
            try { origSetItem(lsKey, dlValue); } finally { isHydrating = false; }
          }
          return;
        }
        if (change.type === 'removed') {
          isHydrating = true;
          try { origRemoveItem(lsKey); } finally { isHydrating = false; }
          changedRemotely = true;
          changedKeys.push(lsKey + ' (gelöscht)');
          return;
        }
        var newValue = data && data.value;
        if (typeof newValue !== 'string') return;
        if (localStorage.getItem(lsKey) === newValue) return; // schon aktuell
        isHydrating = true;
        try { origSetItem(lsKey, newValue); } finally { isHydrating = false; }
        changedRemotely = true;
        changedKeys.push(lsKey);
      });
      if (changedRemotely) {
        logDebugEvent('remote_change', changedKeys.join(', ') + ' - Reload in 1.2s geplant', true);
        scheduleReload();
      }
    }, function (err) {
      console.warn('Intra-Sync: Listener-Fehler', err);
      logDebugEvent('remote_change', 'Listener-Fehler: ' + (err && err.message ? err.message : err), false);
    });
  }

  // -----------------------------------------------------------------------
  // Benutzerdatenbank: eigene Firestore-Collection 'users' (ein Dokument pro
  // Firebase-Auth-Konto, Dokument-ID = UID), unabhängig von SYNC_COLLECTION
  // (die spiegelt nur die App-Projektdaten, nicht Benutzer/Rollen). Beim
  // ersten Login eines Kontos wird hier automatisch ein Profil angelegt;
  // SUPREME_ADMIN_EMAIL bekommt dabei fest die Rolle 'supreme_admin', jedes
  // andere Konto startet als 'user' (bis ein Supreme Admin die Rolle in der
  // Benutzerverwaltung - Projekte-Seite, Tab „Vorlagen" - anhebt). Das
  // aufgelöste Profil steht der übrigen App unter window.intraCurrentUser
  // zur Verfügung, sobald das zugehörige Promise (window.intraUserReady)
  // erfüllt ist.
  //
  // WICHTIG: Diese Datei kann die Firestore Security Rules NICHT selbst
  // setzen (kein Konsolen-/CLI-Zugriff aus dieser Umgebung) - ohne
  // passende Regeln kann sich aktuell jedes eingeloggte Konto auch selbst
  // eine andere Rolle geben. Siehe intra_systemdokumentation.md, Abschnitt
  // „Benutzerdatenbank" für die Regeln, die im Firebase Console unter
  // Firestore -> Regeln eingefügt werden müssen, damit nur ein
  // supreme_admin fremde Rollen ändern kann.
  // -----------------------------------------------------------------------
  var SUPREME_ADMIN_EMAIL = 'wajih.tfaili60@gmail.com';
  var USERS_COLLECTION = 'users';

  function ensureUserProfile(user) {
    var ref = db.collection(USERS_COLLECTION).doc(user.uid);
    return ref.get().then(function (snap) {
      var nowTs = firebase.firestore.FieldValue.serverTimestamp();
      if (!snap.exists) {
        var initialRole = (user.email || '').toLowerCase() === SUPREME_ADMIN_EMAIL.toLowerCase() ? 'supreme_admin' : 'user';
        var profile = { email: user.email || '', role: initialRole, active: true, createdAt: nowTs, lastLogin: nowTs };
        return ref.set(profile).then(function () {
          window.intraCurrentUser = { uid: user.uid, email: profile.email, role: profile.role, active: true };
        });
      }
      var data = snap.data() || {};
      return ref.set({ lastLogin: nowTs }, { merge: true }).then(function () {
        window.intraCurrentUser = { uid: user.uid, email: data.email || user.email || '', role: data.role || 'user', active: data.active !== false };
      });
    }).catch(function (e) {
      console.warn('Intra-Sync: Benutzerprofil konnte nicht geladen/angelegt werden', e);
      // App trotzdem freigeben, mit einem minimalen Fallback-Profil statt
      // dauerhaft zu blockieren, falls z.B. die Security Rules die
      // users-Collection noch nicht erlauben.
      window.intraCurrentUser = { uid: user.uid, email: user.email || '', role: 'user', active: true };
    });
  }

  // -----------------------------------------------------------------------
  // Ablauf steuern
  // -----------------------------------------------------------------------
  var resolveUserReady;
  window.intraUserReady = new Promise(function (resolve) { resolveUserReady = resolve; });

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      renderLoginForm();
      return;
    }
    renderLoading('Anmeldung erfolgreich, Daten werden synchronisiert…');
    // retryPendingQueueOnStartup() bewusst zuerst und abgewartet (nicht Teil
    // des Promise.all) - erst wenn alle Altlasten aus einer evtl. abrupt
    // beendeten vorherigen Sitzung hochgeladen sind, macht der übliche
    // Cloud-Abgleich (der bei vorhandenen Cloud-Daten einmalig neu lädt)
    // weiter, damit dieser Reload nicht schon wieder einen gerade erst
    // wiederholten Upload unterbricht.
    retryPendingQueueOnStartup().then(function () {
      return Promise.all([ensureUserProfile(user), initialSync()]);
    }).then(function () {
      startRealtimeListener();
      hideOverlay();
      resolveUserReady(window.intraCurrentUser);
    }).catch(function (e) {
      console.error('Intra-Sync: Fehler beim Synchronisieren', e);
      hideOverlay(); // App trotzdem freigeben, statt für immer zu blockieren
      resolveUserReady(window.intraCurrentUser || null);
    });
  });
})();
