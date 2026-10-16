const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const S = require('./public/shared.js');
const QUESTIONS = require('./quiz.js');

// ---------------------------------------------------------------------------
// Hangolható játékparaméterek
// ---------------------------------------------------------------------------
const CONFIG = {
  TICK_MS: 80,
  START_BANK: 50,
  START_HP: 100,

  TASK_REWARD: 35,
  TASK_PROGRESS: 4,               // % / feladat
  PASSIVE_PROGRESS_PER_SEC: 0,    // % / mp (0 = csak feladatokból halad a hajó)
  TASK_RESPAWN_MS: 3500,
  TASK_STATION_COOLDOWN_MS: 9000,

  EMERGENCY_REWARD: 65,
  EMERGENCY_DAMAGE_PCT: 20,       // a max HP %-a
  EMERGENCY_BASE_SEC: 25,
  EMERGENCY_FIRST_DELAY_SEC: 20,
  WAVE_EMERGENCY_INTERVAL_SEC: [35, 29, 23, 18, 15],
  WAVE_MAX_EMERGENCIES: [1, 1, 1, 2, 2],
  WRONG_CODE_PENALTY_SEC: 3,
  EMERGENCY_REWARD_SPLIT: 80,     // osztott kód: két játékos látja a két felét
  EMERGENCY_REWARD_DOUBLE: 110,   // két eszköz kell egyszerre
  SPLIT_CHANCE: 0.35,
  DOUBLE_CHANCE: 0.3,
  DOUBLE_MIN_WAVE: 2,
  DOUBLE_EXTRA_SEC: 10,

  EVENT_FIRST_DELAY_SEC: 50,
  WAVE_EVENT_INTERVAL_SEC: [80, 70, 60, 52, 45],
  EVENT_DURATION_SEC: { blackout: 20, gravity: 15, meteors: 18, rat: 25, swap: 20 },
  METEOR_EVERY_MS: 1400,
  METEOR_WARN_MS: 2000,
  METEOR_RADIUS: 70,
  METEOR_HP_PCT: 3,
  RAT_STEAL_PCT: 30,
  RAT_STEAL_MIN: 30,
  RAT_SPEED: 205,
  RAT_BONUS: 25,

  QUIZ_FIRST_DELAY_SEC: 30,
  QUIZ_INTERVAL_SEC: 45,
  QUIZ_TIME_SEC: 12,
  QUIZ_REWARD: 75,
  QUIZ_BANK_PENALTY: 40,
  QUIZ_HP_PENALTY_PCT: 15,
  SLIME_MS: 5000,

  ITEM_INTERVAL_SEC: 10,
  MAX_FLOOR_ITEMS: 5,
  COIN_INTERVAL_SEC: 6,
  MAX_KANTIN_COINS: 4,
  BONUS_COINS: 20,
  KANTIN_COIN: 5,
  DRINK_MS: 10000,
  GRENADE_SEC: 10,

  SHIELD_MAXHP_PER_LEVEL: 20,
  SHIELD_HEAL_PCT: 25,
  DILATOR_SEC_PER_LEVEL: 8,

  LOBBY_PRUNE_MS: 30000,
};

// Opcionális felülírás teszteléshez/hangoláshoz: CONFIG_JSON='{"TASK_PROGRESS":2}' npm start
if (process.env.CONFIG_JSON) Object.assign(CONFIG, JSON.parse(process.env.CONFIG_JSON));

const PORT = process.env.PORT || 3000;

// Szoba-PIN: Renderen a GAME_PIN környezeti változóból jön; ha nincs megadva, induláskor generálunk egyet.
const PIN_FROM_ENV = !!(process.env.GAME_PIN && process.env.GAME_PIN.trim());
const GAME_PIN = PIN_FROM_ENV ? process.env.GAME_PIN.trim() : String(1000 + Math.floor(Math.random() * 9000));
// Kizárás eszközönként (ip + playerId), mert egy buli összes telefonja ugyanazon a Wi-Fi IP-n van.
// Egy IP-re összesítve is van egy jóval magasabb plafon, hogy ne lehessen playerId-cserével végigpróbálni.
const PIN_MAX_FAILS_DEVICE = 8;
const PIN_MAX_FAILS_IP = 40;
const PIN_LOCK_MS = 5 * 60 * 1000;
const pinFails = new Map(); // kulcs -> { count, until }
function pinLockedFor(key, now) {
  const f = pinFails.get(key);
  return f && f.until > now ? f.until - now : 0;
}
function pinFail(key, max, now) {
  const f = pinFails.get(key) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= max) { f.count = 0; f.until = now + PIN_LOCK_MS; }
  pinFails.set(key, f);
}
// Csak a PIN-nel belépett socketek kapnak közös eseményeket.
const crew = { emit: (...args) => io.to('crew').emit(...args) };
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 25000 });

app.get('/api/keepalive', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, t: Date.now(), phase: game.phase, players: connectedPlayers().length });
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true }));

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let uid = 1;
const nextId = p => p + (uid++).toString(36);
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function cleanName(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 14);
}

// ---------------------------------------------------------------------------
// Játékállapot
// ---------------------------------------------------------------------------
const game = {
  phase: 'lobby', // lobby | countdown | playing | ended
  countdownEnd: 0,
  players: new Map(),
};

function resetRound() {
  Object.assign(game, {
    bank: CONFIG.START_BANK,
    hp: CONFIG.START_HP,
    maxHp: CONFIG.START_HP,
    progress: 0,
    wave: 1,
    team: { shield: 0, dilator: 0, teleport: 0, bela: 0 },
    tasks: [],
    stationCooldown: {},
    nextTaskAt: 0,
    emergencies: [],
    nextEmergencyAt: 0,
    items: [],
    nextItemAt: 0,
    nextCoinAt: 0,
    quiz: null,
    nextQuizAt: 0,
    event: null,
    nextEventAt: 0,
    lastEventType: null,
    strikes: [],
    nextStrikeAt: 0,
    rat: null,
    swapBackup: null,
    lastTaskType: null,
    quizDeck: [],
    startedAt: 0,
    endedAt: 0,
    result: null,
    stats: { tasks: 0, emFixed: 0, emFailed: 0, emSpawned: 0, quizRight: 0, quizWrong: 0, earned: 0, ratCaught: 0, meteorHits: 0 },
  });
}
resetRound();

