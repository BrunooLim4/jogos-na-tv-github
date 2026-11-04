// Desenhos da TV feitos na hora (SVG), no estilo da arte do Bruno: a cidade à
// noite atrás de tudo e o tabuleiro (mapa da cidade visto de cima, com as 5
// missões ligadas pela rota vermelha). Sorteio com semente fixa: a cidade é
// sempre a mesma.

const SVG = 'http://www.w3.org/2000/svg';

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function node(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (parent) parent.append(el);
  return el;
}

// ---------------------------------------------------------------- a cidade ao fundo

// Prédios em duas camadas (longe, mais apagados; perto, com janelas acesas),
// a torre do governo com a faixa vermelha do X e janelas que piscam.
export function drawSkyline(svg) {
  const W = 1920;
  const H = 620;
  const rnd = seeded(7);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const layers = [
    { color: '#141a26', min: 200, max: 430, windows: 0.05, lit: '#c98a4a' },
    { color: '#0b0e15', min: 110, max: 300, windows: 0.18, lit: '#f0a050' },
  ];
  for (const [depth, layer] of layers.entries()) {
    const g = node('g', { class: `skyline-layer layer-${depth}` }, svg);
    let x = -20;
    while (x < W) {
      const w = 46 + rnd() * 90;
      // a torre (perto do centro-direita, como na arte) é mais alta
      const tower = depth === 0 && x > 1180 && x < 1300;
      const h = tower ? 560 : layer.min + rnd() * (layer.max - layer.min);
      const top = H - h;
      node('rect', { x, y: top, width: w, height: h, fill: layer.color }, g);
      if (rnd() < 0.25) node('rect', { x: x + w / 2 - 1.5, y: top - 30 - rnd() * 40, width: 3, height: 70, fill: layer.color }, g);
      if (tower) {
        // faixa vermelha com o X da Resistência
        node('rect', { x: x + w * 0.2, y: top + 60, width: w * 0.6, height: 120, fill: '#7d0f16' }, g);
        node('path', { d: `M${x + w * 0.3} ${top + 80} L${x + w * 0.7} ${top + 160} M${x + w * 0.7} ${top + 80} L${x + w * 0.3} ${top + 160}`, stroke: '#14080a', 'stroke-width': 7 }, g);
      }
      for (let wy = top + 14; wy < H - 10; wy += 16) {
        for (let wx = x + 7; wx < x + w - 9; wx += 13) {
          if (rnd() > layer.windows) continue;
          const win = node('rect', { x: wx, y: wy, width: 5, height: 7, fill: layer.lit, opacity: (0.35 + rnd() * 0.55).toFixed(2) }, g);
          if (rnd() < 0.12) {
            win.classList.add('flicker');
            win.style.animationDelay = `${(rnd() * 12).toFixed(1)}s`;
            win.style.animationDuration = `${(6 + rnd() * 10).toFixed(1)}s`;
          }
        }
      }
      x += w + rnd() * 6;
    }
  }
}

// ---------------------------------------------------------------- o tabuleiro

export const MAP_W = 1500;
export const MAP_H = 380;
// Onde fica cada missão no mapa (mesmas medidas do viewBox).
export const MISSION_POINTS = [[150, 205], [450, 118], [750, 222], [1050, 118], [1350, 205]];
export const MISSION_NAMES = ['Rádio pirata', 'Depósito de comida', 'Usina de energia', 'Torre de vigilância', 'Palácio do governo'];

// Trecho da rota entre a missão i e a i+1 (sai e chega na horizontal, longe dos nomes).
function segmentPath(i) {
  const [x0, y0] = MISSION_POINTS[i];
  const [x1, y1] = MISSION_POINTS[i + 1];
  const mid = (x0 + x1) / 2;
  return `M${x0} ${y0} C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
}

// Quarteirões, ruas, praças e pichações; por cima, a rota em 4 trechos
// (`.route-done` = trecho já percorrido).
export function drawCityMap(svg) {
  const rnd = seeded(42);
  svg.replaceChildren();
  const defs = node('defs', {}, svg);
  const glow = node('filter', { id: 'route-glow', x: '-10%', y: '-50%', width: '120%', height: '200%' }, defs);
  node('feGaussianBlur', { stdDeviation: 5, result: 'b' }, glow);
  const merge = node('feMerge', {}, glow);
  node('feMergeNode', { in: 'b' }, merge);
  node('feMergeNode', { in: 'SourceGraphic' }, merge);
  const vignette = node('radialGradient', { id: 'map-vignette', cx: '50%', cy: '50%', r: '75%' }, defs);
  node('stop', { offset: '55%', 'stop-color': '#000', 'stop-opacity': 0 }, vignette);
  node('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.75 }, vignette);

  node('rect', { width: MAP_W, height: MAP_H, fill: '#0d1118' }, svg);
  const blocks = node('g', { class: 'blocks' }, svg);
  let y = -10;
  while (y < MAP_H) {
    const h = 58 + rnd() * 46;
    let x = -10;
    while (x < MAP_W) {
      const w = 80 + rnd() * 90;
      const park = rnd() < 0.07;
      node('rect', { x: x + 6, y: y + 6, width: w - 12, height: h - 12, rx: 3, fill: park ? '#111c17' : (rnd() < 0.5 ? '#151a23' : '#181e28') }, blocks);
      if (!park) {
        // telhados dentro do quarteirão
        const count = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < count; k++) {
          const bw = 14 + rnd() * (w - 40);
          const bh = 10 + rnd() * (h - 34);
          node('rect', { x: x + 10 + rnd() * (w - bw - 20), y: y + 10 + rnd() * (h - bh - 20), width: bw, height: bh, fill: '#1d2430', opacity: 0.8 }, blocks);
        }
      } else {
        for (let k = 0; k < 5; k++) node('circle', { cx: x + 14 + rnd() * (w - 28), cy: y + 14 + rnd() * (h - 28), r: 4 + rnd() * 5, fill: '#16251d' }, blocks);
      }
      if (rnd() < 0.08) {
        const gx = x + w / 2;
        const gy = y + h / 2;
        node('path', { d: `M${gx - 9} ${gy - 9} L${gx + 9} ${gy + 9} M${gx + 9} ${gy - 9} L${gx - 9} ${gy + 9}`, stroke: '#b3151f', 'stroke-width': 4, opacity: 0.35, 'stroke-linecap': 'round' }, blocks);
      }
      x += w;
    }
    y += h;
  }

  const route = node('g', { class: 'route' }, svg);
  for (let i = 0; i < MISSION_POINTS.length - 1; i++) {
    node('path', { d: segmentPath(i), class: 'route-base', fill: 'none' }, route);
    node('path', { d: segmentPath(i), class: 'route-progress', 'data-segment': i, fill: 'none', pathLength: 1000, filter: 'url(#route-glow)' }, route);
  }
  node('rect', { width: MAP_W, height: MAP_H, fill: 'url(#map-vignette)', 'pointer-events': 'none' }, svg);
}
