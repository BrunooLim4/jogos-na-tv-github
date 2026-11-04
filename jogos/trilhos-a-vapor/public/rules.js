// Regras das rotas, compartilhadas pelo servidor (que decide) e pelo
// celular (que mostra as opções). Assim os dois sempre concordam.
import { ROUTES } from './map-usa.js';
import { CARD_COLORS, LOCOMOTIVE } from './cards.js';
import { ROUTE_POINTS as ROUTE_POINTS_BY_LENGTH } from './tickets-usa.js';

export const ROUTES_BY_ID = Object.fromEntries(ROUTES.map(r => [r.id, r]));

// A outra faixa de uma rota dupla (ou null).
export function siblingRoute(route) {
  if (route.lanes < 2) return null;
  return ROUTES.find(r => r.a === route.a && r.b === route.b && r.lane !== route.lane) ?? null;
}

// Pode este jogador pôr trens nesta rota? (sem olhar cartas nem trens)
// claimed = { routeId: playerId }.
// Rota dupla: com 2 ou 3 jogadores só uma faixa pode ser usada; com 4 ou 5,
// as duas, mas não pelo mesmo jogador.
export function routeAvailability(route, claimed, playerId, playerCount) {
  if (claimed[route.id]) return { ok: false, reason: 'Essa rota já tem dono.' };
  const sibling = siblingRoute(route);
  if (sibling && claimed[sibling.id]) {
    if (claimed[sibling.id] === playerId) return { ok: false, reason: 'Você já tem a outra faixa dessa rota.' };
    if (playerCount <= 3) return { ok: false, reason: 'Com até 3 jogadores, só uma faixa da rota dupla pode ser usada.' };
  }
  return { ok: true };
}

// Formas de pagar uma rota com as cartas da mão.
// Devolve [{ color, count, locomotives }] — `count` cartas de `color` + locomotivas.
export function paymentOptions(route, hand) {
  const n = route.length;
  const locos = hand[LOCOMOTIVE] ?? 0;
  const colors = route.color === 'cinza' ? CARD_COLORS : [route.color];
  const options = [];
  for (const color of colors) {
    const have = hand[color] ?? 0;
    for (let k = Math.max(0, n - have); k <= Math.min(n - 1, locos); k++) {
      options.push({ color, count: n - k, locomotives: k });
    }
  }
  if (locos >= n) options.push({ color: LOCOMOTIVE, count: 0, locomotives: n }); // só locomotivas
  // Primeiro as que gastam menos locomotivas (elas são preciosas).
  return options.sort((x, y) => x.locomotives - y.locomotives || y.count - x.count);
}

// As rotas de um jogador viram um "grafo" de cidades.
function adjacency(routeIds) {
  const graph = new Map();
  for (const id of routeIds) {
    const r = ROUTES_BY_ID[id];
    if (!graph.has(r.a)) graph.set(r.a, []);
    if (!graph.has(r.b)) graph.set(r.b, []);
    graph.get(r.a).push({ to: r.b, route: r });
    graph.get(r.b).push({ to: r.a, route: r });
  }
  return graph;
}