let nextPlayerN = 1;
function newPlayer(id) {
  return {
    id,
    n: nextPlayerN++,   // rövid szám-azonosító a pozíció-üzenetekhez
    hidden: false,      // a telefon képernyője le van zárva / háttérben van
    name: '',
    socketId: null,
    connected: false,
    lastSeen: Date.now(),
    ready: false,
    inGame: false,
    avatar: {
      head: pick(S.AVATAR.heads).id,
      hat: pick(S.AVATAR.hats).id,
      face: pick(S.AVATAR.faces).id,
      color: pick(S.AVATAR.colors),
    },
    tool: null,
    x: S.SPAWN.x, y: S.SPAWN.y, dir: 1, moving: false,
    up: { boots: 0, gloves: 0, magnet: 0, cape: 0 },
    items: [null, null],
    spentSelf: 0, spentTeam: 0, earned: 0,
    boostUntil: 0, slowUntil: 0,
    bubble: null,
    lastBubbleAt: 0,
  };
}

function resetPlayerForRound(p, i) {
  p.up = { boots: 0, gloves: 0, magnet: 0, cape: 0 };
  p.items = [null, null];
  p.spentSelf = 0; p.spentTeam = 0; p.earned = 0;
  p.boostUntil = 0; p.slowUntil = 0; p.bubble = null;
  const a = (i / 5) * Math.PI * 2;
  p.x = S.SPAWN.x + Math.cos(a) * 60;
  p.y = S.SPAWN.y + Math.sin(a) * 60;
}

const connectedPlayers = () => [...game.players.values()].filter(p => p.connected);
const activePlayers = () => [...game.players.values()].filter(p => p.connected && p.inGame);

function takenTools(exceptId) {
  const set = new Set();
  for (const p of game.players.values()) if (p.id !== exceptId && p.tool) set.add(p.tool);
  return set;
}
function firstFreeTool(exceptId) {
  const taken = takenTools(exceptId);
  const t = S.TOOLS.find(t => !taken.has(t.id));
  return t ? t.id : null;
}

function setBubble(p, text, ms = 3000) {
  p.bubble = { text: String(text).slice(0, 40), until: Date.now() + ms };
}

function toast(text, kind = 'info', extra = {}) {
  crew.emit('toast', { text, kind, ...extra });
}

function addMoney(amount, p) {
  game.bank += amount;
  game.stats.earned += amount;
  if (p) p.earned += amount;
}

function damage(pct, reason) {
  const dmg = Math.round(game.maxHp * pct / 100);
  game.hp = Math.max(0, game.hp - dmg);
  crew.emit('shake', { reason, dmg });
}

// ---------------------------------------------------------------------------
// Kör vezérlése
// ---------------------------------------------------------------------------
function startGame() {
  resetRound();
  const now = Date.now();
  game.phase = 'playing';
  game.startedAt = now;
  // A lecsatlakozott lobbi-játékosok kiesnek.
  for (const p of [...game.players.values()]) if (!p.connected) game.players.delete(p.id);
  let i = 0;
  for (const p of game.players.values()) {
    p.inGame = true;
    p.ready = false;
    if (!p.tool) p.tool = firstFreeTool(p.id);
    resetPlayerForRound(p, i++);
    if (p.socketId) io.to(p.socketId).emit('spawn', { x: p.x, y: p.y });
  }
  game.nextEmergencyAt = now + CONFIG.EMERGENCY_FIRST_DELAY_SEC * 1000;
  game.nextQuizAt = now + CONFIG.QUIZ_FIRST_DELAY_SEC * 1000;
  game.nextEventAt = now + CONFIG.EVENT_FIRST_DELAY_SEC * 1000;
  game.nextItemAt = now + 4000;
  game.nextCoinAt = now + 1000;
  game.nextTaskAt = now;
  crew.emit('started');
  toast('🚀 INDUL A MŰSZAK! Csináljátok a sárga feladatokat, és kiabáljatok egymásnak a riasztásoknál!', 'good');
}

function endGame(win) {
  if (game.phase !== 'playing') return;
  restoreSwap();
  game.phase = 'ended';
  game.endedAt = Date.now();
  const players = [...game.players.values()].filter(p => p.inGame).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, spentSelf: p.spentSelf, spentTeam: p.spentTeam, earned: p.earned, up: p.up,
  }));
  game.result = {
    win,
    durationSec: Math.round((game.endedAt - game.startedAt) / 1000),
    progress: Math.round(game.progress),
    bank: game.bank,
    stats: { ...game.stats },
    players,
  };
  crew.emit('ended', game.result);
}

function backToLobby() {
  game.phase = 'lobby';
  resetRound();
  for (const p of [...game.players.values()]) {
    if (!p.connected) { game.players.delete(p.id); continue; }
    p.inGame = false;
    p.ready = false;
    resetPlayerForRound(p, 0);
  }
  crew.emit('lobby');
}

// ---------------------------------------------------------------------------
// Feladatok, vészhelyzetek, tárgyak, kvíz
// ---------------------------------------------------------------------------
function targetTaskCount() {
  return clamp(activePlayers().length, 2, 4);
}

function spawnTask(now) {
  const used = new Set(game.tasks.map(t => t.stationId));
  const free = S.TASK_STATIONS.filter(s => !used.has(s.id) && !(game.stationCooldown[s.id] > now));
  if (!free.length) return;
  // Inkább olyan szobába, ahol még nincs aktív feladat.
  const busyRooms = new Set(game.tasks.map(t => S.TASK_STATIONS.find(s => s.id === t.stationId).room));
  const preferred = free.filter(s => !busyRooms.has(s.room));
  const st = pick(preferred.length ? preferred : free);
  const types = S.TASK_TYPES.filter(t => t.id !== game.lastTaskType && !game.tasks.some(x => x.type === t.id));
  const type = pick(types.length ? types : S.TASK_TYPES).id;
  game.lastTaskType = type;
  game.tasks.push({ stationId: st.id, type });
}

function emergencyDurationSec() {
  return CONFIG.EMERGENCY_BASE_SEC + game.team.dilator * CONFIG.DILATOR_SEC_PER_LEVEL;
}

const holderOf = tool => activePlayers().find(p => p.tool === tool);
const nameOf = id => { const p = game.players.get(id); return p ? p.name : '???'; };
const toolsText = tools => tools.map(t => S.toolById(t).emoji).join(' + ');

