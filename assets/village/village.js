// SPDX-License-Identifier: Apache-2.0
// Christmas Village: a pixel art village that follows the time of day, with falling snow,
// twinkling tree lights and stars, chimney smoke, a shimmering river and Santa's sleigh at night.
(function () {
  'use strict';
  var S = window.SPOTS, W = S.size[0], H = S.size[1];
  // The art's pixels are about 7 picture pixels across. The effects use the same grid.
  var P = 7, GW = Math.ceil(W / P), GH = Math.ceil(H / P);

  // Settings from the plugin, in the address's fragment. ?demo, ?t=HH:MM and ?mode=... are for testing.
  var opts = {};
  try { opts = JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')); } catch (e) { opts = {}; }
  var query = new URLSearchParams(location.search);
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  var mode = query.get('mode') || opts.timeOfDay || 'auto';
  if (query.has('demo')) mode = 'fast';
  var sunrise = num(opts.sunrise, 480), sunset = num(opts.sunset, 960);
  if (sunset <= sunrise + 60) sunset = sunrise + 60;
  var snowLevel = Math.max(0, Math.min(3, Math.round(num(opts.snow, 2))));
  // Seconds between Santa's flights. 0 is never.
  var santaEvery = Math.max(0, num(opts.santaEvery, 120));
  // Side to side drift, 0 (still, centred) to 3 (fastest).
  var scrollSpeed = Math.max(0, Math.min(3, Math.round(num(query.has('scroll') ? query.get('scroll') : opts.scroll, 3))));
  var fixedTime = /^(\d\d?):(\d\d)$/.exec(query.get('t') || '');
  var diagnostics = opts.diagnostics === true || query.has('diag');
  var clockMode = query.get('clock') || opts.clock || 'off';
  var countdown = opts.countdown === true || query.has('countdown');
  // The countdown's seconds, on by default; off shows days, hours and minutes.
  var countdownSeconds = !(opts.countdownSeconds === false || query.get('seconds') === 'off');
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(String(e.message || e) + (e.lineno ? ' @' + e.lineno : '')); });

  var stage = document.getElementById('stage');
  // The picture goes on one canvas, redrawn only as the light changes. A few small layers keep
  // the memory low, which matters on modest tablets scaling the scene up to fill the screen.
  var base = document.getElementById('base'), bctx = base.getContext('2d');
  var fx = document.getElementById('fx'), ctx = fx.getContext('2d');
  var cloudCanvas = document.getElementById('clouds'), cctx = cloudCanvas.getContext('2d');
  var sleighCanvas = document.getElementById('sleigh'), sctx = sleighCanvas.getContext('2d');
  // Everything is sized from the picture.
  function size(el, w, h) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
  size(stage, W, H);
  base.width = W; base.height = H; size(base, W, H);
  [fx, cloudCanvas].forEach(function (c) { c.width = GW; c.height = GH; size(c, GW * P, GH * P); });

  function load(src) {
    var img = new Image();
    img.src = src;
    return img;
  }
  var nightImg = load('night.webp'), dayImg = load('day.webp'), skyMask = load('sky.png'), sleighImg = load('sleigh.png');
  nightImg.onload = dayImg.onload = function () { lastDay = -1; };
  // Where the sky is, one value per dot of the effects layer: Santa and his sparkles only show there.
  var skyCells = null;
  skyMask.onload = function () {
    try {
      var c = document.createElement('canvas');
      c.width = GW; c.height = GH;
      var g = c.getContext('2d');
      g.drawImage(skyMask, 0, 0);
      var data = g.getImageData(0, 0, GW, GH).data;
      skyCells = new Uint8Array(GW * GH);
      for (var i = 0; i < GW * GH; i++) skyCells[i] = data[i * 4 + 3] > 128 ? 1 : 0;
    } catch (e) { skyCells = null; }
  };
  function isSky(gx, gy) {
    if (!skyCells) return true;
    gx = Math.round(gx); gy = Math.round(gy);
    return gx >= 0 && gy >= 0 && gx < GW && gy < GH && skyCells[gy * GW + gx] === 1;
  }

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---- Time of day -------------------------------------------------------------------------
  var TWILIGHT = 50; // minutes either side of sunrise and sunset
  var started = performance.now();
  function minutesNow() {
    if (fixedTime) return Number(fixedTime[1]) * 60 + Number(fixedTime[2]);
    if (mode === 'day') return (sunrise + sunset) / 2;
    if (mode === 'night') return (sunset + 24 * 60 + sunrise) / 2 % 1440;
    if (mode === 'fast') {
      // A whole day in three minutes, starting just before sunrise.
      return (sunrise - 90 + (performance.now() - started) / 1000 * 8) % 1440;
    }
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  }
  // 1 in full daylight, 0 at night, in between at dawn and dusk.
  function daylight(m) {
    var rise = smooth((m - (sunrise - TWILIGHT)) / (2 * TWILIGHT));
    var set = 1 - smooth((m - (sunset - TWILIGHT)) / (2 * TWILIGHT));
    return Math.min(rise, set);
  }
  // How strong the sunrise or sunset glow is.
  function glow(m) {
    function bell(c) { var x = Math.abs(m - c) / (TWILIGHT * 1.3); return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(x * Math.PI); }
    return Math.max(bell(sunrise), bell(sunset));
  }

  // ---- The picture: night and day blended, warmed at dawn and dusk -------------------------
  var lastDay = -1, lastGlow = -1;
  function drawBase(d, g) {
    if (!nightImg.complete || !nightImg.naturalWidth || !dayImg.complete || !dayImg.naturalWidth) return;
    if (Math.abs(d - lastDay) < 0.003 && Math.abs(g - lastGlow) < 0.003) return;
    lastDay = d; lastGlow = g;
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.drawImage(nightImg, 0, 0, W, H);
    if (d > 0) { bctx.globalAlpha = d; bctx.drawImage(dayImg, 0, 0, W, H); }
    if (g > 0.01) {
      var grad = bctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgb(150,70,160)');
      grad.addColorStop(0.3, 'rgb(255,110,80)');
      grad.addColorStop(0.5, 'rgb(255,170,90)');
      grad.addColorStop(1, 'rgb(170,110,150)');
      bctx.fillStyle = grad;
      bctx.globalCompositeOperation = 'overlay';
      bctx.globalAlpha = 0.8 * g;
      bctx.fillRect(0, 0, W, H);
      bctx.globalCompositeOperation = 'soft-light';
      bctx.globalAlpha = 0.6 * g;
      bctx.fillRect(0, 0, W, H);
    }
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-over';
  }

  // ---- Fitting the screen ------------------------------------------------------------------
  // The picture fills the screen. It is wider than most screens, with snowy woods and fields
  // either side of the village, so it drifts slowly from side to side to show it all.
  var scale = 1, spareX = 0, spareY = 0, sizedW = 0, sizedH = 0;
  var view = document.getElementById('view');
  // The page can open before the screensaver has its size, and a resize event doesn't always
  // follow, so the size is checked again every frame until it is known and then once a second.
  function layout() {
    var vw = view.clientWidth || window.innerWidth || document.documentElement.clientWidth;
    var vh = view.clientHeight || window.innerHeight || document.documentElement.clientHeight;
    if (!vw || !vh) return false;
    if (vw === sizedW && vh === sizedH) return true;
    sizedW = vw; sizedH = vh;
    scale = Math.max(vw / W, vh / H);
    spareX = Math.max(0, W * scale - vw);
    spareY = Math.max(0, H * scale - vh);
    return true;
  }
  window.addEventListener('resize', function () { sizedW = 0; hudKey = ''; layout(); });
  layout();
  var sizeCheck = 0, panStart = 0;
  function place(t) {
    if (!sizedW || (sizeCheck += 1) >= 30) { sizeCheck = 0; layout(); }
    if (!sizedW) return;
    // A steady drift starting on the village, at its fastest about 26 screen pixels a second at
    // speed 3 and a third of that for each step down. At 0 the picture stays centred.
    var x = -spareX * 0.5;
    if (scrollSpeed > 0 && spareX > 1) {
      var speed = 26 * scrollSpeed / 3;
      var period = Math.max(70 * 3 / scrollSpeed, 2 * spareX / speed);
      if (!panStart) panStart = t;
      x = -spareX * (0.5 + 0.5 * Math.sin((t - panStart) / 1000 * 2 * Math.PI / period));
    }
    // A screen even wider than the picture loses a little sky and the rest from the foreground.
    var y = -spareY * 0.2;
    // On whole screen pixels, so the picture's crisp pixels don't shimmer as it moves.
    var dpr = window.devicePixelRatio || 1;
    x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr;
    stage.style.transform = 'translate(' + x.toFixed(3) + 'px,' + y.toFixed(3) + 'px) scale(' + scale + ')';
  }

  // ---- Snow ---------------------------------------------------------------------------------
  var flakes = [];
  // As many flakes for the scene's width as there would be on a 1672 pixel wide picture.
  var FLAKES = Math.round([0, 90, 200, 1000][snowLevel] * GW / 239);
  var wind = snowLevel === 3 ? 12 : 0.8, fall = snowLevel === 3 ? 1.8 : 1;
  for (var i = 0; i < FLAKES; i++) flakes.push(newFlake(true));
  function newFlake(anywhere) {
    var near = Math.random() < 0.45;
    return {
      x: rand(anywhere ? -10 : -10 - wind * 12, GW + 10), y: anywhere ? rand(0, GH) : rand(-6, -1),
      vy: (near ? rand(6, 9) : rand(3.2, 4.8)) * fall, near: near,
      ph: rand(0, 6.3), sway: rand(0.4, 1.1)
    };
  }
  function drawSnow(dt, t, d) {
    var nearColor = d > 0.5 ? 'rgba(255,255,255,0.95)' : 'rgba(236,238,255,0.9)';
    var farColor = d > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(210,214,255,0.5)';
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.y += f.vy * dt;
      f.x += (wind * (f.near ? 1 : 0.6)) * dt + Math.sin(t / 1000 * f.sway + f.ph) * 0.6 * dt;
      if (f.y > GH + 1 || f.x > GW + 12) { flakes[i] = newFlake(false); continue; }
      ctx.fillStyle = f.near ? nearColor : farColor;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
    }
  }

  // ---- Tree lights --------------------------------------------------------------------------
  var bulbs = S.bulbs.map(function (b, i) {
    return { gx: Math.round(b[0] / P), gy: Math.round(b[1] / P), color: b[2], ph: Math.random() * 6.3, rate: rand(0.6, 1.4), order: i };
  });
  bulbs.slice().sort(function (a, b) { return a.gy - b.gy || a.gx - b.gx; }).forEach(function (b, i) { b.order = i; });
  // The lights take turns at three patterns.
  function bulbLevel(b, t) {
    var s = t / 1000, pattern = Math.floor(s / 16) % 3;
    if (pattern === 0) return 0.5 + 0.5 * Math.sin(s * 2.2 * b.rate + b.ph) > 0.35 ? 1 : 0; // twinkle
    if (pattern === 1) return ((s * 8 - b.order) % bulbs.length + bulbs.length) % bulbs.length < bulbs.length * 0.45 ? 1 : 0.15; // chase down the tree
    return 0.55 + 0.45 * Math.sin(s * 2.4); // all breathe together
  }
  function drawBulbs(t, d) {
    var strength = 1 - 0.45 * d;
    for (var i = 0; i < bulbs.length; i++) {
      var b = bulbs[i], level = bulbLevel(b, t);
      if (level < 0.5) {
        // Off: dim the painted bulb.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(10,20,30,' + (0.5 * (1 - level) * strength).toFixed(2) + ')';
        ctx.fillRect(b.gx - 1, b.gy - 1, 2, 2);
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * level * strength;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.gx - 1, b.gy - 1, 2, 2);
      ctx.globalAlpha = 0.22 * level * strength;
      ctx.fillRect(b.gx - 2, b.gy - 1, 4, 2);
      ctx.fillRect(b.gx - 1, b.gy - 2, 2, 4);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Windows, glowing like firelight at night ----------------------------------------------
  var windows = S.windows.map(function (w) {
    return { x: Math.round(w[0] / P), y: Math.round(w[1] / P), w: Math.max(1, Math.round(w[2] / P)), h: Math.max(1, Math.round(w[3] / P)), a: rand(0, 6.3), b: rand(0, 6.3) };
  });
  function drawWindows(t, n) {
    if (n < 0.02) return;
    var s = t / 1000;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i];
      var flicker = 0.5 + 0.25 * Math.sin(s * 3.1 + w.a) + 0.25 * Math.sin(s * 7.3 + w.b);
      ctx.fillStyle = 'rgba(255,160,70,' + ((0.06 + 0.1 * flicker) * n).toFixed(3) + ')';
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Twinkling stars ---------------------------------------------------------------------
  var stars = S.stars.map(function (s) { return { gx: Math.round(s[0] / P), gy: Math.round(s[1] / P), big: s[2] > 14 }; });
  var twinkles = [];
  function drawStars(t, dt, n) {
    if (n < 0.05 || !stars.length) { twinkles.length = 0; return; }
    if (twinkles.length < 6 && Math.random() < dt * 3) twinkles.push({ s: stars[Math.floor(Math.random() * stars.length)], age: 0, life: rand(0.9, 1.8) });
    ctx.globalCompositeOperation = 'lighter';
    for (var i = twinkles.length - 1; i >= 0; i--) {
      var k = twinkles[i];
      k.age += dt;
      if (k.age >= k.life) { twinkles.splice(i, 1); continue; }
      var a = Math.sin(Math.PI * k.age / k.life) * n;
      var arm = k.s.big ? 2 : 1;
      ctx.fillStyle = 'rgba(255,255,240,' + (0.9 * a).toFixed(2) + ')';
      ctx.fillRect(k.s.gx, k.s.gy, 1, 1);
      ctx.fillStyle = 'rgba(220,230,255,' + (0.55 * a).toFixed(2) + ')';
      ctx.fillRect(k.s.gx - arm, k.s.gy, arm, 1);
      ctx.fillRect(k.s.gx + 1, k.s.gy, arm, 1);
      ctx.fillRect(k.s.gx, k.s.gy - arm, 1, arm);
      ctx.fillRect(k.s.gx, k.s.gy + 1, 1, arm);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Chimney smoke -------------------------------------------------------------------------
  // A plume of round puffs that swell, drift with the wind and fade as they rise. Santa flies
  // behind it.
  var chimneys = S.chimneys.map(function (c, i) { return { gx: c[0] / P, gy: c[1] / P - 0.5, next: 0, small: i > 0 }; });
  var puffs = [];
  function disc(cx, cy, r) {
    var ri = Math.ceil(r);
    for (var dy = -ri; dy <= ri; dy++) {
      var half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
      if (half < 0) continue;
      ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
    }
  }
  function drawSmoke(dt, d) {
    for (var c = 0; c < chimneys.length; c++) {
      var ch = chimneys[c];
      ch.next -= dt;
      if (ch.next <= 0) {
        ch.next = ch.small ? rand(0.3, 0.45) : rand(0.16, 0.24);
        puffs.push({ x: ch.gx + rand(-0.6, 0.6), y: ch.gy, age: 0, life: ch.small ? rand(3.5, 4.5) : rand(5.5, 7), ph: rand(0, 6.3), small: ch.small });
      }
    }
    var body = d > 0.5 ? '186,192,208' : '150,156,212';
    var light = d > 0.5 ? '236,239,245' : '200,202,238';
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i];
      p.age += dt;
      if (p.age >= p.life) { puffs.splice(i, 1); continue; }
      var k = p.age / p.life;
      var x = p.x + (wind * 0.3 + 0.7) * p.age * (0.4 + k) + Math.sin(p.age * 1.2 + p.ph) * 1.1;
      var y = p.y - (p.small ? 2.6 : 3.4) * p.age * (1 - 0.3 * k);
      var r = (p.small ? 1.2 : 2) + k * (p.small ? 2.2 : 4.5);
      var a = (p.small ? 0.7 : 0.85) * Math.pow(1 - k, 1.1) * Math.min(1, p.age / 0.3);
      ctx.fillStyle = 'rgba(' + body + ',' + a.toFixed(3) + ')';
      disc(x, y, r);
      if (r > 1.4) {
        ctx.fillStyle = 'rgba(' + light + ',' + (a * 0.7).toFixed(3) + ')';
        disc(x - r * 0.3, y - r * 0.3, r * 0.55);
      }
    }
  }

  // ---- The river -----------------------------------------------------------------------------
  var water = S.water.map(function (w) { return [Math.round(w[0] / P), Math.round(w[1] / P)]; });
  var glints = [];
  function drawWater(dt, d) {
    if (!water.length) return;
    if (glints.length < 22 && Math.random() < dt * 14) {
      var w = water[Math.floor(Math.random() * water.length)];
      glints.push({ x: w[0], y: w[1], len: 1 + Math.floor(Math.random() * 3), age: 0, life: rand(0.6, 1.3) });
    }
    var color = d > 0.5 ? '255,255,255' : '255,226,150';
    ctx.globalCompositeOperation = 'lighter';
    for (var i = glints.length - 1; i >= 0; i--) {
      var g = glints[i];
      g.age += dt;
      if (g.age >= g.life) { glints.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + color + ',' + (0.45 * Math.sin(Math.PI * g.age / g.life)).toFixed(3) + ')';
      ctx.fillRect(g.x, g.y, g.len, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Santa ---------------------------------------------------------------------------------
  // At night the sleigh crosses the sky every minute or two, trailing sparkles. It flies low,
  // behind the chimney smoke, the snow, the trees and the roofs.
  var SLEIGH_W = 257, SLEIGH_H = 136;
  var flight = null, nextFlight = 8, trail = [];
  function drawSanta(dt, n) {
    if (!santaEvery) return;
    if (!flight) {
      if (n > 0.6) nextFlight -= dt;
      if (nextFlight <= 0) { flight = { age: 0, life: 17, y: rand(120, 165) }; nextFlight = santaEvery * rand(0.85, 1.15); }
    }
    if (flight) {
      flight.age += dt;
      var k = flight.age / flight.life;
      if (k >= 1) { flight = null; sleighCanvas.style.display = 'none'; }
      else {
        var x = Math.round((-SLEIGH_W + k * (W + SLEIGH_W * 1.1)) / P) * P;
        var y = Math.round((flight.y - 40 * Math.sin(k * Math.PI) + 5 * Math.sin(flight.age * 5)) / P) * P;
        if (sleighImg.complete && sleighImg.naturalWidth) {
          sctx.globalCompositeOperation = 'source-over';
          sctx.clearRect(0, 0, SLEIGH_W, SLEIGH_H);
          sctx.drawImage(sleighImg, 0, 0, SLEIGH_W, SLEIGH_H);
          if (skyMask.complete && skyMask.naturalWidth) {
            // Cut away whatever is in front of the sky here: trees, roofs, hills.
            sctx.imageSmoothingEnabled = false;
            sctx.globalCompositeOperation = 'destination-in';
            sctx.drawImage(skyMask, x / P, y / P, SLEIGH_W / P, SLEIGH_H / P, 0, 0, SLEIGH_W, SLEIGH_H);
            sctx.globalCompositeOperation = 'source-over';
          }
          sleighCanvas.style.display = 'block';
          sleighCanvas.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        }
        if (Math.random() < dt * 25) trail.push({ x: (x + 26) / P + rand(-1, 1), y: (y + 90) / P + rand(-1, 1), age: 0, life: rand(0.8, 1.6) });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (var i = trail.length - 1; i >= 0; i--) {
      var s = trail[i];
      s.age += dt;
      if (s.age >= s.life) { trail.splice(i, 1); continue; }
      if (!isSky(s.x, s.y + s.age * 0.8)) continue;
      ctx.fillStyle = 'rgba(255,214,110,' + (0.8 * (1 - s.age / s.life)).toFixed(3) + ')';
      ctx.fillRect(Math.round(s.x), Math.round(s.y + s.age * 0.8), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- Clouds by day -------------------------------------------------------------------------
  function makeCloud() {
    var w = Math.round(rand(14, 28)), h = Math.round(rand(7, 10));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    // A row of round puffs, so the cloud is lumpy underneath as well as on top.
    var blobs = [], n = Math.max(4, Math.round(w / 4));
    for (var i = 0; i < n; i++) {
      // Close enough together that the puffs overlap, with no gaps between them; smaller
      // towards the ends, and each hanging to its own depth, so the underside rolls too.
      var t = (i + 0.5) / n;
      var r = Math.min((h - 0.6) / 2, h * (0.26 + 0.24 * Math.sin(Math.PI * t)) * rand(0.9, 1.1));
      // Whole puffs, inside the cloud's canvas, so the top is rounded as well.
      // and inside it side to side too, so the ends are round, not cut straight.
      var cx = Math.max(1.4 * r + 0.3, Math.min(w - 1.4 * r - 0.3, t * w + rand(-0.7, 0.7)));
      blobs.push([cx, h - r - 0.2 - rand(0, Math.max(0, h - 2 * r - 0.6)), r]);
    }
    function inside(x, y) {
      return blobs.some(function (b) { var dx = (x + 0.5 - b[0]) / 1.4, dy = y + 0.5 - b[1]; return dx * dx + dy * dy < b[2] * b[2]; });
    }
    for (var x = 0; x < w; x++) {
      // Each column shaded from its own underside up: blue-grey, then a paler grey, then white.
      var bottom = -1;
      for (var y = h - 1; y >= 0; y--) if (inside(x, y)) { bottom = y; break; }
      for (var y2 = 0; y2 <= bottom; y2++) {
        if (!inside(x, y2)) continue;
        var up = bottom - y2;
        g.fillStyle = up === 0 ? 'rgb(214,226,242)' : up === 1 ? 'rgb(236,242,250)' : '#fff';
        g.fillRect(x, y2, 1, 1);
      }
    }
    return c;
  }
  var clouds = [];
  for (var cI = 0; cI < 5; cI++) clouds.push({ img: makeCloud(), x: rand(-30, GW), y: Math.round(rand(1, 16)), v: rand(0.12, 0.3) });
  var cloudTimer = 0;
  function drawClouds(dt, d) {
    cloudCanvas.style.opacity = (0.95 * d).toFixed(3);
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.v * dt;
      if (c.x > GW + 2) { clouds[i] = { img: makeCloud(), x: -30, y: Math.round(rand(1, 16)), v: rand(0.12, 0.3) }; }
    }
    cloudTimer -= dt;
    if (d < 0.01 || cloudTimer > 0) return;
    cloudTimer = 0.25;
    cctx.globalCompositeOperation = 'source-over';
    cctx.clearRect(0, 0, GW, GH);
    for (var j = 0; j < clouds.length; j++) cctx.drawImage(clouds[j].img, Math.round(clouds[j].x), clouds[j].y);
    // Only in the sky: behind the trees, roofs and hills.
    if (skyMask.complete && skyMask.naturalWidth) {
      cctx.globalCompositeOperation = 'destination-in';
      cctx.drawImage(skyMask, 0, 0);
      cctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---- Clock and countdown, in pixel lettering -----------------------------------------------
  // A 5 by 7 dot font, like the lettering in 16-bit games. Each dot is one pixel of the art.
  var GLYPHS = {
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11100 10010 10001 10001 10001 10010 11100',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 10001 11001 10101 10011 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 10101 01010', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 10001 01010 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '&': '01100 10010 10100 01000 10101 10010 01101',
    ':': '0 1 1 0 1 1 0', '!': '1 1 1 1 1 0 1', ' ': '000 000 000 000 000 000 000'
  };
  var glyphs = {};
  Object.keys(GLYPHS).forEach(function (k) { glyphs[k] = GLYPHS[k].split(' '); });
  function textWidth(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += (glyphs[text[i]] || glyphs[' '])[0].length + (i ? 1 : 0);
    return w;
  }
  // Draws text with each font dot s units square: a drop shadow and a dark outline, then a
  // two-tone fill, lighter on top.
  function drawText(g, text, x, y, s, top, bottom) {
    var dots = [], cx = x;
    for (var i = 0; i < text.length; i++) {
      var rows = glyphs[text[i]] || glyphs[' '];
      for (var r = 0; r < 7; r++) for (var c = 0; c < rows[r].length; c++) if (rows[r][c] === '1') dots.push([cx + c * s, y + r * s, r]);
      cx += (rows[0].length + 1) * s;
    }
    // The outline and shadow stay a whole number of art pixels (HUD_SUB units each).
    var o = HUD_SUB * Math.max(1, Math.round(s / HUD_SUB / 2));
    g.fillStyle = 'rgba(10,14,40,0.55)';
    dots.forEach(function (d) { g.fillRect(d[0] + o, d[1] + o * 2, s + o, s + o); });
    g.fillStyle = 'rgb(14,18,48)';
    dots.forEach(function (d) { g.fillRect(d[0] - o, d[1] - o, s + 2 * o, s + 2 * o); });
    dots.forEach(function (d) { g.fillStyle = d[2] < 3 ? top : bottom; g.fillRect(d[0], d[1], s, s); });
  }
  var hud = document.getElementById('hud'), hctx = hud.getContext('2d');
  var hudKey = '';
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function clockText(now) {
    var h = now.getHours(), m = two(now.getMinutes());
    if (clockMode === '12') return (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
    return two(h) + ':' + m;
  }
  // The time left until Christmas Day starts, or a greeting on the day.
  function countdownLines(now) {
    if (now.getMonth() === 11 && now.getDate() === 25) return ['MERRY CHRISTMAS!'];
    var year = now.getFullYear();
    if (now.getMonth() === 11 && now.getDate() > 25) year++;
    var left = Math.max(0, Math.floor((new Date(year, 11, 25) - now) / 1000));
    var days = Math.floor(left / 86400), rest = left % 86400;
    var time = two(Math.floor(rest / 3600)) + ':' + two(Math.floor(rest % 3600 / 60)) + (countdownSeconds ? ':' + two(rest % 60) : '') + ' HOURS';
    return [(days ? days + (days === 1 ? ' DAY & ' : ' DAYS & ') : '') + time, 'UNTIL CHRISTMAS DAY!'];
  }
  // The lettering is drawn on a grid of fifths of an art pixel, so a line can be a fifth bigger
  // as well as whole steps: HUD_SUB units make one art pixel.
  var HUD_SUB = 5;
  function drawHud() {
    var showClock = clockMode === '12' || clockMode === '24';
    if ((!showClock && !countdown) || !sizedW) { hud.style.display = 'none'; return; }
    var now = new Date();
    var lines = [];
    if (showClock) lines.push({ text: clockText(now), big: true, top: '#ffffff', bottom: '#bfe0ff' });
    // The countdown, and under it "until Christmas Day!" a fifth bigger.
    if (countdown) countdownLines(now).forEach(function (l, i) { lines.push({ text: l, top: '#fff3a6', bottom: '#ffbe3a', size: i === 1 ? 1.2 : 1 }); });
    var key = sizedW + 'x' + sizedH + lines.map(function (l) { return l.text; }).join('|');
    if (key === hudKey) return;
    hudKey = key;
    // One art pixel is one pixel of the art on screen, or smaller on a narrow screen so the
    // longest line still fits.
    var widest = Math.max.apply(null, lines.map(function (l) { return textWidth(l.text) * (l.size || 1); }));
    var art = Math.max(1, Math.min(P * scale, sizedW / (widest + 8)));
    var unit = art / HUD_SUB;
    var cols = Math.ceil(sizedW / unit), rows = Math.ceil(sizedH / unit);
    if (hud.width !== cols || hud.height !== rows) {
      hud.width = cols; hud.height = rows;
      hud.style.width = cols * unit + 'px'; hud.style.height = rows * unit + 'px';
    }
    hctx.clearRect(0, 0, cols, rows);
    // Centred near the top, in the sky. The clock is two or three times the size, less on a
    // narrow screen.
    var y = (sizedW > sizedH ? 6 : 3) * HUD_SUB;  // a little more room above it in landscape
    lines.forEach(function (l) {
      var w = textWidth(l.text), s = Math.round((l.size || 1) * HUD_SUB);
      if (l.big) s = HUD_SUB * Math.max(1, Math.min(3, Math.floor((cols / HUD_SUB * 0.8) / w)));
      while (s > HUD_SUB && w * s > cols - 4 * HUD_SUB) s--;
      var x = Math.round((cols - w * s) / 2);
      drawText(hctx, l.text, x, y, s, l.top, l.bottom);
      y += 7 * s + (l.big ? 4 : 3) * HUD_SUB;
    });
    hud.style.display = 'block';
  }

  // ---- Diagnostics -------------------------------------------------------------------------
  var frames = 0, diagBox = document.getElementById('diag'), diagAt = performance.now();
  function showDiagnostics(t, m, d) {
    frames++;
    if (!diagnostics || t - diagAt < 1000) return;
    var fps = Math.round(frames * 1000 / (t - diagAt));
    frames = 0; diagAt = t;
    function img(i) { return i.complete ? (i.naturalWidth ? 'ok ' + i.naturalWidth + 'x' + i.naturalHeight : 'FAILED') : 'loading'; }
    diagBox.style.display = 'block';
    diagBox.textContent = [
      'Christmas Village diagnostics',
      'screen ' + sizedW + 'x' + sizedH + ' window ' + window.innerWidth + 'x' + window.innerHeight + ' ratio ' + (window.devicePixelRatio || 1),
      'scale ' + scale.toFixed(3) + ' spare ' + Math.round(spareX) + ',' + Math.round(spareY),
      'frames/s ' + fps + '  time ' + Math.floor(m / 60) + ':' + ('0' + Math.floor(m % 60)).slice(-2) + '  daylight ' + d.toFixed(2),
      'night ' + img(nightImg) + '  day ' + img(dayImg) + '  sky ' + img(skyMask) + '  sleigh ' + img(sleighImg),
      'settings ' + JSON.stringify(opts),
      errors.length ? 'errors: ' + errors.slice(-3).join(' | ') : 'no errors',
      navigator.userAgent
    ].join(String.fromCharCode(10));
  }

  // ---- The loop ------------------------------------------------------------------------------
  var last = performance.now(), pending = false, lastCall = performance.now();
  function next() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function (t) { pending = false; frame(t); });
  }
  // Some WebViews hold back animation frames, for a while or for good. Then a timer keeps the
  // scene moving instead.
  setInterval(function () { if (performance.now() - lastCall > 400) frame(performance.now()); }, 50);
  function frame(t) {
    lastCall = performance.now();
    next();
    // The scroll moves on every frame the screen shows, for a smooth glide; the rest of the
    // scene is drawn about 30 times a second.
    try { place(t); } catch (e) { /* never stop the loop */ }
    var dt = (t - last) / 1000;
    if (dt < 1 / 32) return; // about 30 frames a second is plenty
    last = t;
    try { tick(t, dt); } catch (e) {
      errors.push(String(e && e.message || e));
      if (window.console) console.error(e);
    }
    try { showDiagnostics(t, minutesNow(), daylight(minutesNow())); } catch (e) { /* never stop the loop */ }
  }
  function tick(t, dt) {
    if (dt > 0.25) dt = 0.25;
    var m = minutesNow(), d = daylight(m), n = 1 - d;
    drawBase(d, glow(m));
    drawClouds(dt, d);
    ctx.clearRect(0, 0, GW, GH);
    drawWindows(t, n);
    drawBulbs(t, d);
    drawStars(t, dt, n * n);
    drawWater(dt, d);
    drawSmoke(dt, d);
    drawSanta(dt, n);
    drawSnow(dt, t, d);
    drawHud();
  }
  next();
})();