// As duas cidades estão ligadas pelas rotas deste jogador?
export function citiesConnected(routeIds, a, b) {
  const graph = adjacency(routeIds);
  if (!graph.has(a) || !graph.has(b)) return false;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const city = queue.shift();
    if (city === b) return true;
    for (const { to } of graph.get(city)) {
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return false;
}

// Maior caminho contínuo (soma dos vagões), sem repetir rota — pode repetir cidade.
export function longestPath(routeIds) {
  const graph = adjacency(routeIds);
  let best = 0;
  const used = new Set();
  function walk(city, length) {
    if (length > best) best = length;
    for (const { to, route } of graph.get(city)) {
      if (used.has(route.id)) continue;
      used.add(route.id);
      walk(to, length + route.length);
      used.delete(route.id);
    }
  }
  for (const city of graph.keys()) walk(city, 0);
  return best;
}

// Plano para um bilhete: o caminho mais barato entre as duas cidades usando as
// rotas do jogador (custo 0) e as livres (custo = vagões).
// Devolve { done, blocked, steps: [rotas livres que faltam], mine: [rotas já suas no caminho] }.
export function ticketPlan(ticket, claimed, playerId, playerCount) {
  const mine = Object.keys(claimed).filter(id => claimed[id] === playerId);
  if (citiesConnected(mine, ticket.a, ticket.b)) return { done: true, blocked: false, steps: [], mine: [] };

  const usable = ROUTES.filter(r => claimed[r.id] === playerId
    || routeAvailability(r, claimed, playerId, playerCount).ok);
  const graph = adjacency(usable.map(r => r.id));
  if (!graph.has(ticket.a) || !graph.has(ticket.b)) return { done: false, blocked: true, steps: [], mine: [] };

  // Dijkstra simples (36 cidades: dá para fazer sem fila de prioridade).
  const dist = new Map([[ticket.a, 0]]);
  const via = new Map();
  const visited = new Set();
  while (true) {
    let city = null;
    for (const [c, d] of dist) if (!visited.has(c) && (city === null || d < dist.get(city))) city = c;
    if (city === null || city === ticket.b) break;
    visited.add(city);
    for (const { to, route } of graph.get(city) ?? []) {
      const cost = dist.get(city) + (claimed[route.id] === playerId ? 0 : route.length);
      if (!dist.has(to) || cost < dist.get(to)) {
        dist.set(to, cost);
        via.set(to, { from: city, route });
      }
    }
  }
  if (!via.has(ticket.b)) return { done: false, blocked: true, steps: [], mine: [] };

  const steps = [];
  const owned = [];
  for (let city = ticket.b; city !== ticket.a; city = via.get(city).from) {
    const { route } = via.get(city);
    (claimed[route.id] === playerId ? owned : steps).unshift(route);
  }
  return { done: false, blocked: false, steps, mine: owned };
}

// { routeId: [ids dos bilhetes que essa rota ajudaria] } — só rotas livres.
export function suggestRoutes(tickets, claimed, playerId, playerCount) {
  const help = {};
  for (const ticket of tickets) {
    for (const route of ticketPlan(ticket, claimed, playerId, playerCount).steps) {
      (help[route.id] ??= []).push(ticket.id);
      // a outra faixa da rota dupla também serve
      const sibling = siblingRoute(route);
      if (sibling && routeAvailability(sibling, claimed, playerId, playerCount).ok) {
        (help[sibling.id] ??= []).push(ticket.id);
      }
    }
  }
  return help;
}

// ---------------------------------------------------------------- melhores jogadas

// Quantas cartas ainda faltam para pagar a rota (contando as locomotivas).
export function cardsMissing(route, hand) {
  const locos = hand[LOCOMOTIVE] ?? 0;
  const colors = route.color === 'cinza' ? CARD_COLORS : [route.color];
  const best = Math.max(0, ...colors.map(c => hand[c] ?? 0));
  return Math.max(route.length - best - locos, 0);
}

// Menor "custo" para ligar a → b. Rotas do jogador e as de `free` valem 0; as
// livres valem `costOf(rota)`; as bloqueadas não servem. null = impossível.
function cheapestConnection(a, b, usable, costOf) {
  const graph = adjacency(usable);
  if (!graph.has(a) || !graph.has(b)) return null;
  const dist = new Map([[a, 0]]);
  const visited = new Set();
  while (true) {
    let city = null;
    for (const [c, d] of dist) if (!visited.has(c) && (city === null || d < dist.get(city))) city = c;
    if (city === null) return null;
    if (city === b) return dist.get(b);
    visited.add(city);
    for (const { to, route } of graph.get(city) ?? []) {
      const cost = dist.get(city) + costOf(route);
      if (!dist.has(to) || cost < dist.get(to)) dist.set(to, cost);
    }
  }
}

// Todas as rotas que o jogador consegue pagar AGORA, cada uma com uma nota
// (score) e o motivo, da melhor para a pior. Uma por par de cidades (na rota
// dupla, a faixa mais barata). Para cada bilhete aberto, mede quanto a rota
// adianta o caminho — por qualquer caminho, não só o mais curto — e o custo
// do caminho já leva em conta as cartas da mão (rota que você já consegue
// pagar "custa" menos). Assim aparecem também jogadas por caminhos alternativos.
//
// Devolve [{ route, payment, score, points, helps: [{ ticket, completes }] }].
export function rankRoutes({ hand, tickets, claimed, playerId, playerCount, trains, colorsToKeep = new Set() }) {
  const mine = id => claimed[id] === playerId;
  const usableIds = ROUTES.filter(r => mine(r.id) || routeAvailability(r, claimed, playerId, playerCount).ok).map(r => r.id);
  // Custo de uma rota livre: os trens + um pouco pelas cartas que ainda faltam.
  const baseCost = r => r.length + 0.5 * cardsMissing(r, hand);
  const openTickets = tickets.filter(t => !t.done);
  const before = new Map(openTickets.map(t => [t.id, cheapestConnection(t.a, t.b, usableIds, r => (mine(r.id) ? 0 : baseCost(r)))]));

  const bestByPair = new Map();
  for (const route of ROUTES) {
    if (trains < route.length) continue;
    if (!routeAvailability(route, claimed, playerId, playerCount).ok) continue;
    const options = paymentOptions(route, hand);
    if (!options.length) continue;
    const payment = bestPayment(options, hand, colorsToKeep);
    const points = ROUTE_POINTS_BY_LENGTH[route.length];

    // Quanto cada bilhete anda se esta rota for sua.
    const helps = [];
    let ticketValue = 0;
    for (const ticket of openTickets) {
      const was = before.get(ticket.id);
      if (was === null || was === 0) continue;
      const now = cheapestConnection(ticket.a, ticket.b, usableIds,
        r => (mine(r.id) || r.a === route.a && r.b === route.b ? 0 : baseCost(r)));
      const gain = was - now;
      if (gain < 0.75) continue; // não adianta (ou quase nada)
      const completes = now === 0;
      helps.push({ ticket, completes });
      // Bilhete vale 2× os pontos (se completar ganha; se não, perde).
      ticketValue += (Math.min(gain, was) / was) * ticket.points * 2 + (completes ? 4 : 0);
    }

    // Coringa é precioso (serve em qualquer rota): gastar custa caro na nota.
    const score = points + ticketValue
      - payment.locomotives * 5
      - (route.color === 'cinza' && colorsToKeep.has(payment.color) ? 1.5 : 0);
    const item = { route, payment, score, points, helps };
    const key = `${route.a}-${route.b}`;
    const current = bestByPair.get(key);
    if (!current || item.score > current.score) bestByPair.set(key, item);
  }
  return [...bestByPair.values()].sort((x, y) => y.score - x.score || y.route.length - x.route.length);
}

// Melhor forma de pagar (para o celular já sugerir): menos locomotivas e,
// em rota cinza, de preferência uma cor que você não está juntando para os
// seus bilhetes (colorsToKeep); depois, a cor de que você tem mais cartas.
export function bestPayment(options, hand, colorsToKeep = new Set()) {
  return [...options].sort((x, y) =>
    x.locomotives - y.locomotives
    || Number(colorsToKeep.has(x.color)) - Number(colorsToKeep.has(y.color))
    || (hand[y.color] ?? 0) - (hand[x.color] ?? 0))[0] ?? null;
}
