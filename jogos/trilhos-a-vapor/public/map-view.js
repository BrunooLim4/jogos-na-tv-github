// Desenha o mapa (cidades + rotas) em SVG, para a TV e para o celular.
//
// Como no tabuleiro original: a maioria das rotas é reta; as que curvam estão
// em ROUTE_SHAPES (map-usa.js). Os vagões dividem a rota em partes iguais.
import { CITIES, ROUTES, MAP_SIZE, ROUTE_SHAPES, SPREAD } from './map-usa.js';
import { CARD_PAINT } from './cards.js';
import { drawScenery } from './map-scenery.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CITY_RADIUS = 10;
const MARGIN = 17; // da cidade até o primeiro vagão
const CAR_GAP = 5;
const MAX_CAR = 54; // rota folgada: o vagão não passa disso (sobra espaço nas pontas)
const LANE_OFFSET = 8; // distância de cada faixa de uma rota dupla até o meio
const SAMPLES = 64;
const FRAME = 22; // borda em volta do mapa

const LABEL_OFFSETS = {
  n: [0, -17, 'middle'],
  s: [0, 30, 'middle'],
  e: [16, 5.5, 'start'],
  w: [-16, 5.5, 'end'],
  ne: [12, -13, 'start'],
  nw: [-12, -13, 'end'],
  se: [12, 27, 'start'],
  sw: [-12, 27, 'end'],
};

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

// Caminho da rota (reta ou curva suave), amostrado em pontos com o comprimento
// acumulado, para poder andar por ele em distância.
function routePath(route) {
  const from = CITIES[route.a];
  const to = CITIES[route.b];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  const bend = ROUTE_SHAPES[`${route.a}-${route.b}`] ?? 0;
  // Curva = Bézier quadrática; o ponto de controle fica a 2× o afastamento do meio.
  const cx = (from.x + to.x) / 2 + (-dy / chord) * bend * 2;
  const cy = (from.y + to.y) / 2 + (dx / chord) * bend * 2;

  const points = [];
  let total = 0;
  let prev = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
    if (prev) total += Math.hypot(x - prev.x, y - prev.y);
    prev = { x, y, s: total };
    points.push(prev);
  }
  return { points, total };
}

