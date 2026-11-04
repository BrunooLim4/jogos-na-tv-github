// Regras do Tom Sobre Tom (sem nada de rede: dá para testar sozinho em
// tools/teste-regras.mjs). O servidor só chama estas funções.
//
// A rodada, como no jogo de mesa:
//   1. quem dá a dica recebe uma carta com 4 cores e escolhe uma (segredo);
//   2. dá a 1ª dica (1 palavra) — escrita no celular (aparece na TV) ou falada;
//   3. cada um, em ordem (sentido horário), põe 1 cone numa cor do tabuleiro
//      (uma casa só aguenta 1 cone);
//   4. 2ª dica (até 2 palavras), ou "passar" (revela já);
//   5. cada um põe o 2º cone, agora na ordem contrária;
//   6. revela: o quadro de pontos fica em volta da cor certa.
// Pontos de cada cone: na cor certa 3; dentro do quadro (as 8 casas em volta) 2;
// encostado por fora do quadro 1. Quem deu a dica: 1 por cone dentro do quadro
// (com 3 jogadores, 2 por cone). Cada um dá a dica 2 vezes (3 a 6 jogadores) ou
// 1 vez (7 ou mais). Empate: ganha quem deu a dica por último.
//
// PRIVACIDADE: publicState() é o que a TV (e todos) recebem — nunca a carta nem a
// cor escolhida antes da revelação. privateState() vai só para o dono do celular.

import { randomInt } from 'node:crypto';
import { CELLS, isCell, distance, cellName } from '../public/cores.js';
import { checkCue } from '../public/dicas.js';

const MAX_EVENTS = 8;
const CARD_SIZE = 4;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

// Pontos de um cone pela distância até a cor certa (0 = na cor; 1 = dentro do
// quadro; 2 = encostado por fora).
export const conePoints = d => (d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0);

// `players` = [{ id, name }] na ordem da roda. `random(n)` = sorteio de 0 a n-1
// (os testes passam um sorteio fixo).
export function createGame(players, { random = randomInt } = {}) {
  const count = players.length;
  const game = {
    players: players.map(p => ({ id: p.id, name: p.name, score: 0, lastCueRound: 0 })),
    totalRounds: count * (count <= 6 ? 2 : 1),
    round: 0,
    stage: 'dica1',
    cueGiver: 0,
    card: [],
    target: null,
    cue1: null,
    cue2: null,
    order: [],
    turn: 0,
    pieces: [],
    result: null,
    ranking: null,
    random,
    events: [],
    eventSeq: 0,
  };
  addEvent(game, 'start', `A partida começou! ${game.totalRounds} rodadas.`);
  startRound(game, 1);
  return game;
}

// Lances públicos (os últimos). A TV anima e toca som pelo `kind`, nunca por segredo.
function addEvent(game, kind, text, data = {}) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, text, ...data });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

const nameOf = (game, id) => game.players.find(p => p.id === id)?.name ?? '?';
const cueGiverId = game => game.players[game.cueGiver].id;

// A carta: 4 cores bem espalhadas pelo tabuleiro (pelo menos 5 casas uma da outra).
function drawCard(game) {
  const card = [];
  for (let tries = 0; card.length < CARD_SIZE && tries < 2000; tries++) {
    const cell = game.random(CELLS);
    if (card.every(other => distance(cell, other) >= 5)) card.push(cell);
  }
  while (card.length < CARD_SIZE) card.push((card.at(-1) + 97) % CELLS);
  return card;
}

function startRound(game, round) {
  game.round = round;
  game.cueGiver = (round - 1) % game.players.length;
  game.stage = 'dica1';
  game.card = drawCard(game);
  game.target = null;
  game.cue1 = null;
  game.cue2 = null;
  game.order = [];
  game.turn = 0;
  game.pieces = [];
  game.result = null;
  const id = cueGiverId(game);
  addEvent(game, 'round', `Rodada ${round}: vez de ${nameOf(game, id)} dar a dica.`, { round, cueGiverId: id });
  if (round === game.totalRounds && round > 1) addEvent(game, 'lastRound', 'Última rodada!');
}

