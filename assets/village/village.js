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
  var santa = opts.santa !== false;
  var fixedTime = /^(\d\d?):(\d\d)$/.exec(query.get('t') || '');

  var stage = document.getElementById('stage');
  var base = document.getElementById('base'), bctx = base.getContext('2d');
  var fx = document.getElementById('fx'), ctx = fx.getContext('2d');
  var cloudCanvas = document.getElementById('clouds'), cctx = cloudCanvas.getContext('2d');
  var sleighCanvas = document.getElementById('sleigh'), sctx = sleighCanvas.getContext('2d');

  function load(src) {
    var img = new Image();
    img.src = src;
    return img;
  }
  var night = load('night.webp'), day = load('day.webp'), skyMask = load('sky.png'), sleighImg = load('sleigh.png');
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
    if (!night.complete || !day.complete) return;
    if (Math.abs(d - lastDay) < 0.003 && Math.abs(g - lastGlow) < 0.003) return;
    lastDay = d; lastGlow = g;
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.drawImage(night, 0, 0, W, H);
    if (d > 0) { bctx.globalAlpha = d; bctx.drawImage(day, 0, 0, W, H); }
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
      // A warm wash over the sky and snow.
      bctx.globalCompositeOperation = 'soft-light';
      bctx.globalAlpha = 0.6 * g;
      bctx.fillRect(0, 0, W, H);
    }
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-over';
  }

  // ---- Fitting the screen ------------------------------------------------------------------
  // The scene covers the screen. On a screen narrower than the picture, as in portrait, it
  // drifts slowly from side to side so the whole village comes into view.
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
  window.addEventListener('resize', function () { sizedW = 0; layout(); });
  layout();
  var sizeCheck = 0;
  function place(t) {
    if (!sizedW || (sizeCheck += 1) >= 30) { sizeCheck = 0; layout(); }
    if (!sizedW) return;
    var x = spareX > 1 ? -spareX * (0.5 + 0.5 * Math.sin(t / 1000 * 2 * Math.PI / 240)) : 0;
    // A screen wider than the picture loses a little sky and the rest from the foreground, so
    // the star on the tree stays in view.
    var y = -spareY * 0.1;
    stage.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + scale + ')';
  }

  // ---- Snow ---------------------------------------------------------------------------------
  var flakes = [];
  var FLAKES = [0, 90, 200, 480][snowLevel];
  var wind = snowLevel === 3 ? 9 : 0.8, fall = snowLevel === 3 ? 1.6 : 1;
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
  var chimneys = S.chimneys.map(function (c) { return { gx: c[0] / P, gy: c[1] / P, next: 0 }; });
  var puffs = [];
  function drawSmoke(dt, d) {
    for (var c = 0; c < chimneys.length; c++) {
      var ch = chimneys[c];
      ch.next -= dt;
      if (ch.next <= 0) {
        ch.next = rand(0.45, 0.8);
        puffs.push({ x: ch.gx + rand(-0.6, 0.6), y: ch.gy, age: 0, life: rand(5, 7.5), ph: rand(0, 6.3), small: c > 0 });
      }
    }
    var tint = d > 0.5 ? [238, 238, 244] : [200, 200, 232];
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i];
      p.age += dt;
      if (p.age >= p.life) { puffs.splice(i, 1); continue; }
      var k = p.age / p.life;
      var x = p.x + (wind * 0.5 + 0.35) * p.age + Math.sin(p.age * 1.3 + p.ph) * 0.7;
      var y = p.y - (p.small ? 1.2 : 1.6) * p.age;
      var size = Math.round((p.small ? 1 : 1.2) + k * (p.small ? 1.4 : 2.4));
      var a = 0.55 * Math.pow(1 - k, 1.3) * Math.min(1, p.age / 0.4);
      ctx.fillStyle = 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + a.toFixed(3) + ')';
      var gx = Math.round(x - size / 2), gy = Math.round(y - size / 2);
      if (size < 3) ctx.fillRect(gx, gy, size, size);
      else { ctx.fillRect(gx + 1, gy, size - 2, size); ctx.fillRect(gx, gy + 1, size, size - 2); }
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
    if (!santa) return;
    if (!flight) {
      if (n > 0.6) nextFlight -= dt;
      if (nextFlight <= 0) { flight = { age: 0, life: 17, y: rand(120, 165) }; nextFlight = rand(70, 150); }
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
    var w = Math.round(rand(14, 28)), h = Math.round(rand(5, 8));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var blobs = [];
    for (var i = 0; i < 4; i++) blobs.push([rand(h * 0.5, w - h * 0.5), rand(h * 0.45, h * 0.7), rand(h * 0.35, h * 0.6)]);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var inside = blobs.some(function (b) { var dx = (x + 0.5 - b[0]) / 1.4, dy = y + 0.5 - b[1]; return dx * dx + dy * dy < b[2] * b[2]; });
      if (!inside && !(y >= h - 2 && x > 1 && x < w - 2)) continue;
      g.fillStyle = y >= h - 2 ? 'rgb(214,226,242)' : y >= h - 3 ? 'rgb(236,242,250)' : '#fff';
      g.fillRect(x, y, 1, 1);
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

  // ---- The loop ------------------------------------------------------------------------------
  var last = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = (t - last) / 1000;
    if (dt < 1 / 32) return; // about 30 frames a second is plenty
    last = t;
    if (dt > 0.25) dt = 0.25;
    var m = minutesNow(), d = daylight(m), n = 1 - d;
    drawBase(d, glow(m));
    place(t);
    drawClouds(dt, d);
    ctx.clearRect(0, 0, GW, GH);
    drawWindows(t, n);
    drawBulbs(t, d);
    drawStars(t, dt, n * n);
    drawWater(dt, d);
    drawSmoke(dt, d);
    drawSanta(dt, n);
    drawSnow(dt, t, d);
  }
  night.onload = day.onload = function () { lastDay = -1; };
  requestAnimationFrame(frame);
})();
