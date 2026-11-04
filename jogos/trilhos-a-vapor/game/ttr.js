// Regras do Trilhos a Vapor (mapa dos EUA).
//
// Etapas da partida (game.stage):
//   'tickets'  — começo: todos escolhem os bilhetes ao mesmo tempo
//   'turns'    — cada um na sua vez: comprar cartas, conquistar rota ou pegar bilhetes
//   'finished' — fim de jogo, com a contagem de pontos
//
// Tudo aqui fica só no servidor. publicState() é o que a TV e todos podem ver;
// a mão e os bilhetes de cada jogador saem só por privateState().

import { randomInt } from 'node:crypto';
import {
  CARD_COLORS, CARD_LABELS, CARD_TYPES, CARDS_PER_COLOR, LOCOMOTIVE, LOCOMOTIVE_COUNT,
} from '../public/cards.js';
import { CITIES } from '../public/map-usa.js';
import { TICKETS, TICKETS_BY_ID, ROUTE_POINTS, LONGEST_ROUTE_BONUS } from '../public/tickets-usa.js';
import { ROUTES_BY_ID, routeAvailability, citiesConnected, longestPath } from '../public/rules.js';

export const STARTING_HAND = 4;
export const FACE_UP_COUNT = 5;
export const STARTING_TRAINS = 45;
const CARDS_PER_TURN = 2;
const TICKETS_OFFERED = 3;
const START_KEEP = 2; // no começo, fica com pelo menos 2 dos 3
const DRAW_KEEP = 1; // durante o jogo, pelo menos 1 dos 3
const LAST_ROUND_TRAINS = 2; // com 2 trens ou menos, começa a última rodada
const MAX_EVENTS = 20;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildDeck() {
  const deck = [];
  for (const color of CARD_COLORS) for (let i = 0; i < CARDS_PER_COLOR; i++) deck.push(color);
  for (let i = 0; i < LOCOMOTIVE_COUNT; i++) deck.push(LOCOMOTIVE);
  return shuffle(deck);
}

function emptyHand() {
  return Object.fromEntries(CARD_TYPES.map(type => [type, 0]));
}

const cityName = id => CITIES[id].name;
const ticketText = t => `${cityName(t.a)} → ${cityName(t.b)}`;

// players: [{ id, name, color }] na ordem dos lugares.
export function createGame(players) {
  const game = {
    stage: 'tickets',
    deck: buildDeck(),
    discard: [],
    faceUp: [],
    ticketDeck: shuffle(TICKETS.map(t => t.id)),
    claimed: {}, // routeId -> playerId
    order: players.map(p => p.id),
    players: Object.fromEntries(players.map(p => [p.id, {
      name: p.name,
      color: p.color,
      hand: emptyHand(),
      trains: STARTING_TRAINS,
      score: 0,
      tickets: [], // ids dos bilhetes que ficou
      pending: null, // { offered: [ids], minKeep } enquanto escolhe bilhetes
    }])),
    turn: { index: randomInt(players.length), drawn: 0, number: 1 },
    lastRound: null, // { by: playerId } quando alguém fica com 2 trens ou menos
    results: null,
    events: [],
    eventSeq: 0,
  };

  for (const id of game.order) {
    const player = game.players[id];
    for (let i = 0; i < STARTING_HAND; i++) player.hand[takeFromDeck(game)] += 1;
    player.pending = { offered: takeTickets(game, TICKETS_OFFERED), minKeep: START_KEEP };
  }
  refillFaceUp(game);
  addEvent(game, 'A partida começou! Todos estão escolhendo os bilhetes de destino.', null, 'start');
  return game;
}

export function currentPlayerId(game) {
  return game.order[game.turn.index];
}

function currentPlayer(game) {
  return game.players[currentPlayerId(game)];
}

// Cada lance público vira um evento. `kind` diz à TV qual som/animação usar.
// PRIVACIDADE: nunca coloque aqui nada secreto (carta tirada da pilha,
// bilhetes de alguém, bilhete completo) — os eventos vão para todas as telas.
function addEvent(game, text, playerId = null, kind = 'info', extra = {}) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, text, playerId, kind, ...extra });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

// ---------------------------------------------------------------- cartas

