/* ShootingScanner photo analysis: finds the black aiming mark, calibrates the rings and detects shot holes.
   Works on plain ImageData so it can run anywhere a canvas exists. */
(function (HM) {
  'use strict';

  function otsu(gray, stride) {
    var hist = new Float64Array(256), n = 0;
    for (var i = 0; i < gray.length; i += stride) { hist[gray[i] | 0]++; n++; }
    var sum = 0; for (var t = 0; t < 256; t++) sum += t * hist[t];
    var sumB = 0, wB = 0, best = 0, thr = 100;
    for (t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sumB += t * hist[t];
      var mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  // Connected components (4-neighbour) of a 0/1 mask. Returns labels and per-component boxes.
  function components(mask, W, H, wantPixels) {
    var labels = new Int32Array(W * H), comps = [], stack = new Int32Array(W * H), id = 0;
    for (var p = 0; p < W * H; p++) {
      if (!mask[p] || labels[p]) continue;
      id++;
      var c = { id: id, area: 0, minx: W, maxx: 0, miny: H, maxy: 0, sx: 0, sy: 0, pix: wantPixels ? [] : null };
      var sp = 0; stack[sp++] = p; labels[p] = id;
      while (sp) {
        var q = stack[--sp], x = q % W, y = (q - x) / W;
        c.area++; c.sx += x; c.sy += y;
        if (x < c.minx) c.minx = x; if (x > c.maxx) c.maxx = x; if (y < c.miny) c.miny = y; if (y > c.maxy) c.maxy = y;
        if (c.pix) c.pix.push(q);
        if (x > 0 && mask[q - 1] && !labels[q - 1]) { labels[q - 1] = id; stack[sp++] = q - 1; }
        if (x < W - 1 && mask[q + 1] && !labels[q + 1]) { labels[q + 1] = id; stack[sp++] = q + 1; }
        if (y > 0 && mask[q - W] && !labels[q - W]) { labels[q - W] = id; stack[sp++] = q - W; }
        if (y < H - 1 && mask[q + W] && !labels[q + W]) { labels[q + W] = id; stack[sp++] = q + W; }
      }
      comps.push(c);
    }
    return { labels: labels, comps: comps };
  }

  function integral(src, W, H) {
    var I = new Float64Array((W + 1) * (H + 1));
    for (var y = 0; y < H; y++) {
      var row = 0;
      for (var x = 0; x < W; x++) {
        row += src[y * W + x];
        I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
      }
    }
    return I;
  }
  function boxSum(I, W, H, x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    if (x1 < x0 || y1 < y0) return 0;
    var w = W + 1;
    return I[(y1 + 1) * w + x1 + 1] - I[y0 * w + x1 + 1] - I[(y1 + 1) * w + x0] + I[y0 * w + x0];
  }

  // Morphological opening with a square of half-size e: removes thin lines and print.
  function opening(mask, W, H, e) {
    var I = integral(mask, W, H), full = (2 * e + 1) * (2 * e + 1);
    var er = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (x - e < 0 || y - e < 0 || x + e >= W || y + e >= H) continue;
      if (boxSum(I, W, H, x - e, y - e, x + e, y + e) >= full) er[y * W + x] = 1;
    }
    var J = integral(er, W, H), out = new Uint8Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (boxSum(J, W, H, x - e, y - e, x + e, y + e) > 0) out[y * W + x] = 1;
    }
    return out;
  }

  // Solve a small linear system (Gaussian elimination).
  function solve(A, b) {
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      var t = A[i]; A[i] = A[piv]; A[piv] = t; var tb = b[i]; b[i] = b[piv]; b[piv] = tb;
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (k = i + 1; k < n; k++) {
        var f = A[k][i] / A[i][i];
        for (j = i; j < n; j++) A[k][j] -= f * A[i][j];
        b[k] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  // Axis-aligned ellipse fit: A x^2 + C y^2 + D x + E y = 1 around (ox, oy).
  function fitEllipse(pts, ox, oy) {
    var M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], r = [0, 0, 0, 0];
    pts.forEach(function (p) {
      var x = p[0] - ox, y = p[1] - oy, v = [x * x, y * y, x, y];
      for (var i = 0; i < 4; i++) { r[i] += v[i]; for (var j = 0; j < 4; j++) M[i][j] += v[i] * v[j]; }
    });
    var s = solve(M, r);
    if (!s || s[0] <= 0 || s[1] <= 0) return null;
    var A = s[0], C = s[1], D = s[2], E = s[3];
    var cx = -D / (2 * A), cy = -E / (2 * C), G = 1 + A * cx * cx + C * cy * cy;
    if (G <= 0) return null;
    return { cx: cx + ox, cy: cy + oy, a: Math.sqrt(G / A), b: Math.sqrt(G / C) };
  }

  function median(arr) {
    if (!arr.length) return 0;
    arr.sort(function (a, b) { return a - b; });
    return arr[arr.length >> 1];
  }

  function dilate(mask, W, H, e) {
    var I = integral(mask, W, H), out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (boxSum(I, W, H, x - e, y - e, x + e, y + e) > 0) out[y * W + x] = 1;
    return out;
  }
  function erode(mask, W, H, e) {
    var I = integral(mask, W, H), out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var x0 = Math.max(0, x - e), y0 = Math.max(0, y - e), x1 = Math.min(W - 1, x + e), y1 = Math.min(H - 1, y + e);
      if (boxSum(I, W, H, x0, y0, x1, y1) >= (x1 - x0 + 1) * (y1 - y0 + 1)) out[y * W + x] = 1;
    }
    return out;
  }

  function findAimingMark(gray, W, H, T) {
    var N = W * H, dark = new Uint8Array(N);
    for (var i = 0; i < N; i++) dark[i] = gray[i] < T ? 1 : 0;
    // close the thin white ring lines printed inside the black
    var ec = Math.max(2, Math.round(Math.min(W, H) / 250));
    dark = erode(dilate(dark, W, H, ec), W, H, ec);
    var cc = components(dark, W, H, false), best = null, bestScore = 0;
    cc.comps.forEach(function (c) {
      if (c.area < N * 0.002) return;
      if (c.minx === 0 || c.miny === 0 || c.maxx === W - 1 || c.maxy === H - 1) return;
      var w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1, ar = w / h;
      if (ar < 0.55 || ar > 1.8) return;
      var fill = c.area / (Math.PI * w * h / 4);
      if (fill < 0.4 || fill > 1.2) return;
      var score = c.area * fill;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    if (!best) return null;
    var cx0 = (best.minx + best.maxx) / 2, cy0 = (best.miny + best.maxy) / 2;
    var a0 = (best.maxx - best.minx + 1) / 2, b0 = (best.maxy - best.miny + 1) / 2;
    // Refine with edge points along rays.
    var pts = [];
    for (var k = 0; k < 360; k++) {
      var ang = k * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      var rr = (a0 * b0) / Math.sqrt(Math.pow(b0 * ca, 2) + Math.pow(a0 * sa, 2));
      var bestT = -1, bestD = Infinity, prev = null;
      for (var t = rr * 0.7; t <= rr * 1.3; t += 0.5) {
        var x = cx0 + ca * t, y = cy0 + sa * t;
        var xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) break;
        var g = gray[yi * W + xi];
        if (prev !== null && prev < T && g >= T) {
          var tt = t - 0.5 + 0.5 * (T - prev) / Math.max(1e-6, g - prev);
          if (Math.abs(tt - rr) < bestD) { bestD = Math.abs(tt - rr); bestT = tt; }
        }
        prev = g;
      }
      if (bestT > 0) pts.push([cx0 + ca * bestT, cy0 + sa * bestT]);
    }
    var e = pts.length > 40 ? fitEllipse(pts, cx0, cy0) : null;
    for (var it = 0; e && it < 3; it++) {
      var keep = pts.filter(function (p) {
        var v = Math.sqrt(Math.pow((p[0] - e.cx) / e.a, 2) + Math.pow((p[1] - e.cy) / e.b, 2));
        return Math.abs(v - 1) < (it === 0 ? 0.05 : 0.025);
      });
      if (keep.length < 40) break;
      var e2 = fitEllipse(keep, e.cx, e.cy);
      if (!e2) break;
      e = e2; pts = keep;
    }
    if (!e || Math.abs(e.a / a0 - 1) > 0.15 || Math.abs(e.b / b0 - 1) > 0.15) e = { cx: cx0, cy: cy0, a: a0, b: b0 };
    return e;
  }

  // Split a blob of n overlapping holes with k-means on its pixels.
  function splitBlob(pix, W, n) {
    var xs = pix.map(function (q) { return q % W; }), ys = pix.map(function (q) { return (q / W) | 0; });
    var m = pix.length, cx = 0, cy = 0, i, j;
    for (i = 0; i < m; i++) { cx += xs[i]; cy += ys[i]; }
    cx /= m; cy /= m;
    var centers = [], far = 0, fd = -1;
    for (i = 0; i < m; i++) { var d0 = Math.hypot(xs[i] - cx, ys[i] - cy); if (d0 > fd) { fd = d0; far = i; } }
    centers.push([xs[far], ys[far]]);
    while (centers.length < n) {
      fd = -1;
      for (i = 0; i < m; i++) {
        var dm = Infinity;
        for (j = 0; j < centers.length; j++) dm = Math.min(dm, Math.hypot(xs[i] - centers[j][0], ys[i] - centers[j][1]));
        if (dm > fd) { fd = dm; far = i; }
      }
      centers.push([xs[far], ys[far]]);
    }
    for (var it = 0; it < 15; it++) {
      var acc = centers.map(function () { return [0, 0, 0]; });
      for (i = 0; i < m; i++) {
        var bj = 0, bd = Infinity;
        for (j = 0; j < n; j++) { var dd = Math.pow(xs[i] - centers[j][0], 2) + Math.pow(ys[i] - centers[j][1], 2); if (dd < bd) { bd = dd; bj = j; } }
        acc[bj][0] += xs[i]; acc[bj][1] += ys[i]; acc[bj][2]++;
      }
      for (j = 0; j < n; j++) if (acc[j][2]) centers[j] = [acc[j][0] / acc[j][2], acc[j][1] / acc[j][2]];
    }
    return centers;
  }

  /* imageData: ImageData-like {width, height, data}. d: discipline.
     opts: { expected: shots per target, sensitivity: 0..1, holes: 'light'|'dark' }
     Returns { found, calib, shots: [{u, v, conf}], candidates, message } in the image's pixels. */
  // Hole colours that can be picked in "Scan again": hue centre and half-width in degrees.
  var HOLE_HUES = { red: [0, 28], yellow: [55, 20], green: [125, 50], blue: [215, 40] };

  // Hue (0-360) and saturation (0-1) of an RGB pixel.
  function hueSat(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, h = 0;
    if (c > 0) {
      if (mx === r) h = ((g - b) / c + 6) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4;
      h *= 60;
    }
    return [h, mx ? c / mx : 0];
  }

  /* opts.holes says what the holes look like:
     'light'  – lighter than the paper (and lighter than the black) – the default
     'dark' / 'black' – darker than the paper (not visible inside the black)
     'mixed'  – darker than the paper on the light rings, lighter than the black on the dark rings
     'red' | 'yellow' | 'green' | 'blue' – that colour, both on the paper and on the black */
  HM.analyse = function (imageData, d, opts) {
    opts = opts || {};
    var sens = opts.sensitivity == null ? 0.5 : opts.sensitivity;
    var W = imageData.width, H = imageData.height, px = imageData.data, N = W * H;
    var gray = new Float32Array(N), br = new Float32Array(N), i;
    for (i = 0; i < N; i++) {
      var r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b; br[i] = b - r;
    }
    var T = otsu(gray, Math.max(1, Math.floor(N / 200000)));
    var e = findAimingMark(gray, W, H, T);
    if (!e) {
      var s0 = Math.min(W, H) * 0.45 / HM.outerR(d);
      return { found: false, calib: { cx: W / 2, cy: H / 2, sx: s0, sy: s0 }, shots: [], candidates: 0,
        message: 'The black aiming mark was not found. Use “Adjust rings” to line the rings up, then add the shots by hand.' };
    }
    var calib = { cx: e.cx, cy: e.cy, sx: e.a / d.blackR, sy: e.b / d.blackR };
    var R1 = HM.outerR(d), rMax = R1 + d.cal * 0.6;

    // Classify each pixel by its zone (millimetre radius).
    var zone = new Float32Array(N), y, x;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var mx = (x - calib.cx) / calib.sx, my = (y - calib.cy) / calib.sy;
      zone[y * W + x] = Math.sqrt(mx * mx + my * my);
    }
    var blackVals = [], paperG = [], paperB = [];
    var stride = Math.max(1, Math.floor(N / 150000));
    for (i = 0; i < N; i += stride) {
      var z = zone[i];
      if (z < d.blackR * 0.85) blackVals.push(gray[i]);
      else if (z > d.blackR + Math.min(2, d.step * 0.3) && z < R1 && gray[i] >= T) { paperG.push(gray[i]); paperB.push(br[i]); }
    }
    var blackMed = median(blackVals), paperMed = median(paperG.length ? paperG : [200]);
    var thrBlack = blackMed + (paperMed - blackMed) * (0.62 - 0.4 * (sens - 0.5));
    // In 'mixed' the holes show a darker backing, so on the black they are only a little lighter.
    var thrMixed = blackMed + (paperMed - blackMed) * (0.22 - 0.16 * (sens - 0.5));

    // Local paper brightness (ignores print and the aiming mark).
    var pm = new Uint8Array(N), pg = new Float32Array(N), pb = new Float32Array(N);
    for (i = 0; i < N; i++) {
      if (zone[i] > d.blackR + 0.3 && zone[i] < rMax + d.step && gray[i] >= T) { pm[i] = 1; pg[i] = gray[i]; pb[i] = br[i]; }
    }
    var rh = d.cal / 2 * (calib.sx + calib.sy) / 2;
    var win = Math.max(6, Math.round(rh * 3));
    // Card = paper or the aiming mark. Spots with little card around them are the backing showing past the card's edge.
    var card = new Uint8Array(N);
    for (i = 0; i < N; i++) card[i] = pm[i] || zone[i] < d.blackR + 0.3 ? 1 : 0;
    var Icard = integral(card, W, H);
    var Ic = integral(pm, W, H), Ig = integral(pg, W, H), Ib = integral(pb, W, H);
    var tPaper = 38 - 40 * sens, mode = opts.holes || 'light';
    var dark = mode === 'dark' || mode === 'black';
    var lightOnBlack = mode === 'light' || mode === 'mixed', darkOnPaper = dark || mode === 'mixed';
    var hue = HOLE_HUES[mode], hh = null, ss = null, Is = null, blackSat = 0, tSat = 0.22 - 0.2 * (sens - 0.5);
    if (hue) {
      // Saturation of each pixel, and of the local paper, so a coloured hole stands out from the buff card.
      hh = new Float32Array(N); ss = new Float32Array(N);
      var psat = new Float32Array(N), bs = [];
      for (i = 0; i < N; i++) {
        var hs = hueSat(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        hh[i] = hs[0]; ss[i] = hs[1];
        if (pm[i]) psat[i] = hs[1];
        if (zone[i] < d.blackR * 0.85 && i % stride === 0) bs.push(hs[1]);
      }
      Is = integral(psat, W, H); blackSat = median(bs.length ? bs : [0]);
    }
    var isHue = function (i) {
      var dh = Math.abs(hh[i] - hue[0]); if (dh > 180) dh = 360 - dh;
      return dh <= hue[1] && gray[i] > 25;
    };
    var mask = new Uint8Array(N);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var zz = zone[i];
      if (zz > rMax) continue;
      if (zz < d.blackR - d.cal * 0.15) {
        if (hue) { if (isHue(i) && ss[i] - blackSat > tSat) mask[i] = 1; }
        else if (lightOnBlack && gray[i] > (mode === 'mixed' ? thrMixed : thrBlack)) mask[i] = 1;
        continue;
      }
      var cnt = boxSum(Ic, W, H, x - win, y - win, x + win, y + win);
      if (cnt < 4) continue;
      var area = (Math.min(W - 1, x + win) - Math.max(0, x - win) + 1) * (Math.min(H - 1, y + win) - Math.max(0, y - win) + 1);
      if (boxSum(Icard, W, H, x - win, y - win, x + win, y + win) < area * 0.7) continue;
      var lg = boxSum(Ig, W, H, x - win, y - win, x + win, y + win) / cnt;
      var lb = boxSum(Ib, W, H, x - win, y - win, x + win, y + win) / cnt;
      if (hue) {
        var ls = boxSum(Is, W, H, x - win, y - win, x + win, y + win) / cnt;
        if (isHue(i) && ss[i] - ls > tSat) mask[i] = 1;
      } else if (!darkOnPaper) {
        if ((gray[i] - lg) + (br[i] - lb) > tPaper) mask[i] = 1;
      } else if (Math.abs(zz - d.blackR) > 0.6 && lg - gray[i] > 30 + tPaper) mask[i] = 1;
    }
    var er = Math.max(1, Math.round(rh * 0.35));
    var open = opening(mask, W, H, er);
    var cc = components(open, W, H, true);
    var Ah = Math.PI * d.cal / 2 * calib.sx * d.cal / 2 * calib.sy;
    var blobs = [];
    cc.comps.forEach(function (c) {
      if (c.area < Ah * 0.22) return;
      var n = Math.max(1, Math.min(10, Math.round(c.area / (Ah * 0.85))));
      var bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
      if (n === 1 && (bw > rh * 4.5 || bh > rh * 4.5)) return; // long streak, not a hole
      blobs.push({ c: c, n: n });
    });
    // The number of shots per card is known: split the largest blobs further if shots are missing.
    var expected0 = opts.expected || 0;
    var total = blobs.reduce(function (a, b) { return a + b.n; }, 0);
    while (expected0 && total < expected0 && blobs.length) {
      var bb = null, br2 = 0;
      blobs.forEach(function (b) { var q = b.c.area / ((b.n + 1) * Ah); if (q > br2) { br2 = q; bb = b; } });
      if (!bb || br2 < 0.3) break;
      bb.n++; total++;
    }
    var found = [];
    blobs.forEach(function (b) {
      var c = b.c, n = b.n;
      var fit = Math.min(1, c.area / (Ah * n)) * Math.min(1, (Ah * n) / c.area);
      if (n === 1) {
        // Holes are round and filled; printed digits and ring fragments are not.
        var bw1 = c.maxx - c.minx + 1, bh1 = c.maxy - c.miny + 1;
        fit *= Math.min(bw1, bh1) / Math.max(bw1, bh1) * Math.min(1, c.area / (bw1 * bh1) / 0.72);
      }
      if (n === 1) found.push({ u: c.sx / c.area, v: c.sy / c.area, conf: fit });
      else splitBlob(c.pix, W, n).forEach(function (p) { found.push({ u: p[0], v: p[1], conf: fit * 0.9 }); });
    });
    // Printed ring numbers sit on the axes in the middle of rings 1-8 and can look like holes:
    // rank spots there last, so they are only kept when nothing better was found.
    var numR = Math.min(d.step * 0.42, 9) * 0.6;
    found.forEach(function (f) {
      var m = HM.toMM({ cx: calib.cx, cy: calib.cy, sx: calib.sx, sy: calib.sy }, f);
      for (var k = 1; k <= d.numbers; k++) {
        var rm = (HM.ringR(d, k) + HM.ringR(d, k + 1)) / 2;
        if (Math.min(Math.hypot(Math.abs(m.x) - rm, m.y), Math.hypot(m.x, Math.abs(m.y) - rm)) < numR) { f.conf *= 0.3; break; }
      }
    });
    found.sort(function (a, b) { return b.conf - a.conf; });
    var expected = opts.expected || 0, candidates = found.length;
    if (expected && found.length > expected) found = found.slice(0, expected);
    var msg;
    if (!expected) msg = 'Found ' + found.length + ' shot' + (found.length === 1 ? '' : 's') + '.';
    else if (candidates === expected) msg = 'Found all ' + expected + ' shots.';
    else if (candidates > expected) msg = 'Found ' + candidates + ' possible holes; kept the ' + expected + ' clearest. Check them and move any that are wrong.';
    else msg = 'Found ' + candidates + ' of ' + expected + ' shots. Tap “Add shot” to place the missing ones.';
    return { found: true, calib: calib, shots: found, candidates: candidates, message: msg, debug: { T: T, blackMed: blackMed, paperMed: paperMed } };
  };
})(window.HM);
