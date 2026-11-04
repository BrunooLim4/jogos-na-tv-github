// Regras do jogo — TROCAR por as do jogo novo. Sem nada de rede (fácil de testar
// sozinho em tools/teste-regras.mjs). O servidor só chama estas funções.
//
// PRIVACIDADE: publicState() é o que a TV (e todos) recebem — nunca pode ter
// segredo (mão, objetivo, carta escolhida, voto). privateState() vai só para o
// dono do celular. Dica que funcionou: duas partidas iguais em que só muda um
// segredo têm que dar o MESMO publicState (ver jogos/dixit/tools/teste-regras.mjs).

const MAX_EVENTS = 6;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

// `players` = [{ id, name }] na ordem da roda.
export function createGame(players) {
  const game = {
    players: players.map(p => ({ id: p.id, name: p.name, score: 0 })),
    round: 1,
    stage: 'playing', // TROCAR: as fases do jogo
    events: [],
    eventSeq: 0,
  };
  addEvent(game, 'start', 'A partida começou!');
  return game;
}

// Lances públicos (os últimos 6). A TV toca som/animação pelo `kind`, nunca por segredo.
function addEvent(game, kind, text) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, text });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

// O líder pula quem caiu e está travando a partida. Devolve true se mudou algo.
export function skipOfflinePlayers(game, offlineIds) {
  return false; // TROCAR
}

// O que todos podem ver (a TV recebe só isto).
export function publicState(game) {
  return {
    stage: game.stage,
    round: game.round,
    players: game.players.map(p => ({ id: p.id, score: p.score })),
    events: game.events,
  };
}

// O que só o dono do celular vê.
export function privateState(game, playerId) {
  return {}; // TROCAR: mão, objetivos...
}