// Pega a carta de cima da pilha. Se a pilha acabou, embaralha o descarte.
function takeFromDeck(game) {
  if (!game.deck.length && game.discard.length) {
    game.deck = shuffle(game.discard);
    game.discard = [];
    addEvent(game, 'A pilha acabou: o descarte foi embaralhado.', null, 'shuffle');
  }
  return game.deck.pop() ?? null;
}

const countLocomotives = cards => cards.filter(card => card === LOCOMOTIVE).length;

// Completa as 5 cartas da mesa. Regra: com 3 ou mais locomotivas abertas,
// descarta as 5 e abre outras (no máximo algumas vezes, se só sobrar locomotiva).
function refillFaceUp(game) {
  for (let i = 0; i < FACE_UP_COUNT; i++) {
    if (!game.faceUp[i]) game.faceUp[i] = takeFromDeck(game);
  }
  for (let attempt = 0; attempt < 3 && countLocomotives(game.faceUp) >= 3; attempt++) {
    game.discard.push(...game.faceUp.filter(Boolean));
    game.faceUp = [];
    for (let i = 0; i < FACE_UP_COUNT; i++) game.faceUp[i] = takeFromDeck(game);
    addEvent(game, 'Três coringas na mesa: as cartas abertas foram trocadas.', null, 'shuffle');
  }
}

function canDrawSecondCard(game) {
  if (game.deck.length || game.discard.length) return true;
  return game.faceUp.some(card => card && card !== LOCOMOTIVE);
}

// ---------------------------------------------------------------- vez

function assertTurn(game, playerId) {
  if (game.stage !== 'turns') throw new GameError('fora_de_hora', 'Ainda não é hora de jogar.');
  if (currentPlayerId(game) !== playerId) throw new GameError('nao_e_sua_vez', 'Ainda não é a sua vez.');
  if (game.players[playerId].pending) throw new GameError('escolha_bilhetes', 'Primeiro escolha seus bilhetes.');
}

// Começar uma ação nova (rota ou bilhetes) só antes de comprar cartas.
function assertFreshTurn(game) {
  if (game.turn.drawn > 0) throw new GameError('ja_comprou', 'Você já começou a comprar cartas nesta vez.');
}

function endTurn(game) {
  const finishingId = currentPlayerId(game);
  const finishing = game.players[finishingId];

  // Quem disparou a última rodada acabou de jogar a vez final: fim de jogo.
  if (game.lastRound && game.lastRound.by === finishingId) {
    finishGame(game);
    return;
  }
  if (!game.lastRound && finishing.trains <= LAST_ROUND_TRAINS) {
    game.lastRound = { by: finishingId };
    addEvent(game, `${finishing.name} ficou com ${finishing.trains} trens: ÚLTIMA RODADA! Cada um joga mais uma vez.`, finishingId, 'lastRound');
  }
  game.turn = { index: (game.turn.index + 1) % game.order.length, drawn: 0, number: game.turn.number + 1 };
}

function afterDraw(game) {
  game.turn.drawn += 1;
  if (game.turn.drawn >= CARDS_PER_TURN || !canDrawSecondCard(game)) endTurn(game);
}

// Pega uma das 5 cartas abertas.
export function drawFaceUp(game, playerId, index) {
  assertTurn(game, playerId);
  const card = game.faceUp[index];
  if (!card) throw new GameError('carta_inexistente', 'Essa carta não está mais na mesa.');
  if (card === LOCOMOTIVE && game.turn.drawn > 0) {
    throw new GameError('locomotiva_segunda', 'Na segunda carta não dá para pegar o coringa da mesa.');
  }

  const player = game.players[playerId];
  player.hand[card] += 1;
  game.faceUp[index] = takeFromDeck(game);
  addEvent(game, `${player.name} pegou ${CARD_LABELS[card]} da mesa.`, playerId, 'card', { index });
  refillFaceUp(game);

  if (card === LOCOMOTIVE) endTurn(game); // locomotiva aberta vale a vez inteira
  else afterDraw(game);
  return { card };
}

// Compra a carta de cima da pilha (ninguém vê qual é, só quem comprou).
export function drawDeck(game, playerId) {
  assertTurn(game, playerId);
  const card = takeFromDeck(game);
  if (!card) throw new GameError('pilha_vazia', 'Não tem mais cartas na pilha.');

  const player = game.players[playerId];
  player.hand[card] += 1;
  // (sem dizer qual carta: isso é segredo de quem comprou)
  addEvent(game, `${player.name} comprou uma carta da pilha.`, playerId, 'card');
  afterDraw(game);
  return { card };
}

