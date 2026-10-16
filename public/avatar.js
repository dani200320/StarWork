// Vicces avatarok rajzolása. Origó: a test közepe; ~1 egység = 1 világ-pixel.
(function () {
  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    let v = shadeCache.get(key);
    if (!v) { v = shadeRaw(hex, amt); shadeCache.set(key, v); }
    return v;
  }
  function shadeRaw(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return `rgb(${r},${g},${b})`;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Teljesítmény: a gradienseket egyszer hozzuk létre és újrahasznosítjuk (a CanvasGradient
  // koordinátái a rajzoláskori transzformációban értendők, így bármely avatarra jók).
  const gradCache = new Map();
  function cachedGrad(key, make) {
    let g = gradCache.get(key);
    if (!g) { g = make(); gradCache.set(key, g); }
    return g;
  }
  const scratch = document.createElement('canvas').getContext('2d');
  const vipSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(48, 48, 5, 48, 48, 48);
    gr.addColorStop(0, 'rgba(250,204,21,0.45)'); gr.addColorStop(1, 'rgba(250,204,21,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    return c;
  })();

  // Fejformák: visszaadják a fej tetejének y-ját és az arc középpontját.
  const HEAD_Y = -22;
  const HEADS = {
    cube(ctx, c) {
      rr(ctx, -15, HEAD_Y - 14, 30, 28, 5);
      ctx.fillStyle = c; ctx.fill(); ctx.stroke();
      return { top: HEAD_Y - 14, face: { x: 2, y: HEAD_Y } };
    },
    potato(ctx, c, t) {
      ctx.beginPath();
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = 15 + Math.sin(a * 3) * 2.2 + Math.cos(a * 5) * 1.5;
        const x = Math.cos(a) * r * 1.08, y = HEAD_Y + Math.sin(a) * r * 0.95;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(80,50,20,0.45)';
      [[-8, -6, 2.2], [7, 6, 1.8], [-4, 8, 1.5], [9, -8, 1.4]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, HEAD_Y + y, r, 0, 7); ctx.fill(); });
      // csíra
      ctx.strokeStyle = '#86efac'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, HEAD_Y - 13); ctx.quadraticCurveTo(-10, HEAD_Y - 20, -4 + Math.sin(t * 3) * 2, HEAD_Y - 22); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
      return { top: HEAD_Y - 15, face: { x: 2, y: HEAD_Y } };
    },
    egg(ctx, c, t) {
      ctx.beginPath();
      ctx.moveTo(0, HEAD_Y - 22);
      ctx.bezierCurveTo(14, HEAD_Y - 22, 16, HEAD_Y + 4, 14, HEAD_Y + 10);
      ctx.bezierCurveTo(10, HEAD_Y + 17, -10, HEAD_Y + 17, -14, HEAD_Y + 10);
      ctx.bezierCurveTo(-16, HEAD_Y + 4, -14, HEAD_Y - 22, 0, HEAD_Y - 22);
      ctx.fillStyle = c; ctx.fill(); ctx.stroke();
      // antennák
      const w = Math.sin(t * 6) * 3;
      ctx.beginPath(); ctx.moveTo(-5, HEAD_Y - 20); ctx.lineTo(-10 + w, HEAD_Y - 32); ctx.moveTo(5, HEAD_Y - 20); ctx.lineTo(10 + w, HEAD_Y - 32); ctx.stroke();
      ctx.fillStyle = '#a3e635';
      ctx.beginPath(); ctx.arc(-10 + w, HEAD_Y - 33, 3, 0, 7); ctx.arc(10 + w, HEAD_Y - 33, 3, 0, 7); ctx.fill();
      return { top: HEAD_Y - 22, face: { x: 2, y: HEAD_Y + 1 } };
    },
    chin(ctx, c) {
      ctx.beginPath();
      ctx.moveTo(-13, HEAD_Y + 2);
      ctx.arc(0, HEAD_Y - 2, 13, Math.PI, 0);
      ctx.lineTo(13, HEAD_Y + 4);
      ctx.quadraticCurveTo(24, HEAD_Y + 10, 20, HEAD_Y + 20);
      ctx.quadraticCurveTo(4, HEAD_Y + 26, -12, HEAD_Y + 14);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.stroke();
      // állgödröcske
      ctx.beginPath(); ctx.moveTo(12, HEAD_Y + 17); ctx.quadraticCurveTo(14, HEAD_Y + 20, 16, HEAD_Y + 17); ctx.stroke();
      return { top: HEAD_Y - 15, face: { x: 3, y: HEAD_Y - 3 } };
    },
    tri(ctx, c) {
      ctx.beginPath();
      ctx.moveTo(0, HEAD_Y - 20);
      ctx.lineTo(18, HEAD_Y + 12);
      ctx.lineTo(-18, HEAD_Y + 12);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.stroke();
      return { top: HEAD_Y - 14, face: { x: 1, y: HEAD_Y + 3 }, pointy: true };
    },
  };

  const HATS = {
    plunger(ctx, top, t) {
      ctx.fillStyle = '#e11d48';
      ctx.beginPath(); ctx.ellipse(0, top + 1, 11, 7, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b45309';
      const sway = Math.sin(t * 5) * 0.12;
      ctx.save(); ctx.translate(0, top - 4); ctx.rotate(sway);
      rr(ctx, -2.5, -26, 5, 26, 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    elvis(ctx, top) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(-14, top + 8);
      ctx.quadraticCurveTo(-16, top - 10, 4, top - 12);
      ctx.quadraticCurveTo(26, top - 14, 22, top - 2);
      ctx.quadraticCurveTo(14, top - 6, 10, top + 2);
      ctx.quadraticCurveTo(0, top - 2, -14, top + 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(147,197,253,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, top - 4); ctx.quadraticCurveTo(6, top - 10, 18, top - 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
    },
    foil(ctx, top) {
      ctx.fillStyle = cachedGrad('foil' + top, () => {
        const g = scratch.createLinearGradient(-12, top - 24, 12, top);
        g.addColorStop(0, '#f8fafc'); g.addColorStop(0.5, '#94a3b8'); g.addColorStop(1, '#e2e8f0');
        return g;
      });
      ctx.beginPath();
      ctx.moveTo(-14, top + 3); ctx.lineTo(-8, top - 8); ctx.lineTo(-4, top - 6); ctx.lineTo(0, top - 26);
      ctx.lineTo(4, top - 9); ctx.lineTo(9, top - 11); ctx.lineTo(14, top + 3); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-2, top - 12, 1.5, 0, 7); ctx.fill();
    },
    colander(ctx, top) {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath(); ctx.arc(0, top + 4, 15, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#334155';
      for (const [x, y] of [[-8, -1], [-3, -5], [3, -5], [8, -1], [0, 0], [-5, 2], [5, 2]]) { ctx.beginPath(); ctx.arc(x, top + y, 1.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#94a3b8';
      rr(ctx, 13, top + 1, 9, 4, 2); ctx.fill(); ctx.stroke();
    },
    mohawk(ctx, top, t) {
      const cols = ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      for (let i = 0; i < 6; i++) {
        const x = -10 + i * 4;
        const h = 14 + Math.sin(t * 8 + i) * 2;
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.moveTo(x - 3, top + 4); ctx.lineTo(x + 1, top - h); ctx.lineTo(x + 4, top + 4); ctx.closePath(); ctx.fill();
      }
    },
    crown(ctx, top, t) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-12, top + 3); ctx.lineTo(-12, top - 10); ctx.lineTo(-6, top - 3); ctx.lineTo(0, top - 13);
      ctx.lineTo(6, top - 3); ctx.lineTo(12, top - 10); ctx.lineTo(12, top + 3); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, top - 2, 2, 0, 7); ctx.fill();
      if (Math.sin(t * 4) > 0.8) { ctx.fillStyle = '#fff'; ctx.fillRect(9, top - 13, 2, 2); }
    },
  };

  const FACES = {
    googly(ctx, f, t) {
      const b1 = Math.sin(t * 9) * 2.5, b2 = Math.cos(t * 7) * 2.5;
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2;
      // rugók
      for (const [ex, bb] of [[-5, b1], [7, b2]]) {
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) ctx.lineTo(ex + (i % 2 ? 1.5 : -1.5), f.y - 2 - i * 1.0 + 0);
        ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ex, f.y - 9 + bb, 5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2;
      }
      // kancsal pupillák
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(-3, f.y - 9 + b1 + 1, 2.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(5, f.y - 8 + b2 - 1, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y + 4, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    },
    laser(ctx, f, t) {
      ctx.fillStyle = '#0b0b0f';
      rr(ctx, f.x - 13, f.y - 6, 12, 7, 2); ctx.fill();
      rr(ctx, f.x + 1, f.y - 6, 12, 7, 2); ctx.fill();
      ctx.fillRect(f.x - 2, f.y - 5, 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(f.x - 11, f.y - 5, 3, 2); ctx.fillRect(f.x + 3, f.y - 5, 3, 2);
      if (Math.sin(t * 2.3) > 0.55) {
        // ragyogás shadowBlur helyett: egy vastag, áttetsző és egy vékony, élénk vonal
        ctx.beginPath(); ctx.moveTo(f.x + 13, f.y - 3); ctx.lineTo(f.x + 50, f.y - 1); ctx.moveTo(f.x + 7, f.y - 2); ctx.lineTo(f.x + 50, f.y + 3);
        ctx.strokeStyle = 'rgba(244,63,94,0.3)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,120,140,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x - 3, f.y + 6); ctx.lineTo(f.x + 5, f.y + 5); ctx.stroke();
    },
    monocle(ctx, f, t) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(f.x - 5, f.y - 4, 1.8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(f.x + 6, f.y - 4, 5, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(186,230,253,0.35)'; ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(f.x + 6, f.y - 4, 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(f.x + 6, f.y + 1); ctx.quadraticCurveTo(f.x + 10, f.y + 12, f.x + 4, f.y + 16); ctx.stroke();
      // pödört bajusz
      const w = Math.sin(t * 4) * 1;
      ctx.strokeStyle = '#1f1300'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + 4);
      ctx.bezierCurveTo(f.x - 6, f.y + 1, f.x - 12, f.y + 7, f.x - 10, f.y + 1 + w);
      ctx.moveTo(f.x, f.y + 4);
      ctx.bezierCurveTo(f.x + 6, f.y + 1, f.x + 12, f.y + 7, f.x + 10, f.y + 1 - w);
      ctx.stroke();
      ctx.lineCap = 'butt';
    },
    scream(ctx, f, t) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(f.x - 5, f.y - 6, 2, 0, 7); ctx.arc(f.x + 6, f.y - 6, 2, 0, 7); ctx.fill();
      const open = 6 + Math.abs(Math.sin(t * 10)) * 2.5;
      ctx.fillStyle = '#3f0d12';
      ctx.beginPath(); ctx.ellipse(f.x + 1, f.y + 4, 4.5, open, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath(); ctx.ellipse(f.x + 1, f.y + 4 + open * 0.5, 3, 2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x - 9, f.y - 11); ctx.lineTo(f.x - 2, f.y - 9); ctx.moveTo(f.x + 10, f.y - 11); ctx.lineTo(f.x + 3, f.y - 9); ctx.stroke();
    },
    grin(ctx, f) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(f.x - 5, f.y - 5, 2, 3, 0, 0, 7); ctx.ellipse(f.x + 6, f.y - 5, 2, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x - 10, f.y + 1); ctx.quadraticCurveTo(f.x + 1, f.y + 14, f.x + 12, f.y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x - 9, f.y + 3); ctx.lineTo(f.x + 11, f.y + 3); ctx.moveTo(f.x - 3, f.y + 2); ctx.lineTo(f.x - 3, f.y + 7); ctx.moveTo(f.x + 4, f.y + 2); ctx.lineTo(f.x + 4, f.y + 7); ctx.stroke();
    },
  };

  const headCache = new Map();
  // A fej befoglaló doboza avatar-egységekben (a lézersugár miatt jobbra hosszabb).
  const HB = { x: -34, y: HEAD_Y - 58, w: 92, h: 92 };
  function drawHead(c, av, color, t) {
    const hi = (HEADS[av.head] || HEADS.cube)(c, shade(color, 10), t);
    (FACES[av.face] || FACES.grin)(c, hi.face, t);
    c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.55)';
    (HATS[av.hat] || HATS.crown)(c, hi.top, t);
    return hi;
  }

  /**
   * o: { t, moving, dir, cape, vip, slime, scale, cacheKey?, res? }
   * cacheKey + res: a fej gyorsítótárazása (játékosonként), res = pixel/egység.
   */
  function drawAvatar(ctx, av, o) {
    o = o || {};
    const t = o.t || 0;
    const dir = o.dir < 0 ? -1 : 1;
    const color = av.color || '#22d3ee';
    const moving = !!o.moving;
    const speed = o.animSpeed || 1;
    ctx.save();
    const sc = (o.scale || 1) * (o.cape ? 1.2 : 1);
    ctx.scale(sc, sc);

    // árnyék
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 24, 15, 5, 0, 0, 7); ctx.fill();

    const hop = moving ? Math.abs(Math.sin(t * 14 * speed)) * -3 : Math.sin(t * 2) * 0.8;
    ctx.translate(0, hop);
    if (moving) ctx.rotate(Math.sin(t * 14 * speed) * 0.16);

    // VIP aura
    if (o.vip) {
      const r = 40 + o.vip * 4 + Math.sin(t * 4) * 3;
      ctx.drawImage(vipSprite, -r, -6 - r, r * 2, r * 2);
    }

    ctx.scale(dir, 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineJoin = 'round';

    // Köpeny (a test mögött)
    if (o.cape) {
      const flap = Math.sin(t * (moving ? 12 : 3)) * 4;
      ctx.fillStyle = cachedGrad('cape', () => {
        const g = scratch.createLinearGradient(-20, -8, -6, 26);
        g.addColorStop(0, '#fde047'); g.addColorStop(0.5, '#f59e0b'); g.addColorStop(1, '#b45309');
        return g;
      });
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(8, -8);
      ctx.quadraticCurveTo(-4, 10, -18 + flap, 26);
      ctx.lineTo(-28 + flap, 20);
      ctx.quadraticCurveTo(-18, 6, -8, -8);
      ctx.fill(); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const sx = -14 + Math.sin(t * 3 + i * 2) * 8, sy = 6 + i * 6;
        if (Math.sin(t * 6 + i * 1.7) > 0.4) { ctx.fillStyle = '#fff'; ctx.fillRect(sx, sy, 2, 2); }
      }
    }

    // Lábak
    const k = moving ? Math.sin(t * 22 * speed) : 0;
    ctx.fillStyle = shade(color, -60);
    ctx.save(); ctx.translate(-6, 15); ctx.rotate(k * 0.7); rr(ctx, -3, 0, 6, 10, 3); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(6, 15); ctx.rotate(-k * 0.7); rr(ctx, -3, 0, 6, 10, 3); ctx.fill(); ctx.stroke(); ctx.restore();

    // Hátizsák
    ctx.fillStyle = shade(color, -45);
    rr(ctx, -17, -4, 8, 16, 3); ctx.fill(); ctx.stroke();

    // Test
    ctx.fillStyle = cachedGrad('body' + color, () => {
      const bg = scratch.createLinearGradient(0, -8, 0, 18);
      bg.addColorStop(0, shade(color, 25)); bg.addColorStop(1, shade(color, -30));
      return bg;
    });
    rr(ctx, -12, -8, 24, 26, 9); ctx.fill(); ctx.stroke();
    // Karok
    ctx.strokeStyle = shade(color, -50); ctx.lineWidth = 4; ctx.lineCap = 'round';
    const arm = moving ? Math.sin(t * 22 * speed + 1) * 5 : 0;
    ctx.beginPath(); ctx.moveTo(10, -1); ctx.lineTo(16, 7 + arm); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    // pocak-fény
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, -6, -2, 10, 6, 3); ctx.fill();

    // Fej (+arc +fejfedő). A játékban játékosonként egy kis képre gyorsítótárazzuk, amit
    // csak ~20-szor rajzolunk újra másodpercenként; a test, a lábak és a billegés továbbra is
    // minden képkockában animálódik.
    let hi;
    if (o.cacheKey) {
      const res = o.res || 2;
      const sig = av.head + av.hat + av.face + color + res.toFixed(2);
      let hc = headCache.get(o.cacheKey);
      if (!hc || hc.sig !== sig) {
        const c = document.createElement('canvas');
        c.width = Math.ceil(HB.w * res); c.height = Math.ceil(HB.h * res);
        hc = { c, g: c.getContext('2d'), sig, at: -1e9, res };
        headCache.set(o.cacheKey, hc);
      }
      if (t - hc.at > 0.05 || t < hc.at) {
        hc.at = t;
        const g = hc.g;
        g.setTransform(hc.res, 0, 0, hc.res, -HB.x * hc.res, -HB.y * hc.res);
        g.clearRect(HB.x, HB.y, HB.w, HB.h);
        g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineJoin = 'round';
        hc.hi = drawHead(g, av, color, t);
      }
      ctx.drawImage(hc.c, HB.x, HB.y, HB.w, HB.h);
      hi = hc.hi;
    } else {
      hi = drawHead(ctx, av, color, t);
    }

    // Nyálka
    if (o.slime) {
      ctx.fillStyle = 'rgba(132,204,22,0.55)';
      ctx.beginPath(); ctx.ellipse(0, hi.top + 6, 16, 7, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const x = -10 + i * 7, l = 8 + ((t * 10 + i * 3) % 12);
        ctx.beginPath(); ctx.ellipse(x, hi.top + 6 + l, 2, 3, 0, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPreview(canvas, av, t) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h * 0.62);
    const s = Math.min(w, h) / 70;
    ctx.scale(s, s);
    drawAvatar(ctx, av, { t, moving: true, dir: 1, animSpeed: 0.35 });
    ctx.restore();
  }

  window.Avatar = { drawAvatar, drawPreview, shade, rr };
})();
