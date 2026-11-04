// Cenário do fundo do mapa, no estilo de mapa antigo gravado: desenhinhos
// (montanhas, pinheiros, cactos, capim, búfalos, navios e ondinhas no mar).
// Tudo bem clarinho e por baixo dos trilhos. Sem rios, lagos, fronteiras nem
// linha de costa: linhas compridas por baixo dos trilhos confundem com as rotas.
// O mar existe só como área (invisível) para saber onde vão os navios.
//
// As coordenadas estão no quadro do tabuleiro (1248 x 800) e são esticadas por
// SPREAD, igual às cidades. Os desenhinhos só são colocados onde não há trilho,
// nome nem cidade (o mapa passa a lista desses obstáculos).

// ---- mar (só a área, não é desenhado)
const PACIFIC_COAST = [
  [35, -30], [45, 40], [68, 70], [78, 100], [80, 135], [70, 170], [48, 205], [36, 250], [28, 300], [24, 360],
  [22, 420], [26, 470], [36, 500], [52, 535], [72, 565], [100, 595], [132, 620], [168, 645], [190, 680],
  [205, 730], [215, 830],
];
const GULF_COAST = [
  [590, 830], [605, 800], [625, 775], [655, 752], [690, 735], [725, 722], [758, 714], [800, 710], [840, 708],
  [868, 712], [885, 728], [895, 740], [905, 722], [930, 708], [965, 700], [1000, 698], [1030, 702], [1055, 716],
  [1075, 740], [1095, 770], [1110, 800], [1118, 830],
];
const ATLANTIC_COAST = [
  [1185, 830], [1182, 790], [1176, 750], [1168, 700], [1158, 660], [1148, 620], [1140, 580], [1136, 545],
  [1132, 522], [1130, 500], [1128, 470], [1132, 445], [1148, 425], [1165, 400], [1178, 375], [1188, 350],
  [1186, 320], [1178, 290], [1170, 262], [1168, 245], [1185, 232], [1210, 222], [1228, 200], [1236, 175],
  [1238, 150], [1236, 135], [1245, 118], [1258, 100], [1268, 75], [1278, 40], [1290, -30],
];
const SEAS = [
  [...PACIFIC_COAST, [-60, 830], [-60, -30]],
  [...GULF_COAST],
  [...ATLANTIC_COAST, [1520, -30], [1520, 830]],
];
const SEA_NAMES = [
  { text: 'Oceano Pacífico', x: 7, y: 395, rotate: -90 },
  { text: 'Oceano', x: 1212, y: 595 },
  { text: 'Atlântico', x: 1212, y: 612 },
  { text: 'Golfo do México', x: 845, y: 772 },
];