// ---------------------------------------------------------------- rotas

// Conquista uma rota pagando `count` cartas de `color` + `locomotives` locomotivas.
export function claimRoute(game, playerId, routeId, payment) {
  assertTurn(game, playerId);
  assertFreshTurn(game);
  const route = ROUTES_BY_ID[routeId];
  if (!route) throw new GameError('rota_inexistente', 'Essa rota não existe.');

  const availability = routeAvailability(route, game.claimed, playerId, game.order.length);
  if (!availability.ok) throw new GameError('rota_indisponivel', availability.reason);

  const player = game.players[playerId];
  if (player.trains < route.length) {
    throw new GameError('sem_trens', `Você só tem ${player.trains} trens.`);
  }

  const locomotives = Number(payment?.locomotives) || 0;
  const count = route.length - locomotives;
  if (!Number.isInteger(locomotives) || locomotives < 0 || count < 0) {
    throw new GameError('pagamento_invalido', 'Pagamento inválido.');
  }
  let color = null;
  if (count > 0) {
    color = route.color === 'cinza' ? payment?.color : route.color;
    if (!CARD_COLORS.includes(color)) throw new GameError('pagamento_invalido', 'Escolha a cor das cartas.');
    if (player.hand[color] < count) throw new GameError('cartas_insuficientes', `Faltam cartas ${CARD_LABELS[color]}.`);
  }
  if (player.hand[LOCOMOTIVE] < locomotives) throw new GameError('cartas_insuficientes', 'Faltam coringas.');

  // Paga: as cartas vão para o descarte.
  if (color) {
    player.hand[color] -= count;
    for (let i = 0; i < count; i++) game.discard.push(color);
  }
  player.hand[LOCOMOTIVE] -= locomotives;
  for (let i = 0; i < locomotives; i++) game.discard.push(LOCOMOTIVE);

  player.trains -= route.length;
  const points = ROUTE_POINTS[route.length];
  player.score += points;
  game.claimed[route.id] = playerId;
  const cars = `${route.length} ${route.length > 1 ? 'vagões' : 'vagão'}`;
  addEvent(game, `${player.name} conquistou ${cityName(route.a)} – ${cityName(route.b)} (${cars}, +${points} pts).`, playerId, 'claim', {
    routeId: route.id,
    length: route.length,
    points,
  });
  endTurn(game);
  return { route, points };
}

// ---------------------------------------------------------------- bilhetes

function takeTickets(game, howMany) {
  return game.ticketDeck.splice(-howMany).reverse();
}

// Durante o jogo: pega 3 bilhetes novos (a vez acaba quando escolher).
export function drawTickets(game, playerId) {
  assertTurn(game, playerId);
  assertFreshTurn(game);
  const offered = takeTickets(game, TICKETS_OFFERED);
  if (!offered.length) throw new GameError('sem_bilhetes', 'Acabaram os bilhetes de destino.');
  const player = game.players[playerId];
  player.pending = { offered, minKeep: DRAW_KEEP };
  addEvent(game, `${player.name} pegou bilhetes novos e está escolhendo.`, playerId, 'tickets');
}

export function chooseTickets(game, playerId, keepIds) {
  const player = game.players[playerId];
  if (!player?.pending) throw new GameError('sem_escolha', 'Não há bilhetes para escolher agora.');
  const { offered, minKeep } = player.pending;
  const keep = [...new Set(keepIds ?? [])].filter(id => offered.includes(id));
  const needed = Math.min(minKeep, offered.length);
  if (keep.length < needed) {
    throw new GameError('poucos_bilhetes', `Fique com pelo menos ${needed} ${needed > 1 ? 'bilhetes' : 'bilhete'}.`);
  }

  player.tickets.push(...keep);
  // Os devolvidos vão para o fundo da pilha.
  game.ticketDeck.unshift(...offered.filter(id => !keep.includes(id)));
  player.pending = null;
  addEvent(game, `${player.name} ficou com ${keep.length} ${keep.length > 1 ? 'bilhetes' : 'bilhete'}.`, playerId, 'tickets');

  if (game.stage === 'tickets') {
    if (game.order.every(id => !game.players[id].pending)) {
      game.stage = 'turns';
      addEvent(game, `Todos escolheram! ${currentPlayer(game).name} começa.`, null, 'go');
    }
  } else if (currentPlayerId(game) === playerId) {
    endTurn(game); // pegar bilhetes ocupa a vez inteira
  }
}