// Három fajta riasztás:
//  normal – egy eszköz, a többiek látják a teljes kódot
//  split  – egy eszköz, de a kód színét csak egy, a számát csak egy másik játékos látja
//  double – két eszköz kell egyszerre ugyanannál az állomásnál
function spawnEmergency(now) {
  const active = activePlayers();
  const busyTools = new Set(game.emergencies.flatMap(e => e.tools));
  const candidates = shuffle(active.filter(p => p.tool && !busyTools.has(p.tool)));
  if (!candidates.length) return false;
  let kind = 'normal';
  const r = Math.random();
  if (game.wave >= CONFIG.DOUBLE_MIN_WAVE && candidates.length >= 2 && active.length >= 3 && r < CONFIG.DOUBLE_CHANCE) kind = 'double';
  else if (active.length >= 3 && game.stats.emSpawned > 0 && r < CONFIG.DOUBLE_CHANCE + CONFIG.SPLIT_CHANCE) kind = 'split';
  const chosen = kind === 'double' ? candidates.slice(0, 2) : [candidates[0]];

  const busyStations = new Set(game.emergencies.map(e => e.stationId));
  const holderRooms = new Set(chosen.map(h => S.roomAt(h.x, h.y)).filter(Boolean).map(rm => rm.id));
  let stations = S.EMERGENCY_STATIONS.filter(st => !busyStations.has(st.id));
  const notHere = stations.filter(st => !holderRooms.has(st.room));
  if (notHere.length) stations = notHere;
  if (!stations.length) return false;
  const st = pick(stations);
  const dur = emergencyDurationSec() + (kind === 'double' ? CONFIG.DOUBLE_EXTRA_SEC : 0);
  const color = pick(S.CODE_COLORS).id, num = String(randInt(10, 99));
  const em = {
    id: nextId('em'),
    kind,
    stationId: st.id,
    room: st.room,
    tools: chosen.map(h => h.tool),
    tool: chosen[0].tool,
    color, num,
    code: color + '-' + num,
    seers: null,
    expiresAt: now + dur * 1000,
    duration: dur * 1000,
  };
  if (kind === 'split') fixSeers(em);
  game.emergencies.push(em);
  game.stats.emSpawned++;
  crew.emit('alarm', { tools: em.tools, kind: em.kind });
  return true;
}

// Osztott kódnál két "látó" kell, akik nem az eszköz tulajdonosai. Ha valaki kiesik
// (lecsatlakozik, vagy BÉLA eszközcseréje miatt tulajdonos lett), újat választunk.
function fixSeers(em) {
  if (em.kind !== 'split') return;
  const valid = id => { const p = game.players.get(id); return p && p.connected && p.inGame && !em.tools.includes(p.tool); };
  const keep = em.seers ? [em.seers.color, em.seers.num].map(id => (valid(id) ? id : null)) : [null, null];
  if (keep[0] && keep[1] && keep[0] !== keep[1]) return;
  const pool = shuffle(activePlayers().filter(p => !em.tools.includes(p.tool) && !keep.includes(p.id)).map(p => p.id));
  if (!keep[0]) keep[0] = pool.shift() || null;
  if (!keep[1] || keep[1] === keep[0]) keep[1] = pool.shift() || null;
  if (!keep[0] || !keep[1]) { em.kind = 'normal'; em.seers = null; return; } // nincs elég játékos: mindenki látja
  em.seers = { color: keep[0], num: keep[1] };
}

function emergencyReward(em) {
  return em.kind === 'double' ? CONFIG.EMERGENCY_REWARD_DOUBLE : em.kind === 'split' ? CONFIG.EMERGENCY_REWARD_SPLIT : CONFIG.EMERGENCY_REWARD;
}

// ---------------------------------------------------------------------------
// Káosz-események
// ---------------------------------------------------------------------------
function startEvent(now) {
  const holders = activePlayers().filter(p => p.tool);
  const types = Object.keys(S.EVENTS).filter(t =>
    t !== game.lastEventType &&
    (t !== 'swap' || holders.length >= 2) &&
    (t !== 'rat' || game.bank >= 20));
  if (!types.length) return;
  const type = pick(types);
  const dur = CONFIG.EVENT_DURATION_SEC[type] * 1000;
  game.event = { type, endsAt: now + dur, duration: dur };
  game.lastEventType = type;
  const info = S.EVENTS[type];
  let extra = '';

  if (type === 'meteors') game.nextStrikeAt = now + 600;

  if (type === 'rat') {
    const stolen = Math.min(game.bank, Math.max(CONFIG.RAT_STEAL_MIN, Math.round(game.bank * CONFIG.RAT_STEAL_PCT / 100)));
    game.bank -= stolen;
    // A játékosoktól legtávolabbi csomópontból indul.
    const ps = activePlayers();
    const far = id => Math.min(...ps.map(p => dist(p, S.RAT_NODES[id])), 99999);
    const startNode = Object.keys(S.RAT_NODES).sort((a, b) => far(b) - far(a))[0];
    const n = S.RAT_NODES[startNode];
    game.rat = { x: n.x, y: n.y, cur: startNode, next: pick(n.n), stolen };
    extra = ` (-${stolen} 💰)`;
  }

  if (type === 'swap') {
    game.swapBackup = new Map(holders.map(p => [p.id, p.tool]));
    // Elforgatjuk a listát, így senki sem kapja vissza a sajátját.
    const order = shuffle(holders.slice());
    order.forEach((p, i) => { p.tool = game.swapBackup.get(order[(i + 1) % order.length].id); });
    for (const em of game.emergencies) fixSeers(em);
  }

  toast(`${info.emoji} ${info.name}! ${info.desc}${extra}`, 'event');
  crew.emit('event', { type });
}

function restoreSwap() {
  if (!game.swapBackup) return;
  for (const [id, tool] of game.swapBackup) { const p = game.players.get(id); if (p) p.tool = tool; }
  game.swapBackup = null;
  for (const em of game.emergencies) fixSeers(em);
}

function endEvent(now) {
  const ev = game.event;
  if (!ev) return;
  if (ev.type === 'swap') { restoreSwap(); toast('🤖 BÉLA megnyugodott – mindenki visszakapta a saját eszközét.', 'info'); }
  if (ev.type === 'rat' && game.rat) toast(`🐀 A patkány elmenekült ${game.rat.stolen} 💰-val! 😭`, 'bad');
  if (ev.type === 'blackout') toast('💡 Visszajött az áram!', 'info');
  if (ev.type === 'gravity') toast('🧭 A gravitáció helyreállt.', 'info');
  game.event = null;
  game.rat = null;
  game.strikes = [];
  game.nextEventAt = now + CONFIG.WAVE_EVENT_INTERVAL_SEC[game.wave - 1] * 1000;
}