// ---- desenhinhos (centrados no zero). w/h = tamanho para não encostar em nada.
const GLYPHS = {
  range: {
    w: 50, h: 30, cls: 'sk-mountain',
    d: 'M-24 13 L-12 -6 L-6 2 L2 -14 L10 -2 L14 -7 L24 13 M2 -14 L5 13 M4 -8 L8 13 M6 -3 L11 13 M-12 -6 L-10 13 '
      + 'M-11 0 L-7 13 M14 -7 L16 13 M16 0 L20 13 M-2 -8 L0 -6 L2 -9 L4 -6 L6 -8 M-15 -1 L-12 1 L-10 -2',
  },
  mountain: {
    w: 32, h: 20, cls: 'sk-mountain',
    d: 'M-15 9 L-5 -8 L1 0 L6 -5 L15 9 M-5 -8 L-2 9 M-3 -3 L0 9 M6 -5 L8 9 M7 -1 L11 9 M-8 -3 L-5 -1 L-3 -4',
  },
  hill: { w: 30, h: 13, cls: 'sk-hill', d: 'M-15 6 Q-8 -7 0 6 M-4 6 Q5 -5 14 6 M-7 -1 L-5 6 M-9 1 L-8 6 M5 -1 L7 6 M3 1 L4 6' },
  tree: { w: 11, h: 17, cls: 'sk-tree', d: 'M0 -8 L5 3 L1.5 3 L1.5 7 L-1.5 7 L-1.5 3 L-5 3 Z' },
  cactus: { w: 13, h: 19, cls: 'sk-cactus', d: 'M0 9 L0 -8 M0 1 C-5 1 -5 -2 -5 -5 M0 4 C5 4 5 1 5 -3 M-6 9 L6 9' },
  grass: { w: 13, h: 8, cls: 'sk-grass', d: 'M-5 3 L-3 -3 M-1 3 L0 -4 M3 3 L5 -2 M-6 3 L6 3' },
  bison: {
    w: 27, h: 15, cls: 'sk-bison',
    d: 'M-12 2 C-12 -6 -4 -9 2 -7 C6 -10 12 -8 12 -2 L12 4 L10 4 L10 1 L5 2 L4 6 L2 6 L2 2 L-6 2 L-7 6 L-9 6 L-9 2 Z',
  },
  wave: { w: 19, h: 7, cls: 'sk-wave', d: 'M-9 0 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0' },
  ship: {
    w: 30, h: 28, cls: 'sk-ship',
    d: 'M-13 6 L13 6 L9 11 L-9 11 Z M0 6 L0 -13 M1 -12 Q10 -5 1 4 Z M-1 -10 Q-8 -4 -1 3 Z M0 -13 L5 -11 L0 -9',
  },
  lighthouse: {
    w: 14, h: 28, cls: 'sk-light',
    d: 'M-4 12 L-2 -6 L2 -6 L4 12 Z M-3 -6 L-3 -10 L3 -10 L3 -6 M-4 -10 L0 -13 L4 -10 M-3.4 6 L3.4 6 M-2.8 0 L2.8 0 '
      + 'M5 -9 L10 -11 M5 -7 L10 -5 M-5 -9 L-10 -11 M-5 -7 L-10 -5',
  },
  windmill: {
    w: 22, h: 26, cls: 'sk-mill',
    d: 'M-3 11 L-1.5 -4 L1.5 -4 L3 11 M-3 11 L3 11 M0 -5 L-8 -13 M0 -5 L8 -13 M0 -5 L-8 3 M0 -5 L8 3 '
      + 'M-8 -13 L-6 -15 M8 -13 L10 -11 M-8 3 L-10 1 M8 3 L6 5',
  },
  derrick: {
    w: 15, h: 26, cls: 'sk-derrick',
    d: 'M-6 12 L0 -12 L6 12 M-4.5 6 L4.5 6 M-3 0 L3 0 M-1.5 -6 L1.5 -6 M-5 9 L3 3 M-3.5 3 L2 -3 M-1.5 -3 L1 -9 M-8 12 L8 12',
  },
  wagon: {
    w: 32, h: 20, cls: 'sk-wagon',
    d: 'M-10 2 Q-10 -9 0 -9 Q10 -9 10 2 Z M-5 -8 L-5 2 M5 -8 L5 2 M-12 2 L12 2 L12 5 L-12 5 Z '
      + 'M-10 9 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M4 9 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M12 4 L17 6',
  },
  balloon: {
    w: 22, h: 32, cls: 'sk-balloon',
    d: 'M0 -14 C-9 -14 -10 -3 -3 3 L-2 8 L2 8 L3 3 C10 -3 9 -14 0 -14 Z M0 -14 Q-4 -5 -2 3 M0 -14 Q4 -5 2 3 '
      + 'M-2 8 L-2.5 11 M2 8 L2.5 11 M-3 11 L3 11 L2.5 14 L-2.5 14 Z',
  },
  plane: {
    w: 36, h: 18, cls: 'sk-plane',
    d: 'M-14 0 L12 -1.5 L15 0 L12 1.5 Z M-6 -5 L9 -5 M-6 2 L9 2 M-4 -5 L-4 2 M7 -5 L7 2 M-14 0 L-16 -5 L-12 -1 '
      + 'M15 -4 L15 4 M-16 2 L-22 3 M-17 -1 L-24 -1',
  },
};
// Onde cada tipo de desenho pode aparecer (polígonos no quadro do tabuleiro) e quantos.
// Os grandes vão primeiro (assim acham lugar); a ondinha é a última.
const ROCKIES = [[210, 60], [340, 50], [470, 250], [520, 420], [510, 600], [420, 600], [380, 450], [300, 300], [220, 170]];
const CASCADES = [[70, 110], [150, 110], [165, 300], [150, 520], [100, 560], [60, 500], [50, 300]];
const APPALACHIANS = [[960, 530], [1010, 535], [1140, 270], [1100, 235]];
const WEST_PLAINS = [[250, 290], [560, 290], [560, 520], [300, 520]];
const PLAINS = [[480, 200], [760, 250], [800, 600], [600, 700], [480, 560]];
const ANYWHERE = [[-60, -30], [1520, -30], [1520, 830], [-60, 830]];
const REGIONS = [
  { glyph: 'plane', count: 1, area: [[320, 10], [1000, 10], [1000, 110], [320, 110]] },
  { glyph: 'balloon', count: 1, area: [[480, 320], [820, 320], [820, 640], [480, 640]] },
  { glyph: 'range', count: 9, area: ROCKIES },
  { glyph: 'mountain', count: 16, area: ROCKIES },
  { glyph: 'range', count: 3, area: CASCADES },
  { glyph: 'mountain', count: 8, area: CASCADES },
  { glyph: 'ship', count: 5, area: ANYWHERE, water: true },
  { glyph: 'lighthouse', count: 5, area: ANYWHERE, shore: true },
  { glyph: 'wagon', count: 2, area: WEST_PLAINS },
  { glyph: 'windmill', count: 4, area: PLAINS },
  { glyph: 'derrick', count: 3, area: [[560, 590], [770, 600], [770, 705], [560, 730]] },
  { glyph: 'bison', count: 4, area: [[500, 200], [740, 240], [760, 520], [520, 520]] },
  { glyph: 'hill', count: 10, area: APPALACHIANS },
  { glyph: 'mountain', count: 4, area: APPALACHIANS },
  { glyph: 'hill', count: 4, area: [[730, 470], [840, 470], [840, 570], [730, 570]] },
  { glyph: 'tree', count: 16, area: [[60, 70], [260, 60], [300, 330], [130, 340], [60, 250]] },
  { glyph: 'tree', count: 16, area: [[560, 50], [1000, 40], [1000, 140], [700, 235], [560, 200]] },
  { glyph: 'tree', count: 14, area: [[1040, 40], [1270, 40], [1270, 230], [1100, 245], [1040, 160]] },
  { glyph: 'tree', count: 12, area: [[880, 450], [1110, 450], [1125, 690], [890, 700]] },
  { glyph: 'cactus', count: 16, area: [[160, 520], [480, 560], [560, 700], [470, 800], [220, 800], [170, 650]] },
  { glyph: 'grass', count: 22, area: PLAINS },
  { glyph: 'wave', count: 46, area: ANYWHERE, water: true },
];

function insidePolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// obstacles: { rects: [[x0,y0,x1,y1] ...], polys: [{ pts, box }] } já no tamanho do mapa.
// bounds: [x0, y0, x1, y1] — nada é desenhado fora do tabuleiro.
export function drawScenery(el, { spread, obstacles, rectHitsPoly, bounds }) {
  const scale = pts => pts.map(([x, y]) => [x * spread, y * spread]);
  const seas = SEAS.map(scale);
  const inWater = p => seas.some(poly => insidePolygon(p, poly));
  const inside = box => box[0] >= bounds[0] && box[1] >= bounds[1] && box[2] <= bounds[2] && box[3] <= bounds[3];

  const group = el('g', { class: 'map-scenery' });

  const taken = [...obstacles.rects];
  for (const name of SEA_NAMES) {
    const x = name.x * spread; const y = name.y * spread;
    const text = el('text', { class: 'sk-sea-name', x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': 'middle' });
    if (name.rotate) text.setAttribute('transform', `rotate(${name.rotate} ${x.toFixed(1)} ${y.toFixed(1)})`);
    text.textContent = name.text;
    group.append(text);
    const half = name.text.length * 4.2;
    taken.push(name.rotate ? [x - 10, y - half, x + 10, y + half] : [x - half, y - 12, x + half, y + 6]);
  }

  // Desenhinhos: sorteio sempre igual (mesma semente), só nos espaços livres.
  let seed = 20261021;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const free = box => {
    for (const r of taken) if (box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1]) return false;
    for (const poly of obstacles.polys) {
      const b = poly.box;
      if (box[0] > b[2] || box[2] < b[0] || box[1] > b[3] || box[3] < b[1]) continue;
      if (rectHitsPoly(box, poly.pts)) return false;
    }
    return true;
  };
  for (const region of REGIONS) {
    const glyph = GLYPHS[region.glyph];
    const area = scale(region.area);
    const xs = area.map(p => p[0]); const ys = area.map(p => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let placed = 0;
    for (let tries = 0; tries < region.count * 80 && placed < region.count; tries++) {
      const x = minX + random() * (maxX - minX);
      const y = minY + random() * (maxY - minY);
      if (!insidePolygon([x, y], area)) continue;
      const box = [x - glyph.w / 2 - 3, y - glyph.h / 2 - 3, x + glyph.w / 2 + 3, y + glyph.h / 2 + 3];
      const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
      if (region.water) {
        if (![...corners, [x, y]].every(inWater)) continue;
      } else if (region.shore) {
        // farol: em terra, mas com o mar logo ao lado
        if (inWater([x, y + glyph.h / 2]) || !corners.some(inWater)) continue;
      } else if ([...corners, [x, y]].some(inWater)) {
        continue;
      }
      if (!inside(box) || !free(box)) continue;
      const size = 0.85 + random() * 0.35;
      const flip = region.glyph === 'bison' || region.glyph === 'ship' ? (random() < 0.5 ? -1 : 1) : 1;
      group.append(el('path', {
        class: `map-glyph ${glyph.cls}`,
        d: glyph.d,
        transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size * flip).toFixed(2)} ${size.toFixed(2)})`,
      }));
      taken.push(box);
      placed++;
    }
  }
  return group;
}
