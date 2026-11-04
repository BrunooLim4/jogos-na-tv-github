// Procura curvas (ROUTE_SHAPES) que deixem os trens perto das cidades sem um
// trilho encostar no outro. Uso: node tools/ajustar-curvas.mjs public  (só mostra as curvas sugeridas; não grava nada)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const folder = path.resolve(process.argv[2]);
const usa = await import(pathToFileURL(path.join(folder, 'map-usa.js')).href);
const view = await import(pathToFileURL(path.join(folder, 'map-view.js')).href);
const { ROUTES, CITIES, ROUTE_SHAPES, SPREAD } = usa;
const { PATHS, computeEndMargins, carLayout, carCorners, rectsOverlap } = view;

const LINKS = [...new Map(ROUTES.map(r => [`${r.a}-${r.b}`, r])).keys()];
const original = Object.fromEntries(LINKS.map(k => [k, ROUTE_SHAPES[k] ?? 0]));

function evaluate() {
  PATHS.clear();
  const margins = computeEndMargins();
  let cost = 0;
  const detail = [];
  for (const [key, m] of margins) {
    for (const end of ['start', 'end']) {
      const extra = Math.max(0, m[end] - 24);
      cost += extra * extra;
      if (extra > 0) detail.push(`${key}:${end}=${m[end]}`);
    }
  }
  // trilhos que se cruzam no meio (sem cidade em comum) e trilho em cima de outra cidade
  const cars = [];
  for (const route of ROUTES) {
    for (const car of carLayout(route, margins.get(`${route.a}-${route.b}`))) {
      const rect = carCorners(car, 1);
      const xs = rect.map(p => p[0]); const ys = rect.map(p => p[1]);
      cars.push({ route, rect, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], car });
    }
  }
  let crossings = 0; let overCity = 0;
  for (let i = 0; i < cars.length; i++) {
    const A = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const B = cars[j];
      if (A.route.a === B.route.a && A.route.b === B.route.b) continue;
      if (A.box[2] < B.box[0] || B.box[2] < A.box[0] || A.box[3] < B.box[1] || B.box[3] < A.box[1]) continue;
      if (rectsOverlap(A.rect, B.rect)) crossings++;
    }
    for (const [id, c] of Object.entries(CITIES)) {
      if (id === A.route.a || id === A.route.b) continue;
      if (Math.hypot(c.x - A.car.x, c.y - A.car.y) < A.car.length / 2 + 18) overCity++;
    }
  }
  cost += crossings * 5000 + overCity * 3000;
  for (const key of LINKS) cost += Math.abs((ROUTE_SHAPES[key] ?? 0) - original[key]) * 0.6;
  return { cost, crossings, overCity, detail };
}

const start = evaluate();
console.log('antes:', Math.round(start.cost), 'cruzamentos', start.crossings, 'sobre cidade', start.overCity);
console.log('pontas longe:', start.detail.join(' '));

// Rotas a ajustar: as que têm ponta longe e as vizinhas delas (mesma cidade)
const far = new Set(start.detail.map(d => d.split(':')[0]));
const cities = new Set([...far].flatMap(k => k.split('-')));
const tune = LINKS.filter(k => far.has(k) || k.split('-').some(c => cities.has(c)));
console.log('rotas testadas:', tune.length);

let best = start.cost;
for (let pass = 0; pass < 3; pass++) {
  let improved = false;
  for (const key of tune) {
    const current = ROUTE_SHAPES[key] ?? 0;
    let bestValue = current;
    for (const delta of [-36, -24, -16, -10, -6, -3, 3, 6, 10, 16, 24, 36]) {
      const value = current + delta;
      if (Math.abs(value) > 60 * SPREAD) continue;
      ROUTE_SHAPES[key] = value;
      const r = evaluate();
      if (r.cost < best - 1) { best = r.cost; bestValue = value; improved = true; }
    }
    ROUTE_SHAPES[key] = bestValue;
  }
  console.log(`passada ${pass + 1}: custo ${Math.round(best)}`);
  if (!improved) break;
}

const end = evaluate();
console.log('depois:', Math.round(end.cost), 'cruzamentos', end.crossings, 'sobre cidade', end.overCity);
console.log('pontas longe:', end.detail.join(' '));
const changed = {};
for (const key of LINKS) {
  const v = ROUTE_SHAPES[key] ?? 0;
  if (Math.abs(v - original[key]) > 0.01 || original[key]) changed[key] = Math.round((v / SPREAD) * 10) / 10;
}
console.log('BENDS=' + JSON.stringify(changed));