function updateMeteors(now) {
  const ev = game.event;
  if (ev && ev.type === 'meteors' && now >= game.nextStrikeAt && ev.endsAt - now > CONFIG.METEOR_WARN_MS) {
    game.nextStrikeAt = now + CONFIG.METEOR_EVERY_MS;
    const ps = shuffle(activePlayers()).slice(0, 2);
    for (const p of ps) {
      let x = p.x + rand(-80, 80), y = p.y + rand(-80, 80);
      if (!S.walkable(x, y, 0)) { x = p.x; y = p.y; }
      game.strikes.push({ id: nextId('m'), x, y, r: CONFIG.METEOR_RADIUS, impactAt: now + CONFIG.METEOR_WARN_MS });
    }
  }
  for (const m of [...game.strikes]) {
    if (now < m.impactAt) continue;
    game.strikes = game.strikes.filter(x => x !== m);
    const hits = activePlayers().filter(p => dist(p, m) < m.r);
    for (const p of hits) {
      game.hp = Math.max(0, game.hp - Math.round(game.maxHp * CONFIG.METEOR_HP_PCT / 100));
      p.slowUntil = Math.max(p.slowUntil, now + 1500);
      setBubble(p, pick(['🔥 AÚÚÚ!', '☄️ Telibe kaptam!', '😵 Csillagokat látok…']), 2000);
      game.stats.meteorHits++;
    }
    crew.emit('fx', { kind: 'meteor', x: m.x, y: m.y, hit: hits.map(p => p.id) });
  }
}

function updateRat(dt) {
  const r = game.rat;
  if (!r) return;
  let step = CONFIG.RAT_SPEED * dt;
  while (step > 0) {
    const target = S.RAT_NODES[r.next];
    const d = dist(r, target);
    if (d > step) { r.x += (target.x - r.x) / d * step; r.y += (target.y - r.y) / d * step; break; }
    r.x = target.x; r.y = target.y; step -= d;
    // Következő csomópont: lehetőleg nem vissza, és inkább a játékosoktól távolodva.
    const node = S.RAT_NODES[r.next];
    let opts = node.n.filter(n => n !== r.cur);
    if (!opts.length) opts = node.n;
    const ps = activePlayers();
    const safety = id => Math.min(...ps.map(p => dist(p, S.RAT_NODES[id])), 99999);
    const next = Math.random() < 0.7 ? opts.sort((a, b) => safety(b) - safety(a))[0] : pick(opts);
    r.cur = r.next; r.next = next;
  }
}