// Quem põe cone nesta volta: 1ª volta em sentido horário a partir de quem está
// depois de quem dá a dica; 2ª volta ao contrário.
function guessers(game) {
  const n = game.players.length;
  return Array.from({ length: n - 1 }, (_, i) => game.players[(game.cueGiver + 1 + i) % n].id);
}

function requireCueGiver(game, playerId, stage) {
  if (game.stage !== stage) throw new GameError('fora_de_hora', 'Agora não é hora da dica.');
  if (cueGiverId(game) !== playerId) throw new GameError('nao_e_sua_vez', 'Quem dá a dica agora é outra pessoa.');
}

// Monta a dica: escrita (conferida) ou falada em voz alta.
function makeCue(raw, spoken, maxWords) {
  if (spoken) return { text: null, spoken: true };
  const checked = checkCue(raw, maxWords);
  if (!checked.ok) throw new GameError('dica_invalida', checked.error);
  return { text: checked.text, spoken: false };
}

// 1ª dica: escolhe a cor (uma das 4 da carta) e dá a dica de 1 palavra.
export function giveFirstCue(game, playerId, { target, text, spoken = false }) {
  requireCueGiver(game, playerId, 'dica1');
  if (!game.card.includes(target)) throw new GameError('cor_invalida', 'Escolha uma das 4 cores da sua carta.');
  game.cue1 = makeCue(text, spoken, 1);
  game.target = target;
  game.stage = 'cones1';
  game.order = guessers(game);
  game.turn = 0;
  addEvent(game, 'cue', game.cue1.spoken ? `${nameOf(game, playerId)} falou a 1ª dica.` : `1ª dica: "${game.cue1.text}"`,
    { n: 1, cueGiverId: playerId, cue: game.cue1.text, spoken: game.cue1.spoken });
}

// 2ª dica (até 2 palavras), ou passar: aí revela sem a 2ª volta de cones.
export function giveSecondCue(game, playerId, { text, spoken = false, pass = false }) {
  requireCueGiver(game, playerId, 'dica2');
  if (pass) {
    game.cue2 = { text: null, spoken: false, passed: true };
    addEvent(game, 'cue', `${nameOf(game, playerId)} passou a 2ª dica.`, { n: 2, cueGiverId: playerId, passed: true });
    return reveal(game);
  }
  game.cue2 = { ...makeCue(text, spoken, 2), passed: false };
  game.stage = 'cones2';
  game.order = guessers(game).reverse();
  game.turn = 0;
  addEvent(game, 'cue', game.cue2.spoken ? `${nameOf(game, playerId)} falou a 2ª dica.` : `2ª dica: "${game.cue2.text}"`,
    { n: 2, cueGiverId: playerId, cue: game.cue2.text, spoken: game.cue2.spoken });
}

export const turnId = game => (game.stage === 'cones1' || game.stage === 'cones2') ? game.order[game.turn] ?? null : null;

// Põe o cone de quem está na vez numa casa livre.
export function placeCone(game, playerId, cell) {
  if (game.stage !== 'cones1' && game.stage !== 'cones2') throw new GameError('fora_de_hora', 'Agora não é hora de pôr cone.');
  if (turnId(game) !== playerId) throw new GameError('nao_e_sua_vez', 'Espere a sua vez de pôr o cone.');
  if (!isCell(cell)) throw new GameError('casa_invalida', 'Escolha uma cor do tabuleiro.');
  if (game.pieces.some(p => p.cell === cell)) throw new GameError('casa_ocupada', 'Essa cor já tem um cone. Escolha outra.');
  const n = game.stage === 'cones1' ? 1 : 2;
  game.pieces.push({ playerId, cell, n });
  addEvent(game, 'cone', `${nameOf(game, playerId)} pôs o cone em ${cellName(cell)}.`, { playerId, cell, n });
  advanceTurn(game);
}

function advanceTurn(game) {
  game.turn += 1;
  if (game.turn < game.order.length) return;
  if (game.stage === 'cones1') {
    game.stage = 'dica2';
    game.order = [];
    game.turn = 0;
  } else {
    reveal(game);
  }
}

