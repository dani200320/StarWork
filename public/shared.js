// Közös definíciók: a szerver (require) és a kliens (window.SHARED) is ezt használja.
(function (root) {
  const WORLD = { w: 2000, h: 1400 };

  const ROOMS = [
    { id: 'kantin',  name: 'Kantin',          where: 'A KANTINBAN',         x: 750,  y: 520,  w: 500, h: 380, color: '#22d3ee' },
    { id: 'hid',     name: 'Parancsnoki Híd', where: 'A PARANCSNOKI HÍDON', x: 780,  y: 80,   w: 440, h: 300, color: '#a78bfa' },
    { id: 'gephaz',  name: 'Gépház',          where: 'A GÉPHÁZBAN',         x: 750,  y: 1040, w: 500, h: 300, color: '#fb923c' },
    { id: 'reaktor', name: 'Reaktor',         where: 'A REAKTORBAN',        x: 90,   y: 560,  w: 460, h: 400, color: '#fb7185' },
    { id: 'oxigen',  name: 'Oxigén-Kert',     where: 'AZ OXIGÉN-KERTBEN',   x: 1450, y: 480,  w: 460, h: 440, color: '#34d399' },
    { id: 'labor',   name: 'Orvosi Labor',    where: 'AZ ORVOSI LABORBAN',  x: 90,   y: 80,   w: 460, h: 330, color: '#e879f9' },
  ];

  // A folyosók 40 px-re belelógnak a szobákba, hogy az ütközésvizsgálat átjárható legyen.
  const CORRIDORS = [
    { x: 940,  y: 340,  w: 120, h: 220 }, // Híd – Kantin
    { x: 940,  y: 860,  w: 120, h: 220 }, // Kantin – Gépház
    { x: 510,  y: 670,  w: 280, h: 110 }, // Reaktor – Kantin
    { x: 1210, y: 650,  w: 280, h: 110 }, // Kantin – Oxigén
    { x: 260,  y: 370,  w: 120, h: 230 }, // Labor – Reaktor
    { x: 510,  y: 180,  w: 310, h: 110 }, // Labor – Híd
    { x: 1180, y: 180,  w: 500, h: 110 }, // Híd – Oxigén (1)
    { x: 1570, y: 180,  w: 110, h: 340 }, // Híd – Oxigén (2)
    { x: 290,  y: 920,  w: 110, h: 340 }, // Reaktor – Gépház (1)
    { x: 290,  y: 1150, w: 500, h: 110 }, // Reaktor – Gépház (2)
    { x: 1600, y: 880,  w: 110, h: 380 }, // Oxigén – Gépház (1)
    { x: 1210, y: 1150, w: 500, h: 110 }, // Oxigén – Gépház (2)
  ];

  const WALKABLE = ROOMS.concat(CORRIDORS);

  const SPAWN = { x: 1000, y: 720 };
  const TERMINAL = { x: 1000, y: 578 };

  const TASK_STATIONS = [
    { id: 't0',  room: 'kantin',  x: 880,  y: 640 },
    { id: 't1',  room: 'kantin',  x: 1120, y: 800 },
    { id: 't2',  room: 'hid',     x: 840,  y: 320 },
    { id: 't3',  room: 'hid',     x: 1160, y: 320 },
    { id: 't4',  room: 'gephaz',  x: 810,  y: 1100 },
    { id: 't5',  room: 'gephaz',  x: 1190, y: 1100 },
    { id: 't6',  room: 'reaktor', x: 470,  y: 620 },
    { id: 't7',  room: 'reaktor', x: 480,  y: 900 },
    { id: 't8',  room: 'oxigen',  x: 1520, y: 540 },
    { id: 't9',  room: 'oxigen',  x: 1840, y: 720 },
    { id: 't10', room: 'labor',   x: 170,  y: 320 },
    { id: 't11', room: 'labor',   x: 450,  y: 130 },
  ];

  const EMERGENCY_STATIONS = [
    { id: 'e_kantin',  room: 'kantin',  x: 1160, y: 720 },
    { id: 'e_hid',     room: 'hid',     x: 1140, y: 130 },
    { id: 'e_gephaz',  room: 'gephaz',  x: 1180, y: 1290 },
    { id: 'e_reaktor', room: 'reaktor', x: 150,  y: 620 },
    { id: 'e_oxigen',  room: 'oxigen',  x: 1850, y: 540 },
    { id: 'e_labor',   room: 'labor',   x: 470,  y: 345 },
  ];

  // Kantinban lévő indító pad -> célszoba; a célszobában visszatérő pad.
  const TELEPORT = {
    kantinPads: {
      labor:   { x: 810,  y: 578 },
      hid:     { x: 1190, y: 578 },
      reaktor: { x: 810,  y: 850 },
      gephaz:  { x: 1000, y: 850 },
      oxigen:  { x: 1190, y: 850 },
    },
    roomPads: {
      labor:   { x: 160,  y: 140 },
      hid:     { x: 870,  y: 150 },
      reaktor: { x: 160,  y: 900 },
      gephaz:  { x: 840,  y: 1290 },
      oxigen:  { x: 1840, y: 880 },
    },
    levels: [[], ['labor', 'hid', 'gephaz'], ['labor', 'hid', 'gephaz', 'reaktor', 'oxigen']],
  };

  const TOOLS = [
    { id: 'wrench',  emoji: '🔧', name: 'Kvantum-Csavarkulcs' },
    { id: 'welder',  emoji: '🔥', name: 'Plazma-Hegesztő' },
    { id: 'cryo',    emoji: '❄️', name: 'Krio-Fagyasztó Spray' },
    { id: 'emp',     emoji: '⚡', name: 'EMP-Sokkoló' },
    { id: 'plunger', emoji: '🪠', name: 'Hiper-WC Pumpa' },
  ];

  const ITEMS = {
    drink:   { emoji: '🥤', name: 'Turbó Energiaital', desc: '10 mp dupla sebesség' },
    grenade: { emoji: '💣', name: 'Fagyasztó Gránát', desc: '+10 mp minden aktív riasztásra' },
    coins:   { emoji: '💰', name: 'Bónusz Tallérok', desc: '+20 a Közös Kasszába' },
    coin:    { emoji: '🪙', name: 'Űr-Tallér', desc: '+5 a Közös Kasszába' },
  };

  const TASK_TYPES = [
    { id: 'wires',  name: 'Kábel-Káosz',       emoji: '🔌' },
    { id: 'plasma', name: 'Plazma-Csapolás',   emoji: '🧪' },
    { id: 'meteor', name: 'Meteor-Pajzs',      emoji: '☄️' },
    { id: 'memory', name: 'Memória-Mátrix',    emoji: '🧠' },
    { id: 'wave',   name: 'Hullám-Kalibrálás', emoji: '〰️' },
    { id: 'stars',  name: 'Csillagtérkép',     emoji: '⭐' },
    { id: 'code',   name: 'Kódtörő',           emoji: '🔐' },
    { id: 'juggle', name: 'Energia-Zsonglőr',  emoji: '🤹' },
  ];

  // Káosz-események: az egész hajót érintik ~20 mp-ig.
  const EVENTS = {
    blackout: { emoji: '🔦', name: 'ÁRAMSZÜNET',           desc: 'Kialudtak a fények! Csak a zseblámpád világít.' },
    gravity:  { emoji: '🙃', name: 'GRAVITÁCIÓS ANOMÁLIA', desc: 'Fordítva működik a joystick!' },
    meteors:  { emoji: '☄️', name: 'METEORZÁPOR',          desc: 'Kerüld a piros köröket a padlón!' },
    rat:      { emoji: '🐀', name: 'ŰRPATKÁNY',            desc: 'Egy patkány ellopta a kassza egy részét! Kapjátok el!' },
    swap:     { emoji: '🤖', name: 'BÉLA MEGKERGÜLT',      desc: 'Összekeverte az eszközeiteket! Nézd meg, mi van most nálad!' },
  };

  // A patkány útvonal-hálója (szobaközepek + folyosó-sarkok). Minden él végig járható.
  const RAT_NODES = {
    K: { x: 1000, y: 715,  n: ['H', 'G', 'R', 'O'] },
    H: { x: 1000, y: 230,  n: ['K', 'L', 'HO'] },
    G: { x: 1000, y: 1190, n: ['K', 'RG', 'OG'] },
    R: { x: 330,  y: 725,  n: ['K', 'L', 'RG'] },
    O: { x: 1680, y: 705,  n: ['K', 'OO', 'OG'] },
    L: { x: 320,  y: 245,  n: ['H', 'R'] },
    HO: { x: 1625, y: 235, n: ['H', 'OO'] },
    OO: { x: 1625, y: 600, n: ['HO', 'O'] },
    RG: { x: 345,  y: 1205, n: ['R', 'G'] },
    OG: { x: 1655, y: 1205, n: ['O', 'G'] },
  };

  const UPGRADES = {
    boots:    { tab: 'self', emoji: '👟', name: 'Rakéta-Csizma',            desc: '+22% sebesség szintenként – CSAK NEKED. Neon lángcsóvával.', prices: [60, 90, 130, 180, 240] },
    gloves:   { tab: 'self', emoji: '🧤', name: 'Bionikus Kesztyű',          desc: 'A te feladataid könnyebbek és rövidebbek lesznek.', prices: [80, 140, 220] },
    magnet:   { tab: 'self', emoji: '🧲', name: 'Saját Pénz-Mágnes & VIP Aura', desc: 'Messziről magadhoz húzod a cuccokat + arany VIP ragyogás.', prices: [70, 120, 190] },
    cape:     { tab: 'self', emoji: '👑', name: 'Arany „Főnök" Köpeny',      desc: 'Csillogó köpeny és +20% méret. Semmi haszna. Csak flex.', prices: [300] },
    shield:   { tab: 'team', emoji: '🛡️', name: 'Nano-Pajzs & Hajótest Javítás', desc: '+20 max HP és azonnali +25% javítás.', prices: [100, 150, 210, 280, 360] },
    dilator:  { tab: 'team', emoji: '⏳', name: 'Idő-Dilatátor',             desc: '+8 mp minden riasztás visszaszámlálására.', prices: [120, 200, 300] },
    teleport: { tab: 'team', emoji: '🌀', name: 'Kantin-Teleportáló',        desc: 'Teleport padok a Kantinban a távoli szobákba (és vissza).', prices: [150, 250] },
    bela:     { tab: 'team', emoji: '🤖', name: 'BÉLA-9000 Szűrő',           desc: '1–2 rossz válasz eltűnik a kvízben + dupla kvíz-jutalom.', prices: [120, 220] },
  };

  const CODE_COLORS = [
    { id: 'PIROS',  css: '#fb7185' },
    { id: 'KÉK',    css: '#38bdf8' },
    { id: 'ZÖLD',   css: '#34d399' },
    { id: 'SÁRGA',  css: '#facc15' },
    { id: 'LILA',   css: '#c084fc' },
    { id: 'FEHÉR',  css: '#f8fafc' },
  ];

  const AVATAR = {
    heads: [
      { id: 'cube',   name: 'Kocka-fej' },
      { id: 'potato', name: 'Érett Krumpli' },
      { id: 'egg',    name: 'Marslakó-tojás' },
      { id: 'chin',   name: 'Óriás-állú Csanád' },
      { id: 'tri',    name: 'Háromszög' },
    ],
    hats: [
      { id: 'plunger',  name: 'WC-pumpa' },
      { id: 'elvis',    name: 'Elvis-tupír' },
      { id: 'foil',     name: 'Alufólia-csákó' },
      { id: 'colander', name: 'Tésztaszűrő' },
      { id: 'mohawk',   name: 'Szivárvány punk-taréj' },
      { id: 'crown',    name: 'Arany korona' },
    ],
    faces: [
      { id: 'googly',   name: 'Kancsal rugós szemek' },
      { id: 'laser',    name: 'Lézer-napszemüveg' },
      { id: 'monocle',  name: 'Monokli + pödört bajusz' },
      { id: 'scream',   name: 'Sikító száj' },
      { id: 'grin',     name: 'Vigyor' },
    ],
    colors: ['#22d3ee', '#e879f9', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#a3e635', '#fb923c'],
  };

  const PLAYER_RADIUS = 16;
  const BASE_SPEED = 230;      // világ-pixel / mp
  const INTERACT_RANGE = 75;

  function inRectShrunk(r, x, y, m) {
    return x >= r.x + m && x <= r.x + r.w - m && y >= r.y + m && y <= r.y + r.h - m;
  }

  function walkable(x, y, rad) {
    const m = rad == null ? PLAYER_RADIUS : rad;
    for (let i = 0; i < WALKABLE.length; i++) if (inRectShrunk(WALKABLE[i], x, y, m)) return true;
    return false;
  }

  function roomAt(x, y) {
    for (const r of ROOMS) if (inRectShrunk(r, x, y, 0)) return r;
    return null;
  }

  function roomById(id) { return ROOMS.find(r => r.id === id); }
  function toolById(id) { return TOOLS.find(t => t.id === id); }

  function speedFor(bootsLevel, boosted, slimed) {
    let s = BASE_SPEED * (1 + 0.22 * (bootsLevel || 0));
    if (boosted) s *= 2;
    if (slimed) s *= 0.45;
    return s;
  }

  const SHARED = {
    WORLD, ROOMS, CORRIDORS, WALKABLE, SPAWN, TERMINAL, TASK_STATIONS, EMERGENCY_STATIONS,
    TELEPORT, TOOLS, ITEMS, TASK_TYPES, EVENTS, RAT_NODES, UPGRADES, CODE_COLORS, AVATAR,
    PLAYER_RADIUS, BASE_SPEED, INTERACT_RANGE,
    walkable, roomAt, roomById, toolById, speedFor,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SHARED;
  else root.SHARED = SHARED;
})(typeof window !== 'undefined' ? window : this);
