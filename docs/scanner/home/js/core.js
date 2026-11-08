/* ShootingScanner core: target definitions, scoring and group statistics. */
window.HM = window.HM || {};
(function (HM) {
  'use strict';

  // ISSF target dimensions in millimetres.
  // r10: radius of the 10 ring, step: ring width, blackR: aiming mark radius,
  // innerR: inner-ten ring radius (0 = none), xMaxD: furthest centre distance that is an inner ten.
  HM.DISCIPLINES = [
    { id: 'ap10', name: 'ISSF 10 m Air Pistol', short: '10m Air Pistol', cal: 4.5, r10: 5.75, step: 8, blackR: 29.75, innerR: 2.5, xMaxD: 4.75, numbers: 8, shots: 5, sigma: 7 },
    // Training-only air pistol card: same rings, but the card is only 140 mm square, so ring 1 shows only in the
    // corners and ring 2 touches the edges. card: half the card side (mm); numFrom: lowest printed ring number;
    // rings: target type with the same ring sizes (its sessions are shown together in the heat map).
    { id: 'ap10t', name: 'ISSF 10 m Air Pistol – training card', short: '10m Air Pistol training', cal: 4.5, r10: 5.75, step: 8, blackR: 29.75, innerR: 2.5, xMaxD: 4.75, numbers: 8, numFrom: 2, card: 70, rings: 'ap10', shots: 5, sigma: 7 },
    { id: 'ar10', name: 'ISSF 10 m Air Rifle', short: '10m Air Rifle', cal: 4.5, r10: 0.25, step: 2.5, blackR: 15.25, innerR: 0, xMaxD: 2.0, numbers: 8, shots: 1, sigma: 2.2, dot: true },
    { id: 'p25', name: 'ISSF 25 m Precision / 50 m Pistol', short: '25m/50m Pistol', cal: 5.6, r10: 25, step: 25, blackR: 100, innerR: 12.5, xMaxD: 15.3, numbers: 8, shots: 5, sigma: 22 },
    { id: 'r50', name: 'ISSF 50 m Rifle', short: '50m Rifle', cal: 5.6, r10: 5.2, step: 8, blackR: 56.2, innerR: 2.5, xMaxD: 5.3, numbers: 8, shots: 1, sigma: 5 }
  ];

  HM.disc = function (id) {
    for (var i = 0; i < HM.DISCIPLINES.length; i++) if (HM.DISCIPLINES[i].id === id) return HM.DISCIPLINES[i];
    return HM.DISCIPLINES[0];
  };

  // Calibers a session can use. mm is the bullet diameter, which sets the size of each hole.
  HM.CALIBERS = [
    { id: '4.5mm', name: '4,5 mm', mm: 4.5 },
    { id: '22', name: '.22', mm: 5.6 },
    { id: '32', name: '.32', mm: 7.9 },
    { id: '38spl', name: '.38 Special', mm: 9.1 },
    { id: '9mm', name: '9 mm', mm: 9.0 },
    { id: '357mag', name: '.357 Magnum', mm: 9.1 },
    { id: '44', name: '.44', mm: 10.9 },
    { id: '45', name: '.45', mm: 11.5 }
  ];
  HM.caliber = function (id) {
    for (var i = 0; i < HM.CALIBERS.length; i++) if (HM.CALIBERS[i].id === id) return HM.CALIBERS[i];
    return null;
  };
  // The caliber a target type is normally shot with (used for new sessions and for sessions saved before calibers existed).
  HM.defaultCaliber = function (d) { return d.cal < 5 ? '4.5mm' : '22'; };
  HM.sessCaliber = function (sess) { return HM.caliber(sess.caliber) || HM.caliber(HM.defaultCaliber(HM.disc(sess.discipline))); };
  HM.sessShooter = function (sess) { return sess.shooter || 'Me'; };
  // The target type of a session with the hole size of the session's caliber.
  var discCache = {};
  HM.sessDisc = function (sess) {
    var d = HM.disc(sess.discipline), c = HM.sessCaliber(sess), k = d.id + '|' + c.id;
    if (!discCache[k]) { discCache[k] = Object.assign({}, d, { cal: c.mm, caliber: c.id }); }
    return discCache[k];
  };

  // Half the side of the printed card (mm), and how far from the centre a plot has to reach to show it all.
  HM.cardHalf = function (d) { return d.card || HM.outerR(d) + Math.max(6, d.step * 0.6); };
  HM.viewR = function (d) { return d.card ? d.card + d.cal * 0.5 : HM.outerR(d) + d.cal; };
  HM.sameRings = function (a, b) { return (a.rings || a.id) === (b.rings || b.id); };

  HM.ringR = function (d, n) { return d.r10 + (10 - n) * d.step; };
  HM.outerR = function (d) { return d.r10 + 9 * d.step; };

  // ISSF outward gauging: a shot scores the ring its edge touches.
  // cal (optional) overrides the hole diameter, for groups that mix calibers.
  HM.score = function (d, x, y, cal) {
    var dist = Math.sqrt(x * x + y * y);
    var dec = 1 + (HM.outerR(d) + (cal || d.cal) / 2 - dist) / d.step;
    if (dec < 1) return { dec: 0, int: 0, x: false, dist: dist };
    dec = Math.min(10.9, Math.floor(dec * 10 + 1e-6) / 10);
    return { dec: dec, int: Math.min(10, Math.floor(dec + 1e-9)), x: dist <= d.xMaxD, dist: dist };
  };

  // Shots are stored in picture pixels (u, v); the calibration maps them to millimetres.
  HM.toMM = function (calib, s) {
    return { x: (s.u - calib.cx) / calib.sx, y: -(s.v - calib.cy) / calib.sy };
  };
  HM.toPx = function (calib, p) {
    return { u: calib.cx + p.x * calib.sx, v: calib.cy - p.y * calib.sy };
  };
  HM.targetShotsMM = function (t) {
    return t.shots.map(function (s) { return HM.toMM(t.calib, s); });
  };

  HM.stats = function (d, pts) {
    var n = pts.length, st = { n: n, total: 0, totalDec: 0, xs: 0, scores: [], mx: 0, my: 0, mr: 0, es: 0, avg: 0, avgDec: 0, w: 0, h: 0 };
    if (!n) return st;
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    pts.forEach(function (p) {
      var s = HM.score(d, p.x, p.y, p.cal);
      st.scores.push(s);
      st.total += s.int; st.totalDec += s.dec; if (s.x) st.xs++;
      st.mx += p.x; st.my += p.y;
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    });
    st.mx /= n; st.my /= n;
    pts.forEach(function (p) { st.mr += Math.hypot(p.x - st.mx, p.y - st.my); });
    st.mr /= n;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) st.es = Math.max(st.es, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    st.w = maxx - minx; st.h = maxy - miny;
    st.avg = st.total / n; st.avgDec = st.totalDec / n;
    st.totalDec = Math.round(st.totalDec * 10) / 10;
    return st;
  };

  HM.fmtScore = function (st) { return st.total + '-' + st.xs + 'x'; };
  HM.fmtMM = function (v) { return (Math.round(v * 10) / 10).toFixed(1) + ' mm'; };
  HM.windage = function (v) { return (Math.abs(v) < 0.05 ? '' : (v > 0 ? '→ ' : '← ')) + HM.fmtMM(Math.abs(v)); };
  HM.elevation = function (v) { return (Math.abs(v) < 0.05 ? '' : (v > 0 ? '↑ ' : '↓ ')) + HM.fmtMM(Math.abs(v)); };
  HM.describeOffset = function (st) {
    if (!st.n) return '';
    var h = Math.abs(st.mx) < 0.05 ? 'centred left/right' : HM.fmtMM(Math.abs(st.mx)) + (st.mx > 0 ? ' right' : ' left');
    var v = Math.abs(st.my) < 0.05 ? 'centred up/down' : HM.fmtMM(Math.abs(st.my)) + (st.my > 0 ? ' high' : ' low');
    return 'Group centre is ' + h + ' and ' + v + ' of the target centre.';
  };

  // Small seeded random generator (for repeatable samples).
  HM.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    var r = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    r.gauss = function () { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return r;
  };

  HM.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
})(window.HM);