// Ponto e direção a uma distância `s` do começo do caminho.
function pointAt({ points }, s) {
  let i = 1;
  while (i < points.length - 1 && points[i].s < s) i++;
  const a = points[i - 1];
  const b = points[i];
  const k = (s - a.s) / (b.s - a.s || 1);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// O caminho de cada ligação (as duas faixas de uma rota dupla usam o mesmo).
export const PATHS = new Map();
function pathOf(route) {
  const key = `${route.a}-${route.b}`;
  if (!PATHS.has(key)) PATHS.set(key, routePath(route));
  return PATHS.get(key);
}

const laneOffset = route => (route.lanes > 1 ? (route.lane === 0 ? -LANE_OFFSET : LANE_OFFSET) : 0);
const carHeight = route => (route.lanes > 1 ? 12.5 : 15);

// Onde começa o primeiro vagão em cada ponta de cada rota. Começa em MARGIN;
// onde duas rotas saem da mesma cidade muito juntas e os vagões se encostam,
// só UMA delas (a que tem mais sobra de espaço) começa um pouco mais longe da
// cidade, aos pouquinhos, até parar de encostar.
const CLEARANCE = 2; // folga mínima entre vagões de rotas diferentes
const MIN_CAR = 22; // não deixa os vagões ficarem pequenos demais
export const END_MARGINS = computeEndMargins();

export function computeEndMargins() {
  const margins = new Map();
  for (const route of ROUTES) margins.set(`${route.a}-${route.b}`, { start: MARGIN, end: MARGIN });
  const slack = route => {
    const key = `${route.a}-${route.b}`;
    const m = margins.get(key);
    return pathOf(route).total - m.start - m.end - route.length * (MIN_CAR + CAR_GAP);
  };
  for (let round = 0; round < 200; round++) {
    const cars = [];
    for (const route of ROUTES) {
      for (const car of carLayout(route, margins.get(`${route.a}-${route.b}`))) {
        const rect = carCorners(car, CLEARANCE / 2);
        const xs = rect.map(p => p[0]); const ys = rect.map(p => p[1]);
        cars.push({ route, rect, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
      }
    }
    const bumps = new Map();
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const A = cars[i]; const B = cars[j];
        if (A.route.a === B.route.a && A.route.b === B.route.b) continue; // faixas da mesma rota dupla
        if (A.box[2] < B.box[0] || B.box[2] < A.box[0] || A.box[3] < B.box[1] || B.box[3] < A.box[1]) continue;
        if (!rectsOverlap(A.rect, B.rect)) continue;
        // a cidade que as duas rotas têm em comum (é lá que elas se encostam)
        const city = [A.route.a, A.route.b].find(c => c === B.route.a || c === B.route.b);
        if (!city) continue;
        const pick = slack(A.route) >= slack(B.route) ? A.route : B.route;
        bumps.set(`${pick.a}-${pick.b}`, pick.a === city ? 'start' : 'end');
      }
    }
    if (!bumps.size) break;
    for (const [key, end] of bumps) margins.get(key)[end] += 1;
  }
  return margins;
}

// Os vagões de uma faixa de rota: centro, ângulo, tamanho.
export function carLayout(route, ends) {
  const path = pathOf(route);
  const usable = path.total - ends.start - ends.end;
  const length = Math.max(Math.min(usable / route.length - CAR_GAP, MAX_CAR), 14);
  const pitch = length + CAR_GAP;
  // Se sobrar espaço, os vagões ficam centralizados na rota.
  const start = ends.start + (usable - pitch * route.length) / 2;
  const offset = laneOffset(route);
  const height = carHeight(route);
  const cars = [];
  for (let i = 0; i < route.length; i++) {
    const p = pointAt(path, start + pitch * (i + 0.5));
    cars.push({
      x: p.x - Math.sin(p.angle) * offset,
      y: p.y + Math.cos(p.angle) * offset,
      angle: p.angle,
      length,
      height,
    });
  }
  return cars;
}

export function carCorners({ x, y, angle, length, height }, pad = 0) {
  const ux = Math.cos(angle); const uy = Math.sin(angle);
  const lx = ux * (length / 2 + pad); const ly = uy * (length / 2 + pad);
  const hx = -uy * (height / 2 + pad); const hy = ux * (height / 2 + pad);
  return [[x - lx - hx, y - ly - hy], [x + lx - hx, y + ly - hy], [x + lx + hx, y + ly + hy], [x - lx + hx, y - ly + hy]];
}

// Dois retângulos (4 cantos cada) se sobrepõem? (teste dos eixos separadores)
export function rectsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const ax = -(poly[i + 1][1] - poly[i][1]);
      const ay = poly[i + 1][0] - poly[i][0];
      const pa = a.map(([x, y]) => x * ax + y * ay);
      const pb = b.map(([x, y]) => x * ax + y * ay);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

function drawRoute(route) {
  const cars = carLayout(route, END_MARGINS.get(`${route.a}-${route.b}`));

  const group = el('g', { class: 'route', 'data-route': route.id, 'data-color': route.color });
  cars.forEach((car, i) => {
    const cx = car.x;
    const cy = car.y;
    // Gira no máximo 90° para qualquer lado: assim a lateral (mais escura) das
    // peças de trem fica sempre para baixo, com a luz vindo do mesmo lado.
    let deg = (car.angle * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    else if (deg <= -90) deg += 180;
    // O suporte (<g>) leva o vagão até o lugar e gira; o vagão em si fica
    // centrado no zero, para a animação de "crescer" acontecer no lugar certo.
    const holder = el('g', {
      class: 'car',
      transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${deg.toFixed(1)})`,
      style: `--i: ${i}`, // ordem do vagão: os trens entram um de cada vez
    });
    holder.append(el('rect', {
      class: 'slot',
      x: (-car.length / 2).toFixed(1),
      y: -car.height / 2,
      width: car.length.toFixed(1),
      height: car.height,
      rx: 3,
      fill: CARD_PAINT[route.color],
    }));
    group.append(holder);
  });
  return group;
}

// Devolve a plaquinha do nome (vai por baixo das rotas, para não esconder
// vagões) e o grupo da cidade com o ponto e o nome (vai por cima).
// Nome comprido pode ir em duas linhas (como "Kansas / City" no tabuleiro):
// quebra no espaço mais perto do meio.
export function splitName(name) {
  const spaces = [...name.matchAll(/ /g)].map(m => m.index);
  if (!spaces.length) return [name];
  const cut = spaces.reduce((best, i) => (Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2) ? i : best));
  return [name.slice(0, cut), name.slice(cut + 1)];
}
const LINE_GAP = 16; // distância entre as duas linhas de um nome

// Onde fica o nome de uma cidade: texto (tx, ty, alinhamento, linhas) e a
// plaquinha em volta (largura estimada pelas letras; fitPlates acerta depois).
function labelLayout(city, mini = false) {
  const [lx, ly, anchor, lineCount = 1] = Array.isArray(city.label)
    ? city.label // posição exata [dx, dy, alinhamento, linhas]
    : LABEL_OFFSETS[city.label] ?? LABEL_OFFSETS.s;
  const lines = lineCount === 2 && !mini ? splitName(city.name) : [city.name];
  const tx = city.x + lx;
  const ty = city.y + ly;
  const extra = (lines.length - 1) * LINE_GAP; // altura a mais da plaquinha
  const plateWidth = Math.max(...lines.map(l => l.length)) * 8.4 + 14;
  const plateX = anchor === 'start' ? tx - 7 : anchor === 'end' ? tx - plateWidth + 7 : tx - plateWidth / 2;
  const plateY = ty - 16 - extra / 2;
  return { lines, tx, ty, anchor, extra, plateWidth, plateX, plateY };
}

function drawCity(id, city, mini) {
  const { lines, tx, ty, anchor, extra, plateWidth, plateX, plateY } = labelLayout(city, mini);
  const plate = el('rect', {
    class: 'city-plate',
    'data-city': id,
    x: plateX.toFixed(1),
    y: plateY,
    width: plateWidth.toFixed(1),
    height: 22 + extra,
    rx: 6,
  });

  // Linha fininha do ponto até o nome (discreta; as posições dos nomes foram
  // escolhidas para ela não cruzar trilhos).
  const leader = el('line', { class: 'city-leader', 'data-city': id });
  aimLeader(leader, city, { x: plateX, y: plateY, width: plateWidth, height: 22 + extra });

  const group = el('g', { class: 'city', 'data-city': id });
  group.append(
    el('circle', { class: 'city-halo', cx: city.x, cy: city.y, r: CITY_RADIUS + 5 }),
    el('circle', { class: 'city-dot', cx: city.x, cy: city.y, r: CITY_RADIUS }),
    el('circle', { class: 'city-core', cx: city.x, cy: city.y, r: 3.5 }),
  );
  const label = el('text', { x: tx, y: ty, 'text-anchor': anchor });
  if (lines.length === 1) {
    label.textContent = city.name;
  } else {
    lines.forEach((line, i) => {
      const part = el('tspan', { x: tx, y: ty - extra / 2 + i * LINE_GAP });
      part.textContent = line;
      label.append(part);
    });
  }
  group.append(label);
  return { plate, leader, group };
}

// Liga a borda do ponto da cidade ao ponto mais próximo da plaquinha.
// Se o nome já está colado no ponto, a linha some.
export function leaderEnds(city, box) {
  const nx = Math.min(Math.max(city.x, box.x), box.x + box.width);
  const ny = Math.min(Math.max(city.y, box.y), box.y + box.height);
  const dist = Math.hypot(nx - city.x, ny - city.y);
  const start = CITY_RADIUS + 2;
  if (dist < start + 6) return null;
  const ux = (nx - city.x) / dist;
  const uy = (ny - city.y) / dist;
  return [city.x + ux * start, city.y + uy * start, nx, ny];
}

function aimLeader(line, city, box) {
  const ends = leaderEnds(city, box);
  if (!ends) {
    line.setAttribute('visibility', 'hidden');
    return;
  }
  const [x1, y1, x2, y2] = ends;
  line.setAttribute('x1', x1.toFixed(1));
  line.setAttribute('y1', y1.toFixed(1));
  line.setAttribute('x2', x2.toFixed(1));
  line.setAttribute('y2', y2.toFixed(1));
  line.removeAttribute('visibility');
}

// Granulado do papel: um ladrilho pequeno desenhado uma vez só (bem mais leve
// para a TV do que um filtro SVG, que seria recalculado a cada animação).
let grainUrl = null;
function paperGrain() {
  if (grainUrl) return grainUrl;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(95, 62, 28, ${(0.04 + rand() * 0.14).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 0.4 + rand() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 70; i++) { // fibras do papel
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    ctx.strokeStyle = `rgba(120, 85, 40, ${(0.05 + rand() * 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * (4 + rand() * 10), y + Math.sin(a) * (4 + rand() * 10));
    ctx.stroke();
  }
  grainUrl = canvas.toDataURL();
  return grainUrl;
}

// Manchas de pergaminho envelhecido (sempre nos mesmos lugares).
const STAINS = [
  [150, 300, 260, 190], [560, 180, 300, 170], [930, 430, 280, 210],
  [380, 620, 240, 150], [1120, 640, 220, 170], [760, 560, 200, 140], [1060, 120, 230, 150],
].map(stain => stain.map(v => v * SPREAD));

let mapCount = 0;

// Fundo com cara de mapa antigo: pergaminho manchado, mares e desenhinhos,
// locomotiva, rosa dos ventos e um filete marrom duplo na beira.
function drawBackground(x, y, width, height, scenery) {
  const uid = `map${++mapCount}`; // ids únicos: o celular pode ter vários mapas
  const defs = el('defs');
  const stain = el('radialGradient', { id: `${uid}-stain` });
  stain.append(
    el('stop', { offset: '0%', 'stop-color': '#9c6a32', 'stop-opacity': 0.2 }),
    el('stop', { offset: '100%', 'stop-color': '#9c6a32', 'stop-opacity': 0 }),
  );
  const vignette = el('radialGradient', { id: `${uid}-vignette`, r: '75%' });
  vignette.append(
    el('stop', { offset: '55%', 'stop-color': '#7a4a1e', 'stop-opacity': 0 }),
    el('stop', { offset: '100%', 'stop-color': '#7a4a1e', 'stop-opacity': 0.42 }),
  );
  const grain = el('pattern', { id: `${uid}-grain`, width: 256, height: 256, patternUnits: 'userSpaceOnUse' });
  grain.append(el('image', { href: paperGrain(), width: 256, height: 256 }));
  // Máscara que esfuma as bordas dos desenhos de enfeite.
  const fadeGradient = el('radialGradient', { id: `${uid}-fade-g` });
  fadeGradient.append(
    el('stop', { offset: '55%', 'stop-color': '#fff' }),
    el('stop', { offset: '100%', 'stop-color': '#000' }),
  );
  const fade = el('mask', { id: `${uid}-fade`, maskContentUnits: 'objectBoundingBox' });
  fade.append(el('rect', { width: 1, height: 1, fill: `url(#${uid}-fade-g)` }));
  defs.append(stain, vignette, grain, fadeGradient, fade);

  // Tudo do fundo fica recortado no formato do tabuleiro (nada vaza para fora).
  const clip = el('clipPath', { id: `${uid}-clip` });
  clip.append(el('rect', { x, y, width, height, rx: 4 }));
  defs.append(clip);
  const group = el('g', { class: 'map-backdrop', 'clip-path': `url(#${uid}-clip)` });
  group.append(defs, el('rect', { class: 'map-bg', x, y, width, height, rx: 4 }));
  for (const [cx, cy, rx, ry] of STAINS) {
    group.append(el('ellipse', { class: 'map-stain', cx, cy, rx, ry, fill: `url(#${uid}-stain)` }));
  }
  group.append(el('rect', { class: 'map-grain', x, y, width, height, fill: `url(#${uid}-grain)` }));
  for (let gy = y + 90; gy < y + height; gy += 110) {
    group.append(el('line', { class: 'map-grid', x1: x + 16, x2: x + width - 16, y1: gy, y2: gy }));
  }
  for (let gx = x + 110; gx < x + width; gx += 135) {
    group.append(el('line', { class: 'map-grid', x1: gx, x2: gx, y1: y + 16, y2: y + height - 16 }));
  }
  group.append(scenery);
  // Desenhos de enfeite, nos cantos onde não passa nenhuma rota.
  group.append(
    el('image', { class: 'map-deco', href: '/img/deco-locomotiva.jpg', x: -2, y: MAP_SIZE.height - 118, width: 222, height: 130, mask: `url(#${uid}-fade)` }),
    el('image', { class: 'map-deco', href: '/img/deco-rosa.jpg', x: Math.round(980 * SPREAD) - 46, y: MAP_SIZE.height - 90, width: 92, height: 92, mask: `url(#${uid}-fade)` }),
  );
  group.append(el('rect', { class: 'map-vignette', x, y, width, height, rx: 4, fill: `url(#${uid}-vignette)` }));
  // Borda simples: o papel vai até a beira, com um filete marrom duplo.
  group.append(
    el('rect', { class: 'map-frame-edge', x: x + 1.5, y: y + 1.5, width: width - 3, height: height - 3, rx: 4 }),
    el('rect', { class: 'map-frame', x: x + 19, y: y + 19, width: width - 38, height: height - 38, rx: 2 }),
  );
  return group;
}

// Cenário do fundo (costa, rios, montanhas...): calculado uma vez só e
// copiado para cada mapa. Os desenhinhos desviam de vagões, cidades e nomes.
let sceneryTemplate = null;
function sceneryLayer() {
  if (!sceneryTemplate) {
    const polys = [];
    const withBox = pts => {
      const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
      return { pts, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    };
    for (const route of ROUTES) {
      for (const car of carLayout(route, END_MARGINS.get(`${route.a}-${route.b}`))) polys.push(withBox(carCorners(car, 3)));
    }
    const rects = [
      [-2, MAP_SIZE.height - 118, 220, MAP_SIZE.height + 12], // locomotiva
      [Math.round(980 * SPREAD) - 46, MAP_SIZE.height - 90, Math.round(980 * SPREAD) + 46, MAP_SIZE.height + 2], // rosa dos ventos
    ];
    for (const city of Object.values(CITIES)) {
      rects.push([city.x - 20, city.y - 20, city.x + 20, city.y + 20]);
      const { plateX, plateY, plateWidth, extra } = labelLayout(city);
      const box = { x: plateX - 4, y: plateY - 3, width: plateWidth + 8, height: 22 + extra + 6 };
      rects.push([box.x, box.y, box.x + box.width, box.y + box.height]);
      const ends = leaderEnds(city, box);
      if (ends) {
        // a linha fininha até o nome também fica livre
        const [x1, y1, x2, y2] = ends;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (-(y2 - y1) / len) * 3; const ny = ((x2 - x1) / len) * 3;
        polys.push(withBox([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]));
      }
    }
    const rectHitsPoly = ([x0, y0, x1, y1], pts) => rectsOverlap([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], pts);
    sceneryTemplate = drawScenery(el, { spread: SPREAD, obstacles: { rects, polys }, rectHitsPoly, bounds: [-12, -12, MAP_SIZE.width + 12, MAP_SIZE.height + 12] });
  }
  return sceneryTemplate.cloneNode(true);
}

// mini: versão pequena para o celular (sem nomes, menos detalhes).
export function createMap({ mini = false } = {}) {
  const x = -FRAME;
  const y = -FRAME;
  const width = MAP_SIZE.width + FRAME * 2;
  const height = MAP_SIZE.height + FRAME * 2;
  const svg = el('svg', {
    viewBox: `${x} ${y} ${width} ${height}`,
    class: mini ? 'map mini' : 'map',
    role: 'img',
    'aria-label': 'Mapa das rotas de trem dos Estados Unidos',
  });

  const routes = el('g', { class: 'routes' });
  ROUTES.forEach((route, index) => {
    const group = drawRoute(route);
    group.style.setProperty('--ri', index); // ordem da rota (animação de abertura)
    routes.append(group);
  });
  const plates = el('g', { class: 'plates' });
  const cities = el('g', { class: 'cities' });
  for (const [id, city] of Object.entries(CITIES)) {
    const { plate, leader, group } = drawCity(id, city, mini);
    plates.append(leader, plate);
    cities.append(group);
  }

  // Ordem das camadas: fundo (com o cenário), plaquinhas, rotas, cidades (ponto + nome).
  svg.append(drawBackground(x, y, width, height, sceneryLayer()), plates, routes, cities);
  if (!mini) document.fonts?.ready.then(() => fitPlates(svg));
  return svg;
}

// Ajusta cada plaquinha ao tamanho real do nome (só dá para medir com a fonte
// carregada e o mapa já na tela; tenta de novo nos próximos quadros).
function fitPlates(svg, tries = 30) {
  if (!svg.isConnected) {
    if (tries > 0) requestAnimationFrame(() => fitPlates(svg, tries - 1));
    return;
  }
  for (const text of svg.querySelectorAll('.city text')) {
    const id = text.parentNode.dataset.city;
    const plate = svg.querySelector(`.city-plate[data-city="${id}"]`);
    const box = text.getBBox();
    if (!plate || !box.width) continue;
    plate.setAttribute('x', (box.x - 7).toFixed(1));
    plate.setAttribute('width', (box.width + 14).toFixed(1));
    const leader = svg.querySelector(`.city-leader[data-city="${id}"]`);
    if (leader) {
      aimLeader(leader, CITIES[id], {
        x: box.x - 7,
        y: Number(plate.getAttribute('y')),
        width: box.width + 14,
        height: Number(plate.getAttribute('height')),
      });
    }
  }
}

// Peça de trem, como as de plástico do tabuleiro (o mesmo modelo para todos;
// a cor do dono vem do CSS): lateral mais escura com rodinhas, face de cima
// na cor, teto mais claro com frisos e um brilho. A sombra fica na rota inteira.
function trainPiece(length, height) {
  const L = length;
  const H = height;
  const r = Math.min(3.5, H * 0.3);
  const n = v => v.toFixed(2);
  const piece = el('g', { class: 'train' });
  piece.append(
    el('rect', { class: 'train-base', x: n(-L / 2), y: n(-H / 2), width: n(L), height: n(H), rx: n(r) }),
    el('rect', { class: 'train-top', x: n(-L / 2), y: n(-H / 2), width: n(L), height: n(H * 0.74), rx: n(r) }),
    el('rect', { class: 'train-roof', x: n(-L / 2 + L * 0.07), y: n(-H / 2 + H * 0.12), width: n(L * 0.86), height: n(H * 0.44), rx: n(H * 0.2) }),
    el('line', {
      class: 'train-ribs',
      x1: n(-L / 2 + L * 0.12), x2: n(L / 2 - L * 0.12), y1: n(-H / 2 + H * 0.34), y2: n(-H / 2 + H * 0.34),
      'stroke-width': n(H * 0.3),
    }),
    el('rect', { class: 'train-shine', x: n(-L / 2 + L * 0.1), y: n(-H / 2 + H * 0.15), width: n(L * 0.8), height: n(H * 0.09), rx: n(H * 0.05) }),
  );
  for (const x of [-0.36, -0.22, 0.22, 0.36]) {
    piece.append(el('circle', { class: 'train-wheel', cx: n(L * x), cy: n(H / 2 - H * 0.13), r: n(H * 0.1) }));
  }
  return piece;
}

function placeTrains(group) {
  for (const car of group.querySelectorAll('.car')) {
    if (car.querySelector('.train')) continue;
    const slot = car.querySelector('.slot');
    car.append(trainPiece(Number(slot.getAttribute('width')), Number(slot.getAttribute('height'))));
  }
}

// Coloca as peças de trem nas rotas já conquistadas, na cor do dono.
// claimed = { routeId: corDoJogador }. Rotas novas entram animadas (animate = true).
export function paintClaimedRoutes(svg, claimed, { animate = true } = {}) {
  for (const group of svg.querySelectorAll('.route')) {
    const owner = claimed[group.dataset.route];
    const wasClaimed = group.classList.contains('claimed');
    group.classList.toggle('claimed', Boolean(owner));
    if (owner) {
      group.dataset.owner = owner;
      placeTrains(group);
      if (!wasClaimed && animate) {
        group.classList.add('just-claimed');
        setTimeout(() => group.classList.remove('just-claimed'), 2500);
      }
    } else {
      delete group.dataset.owner;
      for (const piece of group.querySelectorAll('.train')) piece.remove();
    }
  }
}

// Destaca cidades (ex.: as duas pontas de um bilhete).
export function highlightCities(svg, cityIds) {
  const wanted = new Set(cityIds);
  for (const group of svg.querySelectorAll('.city')) {
    group.classList.toggle('highlight', wanted.has(group.dataset.city));
  }
}

// Modo foco (celular): destaca algumas rotas, apaga as outras e dá zoom na
// região dessas rotas/cidades, para a pessoa ver ONDE fica no mapa.
export function focusMap(svg, { routeIds = [], cityIds = [], padding = 120 } = {}) {
  const routes = new Set(routeIds);
  svg.classList.add('focus-mode');
  for (const group of svg.querySelectorAll('.route')) {
    group.classList.toggle('focus', routes.has(group.dataset.route));
  }
  const cities = new Set(cityIds);
  for (const id of routes) {
    const [a, b] = routeEnds(id);
    cities.add(a);
    cities.add(b);
  }
  highlightCities(svg, [...cities]);

  // Zoom: caixa em volta das cidades, mantendo o formato do mapa.
  const points = [...cities].map(id => CITIES[id]).filter(Boolean);
  if (!points.length) return;
  let minX = Math.min(...points.map(p => p.x)) - padding;
  let maxX = Math.max(...points.map(p => p.x)) + padding;
  let minY = Math.min(...points.map(p => p.y)) - padding;
  let maxY = Math.max(...points.map(p => p.y)) + padding;
  const ratio = (MAP_SIZE.width + FRAME * 2) / (MAP_SIZE.height + FRAME * 2);
  let width = maxX - minX;
  let height = maxY - minY;
  if (width / height < ratio) {
    const extra = height * ratio - width;
    minX -= extra / 2;
    width += extra;
  } else {
    const extra = width / ratio - height;
    minY -= extra / 2;
    height += extra;
  }
  svg.setAttribute('viewBox', `${minX.toFixed(0)} ${minY.toFixed(0)} ${width.toFixed(0)} ${height.toFixed(0)}`);
}

function routeEnds(routeId) {
  const route = ROUTES.find(r => r.id === routeId);
  return route ? [route.a, route.b] : [];
}
