/* ShootingScanner sample photos: draws a realistic shot paper target (card on a light backing)
   so the scanner can be tried without a camera. */
(function (HM) {
  'use strict';

  /* Returns { canvas, truth: [{x, y}] (mm) }. opts: { shots, seed, W, H, rotate, backing: [colour, colour] } */
  HM.makeSample = function (d, opts) {
    opts = opts || {};
    var rnd = HM.rng(opts.seed || 12345);
    var W = opts.W || 900, H = opts.H || 1100, n = opts.shots == null ? d.shots : opts.shots;
    var R1 = HM.outerR(d), cardHalf = R1 + Math.max(8, d.step * 0.7);
    var ppm = Math.min(W, H) * 0.86 / (2 * cardHalf);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    // light-blue backing sheet with soft lighting
    var g = ctx.createLinearGradient(0, 0, W, H);
    var bk = opts.backing || ['#eef4fb', '#d6e3f0'];
    g.addColorStop(0, bk[0]); g.addColorStop(1, bk[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // the card, drawn separately so holes can be cut through it
    var side = Math.ceil(2 * cardHalf * ppm);
    var card = document.createElement('canvas'); card.width = side; card.height = side;
    var cx = card.getContext('2d');
    var M = { cx: side / 2, cy: side / 2, sx: ppm, sy: ppm };
    HM.drawTarget(cx, d, M, { fillRect: [0, 0, side, side], paperColor: '#efdcb4' });

    // group: an offset centre plus scatter
    var gx = (rnd() - 0.5) * d.sigma * 1.4, gy = (rnd() - 0.5) * d.sigma * 1.4, truth = [];
    for (var i = 0; i < n; i++) {
      var x = gx + rnd.gauss() * d.sigma * 0.7, y = gy + rnd.gauss() * d.sigma * 0.7;
      var lim = R1 - d.cal;
      var r = Math.hypot(x, y); if (r > lim) { x *= lim / r; y *= lim / r; }
      truth.push({ x: x, y: y });
    }
    var hr = d.cal / 2 * ppm;
    truth.forEach(function (p) {
      var px = M.cx + p.x * ppm, py = M.cy - p.y * ppm;
      // torn paper rim
      cx.strokeStyle = 'rgba(90,70,50,0.35)'; cx.lineWidth = Math.max(1, hr * 0.12);
      cx.beginPath(); cx.arc(px, py, hr * 1.02, 0, Math.PI * 2); cx.stroke();
    });
    cx.globalCompositeOperation = 'destination-out';
    truth.forEach(function (p) {
      var px = M.cx + p.x * ppm, py = M.cy - p.y * ppm;
      cx.beginPath(); cx.arc(px, py, hr * 0.94, 0, Math.PI * 2); cx.fill();
      for (var k = 0; k < 7; k++) {
        var a = rnd() * Math.PI * 2, rr = hr * (0.7 + rnd() * 0.22);
        cx.beginPath(); cx.arc(px + Math.cos(a) * hr * 0.25, py + Math.sin(a) * hr * 0.25, rr, 0, Math.PI * 2); cx.fill();
      }
    });
    cx.globalCompositeOperation = 'source-over';

    var rot = opts.rotate == null ? (rnd() - 0.5) * 0.04 : opts.rotate;
    var ox = W / 2 + (rnd() - 0.5) * W * 0.04, oy = H / 2 + (rnd() - 0.5) * H * 0.04;
    ctx.save();
    ctx.translate(ox, oy); ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.drawImage(card, -side / 2, -side / 2);
    ctx.restore();

    // uneven light and a little blur and noise, like a phone photo
    var v = ctx.createRadialGradient(W * 0.4, H * 0.35, Math.min(W, H) * 0.1, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(255,255,255,0.06)'); v.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var octx = out.getContext('2d');
    octx.filter = 'blur(0.6px)';
    octx.drawImage(cv, 0, 0);
    octx.filter = 'none';
    var id = octx.getImageData(0, 0, W, H), dd = id.data;
    for (i = 0; i < dd.length; i += 4) {
      var nz = (rnd() - 0.5) * 14;
      dd[i] = Math.max(0, Math.min(255, dd[i] + nz));
      dd[i + 1] = Math.max(0, Math.min(255, dd[i + 1] + nz));
      dd[i + 2] = Math.max(0, Math.min(255, dd[i + 2] + nz));
    }
    octx.putImageData(id, 0, 0);
    // truth in picture coordinates too, for tests
    truth.forEach(function (p) {
      var lx = p.x * ppm, ly = -p.y * ppm;
      p.u = ox + lx * Math.cos(rot) - ly * Math.sin(rot);
      p.v = oy + lx * Math.sin(rot) + ly * Math.cos(rot);
    });
    return { canvas: out, truth: truth, ppm: ppm };
  };
})(window.HM);
