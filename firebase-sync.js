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
     der aktuelle Cloud-Stand lokal übernommen (danach einmaliger Neuladen
     der Seite, damit die App mit den frischen Daten startet).
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
  var RELOAD_FLAG_KEY = '__lb_reloaded_after_hydrate';

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

  function scheduleUpload(key, value) {
    if (pendingUploads[key]) clearTimeout(pendingUploads[key]);
    pendingUploads[key] = setTimeout(function () {
      delete pendingUploads[key];
      uploadKey(key, value).catch(function (e) {
        console.warn('Intra-Sync: Hochladen fehlgeschlagen für', key, e);
      });
    }, 700);
  }

  function scheduleDelete(key) {
    if (pendingUploads[key]) { clearTimeout(pendingUploads[key]); delete pendingUploads[key]; }
    db.collection(SYNC_COLLECTION).doc(docIdFor(key)).delete().catch(function (e) {
      console.warn('Intra-Sync: Löschen fehlgeschlagen für', key, e);
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
    var uploads = blobs.map(function (b) {
      return uploadDataUrlToStorage(b.value, [key].concat(b.path))
        .then(function (url) { setAtPath(clone, b.path, url || ''); })
        .catch(function (e) {
          console.warn('Intra-Sync: Storage-Upload fehlgeschlagen für', key, b.path, e);
          setAtPath(clone, b.path, '');
        });
    });
    return Promise.all(uploads).then(function () {
      return saveDocForKey(key, JSON.stringify(clone));
    });
  }

  function saveDocForKey(key, valueString) {
    if (valueString.length > MAX_DOC_CHARS) {
      console.warn('Intra-Sync: übersprungen (zu groß für Firestore):', key, valueString.length, 'Zeichen');
      return Promise.resolve();
    }
    return db.collection(SYNC_COLLECTION).doc(docIdFor(key)).set({
      key: key,
      value: valueString,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (auth.currentUser && auth.currentUser.email) || null
    }).catch(function (e) {
      console.warn('Intra-Sync: Hochladen fehlgeschlagen für', key, e);
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

  function initialSync() {
    return db.collection(SYNC_COLLECTION).limit(1).get().then(function (snap) {
      if (snap.empty) {
        renderLoading('Erststart: vorhandene Daten werden in die Cloud übertragen…');
        return seedCloudFromLocalStorage();
      }
      renderLoading('Daten werden geladen…');
      return pullAllFromCloud().then(function () {
        if (!sessionStorage.getItem(RELOAD_FLAG_KEY)) {
          sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
          location.reload();
          return new Promise(function () {}); // Seite lädt eh neu, hier anhalten
        }
      });
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
      snap.docChanges().forEach(function (change) {
        if (change.doc.metadata.hasPendingWrites) return; // eigener, noch unbestätigter Schreibvorgang
        var data = change.doc.data();
        var lsKey = (data && data.key) || change.doc.id;
        if (change.type === 'removed') {
          isHydrating = true;
          try { origRemoveItem(lsKey); } finally { isHydrating = false; }
          changedRemotely = true;
          return;
        }
        var newValue = data && data.value;
        if (typeof newValue !== 'string') return;
        if (localStorage.getItem(lsKey) === newValue) return; // schon aktuell
        isHydrating = true;
        try { origSetItem(lsKey, newValue); } finally { isHydrating = false; }
        changedRemotely = true;
      });
      if (changedRemotely) scheduleReload();
    }, function (err) {
      console.warn('Intra-Sync: Listener-Fehler', err);
    });
  }

  // -----------------------------------------------------------------------
  // Ablauf steuern
  // -----------------------------------------------------------------------
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      renderLoginForm();
      return;
    }
    renderLoading('Anmeldung erfolgreich, Daten werden synchronisiert…');
    initialSync().then(function () {
      startRealtimeListener();
      hideOverlay();
    }).catch(function (e) {
      console.error('Intra-Sync: Fehler beim Synchronisieren', e);
      hideOverlay(); // App trotzdem freigeben, statt für immer zu blockieren
    });
  });
})();
