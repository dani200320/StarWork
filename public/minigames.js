// A 8 interaktív feladat. MiniGames.start(type, el, gloves, done, wave) -> cleanup függvény.
// gloves (0-3): könnyít (Bionikus Kesztyű); wave (1-5): nehezít.
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };

  function finisher(el, done) {
    let finished = false;
    return (ok, text) => {
      if (finished) return;
      finished = true;
      const m = el.querySelector('.mg-msg');
      if (m) { m.textContent = text || (ok ? 'Siker!' : 'Hiba!'); m.className = 'mg-msg ' + (ok ? 'ok' : 'bad'); }
      if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80, 40, 80]);
      setTimeout(() => done(ok), ok ? 650 : 1000);
    };
  }

  // 1. Kábel-Káosz -------------------------------------------------------
  function wires(el, g, d, done) {
    const n = clamp(4 + Math.floor(d / 2) - [0, 1, 1, 2][g], 2, 6);
    const COLORS = shuffle(['#e6707a', '#4cc0d6', '#e3b94f', '#d47fd2', '#4dbd8d', '#e88b4d']).slice(0, n);
    const right = shuffle(COLORS.slice());
    const STEP = 46;
    el.innerHTML = `<div class="mg"><div class="mg-hint">Koppints egy bal oldali vezetékre, majd a jobb oldali párjára!</div>
      <div class="wires" style="height:${n * STEP + 30}px"><svg></svg></div><div class="mg-msg"></div></div>`;
    const box = el.querySelector('.wires');
    const svg = box.querySelector('svg');
    const finish = finisher(el, done);
    let sel = null, connected = 0;
    const pos = i => 15 + i * STEP + STEP / 2;
    const mk = (side, c, i) => {
      const b = document.createElement('button');
      b.className = 'wire-end ' + side;
      b.style.top = pos(i) + 'px';
      b.style.background = c; b.style.color = c;
      b.dataset.c = c; b.dataset.i = i;
      box.appendChild(b);
      return b;
    };
    COLORS.forEach((c, i) => {
      const b = mk('l', c, i);
      b.onclick = () => { if (b.classList.contains('done')) return; box.querySelectorAll('.l').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); };
    });
    right.forEach((c, i) => {
      const b = mk('r', c, i);
      b.onclick = () => {
        if (!sel || b.classList.contains('done')) return;
        if (sel.dataset.c === c) {
          const w = box.clientWidth;
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const y1 = pos(+sel.dataset.i), y2 = pos(i);
          line.setAttribute('d', `M60 ${y1} C ${w / 2} ${y1}, ${w / 2} ${y2}, ${w - 60} ${y2}`);
          line.setAttribute('stroke', c); line.setAttribute('stroke-width', '8'); line.setAttribute('fill', 'none');
          line.setAttribute('stroke-linecap', 'round');
          svg.appendChild(line);
          sel.classList.add('done'); sel.classList.remove('sel'); b.classList.add('done');
          sel = null;
          if (++connected === n) finish(true, 'Áram van!');
        } else {
          finish(false, 'Zárlat, rossz szín!');
        }
      };
    });
    return () => {};
  }

  // 2. Plazma-Csapolás ----------------------------------------------------
  function plasma(el, g, d, done) {
    const lo = Math.round(clamp(80 - g * 4 + d * 0.5, 50, 85)), hi = Math.round(clamp(90 + g * 3 - d * 0.5, lo + 4, 99));
    const rate = ([48, 38, 32, 26][g] || 48) * (1 + 0.08 * d);
    el.innerHTML = `<div class="mg"><div class="mg-hint">Tartsd nyomva, és engedd el a <b>zöld sávban</b> (${lo}-${hi}%).</div>
      <div class="plasma"><div class="tube"><div class="zone" style="bottom:${lo}%;height:${hi - lo}%"></div><div class="liq" style="height:0%"></div></div>
      <button class="holdbtn">Tartsd<br>nyomva</button></div><div class="mg-msg"></div></div>`;
    const liq = el.querySelector('.liq');
    const btn = el.querySelector('.holdbtn');
    const finish = finisher(el, done);
    let v = 0, holding = false, last = 0, raf = 0, used = false;
    const loop = (ts) => {
      const dt = last ? (ts - last) / 1000 : 0; last = ts;
      if (holding) {
        v += rate * dt;
        if (v >= 100) { v = 100; holding = false; btn.classList.remove('down'); finish(false, 'Túlcsordult!'); }
      }
      liq.style.height = v + '%';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); if (used) return; used = true; holding = true; btn.setPointerCapture(e.pointerId); btn.classList.add('down'); });
    const up = () => {
      if (!holding) return;
      holding = false; btn.classList.remove('down');
      if (v >= lo && v <= hi) finish(true, `Tökéletes, ${Math.round(v)}%`);
      else finish(false, `${Math.round(v)}%, mellé!`);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    return () => cancelAnimationFrame(raf);
  }

  // 3. Meteor-Pajzs -------------------------------------------------------
  function meteor(el, g, d, done) {
    const n = ([5, 4, 4, 3][g] || 5) + Math.floor(d / 2);
    const time = 8 + g * 2;
    const spd = ([70, 55, 45, 38][g] || 70) * (1 + 0.12 * d);
    el.innerHTML = `<div class="mg"><div class="mg-hint">Koppints mind a(z) ${n} aszteroidára, mielőtt lejár az idő!</div>
      <div class="mg-timer"><div></div></div><div class="radar"><div class="sweep"></div></div><div class="mg-msg"></div></div>`;
    const radar = el.querySelector('.radar');
    const bar = el.querySelector('.mg-timer div');
    const finish = finisher(el, done);
    const R = 135;
    const rocks = [];
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(20, 95);
      const va = rnd(0, Math.PI * 2);
      const b = document.createElement('button');
      b.className = 'asteroid'; b.innerHTML = '<i class="ph-fill ph-meteor"></i>';
      b.setAttribute('aria-label', 'Aszteroida');
      b.style.fontSize = (30 + g * 5) + 'px';
      radar.appendChild(b);
      const rock = { x: R + Math.cos(a) * r, y: R + Math.sin(a) * r, vx: Math.cos(va) * spd, vy: Math.sin(va) * spd, el: b, alive: true };
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!rock.alive) return;
        rock.alive = false; b.classList.add('boom');
        if (navigator.vibrate) navigator.vibrate(15);
        if (rocks.every(r => !r.alive)) finish(true, 'A pajzs tart!');
      });
      rocks.push(rock);
    }
    let last = 0, raf = 0;
    const start = performance.now();
    const loop = ts => {
      const dt = last ? (ts - last) / 1000 : 0; last = ts;
      const left = 1 - (ts - start) / (time * 1000);
      bar.style.width = Math.max(0, left * 100) + '%';
      if (left <= 0) { finish(false, 'Becsapódott!'); return; }
      for (const r of rocks) {
        if (!r.alive) continue;
        r.x += r.vx * dt; r.y += r.vy * dt;
        const dx = r.x - R, dy = r.y - R, dd = Math.hypot(dx, dy);
        if (dd > R - 22) { const nx = dx / dd, ny = dy / dd; const dot = r.vx * nx + r.vy * ny; r.vx -= 2 * dot * nx; r.vy -= 2 * dot * ny; r.x = R + nx * (R - 23); r.y = R + ny * (R - 23); }
        r.el.style.left = r.x + 'px'; r.el.style.top = r.y + 'px';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  // 4. Memória-Mátrix ----------------------------------------------------
  function memory(el, g, d, done) {
    const steps = ([4, 3, 3, 3][g] || 4) + Math.floor(d / 2);
    const flash = ([520, 650, 750, 850][g] || 520) * (1 - 0.05 * d);
    const COLS = ['#4cc0d6', '#d47fd2', '#4dbd8d', '#e3b94f', '#e6707a', '#9b8ae0', '#9cc457', '#e88b4d', '#4c8fe0'];
    el.innerHTML = `<div class="mg"><div class="mg-hint" id="mm-hint">Figyeld a villanásokat…</div>
      <div class="matrix"></div><div class="mg-msg"></div></div>`;
    const grid = el.querySelector('.matrix');
    const hint = el.querySelector('#mm-hint');
    const finish = finisher(el, done);
    const cells = COLS.map(c => { const b = document.createElement('button'); b.className = 'mcell'; b.style.setProperty('--c', c); grid.appendChild(b); return b; });
    const seq = [];
    for (let i = 0; i < steps; i++) { let x; do { x = Math.floor(Math.random() * 9); } while (x === seq[i - 1]); seq.push(x); }
    let input = false, idx = 0;
    const timers = [];
    const lit = (i, ms) => { cells[i].classList.add('lit'); timers.push(setTimeout(() => cells[i].classList.remove('lit'), ms)); };
    seq.forEach((c, i) => timers.push(setTimeout(() => lit(c, flash * 0.7), 600 + i * flash)));
    timers.push(setTimeout(() => { input = true; hint.textContent = `Most te! Ismételd meg (${steps} lépés)`; }, 600 + steps * flash));
    cells.forEach((b, i) => b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!input) return;
      lit(i, 180);
      if (seq[idx] === i) {
        idx++;
        if (idx === seq.length) { input = false; finish(true, 'Zseni!'); }
      } else { input = false; finish(false, 'Elfelejtetted!'); }
    }));
    return () => timers.forEach(clearTimeout);
  }

  // 5. Hullám-Kalibrálás --------------------------------------------------
  function wave(el, g, d, done) {
    const tol = Math.max(4, ([6, 8, 11, 14][g] || 6) - d * 0.5);
    const names = ['AMPLITÚDÓ', 'FREKVENCIA', 'FÁZIS'];
    const targets = names.map(() => Math.round(rnd(12, 88)));
    const vals = targets.map(t => { let v; do { v = Math.round(rnd(5, 95)); } while (Math.abs(v - t) < 25); return v; });
    el.innerHTML = `<div class="mg wavebox"><div class="mg-hint">Húzd a csúszkákat a zöld sávokba, hogy a hullámok fedjék egymást!</div>
      <canvas width="600" height="220"></canvas><div class="sliders"></div><div class="mg-msg"></div></div>`;
    const cv = el.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const box = el.querySelector('.sliders');
    const finish = finisher(el, done);
    const tracks = names.map((n, i) => {
      const row = h(`<div class="wslider"><div class="wl">${n}<b>${vals[i]}</b></div><div class="wtrack"><div class="tgt"></div><div class="knob"></div></div></div>`);
      box.appendChild(row);
      const tr = row.querySelector('.wtrack');
      const tg = row.querySelector('.tgt');
      tg.style.left = `${Math.max(0, targets[i] - tol)}%`;
      tg.style.width = `${Math.min(100, targets[i] + tol) - Math.max(0, targets[i] - tol)}%`;
      const knob = row.querySelector('.knob');
      const label = row.querySelector('b');
      const set = clientX => {
        const r = tr.getBoundingClientRect();
        vals[i] = Math.round(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
        render();
      };
      let drag = false;
      tr.addEventListener('pointerdown', e => { e.preventDefault(); drag = true; tr.setPointerCapture(e.pointerId); set(e.clientX); });
      tr.addEventListener('pointermove', e => { if (drag) set(e.clientX); });
      const end = () => { drag = false; check(); };
      tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
      return { tr, knob, label };
    });
    function check() {
      if (vals.every((v, i) => Math.abs(v - targets[i]) <= tol)) finish(true, 'Szinkronban!');
    }
    function waveY(a, f, p, x) { return 110 + Math.sin(x / 600 * Math.PI * 2 * (1 + f / 25) + p / 100 * Math.PI * 2) * (15 + a * 0.8); }
    function render() {
      tracks.forEach((t, i) => {
        t.knob.style.left = vals[i] + '%';
        t.label.textContent = vals[i];
        t.tr.classList.toggle('ok', Math.abs(vals[i] - targets[i]) <= tol);
      });
      ctx.clearRect(0, 0, 600, 220);
      const draw = (v, col, w, dash) => {
        ctx.beginPath(); ctx.setLineDash(dash || []);
        for (let x = 0; x <= 600; x += 4) { const y = waveY(v[0], v[1], v[2], x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
      };
      draw(targets, 'rgba(63,191,127,0.85)', 5, [12, 10]);
      draw(vals, '#ededf0', 4);
      ctx.setLineDash([]);
    }
    render();
    return () => {};
  }

  // 6. Csillagtérkép: kösd össze a csillagokat számsorrendben --------------
  function stars(el, g, d, done) {
    const n = clamp(5 + Math.floor(d / 2) - (g >= 2 ? 1 : 0), 4, 8);
    const time = 9 + g * 2 - d * 0.4;
    el.innerHTML = `<div class="mg"><div class="mg-hint">Koppints a csillagokra <b>1-től ${n}-ig</b> sorrendben, hogy kirajzold a csillagképet!</div>
      <div class="mg-timer"><div></div></div>
      <div class="starfield"><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div><div class="mg-msg"></div></div>`;
    const field = el.querySelector('.starfield');
    const svg = field.querySelector('svg');
    const bar = el.querySelector('.mg-timer div');
    const finish = finisher(el, done);
    // Véletlen pozíciók, egymástól elég távol (százalékban).
    const pts = [];
    for (let i = 0; i < n; i++) {
      let p, tries = 0;
      do { p = { x: rnd(10, 90), y: rnd(10, 90) }; tries++; } while (tries < 200 && pts.some(q => Math.hypot(q.x - p.x, (q.y - p.y) * 0.9) < 19));
      pts.push(p);
    }
    let next = 0;
    const btns = pts.map((p, i) => {
      const b = document.createElement('button');
      b.className = 'star' + (i === 0 && g >= 1 ? ' hint' : '');
      b.style.left = p.x + '%'; b.style.top = p.y + '%';
      b.innerHTML = `<span>${i + 1}</span>`;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (b.classList.contains('done')) return;
        if (i !== next) { b.classList.add('wrong'); finish(false, 'Rossz csillag!'); return; }
        b.classList.add('done'); b.classList.remove('hint');
        if (i > 0) {
          const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          l.setAttribute('x1', pts[i - 1].x); l.setAttribute('y1', pts[i - 1].y); l.setAttribute('x2', p.x); l.setAttribute('y2', p.y);
          svg.appendChild(l);
        }
        next++;
        if (next === n) { finish(true, 'Kész a csillagkép!'); return; }
        if (g >= 1) btns[next].classList.add('hint');
      });
      field.appendChild(b);
      return b;
    });
    const start = performance.now();
    let raf = 0;
    const loop = ts => {
      const left = 1 - (ts - start) / (time * 1000);
      bar.style.width = Math.max(0, left * 100) + '%';
      if (left <= 0) { finish(false, 'Elfogyott az idő!'); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  // 7. Kódtörő: Wordle-szerű, a jó helyen lévő szimbólumok zölden rögzülnek -
  function code(el, g, d, done) {
    const SYMS = ['#e6707a', '#4dbd8d', '#4c8fe0', '#e3b94f', '#9b8ae0'].map(c => `<span class="sym" style="--c:${c}"></span>`);
    const P = d >= 2 ? 4 : 3;
    const K = d >= 3 ? 5 : 4;
    const syms = SYMS.slice(0, K);
    const secret = Array.from({ length: P }, () => Math.floor(Math.random() * K));
    let tries = K + 1 + g;
    const cur = Array(P).fill(0);
    const locked = Array(P).fill(false);
    el.innerHTML = `<div class="mg"><div class="mg-hint">Koppints a tárcsákra a színváltáshoz, majd próbáld ki. A <b>zöld keretes</b> már jó helyen van.</div>
      <div class="guesses"></div><div class="dials"></div>
      <div class="tries"></div>
      <button class="btn btn-primary try-btn">Próba</button><div class="mg-msg"></div></div>`;
    const dials = el.querySelector('.dials');
    const hist = el.querySelector('.guesses');
    const triesEl = el.querySelector('.tries');
    const finish = finisher(el, done);
    const dialBtns = cur.map((_, i) => {
      const b = document.createElement('button');
      b.className = 'dial';
      b.addEventListener('click', () => { if (locked[i]) return; cur[i] = (cur[i] + 1) % K; paint(); });
      dials.appendChild(b);
      return b;
    });
    function paint() {
      dialBtns.forEach((b, i) => { b.innerHTML = syms[cur[i]]; b.classList.toggle('locked', locked[i]); });
      triesEl.textContent = `Hátralévő próbálkozás: ${tries}`;
    }
    el.querySelector('.try-btn').addEventListener('click', () => {
      if (tries <= 0 || locked.every(Boolean)) return;
      tries--;
      const row = document.createElement('div');
      row.className = 'guess-row';
      cur.forEach((c, i) => {
        const ok = c === secret[i];
        if (ok) locked[i] = true;
        row.insertAdjacentHTML('beforeend', `<span class="${ok ? 'ok' : 'no'}">${syms[c]}</span>`);
      });
      hist.appendChild(row);
      paint();
      if (locked.every(Boolean)) finish(true, 'Feltörve!');
      else if (tries <= 0) finish(false, 'Lezárva, elfogytak a próbák.');
    });
    paint();
    return () => {};
  }

  // 8. Energia-Zsonglőr: tartsd az összes rudat a zöld sávban --------------
  function juggle(el, g, d, done) {
    const B = d >= 3 ? 4 : 3;
    const lo = 40 - g * 4, hi = 70 + g * 4;
    const need = 6 - g * 0.5;
    const limit = 16;
    el.innerHTML = `<div class="mg"><div class="mg-hint">Koppints a rudakra a töltéshez! Tartsd <b>mindet</b> a zöld sávban összesen ${need} mp-ig!</div>
      <div class="mg-timer"><div></div></div>
      <div class="jbars"></div>
      <div class="jprog"><div></div></div><div class="mg-msg"></div></div>`;
    const wrap = el.querySelector('.jbars');
    const bar = el.querySelector('.mg-timer div');
    const prog = el.querySelector('.jprog div');
    const finish = finisher(el, done);
    const COLS = ['#4cc0d6', '#d47fd2', '#e3b94f', '#4dbd8d'];
    const bars = Array.from({ length: B }, (_, i) => {
      const b = h(`<button class="jbar"><div class="jband" style="bottom:${lo}%;height:${hi - lo}%"></div><div class="jfill"></div></button>`);
      b.style.setProperty('--c', COLS[i]);
      wrap.appendChild(b);
      const o = { v: rnd(45, 65), drain: rnd(7, 14) * (1 + 0.08 * d), el: b, fill: b.querySelector('.jfill') };
      b.addEventListener('pointerdown', e => { e.preventDefault(); o.v = Math.min(100, o.v + 16); });
      return o;
    });
    let held = 0, last = 0, raf = 0, nextKick = 1.5;
    const start = performance.now();
    const loop = ts => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      const t = (ts - start) / 1000;
      // Időnként egy rúd hirtelen gyorsabban kezd merülni.
      if (t > nextKick) { nextKick = t + rnd(1.2, 2.4); bars[Math.floor(Math.random() * B)].drain = rnd(8, 16) * (1 + 0.08 * d); }
      let allIn = true;
      for (const o of bars) {
        o.v = Math.max(0, o.v - o.drain * dt);
        const inBand = o.v >= lo && o.v <= hi;
        if (!inBand) allIn = false;
        o.fill.style.height = o.v + '%';
        o.el.classList.toggle('out', !inBand);
      }
      if (allIn) held += dt;
      prog.style.width = Math.min(100, held / need * 100) + '%';
      bar.style.width = Math.max(0, (1 - t / limit) * 100) + '%';
      if (held >= need) { finish(true, 'Stabil az energia!'); return; }
      if (t >= limit) { finish(false, 'Túlterhelés!'); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  const GAMES = { wires, plasma, meteor, memory, wave, stars, code, juggle };
  window.MiniGames = {
    start(type, el, gloves, done, waveNum) {
      const g = clamp(gloves || 0, 0, 3);
      const d = clamp((waveNum || 1) - 1, 0, 4);
      return (GAMES[type] || wires)(el, g, d, done);
    },
  };
})();