// O líder pode destravar a partida quando alguém caiu: os bilhetes que essa
// pessoa estava escolhendo ficam todos com ela, e a vez passa.
export function skipOfflinePlayers(game, offlineIds) {
  const offline = new Set(offlineIds);
  if (game.stage === 'tickets') {
    let changed = false;
    for (const id of game.order) {
      if (offline.has(id) && game.players[id].pending) {
        chooseTickets(game, id, game.players[id].pending.offered);
        changed = true;
      }
    }
    return changed;
  }
  if (game.stage === 'turns' && offline.has(currentPlayerId(game))) {
    const player = currentPlayer(game);
    if (player.pending) {
      chooseTickets(game, currentPlayerId(game), player.pending.offered); // já passa a vez
    } else {
      addEvent(game, `${player.name} está desconectado: a vez foi pulada.`);
      endTurn(game);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- fim de jogo

function playerRoutes(game, playerId) {
  return Object.keys(game.claimed).filter(id => game.claimed[id] === playerId);
}

function finishGame(game) {
  const longest = Object.fromEntries(game.order.map(id => [id, longestPath(playerRoutes(game, id))]));
  const best = Math.max(...Object.values(longest));

  const results = game.order.map(id => {
    const player = game.players[id];
    const routes = playerRoutes(game, id);
    const tickets = player.tickets.map(ticketId => {
      const t = TICKETS_BY_ID[ticketId];
      return { ...t, done: citiesConnected(routes, t.a, t.b) };
    });
    const ticketPoints = tickets.reduce((sum, t) => sum + (t.done ? t.points : -t.points), 0);
    const longestBonus = best > 0 && longest[id] === best ? LONGEST_ROUTE_BONUS : 0;
    return {
      id,
      routePoints: player.score,
      tickets,
      ticketPoints,
      ticketsDone: tickets.filter(t => t.done).length,
      longest: longest[id],
      longestBonus,
      total: player.score + ticketPoints + longestBonus,
    };
  });

  // Desempate: mais bilhetes completos, depois quem tem o maior caminho.
  results.sort((x, y) => y.total - x.total || y.ticketsDone - x.ticketsDone || y.longestBonus - x.longestBonus);
  const top = results[0];
  game.results = results.map(r => ({
    ...r,
    winner: r.total === top.total && r.ticketsDone === top.ticketsDone && r.longestBonus === top.longestBonus,
  }));
  game.stage = 'finished';
  const winners = game.results.filter(r => r.winner).map(r => game.players[r.id].name);
  addEvent(game, `Fim de jogo! ${winners.join(' e ')} ${winners.length > 1 ? 'venceram' : 'venceu'}.`, null, 'finish');
}

// ---------------------------------------------------------------- o que cada um vê

export function publicState(game) {
  return {
    stage: game.stage,
    turnPlayerId: currentPlayerId(game),
    turnNumber: game.turn.number,
    cardsDrawn: game.turn.drawn,
    cardsPerTurn: CARDS_PER_TURN,
    faceUp: game.faceUp,
    deckCount: game.deck.length,
    discardCount: game.discard.length,
    ticketDeckCount: game.ticketDeck.length,
    claimed: game.claimed,
    lastRound: game.lastRound,
    players: game.order.map(id => {
      const p = game.players[id];
      return {
        id,
        handCount: Object.values(p.hand).reduce((sum, n) => sum + n, 0),
        trains: p.trains,
        score: p.score,
        ticketCount: p.tickets.length,
        choosingTickets: Boolean(p.pending),
      };
    }),
    events: game.events.slice(-6),
    results: game.results, // só existe no fim (aí os bilhetes de todos são revelados)
  };
}

export function privateState(game, playerId) {
  const player = game.players[playerId];
  if (!player) return null;
  const routes = playerRoutes(game, playerId);
  return {
    hand: player.hand,
    tickets: player.tickets.map(id => {
      const t = TICKETS_BY_ID[id];
      return { ...t, done: citiesConnected(routes, t.a, t.b) };
    }),
    pending: player.pending
      ? { minKeep: player.pending.minKeep, offered: player.pending.offered.map(id => TICKETS_BY_ID[id]) }
      : null,
  };
}

export { ticketText };
