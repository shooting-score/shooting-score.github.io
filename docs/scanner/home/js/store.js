/* HitMark storage: sessions and target photos kept in the browser (IndexedDB), with a memory fallback. */
(function (HM) {
  'use strict';
  var mem = { sessions: {}, images: {} }, dbp = null, useMem = !window.indexedDB;

  function db() {
    if (useMem) return Promise.reject(new Error('memory'));
    if (!dbp) dbp = new Promise(function (res, rej) {
      // Some browsers (private windows, local files) never answer: fall back to memory.
      var timer = setTimeout(function () { useMem = true; rej(new Error('memory')); }, 2000);
      var r;
      try { r = indexedDB.open('hitmark', 1); } catch (e) { clearTimeout(timer); useMem = true; rej(new Error('memory')); return; }
      var res0 = res, rej0 = rej;
      res = function (v) { clearTimeout(timer); res0(v); };
      rej = function (e) { clearTimeout(timer); rej0(e); };
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    }).catch(function (e) {
      if (e && e.message === 'memory') throw e;
      useMem = true; throw new Error('memory');
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  HM.store = {
    allSessions: function () {
      return run('sessions', 'readonly', function (s) { return s.getAll(); })
        .catch(function () { return Object.keys(mem.sessions).map(function (k) { return clone(mem.sessions[k]); }); });
    },
    saveSession: function (sess) {
      var copy = clone(sess);
      mem.sessions[sess.id] = copy;
      return run('sessions', 'readwrite', function (s) { return s.put(copy); }).catch(function () {});
    },
    deleteSession: function (sess) {
      delete mem.sessions[sess.id];
      var ids = sess.targets.map(function (t) { return t.id; });
      ids.forEach(function (id) { delete mem.images[id]; });
      return run('sessions', 'readwrite', function (s) { return s.delete(sess.id); }).catch(function () {})
        .then(function () { return run('images', 'readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); return null; }).catch(function () {}); });
    },
    saveImage: function (id, blob) {
      mem.images[id] = blob;
      return run('images', 'readwrite', function (s) { return s.put(blob, id); }).catch(function () {});
    },
    getImage: function (id) {
      return run('images', 'readonly', function (s) { return s.get(id); })
        .then(function (b) { return b || mem.images[id] || null; })
        .catch(function () { return mem.images[id] || null; });
    },
    deleteImage: function (id) {
      delete mem.images[id];
      return run('images', 'readwrite', function (s) { return s.delete(id); }).catch(function () {});
    },
    persistent: function () { return !useMem; }
  };
})(window.HM);
