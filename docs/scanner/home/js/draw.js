/* ShootingScanner drawing: target plots, shots, ring overlays and heat maps on a canvas. */
(function (HM) {
  'use strict';

  HM.PAPER = '#f9e3b9';
  HM.BLACK = '#161616';

  // M maps millimetres to canvas pixels: { cx, cy, sx, sy } (y grows upwards in mm).
  function ell(ctx, M, r) {
    ctx.beginPath();
    ctx.ellipse(M.cx, M.cy, Math.max(0.1, r * M.sx), Math.max(0.1, r * M.sy), 0, 0, Math.PI * 2);
  }

  HM.drawTarget = function (ctx, d, M, opts) {
    opts = opts || {};
    var R1 = HM.outerR(d), s = (M.sx + M.sy) / 2;
    ctx.save();
    if (opts.paper !== false) {
      ctx.fillStyle = opts.paperColor || HM.PAPER;
      var half = HM.cardHalf(d);
      if (opts.fillRect && d.card) {
        // A small card: what lies outside it is the backing, not paper.
        ctx.fillStyle = opts.backColor || '#d8d3c8';
        ctx.fillRect(opts.fillRect[0], opts.fillRect[1], opts.fillRect[2], opts.fillRect[3]);
        ctx.fillStyle = opts.paperColor || HM.PAPER;
      }
      if (opts.fillRect && !d.card) ctx.fillRect(opts.fillRect[0], opts.fillRect[1], opts.fillRect[2], opts.fillRect[3]);
      else ctx.fillRect(M.cx - half * M.sx, M.cy - half * M.sy, 2 * half * M.sx, 2 * half * M.sy);
    }
    if (d.card) {
      // Rings stop at the edge of the card.
      ctx.beginPath(); ctx.rect(M.cx - d.card * M.sx, M.cy - d.card * M.sy, 2 * d.card * M.sx, 2 * d.card * M.sy); ctx.clip();
    }
    // aiming mark
    ctx.fillStyle = HM.BLACK;
    ell(ctx, M, d.blackR); ctx.fill();
    var lw = Math.max(0.6, Math.min(2, 0.18 * s));
    ctx.lineWidth = lw;
    for (var n = 1; n <= 10; n++) {
      var r = HM.ringR(d, n);
      if (d.dot && n === 10) { ctx.fillStyle = '#fff'; ell(ctx, M, r); ctx.fill(); continue; }
      ctx.strokeStyle = r < d.blackR - 0.01 ? '#e9e9e9' : '#222';
      ell(ctx, M, r); ctx.stroke();
    }
    if (d.innerR) { ctx.strokeStyle = '#e9e9e9'; ell(ctx, M, d.innerR); ctx.stroke(); }
    if (opts.numbers !== false && d.step * s > 7) {
      var fs = Math.max(5, Math.min(d.step * 0.42, 9) * s);
      ctx.font = fs + 'px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var k = d.numFrom || 1; k <= d.numbers; k++) {
        var rm = (HM.ringR(d, k) + HM.ringR(d, k + 1)) / 2;
        ctx.fillStyle = rm < d.blackR ? '#e9e9e9' : '#222';
        ctx.fillText(k, M.cx - rm * M.sx, M.cy);
        ctx.fillText(k, M.cx + rm * M.sx, M.cy);
        ctx.fillText(k, M.cx, M.cy - rm * M.sy);
        ctx.fillText(k, M.cx, M.cy + rm * M.sy);
      }
    }
    ctx.restore();
  };

  // Thin coloured rings laid over a photo to show where the app thinks the target is.
  HM.drawRingOverlay = function (ctx, d, M, color) {
    ctx.save();
    ctx.strokeStyle = color || 'rgba(0,220,255,0.85)';
    ctx.lineWidth = 1;
    for (var n = 1; n <= 10; n++) { ell(ctx, M, HM.ringR(d, n)); ctx.stroke(); }
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color || 'rgba(255,230,0,0.9)';
    ell(ctx, M, d.blackR); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(M.cx - 8, M.cy); ctx.lineTo(M.cx + 8, M.cy);
    ctx.moveTo(M.cx, M.cy - 8); ctx.lineTo(M.cx, M.cy + 8);
    ctx.stroke();
    ctx.restore();
  };

  // Shots: array of {x, y} mm. opts: fill, stroke, selected index, labels, colors[] per shot.
  HM.drawShots = function (ctx, d, M, pts, opts) {
    opts = opts || {};
    var rx = d.cal / 2 * M.sx, ry = d.cal / 2 * M.sy;
    ctx.save();
    pts.forEach(function (p, i) {
      var x = M.cx + p.x * M.sx, y = M.cy - p.y * M.sy;
      var sel = i === opts.selected;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(rx, opts.minR || 1.5), Math.max(ry, opts.minR || 1.5), 0, 0, Math.PI * 2);
      ctx.fillStyle = sel ? (opts.selFill || 'rgba(40,120,255,0.55)') : ((opts.colors && opts.colors[i]) || opts.fill || 'rgba(40,70,255,0.78)');
      ctx.fill();
      ctx.lineWidth = sel ? 2.5 : (opts.lineWidth || 1);
      ctx.strokeStyle = sel ? (opts.selStroke || '#1a6dff') : (opts.stroke || 'rgba(255,255,255,0.85)');
      ctx.stroke();
      if (opts.labels && rx > 7) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.min(14, rx * 0.9) + 'px Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x, y);
      }
    });
    ctx.restore();
  };

  HM.drawGroupCentre = function (ctx, M, st) {
    if (!st.n) return;
    var x = M.cx + st.mx * M.sx, y = M.cy - st.my * M.sy;
    ctx.save();
    ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
    if (st.n > 1) {
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.ellipse(x, y, st.mr * M.sx, st.mr * M.sy, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  // Mapping that fits a radius (mm) around the target centre into a w x h box.
  HM.fitMap = function (w, h, radiusMM, cxMM, cyMM) {
    var s = Math.min(w, h) / (2 * radiusMM);
    cxMM = cxMM || 0; cyMM = cyMM || 0;
    return { cx: w / 2 - cxMM * s, cy: h / 2 + cyMM * s, sx: s, sy: s };
  };

  HM.jet = function (t) {
    t = Math.max(0, Math.min(1, t));
    function c(v) { return Math.round(255 * Math.max(0, Math.min(1, v))); }
    return [c(1.5 - Math.abs(4 * t - 3)), c(1.5 - Math.abs(4 * t - 2)), c(1.5 - Math.abs(4 * t - 1))];
  };

  // Heat map: kernel density of shots on a dark background.
  HM.drawHeatmap = function (ctx, d, M, pts, w, h, opts) {
    opts = opts || {};
    var bg = HM.jet(0);
    ctx.save();
    ctx.fillStyle = 'rgb(' + bg.join(',') + ')';
    ctx.fillRect(0, 0, w, h);
    if (pts.length) {
      var st = HM.stats(d, pts);
      var sigma = opts.sigma || Math.max(d.cal * 0.7, Math.min(st.mr * 0.45, d.step * 1.2), d.step * 0.25);
      var cell = Math.max(2, Math.round(Math.min(w, h) / 160));
      var gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      var grid = new Float32Array(gw * gh), max = 0;
      var inv = 1 / (2 * sigma * sigma);
      for (var gy = 0; gy < gh; gy++) {
        for (var gx = 0; gx < gw; gx++) {
          var mx = ((gx + 0.5) * cell - M.cx) / M.sx, my = -((gy + 0.5) * cell - M.cy) / M.sy, v = 0;
          for (var i = 0; i < pts.length; i++) {
            var dx = mx - pts[i].x, dy = my - pts[i].y;
            v += Math.exp(-(dx * dx + dy * dy) * inv);
          }
          grid[gy * gw + gx] = v; if (v > max) max = v;
        }
      }
      var img = ctx.createImageData(gw, gh);
      for (var k = 0; k < grid.length; k++) {
        var c = HM.jet(max ? grid[k] / max : 0);
        img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = 255;
      }
      var tmp = document.createElement('canvas'); tmp.width = gw; tmp.height = gh;
      tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, gw * cell, gh * cell);
    }
    // rings and crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    for (var n = 1; n <= 10 && !opts.noRings; n++) { ctx.beginPath(); ctx.ellipse(M.cx, M.cy, HM.ringR(d, n) * M.sx, HM.ringR(d, n) * M.sy, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(0, M.cy); ctx.lineTo(w, M.cy); ctx.moveTo(M.cx, 0); ctx.lineTo(M.cx, h); ctx.stroke();
    ctx.restore();
  };

  // Size a canvas to its box for sharp drawing; returns the 2d context in CSS pixels.
  HM.prepCanvas = function (cv, w, h) {
    var dpr = window.devicePixelRatio || 1;
    w = w || cv.clientWidth; h = h || cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };
})(window.HM);
