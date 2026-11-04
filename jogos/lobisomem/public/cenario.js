// O cenário vivo da TV: a vila à noite, desenhada em SVG com semente fixa (sempre
// igual). Silhuetas escuras de casas, igreja e pinheiros contra o céu, janelas acesas
// que piscam, a lua, estrelas, nuvens e névoa passando. Sutil: as cartas do Bruno
// são as estrelas da mesa.
//
// O céu muda com a fase (`setSky`): noite, amanhecer, dia (a conversa), votação
// (fim de tarde, vermelho) — cada céu é uma camada que aparece devagar (CSS).

const NS = 'http://www.w3.org/2000/svg';
const W = 1920;
const H = 1080;

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function node(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (parent) parent.append(el);
  return el;
}

function gradient(defs, id, stops, { x2 = 0, y2 = 1, radial = false, ...attrs } = {}) {
  const g = node(radial ? 'radialGradient' : 'linearGradient', radial ? { id, ...attrs } : { id, x1: 0, y1: 0, x2, y2 }, defs);
  for (const [offset, color, opacity = 1] of stops) node('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, g);
}

// Os céus de cada fase (de cima para o horizonte).
const SKIES = {
  noite: [['0', '#060a18'], ['0.55', '#121a3a'], ['1', '#2a2550']],
  amanhecer: [['0', '#1b2350'], ['0.5', '#6a4a7c'], ['0.8', '#d8826a'], ['1', '#f2b46a']],
  dia: [['0', '#33507a'], ['0.6', '#7d8fa8'], ['1', '#d9c19a']],
  votacao: [['0', '#1a0d1c'], ['0.5', '#5a1b26'], ['0.85', '#b4462e'], ['1', '#e0823c']],
};

export function buildScene(svg, { seed = 11 } = {}) {
  const random = rng(seed);
  const r = (a, b) => a + random() * (b - a);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const defs = node('defs', {}, svg);
  for (const [name, stops] of Object.entries(SKIES)) gradient(defs, `ceu-${name}`, stops);
  gradient(defs, 'lua', [['0', '#fff8e4'], ['0.7', '#f1e2b6'], ['1', '#d9c48e']], { radial: true, cx: '0.42', cy: '0.38', r: '0.62' });
  gradient(defs, 'halo', [['0', '#f4e6bc', 0.55], ['0.35', '#f4e6bc', 0.16], ['1', '#f4e6bc', 0]], { radial: true });
  gradient(defs, 'sol', [['0', '#ffd08a', 0.9], ['0.4', '#ff9a5a', 0.35], ['1', '#ff9a5a', 0]], { radial: true });
  gradient(defs, 'chao', [['0', '#080a14', 0], ['0.35', '#06070e', 0.85], ['1', '#030409', 1]]);
  gradient(defs, 'nevoa', [['0', '#c9d3ea', 0], ['0.5', '#c9d3ea', 0.22], ['1', '#c9d3ea', 0]], { x2: 1, y2: 0 });
  const blur = node('filter', { id: 'borrar', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  node('feGaussianBlur', { stdDeviation: 18 }, blur);
  const glow = node('filter', { id: 'brilho', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
  node('feGaussianBlur', { stdDeviation: 3, result: 'b' }, glow);
  const merge = node('feMerge', {}, glow);
  node('feMergeNode', { in: 'b' }, merge);
  node('feMergeNode', { in: 'SourceGraphic' }, merge);

  // céus (um por fase; o CSS mostra o da fase atual)
  for (const name of Object.keys(SKIES)) node('rect', { class: `ceu ceu-${name}`, x: 0, y: 0, width: W, height: H, fill: `url(#ceu-${name})` }, svg);

  // estrelas
  const stars = node('g', { class: 'estrelas' }, svg);
  for (let i = 0; i < 150; i++) {
    const star = node('circle', { cx: r(0, W).toFixed(0), cy: (r(0, 1) ** 1.6 * 620).toFixed(0), r: r(0.6, 2.1).toFixed(1), fill: '#fdf6e0' }, stars);
    if (random() < 0.45) {
      star.classList.add('pisca');
      star.style.animationDelay = `${r(0, 6).toFixed(2)}s`;
      star.style.animationDuration = `${r(2.5, 6).toFixed(2)}s`;
    }
  }

  // sol do amanhecer/dia (atrás de tudo, no horizonte)
  node('circle', { class: 'sol', cx: 420, cy: 700, r: 520, fill: 'url(#sol)' }, svg);

  // lua com halo e manchas
  const moon = node('g', { class: 'lua' }, svg);
  // (no alto, entre o título e o relógio da TV, sem ficar atrás dos painéis)
  const [mx, my, mr] = [1470, 96, 66];
  node('circle', { cx: mx, cy: my, r: 250, fill: 'url(#halo)' }, moon);
  node('circle', { cx: mx, cy: my, r: mr, fill: 'url(#lua)' }, moon);
  for (const [dx, dy, rr] of [[-19, -14, 13], [16, 8, 18], [-5, 27, 8], [24, -24, 7], [-32, 16, 6]]) {
    node('circle', { cx: mx + dx, cy: my + dy, r: rr, fill: '#c9b27a', opacity: 0.35 }, moon);
  }

  // nuvens (passam devagar)
  const clouds = node('g', { class: 'nuvens' }, svg);
  for (let i = 0; i < 6; i++) {
    const cloud = node('ellipse', { cx: r(0, W), cy: r(90, 420), rx: r(160, 340), ry: r(18, 40), fill: '#9aa6c8', opacity: r(0.08, 0.18).toFixed(2), filter: 'url(#borrar)' }, clouds);
    cloud.classList.add('passa');
    cloud.style.animationDuration = `${r(90, 160).toFixed(0)}s`;
    cloud.style.animationDelay = `${-r(0, 160).toFixed(0)}s`;
  }

  // morros ao fundo
  const hills = [];
  for (let x = 0; x <= W; x += 120) hills.push(`${x},${(610 + Math.sin(x / 260) * 26 + r(-10, 10)).toFixed(0)}`);
  node('polygon', { class: 'morro', points: `0,${H} ${hills.join(' ')} ${W},${H}`, fill: '#1c2244' }, svg);

  // as casas: três fileiras, a de trás mais clara (mais longe)
  const rows = [
    { base: 690, scale: 0.62, color: '#18203f', lit: 0.18 },
    { base: 760, scale: 0.85, color: '#10162f', lit: 0.3, church: 1180 },
    { base: 840, scale: 1.08, color: '#090c1d', lit: 0.36 },
  ];
  const windows = node('g', { class: 'janelas' }, null);
  for (const row of rows) {
    const g = node('g', {}, svg);
    let x = r(-60, 0);
    while (x < W + 40) {
      const s = row.scale;
      if (row.church && Math.abs(x - row.church) < 120) {
        x = drawChurch(g, windows, row.church, row.base, s, row.color) + r(30, 70) * s;
        continue;
      }
      if (random() < 0.28) {
        x = drawPine(g, x, row.base, s * r(0.8, 1.3), row.color) + r(10, 40) * s;
        continue;
      }
      x = drawHouse(g, windows, x, row.base, s, row.color, row.lit) + r(6, 40) * s;
    }
  }
  svg.append(windows);

  // névoa passando na altura das casas
  const fog = node('g', { class: 'nevoa' }, svg);
  for (let i = 0; i < 4; i++) {
    const band = node('rect', { x: -W, y: r(700, 860).toFixed(0), width: W * 2.2, height: r(60, 120).toFixed(0), fill: 'url(#nevoa)', opacity: r(0.5, 0.9).toFixed(2) }, fog);
    band.classList.add('passa');
    band.style.animationDuration = `${r(60, 110).toFixed(0)}s`;
    band.style.animationDelay = `${-r(0, 100).toFixed(0)}s`;
  }

  // chão escuro embaixo (onde ficam as cartas dos jogadores)
  node('rect', { x: 0, y: 700, width: W, height: 380, fill: 'url(#chao)' }, svg);

  function drawHouse(g, win, x, base, s, color, litChance) {
    const w = r(70, 150) * s;
    const h = r(70, 150) * s;
    const roof = r(36, 90) * s;
    const top = base - h;
    node('rect', { x, y: top, width: w, height: h + 300, fill: color }, g);
    const overhang = 8 * s;
    node('polygon', { points: `${x - overhang},${top} ${x + w / 2},${top - roof} ${x + w + overhang},${top}`, fill: color }, g);
    if (random() < 0.6) {
      const cx = x + w * r(0.15, 0.7);
      node('rect', { x: cx, y: top - roof * r(0.5, 0.9), width: 11 * s, height: roof * 0.8, fill: color }, g);
    }
    // janelas (algumas acesas, algumas piscam)
    const cols = Math.max(1, Math.floor(w / (34 * s)));
    const floors = Math.max(1, Math.floor(h / (46 * s)));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (random() > litChance) continue;
        const wx = x + (w / cols) * (c + 0.5) - 6 * s;
        const wy = top + 16 * s + f * 46 * s;
        const pane = node('rect', { x: wx.toFixed(1), y: wy.toFixed(1), width: (12 * s).toFixed(1), height: (16 * s).toFixed(1), rx: 1.5, fill: random() < 0.75 ? '#f6c35a' : '#ffdf8e', filter: 'url(#brilho)' }, win);
        if (random() < 0.35) {
          pane.classList.add('tremula');
          pane.style.animationDelay = `${r(0, 8).toFixed(2)}s`;
          pane.style.animationDuration = `${r(3, 9).toFixed(2)}s`;
        }
      }
    }
    return x + w;
  }

  function drawPine(g, x, base, s, color) {
    const w = 60 * s;
    const h = 150 * s;
    node('rect', { x: x + w / 2 - 4 * s, y: base - 20 * s, width: 8 * s, height: 320, fill: color }, g);
    for (let k = 0; k < 4; k++) {
      const y = base - 18 * s - k * (h / 4.2);
      const ww = w * (1 - k * 0.2);
      node('polygon', { points: `${x + w / 2 - ww / 2},${y} ${x + w / 2},${y - h / 2.6} ${x + w / 2 + ww / 2},${y}`, fill: color }, g);
    }
    return x + w;
  }

  function drawChurch(g, win, cx, base, s, color) {
    const w = 150 * s;
    const h = 150 * s;
    const x = cx - w / 2;
    node('rect', { x, y: base - h, width: w, height: h + 300, fill: color }, g);
    node('polygon', { points: `${x - 10 * s},${base - h} ${cx},${base - h - 70 * s} ${x + w + 10 * s},${base - h}`, fill: color }, g);
    // torre com a ponta e a cruz
    const tw = 56 * s;
    const th = 250 * s;
    node('rect', { x: cx - tw / 2, y: base - th, width: tw, height: th, fill: color }, g);
    node('polygon', { points: `${cx - tw / 2 - 6 * s},${base - th} ${cx},${base - th - 130 * s} ${cx + tw / 2 + 6 * s},${base - th}`, fill: color }, g);
    node('rect', { x: cx - 2.5 * s, y: base - th - 170 * s, width: 5 * s, height: 44 * s, fill: color }, g);
    node('rect', { x: cx - 13 * s, y: base - th - 158 * s, width: 26 * s, height: 5 * s, fill: color }, g);
    // a janela redonda da torre (relógio) acesa
    node('circle', { cx, cy: base - th + 44 * s, r: 13 * s, fill: '#f6c35a', filter: 'url(#brilho)', opacity: 0.9 }, win);
    node('rect', { x: cx - 9 * s, y: base - 70 * s, width: 18 * s, height: 30 * s, rx: 9 * s, fill: '#f6c35a', filter: 'url(#brilho)', opacity: 0.8 }, win);
    return x + w;
  }
}

// Fase do céu: 'sala' (noite, sem a lua: o logo tem a dele) | 'noite' | 'amanhecer' | 'dia' | 'votacao'.
export function setSky(svg, sky) {
  svg.dataset.sky = sky;
}
