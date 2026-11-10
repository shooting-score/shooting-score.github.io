/* ShootingScanner web app: sessions, scanning, editing hits, statistics and heat maps. */
(function (HM) {
  'use strict';

  var S = { sessions: [] };
  var main = document.getElementById('main');
  var cleanup = null;
  var PALETTE = ['#2747ff', '#ff3b30', '#34c759', '#ff9500', '#af52de', '#00b7c3', '#ff2d92', '#8e6b23', '#5856d6', '#4cd964'];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  /* ---------- saved targets ---------- */
  // A target is saved to its session's shooter with t.saved = true; the list is worked out from the sessions.
  function shooterKey(s) { return HM.sessShooter(s).toLowerCase(); }
  function savedItems() {
    var out = [];
    S.sessions.forEach(function (s) { s.targets.forEach(function (t, i) { if (t.saved) out.push({ sess: s, t: t, i: i }); }); });
    return out;
  }
  // When the target was scanned, uploaded or plotted (falls back to the session date for old targets).
  function targetTime(it) {
    if (it.t.created) return it.t.created;
    var p = (it.sess.date || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]).getTime() : 0;
  }
  function fmtTime(ms) { return ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function starBtn(t, extra) {
    return '<button type="button" class="star' + (extra ? ' ' + extra : '') + '" data-tid="' + t.id + '" aria-pressed="' + !!t.saved + '" title="' + (t.saved ? 'Remove from saved targets' : 'Save target') + '" aria-label="' + (t.saved ? 'Remove from saved targets' : 'Save target') + '">' + (t.saved ? '★' : '☆') + '</button>';
  }
  function toggleSaved(sess, t) {
    t.saved = !t.saved;
    toast(t.saved ? 'Saved to ' + HM.sessShooter(sess) + '’s saved targets.' : 'Removed from saved targets.', 2200);
    return save(sess);
  }
  function confirmDeleteSaved(n, shooter) {
    if (!n) return true;
    return confirm(n === 1 && shooter ? 'This target is in ' + shooter + '’s saved targets. Delete it anyway?' : n + ' saved target' + (n === 1 ? '' : 's') + ' in this session will also be removed from saved targets. Delete anyway?');
  }

  function findSession(id) { for (var i = 0; i < S.sessions.length; i++) if (S.sessions[i].id === id) return S.sessions[i]; return null; }
  function sessionShots(sess) {
    var all = [];
    var cal = HM.sessCaliber(sess).mm;
    sess.targets.forEach(function (t, ti) { HM.targetShotsMM(t).forEach(function (p) { p.t = ti; p.cal = cal; all.push(p); }); });
    return all;
  }
  // One line describing who shot the session and with what, e.g. "Me · Walther LP500 · 4,5 mm".
  // The session's own discipline name (free text, optional) followed by the target type.
  function discLine(s) { return [s.disciplineName, HM.sessDisc(s).name].filter(Boolean).join(' · '); }
  function shooterLine(s) { return [HM.sessShooter(s), s.gun, HM.sessCaliber(s).name].filter(Boolean).join(' · '); }
  // Same name typed in different case counts once; a spelling that starts with a capital letter is preferred.
  function nicer(a, b) { return !a || (b && a.charAt(0) === a.charAt(0).toLowerCase() && b.charAt(0) !== b.charAt(0).toLowerCase()) ? b : a; }
  function uniq(list) {
    var seen = {}, order = [];
    list.forEach(function (x) { if (!x) return; var k = x.toLowerCase(); if (!(k in seen)) order.push(k); seen[k] = nicer(seen[k], x); });
    return order.map(function (k) { return seen[k]; });
  }
  function save(sess) { sess.updated = Date.now(); return HM.store.saveSession(sess); }
  var saveTimer = null;
  function saveSoon(sess) { clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(sess); }, 300); }

  function toast(msg, ms) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, ms || 3500);
  }
  function busy(on, text) {
    document.getElementById('busy').hidden = !on;
    if (text) document.getElementById('busyText').textContent = text;
  }
  function setBar(left, title, right) {
    document.getElementById('barLeft').innerHTML = left || '<a class="bar-link" href="home/">&#8249; Website</a>';
    document.getElementById('barTitle').textContent = title;
    document.getElementById('barRight').innerHTML = right || '';
    document.title = title + ' – ShootingScanner';
  }

  /* ---------- small canvas helpers ---------- */
  function drawMini(cv, sess, targets, opts) {
    opts = opts || {};
    var d = HM.sessDisc(sess), w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    var ctx = HM.prepCanvas(cv, w, h);
    var pts = [], colors = [];
    targets.forEach(function (t) {
      var ti = sess.targets.indexOf(t);
      HM.targetShotsMM(t).forEach(function (p) { pts.push(p); colors.push(opts.colorByTarget ? PALETTE[ti % PALETTE.length] : null); });
    });
    var radius = HM.viewR(d);
    var st = HM.stats(d, pts), cx = 0, cy = 0;
    if (opts.zoom && pts.length) {
      var ext = 0;
      pts.forEach(function (p) { ext = Math.max(ext, Math.abs(p.x - st.mx), Math.abs(p.y - st.my)); });
      radius = Math.max(ext + d.cal * 1.5, d.blackR * 0.45);
      cx = st.mx; cy = st.my;
    }
    var M = HM.fitMap(w, h, radius, cx, cy);
    ctx.fillStyle = HM.PAPER; ctx.fillRect(0, 0, w, h);
    HM.drawTarget(ctx, d, M, { fillRect: [0, 0, w, h], numbers: opts.numbers !== false });
    HM.drawShots(ctx, d, M, pts, { colors: colors, minR: 2 });
    if (opts.centre) HM.drawGroupCentre(ctx, M, st);
    return st;
  }

  function statsGrid(d, st, extra) {
    if (!st.n) return '<p class="muted">No shots yet.</p>';
    var rows = [
      ['Average hit', st.avg.toFixed(2) + ' <small>(' + st.avgDec.toFixed(2) + ')</small>'],
      ['Windage', HM.windage(st.mx)],
      ['Elevation', HM.elevation(st.my)],
      ['Mean radius', HM.fmtMM(st.mr)],
      ['Max spread', st.n > 1 ? HM.fmtMM(st.es) : '–'],
      ['Group size', st.n > 1 ? (Math.round(st.w * 10) / 10) + ' × ' + (Math.round(st.h * 10) / 10) + ' mm' : '–']
    ].concat(extra || []);
    return '<dl class="stats">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="offset">' + esc(HM.describeOffset(st)) + '</p>';
  }

  /* ---------- session dialog ---------- */
  var dlg = document.getElementById('sessionDialog'), form = document.getElementById('sessionForm'), dlgDone = null;
  document.getElementById('disciplineSelect').innerHTML = HM.DISCIPLINES.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');
  document.getElementById('caliberSelect').innerHTML = HM.CALIBERS.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  form.discipline.addEventListener('change', function () {
    if (form.dataset.edit) return;
    var d = HM.disc(form.discipline.value);
    form.shots.value = d.shots;
    if (!form.dataset.calTouched) form.caliber.value = HM.defaultCaliber(d);
  });
  form.caliber.addEventListener('change', function () { form.dataset.calTouched = '1'; });
  document.getElementById('sessionCancel').addEventListener('click', function () { dlg.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = { name: form.name.value.trim() || 'Training', disciplineName: form.disciplineName.value.trim(), shooter: form.shooter.value.trim() || 'Me', gun: form.gun.value.trim(), caliber: form.caliber.value, date: form.date.value || today(), discipline: form.discipline.value, shots: Math.max(1, Math.min(60, +form.shots.value || 5)), notes: form.notes.value.trim() };
    dlg.close();
    if (dlgDone) dlgDone(v);
  });
  function openSessionDialog(sess, done) {
    form.dataset.edit = sess ? '1' : '';
    document.getElementById('sessionDialogTitle').textContent = sess ? 'Edit session' : 'New session';
    form.name.value = sess ? sess.name : 'Training';
    form.date.value = sess ? sess.date : today();
    form.discipline.value = sess ? sess.discipline : (localStorage.getItem('hm-last-disc') || 'ap10');
    form.shooter.value = sess ? HM.sessShooter(sess) : 'Me';
    form.gun.value = sess ? (sess.gun || '') : '';
    form.disciplineName.value = sess ? (sess.disciplineName || '') : '';
    form.caliber.value = sess ? HM.sessCaliber(sess).id : HM.defaultCaliber(HM.disc(form.discipline.value));
    form.dataset.calTouched = '';
    // Suggest shooters and guns used before.
    var opt = function (x) { return '<option value="' + esc(x) + '"></option>'; };
    document.getElementById('shooterList').innerHTML = uniq(['Me'].concat(S.sessions.map(HM.sessShooter))).map(opt).join('');
    document.getElementById('disciplineList').innerHTML = uniq(S.sessions.map(function (s) { return s.disciplineName; })).map(opt).join('');
    document.getElementById('gunList').innerHTML = uniq(S.sessions.map(function (s) { return s.gun; })).map(opt).join('');
    form.shots.value = sess ? sess.shots : HM.disc(form.discipline.value).shots;
    form.notes.value = sess ? (sess.notes || '') : '';
    dlgDone = done;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { form.name.focus(); form.name.select(); }, 30);
  }

  function newSession(v) {
    var sess = { id: HM.uid(), name: v.name, disciplineName: v.disciplineName, shooter: v.shooter, gun: v.gun, caliber: v.caliber, date: v.date, discipline: v.discipline, shots: v.shots, notes: v.notes, targets: [], created: Date.now() };
    try { localStorage.setItem('hm-last-disc', v.discipline); } catch (e) { /* private mode */ }
    S.sessions.unshift(sess);
    return save(sess).then(function () { return sess; });
  }

  /* ---------- images and scanning ---------- */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('This picture could not be opened.')); };
      img.src = src;
    });
  }
  function scaled(source, w, h, max) {
    var k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c;
  }
  function canvasBlob(c) {
    return new Promise(function (res) {
      if (c.toBlob) c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.9);
      else fetch(c.toDataURL('image/jpeg', 0.9)).then(function (r) { return r.blob(); }).then(res);
    });
  }

  // Runs the analysis on a stored picture and returns calibration + shots in its pixels.
  // Orders a target's shots from lowest to highest score (ties: furthest from centre first),
  // so shot 1 is always the weakest one.
  function sortShots(t, d) {
    var keyed = t.shots.map(function (sh) { var p = HM.toMM(t.calib, sh), sc = HM.score(d, p.x, p.y); return { sh: sh, dec: sc.dec, dist: sc.dist }; });
    keyed.sort(function (a, b) { return a.dec - b.dec || b.dist - a.dist; });
    t.shots = keyed.map(function (k) { return k.sh; });
    return t;
  }

  function analyseCanvas(big, d, expected, opts) {
    var small = scaled(big, big.width, big.height, 1000), k = big.width / small.width;
    var id = small.getContext('2d').getImageData(0, 0, small.width, small.height);
    var r = HM.analyse(id, d, { expected: expected, sensitivity: opts.sens, holes: opts.holes });
    r.calib = { cx: r.calib.cx * k, cy: r.calib.cy * k, sx: r.calib.sx * k, sy: r.calib.sy * k };
    r.shots = sortShots({ calib: r.calib, shots: r.shots.map(function (s) { return { u: s.u * k, v: s.v * k }; }) }, d).shots;
    return r;
  }

  function addPhotoTarget(sess, source, w, h) {
    busy(true, 'Scanning target…');
    return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
      var d = HM.sessDisc(sess);
      var big = scaled(source, w, h, 1600);
      var r = analyseCanvas(big, d, sess.shots, { sens: 0.5, holes: 'light' });
      var t = { id: HM.uid(), created: Date.now(), imgW: big.width, imgH: big.height, hasImage: true, calib: r.calib, shots: r.shots, info: r.message, found: r.found, holes: 'light', sens: 0.5 };
      return canvasBlob(big).then(function (blob) {
        return HM.store.saveImage(t.id, blob);
      }).then(function () {
        sess.targets.push(t);
        return save(sess);
      }).then(function () { busy(false); return t; });
    }).catch(function (e) { busy(false); toast(e.message || 'Scanning failed.'); throw e; });
  }

  function addFileTarget(sess, file) {
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      return addPhotoTarget(sess, img, img.naturalWidth, img.naturalHeight).then(function (t) { URL.revokeObjectURL(url); return t; });
    });
  }

  function addSampleTarget(sess, seed) {
    var d = HM.sessDisc(sess);
    var smp = HM.makeSample(d, { shots: sess.shots, seed: seed || Math.floor(Math.random() * 1e9) });
    return addPhotoTarget(sess, smp.canvas, smp.canvas.width, smp.canvas.height);
  }

  function addManualTarget(sess) {
    var d = HM.sessDisc(sess), ppm = 600 / (2 * HM.cardHalf(d));
    var size = 600;
    var t = { id: HM.uid(), created: Date.now(), imgW: size, imgH: size, hasImage: false, calib: { cx: size / 2, cy: size / 2, sx: ppm, sy: ppm }, shots: [], info: 'Tap “Add shot”, then tap the target where each shot landed.', found: true };
    sess.targets.push(t);
    return save(sess).then(function () { return t; });
  }

  function makeDemo() {
    busy(true, 'Making a demo session…');
    var dates = [0, 3, 9, 16];
    var chain = Promise.resolve(), made = [];
    dates.forEach(function (ago, si) {
      chain = chain.then(function () {
        var dt = new Date(Date.now() - ago * 86400000);
        var v = { name: si === 0 ? 'Demo session' : 'Demo training ' + (dates.length - si), date: dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'), discipline: 'ap10', shooter: 'Me', gun: '', caliber: '4.5mm', shots: 5, notes: 'Generated sample targets' };
        return newSession(v).then(function (sess) {
          made.push(sess);
          var c = Promise.resolve();
          for (var i = 0; i < (si === 0 ? 6 : 4); i++) (function (i) { c = c.then(function () { return addSampleTarget(sess, 1000 + si * 37 + i * 101); }); })(i);
          return c;
        });
      });
    });
    return chain.then(function () {
      busy(false);
      S.sessions.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || b.created - a.created; });
      return made[0];
    });
  }

  var pendingAdd = null;
  function pickFile(input, sess) {
    pendingAdd = sess; input.value = ''; input.click();
  }
  function onFile(e) {
    var f = e.target.files && e.target.files[0], sess = pendingAdd;
    if (!f || !sess) return;
    addFileTarget(sess, f).then(function (t) { location.hash = '#/s/' + sess.id + '/t/' + t.id; });
  }
  document.getElementById('cameraInput').addEventListener('change', onFile);
  document.getElementById('fileInput').addEventListener('change', onFile);

  /* ---------- backup ---------- */
  function exportAll() {
    busy(true, 'Preparing backup…');
    var images = {}, jobs = [];
    S.sessions.forEach(function (s) {
      s.targets.forEach(function (t) {
        if (!t.hasImage) return;
        jobs.push(HM.store.getImage(t.id).then(function (b) {
          if (!b) return;
          return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { images[t.id] = fr.result; res(); }; fr.readAsDataURL(b); });
        }));
      });
    });
    Promise.all(jobs).then(function () {
      var blob = new Blob([JSON.stringify({ app: 'hitmark', version: 1, exported: new Date().toISOString(), sessions: S.sessions, images: images })], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'shootingscanner-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      busy(false); toast('Backup saved to your downloads.');
    });
  }
  document.getElementById('importInput').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || data.app !== 'hitmark' || !Array.isArray(data.sessions)) throw new Error('bad');
      var added = 0, jobs = [];
      data.sessions.forEach(function (s) {
        if (findSession(s.id)) return;
        S.sessions.push(s); added++; jobs.push(save(s));
        s.targets.forEach(function (t) {
          var u = data.images && data.images[t.id];
          if (u) jobs.push(fetch(u).then(function (r) { return r.blob(); }).then(function (b) { return HM.store.saveImage(t.id, b); }));
        });
      });
      return Promise.all(jobs).then(function () {
        S.sessions.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        toast(added ? 'Restored ' + added + ' session' + (added === 1 ? '' : 's') + '.' : 'Those sessions are already here.');
        route();
      });
    }).catch(function () { toast('That file is not a ShootingScanner backup.'); });
  });

  /* ---------- views ---------- */
  // Sessions-page filter. '' means "all"; names compare ignoring case, 'g:' / 'd:' is a session without a gun / discipline.
  var LF = { disc: '', shooter: '', gun: '', caliber: '' };
  var LF_FIELDS = ['disc', 'shooter', 'gun', 'caliber'];
  try { Object.assign(LF, JSON.parse(localStorage.getItem('hm-list-filter')) || {}); } catch (e) { /* none saved */ }
  function lfKeys(s) { return { disc: 'd:' + (s.disciplineName || '').toLowerCase(), shooter: HM.sessShooter(s).toLowerCase(), gun: 'g:' + (s.gun || '').toLowerCase(), caliber: HM.sessCaliber(s).id }; }
  function lfMatch(s) { var k = lfKeys(s); return LF_FIELDS.every(function (f) { return !LF[f] || LF[f] === k[f]; }); }
  function filterBar() {
    var opts = { disc: {}, shooter: {}, gun: {}, caliber: {} };
    S.sessions.forEach(function (s) {
      var k = lfKeys(s);
      opts.disc[k.disc] = nicer(opts.disc[k.disc], s.disciplineName || 'No discipline');
      opts.shooter[k.shooter] = nicer(opts.shooter[k.shooter], HM.sessShooter(s));
      opts.gun[k.gun] = nicer(opts.gun[k.gun], s.gun || 'No gun');
      opts.caliber[k.caliber] = HM.sessCaliber(s).name;
    });
    // Forget a saved choice that no session has any more.
    LF_FIELDS.forEach(function (f) { if (LF[f] && !opts[f][LF[f]]) LF[f] = ''; });
    var order = { caliber: HM.CALIBERS.map(function (c) { return c.id; }) };
    var sel = function (f, label, all) {
      var keys = Object.keys(opts[f]);
      keys.sort(f === 'caliber' ? function (a, b) { return order.caliber.indexOf(a) - order.caliber.indexOf(b); } : function (a, b) { return (a === 'g:' || a === 'd:') - (b === 'g:' || b === 'd:') || opts[f][a].localeCompare(opts[f][b]); });
      return '<label class="filter">' + label + '<select data-f="' + f + '"><option value="">' + all + '</option>' +
        keys.map(function (k) { return '<option value="' + esc(k) + '"' + (LF[f] === k ? ' selected' : '') + '>' + esc(opts[f][k]) + '</option>'; }).join('') + '</select></label>';
    };
    return '<section class="list-filter">' + sel('disc', 'Discipline', 'All disciplines') + sel('shooter', 'Shooter', 'All shooters') + sel('gun', 'Gun', 'All guns') + sel('caliber', 'Caliber', 'All calibers') + '</section>';
  }

  /* ---------- theme ---------- */
  // 'auto' follows the device setting; 'light' and 'dark' override it.
  function getTheme() { try { var t = localStorage.getItem('hm-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim() || '#f6f6f6';
  }
  function setTheme(t) { try { if (t === 'auto') localStorage.removeItem('hm-theme'); else localStorage.setItem('hm-theme', t); } catch (e) { /* private mode */ } applyTheme(t); }
  applyTheme(getTheme());
  if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); var onMq = function () { applyTheme(getTheme()); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

  function viewSessions() {
    setBar(null, 'Sessions', '<button class="bar-btn" id="newBtn" aria-label="New session">+ New</button>');
    var html = '<section class="intro card"><div><h2>Score your paper targets</h2><p>Create a session, pick the target type, then photograph each card. Holes are found and scored for you, and you can add, move or remove any hit.</p></div>' +
      '<div class="row"><button class="btn primary" id="newBtn2">+ New session</button><button class="btn" id="demoBtn">Try a demo session</button>' +
      (savedItems().length ? '<a class="btn" id="savedBtn" href="#/saved"><span class="star-ico" aria-hidden="true">★</span> Saved targets (' + savedItems().length + ')</a>' : '') + '</div></section>';
    if (!S.sessions.length) html += '<p class="empty">No sessions yet.</p>';
    else {
      html += filterBar();
      var shown = S.sessions.filter(lfMatch), filtered = shown.length !== S.sessions.length;
      if (filtered) html += '<p class="small muted list-count">Showing ' + shown.length + ' of ' + S.sessions.length + ' sessions · <button class="linkbtn" id="clearFilter">Show all</button></p>';
      if (!shown.length) html += '<p class="empty">No sessions match this filter.</p>';
      else html += '<ul class="list">' + shown.map(function (s) {
        var d = HM.sessDisc(s), st = HM.stats(d, sessionShots(s));
        return '<li><a href="#/s/' + s.id + '" class="list-item"><canvas class="mini" data-sid="' + s.id + '" width="56" height="56"></canvas>' +
          '<span class="li-main"><strong>' + esc(s.name) + '</strong><span class="muted">' + esc(discLine(s)) + '</span><span class="muted small">' + esc(shooterLine(s)) + '</span><span class="muted small">' + esc(fmtDate(s.date)) + ' · ' + s.targets.length + ' target' + (s.targets.length === 1 ? '' : 's') + ' · ' + st.n + ' shots</span></span>' +
          '<span class="li-score"><b>' + HM.fmtScore(st) + '</b><small>' + (st.n ? st.avgDec.toFixed(1) + ' avg' : '') + '</small></span></a></li>';
      }).join('') + '</ul>';
    }
    html += '<div class="row footer-row"><button class="btn small" id="exportBtn"' + (S.sessions.length ? '' : ' disabled') + '>Save backup</button><button class="btn small" id="importBtn">Restore backup</button><a class="btn small" href="home/wiki/">Help</a></div>';
    var th = getTheme();
    html += '<div class="row theme-row">Appearance <div class="seg small" id="themeSeg" role="group" aria-label="Appearance">' +
      [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) { return '<button data-theme="' + o[0] + '" class="' + (th === o[0] ? 'on' : '') + '" aria-pressed="' + (th === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    if (!HM.store.persistent()) html += '<p class="muted small center">This browser is not keeping data between visits; save a backup before closing.</p>';
    main.innerHTML = html;
    main.querySelectorAll('canvas.mini').forEach(function (cv) { var s = findSession(cv.dataset.sid); drawMini(cv, s, s.targets, { numbers: false }); });
    var create = function () { openSessionDialog(null, function (v) { newSession(v).then(function (s) { location.hash = '#/s/' + s.id; }); }); };
    $('#newBtn').onclick = create; $('#newBtn2').onclick = create;
    var setFilter = function () { try { localStorage.setItem('hm-list-filter', JSON.stringify(LF)); } catch (e) { /* private mode */ } viewSessions(); };
    main.querySelectorAll('.list-filter select').forEach(function (el) { el.onchange = function () { LF[el.dataset.f] = el.value; setFilter(); }; });
    if ($('#clearFilter')) $('#clearFilter').onclick = function () { LF = { disc: '', shooter: '', gun: '', caliber: '' }; setFilter(); };
    $('#demoBtn').onclick = function () { location.hash = '#/demo'; };
    $('#exportBtn').onclick = exportAll;
    $('#themeSeg').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      setTheme(b.dataset.theme);
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    };
    $('#importBtn').onclick = function () { var i = document.getElementById('importInput'); i.value = ''; i.click(); };
  }

  function viewSaved(key) {
    setBar('<a class="bar-link" href="#/">&#8249; Sessions</a>', 'Saved targets', '');
    var all = savedItems(), people = {}, order = [];
    all.forEach(function (it) {
      var k = shooterKey(it.sess);
      if (!people[k]) { people[k] = { name: HM.sessShooter(it.sess), n: 0 }; order.push(k); }
      people[k].name = nicer(people[k].name, HM.sessShooter(it.sess)); people[k].n++;
    });
    order.sort(function (a, b) { return people[a].name.localeCompare(people[b].name); });
    if (!key || !people[key]) key = (LF.shooter && people[LF.shooter]) ? LF.shooter : (people.me ? 'me' : order[0]);
    var html = '';
    if (!all.length) html += '<p class="empty">No saved targets yet. Tap ☆ on a target to save it.</p>';
    else {
      var items = all.filter(function (it) { return shooterKey(it.sess) === key; }).sort(function (a, b) { return targetTime(b) - targetTime(a); });
      html += '<label class="filter saved-who">Shooter <select id="savedWho">' + order.map(function (k) { return '<option value="' + esc(k) + '"' + (k === key ? ' selected' : '') + '>' + esc(people[k].name) + ' (' + people[k].n + ')</option>'; }).join('') + '</select></label>';
      html += '<h2 class="saved-title">' + esc(people[key].name) + '’s saved targets</h2>';
      html += '<ul class="list">' + items.map(function (it) {
        var s = it.sess, t = it.t, st = HM.stats(HM.sessDisc(s), HM.targetShotsMM(t));
        return '<li class="saved-row"><a href="#/s/' + s.id + '/t/' + t.id + '" class="list-item"><canvas class="mini" data-sid="' + s.id + '" data-tid="' + t.id + '" width="56" height="56"></canvas>' +
          '<span class="li-main"><strong>' + esc(fmtTime(targetTime(it))) + '</strong>' +
          '<span class="muted">' + esc(discLine(s)) + '</span>' +
          '<span class="muted small">Gun: ' + esc(s.gun || 'No gun') + ' · Caliber: ' + esc(HM.sessCaliber(s).name) + '</span>' +
          '<span class="muted small">' + esc(s.name) + ' · Target ' + (it.i + 1) + '</span></span>' +
          '<span class="li-score"><b>' + HM.fmtScore(st) + '</b><small>' + (st.n ? st.avgDec.toFixed(1) + ' avg' : '') + '</small></span></a>' + starBtn(t) + '</li>';
      }).join('') + '</ul>';
    }
    main.innerHTML = html;
    main.querySelectorAll('canvas.mini').forEach(function (cv) {
      var s = findSession(cv.dataset.sid), t = s.targets.filter(function (x) { return x.id === cv.dataset.tid; })[0];
      drawMini(cv, s, [t], { numbers: false, zoom: 0 });
    });
    if ($('#savedWho')) $('#savedWho').onchange = function () { location.hash = '#/saved/' + encodeURIComponent(this.value); };
    main.querySelectorAll('.saved-row .star').forEach(function (b) {
      b.onclick = function () {
        var it = all.filter(function (x) { return x.t.id === b.dataset.tid; })[0];
        if (it) toggleSaved(it.sess, it.t).then(function () { viewSaved(key); });
      };
    });
  }

  function viewSession(sess, tab) {
    tab = tab || 'hits';
    var d = HM.sessDisc(sess);
    setBar('<a class="bar-link" href="#/">&#8249; Sessions</a>', sess.name, '<button class="bar-btn" id="editSess">Edit</button>');
    var all = sessionShots(sess), st = HM.stats(d, all);
    var html = '<section class="card sess-head"><div><div><strong>' + esc(shooterLine(sess)) + '</strong></div><div class="muted">' + esc(discLine(sess)) + ' · ' + esc(fmtDate(sess.date)) + ' · ' + sess.shots + ' shots per target</div>' +
      (sess.notes ? '<div class="small muted">' + esc(sess.notes) + '</div>' : '') + '</div>' +
      '<div class="big-score"><b>' + HM.fmtScore(st) + '</b><span>' + st.totalDec.toFixed(1) + ' · ' + st.n + ' shots · ' + sess.targets.length + ' targets</span></div></section>' +
      '<section class="add-row"><button class="btn primary" id="camBtn">&#128247; Take photo</button><button class="btn" id="upBtn">Upload photo</button><button class="btn" id="smpBtn">Sample photo</button><button class="btn" id="manBtn">Plot by hand</button></section>' +
      '<nav class="tabs" role="tablist">' +
      ['hits', 'targets', 'heat'].map(function (k) { return '<a role="tab" href="#/s/' + sess.id + '/' + k + '" class="' + (tab === k ? 'on' : '') + '">' + { hits: 'All hits', targets: 'Targets (' + sess.targets.length + ')', heat: 'Heat map' }[k] + '</a>'; }).join('') + '</nav>';
    if (tab === 'hits') {
      html += '<section class="card split"><div class="plot-box"><canvas id="allCv" class="plot"></canvas>' +
        '<div class="seg small" id="zoomSeg"><button data-z="0" class="on">Whole target</button><button data-z="1">Zoom to group</button></div>' +
        '<label class="check"><input type="checkbox" id="colorBy"> Colour by target</label></div>' +
        '<div class="side"><h3>All ' + st.n + ' hits together</h3>' + statsGrid(d, st) +
        (sess.targets.length ? '<table class="tbl"><thead><tr><th>Target</th><th>Score</th><th>Avg</th><th>Mean r.</th><th>Spread</th></tr></thead><tbody>' +
          sess.targets.map(function (t, i) { var ts = HM.stats(d, HM.targetShotsMM(t)); return '<tr data-t="' + t.id + '"><td><span class="dot" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' + (i + 1) + '</td><td>' + HM.fmtScore(ts) + '</td><td>' + (ts.n ? ts.avgDec.toFixed(1) : '–') + '</td><td>' + (ts.n ? ts.mr.toFixed(1) : '–') + '</td><td>' + (ts.n > 1 ? ts.es.toFixed(1) : '–') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
        '</div></section>';
    } else if (tab === 'targets') {
      if (!sess.targets.length) html += '<p class="empty">No targets yet. Take a photo of your first card.</p>';
      if (sess.targets.length) html += '<p class="small muted">Decimal score of each shot, lowest first; * marks an inner ten (X). Tap a target to check or edit its hits.</p>';
      html += '<div class="grid">' + sess.targets.map(function (t, i) {
        var ts = HM.stats(d, HM.targetShotsMM(t)), miss = Math.max(0, sess.shots - ts.n);
        var vals = ts.scores.slice().sort(function (a, b) { return a.dec - b.dec; }).map(function (s) { return s.dec.toFixed(1) + (s.x ? '*' : ''); });
        for (var k = 0; k < miss; k++) vals.push('–');
        return '<a class="card tcard" href="#/s/' + sess.id + '/t/' + t.id + '"><canvas class="tplot" data-t="' + t.id + '"></canvas>' +
          '<div class="tc-head"><strong>Target ' + (i + 1) + ' ' + starBtn(t) + '</strong><b>' + HM.fmtScore(ts) + '</b></div>' +
          '<div class="small muted">' + vals.join(' · ') + '</div>' +
          '<div class="small muted">' + (ts.n > 1 ? 'Mean radius ' + HM.fmtMM(ts.mr) + ' · Spread ' + HM.fmtMM(ts.es) : (t.hasImage ? 'Scanned photo' : 'Plotted by hand')) + '</div></a>';
      }).join('') + '</div>';
    } else {
      html += '<section class="card split"><div class="plot-box"><canvas id="heatCv" class="plot"></canvas>' +
        '<div class="seg small" id="scopeSeg"><button data-d="0" class="on">This session</button><button data-d="7">7 days</button><button data-d="30">30 days</button><button data-d="90">90 days</button><button data-d="-1">All</button></div>' +
        '<label class="filter">Include sessions by <select id="whoSel">' +
          '<option value="all">Every shooter</option>' +
          '<option value="shooter">' + esc(HM.sessShooter(sess)) + '</option>' +
          '<option value="gun">' + esc(HM.sessShooter(sess)) + ' · ' + esc(sess.gun || 'no gun given') + '</option>' +
          '<option value="caliber">' + esc(shooterLine(Object.assign({}, sess, { gun: sess.gun || 'no gun given' }))) + '</option>' +
        '</select></label>' +
        '<label class="filter">Discipline <select id="discSel"><option value="all">Any discipline</option><option value="same">' +
          (sess.disciplineName ? 'Only ' + esc(sess.disciplineName) : 'Only sessions without a discipline') + '</option></select></label></div>' +
        '<div class="side"><h3>Where your hits land</h3><p id="heatCap" class="muted"></p><div id="heatStats"></div>' +
        '<p class="small muted">Red and yellow show where most shots landed; dark blue means no hits. Day ranges include every session with this target type (and its training card); use the lists below them to keep only one discipline, shooter, gun or caliber.</p></div></section>';
    }
    html += '<div class="row footer-row"><button class="btn small danger" id="delSess">Delete session</button></div>';
    main.innerHTML = html;

    $('#editSess').onclick = function () {
      openSessionDialog(sess, function (v) {
        sess.name = v.name; sess.date = v.date; sess.shots = v.shots; sess.notes = v.notes;
        sess.disciplineName = v.disciplineName; sess.shooter = v.shooter; sess.gun = v.gun; sess.caliber = v.caliber;
        if (v.discipline !== sess.discipline) {
          if (sess.targets.length && !HM.sameRings(HM.disc(sess.discipline), HM.disc(v.discipline)) && !confirm('Change the target type? Shots keep their place on the pictures but rings are measured again.')) { save(sess).then(route); return; }
          var od = HM.sessDisc(sess), nd = HM.disc(v.discipline);
          sess.targets.forEach(function (t) { if (!t.hasImage) return; var k = od.blackR / nd.blackR; t.calib.sx *= k; t.calib.sy *= k; });
          sess.discipline = v.discipline;
        }
        save(sess).then(route);
      });
    };
    $('#delSess').onclick = function () {
      if (!confirm('Delete “' + sess.name + '” and all its targets?')) return;
      if (!confirmDeleteSaved(sess.targets.filter(function (t) { return t.saved; }).length)) return;
      S.sessions.splice(S.sessions.indexOf(sess), 1);
      HM.store.deleteSession(sess).then(function () { location.hash = '#/'; });
    };
    main.querySelectorAll('.tcard .star').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var t = sess.targets.filter(function (x) { return x.id === b.dataset.tid; })[0];
        if (t) toggleSaved(sess, t).then(function () { b.outerHTML = starBtn(t); route(); });
      };
    });
    var go = function (t) { location.hash = '#/s/' + sess.id + '/t/' + t.id; };
    $('#camBtn').onclick = function () { pickFile(document.getElementById('cameraInput'), sess); };
    $('#upBtn').onclick = function () { pickFile(document.getElementById('fileInput'), sess); };
    $('#smpBtn').onclick = function () { addSampleTarget(sess).then(go); };
    $('#manBtn').onclick = function () { addManualTarget(sess).then(go); };

    var redraw;
    if (tab === 'hits') {
      var z = 0, cb = false, cv = $('#allCv');
      redraw = function () { drawMini(cv, sess, sess.targets, { zoom: z, colorByTarget: cb, centre: true }); };
      $('#zoomSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; z = +b.dataset.z; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); redraw(); };
      $('#colorBy').onchange = function () { cb = this.checked; redraw(); };
      main.querySelectorAll('tr[data-t]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/s/' + sess.id + '/t/' + tr.dataset.t; }; });
    } else if (tab === 'targets') {
      redraw = function () { main.querySelectorAll('canvas.tplot').forEach(function (c) { var t = sess.targets.filter(function (x) { return x.id === c.dataset.t; })[0]; drawMini(c, sess, [t], { zoom: 0, centre: true }); }); };
    } else {
      var days = 0, who = 'all', discOnly = false, hc = $('#heatCv');
      var myDisc = (sess.disciplineName || '').toLowerCase();
      var sameDisc = function (s) { return !discOnly || (s.disciplineName || '').toLowerCase() === myDisc; };
      var key = function (s) { return { shooter: HM.sessShooter(s).toLowerCase(), gun: (s.gun || '').toLowerCase(), caliber: HM.sessCaliber(s).id }; };
      var me = key(sess);
      var sameWho = function (s) {
        if (who === 'all') return true;
        var k = key(s);
        if (k.shooter !== me.shooter) return false;
        if ((who === 'gun' || who === 'caliber') && k.gun !== me.gun) return false;
        return who !== 'caliber' || k.caliber === me.caliber;
      };
      redraw = function () {
        var pts = [], sessions = [sess];
        if (days !== 0) {
          var lim = days > 0 ? new Date(Date.now() - days * 86400000) : null;
          sessions = S.sessions.filter(function (s) {
            if (!HM.sameRings(HM.disc(s.discipline), HM.disc(sess.discipline)) || !sameWho(s) || !sameDisc(s)) return false;
            if (!lim) return true;
            var p = (s.date || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]) >= new Date(lim.getFullYear(), lim.getMonth(), lim.getDate());
          });
        }
        sessions.forEach(function (s) { pts = pts.concat(sessionShots(s)); });
        var w = hc.clientWidth, h = hc.clientHeight, ctx = HM.prepCanvas(hc, w, h);
        var hst = HM.stats(d, pts), ext = d.blackR * 0.8;
        pts.forEach(function (p) { ext = Math.max(ext, Math.abs(p.x) + d.cal * 2, Math.abs(p.y) + d.cal * 2); });
        ext = Math.min(ext, HM.viewR(d));
        HM.drawHeatmap(ctx, d, HM.fitMap(w, h, ext), pts, w, h);
        $('#heatCap').textContent = 'Distribution of ' + pts.length + ' shot' + (pts.length === 1 ? '' : 's') + (days === 0 ? ' in this session.' : (days > 0 ? ' from the last ' + days + ' days' : ' from all sessions') + (discOnly ? (myDisc ? ' in ' + sess.disciplineName : ' without a discipline') : '') + (who === 'all' ? '' : ' by ' + $('#whoSel').selectedOptions[0].textContent) + ' (' + sessions.length + ' session' + (sessions.length === 1 ? '' : 's') + ').');
        $('#heatStats').innerHTML = statsGrid(d, hst);
      };
      // A filter only makes sense across sessions, so picking one leaves "This session" for "All".
      var widen = function (on) { if (days === 0 && on) { days = -1; $('#scopeSeg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.dataset.d === '-1'); }); } };
      $('#discSel').onchange = function () { discOnly = this.value === 'same'; widen(discOnly); redraw(); };
      $('#whoSel').onchange = function () {
        who = this.value;
        if (days === 0 && who !== 'all') { days = -1; $('#scopeSeg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.dataset.d === '-1'); }); }
        redraw();
      };
      $('#scopeSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; days = +b.dataset.d; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); redraw(); };
    }
    redraw();
    var onR = function () { redraw(); };
    window.addEventListener('resize', onR);
    cleanup = function () { window.removeEventListener('resize', onR); };
  }

  /* ---------- target editor ---------- */
  function viewEditor(sess, t) {
    var d = HM.sessDisc(sess), idx = sess.targets.indexOf(t);
    setBar('<a class="bar-link" href="#/s/' + sess.id + '/targets">&#8249; ' + esc(sess.name) + '</a>', 'Target ' + (idx + 1), '<a class="bar-btn" href="#/s/' + sess.id + '/targets">Done</a>');
    main.innerHTML =
      '<div class="editor">' +
      '<div class="ed-left">' +
      '<div class="toolbar">' +
      '<div class="seg" id="modeSeg"><button data-m="select" class="on" title="Tap a hit to select it, drag to move it">Move</button><button data-m="add" title="Tap where a shot landed">Add shot</button><button data-m="rings" title="Drag to line the rings up with the picture">Adjust rings</button></div>' +
      '<button class="btn small" id="delShot" disabled>Delete hit</button><button class="btn small" id="undoBtn" disabled>Undo</button><button class="btn small" id="clearBtn">Clear all</button>' +
      '</div>' +
      '<div class="canvas-wrap" id="cwrap"><canvas id="edCv" tabindex="0" aria-label="Target picture with hits"></canvas>' +
      '<div class="zoom"><button id="zIn" aria-label="Zoom in">+</button><button id="zOut" aria-label="Zoom out">&minus;</button><button id="zFit" aria-label="Fit">&#9634;</button></div></div>' +
      '<div class="toolbar">' +
      (t.hasImage ? '<div class="seg small" id="viewSeg"><button data-v="photo" class="on">Photo</button><button data-v="plot">Plot</button></div><label class="check"><input type="checkbox" id="ringsChk"> Show rings</label>' : '') +
      '</div>' +
      '<div class="panel" id="ringsPanel" hidden><p class="small">Drag the picture to move the rings so the dashed yellow circle sits on the edge of the black aiming mark. Use the buttons to resize.</p>' +
      '<div class="row"><span class="lbl">Size</span><button class="btn small" data-r="s-">&minus;</button><button class="btn small" data-r="s+">+</button><span class="lbl">Height</span><button class="btn small" data-r="h-">&minus;</button><button class="btn small" data-r="h+">+</button><span class="lbl">Width</span><button class="btn small" data-r="w-">&minus;</button><button class="btn small" data-r="w+">+</button></div></div>' +
      (t.hasImage ? '<details class="panel" id="detectPanel"><summary>Scan again</summary><div class="row"><label class="holes-lbl">Holes look <select id="holesSel"><option value="light">lighter than the paper</option><option value="dark">darker than the paper</option>' +
        '<option value="mixed">dark on light rings, light on black</option>' +
        '<optgroup label="A colour"><option value="green">green</option><option value="yellow">yellow</option><option value="black">black</option><option value="red">red</option><option value="blue">blue</option></optgroup></select></label>' +
        '<label>Sensitivity <input type="range" id="sensRange" min="0" max="1" step="0.05"></label><button class="btn small primary" id="redetect">Find holes again</button></div></details>' : '') +
      '</div>' +
      '<aside class="ed-right card"><p class="info" id="info"></p><div class="ed-score" id="edScore"></div><div id="edStats"></div><table class="tbl shots"><thead><tr><th>#</th><th>Score</th><th>Position</th></tr></thead><tbody id="shotRows"></tbody></table>' +
      '<p class="small muted">Tip: tap a hit to select it (blue), drag it to fine-tune. The magnifier shows the spot under your finger.</p>' +
      '<div class="row"><button class="btn small danger" id="delTarget">Delete target</button></div></aside>' +
      '</div>';

    var E = { mode: 'select', view: 'photo', scale: 1, ox: 0, oy: 0, sel: -1, drag: null, loupe: null, undo: [], showRings: false, img: null, pointers: {}, pinch: null };
    var cv = $('#edCv'), wrap = $('#cwrap'), ctx, cw = 0, ch = 0;

    function size() {
      cw = wrap.clientWidth;
      ch = Math.round(Math.min(window.innerHeight * 0.72, Math.max(320, cw * (window.innerWidth < 760 ? 1.05 : 0.85))));
      cv.style.height = ch + 'px';
      ctx = HM.prepCanvas(cv, cw, ch);
    }
    function fitTarget() {
      var R = HM.viewR(d) + d.cal, c = t.calib;
      var wpx = 2 * R * c.sx, hpx = 2 * R * c.sy;
      if (!t.hasImage) { wpx = t.imgW; hpx = t.imgH; }
      E.scale = Math.min(cw / wpx, ch / hpx) * 0.98;
      var cx = t.hasImage ? c.cx : t.imgW / 2, cy = t.hasImage ? c.cy : t.imgH / 2;
      E.ox = cw / 2 - cx * E.scale; E.oy = ch / 2 - cy * E.scale;
    }
    function mapFor(scale, ox, oy) { var c = t.calib; return { cx: ox + c.cx * scale, cy: oy + c.cy * scale, sx: c.sx * scale, sy: c.sy * scale }; }
    function drawScene(g, scale, ox, oy) {
      var M = mapFor(scale, ox, oy), pts = HM.targetShotsMM(t);
      g.fillStyle = '#3a3a3c'; g.fillRect(-1e4, -1e4, 3e4, 3e4);
      var photo = E.view === 'photo' && E.img;
      if (photo) {
        g.imageSmoothingEnabled = scale < 2;
        g.drawImage(E.img, ox, oy, t.imgW * scale, t.imgH * scale);
        if (E.showRings || E.mode === 'rings') HM.drawRingOverlay(g, d, M);
        HM.drawShots(g, d, M, pts, { selected: E.sel, fill: 'rgba(255,45,45,0.22)', stroke: '#ff2a2a', lineWidth: 2, selFill: 'rgba(30,110,255,0.3)', selStroke: '#1a6dff', labels: true, minR: 3 });
      } else {
        HM.drawTarget(g, d, M, { fillRect: [ox, oy, t.imgW * scale, t.imgH * scale] });
        if (E.mode === 'rings') HM.drawRingOverlay(g, d, M);
        HM.drawShots(g, d, M, pts, { selected: E.sel, selFill: 'rgba(255,140,0,0.85)', selStroke: '#ff7a00', labels: true, minR: 3 });
      }
    }
    function render() {
      ctx.save(); ctx.clearRect(0, 0, cw, ch);
      drawScene(ctx, E.scale, E.ox, E.oy);
      if (E.loupe) {
        var R = Math.min(80, cw * 0.2), lx = R + 10, ly = R + 10;
        if (E.loupe.cx < cw / 2 && E.loupe.cy < ch / 2) lx = cw - R - 10;
        var z = 3, s2 = E.scale * z;
        ctx.save();
        ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip();
        drawScene(ctx, s2, lx - E.loupe.u * s2, ly - E.loupe.v * s2);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx - R, ly); ctx.lineTo(lx + R, ly); ctx.moveTo(lx, ly - R); ctx.lineTo(lx, ly + R); ctx.stroke();
        ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(lx, ly, R + 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    function panel() {
      var pts = HM.targetShotsMM(t), st = HM.stats(d, pts), rows = '';
      var n = Math.max(sess.shots, t.shots.length);
      for (var i = 0; i < n; i++) {
        if (i < pts.length) {
          var s = st.scores[i], p = pts[i];
          rows += '<tr data-i="' + i + '" class="' + (i === E.sel ? 'sel' : '') + '"><td>' + (i + 1) + '</td><td><b>' + s.int + '</b> <small>' + s.dec.toFixed(1) + (s.x ? ' X' : '') + '</small></td><td class="small">' + HM.windage(p.x) + ', ' + HM.elevation(p.y) + '</td></tr>';
        } else rows += '<tr class="miss"><td>' + (i + 1) + '</td><td>–</td><td class="small muted">not placed</td></tr>';
      }
      $('#shotRows').innerHTML = rows;
      $('#edScore').innerHTML = '<b>' + HM.fmtScore(st) + '</b><span>' + st.totalDec.toFixed(1) + ' · ' + st.n + ' of ' + sess.shots + ' shots</span>' + starBtn(t, 'big');
      $('#edScore .star').onclick = function () { toggleSaved(sess, t).then(panel); };
      $('#edStats').innerHTML = statsGrid(d, st);
      $('#delShot').disabled = E.sel < 0;
      $('#undoBtn').disabled = !E.undo.length;
      main.querySelectorAll('#shotRows tr[data-i]').forEach(function (tr) { tr.onclick = function () { E.sel = +tr.dataset.i; render(); panel(); }; });
    }
    function changed() { saveSoon(sess); render(); panel(); }
    function pushUndo() { E.undo.push(JSON.stringify({ shots: t.shots, calib: t.calib })); if (E.undo.length > 60) E.undo.shift(); }
    function toWorld(x, y) { return { u: (x - E.ox) / E.scale, v: (y - E.oy) / E.scale }; }
    function hit(x, y) {
      var best = -1, bd = Infinity, r = d.cal / 2 * t.calib.sx * E.scale;
      t.shots.forEach(function (s, i) {
        var dx = E.ox + s.u * E.scale - x, dy = E.oy + s.v * E.scale - y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < Math.max(r * 1.1, 16) && dd < bd) { bd = dd; best = i; }
      });
      return best;
    }
    function zoomAt(f, x, y) {
      var ns = Math.max(0.05, Math.min(40, E.scale * f)); f = ns / E.scale;
      E.ox = x - (x - E.ox) * f; E.oy = y - (y - E.oy) * f; E.scale = ns; render();
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function setMode(m) {
      E.mode = m;
      main.querySelectorAll('#modeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
      $('#ringsPanel').hidden = m !== 'rings';
      cv.style.cursor = m === 'add' ? 'crosshair' : (m === 'rings' ? 'move' : 'default');
      render();
    }

    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); cv.focus({ preventScroll: true });
      var p = pos(e); E.pointers[e.pointerId] = p;
      var ids = Object.keys(E.pointers);
      if (ids.length === 2) {
        var a = E.pointers[ids[0]], b = E.pointers[ids[1]];
        if (E.drag && E.drag.type === 'shot' && E.drag.moved === false && E.drag.added) { t.shots.splice(E.drag.i, 1); E.sel = -1; E.undo.pop(); }
        E.drag = null; E.loupe = null;
        E.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, scale: E.scale, ox: E.ox, oy: E.oy };
        render(); return;
      }
      if (E.mode === 'rings') { pushUndo(); E.drag = { type: 'rings', x: p.x, y: p.y, c: { cx: t.calib.cx, cy: t.calib.cy }, shotsMM: HM.targetShotsMM(t) }; return; }
      var h = hit(p.x, p.y);
      if (h >= 0) {
        E.sel = h; var s = t.shots[h];
        E.drag = { type: 'shot', i: h, x: p.x, y: p.y, dx: E.ox + s.u * E.scale - p.x, dy: E.oy + s.v * E.scale - p.y, moved: false };
        render(); panel(); return;
      }
      if (E.mode === 'add') {
        pushUndo();
        var w = toWorld(p.x, p.y);
        t.shots.push({ u: w.u, v: w.v });
        E.sel = t.shots.length - 1;
        E.drag = { type: 'shot', i: E.sel, x: p.x, y: p.y, dx: 0, dy: 0, moved: true, added: true, pushed: true };
        E.loupe = { u: w.u, v: w.v, cx: p.x, cy: p.y };
        changed(); return;
      }
      E.drag = { type: 'pan', x: p.x, y: p.y, ox: E.ox, oy: E.oy, moved: false };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!E.pointers[e.pointerId]) return;
      var p = pos(e); E.pointers[e.pointerId] = p;
      if (E.pinch) {
        var ids = Object.keys(E.pointers); if (ids.length < 2) return;
        var a = E.pointers[ids[0]], b = E.pointers[ids[1]], dd = Math.hypot(a.x - b.x, a.y - b.y);
        var f = dd / E.pinch.d, ns = Math.max(0.05, Math.min(40, E.pinch.scale * f)), k = ns / E.pinch.scale;
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        E.scale = ns; E.ox = mx - (E.pinch.mx - E.pinch.ox) * k; E.oy = my - (E.pinch.my - E.pinch.oy) * k;
        render(); return;
      }
      var D = E.drag; if (!D) return;
      var moved = Math.abs(p.x - D.x) + Math.abs(p.y - D.y) > 3;
      if (D.type === 'pan') { if (moved) D.moved = true; if (D.moved) { E.ox = D.ox + p.x - D.x; E.oy = D.oy + p.y - D.y; render(); } return; }
      if (D.type === 'rings') {
        t.calib.cx = D.c.cx + (p.x - D.x) / E.scale; t.calib.cy = D.c.cy + (p.y - D.y) / E.scale;
        render(); return;
      }
      if (D.type === 'shot') {
        if (!D.moved && !moved) return;
        if (!D.pushed) { pushUndo(); D.pushed = true; }
        D.moved = true;
        var w = toWorld(p.x + D.dx, p.y + D.dy);
        t.shots[D.i] = { u: w.u, v: w.v };
        E.loupe = { u: w.u, v: w.v, cx: p.x, cy: p.y };
        render();
      }
    });
    function endPointer(e) {
      if (!E.pointers[e.pointerId]) return;
      delete E.pointers[e.pointerId];
      if (E.pinch) { if (!Object.keys(E.pointers).length) E.pinch = null; return; }
      var D = E.drag; E.drag = null; E.loupe = null;
      if (!D) return;
      if (D.type === 'pan' && !D.moved) { E.sel = -1; render(); panel(); return; }
      if (D.type === 'rings') { changed(); return; }
      if (D.type === 'shot') { changed(); return; }
    }
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = pos(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
    // iOS starts its own long-press selection and magnifier unless the native touch is cancelled.
    // Pointer events still arrive, so dragging, adding, panning and pinch zoom work as before.
    var noNative = function (e) { e.preventDefault(); };
    cv.addEventListener('touchstart', noNative, { passive: false });
    cv.addEventListener('touchmove', noNative, { passive: false });
    cv.addEventListener('contextmenu', noNative);

    function deleteSel() { if (E.sel < 0) return; pushUndo(); t.shots.splice(E.sel, 1); E.sel = -1; changed(); }
    function undo() { var u = E.undo.pop(); if (!u) return; var o = JSON.parse(u); t.shots = o.shots; t.calib = o.calib; E.sel = -1; changed(); }
    $('#modeSeg').onclick = function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
    $('#delShot').onclick = deleteSel;
    $('#undoBtn').onclick = undo;
    $('#clearBtn').onclick = function () { if (!t.shots.length) return; pushUndo(); t.shots = []; E.sel = -1; changed(); setMode('add'); toast('All hits removed. Tap the target to place them.'); };
    $('#zIn').onclick = function () { zoomAt(1.3, cw / 2, ch / 2); };
    $('#zOut').onclick = function () { zoomAt(1 / 1.3, cw / 2, ch / 2); };
    $('#zFit').onclick = function () { fitTarget(); render(); };
    $('#ringsPanel').onclick = function (e) {
      var b = e.target.closest('button[data-r]'); if (!b) return;
      pushUndo();
      var f = { 's-': [0.99, 0.99], 's+': [1.01, 1.01], 'h-': [1, 0.99], 'h+': [1, 1.01], 'w-': [0.99, 1], 'w+': [1.01, 1] }[b.dataset.r];
      t.calib.sx *= f[0]; t.calib.sy *= f[1]; changed();
    };
    if (t.hasImage) {
      $('#viewSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; E.view = b.dataset.v; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); render(); };
      $('#ringsChk').onchange = function () { E.showRings = this.checked; render(); };
      $('#holesSel').value = t.holes || 'light';
      $('#sensRange').value = t.sens == null ? 0.5 : t.sens;
      $('#redetect').onclick = function () {
        if (!E.img) return;
        busy(true, 'Looking for holes…');
        setTimeout(function () {
          var c = document.createElement('canvas'); c.width = t.imgW; c.height = t.imgH;
          c.getContext('2d').drawImage(E.img, 0, 0, t.imgW, t.imgH);
          t.holes = $('#holesSel').value; t.sens = +$('#sensRange').value;
          var r = analyseCanvas(c, d, sess.shots, { sens: t.sens, holes: t.holes });
          pushUndo();
          t.calib = r.calib; t.shots = r.shots; t.info = r.message; t.found = r.found; E.sel = -1;
          $('#info').textContent = t.info; $('#info').className = 'info' + (t.found ? '' : ' warn');
          busy(false); fitTarget(); changed();
        }, 40);
      };
    }
    $('#delTarget').onclick = function () {
      if (!confirm('Delete this target?')) return;
      if (t.saved && !confirmDeleteSaved(1, HM.sessShooter(sess))) return;
      sess.targets.splice(sess.targets.indexOf(t), 1);
      HM.store.deleteImage(t.id); save(sess).then(function () { location.hash = '#/s/' + sess.id + '/targets'; });
    };
    function onKey(e) {
      if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel >= 0) { e.preventDefault(); deleteSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (E.sel >= 0 && /^Arrow/.test(e.key)) {
        e.preventDefault(); pushUndo();
        var st = (e.shiftKey ? 5 : 1) / Math.max(0.5, E.scale), s = t.shots[E.sel];
        if (e.key === 'ArrowLeft') s.u -= st; if (e.key === 'ArrowRight') s.u += st; if (e.key === 'ArrowUp') s.v -= st; if (e.key === 'ArrowDown') s.v += st;
        changed();
      }
    }
    document.addEventListener('keydown', onKey);
    var onR = function () { var cx = (cw / 2 - E.ox) / E.scale, cy = (ch / 2 - E.oy) / E.scale; size(); E.ox = cw / 2 - cx * E.scale; E.oy = ch / 2 - cy * E.scale; render(); };
    window.addEventListener('resize', onR);
    cleanup = function () { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onR); clearTimeout(saveTimer); sortShots(t, d); save(sess); };

    $('#info').textContent = t.info || '';
    $('#info').className = 'info' + (t.found === false ? ' warn' : '');
    size(); fitTarget();
    if (!t.hasImage) { E.view = 'plot'; if (!t.shots.length) setMode('add'); }
    render(); panel();
    if (t.hasImage) {
      HM.store.getImage(t.id).then(function (b) {
        if (!b) { E.view = 'plot'; render(); toast('The photo for this target is missing; showing the plot.'); return; }
        var url = URL.createObjectURL(b);
        loadImage(url).then(function (img) { E.img = img; render(); });
      });
    }
  }

  /* ---------- router ---------- */
  var ready = false, demoRunning = false;
  function route() {
    if (!ready) return;
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'demo') {
      if (demoRunning) return;
      demoRunning = true;
      makeDemo().then(function (s) { demoRunning = false; location.replace('#/s/' + s.id); }, function () { demoRunning = false; });
      return;
    }
    if (h[0] === 'saved') { viewSaved(h[1] ? decodeURIComponent(h[1]) : null); window.scrollTo(0, 0); return; }
    if (h[0] === 's') {
      var sess = findSession(h[1]);
      if (!sess) { location.hash = '#/'; return; }
      if (h[2] === 't') {
        var t = sess.targets.filter(function (x) { return x.id === h[3]; })[0];
        if (!t) { location.hash = '#/s/' + sess.id; return; }
        viewEditor(sess, t);
      } else viewSession(sess, h[2]);
    } else viewSessions();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  HM.store.allSessions().then(function (list) {
    S.sessions = list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || b.created - a.created; });
    ready = true;
    route();
  });
})(window.HM);