function randomPointInRoom(room, margin = 60) {
  for (let i = 0; i < 30; i++) {
    const x = rand(room.x + margin, room.x + room.w - margin);
    const y = rand(room.y + margin, room.y + room.h - margin);
    const tooClose = [S.TERMINAL, ...S.TASK_STATIONS, ...S.EMERGENCY_STATIONS].some(s => dist(s, { x, y }) < 55);
    if (!tooClose) return { x, y };
  }
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

function spawnItem(now) {
  const nonCoin = game.items.filter(i => i.type !== 'coin').length;
  if (nonCoin >= CONFIG.MAX_FLOOR_ITEMS) return;
  const r = Math.random();
  const type = r < 0.36 ? 'drink' : r < 0.66 ? 'grenade' : 'coins';
  const room = pick(S.ROOMS.filter(r => r.id !== 'kantin'));
  game.items.push({ id: nextId('it'), type, ...randomPointInRoom(room) });
}

function spawnKantinCoin() {
  const coins = game.items.filter(i => i.type === 'coin').length;
  if (coins >= CONFIG.MAX_KANTIN_COINS) return;
  game.items.push({ id: nextId('c'), type: 'coin', ...randomPointInRoom(S.roomById('kantin'), 50) });
}

function nextQuestion() {
  if (!game.quizDeck.length) game.quizDeck = shuffle(QUESTIONS.map((_, i) => i));
  return game.quizDeck.pop();
}

function startQuiz(now) {
  const ps = activePlayers();
  if (!ps.length) return;
  const p = pick(ps);
  const qi = nextQuestion();
  const Q = QUESTIONS[qi];
  let options = Q.a.map((text, i) => ({ i, text }));
  const remove = Math.min(2, game.team.bela);
  if (remove) {
    const wrong = shuffle(options.filter(o => o.i !== 0)).slice(0, remove);
    options = options.filter(o => !wrong.includes(o));
  }
  shuffle(options);
  game.quiz = {
    id: nextId('q'),
    playerId: p.id,
    question: Q.q,
    options,
    expiresAt: now + CONFIG.QUIZ_TIME_SEC * 1000,
  };
  if (p.socketId) {
    io.to(p.socketId).emit('quiz', {
      id: game.quiz.id,
      question: Q.q,
      options: options.map(o => o.text),
      timeMs: CONFIG.QUIZ_TIME_SEC * 1000,
      reward: quizReward(),
      filtered: remove,
    });
  }
}

function quizReward() {
  return CONFIG.QUIZ_REWARD * (game.team.bela > 0 ? 2 : 1);
}

function resolveQuiz(correct, timeout) {
  const q = game.quiz;
  const rightPos = q ? q.options.findIndex(o => o.i === 0) : -1;
  if (!q) return;
  game.quiz = null;
  const p = game.players.get(q.playerId);
  const name = p ? p.name : '???';
  const right = q.options.find(o => o.i === 0);
  if (correct) {
    const r = quizReward();
    addMoney(r, p);
    game.stats.quizRight++;
    if (p) setBubble(p, '🧠 Okos vagyok!', 2500);
    toast(`🤖 BÉLA-9000: ${name} helyesen válaszolt! +${r} 💰`, 'good', { money: r });
  } else {
    game.stats.quizWrong++;
    let penalty;
    if (game.bank >= CONFIG.QUIZ_BANK_PENALTY) {
      game.bank -= CONFIG.QUIZ_BANK_PENALTY;
      penalty = `-${CONFIG.QUIZ_BANK_PENALTY} 💰`;
    } else {
      damage(CONFIG.QUIZ_HP_PENALTY_PCT, 'quiz');
      penalty = `-${CONFIG.QUIZ_HP_PENALTY_PCT}% HP`;
    }
    if (p) {
      p.slowUntil = Date.now() + CONFIG.SLIME_MS;
      setBubble(p, timeout ? '😴 Elaludtam...' : '🤡 Hupsz...', 3000);
    }
    toast(`🤖 BÉLA-9000: ${name} ${timeout ? 'kifutott az időből' : 'rosszul válaszolt'}! ${penalty} + űr-nyálka! (Helyes: ${right ? right.text : '?'})`, 'bad');
  }
  if (p && p.socketId) io.to(p.socketId).emit('quizResult', { correct, rightPos });
}

// ---------------------------------------------------------------------------
// Fő ciklus
// ---------------------------------------------------------------------------
let lastTick = Date.now();
function tick() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  if (game.phase === 'lobby') {
    for (const p of [...game.players.values()]) {
      if (!p.connected && now - p.lastSeen > CONFIG.LOBBY_PRUNE_MS) game.players.delete(p.id);
    }
  }

  if (game.phase === 'countdown') {
    const conn = connectedPlayers();
    if (!conn.length || !conn.every(p => p.ready)) { game.phase = 'lobby'; crew.emit('countdownCancel'); }
    else if (now >= game.countdownEnd) startGame();
  }

  if (game.phase === 'playing') {
    // Passzív haladás
    game.progress = Math.min(100, game.progress + CONFIG.PASSIVE_PROGRESS_PER_SEC * dt);

    // Hullám
    const wave = clamp(Math.floor(game.progress / 20) + 1, 1, 5);
    if (wave > game.wave) {
      game.wave = wave;
      const msgs = ['', '', '🌊 2. HULLÁM! Mostantól DUPLA-ESZKÖZÖS riasztások is jöhetnek!', '🌊 3. HULLÁM! A feladatok egyre nehezebbek…', '🌊 4. HULLÁM! Két riasztás is jöhet egyszerre!', '🌊 5. HULLÁM! VÉGSŐ SZAKASZ – mindenki kiabáljon!'];
      toast(msgs[wave], 'wave');
    }

    // Feladatok
    if (game.tasks.length < targetTaskCount() && now >= game.nextTaskAt) {
      spawnTask(now);
      game.nextTaskAt = now + CONFIG.TASK_RESPAWN_MS;
    }

    // Vészhelyzetek lejárata
    for (const em of [...game.emergencies]) {
      if (now >= em.expiresAt) {
        game.emergencies = game.emergencies.filter(e => e !== em);
        game.stats.emFailed++;
        damage(CONFIG.EMERGENCY_DAMAGE_PCT, 'emergency');
        const room = S.roomById(em.room);
        for (const t of em.tools) { const h = holderOf(t); if (h) setBubble(h, '😱 Ezt elszúrtuk!', 3000); }
        toast(`💥 A riasztás lejárt ${room.where.toLowerCase()} (${toolsText(em.tools)})! A hajó -${CONFIG.EMERGENCY_DAMAGE_PCT}% HP-t kapott!`, 'bad');
      }
    }

    for (const em of game.emergencies) fixSeers(em);

    // Káosz-események
    if (game.event && now >= game.event.endsAt) endEvent(now);
    else if (!game.event && now >= game.nextEventAt) startEvent(now);
    updateMeteors(now);
    updateRat(dt);

    // Vészhelyzetek indítása
    if (now >= game.nextEmergencyAt) {
      const max = CONFIG.WAVE_MAX_EMERGENCIES[game.wave - 1];
      if (game.emergencies.length < max) spawnEmergency(now);
      game.nextEmergencyAt = now + CONFIG.WAVE_EMERGENCY_INTERVAL_SEC[game.wave - 1] * 1000;
    }

    // Tárgyak és érmék
    if (now >= game.nextItemAt) { spawnItem(now); game.nextItemAt = now + CONFIG.ITEM_INTERVAL_SEC * 1000; }
    if (now >= game.nextCoinAt) { spawnKantinCoin(); game.nextCoinAt = now + CONFIG.COIN_INTERVAL_SEC * 1000; }

    // Kvíz
    if (game.quiz && now >= game.quiz.expiresAt) resolveQuiz(false, true);
    if (!game.quiz && now >= game.nextQuizAt) {
      startQuiz(now);
      game.nextQuizAt = now + CONFIG.QUIZ_INTERVAL_SEC * 1000;
    }

    // Buborékok lejárata
    for (const p of game.players.values()) if (p.bubble && p.bubble.until < now) p.bubble = null;

    // Vége?
    if (game.hp <= 0) endGame(false);
    else if (game.progress >= 100) endGame(true);
  }

  broadcast(now);
}

// Ritkán változó játékos-adatok (a pozíció külön, a 'pos' üzenetben megy).
function publicPlayer(p, now) {
  return {
    id: p.id, n: p.n, name: p.name, avatar: p.avatar, tool: p.tool, connected: p.connected, ready: p.ready, inGame: p.inGame,
    up: p.up,
    bubble: p.bubble ? p.bubble.text : null,
    boost: p.boostUntil > now, slow: p.slowUntil > now,
    spentSelf: p.spentSelf, spentTeam: p.spentTeam,
  };
}

function emsView(p, solo) {
  return game.emergencies.map(e => {
    const common = { id: e.id, kind: e.kind, tool: e.tool, tools: e.tools, end: e.expiresAt, duration: e.duration };
    if (e.tools.includes(p.tool) && !solo) return { ...common, mine: true };
    let code = e.code, codeHint = null;
    if (e.kind === 'split' && e.seers) {
      const isC = e.seers.color === p.id, isN = e.seers.num === p.id;
      code = (isC ? e.color : '???') + '-' + (isN ? e.num : '??');
      codeHint = isC ? `a számot ${nameOf(e.seers.num)} látja` : isN ? `a színt ${nameOf(e.seers.color)} látja` : `szín: ${nameOf(e.seers.color)}, szám: ${nameOf(e.seers.num)}`;
    }
    return { ...common, mine: false, stationId: e.stationId, room: e.room, code, codeHint, soloMine: e.tools.includes(p.tool) };
  });
}

