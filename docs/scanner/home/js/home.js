/* HitMark website: panels, phone navigation, slider and the drawn app screens. */
(function (HM) {
  'use strict';

  /* ----- panels ----- */
  var links = document.querySelectorAll('.nav a[data-panel]');
  function show(name) {
    var el = document.getElementById('panel-' + name);
    if (!el) name = 'home';
    document.querySelectorAll('section.page').forEach(function (s) { s.hidden = s.id !== 'panel-' + name; });
    document.querySelectorAll('.nav li').forEach(function (li) {
      var a = li.querySelector('a'); li.classList.toggle('active', a.dataset.panel === name);
    });
    drawAll();
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); history.replaceState(null, '', a.dataset.panel === 'home' ? location.pathname : '#' + a.dataset.panel); show(a.dataset.panel); });
  });
  var sel = document.getElementById('navSelect');
  sel.addEventListener('change', function () {
    var v = sel.value; sel.value = '';
    if (!v) return;
    if (v.charAt(0) === '#') { history.replaceState(null, '', v === '#home' ? location.pathname : v); show(v.slice(1)); }
    else location.href = v;
  });

  /* ----- slider ----- */
  var slides = document.querySelectorAll('.slide'), dots = document.querySelectorAll('.dots a');
  var cur = window.innerWidth < 768 ? 1 : 0, timer = null;
  function go(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
  }
  function auto() { clearInterval(timer); timer = setInterval(function () { go(cur + 1); }, 20000); }
  dots.forEach(function (d) { d.addEventListener('click', function (e) { e.preventDefault(); go(+d.dataset.i); auto(); }); });
  go(cur); auto();
  // Phones show the heat-map slide first, wider screens the session slide.
  if (window.matchMedia) {
    var mq = window.matchMedia('(max-width: 767px)');
    var onMq = function () { go(mq.matches ? 1 : 0); auto(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  /* ----- drawn screens ----- */
  var FONT = '"Helvetica Neue", helvetica, Arial, sans-serif';
  var sample = null;

  function statusBar(c, w) {
    c.fillStyle = '#f7f7f7'; c.fillRect(0, 0, w, 14);
    c.fillStyle = '#000'; c.font = '8px ' + FONT; c.textBaseline = 'middle';
    c.textAlign = 'left'; c.fillText('Carrier', 4, 7);
    c.textAlign = 'center'; c.font = 'bold 8px ' + FONT; c.fillText('15:57', w / 2, 7);
    c.fillRect(w - 20, 4, 14, 6); c.fillRect(w - 6, 5.5, 1.5, 3);
  }
  function navBar(c, w, back, title, right) {
    c.fillStyle = '#f7f7f7'; c.fillRect(0, 14, w, 22);
    c.fillStyle = '#d0d0d0'; c.fillRect(0, 36, w, 0.5);
    c.textBaseline = 'middle';
    if (back) { c.fillStyle = '#1a7cf2'; c.font = '11.5px ' + FONT; c.textAlign = 'left'; c.fillText('‹ ' + back, 5, 25); }
    if (right) { c.fillStyle = '#1a7cf2'; c.font = '11.5px ' + FONT; c.textAlign = 'right'; c.fillText(right, w - 6, 25); }
    c.fillStyle = '#000'; c.font = 'bold 11.5px ' + FONT; c.textAlign = 'center'; c.fillText(title, w / 2, 25);
  }
  function group(d, n, seed, spread) {
    var r = HM.rng(seed), pts = [], gx = -0.6 * spread * 0.1, gy = 0.3 * spread * 0.1;
    for (var i = 0; i < n; i++) pts.push({ x: gx + r.gauss() * spread, y: gy + r.gauss() * spread });
    return pts;
  }

  var screens = {
    disciplines: function (c, w, h) {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      statusBar(c, w); navBar(c, w, null, 'Target types', '+');
      c.fillStyle = '#1a7cf2'; c.font = '11.5px ' + FONT; c.textAlign = 'left'; c.fillText('Edit', 6, 25);
      var rows = [['ap10', 'Me / Air pistol', '5 x 4.5 mm (.177")'], ['ar10', 'Me / Air rifle', '1 x 4.5 mm (.177")'], ['p25', 'Club / Sport pistol', '5 x .22 LR (5.6 mm)'], ['r50', 'Me / Small-bore', '1 x .22 LR (5.6 mm)'], ['ap10', 'Club / Juniors', '5 x 4.5 mm (.177")']];
      var y = 37, rh = 50;
      rows.forEach(function (r, i) {
        var d = HM.disc(r[0]);
        c.fillStyle = '#f6e7c8'; c.fillRect(0, y, 48, rh);
        var M = HM.fitMap(44, 44, HM.outerR(d) * 0.55); M.cx += 2; M.cy += y + 3;
        c.save(); c.beginPath(); c.rect(0, y, 48, rh); c.clip();
        HM.drawTarget(c, d, M, { numbers: false, paper: false });
        c.restore();
        c.fillStyle = '#000'; c.font = '11px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        c.fillText(d.name.replace(' m ', 'm ').replace(' / 50m Pistol', ''), 55, y + 15);
        c.fillStyle = '#4a7fbf'; c.font = '7.5px ' + FONT;
        c.fillText(r[1], 55, y + 28); c.fillText(r[2], 55, y + 40);
        c.fillStyle = '#e0e0e0'; c.fillRect(48, y + rh - 0.5, w - 48, 0.5);
        y += rh;
      });
      c.fillStyle = '#f7f7f7'; c.fillRect(0, h - 32, w, 32); c.fillStyle = '#d0d0d0'; c.fillRect(0, h - 32, w, 0.5);
      c.fillStyle = '#1a7cf2'; c.font = '7px ' + FONT; c.textAlign = 'center'; c.fillText('Sessions', w * 0.25, h - 5); c.fillStyle = '#999'; c.fillText('Help', w * 0.75, h - 5);
      c.fillStyle = '#1a7cf2'; c.fillRect(w * 0.25 - 8, h - 27, 16, 13);
      c.strokeStyle = '#999'; c.beginPath(); c.arc(w * 0.75, h - 20, 7, 0, Math.PI * 2); c.stroke();
    },
    session: function (c, w, h) {
      var d = HM.disc('ap10');
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      statusBar(c, w); navBar(c, w, 'Sessions', 'Session');
      var top = 37, ph = 230;
      c.fillStyle = HM.PAPER; c.fillRect(0, top, w, ph);
      var M = HM.fitMap(w, ph, HM.outerR(d) * 1.02); M.cy += top;
      c.save(); c.beginPath(); c.rect(0, top, w, ph); c.clip();
      HM.drawTarget(c, d, M, { paper: false });
      var pts = group(d, 60, 42, 6.5);
      HM.drawShots(c, d, M, pts, { fill: 'rgba(40,70,255,0.55)', stroke: 'rgba(160,190,255,0.8)', lineWidth: 0.5 });
      c.restore();
      var st = HM.stats(d, pts);
      c.fillStyle = '#000'; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.font = 'bold 10.5px ' + FONT; c.fillText(new Date().toLocaleDateString('en-GB'), 5, top + 12);
      c.font = '5px ' + FONT; c.fillText('DATE', 5, top + 18);
      c.textAlign = 'right'; c.font = 'bold 10.5px ' + FONT; c.fillText(HM.fmtScore(st), w - 5, top + 12);
      c.fillStyle = '#1a7cf2'; c.font = '5px ' + FONT; c.fillText('SCORE', w - 5, top + 18);
      c.fillStyle = '#f2f2f2'; c.fillRect(0, top + ph, w, 34);
      c.fillStyle = '#000'; c.font = '9px ' + FONT; c.textAlign = 'left';
      c.fillText('Windage: ' + HM.windage(st.mx), 7, top + ph + 13); c.fillText('Elevation: ' + HM.elevation(st.my), 7, top + ph + 26);
      c.fillText('Mean Radius: ' + HM.fmtMM(st.mr), w / 2 + 5, top + ph + 13); c.fillText('Max Spread: ' + HM.fmtMM(st.es), w / 2 + 5, top + ph + 26);
      c.fillStyle = '#f7f7f7'; c.fillRect(0, h - 44, w, 44); c.fillStyle = '#d0d0d0'; c.fillRect(0, h - 44, w, 0.5);
      c.strokeStyle = '#1a7cf2'; c.lineWidth = 1;
      c.strokeRect(13, h - 30, 11, 12); c.beginPath(); c.moveTo(18.5, h - 34); c.lineTo(18.5, h - 22); c.stroke();
      c.strokeRect(w / 2 - 9, h - 30, 18, 12); c.beginPath(); c.arc(w / 2, h - 24, 4, 0, Math.PI * 2); c.stroke();
      for (var k = 0; k < 3; k++) { c.beginPath(); c.moveTo(w - 30, h - 30 + k * 4); c.lineTo(w - 22, h - 33 + k * 4); c.lineTo(w - 14, h - 30 + k * 4); c.lineTo(w - 22, h - 27 + k * 4); c.closePath(); c.stroke(); }
    },
    heatmap: function (c, w, h) {
      var d = HM.disc('ap10');
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      statusBar(c, w); navBar(c, w, 'Sessions', 'Heat map');
      var top = 37, ph = 230;
      c.save(); c.translate(0, top); c.beginPath(); c.rect(0, 0, w, ph); c.clip();
      HM.drawHeatmap(c, d, HM.fitMap(w, ph, d.blackR * 2.4), group(d, 60, 7, 6), w, ph, { sigma: 5, noRings: true });
      c.restore();
      c.fillStyle = '#333'; c.font = '8px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('Distribution of 60 shots from the last 30 days.', w / 2, top + ph + 16);
      var labels = ['1', '7', '30', '90'], sw = (w - 30) / 4;
      labels.forEach(function (l, i) {
        var x = 15 + i * sw;
        c.fillStyle = i === 2 ? '#1a7cf2' : '#fff'; c.fillRect(x, top + ph + 24, sw, 14);
        c.strokeStyle = '#1a7cf2'; c.strokeRect(x + 0.5, top + ph + 24.5, sw - 1, 13);
        c.fillStyle = i === 2 ? '#fff' : '#1a7cf2'; c.fillText(l, x + sw / 2, top + ph + 34);
      });
    },
    editor: function (c, w, h) {
      var d = HM.disc('ap10');
      c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
      statusBar(c, w);
      c.fillStyle = '#1c1c1e'; c.fillRect(0, 14, w, 22);
      c.fillStyle = '#fff'; c.font = 'bold 10px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Preview', w / 2, 25);
      var top = 36, ph = 250;
      if (!sample) sample = HM.makeSample(d, { shots: 10, seed: 777, W: 700, H: 760, rotate: 0.01 });
      var cv = sample.canvas, k = Math.max(w / cv.width, ph / cv.height) * 1.6;
      c.save(); c.beginPath(); c.rect(0, top, w, ph); c.clip();
      var ox = w / 2 - cv.width / 2 * k, oy = top + ph / 2 - cv.height / 2 * k;
      c.drawImage(cv, ox, oy, cv.width * k, cv.height * k);
      c.fillStyle = 'rgba(40,40,40,0.45)'; c.fillRect(0, top, w, ph);
      var M = { cx: ox + (sample.truth[0].u - sample.truth[0].x * sample.ppm) * k, cy: oy + (sample.truth[0].v + sample.truth[0].y * sample.ppm) * k, sx: sample.ppm * k, sy: sample.ppm * k };
      HM.drawShots(c, d, M, sample.truth, { selected: 2, fill: 'rgba(255,45,45,0.2)', stroke: '#ff2a2a', lineWidth: 1.2, selFill: 'rgba(30,110,255,0.3)', selStroke: '#1a6dff' });
      c.fillStyle = 'rgba(40,40,40,0.9)'; c.fillRect(w / 2 - 56, top + 8, 112, 18);
      c.fillStyle = '#fff'; c.font = '8px ' + FONT; c.fillText('Move', w / 2 - 28, top + 17); c.fillText('Delete', w / 2 + 28, top + 17);
      c.fillStyle = '#666'; c.fillRect(w / 2, top + 10, 0.5, 14);
      c.restore();
      var st = HM.stats(d, sample.truth);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '9px ' + FONT;
      c.fillText('Score: ' + st.total + ' (' + st.totalDec.toFixed(1) + ')', 8, top + ph + 14);
      c.font = '7.5px ' + FONT;
      c.fillText(st.scores.slice(0, 6).map(function (s) { return s.dec.toFixed(1); }).join(' '), 8, top + ph + 28);
      c.fillStyle = '#1c1c1e'; c.fillRect(0, h - 26, w, 26);
      c.fillStyle = '#fff'; c.font = '8px ' + FONT; c.textAlign = 'left'; c.fillText('Retake', 8, h - 13);
      c.textAlign = 'right'; c.fillText('Use', w - 8, h - 13);
    }
  };

  function drawAll() {
    document.querySelectorAll('canvas.screen').forEach(function (cv) {
      if (!cv.offsetParent && cv.closest('section[hidden]')) return;
      var w = 230, h = 345, f = screens[cv.dataset.screen];
      if (!f) return;
      var dpr = Math.max(2, window.devicePixelRatio || 1);
      if (cv.width === w * dpr) return;
      cv.width = w * dpr; cv.height = h * dpr;
      var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      try { f(c, w, h); } catch (e) { /* drawing is decorative */ }
      try {
        var img = new Image();
        img.className = cv.className; img.alt = cv.getAttribute('aria-label') || 'App screen';
        img.width = w; img.height = h;
        img.src = cv.toDataURL('image/png');
        cv.parentNode.replaceChild(img, cv);
      } catch (e2) { /* keep the canvas */ }
    });
  }

  var start = (location.hash || '').slice(1);
  show(start && document.getElementById('panel-' + start) ? start : 'home');
})(window.HM);
