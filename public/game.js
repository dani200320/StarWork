(() => {
  const S = window.SHARED;
  const { drawAvatar, drawPreview } = window.Avatar;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  // ------------------------------------------------------------------ Tárolás
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privát mód */ } },
  };
  let playerId = store.get('cm_playerId');
  if (!playerId) {
    playerId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set('cm_playerId', playerId);
  }
  let profile = store.get('cm_profile') || null;

  // ------------------------------------------------------------------ Hang
  // Lágy szintetizátor: szinusz/háromszög hangok, puha felfutás, enyhe visszhang, kompresszor.
  let actx = null, master = null, verbSend = null, noiseBuf = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      comp.connect(actx.destination);
      master = actx.createGain(); master.gain.value = 0.7;
      master.connect(comp);
      // rövid, sötét terem-visszhang generált impulzusválaszból
      const len = Math.floor(actx.sampleRate * 1.4);
      const ir = actx.createBuffer(2, len, actx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const verb = actx.createConvolver(); verb.buffer = ir;
      const tone = actx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
      const wet = actx.createGain(); wet.gain.value = 0.28;
      verbSend = actx.createGain();
      verbSend.connect(verb); verb.connect(tone); tone.connect(wet); wet.connect(comp);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  // Egyetlen hang burkológörbével. o: { type, at, dur, vol, attack, slideTo, vibrato, cutoff, wet }
  function voice(freq, o = {}) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + 0.01 + (o.at || 0);
    const dur = o.dur || 0.3, vol = o.vol == null ? 0.15 : o.vol, atk = o.attack || 0.008;
    const osc = a.createOscillator(), env = a.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
    if (o.vibrato) {
      const lfo = a.createOscillator(), depth = a.createGain();
      lfo.frequency.value = 5.5; depth.gain.value = freq * o.vibrato;
      lfo.connect(depth).connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    }
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc.connect(env);
    if (o.cutoff) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; node = env.connect(f); }
    node.connect(master);
    if (o.wet !== 0) node.connect(verbSend);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  // Csengő-szerű hang: alaphang + halk felhangok, gyorsabb lecsengéssel.
  function bell(freq, at = 0, vol = 0.12, dur = 0.6) {
    voice(freq, { at, dur, vol, attack: 0.005 });
    voice(freq * 2, { at, dur: dur * 0.5, vol: vol * 0.25, attack: 0.004 });
    voice(freq * 3.01, { at, dur: dur * 0.25, vol: vol * 0.08, attack: 0.003 });
  }
  function whoosh(at, dur, vol, from, to) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + 0.01 + at;
    const src = a.createBufferSource(); src.buffer = noiseBuf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(env); env.connect(master); env.connect(verbSend);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  // Hangjegyek (Hz)
  const N = { E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, Cs6: 1108.73, C6: 1046.5, E6: 1318.51, G6: 1567.98, A6: 1760 };
  const SFX = {
    // „kling-kling" érme
    coin() { bell(N.B5, 0, 0.1, 0.35); bell(N.E6, 0.07, 0.1, 0.6); },
    // dúr arpeggio + lecsengő akkord
    success() {
      [N.C5, N.E5, N.G5].forEach((f, i) => bell(f, i * 0.08, 0.09, 0.5));
      [N.C6, N.E6].forEach(f => bell(f, 0.25, 0.07, 1.1));
    },
    // puha, lefelé hajló „bvomp"
    fail() {
      voice(N.G4, { type: 'triangle', dur: 0.2, vol: 0.13, cutoff: 1400 });
      voice(311.13, { type: 'triangle', at: 0.18, dur: 0.5, vol: 0.13, cutoff: 1200, slideTo: 290, vibrato: 0.012 });
    },
    // ding-dong csengő a többieknek
    alarm() { bell(N.A5, 0, 0.11, 0.5); bell(N.E5, 0.22, 0.11, 0.8); },
    // gyors felfelé futó csengősor, kétszer – „TE kellesz!"
    mine() {
      for (let r = 0; r < 2; r++) [N.A5, N.Cs6, N.E6, N.A6].forEach((f, i) => bell(f, r * 0.5 + i * 0.07, 0.08, 0.4));
    },
    // szomorú-vicces harsona: „váá-váá-váá-vááááá"
    snitch() {
      const notes = [N.G4, N.Fs4, N.F4, N.E4];
      notes.forEach((f, i) => voice(f, { type: 'triangle', at: i * 0.26, dur: i === 3 ? 0.9 : 0.24, vol: 0.14, attack: 0.03, cutoff: 1100, vibrato: i === 3 ? 0.02 : 0.006 }));
    },
    // tompa robbanás: zaj + mély dobbanás
    boom() {
      whoosh(0, 0.7, 0.35, 900, 120);
      voice(110, { dur: 0.6, vol: 0.3, slideTo: 40, attack: 0.005, wet: 0 });
    },
    // varázslatos suhanás felfelé
    tele() {
      whoosh(0, 0.45, 0.12, 400, 3200);
      voice(N.C5, { at: 0.05, dur: 0.4, vol: 0.06, slideTo: N.C6 });
      bell(N.G6, 0.3, 0.04, 0.5);
    },
    // halk koppanás
    click() { voice(1400, { dur: 0.05, vol: 0.035, attack: 0.002, wet: 0 }); },
    // játékos BÉLA-fanfár
    quiz() { [N.G5, N.C6, N.E6, N.C6].forEach((f, i) => bell(f, i * 0.1, 0.08, i === 3 ? 0.7 : 0.3)); },
    // káosz-esemény: lefelé csúszó "áramszünet" + csilingelés
    chaos() {
      voice(440, { type: 'triangle', dur: 0.7, vol: 0.12, slideTo: 110, cutoff: 1600 });
      whoosh(0.1, 0.6, 0.12, 2000, 300);
      [N.E6, N.C6, N.A5].forEach((f, i) => bell(f, 0.35 + i * 0.09, 0.06, 0.5));
    },
    // távoli becsapódás
    thud() { whoosh(0, 0.35, 0.12, 700, 120); voice(90, { dur: 0.3, vol: 0.12, slideTo: 50, wet: 0 }); },
    // új hullám: puha, felerősödő akkord
    wave() {
      [N.C5 / 2, N.E4, N.G4].forEach(f => voice(f, { type: 'triangle', dur: 1.4, vol: 0.07, attack: 0.35, cutoff: 1800 }));
      bell(N.C6, 0.35, 0.07, 1.2);
    },
  };
  const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* nem támogatott */ } };

  // ------------------------------------------------------------------ Nagyítás tiltása
  // Az iOS Safari figyelmen kívül hagyja a user-scalable=no-t, ezért eseményekkel is tiltjuk.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });

  // ------------------------------------------------------------------ Wake lock + keep-alive
  let wakeLock = null, wantWake = false;
  async function requestWake() {
    wantWake = true;
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* nem engedélyezett */ }
  }
  window.addEventListener('pointerdown', () => { audio(); requestWake(); }, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantWake) requestWake(); });
  setInterval(() => { fetch('/api/keepalive', { cache: 'no-store' }).catch(() => {}); }, 4 * 60 * 1000);

  // ------------------------------------------------------------------ Socket
  const socket = io();
  let phase = 'lobby';
  let state = null;
  const byN = new Map(); // rövid szám-azonosító -> játékos (a 'pos' üzenetekhez)
  let myInGame = false;
  let lastResult = null;
  const me = { x: S.SPAWN.x, y: S.SPAWN.y, dir: 1, moving: false };

  const sendHello = () => socket.emit('hello', { playerId, pin: store.get('cm_pin') || '' });
  socket.on('connect', () => { $('#conn').classList.add('hidden'); sendHello(); });
  socket.on('pinRequired', d => {
    const gate = $('#pin-gate'), msg = $('#pin-msg');
    gate.classList.remove('hidden');
    if (d.locked) {
      msg.textContent = `Túl sok hibás próbálkozás. Várj ${Math.ceil(d.waitSec / 60)} percet!`;
    } else if (d.wrong) {
      msg.textContent = 'Hibás PIN! Kérdezd meg a házigazdát. 🤔';
      store.set('cm_pin', '');
      $('.pin-box').classList.remove('shake'); void $('.pin-box').offsetWidth; $('.pin-box').classList.add('shake');
      vibrate([80, 40, 80]);
    } else msg.textContent = '';
    $('#pin-submit').disabled = false;
  });
  function submitPin() {
    const pin = $('#pin-input').value.replace(/\D/g, '');
    if (!pin) { $('#pin-msg').textContent = 'Írd be a PIN-kódot!'; return; }
    store.set('cm_pin', pin);
    $('#pin-submit').disabled = true;
    sendHello();
  }
  $('#pin-submit').addEventListener('click', submitPin);
  $('#pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
  socket.on('disconnect', () => $('#conn').classList.remove('hidden'));
  socket.on('kicked', () => { toast('📱 Egy másik fülön/eszközön folytatod a játékot.', 'bad'); socket.disconnect(); });

  socket.on('welcome', d => {
    $('#pin-gate').classList.add('hidden');
    $('#pin-input').blur();
    phase = d.phase;
    const you = d.you;
    myInGame = you.inGame;
    if (d.isNew && profile) {
      // Szerver-újraindulás után visszaállítjuk a mentett profilt.
      socket.emit('profile', { name: profile.name, avatar: profile.avatar, tool: profile.tool });
      lobbyAvatar = Object.assign({}, you.avatar, profile.avatar || {});
      $('#in-name').value = profile.name || '';
    } else {
      lobbyAvatar = Object.assign({}, you.avatar);
      $('#in-name').value = you.name || (profile && profile.name) || '';
    }
    saveProfile();
    if (you.inGame) { me.x = you.x; me.y = you.y; }
    if (d.result) lastResult = d.result;
    renderLobbyStatic();
    syncScreen();
  });

  // A szerver csak a megváltozott szekciókat küldi ('st'), a pozíciókat külön ('pos').
  // Az időzítők abszolút szerver-időként (end) érkeznek: helyi performance.now() időre váltjuk.
  function emptyState() {
    return {
      phase: 'lobby', countdownEnd: 0, bank: 0, hp: 100, maxHp: 100, progress: 0, wave: 1, team: { shield: 0, dilator: 0, teleport: 0, bela: 0 },
      players: [], tasks: [], items: [], ems: [], strikes: [], quizOn: null, event: null, rat: null,
      me: { items: [null, null], boostEnd: 0, slowEnd: 0 },
    };
  }
  socket.on('st', d => {
    const nowP = performance.now();
    const loc = v => (v ? nowP + (v - d.t) : 0);
    if (!state) state = emptyState();
    const prevBank = state.bank;
    if (d.meta) { Object.assign(state, d.meta); state.countdownEnd = loc(d.meta.countdownEnd); }
    if (d.roster) {
      const old = new Map(state.players.map(p => [p.id, p]));
      state.players = d.roster.map(p => {
        const o = old.get(p.id);
        return o ? Object.assign(p, { x: o.x, y: o.y, dir: o.dir, moving: o.moving }) : p;
      });
      byN.clear();
      for (const p of state.players) byN.set(p.n, p);
      lobbyDirty = true;
    }
    if (d.tasks) state.tasks = d.tasks;
    if (d.items) state.items = d.items;
    if ('quiz' in d) { state.quizOn = d.quiz; if (d.quiz) d.quiz.end = loc(d.quiz.end); }
    if ('event' in d) { state.event = d.event; if (d.event) d.event.end = loc(d.event.end); if (!d.event) state.rat = null; }
    if (d.strikes) { state.strikes = d.strikes; for (const m of d.strikes) m.end = loc(m.end); }
    if (d.ems) { state.ems = d.ems; for (const e of d.ems) e.end = loc(e.end); }
    if (d.me) { state.me = d.me; d.me.boostEnd = loc(d.me.boostEnd); d.me.slowEnd = loc(d.me.slowEnd); }
    phase = state.phase;
    const mine = myState();
    myInGame = !!(mine && mine.inGame);
    onBankChange(prevBank, state.bank);
    hudDirty = true;
    alertsDirty = true;
    updateEntities(state);
    syncScreen();
    if (currentScreen === 'lobby') renderLobby();
  });
  socket.on('pos', d => {
    if (!state) return;
    for (const [n, x, y, f] of d.p) {
      const p = byN.get(n);
      if (!p) continue;
      p.x = x; p.y = y; p.dir = f & 1 ? -1 : 1; p.moving = !!(f & 2);
    }
    state.rat = d.r ? { x: d.r[0], y: d.r[1], stolen: state.event ? state.event.stolen : 0 } : null;
    updateEntities(state);
  });
  // Lezárt képernyő / háttér: szólunk a szervernek, hogy ne küldjön pozíciókat.
  document.addEventListener('visibilitychange', () => socket.emit('vis', document.visibilityState === 'visible'));

  socket.on('spawn', p => { me.x = p.x; me.y = p.y; cam.x = p.x; cam.y = p.y; });
  socket.on('started', () => { closeAllModals(); snitches.length = 0; });
  socket.on('lobby', () => { closeAllModals(); lastResult = null; ready = false; updateReadyBtn(); });
  socket.on('countdownCancel', () => {});
  socket.on('ended', r => { lastResult = r; closeAllModals(); renderEnd(); });

  socket.on('toast', t => {
    toast(t.text, t.kind);
    if (t.kind === 'good') SFX.success();
    if (t.kind === 'wave') { SFX.wave(); vibrate([60, 60, 60]); }
  });
  socket.on('snitch', s => {
    const self = s.id === playerId;
    alertsDirty = true;
    snitches.push({
      id: Math.random(), until: performance.now() + 6500,
      html: `💸 <b>ÁRULÁS!</b> ${esc(s.name)}${self ? ' (te 😈)' : ''} elköltött <b>${s.price} 💰</b>-t a Közös Kasszából a SAJÁT fejlesztésére: <b>${esc(s.upgrade)}</b>!`,
    });
    SFX.snitch(); vibrate([40, 30, 40]);
  });
  socket.on('shake', () => { shakeUntil = performance.now() + 650; flash(); SFX.boom(); vibrate([200, 80, 200]); });
  socket.on('alarm', a => {
    const solo = state && state.players.filter(p => p.inGame && p.connected).length <= 1;
    if ((a.tools || [a.tool]).includes(myTool()) && !solo) { SFX.mine(); vibrate([300, 100, 300, 100, 300]); }
    else { SFX.alarm(); vibrate(120); }
  });
  socket.on('fx', f => {
    if (f.kind === 'money') floaters.push({ x: f.x, y: f.y - 30, text: f.text, t: 0, color: '#fde68a' });
    if (f.kind === 'pickup') {
      flights.push({ x: f.x, y: f.y, to: f.to, emoji: f.emoji, t: 0 });
      floaters.push({ x: f.x, y: f.y - 20, text: f.text, t: 0, color: '#a5f3fc' });
      if (f.to === playerId) { SFX.coin(); vibrate(20); }
      pendingPickups.delete(f.id);
    }
    if (f.kind === 'meteor') {
      burst(f.x, f.y, '#fb923c', 30); burst(f.x, f.y, '#fde68a', 14);
      if (f.hit.includes(playerId)) { shakeUntil = performance.now() + 500; flash(); SFX.boom(); vibrate([150, 50, 150]); }
      else if (Math.hypot(f.x - me.x, f.y - me.y) < 500) SFX.thud();
    }
    if (f.kind === 'rat') {
      burst(f.x, f.y, '#fbbf24', 36);
      floaters.push({ x: f.x, y: f.y - 30, text: f.text, t: 0, color: '#fde68a' });
      SFX.success();
    }
  });
  socket.on('event', () => { SFX.chaos(); vibrate([80, 40, 80, 40, 200]); });
  socket.on('taskResult', r => {
    toast(r.ok ? '✅ ' + r.msg : '😤 ' + r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) SFX.success();
  });
  socket.on('buyResult', r => { if (!r.ok) toast('🚫 ' + r.msg, 'bad'); else SFX.coin(); });
  socket.on('emCheckResult', r => {
    if (r.ok) openCodeModal(r);
    else { toast('🤷 ' + r.msg, 'info'); SFX.fail(); }
  });
  socket.on('emCodeResult', r => {
    const m = $('#code-msg');
    if (r.ok) { SFX.success(); vibrate([50, 50, 150]); closeModal('code'); toast('🦸 MEGJAVÍTVA! ' + r.msg, 'good'); return; }
    m.textContent = r.msg; SFX.fail(); vibrate([80, 40, 80]);
    $('.sheet.red').animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], { duration: 250 });
    if (r.done) setTimeout(() => closeModal('code'), 900);
  });
  socket.on('quiz', q => openQuiz(q));
  socket.on('quizResult', r => resolveQuizUI(r));

  // ------------------------------------------------------------------ Képernyők
  let currentScreen = null;
  function showScreen(name) {
    if (currentScreen === name) return;
    currentScreen = name;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name !== 'game') closeAllModals();
    if (name === 'end') renderEnd();
    if (name === 'game') { cam.x = me.x; cam.y = me.y; resize(); }
  }
  function syncScreen() {
    if (phase === 'ended') showScreen('end');
    else if (phase === 'playing' && myInGame) showScreen('game');
    else showScreen('lobby');
    const cd = $('#countdown');
    if (phase === 'countdown' && state) {
      cd.classList.remove('hidden');
      $('#countdown-num').textContent = Math.max(1, Math.ceil(leftNow(state.countdownEnd) / 1000));
    } else cd.classList.add('hidden');
    const running = phase === 'playing' && !myInGame;
    $('#btn-ready').classList.toggle('hidden', running);
    $('#btn-join').classList.toggle('hidden', !running);
    $('#ready-hint').textContent = running ? 'Épp megy egy kör – szállj be bármikor!' : 'Ha mindenki kész, 3 mp múlva indul.';
  }

  // ------------------------------------------------------------------ Lobbi
  let lobbyAvatar = { head: 'cube', hat: 'crown', face: 'grin', color: S.AVATAR.colors[0] };
  let ready = false;
  const KIND_LIST = { head: S.AVATAR.heads, hat: S.AVATAR.hats, face: S.AVATAR.faces };

  function saveProfile() {
    profile = { name: $('#in-name').value.trim(), avatar: lobbyAvatar, tool: myTool() || (profile && profile.tool) || null };
    store.set('cm_profile', profile);
  }
  let profileTimer = 0;
  function pushProfile(extra) {
    saveProfile();
    clearTimeout(profileTimer);
    profileTimer = setTimeout(() => socket.emit('profile', Object.assign({ name: profile.name, avatar: lobbyAvatar }, extra || {})), 120);
  }

  function renderLobbyStatic() {
    $$('.picker').forEach(p => {
      const list = KIND_LIST[p.dataset.kind];
      const cur = list.find(x => x.id === lobbyAvatar[p.dataset.kind]) || list[0];
      p.querySelector('b').textContent = cur.name;
    });
    const sw = $('#swatches');
    sw.innerHTML = '';
    S.AVATAR.colors.forEach(c => {
      const b = document.createElement('button');
      b.style.background = c; b.style.color = c;
      if (c === lobbyAvatar.color) b.classList.add('sel');
      b.onclick = () => { lobbyAvatar.color = c; SFX.click(); renderLobbyStatic(); pushProfile(); };
      sw.appendChild(b);
    });
  }
  $$('.picker .arr').forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.closest('.picker').dataset.kind;
    const list = KIND_LIST[kind];
    const i = list.findIndex(x => x.id === lobbyAvatar[kind]);
    lobbyAvatar[kind] = list[(i + +btn.dataset.d + list.length) % list.length].id;
    SFX.click(); renderLobbyStatic(); pushProfile();
  }));
  $('#btn-random').onclick = () => {
    lobbyAvatar = { head: pick(S.AVATAR.heads).id, hat: pick(S.AVATAR.hats).id, face: pick(S.AVATAR.faces).id, color: pick(S.AVATAR.colors) };
    SFX.click(); renderLobbyStatic(); pushProfile();
  };
  $('#in-name').addEventListener('input', () => pushProfile());
  $('#in-name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  const FUN_NAMES = ['Kapitány Krumpli', 'Űr-Gizi', 'Béla Jr.', 'Galaktikus Gábor', 'Csillag-Csaba', 'Meteor Mari', 'Plazma Pisti', 'Nebula Nóri'];
  function updateReadyBtn() {
    const b = $('#btn-ready');
    b.classList.toggle('on', ready);
    b.textContent = ready ? '✅ KÉSZ! (koppints a visszavonáshoz)' : 'KÉSZ VAGYOK';
  }
  $('#btn-ready').onclick = () => {
    if (!$('#in-name').value.trim()) { $('#in-name').value = pick(FUN_NAMES); pushProfile(); }
    ready = !ready;
    socket.emit('profile', { name: $('#in-name').value.trim(), avatar: lobbyAvatar });
    socket.emit('ready', ready);
    SFX.click(); updateReadyBtn();
  };
  $('#btn-join').onclick = () => {
    if (!$('#in-name').value.trim()) { $('#in-name').value = pick(FUN_NAMES); }
    socket.emit('profile', { name: $('#in-name').value.trim(), avatar: lobbyAvatar });
    socket.emit('joinRunning');
  };

  let lobbyKey = '';
  function renderLobby() {
    if (!state) return;
    const mine = state.players.find(p => p.id === playerId);
    if (mine && !mine.ready && ready && phase === 'lobby') { ready = false; updateReadyBtn(); }
    const key = JSON.stringify(state.players.map(p => [p.id, p.name, p.tool, p.ready, p.connected, p.avatar])) + phase;
    if (key === lobbyKey) return;
    lobbyKey = key;

    // Eszközök
    const tools = $('#tools');
    tools.innerHTML = '';
    S.TOOLS.forEach(t => {
      const owner = state.players.find(p => p.tool === t.id);
      const b = document.createElement('button');
      const isMine = owner && owner.id === playerId;
      b.className = 'toolcard' + (isMine ? ' sel' : '') + (owner && !isMine ? ' taken' : '');
      b.innerHTML = `<span class="em">${t.emoji}</span><small>${esc(t.name)}</small>${owner && !isMine ? `<span class="owner">${esc(owner.name || '…')}</span>` : ''}`;
      b.onclick = () => { if (owner && !isMine) { toast('Ez már ' + (owner.name || 'valakié') + '!', 'bad'); return; } SFX.click(); pushProfile({ tool: t.id }); };
      tools.appendChild(b);
    });

    // Legénység
    const crew = $('#crew');
    crew.innerHTML = '';
    const list = state.players.slice().sort((a, b) => (b.connected - a.connected));
    $('#crew-count').textContent = `(${list.filter(p => p.connected).length}/5)`;
    list.forEach(p => {
      const row = document.createElement('div');
      row.className = 'crew-row' + (p.connected ? '' : ' off');
      const t = S.toolById(p.tool);
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 88;
      row.appendChild(cv);
      const st = phase === 'playing' ? (p.inGame ? 'JÁTSZIK' : 'LOBBI') : (p.ready ? 'KÉSZ' : 'VÁR…');
      row.insertAdjacentHTML('beforeend', `<div class="nm">${esc(p.name || 'Névtelen űrlény')}${p.id === playerId ? ' (te)' : ''}<small>${t ? t.emoji + ' ' + esc(t.name) : 'nincs eszköz'}</small></div><div class="st ${p.ready || p.inGame ? 'ok' : ''}">${p.connected ? st : 'OFFLINE'}</div>`);
      crew.appendChild(row);
      drawPreview(cv, p.avatar, 0.4);
    });
  }

  // ------------------------------------------------------------------ Játék: entitások
  const ents = new Map(); // más játékosok megjelenített pozíciója
  function updateEntities(d) {
    const seen = new Set();
    for (const p of d.players) {
      if (p.id === playerId || p.x == null) continue;
      seen.add(p.id);
      let e = ents.get(p.id);
      if (!e) { e = { x: p.x, y: p.y }; ents.set(p.id, e); }
      if (Math.hypot(e.x - p.x, e.y - p.y) > 400) { e.x = p.x; e.y = p.y; }
      e.tx = p.x; e.ty = p.y;
    }
    for (const id of [...ents.keys()]) if (!seen.has(id)) ents.delete(id);
  }
  const myState = () => state && state.players.find(p => p.id === playerId);
  const myTool = () => { const m = myState(); return m ? m.tool : null; };
  const leftNow = end => Math.max(0, end - performance.now());

  // ------------------------------------------------------------------ Vászon
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  let dpr = 1, cw = 0, ch = 0, scale = 0.7;
  const cam = { x: S.SPAWN.x, y: S.SPAWN.y };
  let shakeUntil = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    scale = Math.max(0.5, Math.min(cw / 560, ch / 620, 1.3));
  }
  // Méretváltozást figyelőből kezeljük, nem minden képkockában mérjük (az layout-ot kényszerítene).
  if (window.ResizeObserver) new ResizeObserver(() => { if (currentScreen === 'game') resize(); }).observe(canvas);
  else window.addEventListener('resize', resize);

  const STARS = Array.from({ length: 90 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: 0.05 + Math.random() * 0.35, s: Math.random() * 1.6 + 0.3, grp: i % 3 }));
  const particles = [];
  const floaters = [];
  const flights = [];
  const snitches = [];
  let tapTarget = null;

  function flash() { const f = $('#flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 60); }

  // ------------------------------------------------------------------ Bemenet
  const joy = { x: 0, y: 0, id: null };
  const joyEl = $('#joy'), knob = $('#joy-knob');
  function joyMove(e) {
    const r = joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const max = r.width * 0.36;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joy.x = dx / max; joy.y = dy / max;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  joyEl.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); tapTarget = null; joyMove(e); });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = 'translate(-50%,-50%)'; };
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - cw / 2) / scale + cam.x;
    const wy = (e.clientY - r.top - ch / 2) / scale + cam.y;
    tapTarget = { x: wx, y: wy, t: performance.now() };
  });

  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    keys[e.key.toLowerCase()] = true;
    if (currentScreen !== 'game') return;
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') { e.preventDefault(); doAction(); }
    if (k === 'q') useTool();
    if (k === '1') useItem(0);
    if (k === '2') useItem(1);
    if (k === 'b') openShop();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ------------------------------------------------------------------ Mozgás
  let lastSend = 0, lastSentKey = '', bumpTime = 0, lastBumpBubble = 0;
  const BUMP_TEXTS = ['Áú! 🤕', 'Ki tette ide ezt a falat?!', 'Bocs, fal!', 'Auu, az orrom! 👃', 'Ez fájt! 😵', 'Fal 1 – Én 0'];
  function sayBubble(text) { socket.emit('bubble', text); }

  function updateMe(dt, now) {
    const st = myState();
    let vx = joy.x, vy = joy.y;
    if (keys.a || keys.arrowleft) vx -= 1;
    if (keys.d || keys.arrowright) vx += 1;
    if (keys.w || keys.arrowup) vy -= 1;
    if (keys.s || keys.arrowdown) vy += 1;
    if (state && state.event && state.event.type === 'gravity') { vx = -vx; vy = -vy; }
    let mag = Math.min(1, Math.hypot(vx, vy));
    if (mag > 0.12) tapTarget = null;
    if (mag <= 0.12 && tapTarget) {
      const dx = tapTarget.x - me.x, dy = tapTarget.y - me.y, d = Math.hypot(dx, dy);
      if (d < 10 || now - tapTarget.t > 6000) tapTarget = null;
      else { vx = dx / d; vy = dy / d; mag = 1; }
    }
    if (anyModalOpen()) mag = 0;
    me.moving = mag > 0.12;
    if (me.moving) {
      const len = Math.hypot(vx, vy) || 1;
      const boosted = state && leftNow(state.me.boostEnd) > 0;
      const slimed = state && leftNow(state.me.slowEnd) > 0;
      const spd = S.speedFor(st ? st.up.boots : 0, boosted, slimed) * mag;
      const mx = vx / len * spd * dt, my = vy / len * spd * dt;
      let moved = false;
      if (S.walkable(me.x + mx, me.y + my)) { me.x += mx; me.y += my; moved = true; }
      else {
        if (S.walkable(me.x + mx, me.y)) { me.x += mx; moved = Math.abs(mx) > 0.3; }
        if (S.walkable(me.x, me.y + my)) { me.y += my; moved = moved || Math.abs(my) > 0.3; }
      }
      if (Math.abs(vx) > 0.15) me.dir = vx < 0 ? -1 : 1;
      if (!moved) {
        bumpTime += dt;
        if (bumpTime > 0.35 && now - lastBumpBubble > 6000) { lastBumpBubble = now; sayBubble(pick(BUMP_TEXTS)); vibrate(30); tapTarget = null; }
      } else bumpTime = 0;
    } else bumpTime = 0;

    const key = `${Math.round(me.x)},${Math.round(me.y)},${me.dir},${me.moving}`;
    if (now - lastSend > 66 && key !== lastSentKey) {
      lastSend = now; lastSentKey = key;
      socket.emit('move', { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dir: me.dir, moving: me.moving });
    }
  }

  // ------------------------------------------------------------------ Interakciók
  function unlockedTeleRooms() { return state ? S.TELEPORT.levels[Math.min(2, state.team.teleport)] : []; }
  function findInteract() {
    if (!state) return null;
    let best = null, bd = Infinity;
    const consider = (kind, pos, extra, range) => {
      const d = dist(pos, me);
      if (d < (range || S.INTERACT_RANGE) && d < bd) { bd = d; best = Object.assign({ kind, pos }, extra); }
    };
    for (const t of state.tasks) {
      const st = S.TASK_STATIONS.find(s => s.id === t.stationId);
      consider('task', st, { stationId: st.id, type: t.type });
    }
    if (myTool()) for (const st of S.EMERGENCY_STATIONS) consider('em', st, { stationId: st.id }, S.INTERACT_RANGE - 5);
    for (const room of unlockedTeleRooms()) {
      consider('tele', S.TELEPORT.kantinPads[room], { to: S.TELEPORT.roomPads[room], label: S.roomById(room).name }, 48);
      consider('tele', S.TELEPORT.roomPads[room], { to: { x: S.SPAWN.x, y: S.SPAWN.y + 40 }, label: 'Kantin' }, 48);
    }
    consider('shop', S.TERMINAL, {}, 90);
    return best;
  }

  let currentInteract = null, actKey = '';
  function updateActionButton() {
    currentInteract = findInteract();
    const it = currentInteract;
    let icon = '✋', text = '—', cls = '';
    if (it) {
      if (it.kind === 'task') { const tt = S.TASK_TYPES.find(x => x.id === it.type); icon = tt.emoji; text = 'FELADAT'; cls = 'on'; }
      if (it.kind === 'em') { icon = S.toolById(myTool()).emoji; text = 'HASZNÁL'; cls = 'on red'; }
      if (it.kind === 'tele') { icon = '🌀'; text = 'TELEPORT'; cls = 'on blue'; }
      if (it.kind === 'shop') { icon = '🛒'; text = 'BOLT'; cls = 'on blue'; }
    }
    const key = icon + text + cls;
    if (key !== actKey) {
      actKey = key;
      const b = $('#btn-action');
      b.className = 'act ' + cls;
      b.querySelector('.ai').textContent = icon;
      b.querySelector('.at').textContent = text;
    }
  }

  function doAction() {
    const it = currentInteract;
    if (!it || anyModalOpen()) return;
    SFX.click();
    if (it.kind === 'task') openTask(it);
    else if (it.kind === 'em') socket.emit('emCheck', { stationId: it.stationId });
    else if (it.kind === 'tele') teleport(it);
    else if (it.kind === 'shop') openShop();
  }
  $('#btn-action').addEventListener('click', doAction);

  function teleport(it) {
    burst(me.x, me.y, '#22d3ee', 24);
    me.x = it.to.x + (Math.random() - 0.5) * 30;
    me.y = it.to.y + 30 + (Math.random() - 0.5) * 10;
    if (!S.walkable(me.x, me.y)) { me.x = it.to.x; me.y = it.to.y + 30; }
    cam.x = me.x; cam.y = me.y;
    burst(me.x, me.y, '#e879f9', 24);
    SFX.tele(); vibrate(40);
    lastSentKey = '';
    toast('🌀 Teleport: ' + it.label, 'info');
  }

  function useTool() {
    if (!myTool()) { toast('Nincs eszköz a hátizsákodban 🤷', 'bad'); return; }
    let best = null, bd = Infinity;
    for (const st of S.EMERGENCY_STATIONS) { const d = dist(st, me); if (d < bd) { bd = d; best = st; } }
    if (best && bd < S.INTERACT_RANGE + 20) { SFX.click(); socket.emit('emCheck', { stationId: best.id }); }
    else { sayBubble('🤷 Nincs itt mit javítani…'); toast('Menj egy piros ⚠️ vész-állomáshoz – oda, ahová a csapat kiabál!', 'info'); }
  }
  $('#slot-tool').addEventListener('click', useTool);

  function useItem(i) {
    if (!state || !state.me.items[i]) { toast('Ez a zseb üres. Szedj fel cuccot a padlóról! 🥤💣', 'info'); return; }
    socket.emit('useItem', i);
    SFX.click(); vibrate(25);
    if (state.me.items[i] === 'drink') burst(me.x, me.y, '#fbbf24', 20);
    if (state.me.items[i] === 'grenade') burst(me.x, me.y, '#a5f3fc', 30);
  }
  $$('.slot.item').forEach(b => b.addEventListener('click', () => useItem(+b.dataset.slot)));

  const pendingPickups = new Set();
  let ratPending = 0;
  function checkRat(now) {
    if (!state || !state.rat || now < ratPending) return;
    if (Math.hypot(ratView.x - me.x, ratView.y - me.y) < 50) { ratPending = now + 800; socket.emit('catchRat'); }
  }

  function checkPickups() {
    if (!state) return;
    const st = myState();
    const mag = st ? st.up.magnet : 0;
    const radius = 34 + mag * 70;
    for (const it of state.items) {
      if (pendingPickups.has(it.id)) continue;
      if (Math.hypot(it.x - me.x, it.y - me.y) < radius) {
        const isMoney = it.type === 'coin' || it.type === 'coins';
        if (!isMoney && !state.me.items.includes(null)) continue;
        pendingPickups.add(it.id);
        socket.emit('pickup', { id: it.id });
        setTimeout(() => pendingPickups.delete(it.id), 1500);
      }
    }
  }

  // ------------------------------------------------------------------ Részecskék
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, color, size: 2 + Math.random() * 3 });
    }
  }
  function trail(p, x, y, color, boosted) {
    if (p.up && p.up.boots > 0) {
      const n = Math.min(3, p.up.boots);
      for (let i = 0; i < n; i++) {
        particles.push({ x: x + (Math.random() - 0.5) * 14, y: y + 22, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40, life: 0.35, max: 0.35, color: Math.random() < 0.5 ? '#fb923c' : color, size: 2 + Math.random() * 3 });
      }
    }
    if (boosted) particles.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 30, vx: -p.dir * 160, vy: 0, life: 0.25, max: 0.25, color: '#fde68a', size: 1.5, line: true });
  }

  // ------------------------------------------------------------------ Rajzolás
  // Teljesítmény: a statikus pályát EGYSZER rajzoljuk egy háttér-vászonra (mapLayer), és
  // képkockánként csak a látható részét másoljuk át. A ragyogásokat előre renderelt
  // sprite-okból rajzoljuk, és ami nem látszik a képernyőn, azt ki sem rajzoljuk.
  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(1, hexA(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
    }
    return c;
  }
  function glow(x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // Szöveg- és emoji-gyorsítótár: a canvas szövegrajzolása (főleg az emojiké) drága, ezért
  // minden feliratot egyszer rajzolunk ki egy kis vászonra, és utána csak azt másoljuk.
  const textCache = new Map();
  const measureCtx = document.createElement('canvas').getContext('2d');
  const spriteRes = () => Math.max(1, Math.min(3, scale * dpr));
  function cacheSprite(key, make) {
    let sp = textCache.get(key);
    if (!sp) {
      if (textCache.size > 300) textCache.clear();
      sp = make();
      textCache.set(key, sp);
    }
    return sp;
  }
  function textSprite(text, font, fill, stroke) {
    const res = spriteRes();
    return cacheSprite(`${text}|${font}|${fill}|${stroke || ''}|${res.toFixed(2)}`, () => {
      measureCtx.font = font;
      const size = +(font.match(/(\d+)px/) || [0, 14])[1];
      const pad = stroke ? 3 : 1;
      const w = Math.ceil(measureCtx.measureText(text).width + pad * 2 + 2), h = Math.ceil(size * 1.35 + pad * 2);
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
      const g = c.getContext('2d');
      g.scale(res, res); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (stroke) { g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = stroke; g.strokeText(text, w / 2, h / 2); }
      g.fillStyle = fill; g.fillText(text, w / 2, h / 2);
      return { c, w, h };
    });
  }
  // (x, y) a szöveg közepe; k: méretszorzó
  function drawText(text, x, y, font, fill, stroke, k = 1) {
    const sp = textSprite(text, font, fill, stroke);
    ctx.drawImage(sp.c, x - sp.w * k / 2, y - sp.h * k / 2, sp.w * k, sp.h * k);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => textCache.clear());

  // A kamera által látott világ-téglalap (képkockánként frissül) – ezen kívül nem rajzolunk.
  const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const inView = (x, y, r) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;
  const roomInView = id => { const r = S.roomById(id); return r.x + r.w > view.x0 && r.x < view.x1 && r.y + r.h > view.y0 && r.y < view.y1; };

  const MAP_PAD = 30;
  let mapLayer = null;
  function ensureMapLayer() {
    const k = Math.min(scale * dpr, 1.5);
    const tele = state ? Math.min(2, state.team.teleport) : 0; // a lezárt padok is a rétegben vannak
    if (mapLayer && Math.abs(mapLayer.k - k) < 0.01 && mapLayer.tele === tele) return;
    const c = document.createElement('canvas');
    c.width = Math.ceil((S.WORLD.w + MAP_PAD * 2) * k);
    c.height = Math.ceil((S.WORLD.h + MAP_PAD * 2) * k);
    const g = c.getContext('2d');
    g.scale(k, k); g.translate(MAP_PAD, MAP_PAD);
    drawStaticMap(g, tele);
    mapLayer = { c, k, tele };
  }
  // Ha a betűtípus később töltődik be, újrarajzoljuk a feliratokat.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { mapLayer = null; });

  function drawStaticMap(g, tele) {
    const rectFill = (r, pad, color) => { g.fillStyle = color; g.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2); };
    for (const r of S.ROOMS) rectFill(r, 16, hexA(r.color, 0.08));
    for (const c of S.CORRIDORS) rectFill(c, 8, '#151d3d');
    for (const r of S.ROOMS) rectFill(r, 6, hexA(r.color, 0.85));
    for (const c of S.CORRIDORS) rectFill(c, 4, '#334477');
    for (const c of S.CORRIDORS) rectFill(c, 0, '#0a0f22');
    for (const r of S.ROOMS) {
      const gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      gr.addColorStop(0, '#111938'); gr.addColorStop(1, '#0b1029');
      g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
    }
    // folyosó-csíkok
    g.strokeStyle = 'rgba(100,140,255,0.12)'; g.lineWidth = 3; g.setLineDash([14, 16]);
    for (const c of S.CORRIDORS) {
      g.beginPath();
      if (c.w > c.h) { g.moveTo(c.x + 40, c.y + c.h / 2); g.lineTo(c.x + c.w - 40, c.y + c.h / 2); }
      else { g.moveTo(c.x + c.w / 2, c.y + 40); g.lineTo(c.x + c.w / 2, c.y + c.h - 40); }
      g.stroke();
    }
    g.setLineDash([]);
    // padló-rács
    g.lineWidth = 1;
    for (const r of S.ROOMS) {
      g.strokeStyle = hexA(r.color, 0.07);
      g.beginPath();
      for (let x = r.x + 40; x < r.x + r.w; x += 40) { g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); }
      for (let y = r.y + 40; y < r.y + r.h; y += 40) { g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); }
      g.stroke();
    }
    // Kantin asztalok
    g.fillStyle = 'rgba(34,211,238,0.07)'; g.strokeStyle = 'rgba(34,211,238,0.25)'; g.lineWidth = 2;
    for (const [x, y] of [[880, 760], [1010, 680], [1130, 640]]) {
      g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill(); g.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.5; g.beginPath(); g.arc(x + Math.cos(a) * 44, y + Math.sin(a) * 44, 8, 0, 7); g.stroke(); }
    }
    // Híd: ablak + konzolok
    g.fillStyle = '#04060f'; g.fillRect(820, 86, 300, 26);
    g.fillStyle = 'rgba(167,139,250,0.18)';
    for (let i = 0; i < 6; i++) g.fillRect(840 + i * 50, 200, 36, 22);
    // Gépház hajtómű-gyűrűk
    g.strokeStyle = 'rgba(251,146,60,0.4)';
    for (const x of [900, 1000, 1100]) { g.beginPath(); g.arc(x, 1220, 26, 0, 7); g.stroke(); }
    // Oxigén-Kert növények
    for (const [x, y, r] of PLANTS) {
      g.fillStyle = 'rgba(52,211,153,0.16)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(52,211,153,0.3)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); g.fill();
    }
    // Labor ágyak + kereszt
    g.strokeStyle = 'rgba(232,121,249,0.35)'; g.lineWidth = 2;
    for (const y of [150, 240]) { g.strokeRect(220, y, 90, 44); g.fillStyle = 'rgba(232,121,249,0.12)'; g.fillRect(222, y + 2, 22, 40); }
    g.fillStyle = 'rgba(232,121,249,0.25)';
    g.fillRect(375, 205, 14, 44); g.fillRect(360, 220, 44, 14);
    // Tétlen konzolok és lezárt teleport-padok: ezek sosem mozognak, ezért a rétegbe kerülnek;
    // az aktív (világító) állomásokat képkockánként fölé rajzoljuk.
    const rr = window.Avatar.rr;
    const consoleBox = (x, y, base) => {
      g.fillStyle = base; g.strokeStyle = '#334155'; g.lineWidth = 2;
      rr(g, x - 18, y - 14, 36, 28, 6); g.fill(); g.stroke();
      g.fillStyle = 'rgba(148,163,184,0.12)'; rr(g, x - 13, y - 10, 26, 14, 3); g.fill();
    };
    for (const st of S.TASK_STATIONS) consoleBox(st.x, st.y, '#151b30');
    g.font = '16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const st of S.EMERGENCY_STATIONS) {
      consoleBox(st.x, st.y, '#1a0e16');
      g.fillText('⚠️', st.x, st.y - 3);
      g.strokeStyle = 'rgba(251,113,133,0.35)'; g.lineWidth = 2; g.strokeRect(st.x - 18, st.y - 14, 36, 28);
    }
    const unlocked = new Set(S.TELEPORT.levels[tele]);
    for (const room of Object.keys(S.TELEPORT.kantinPads)) {
      if (unlocked.has(room)) continue;
      const p = S.TELEPORT.kantinPads[room];
      g.strokeStyle = 'rgba(34,211,238,0.18)'; g.lineWidth = 2; g.setLineDash([4, 5]);
      g.beginPath(); g.arc(p.x, p.y, 22, 0, 7); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 0.4; g.font = '12px sans-serif'; g.fillText('🔒', p.x, p.y); g.globalAlpha = 1;
    }
    // feliratok
    g.font = '700 22px "Chakra Petch", sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const r of S.ROOMS) { g.fillStyle = hexA(r.color, 0.75); g.fillText(r.name.toUpperCase(), r.x + 16, r.y + 32); }
  }
  const PLANTS = [[1600, 620, 26], [1700, 600, 20], [1660, 700, 30], [1560, 800, 22], [1760, 820, 26], [1520, 690, 16]];

  function drawMap(t) {
    ensureMapLayer();
    const k = mapLayer.k;
    const x0 = Math.max(-MAP_PAD, view.x0), y0 = Math.max(-MAP_PAD, view.y0);
    const x1 = Math.min(S.WORLD.w + MAP_PAD, view.x1), y1 = Math.min(S.WORLD.h + MAP_PAD, view.y1);
    if (x1 > x0 && y1 > y0) ctx.drawImage(mapLayer.c, (x0 + MAP_PAD) * k, (y0 + MAP_PAD) * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0);
    drawLiveProps(t);
  }

  // Csak az animált díszletek – és csak ha az adott szoba látszik.
  function drawLiveProps(t) {
    if (roomInView('hid')) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 18; i++) { const x = 820 + ((i * 67 + t * 40) % 300); ctx.fillRect(x, 90 + (i * 13) % 20, 2, 2); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#a78bfa' : '#34d399'; ctx.fillRect(846 + i * 50, 206, 6, 6); }
    }
    if (roomInView('gephaz')) for (const x of [900, 1000, 1100]) glow(x, 1220, 46, '#fb923c', 0.35 + Math.sin(t * 6 + x) * 0.1);
    if (roomInView('reaktor')) {
      const pr = 50 + Math.sin(t * 3) * 6;
      glow(320, 760, pr + 30, '#fb7185', 0.55);
      glow(320, 760, pr * 0.55, '#ffffff', 0.6);
      ctx.strokeStyle = 'rgba(251,113,133,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(320, 760, 70, t, t + 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(320, 760, 86, -t * 0.7, -t * 0.7 + 3); ctx.stroke();
    }
  }

  function drawPads(t) {
    const unlocked = new Set(unlockedTeleRooms());
    for (const room of Object.keys(S.TELEPORT.kantinPads)) {
      if (!unlocked.has(room)) continue; // a lezárt padok a statikus rétegben vannak
      const pads = [[S.TELEPORT.kantinPads[room], S.roomById(room).name], [S.TELEPORT.roomPads[room], 'Kantin']];
      for (const [p, label] of pads) {
        if (!inView(p.x, p.y, 50)) continue;
        ctx.save(); ctx.translate(p.x, p.y);
        glow(0, 0, 34, '#22d3ee', 0.6);
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3;
        ctx.rotate(t * 2);
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 24, i * 2.1, i * 2.1 + 1.2); ctx.stroke(); }
        ctx.rotate(-t * 2);
        drawText('➜ ' + label.toUpperCase(), 0, -36, '700 11px "Chakra Petch"', '#a5f3fc');
        ctx.restore();
      }
    }
  }

  function drawConsole(x, y, base, glowColor, t, emoji, pulse) {
    ctx.save(); ctx.translate(x, y);
    if (glowColor) glow(0, 0, 40 + (pulse ? Math.sin(t * 6) * 6 : 0), glowColor, 0.55);
    ctx.fillStyle = base; ctx.strokeStyle = glowColor || '#334155'; ctx.lineWidth = 2;
    window.Avatar.rr(ctx, -18, -14, 36, 28, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = glowColor ? hexA(glowColor, 0.35) : 'rgba(148,163,184,0.12)';
    window.Avatar.rr(ctx, -13, -10, 26, 14, 3); ctx.fill();
    if (emoji) drawText(emoji, 0, -3, '16px sans-serif', '#000');
    ctx.restore();
  }

  function drawStations(t) {
    // Bolt-terminál
    if (inView(S.TERMINAL.x, S.TERMINAL.y, 60)) {
      drawConsole(S.TERMINAL.x, S.TERMINAL.y, '#2a0f3a', '#e879f9', t, '🛒', true);
      drawText('FEJLESZTÉSEK', S.TERMINAL.x, S.TERMINAL.y + 26, '700 11px "Chakra Petch"', '#f5d0fe');
    }

    const active = new Map(state.tasks.map(x => [x.stationId, x]));
    for (const st of S.TASK_STATIONS) {
      if (!inView(st.x, st.y, 60)) continue;
      const tk = active.get(st.id);
      if (tk) {
        const tt = S.TASK_TYPES.find(x => x.id === tk.type);
        drawConsole(st.x, st.y, '#3a2c05', '#fbbf24', t, tt.emoji, true);
        const by = st.y - 34 + Math.sin(t * 5) * 4;
        drawText('!', st.x, by - 7, '700 20px "Chakra Petch"', '#fde047');
      }
    }

    const known = new Map();
    for (const e of state.ems) if (!e.mine && e.stationId) known.set(e.stationId, e);
    for (const st of S.EMERGENCY_STATIONS) {
      if (!inView(st.x, st.y, 80)) continue;
      const e = known.get(st.id);
      if (e) {
        const blink = Math.sin(t * 12) > 0;
        drawConsole(st.x, st.y, '#3f0a14', blink ? '#fb7185' : '#be123c', t, e.tools.map(x => S.toolById(x).emoji).join(''), true);
        // visszaszámláló gyűrű
        const frac = leftNow(e.end) / e.duration;
        ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(st.x, st.y, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
        // kód
        const col = S.CODE_COLORS.find(c => e.code.startsWith(c.id));
        const sp = textSprite(e.code, '700 16px "Chakra Petch"', col ? col.css : '#fff');
        const w = sp.w + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; window.Avatar.rr(ctx, st.x - w / 2, st.y - 62, w, 22, 6); ctx.fill();
        ctx.drawImage(sp.c, st.x - sp.w / 2, st.y - 51 - sp.h / 2, sp.w, sp.h);
      }
    }
  }

  function drawItems(t) {
    for (const it of state.items) {
      if (!inView(it.x, it.y, 30)) continue;
      const def = S.ITEMS[it.type];
      const bob = Math.sin(t * 4 + it.x) * 4;
      const big = it.type !== 'coin';
      const col = it.type === 'drink' ? '#fbbf24' : it.type === 'grenade' ? '#a5f3fc' : '#fde047';
      glow(it.x, it.y, big ? 26 : 16, col, 0.5);
      drawText(def.emoji, it.x, it.y + bob - 4, (big ? 24 : 16) + 'px sans-serif', '#000');
    }
  }

  function drawBubble(x, y, text) {
    const res = spriteRes();
    const sp = cacheSprite('bubble|' + text + '|' + res.toFixed(2), () => {
      const font = '700 13px "Exo 2", sans-serif';
      measureCtx.font = font;
      const w = Math.ceil(Math.min(220, measureCtx.measureText(text).width + 16)), h = 32;
      const self = text.includes('ÖNZŐ');
      const c = document.createElement('canvas'); c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
      const g = c.getContext('2d'); g.scale(res, res);
      g.fillStyle = self ? 'rgba(190,24,93,0.95)' : 'rgba(255,255,255,0.95)';
      window.Avatar.rr(g, 0, 0, w, 24, 10); g.fill();
      g.beginPath(); g.moveTo(w / 2 - 6, 23); g.lineTo(w / 2 + 6, 23); g.lineTo(w / 2, 31); g.fill();
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = self ? '#fff' : '#0b1020';
      g.fillText(text, w / 2, 12.5, w - 8);
      return { c, w, h };
    });
    ctx.drawImage(sp.c, x - sp.w / 2, y - 26, sp.w, sp.h);
  }

  function drawPlayers(t, dt) {
    const list = [];
    for (const p of state.players) {
      if (!p.inGame) continue;
      if (p.id === playerId) list.push({ p, x: me.x, y: me.y, dir: me.dir, moving: me.moving, self: true });
      else {
        const e = ents.get(p.id); if (!e) continue;
        const k = Math.min(1, dt * 12);
        e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
        list.push({ p, x: e.x, y: e.y, dir: p.dir, moving: p.moving });
      }
    }
    list.sort((a, b) => a.y - b.y);
    for (const L of list) {
      if (!inView(L.x, L.y, 90)) continue;
      const { p } = L;
      const boosted = L.self ? leftNow(state.me.boostEnd) > 0 : p.boost;
      const slimed = L.self ? leftNow(state.me.slowEnd) > 0 : p.slow;
      if (L.moving) trail(p, L.x, L.y, p.avatar.color, boosted);
      ctx.save();
      ctx.translate(L.x, L.y);
      if (!p.connected) ctx.globalAlpha = 0.35;
      if (L.self) {
        ctx.strokeStyle = hexA(p.avatar.color, 0.6); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 24, 22 + Math.sin(t * 4) * 2, 8, 0, 0, 7); ctx.stroke();
      }
      const animSpeed = boosted ? 1.6 : slimed ? 0.5 : 1 + (p.up.boots || 0) * 0.12;
      drawAvatar(ctx, p.avatar, { t: t + (p.id.charCodeAt(0) % 10), moving: L.moving, dir: L.dir, cape: p.up.cape > 0, vip: p.up.magnet, slime: slimed, animSpeed,
        cacheKey: p.id, res: Math.min(3, scale * dpr * (p.up.cape > 0 ? 1.2 : 1)) });
      ctx.restore();
      // név
      const big = p.up.cape > 0 ? 1.2 : 1;
      const nm = (p.name || '???') + (p.connected ? '' : ' 💤');
      drawText(nm, L.x, L.y + 42 * big - 4, '700 12px "Exo 2", sans-serif', L.self ? '#fff' : p.avatar.color, 'rgba(0,0,0,0.8)');
      if (p.bubble) drawBubble(L.x, L.y - 62 * big, p.bubble);
    }
  }

  function drawStars(t) {
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, cw, ch);
    // 3 csoportban pislognak: csoportonként egyszer állítunk átlátszóságot.
    ctx.fillStyle = '#e6f6ff';
    for (let grp = 0; grp < 3; grp++) {
      ctx.globalAlpha = 0.4 + Math.sin(t * 2 + grp * 2.1) * 0.3;
      for (const s of STARS) {
        if (s.grp !== grp) continue;
        const x = ((s.x * cw - cam.x * s.z * scale) % cw + cw) % cw;
        const y = ((s.y * ch - cam.y * s.z * scale) % ch + ch) % ch;
        ctx.fillRect(x, y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawIndicators(t) {
    const pad = 22;
    const targets = [];
    for (const tk of state.tasks) targets.push({ pos: S.TASK_STATIONS.find(s => s.id === tk.stationId), color: '#fbbf24', label: '!' });
    for (const e of state.ems) if (!e.mine && e.stationId) targets.push({ pos: S.EMERGENCY_STATIONS.find(s => s.id === e.stationId), color: '#fb7185', label: '!' });
    if (state.rat) targets.push({ pos: ratView, color: '#fbbf24', label: '🐀' });
    const topPad = 60;
    for (const tg of targets) {
      const sx = (tg.pos.x - cam.x) * scale + cw / 2, sy = (tg.pos.y - cam.y) * scale + ch / 2;
      if (sx > 0 && sx < cw && sy > topPad && sy < ch) continue;
      const ang = Math.atan2(sy - ch / 2, sx - cw / 2);
      const cx = cw / 2, cy = ch / 2;
      const kx = (cw / 2 - pad) / Math.abs(Math.cos(ang) || 1e-6);
      const ky = (ch / 2 - pad) / Math.abs(Math.sin(ang) || 1e-6);
      const k = Math.min(kx, ky);
      const x = cx + Math.cos(ang) * k, y = Math.max(topPad - 10, cy + Math.sin(ang) * k);
      ctx.save(); ctx.translate(x, y);
      ctx.globalAlpha = 0.7 + Math.sin(t * 6) * 0.3;
      ctx.fillStyle = tg.color;
      ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
      ctx.rotate(-ang);
      drawText(tg.label, -Math.cos(ang) * 2, -Math.sin(ang) * 2, '700 12px sans-serif', '#000');
      ctx.restore();
    }
  }

  function render(t, dt, now) {
    if (!cw) resize();
    const k = Math.min(1, dt * 6);
    cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k;
    let sx = 0, sy = 0;
    if (now < shakeUntil) { const m = (shakeUntil - now) / 650 * 14; sx = (Math.random() - 0.5) * m; sy = (Math.random() - 0.5) * m; }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStars(t);
    ctx.save();
    shakeX = sx; shakeY = sy;
    ctx.translate(cw / 2 + sx, ch / 2 + sy);
    const ev = state.event ? state.event.type : null;
    if (ev === 'gravity') ctx.rotate(Math.sin(t * 1.3) * 0.06);
    ctx.scale(scale, scale);
    ctx.translate(-cam.x, -cam.y);
    const margin = ev === 'gravity' ? 160 : 40;
    view.x0 = cam.x - cw / 2 / scale - margin; view.x1 = cam.x + cw / 2 / scale + margin;
    view.y0 = cam.y - ch / 2 / scale - margin; view.y1 = cam.y + ch / 2 / scale + margin;

    drawMap(t);
    drawPads(t);
    drawStations(t);
    drawItems(t);

    // tap-célpont
    if (tapTarget) {
      ctx.strokeStyle = 'rgba(34,211,238,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tapTarget.x, tapTarget.y, 10 + Math.sin(t * 8) * 3, 0, 7); ctx.stroke();
    }

    // részecskék
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      if (p.line) ctx.fillRect(p.x, p.y, 14, 1.5);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (particles.length > 500) particles.splice(0, particles.length - 500);

    drawStrikes(t);
    drawRat(t, dt);
    drawPlayers(t, dt);

    // repülő tárgyak (mágnes / felvétel)
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / 0.35;
      if (f.t >= 1) { flights.splice(i, 1); continue; }
      const target = f.to === playerId ? me : ents.get(f.to) || f;
      const x = f.x + (target.x - f.x) * f.t, y = f.y + (target.y - 10 - f.y) * f.t;
      ctx.globalAlpha = 1 - f.t * 0.5;
      drawText(f.emoji, x, y - 7, '22px sans-serif', '#000');
      ctx.globalAlpha = 1;
    }
    // lebegő szövegek
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      if (f.t > 1.4) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - f.t / 1.4;
      drawText(f.text, f.x, f.y - f.t * 40 - 6, '700 18px "Chakra Petch"', f.color, 'rgba(0,0,0,0.8)');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (ev === 'blackout') drawBlackout(t);
    if (ev === 'gravity') { ctx.fillStyle = `rgba(124,58,237,${0.08 + Math.sin(t * 2) * 0.04})`; ctx.fillRect(0, 0, cw, ch); }
    drawIndicators(t);
  }

  // ------------------------------------------------------------------ Esemény-grafika
  let shakeX = 0, shakeY = 0;
  const ratView = { x: 0, y: 0, dir: 1, seen: false };
  const toScreen = (wx, wy) => ({ x: (wx - cam.x) * scale + cw / 2 + shakeX, y: (wy - cam.y) * scale + ch / 2 + shakeY });

  function drawStrikes(t) {
    for (const m of state.strikes) {
      if (!inView(m.x, m.y, m.r + 120)) continue;
      const frac = 1 - Math.max(0, leftNow(m.end)) / 2000;
      ctx.fillStyle = `rgba(244,63,94,${0.12 + frac * 0.22})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, t * 2, t * 2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(253,186,116,0.55)';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r * frac, 0, 7); ctx.fill();
      // zuhanó meteor
      const hgt = (1 - frac) * 260;
      drawText('☄️', m.x + hgt * 0.4, m.y - hgt, '42px sans-serif', '#000', null, (26 + frac * 16) / 42);
    }
  }

  function drawRat(t, dt) {
    if (!state.rat) { ratView.seen = false; return; }
    if (!ratView.seen) { ratView.x = state.rat.x; ratView.y = state.rat.y; ratView.seen = true; }
    const k = Math.min(1, dt * 10);
    const dx = state.rat.x - ratView.x;
    if (Math.abs(dx) > 1) ratView.dir = dx < 0 ? -1 : 1;
    ratView.x += dx * k; ratView.y += (state.rat.y - ratView.y) * k;
    const { x, y } = ratView;
    if (!inView(x, y, 60)) return;
    glow(x, y, 46, '#fbbf24', 0.45);
    ctx.save(); ctx.translate(x, y + Math.abs(Math.sin(t * 18)) * -4);
    ctx.scale(-ratView.dir, 1);
    drawText('🐀', 0, 0, '34px sans-serif', '#000');
    ctx.restore();
    drawText('💰', x, y - 32 + Math.sin(t * 6) * 3, '18px sans-serif', '#000');
    drawText(`${state.rat.stolen} 💰`, x, y + 30, '700 13px "Chakra Petch"', '#fde68a', 'rgba(0,0,0,0.8)');
  }

  // Áramszünet: sötét köd, amibe a játékosok "zseblámpái" lyukat vágnak.
  const holeSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 64 * 0.35, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  })();
  const fog = document.createElement('canvas');
  const fctx = fog.getContext('2d');
  function drawBlackout(t) {
    if (fog.width !== canvas.width || fog.height !== canvas.height) { fog.width = canvas.width; fog.height = canvas.height; }
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.fillStyle = 'rgba(2,3,10,0.96)';
    fctx.fillRect(0, 0, cw, ch);
    fctx.globalCompositeOperation = 'destination-out';
    const lights = [{ x: me.x, y: me.y, r: 165 + Math.sin(t * 9) * 4 }];
    for (const [id, e] of ents) { const p = state.players.find(q => q.id === id); if (p && p.inGame) lights.push({ x: e.x, y: e.y, r: 85 }); }
    for (const tk of state.tasks) { const st = S.TASK_STATIONS.find(s => s.id === tk.stationId); lights.push({ x: st.x, y: st.y, r: 48 }); }
    for (const e of state.ems) if (!e.mine && e.stationId) { const st = S.EMERGENCY_STATIONS.find(s => s.id === e.stationId); lights.push({ x: st.x, y: st.y, r: Math.sin(t * 12) > 0 ? 55 : 35 }); }
    for (const L of lights) {
      const p = toScreen(L.x, L.y), r = L.r * scale;
      if (p.x + r < 0 || p.y + r < 0 || p.x - r > cw || p.y - r > ch) continue;
      fctx.drawImage(holeSprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.drawImage(fog, 0, 0, cw, ch);
  }

  // ------------------------------------------------------------------ HUD + riasztások
  // A HUD csak akkor nyúl a DOM-hoz, ha valami tényleg változott (minden DOM-írás
  // újraszámolást és újrafestést indíthat a böngészőben).
  let prevHud = '', prevChips = '', hudDirty = true, lobbyDirty = true;
  const hudEls = {};
  function updateHud() {
    if (!hudEls.hp) {
      Object.assign(hudEls, { hp: $('#hp-fill'), hpText: $('#hp-text'), prog: $('#prog-fill'), progText: $('#prog-text'), wave: $('#wave-text'), bank: $('#bank-val'),
        toolSlot: $('#slot-tool'), toolEm: $('#slot-tool .em'), items: $$('.slot.item'), chips: $('#status-chips') });
    }
    const chipsKey = Math.ceil(leftNow(state.me.boostEnd) / 1000) + '|' + Math.ceil(leftNow(state.me.slowEnd) / 1000);
    if (!hudDirty && chipsKey === prevChips) return;
    hudDirty = false;
    const hp = Math.max(0, Math.round(state.hp));
    const pct = Math.round(state.progress);
    const key = `${hp}|${state.maxHp}|${pct}|${state.wave}|${state.bank}`;
    if (key !== prevHud) {
      prevHud = key;
      const f = hudEls.hp;
      const ratio = hp / state.maxHp;
      f.style.width = (ratio * 100) + '%';
      f.className = 'fill hp' + (ratio < 0.3 ? ' low' : ratio < 0.6 ? ' mid' : '');
      hudEls.hpText.textContent = `${hp}/${state.maxHp}`;
      hudEls.prog.style.width = pct + '%';
      hudEls.progText.textContent = pct + '% ÚT';
      hudEls.wave.textContent = `🚀 ${state.wave}. HULLÁM`;
      hudEls.bank.textContent = state.bank;
    }
    // hátizsák
    const tool = S.toolById(myTool());
    const toolEl = hudEls.toolEm;
    if (toolEl.textContent !== (tool ? tool.emoji : '—')) toolEl.textContent = tool ? tool.emoji : '—';
    const hot = state.ems.some(e => e.mine);
    if (hudEls.toolSlot.classList.contains('hot') !== hot) hudEls.toolSlot.classList.toggle('hot', hot);
    hudEls.items.forEach(b => {
      const it = state.me.items[+b.dataset.slot];
      const em = it ? S.ITEMS[it].emoji : '';
      const span = b.querySelector('.em');
      if (span.textContent !== em) span.textContent = em;
      if (b.classList.contains('full') !== !!it) b.classList.toggle('full', !!it);
    });
    // státusz chipek (csak másodpercenként változnak)
    if (chipsKey !== prevChips) {
      prevChips = chipsKey;
      const chips = [];
      const bl = leftNow(state.me.boostEnd), sl = leftNow(state.me.slowEnd);
      if (bl > 0) chips.push(`<span class="chip boost">🥤 TURBÓ ${Math.ceil(bl / 1000)}s</span>`);
      if (sl > 0) chips.push(`<span class="chip slow">🟢 ŰR-NYÁLKA ${Math.ceil(sl / 1000)}s</span>`);
      hudEls.chips.innerHTML = chips.join('');
    }
  }

  function onBankChange(prev, next) {
    if (prev === next || currentScreen !== 'game') return;
    const b = $('#bank');
    b.classList.remove('up', 'down'); void b.offsetWidth;
    b.classList.add(next > prev ? 'up' : 'down');
    const d = document.createElement('div');
    d.className = 'delta ' + (next > prev ? 'p' : 'n');
    d.textContent = (next > prev ? '+' : '') + (next - prev);
    b.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  const alertEls = new Map();
  // Gyors út: ha az állapot nem változott, csak a visszaszámlálók frissülnek; a teljes
  // listát (HTML-szövegekkel) csak új 'st' üzenet vagy árulás-értesítés után építjük újra.
  let alertsDirty = true;
  function tickAlertTimers() {
    for (const el of alertEls.values()) {
      if (el._end == null) continue;
      const left = leftNow(el._end);
      if (el._tm) { const txt = Math.ceil(left / 1000) + ' mp'; if (el._tm.textContent !== txt) el._tm.textContent = txt; }
      if (el._bar && el._dur) { const f = Math.round(left / el._dur * 100) / 100; if (f !== el._frac) { el._frac = f; el._bar.style.transform = `scaleX(${f})`; } }
    }
  }
  function updateAlerts(now) {
    if (!alertsDirty && !(snitches.length && snitches[0].until < now)) { tickAlertTimers(); return; }
    alertsDirty = false;
    const box = $('#alerts');
    const want = [];
    if (state.event) {
      const info = S.EVENTS[state.event.type];
      want.push({ id: 'ev:' + state.event.type, cls: 'alert event', html: `${info.emoji} <b>${info.name}</b> – ${esc(info.desc)}`, sec: Math.ceil(leftNow(state.event.end) / 1000), frac: leftNow(state.event.end) / state.event.duration, end: state.event.end, dur: state.event.duration });
    }
    for (const e of state.ems) {
      const sec = Math.ceil(leftNow(e.end) / 1000);
      const frac = leftNow(e.end) / e.duration;
      const toolNames = e.tools.map(id => { const tl = S.toolById(id); return `${esc(tl.name.toUpperCase())} ${tl.emoji}`; }).join(' + ');
      const title = e.kind === 'double' ? '🚨🚨 DUPLA RIASZTÁS' : '🚨 RIASZTÁS';
      if (e.mine) {
        const mineTool = S.toolById(myTool());
        let html;
        if (e.kind === 'double') {
          const otherId = e.tools.find(x => x !== myTool());
          const other = S.toolById(otherId);
          const op = state.players.find(p => p.tool === otherId);
          html = `${title}! A te ${mineTool.emoji} eszközöd ÉS ${other.emoji} <b>${esc(op ? op.name : '???')}</b> kell <b>EGYSZERRE ugyanoda!</b> Hol? Kód? <b>KÉRDEZZÉTEK A CSAPATOT!</b>`;
        } else {
          html = `🚨 A TE ESZKÖZÖDRE VAN SZÜKSÉG: ${mineTool.emoji} <b>${esc(mineTool.name.toUpperCase())}</b>! Hol? Milyen kóddal? <b>KÉRDEZD A CSAPATOT!</b>`;
        }
        want.push({ id: e.id + ':m:' + myTool(), cls: 'alert mine', html, sec, frac, end: e.end, dur: e.duration });
      } else {
        const room = S.roomById(e.room);
        const col = S.CODE_COLORS.find(c => e.code.startsWith(c.id));
        let hint = '';
        if (e.codeHint) hint = `<span class="hint">🔎 Osztott kód – ${esc(e.codeHint)}!</span>`;
        if (e.kind === 'double') hint = '<span class="hint">👥 Mindkét eszköznek egyszerre kell ott lennie!</span>';
        want.push({ id: e.id + ':o:' + e.code + (e.soloMine ? ':s' : ''), cls: 'alert', html: `${title} ${esc(room.where)}! Szükséges: <b>${toolNames}</b> | Kód: <span class="code" style="color:${col ? col.css : '#fff'}">${esc(e.code)}</span>${e.soloMine ? ' <i>(gyakorló mód: ez a tiéd!)</i>' : ''}${hint}`, sec, frac, end: e.end, dur: e.duration });
      }
    }
    if (state.quizOn) {
      const qp = state.players.find(p => p.id === state.quizOn.playerId);
      if (qp && qp.id !== playerId) want.push({ id: 'quiz', cls: 'alert quizinfo', html: `🤖 BÉLA-9000 vizsgáztat: <b>${esc(qp.name)}</b> – drukkoljatok!`, sec: Math.ceil(leftNow(state.quizOn.end) / 1000), end: state.quizOn.end });
    }
    for (let i = snitches.length - 1; i >= 0; i--) if (snitches[i].until < now) snitches.splice(i, 1);
    for (const s of snitches) want.push({ id: 'sn' + s.id, cls: 'alert snitch', html: s.html });

    const ids = new Set(want.map(w => w.id));
    for (const [id, el] of alertEls) if (!ids.has(id)) { el.remove(); alertEls.delete(id); }
    let changedOrder = false;
    for (const w of want) {
      let el = alertEls.get(w.id);
      if (!el) {
        el = document.createElement('div');
        el.className = w.cls;
        el.innerHTML = (w.sec != null ? '<span class="tm"></span>' : '') + w.html + (w.frac != null ? '<div class="tbar"></div>' : '');
        el._tm = el.querySelector('.tm'); el._bar = el.querySelector('.tbar'); el._frac = -1;
        alertEls.set(w.id, el);
        changedOrder = true;
      }
      el._end = w.end; el._dur = w.dur;
      if (w.sec != null) { const txt = w.sec + ' mp'; if (el._tm.textContent !== txt) el._tm.textContent = txt; }
      // Az idősáv transform-mal zsugorodik (nem kell hozzá layout), és csak 1%-os lépésekben.
      if (w.frac != null) { const f = Math.round(w.frac * 100) / 100; if (f !== el._frac) { el._frac = f; el._bar.style.transform = `scaleX(${f})`; } }
    }
    // Csak akkor rendezzük át a DOM-ot, ha új elem jött vagy változott a sorrend.
    if (changedOrder || [...box.children].some((c, i) => !want[i] || c !== alertEls.get(want[i].id))) {
      want.forEach(w => box.appendChild(alertEls.get(w.id)));
    }
  }

  // ------------------------------------------------------------------ Modalok
  const modals = { task: $('#modal-task'), code: $('#modal-code'), shop: $('#modal-shop'), quiz: $('#modal-quiz') };
  let taskCleanup = null, taskStation = null;
  function anyModalOpen() { return Object.values(modals).some(m => m.classList.contains('open')); }
  function openModal(n) { modals[n].classList.add('open'); }
  function closeModal(n) {
    modals[n].classList.remove('open');
    if (n === 'task') { if (taskCleanup) taskCleanup(); taskCleanup = null; taskStation = null; $('#task-body').innerHTML = ''; }
    if (n === 'code') codeStation = null;
    if (n === 'quiz') { quiz = null; }
  }
  function closeAllModals() { Object.keys(modals).forEach(closeModal); }
  $$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.closest('.modal').id.replace('modal-', ''))));

  const FAIL_TEXTS = ['Ez nem az én napom… 😩', 'Na jó, ezt senki nem látta!', 'A kesztyűm volt a hibás!', 'Hupsz! 🙈', 'Mindjárt, csak bemelegítettem!'];
  function openTask(it) {
    const tt = S.TASK_TYPES.find(x => x.id === it.type);
    const st = myState();
    const gloves = st ? st.up.gloves : 0;
    $('#task-title').textContent = `${tt.emoji} ${tt.name.toUpperCase()}${gloves ? '  🧤' + gloves : ''}`;
    taskStation = it.stationId;
    openModal('task');
    taskCleanup = window.MiniGames.start(it.type, $('#task-body'), gloves, ok => {
      const sid = taskStation;
      closeModal('task');
      if (ok) socket.emit('taskDone', { stationId: sid });
      else { SFX.fail(); sayBubble(pick(FAIL_TEXTS)); }
    }, state ? state.wave : 1);
  }

  // Kód modal
  let codeStation = null, codeColor = null, codeNum = '';
  (function buildCodePad() {
    const cc = $('#code-colors');
    S.CODE_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.style.color = c.css; b.innerHTML = `<span>${c.id}</span>`;
      b.onclick = () => { codeColor = c.id; SFX.click(); renderCode(); };
      cc.appendChild(b);
    });
    const kp = $('#keypad');
    kp.style.gridTemplateColumns = 'repeat(6, 1fr)';
    ['1', '2', '3', '4', '5', '⌫', '6', '7', '8', '9', '0', 'C'].forEach(k => {
      const b = document.createElement('button');
      b.textContent = k;
      b.onclick = () => {
        SFX.click();
        if (k === '⌫') codeNum = codeNum.slice(0, -1);
        else if (k === 'C') { codeNum = ''; codeColor = null; }
        else if (codeNum.length < 2) codeNum += k;
        renderCode();
      };
      kp.appendChild(b);
    });
    $('#code-submit').onclick = () => {
      if (!codeColor || codeNum.length !== 2) { $('#code-msg').textContent = 'Válassz színt és írj be 2 számjegyet!'; return; }
      socket.emit('emCode', { stationId: codeStation, code: codeColor + '-' + codeNum });
    };
  })();
  function renderCode() {
    const c = S.CODE_COLORS.find(x => x.id === codeColor);
    const ce = $('#code-color');
    ce.textContent = codeColor || 'SZÍN?';
    ce.style.color = c ? c.css : '#64748b';
    $('#code-num').textContent = codeNum.padEnd(2, '_');
    $$('#code-colors button').forEach(b => b.classList.toggle('sel', b.textContent === codeColor));
  }
  function openCodeModal(r) {
    const tools = (r.tools || [r.tool]).map(id => S.toolById(id).emoji).join(' + ');
    codeStation = r.stationId; codeColor = null; codeNum = '';
    $('#code-title').textContent = `🚨 ${tools} VÉSZJAVÍTÁS`;
    $('.code-hint').innerHTML = r.kind === 'double'
      ? 'DUPLA riasztás: a társadnak is <b>itt kell állnia</b>! Kód? 🗣️'
      : 'Kérdezd a csapatot: <b>mi a kód?</b> 🗣️';
    $('#code-msg').textContent = '';
    renderCode();
    openModal('code');
    SFX.alarm();
  }

  // Bolt
  let shopTab = 'self', shopKey = '', surrenderArmed = 0;
  function openShop() { openModal('shop'); shopKey = ''; renderShop(); }
  $('#btn-shop').addEventListener('click', () => { SFX.click(); openShop(); });
  $$('.tab').forEach(b => b.addEventListener('click', () => { shopTab = b.dataset.tab; $$('.tab').forEach(x => x.classList.toggle('active', x === b)); SFX.click(); shopKey = ''; renderShop(); }));
  $('#btn-surrender').addEventListener('click', e => {
    const now = performance.now();
    if (now - surrenderArmed < 3000) { socket.emit('surrender'); closeModal('shop'); return; }
    surrenderArmed = now;
    e.target.textContent = '⚠️ Biztos? Koppints újra 3 mp-en belül!';
    setTimeout(() => { e.target.textContent = '🏳️ Küldetés feladása'; }, 3000);
  });
  function renderShop() {
    if (!state || !modals.shop.classList.contains('open')) return;
    const st = myState(); if (!st) return;
    const players = state.players.filter(p => p.inGame);
    const key = JSON.stringify([shopTab, state.bank, st.up, state.team, players.map(p => [p.name, p.spentSelf, p.spentTeam])]);
    if (key === shopKey) return;
    shopKey = key;
    $('#shop-bank').textContent = state.bank;
    $('#shop-warn').textContent = shopTab === 'self'
      ? '⚠️ Önző fejlesztés = a KÖZÖS kasszából fizetsz, és MINDENKI értesítést kap róla! 😈'
      : '🤝 Ezek az egész legénységnek segítenek túlélni.';
    const list = $('#shop-list');
    list.innerHTML = '';
    for (const [k, def] of Object.entries(S.UPGRADES)) {
      if (def.tab !== shopTab) continue;
      const lvl = def.tab === 'self' ? st.up[k] : state.team[k];
      const max = def.prices.length;
      const price = lvl < max ? def.prices[lvl] : null;
      const row = document.createElement('div');
      row.className = 'upg';
      const dots = max > 1 ? `<div class="lv">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : (lvl ? '<div class="lv"><i class="on"></i></div>' : '');
      row.innerHTML = `<div class="ue">${def.emoji}</div><div class="ui"><div class="un">${esc(def.name)}${max > 1 ? ` <small style="color:#8b97c4">Lv ${lvl}/${max}</small>` : ''}</div><div class="ud">${esc(def.desc)}</div>${dots}</div>`;
      const b = document.createElement('button');
      if (price == null) { b.className = 'buy max'; b.textContent = 'MAX'; b.disabled = true; }
      else {
        b.className = 'buy ' + def.tab;
        b.innerHTML = `${price} 💰`;
        b.disabled = state.bank < price;
        b.onclick = () => socket.emit('buy', k);
      }
      row.appendChild(b);
      list.appendChild(row);
    }
    renderShame($('#shop-shame'), players);
  }
  function renderShame(el, players) {
    const sorted = players.slice().sort((a, b) => b.spentSelf - a.spentSelf);
    const worst = sorted[0] && sorted[0].spentSelf > 0 ? sorted[0].id : null;
    el.innerHTML = `<div class="shame-row head"><span>JÁTÉKOS</span><span>💸 MAGÁRA</span><span>🤝 CSAPATRA</span></div>` +
      sorted.map(p => `<div class="shame-row ${p.id === worst ? 'worst' : ''}"><span>${p.id === worst ? '🐷 ' : ''}${esc(p.name)}</span><span class="s">${p.spentSelf} 💰</span><span class="t">${p.spentTeam} 💰</span></div>`).join('');
  }

  // Kvíz
  let quiz = null;
  function openQuiz(q) {
    quiz = { id: q.id, end: performance.now() + q.timeMs, total: q.timeMs, answered: false };
    $('#quiz-q').textContent = q.question;
    $('#quiz-sub').textContent = `Helyes válasz: +${q.reward} 💰${q.filtered ? ` · 🤖 Szűrő: ${q.filtered} rossz válasz törölve` : ''}`;
    const box = $('#quiz-opts');
    box.innerHTML = '';
    q.options.forEach((text, pos) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        if (!quiz || quiz.answered) return;
        quiz.answered = true; quiz.chosen = pos;
        SFX.click();
        socket.emit('quizAnswer', { id: q.id, pos });
      };
      box.appendChild(b);
    });
    // Ha épp feladatot csinált, azt bezárjuk – BÉLA nem vár.
    if (modals.task.classList.contains('open')) closeModal('task');
    openModal('quiz');
    SFX.quiz(); vibrate([100, 50, 100]);
  }
  function resolveQuizUI(r) {
    if (!quiz) return;
    const btns = $$('#quiz-opts button');
    btns.forEach((b, i) => {
      if (i === r.rightPos) b.classList.add('right');
      else if (i === quiz.chosen) b.classList.add('wrong');
    });
    quiz.answered = true;
    if (r.correct) { SFX.success(); vibrate(60); } else { SFX.fail(); vibrate([150, 60, 150]); }
    setTimeout(() => closeModal('quiz'), 1500);
  }
  function updateQuizTimer(now) {
    if (!quiz) return;
    const f = Math.max(0, (quiz.end - now) / quiz.total);
    $('#quiz-timer-fill').style.transform = `scaleX(${Math.round(f * 200) / 200})`;
  }

  // Vége képernyő
  function renderEnd() {
    const r = lastResult;
    if (!r) return;
    const title = $('#end-title');
    title.className = 'end-title ' + (r.win ? 'win' : 'lose');
    title.innerHTML = r.win ? '🎉 MEGÉRKEZTETEK!' : '💥 A HAJÓ<br>FELROBBANT';
    const m = Math.floor(r.durationSec / 60), s = r.durationSec % 60;
    $('#end-sub').textContent = r.win
      ? `A legénység túlélte a műszakot ${m}:${String(s).padStart(2, '0')} alatt. BÉLA-9000 büszke rátok (kicsit).`
      : `${r.progress}%-ig jutottatok. BÉLA-9000 már írja a jegyzőkönyvet…`;
    const st = r.stats;
    $('#end-stats').innerHTML = `<div class="stat-grid">
      <div class="stat"><b>${st.tasks}</b><small>feladat kész</small></div>
      <div class="stat"><b>${st.emFixed}/${st.emFixed + st.emFailed}</b><small>riasztás megmentve</small></div>
      <div class="stat"><b>${st.quizRight}/${st.quizRight + st.quizWrong}</b><small>BÉLA-kvíz helyes</small></div>
      <div class="stat"><b>${st.earned} 💰</b><small>összes bevétel</small></div></div>`;
    renderShame($('#end-shame'), r.players);
    const greedy = r.players.slice().sort((a, b) => b.spentSelf - a.spentSelf)[0];
    const hero = r.players.slice().sort((a, b) => b.spentTeam - a.spentTeam)[0];
    let aw = '';
    if (greedy && greedy.spentSelf > 0) aw += `<div class="award">🐷 Az est Kassza-Fosztogatója: <b>${esc(greedy.name)}</b> (${greedy.spentSelf} 💰 magára)</div>`;
    if (hero && hero.spentTeam > 0) aw += `<div class="award">🦸 Csapatjátékos Díj: <b>${esc(hero.name)}</b> (${hero.spentTeam} 💰 a csapatra)</div>`;
    $('#end-shame').insertAdjacentHTML('beforeend', aw);
  }
  $('#btn-restart').addEventListener('click', () => { SFX.click(); socket.emit('restart'); });

  // ------------------------------------------------------------------ Toast
  function toast(text, kind = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'wave' ? 3500 : 3800);
  }

  // ------------------------------------------------------------------ Fő ciklus
  // Képkocka-ütemező: játék közben legfeljebb ~60 fps (120 Hz-es kijelzőn minden második
  // képkockát kihagyjuk), a lobbiban 30 fps, és ~12 fps, amíg egy ablak takarja a pályát.
  // Lezárt képernyőnél a böngésző magától leállítja a requestAnimationFrame-et.
  let lastFrame = performance.now();
  const previewCanvas = $('#preview');
  function frame(now) {
    requestAnimationFrame(frame);
    const modal = currentScreen === 'game' && anyModalOpen();
    const minGap = currentScreen === 'lobby' ? 32 : modal ? 80 : 15;
    if (now - lastFrame < minGap) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = now / 1000;
    if (currentScreen === 'lobby') {
      drawPreview(previewCanvas, lobbyAvatar, t);
      if (phase === 'countdown' && state) {
        const txt = String(Math.max(1, Math.ceil(leftNow(state.countdownEnd) / 1000)));
        const el = $('#countdown-num');
        if (el.textContent !== txt) el.textContent = txt;
      }
    } else if (currentScreen === 'game' && state) {
      updateMe(dt, now);
      checkPickups();
      checkRat(now);
      updateActionButton();
      render(t, dt, now);
      updateHud(now);
      updateAlerts(now);
      renderShop();
      updateQuizTimer(now);
      // A feladat közben valaki más megcsinálta?
      if (taskStation && !state.tasks.some(x => x.stationId === taskStation)) { closeModal('task'); toast('😤 Valaki megelőzött ennél a feladatnál!', 'bad'); }
      // A javítás közben lejárt / megoldódott a riasztás?
      if (codeStation && !state.ems.some(e => e.mine || e.soloMine)) { closeModal('code'); }
    }
  }
  requestAnimationFrame(frame);
  renderLobbyStatic();
  updateReadyBtn();
  if (profile && profile.name) $('#in-name').value = profile.name;
})();