// Hálózati takarékosság:
//  - 'st'  (megbízható): az állapotot szekciókra bontjuk, és minden telefonnak csak a
//    MEGVÁLTOZOTT szekciókat küldjük. Az időzítők abszolút végidőként mennek (end),
//    így a visszaszámláláshoz nem kell folyamatosan küldeni semmit.
//  - 'pos' (volatile): csak a pozíciók, kompakt tömbként, csak ha változtak (+1 mp-enként
//    egy teljes "kulcskocka"). Volatile: ha a telefon lassú, eldobjuk, nem torlódik fel.
//    Lezárt képernyőjű telefonnak egyáltalán nem küldjük.
let lastPosStr = '', lastPosAt = 0;
function broadcast(now) {
  const solo = activePlayers().length <= 1;
  const shared = {
    meta: { phase: game.phase, countdownEnd: game.phase === 'countdown' ? game.countdownEnd : 0, bank: game.bank, hp: game.hp, maxHp: game.maxHp, progress: Math.round(game.progress * 10) / 10, wave: game.wave, team: game.team },
    roster: [...game.players.values()].map(p => publicPlayer(p, now)),
    tasks: game.tasks,
    items: game.items.map(i => ({ id: i.id, type: i.type, x: Math.round(i.x), y: Math.round(i.y) })),
    quiz: game.quiz ? { playerId: game.quiz.playerId, end: game.quiz.expiresAt } : null,
    event: game.event ? { type: game.event.type, end: game.event.endsAt, duration: game.event.duration, stolen: game.rat ? game.rat.stolen : 0 } : null,
    strikes: game.strikes.map(m => ({ id: m.id, x: Math.round(m.x), y: Math.round(m.y), r: m.r, end: m.impactAt })),
  };
  const sharedStr = {};
  for (const k in shared) sharedStr[k] = JSON.stringify(shared[k]);

  let pos = null;
  if (game.phase === 'playing') {
    const arr = [];
    for (const p of game.players.values()) if (p.inGame) arr.push([p.n, Math.round(p.x), Math.round(p.y), (p.dir < 0 ? 1 : 0) | (p.moving ? 2 : 0)]);
    const r = game.rat ? [Math.round(game.rat.x), Math.round(game.rat.y)] : 0;
    const str = JSON.stringify([arr, r]);
    if (str !== lastPosStr || now - lastPosAt > 1000) { lastPosStr = str; lastPosAt = now; pos = { p: arr, r }; }
  }

  for (const p of game.players.values()) {
    if (!p.connected || !p.socketId) continue;
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) continue;
    const sent = sock.data.sent || (sock.data.sent = {});
    const own = {
      ems: emsView(p, solo),
      me: { items: p.items, boostEnd: p.boostUntil > now ? p.boostUntil : 0, slowEnd: p.slowUntil > now ? p.slowUntil : 0 },
    };
    let out = null;
    for (const k in shared) if (sent[k] !== sharedStr[k]) { (out || (out = { t: now }))[k] = shared[k]; sent[k] = sharedStr[k]; }
    for (const k in own) { const str = JSON.stringify(own[k]); if (sent[k] !== str) { (out || (out = { t: now }))[k] = own[k]; sent[k] = str; } }
    if (out) sock.emit('st', out);
    if (pos && !p.hidden) sock.volatile.emit('pos', pos);
  }
}

setInterval(tick, CONFIG.TICK_MS);
setInterval(() => { const now = Date.now(); for (const [k, f] of pinFails) if (f.until < now && f.count === 0) pinFails.delete(k); }, 60000);