// Revela a cor e conta os pontos.
function reveal(game) {
  const target = game.target;
  const giver = game.players[game.cueGiver];
  const pieces = game.pieces.map(p => {
    const d = distance(p.cell, target);
    return { ...p, d, points: conePoints(d) };
  });
  const perCone = game.players.length === 3 ? 2 : 1;
  const giverPoints = pieces.filter(p => p.d <= 1).length * perCone;
  const points = Object.fromEntries(game.players.map(p => [p.id, 0]));
  for (const p of pieces) points[p.playerId] += p.points;
  points[giver.id] += giverPoints;
  for (const player of game.players) player.score += points[player.id];
  giver.lastCueRound = game.round;

  game.stage = 'revelacao';
  game.order = [];
  game.result = { round: game.round, target, card: game.card, cueGiverId: giver.id, giverPoints, pieces, points };
  addEvent(game, 'reveal', `A cor era ${cellName(target)}.`, { result: game.result });
  if (game.round >= game.totalRounds) finish(game);
}

function finish(game) {
  game.stage = 'fim';
  // Mais pontos primeiro; empate: quem deu a dica por último.
  const sorted = [...game.players].sort((a, b) => b.score - a.score || b.lastCueRound - a.lastCueRound);
  game.ranking = sorted.map((p, i) => ({ id: p.id, score: p.score, place: i + 1 }));
  const winner = sorted[0];
  addEvent(game, 'finish', `${winner.name} venceu com ${winner.score} pontos!`, { ranking: game.ranking });
}

// Depois da revelação: quem dá a próxima dica (ou o líder) começa a próxima rodada.
export function nextRound(game, playerId, { isLeader = false } = {}) {
  if (game.stage !== 'revelacao') throw new GameError('fora_de_hora', 'A rodada ainda não acabou.');
  const nextGiver = game.players[game.round % game.players.length].id;
  if (playerId !== nextGiver && !isLeader) {
    throw new GameError('nao_e_sua_vez', `Quem começa a próxima rodada é ${nameOf(game, nextGiver)} (ou o líder).`);
  }
  startRound(game, game.round + 1);
}

// O líder pula quem caiu e está travando a partida. Devolve true se mudou algo.
export function skipOfflinePlayers(game, offlineIds) {
  const offline = new Set(offlineIds);
  const giver = cueGiverId(game);
  if (game.stage === 'dica1' && offline.has(giver)) {
    addEvent(game, 'skip', `${nameOf(game, giver)} caiu: a rodada foi pulada.`, { playerId: giver });
    if (game.round >= game.totalRounds) {
      finish(game);
    } else {
      startRound(game, game.round + 1);
    }
    return true;
  }
  if (game.stage === 'dica2' && offline.has(giver)) {
    giveSecondCue(game, giver, { pass: true });
    return true;
  }
  const turn = turnId(game);
  if (turn && offline.has(turn)) {
    addEvent(game, 'skip', `${nameOf(game, turn)} caiu: a vez foi pulada.`, { playerId: turn });
    advanceTurn(game);
    return true;
  }
  return false;
}

// O que todos podem ver (a TV recebe só isto).
export function publicState(game) {
  return {
    stage: game.stage,
    round: game.round,
    totalRounds: game.totalRounds,
    cueGiverId: cueGiverId(game),
    nextCueGiverId: game.players[game.round % game.players.length].id,
    cue1: game.cue1,
    cue2: game.cue2,
    turnId: turnId(game),
    order: game.order,
    pieces: game.pieces,
    result: game.stage === 'revelacao' || game.stage === 'fim' ? game.result : null,
    ranking: game.ranking,
    players: game.players.map(p => ({ id: p.id, score: p.score })),
    events: game.events,
  };
}

// O que só o dono do celular vê: a carta e a cor escolhida (de quem dá a dica).
export function privateState(game, playerId) {
  if (cueGiverId(game) !== playerId || game.stage === 'revelacao' || game.stage === 'fim') return {};
  return { card: game.card, target: game.target };
}