// ---------------------------------------------------------------------------
// Socket események
// ---------------------------------------------------------------------------
io.on('connection', socket => {
  let me = null;
  const playing = () => me && game.phase === 'playing' && me.inGame;

  const ip = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.handshake.address;

  socket.on('hello', data => {
    const id = String((data && data.playerId) || '').slice(0, 64);
    if (!id) return;

    // PIN-ellenőrzés: amíg nem jó, a socket semmit nem kap és semmit nem irányíthat.
    const now = Date.now();
    const devKey = 'dev:' + ip + '|' + id, ipKey = 'ip:' + ip;
    const lockedMs = Math.max(pinLockedFor(devKey, now), pinLockedFor(ipKey, now));
    if (lockedMs) {
      socket.emit('pinRequired', { locked: true, waitSec: Math.ceil(lockedMs / 1000) });
      return;
    }
    const pin = String((data && data.pin) || '').trim();
    if (pin !== GAME_PIN) {
      if (pin) { pinFail(devKey, PIN_MAX_FAILS_DEVICE, now); pinFail(ipKey, PIN_MAX_FAILS_IP, now); }
      socket.emit('pinRequired', { wrong: !!pin, locked: false });
      return;
    }
    pinFails.delete(devKey);
    socket.data.authed = true;
    socket.data.sent = {}; // új kapcsolat: a következő körben teljes állapotot kap
    socket.join('crew');
    let p = game.players.get(id);
    const isNew = !p;
    if (!p) {
      p = newPlayer(id);
      if (game.phase !== 'playing') p.tool = firstFreeTool(id);
      game.players.set(id, p);
    }
    // Egy régi socket kidobása (pl. két fül)
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      if (old) old.emit('kicked');
    }
    p.socketId = socket.id;
    p.connected = true;
    p.hidden = false;
    p.lastSeen = Date.now();
    me = p;
    socket.emit('welcome', {
      isNew,
      config: { quizTime: CONFIG.QUIZ_TIME_SEC },
      you: { id: p.id, name: p.name, avatar: p.avatar, tool: p.tool, inGame: p.inGame, x: p.x, y: p.y, up: p.up, items: p.items },
      phase: game.phase,
      result: game.phase === 'ended' ? game.result : null,
    });
    // Ha épp nála van a kvíz, küldjük újra.
    if (game.quiz && game.quiz.playerId === p.id) {
      socket.emit('quiz', {
        id: game.quiz.id, question: game.quiz.question,
        options: game.quiz.options.map(o => o.text),
        timeMs: game.quiz.expiresAt - Date.now(), reward: quizReward(), filtered: Math.min(2, game.team.bela),
      });
    }
  });

  socket.on('profile', data => {
    if (!me || !data) return;
    if (data.name != null) me.name = cleanName(data.name);
    if (data.avatar) {
      const a = data.avatar;
      if (S.AVATAR.heads.some(h => h.id === a.head)) me.avatar.head = a.head;
      if (S.AVATAR.hats.some(h => h.id === a.hat)) me.avatar.hat = a.hat;
      if (S.AVATAR.faces.some(h => h.id === a.face)) me.avatar.face = a.face;
      if (S.AVATAR.colors.includes(a.color)) me.avatar.color = a.color;
    }
    if (data.tool !== undefined && (game.phase !== 'playing' || !me.inGame)) {
      if (data.tool && S.toolById(data.tool) && !takenTools(me.id).has(data.tool)) me.tool = data.tool;
    }
  });

  socket.on('ready', val => {
    if (!me || (game.phase !== 'lobby' && game.phase !== 'countdown')) return;
    me.ready = !!val;
    if (!me.name) me.name = 'Űrlény-' + randInt(10, 99);
    const conn = connectedPlayers();
    if (game.phase === 'lobby' && conn.length && conn.every(p => p.ready)) {
      game.phase = 'countdown';
      game.countdownEnd = Date.now() + 3500;
    }
  });

  socket.on('joinRunning', () => {
    if (!me || game.phase !== 'playing' || me.inGame) return;
    if (!me.tool) me.tool = firstFreeTool(me.id);
    if (!me.name) me.name = 'Űrlény-' + randInt(10, 99);
    resetPlayerForRound(me, randInt(0, 4));
    me.inGame = true;
    socket.emit('spawn', { x: me.x, y: me.y });
    socket.emit('started');
    toast(`👋 ${me.name} beszállt a műszakba!`, 'info');
  });

  socket.on('move', d => {
    if (!playing() || !d) return;
    const x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!S.walkable(x, y, 0)) return;
    me.x = x; me.y = y;
    me.dir = d.dir < 0 ? -1 : 1;
    me.moving = !!d.moving;
  });

  // A telefon jelzi, ha le van zárva / háttérben van: addig nem küldünk neki pozíciókat.
  socket.on('vis', visible => { if (me) me.hidden = !visible; });

  socket.on('bubble', text => {
    if (!me || typeof text !== 'string') return;
    const now = Date.now();
    if (now - me.lastBubbleAt < 1500) return;
    me.lastBubbleAt = now;
    setBubble(me, text, 2500);
  });

  socket.on('taskDone', d => {
    if (!playing() || !d) return;
    const t = game.tasks.find(t => t.stationId === d.stationId);
    if (!t) { socket.emit('taskResult', { ok: false, msg: 'Valaki gyorsabb volt! 😤' }); return; }
    const st = S.TASK_STATIONS.find(s => s.id === t.stationId);
    if (dist(st, me) > S.INTERACT_RANGE + 60) { socket.emit('taskResult', { ok: false, msg: 'Túl messze vagy!' }); return; }
    game.tasks = game.tasks.filter(x => x !== t);
    game.stationCooldown[st.id] = Date.now() + CONFIG.TASK_STATION_COOLDOWN_MS;
    addMoney(CONFIG.TASK_REWARD, me);
    game.progress = Math.min(100, game.progress + CONFIG.TASK_PROGRESS);
    game.stats.tasks++;
    setBubble(me, pick(['💪 Kész!', '😎 Profi vagyok', '✨ Easy', '🛠️ Megjavítva!']), 2000);
    socket.emit('taskResult', { ok: true, msg: `+${CONFIG.TASK_REWARD} 💰  +${CONFIG.TASK_PROGRESS}% út` });
    crew.emit('fx', { kind: 'money', x: st.x, y: st.y, text: `+${CONFIG.TASK_REWARD} 💰` });
  });

  socket.on('emCheck', d => {
    if (!playing() || !d) return;
    const st = S.EMERGENCY_STATIONS.find(s => s.id === d.stationId);
    if (!st) return;
    const tool = S.toolById(me.tool);
    if (!tool) { socket.emit('emCheckResult', { ok: false, msg: 'Nincs eszköz a hátizsákodban!' }); return; }
    if (dist(st, me) > S.INTERACT_RANGE + 60) { socket.emit('emCheckResult', { ok: false, msg: 'Menj közelebb a piros állomáshoz!' }); return; }
    const em = game.emergencies.find(e => e.stationId === st.id && e.tools.includes(me.tool));
    if (!em) {
      setBubble(me, '🤔 Itt nincs semmi baj...', 2000);
      socket.emit('emCheckResult', { ok: false, msg: `Ennél az állomásnál most nincs dolga ennek: ${tool.emoji} ${tool.name}. Kérdezd a csapatot, hol kellesz!` });
      return;
    }
    socket.emit('emCheckResult', { ok: true, stationId: st.id, room: st.room, tool: me.tool, tools: em.tools, kind: em.kind });
  });

  socket.on('emCode', d => {
    if (!playing() || !d) return;
    const em = game.emergencies.find(e => e.stationId === d.stationId && e.tools.includes(me.tool));
    if (!em) { socket.emit('emCodeResult', { ok: false, done: true, msg: 'Ez a riasztás már nem aktív.' }); return; }
    const st = S.EMERGENCY_STATIONS.find(s => s.id === em.stationId);
    if (dist(st, me) > S.INTERACT_RANGE + 80) { socket.emit('emCodeResult', { ok: false, msg: 'Túl messze vagy!' }); return; }
    if (em.kind === 'double') {
      const missing = em.tools.filter(t => t !== me.tool).filter(t => { const h = holderOf(t); return !h || dist(st, h) > S.INTERACT_RANGE + 80; });
      if (missing.length) {
        const t = S.toolById(missing[0]), h = holderOf(missing[0]);
        socket.emit('emCodeResult', { ok: false, msg: `Két eszköz kell EGYSZERRE! Hívd ide: ${t.emoji} ${h ? h.name : '???'}` });
        return;
      }
    }
    const code = String(d.code || '').toUpperCase().replace(/\s/g, '');
    if (code !== em.code) {
      em.expiresAt -= CONFIG.WRONG_CODE_PENALTY_SEC * 1000;
      setBubble(me, '🙈 Rossz kód!', 2000);
      socket.emit('emCodeResult', { ok: false, msg: `Hibás kód! -${CONFIG.WRONG_CODE_PENALTY_SEC} mp` });
      return;
    }
    game.emergencies = game.emergencies.filter(e => e !== em);
    const reward = emergencyReward(em);
    addMoney(reward, me);
    game.stats.emFixed++;
    const heroes = em.tools.map(holderOf).filter(Boolean);
    for (const h of heroes) setBubble(h, '🦸 MEGMENTETTEM A HAJÓT!', 3000);
    const room = S.roomById(em.room);
    socket.emit('emCodeResult', { ok: true, done: true, msg: `+${reward} 💰` });
    for (const h of heroes) if (h !== me && h.socketId) io.to(h.socketId).emit('emCodeResult', { ok: true, done: true, msg: `+${reward} 💰` });
    toast(`✅ ${heroes.map(h => h.name).join(' és ')} megjavította a riasztást ${room.where.toLowerCase()} ${toolsText(em.tools)}! +${reward} 💰`, 'good', { money: reward });
  });

  socket.on('catchRat', () => {
    if (!playing() || !game.rat) return;
    if (dist(game.rat, me) > 70) return;
    const back = game.rat.stolen + CONFIG.RAT_BONUS;
    addMoney(back, me);
    game.stats.ratCaught++;
    crew.emit('fx', { kind: 'rat', x: game.rat.x, y: game.rat.y, text: `+${back} 💰` });
    game.rat = null;
    setBubble(me, '🐀 MEGVAGY!', 2500);
    toast(`🐀 ${me.name} elkapta a patkányt! Visszaszerezve: ${back} 💰 (+${CONFIG.RAT_BONUS} jutalom)`, 'good', { money: back });
    endEvent(Date.now());
  });

  socket.on('pickup', d => {
    if (!playing() || !d) return;
    const it = game.items.find(i => i.id === d.id);
    if (!it) return;
    const radius = 40 + me.up.magnet * 70 + 50;
    if (dist(it, me) > radius) return;
    if (it.type === 'coin' || it.type === 'coins') {
      const amount = it.type === 'coin' ? CONFIG.KANTIN_COIN : CONFIG.BONUS_COINS;
      addMoney(amount, me);
      game.items = game.items.filter(i => i !== it);
      crew.emit('fx', { kind: 'pickup', id: it.id, x: it.x, y: it.y, to: me.id, text: `+${amount} 💰`, emoji: S.ITEMS[it.type].emoji });
      return;
    }
    const slot = me.items.indexOf(null);
    if (slot === -1) {
      if (Date.now() - me.lastBubbleAt > 3000) { me.lastBubbleAt = Date.now(); setBubble(me, '🎒 Tele a hátizsák!', 1500); }
      return;
    }
    me.items[slot] = it.type;
    game.items = game.items.filter(i => i !== it);
    crew.emit('fx', { kind: 'pickup', id: it.id, x: it.x, y: it.y, to: me.id, text: S.ITEMS[it.type].name, emoji: S.ITEMS[it.type].emoji });
  });

  socket.on('useItem', slot => {
    if (!playing()) return;
    const type = me.items[slot];
    if (!type) return;
    me.items[slot] = null;
    if (type === 'drink') {
      me.boostUntil = Date.now() + CONFIG.DRINK_MS;
      setBubble(me, '🥤 TURBÓÓÓÓ!', 2500);
    } else if (type === 'grenade') {
      for (const em of game.emergencies) em.expiresAt += CONFIG.GRENADE_SEC * 1000;
      setBubble(me, '💣 Fagyasztás!', 2500);
      toast(`💣 ${me.name} fagyasztó gránátot dobott! +${CONFIG.GRENADE_SEC} mp minden aktív riasztásra!`, 'info');
    }
  });

  socket.on('buy', key => {
    if (!playing()) return;
    const def = S.UPGRADES[key];
    if (!def) return;
    const isSelf = def.tab === 'self';
    const level = isSelf ? me.up[key] : game.team[key];
    if (level >= def.prices.length) { socket.emit('buyResult', { ok: false, msg: 'Már maximális szinten van!' }); return; }
    const price = def.prices[level];
    if (game.bank < price) { socket.emit('buyResult', { ok: false, msg: 'Nincs elég pénz a Közös Kasszában!' }); return; }
    game.bank -= price;
    const lvlText = def.prices.length > 1 ? ` (Lv ${level + 1})` : '';
    if (isSelf) {
      me.up[key]++;
      me.spentSelf += price;
      setBubble(me, '💸 ÖNZŐ!', 5000);
      crew.emit('snitch', { id: me.id, name: me.name, price, upgrade: def.emoji + ' ' + def.name + lvlText });
    } else {
      game.team[key]++;
      me.spentTeam += price;
      if (key === 'shield') {
        game.maxHp += CONFIG.SHIELD_MAXHP_PER_LEVEL;
        game.hp = Math.min(game.maxHp, game.hp + Math.round(game.maxHp * CONFIG.SHIELD_HEAL_PCT / 100));
      }
      if (key === 'dilator') {
        for (const em of game.emergencies) { em.expiresAt += CONFIG.DILATOR_SEC_PER_LEVEL * 1000; em.duration += CONFIG.DILATOR_SEC_PER_LEVEL * 1000; }
      }
      setBubble(me, '🤝 A csapatért!', 3000);
      toast(`🤝 ${me.name} csapat-fejlesztést vett: ${def.emoji} ${def.name}${lvlText} (-${price} 💰)`, 'team');
    }
    socket.emit('buyResult', { ok: true, msg: `Megvetted: ${def.name}${lvlText}` });
  });

  socket.on('quizAnswer', d => {
    if (!me || !game.quiz || !d) return;
    if (game.quiz.playerId !== me.id || game.quiz.id !== d.id) return;
    const opt = game.quiz.options[d.pos];
    resolveQuiz(!!opt && opt.i === 0, false);
  });

  socket.on('restart', () => {
    if (game.phase === 'ended') backToLobby();
  });

  socket.on('surrender', () => {
    if (!playing()) return;
    toast(`🏳️ ${me.name} feladta a küldetést. Új kör jön!`, 'bad');
    endGame(false);
  });

  socket.on('disconnect', () => {
    if (me && me.socketId === socket.id) {
      me.connected = false;
      me.socketId = null;
      me.moving = false;
      me.ready = false;
      me.lastSeen = Date.now();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Csillagközi Műszak fut: http://0.0.0.0:${PORT}`);
  console.log(PIN_FROM_ENV ? '🔒 PIN beállítva (GAME_PIN).' : `🔒 Generált PIN: ${GAME_PIN}  (állítsd be fixen: GAME_PIN=1234 npm start)`);
});
