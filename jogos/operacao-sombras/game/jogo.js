// Regras do Operação Sombras. Sem nada de rede (fácil de testar sozinho em
// tools/teste-regras.mjs). O servidor só chama estas funções.
//
// Dois times (vermelho e azul). Cada time tem um chefe, que vê o MAPA DE CORES
// (de quem é cada uma das 25 palavras) e dá uma dica: uma palavra e um número.
// O time revela palavras: acertou, continua (até número + 1 tentativas); errou,
// a vez passa. Ganha quem achar todas as suas palavras primeiro. Revelar o
// ASSASSINO perde na hora.
//
// PRIVACIDADE: o mapa de cores (`key`) é o segredo do jogo. publicState() (TV e
// todos) só traz a cor das palavras já reveladas; privateState() entrega o mapa
// inteiro só aos 2 chefes. Teste: duas partidas iguais em que só muda o mapa têm
// que dar o MESMO publicState.

import { WORDS } from './palavras.js';

const MAX_EVENTS = 6;
export const BOARD_SIZE = 25;
export const MAX_CLUE_NUMBER = 9;
export const TEAMS = ['vermelho', 'azul'];
export const TEAM_NAMES = { vermelho: 'Vermelho', azul: 'Azul' };
const TEAM_WORDS = { vermelho: 'vermelhas', azul: 'azuis' };
export const otherTeam = team => (team === 'vermelho' ? 'azul' : 'vermelho');

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

// `players` = [{ id, name, team }]; `options.chiefs` = { vermelho: id, azul: id }.
// Só para testes: options.words, options.key, options.startTeam, options.random.
export function createGame(players, options = {}) {
  const random = options.random ?? Math.random;
  const startTeam = options.startTeam ?? (random() < 0.5 ? 'vermelho' : 'azul');
  const chiefs = options.chiefs ?? {};
  const game = {
    players: players.map(p => ({ id: p.id, name: p.name, team: p.team, chief: chiefs[p.team] === p.id })),
    words: options.words ?? shuffle(WORDS, random).slice(0, BOARD_SIZE),
    key: options.key ?? shuffle(makeKey(startTeam), random),
    revealed: Array(BOARD_SIZE).fill(false),
    startTeam,
    turn: startTeam,
    stage: 'clue', // clue (chefe pensando) → guess (time adivinhando) → ... → over
    round: 1,
    clue: null, // { team, word, number }
    guessesLeft: 0,
    guessesMade: 0,
    pointers: {}, // id de quem adivinha → palavra que está apontando (público)
    clues: [], // dicas já dadas, para a TV lembrar
    winner: null,
    winReason: null, // 'todas' | 'assassino'
    events: [],
    eventSeq: 0,
  };
  addEvent(game, 'start', `A partida começou! O time ${TEAM_NAMES[startTeam]} começa (tem 9 palavras).`);
  return game;
}

// Quem começa tem 9 palavras; o outro, 8; 7 de ninguém; 1 assassino.
function makeKey(startTeam) {
  return [
    ...Array(9).fill(startTeam),
    ...Array(8).fill(otherTeam(startTeam)),
    ...Array(7).fill('neutro'),
    'assassino',
  ];
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Lances públicos (os últimos 6). A TV toca som pelo `kind`, nunca por segredo.
function addEvent(game, kind, text) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, text });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

export function remaining(game, team) {
  return game.key.filter((color, i) => color === team && !game.revealed[i]).length;
}

// Para comparar palavras: maiúsculas e sem acento ("águia" = "AGUIA").
export function normalizeWord(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

// O que está errado na dica (ou null se pode).
export function clueProblem(game, rawWord) {
  const word = String(rawWord ?? '').trim();
  if (!word) return 'Escreva a dica.';
  if (/\s/.test(word)) return 'A dica é uma palavra só (sem espaço).';
  if (!/^[\p{L}\p{N}-]+$/u.test(word)) return 'Use só letras na dica.';
  if (word.length > 20) return 'Essa dica é comprida demais.';
  const clue = normalizeWord(word);
  const onBoard = game.words.some((boardWord, i) => !game.revealed[i] && sameOrPlural(normalizeWord(boardWord), clue));
  return onBoard ? 'Essa palavra está no tabuleiro. Escolha outra.' : null;
}

function sameOrPlural(a, b) {
  return a === b || a === `${b}S` || b === `${a}S` || a === `${b}ES` || b === `${a}ES`;
}

function findPlayer(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new GameError('nao_joga', 'Você não está nesta partida.');
  if (game.stage === 'over') throw new GameError('fim', 'A partida já acabou.');
  return player;
}

// Quem pode tocar nas palavras agora: do time da vez, sem ser o chefe, depois da dica.
function guesser(game, playerId) {
  const player = findPlayer(game, playerId);
  if (player.chief) throw new GameError('chefe_nao_adivinha', 'O chefe não revela palavras: só dá a dica.');
  if (player.team !== game.turn) throw new GameError('nao_e_sua_vez', `Agora é a vez do time ${TEAM_NAMES[game.turn]}.`);
  if (game.stage !== 'guess') throw new GameError('espere_a_dica', 'Espere a dica do chefe.');
  return player;
}

function wordIndex(game, index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= BOARD_SIZE) throw new GameError('palavra_invalida', 'Essa palavra não existe.');
  if (game.revealed[i]) throw new GameError('ja_revelada', 'Essa palavra já foi revelada.');
  return i;
}

// ---------------------------------------------------------------- jogadas

export function giveClue(game, playerId, rawWord, rawNumber) {
  const player = findPlayer(game, playerId);
  if (!player.chief) throw new GameError('so_chefe', 'Só o chefe do time dá a dica.');
  if (player.team !== game.turn) throw new GameError('nao_e_sua_vez', `Agora é a vez do time ${TEAM_NAMES[game.turn]}.`);
  if (game.stage !== 'clue') throw new GameError('ja_deu_dica', 'Você já deu a dica desta vez.');
  const problem = clueProblem(game, rawWord);
  if (problem) throw new GameError('dica_invalida', problem);
  const number = Number(rawNumber);
  if (!Number.isInteger(number) || number < 1 || number > MAX_CLUE_NUMBER) {
    throw new GameError('numero_invalido', `Escolha um número de 1 a ${MAX_CLUE_NUMBER}.`);
  }
  const word = String(rawWord).trim().toUpperCase();
  game.clue = { team: game.turn, word, number };
  game.clues.push({ ...game.clue });
  game.stage = 'guess';
  game.guessesLeft = number + 1;
  game.guessesMade = 0;
  game.pointers = {};
  addEvent(game, 'clue', `Dica do time ${TEAM_NAMES[game.turn]}: ${word} · ${number}`);
}

// Apontar uma palavra (aparece na TV para o time conversar). Tocar de novo desaponta.
export function pointWord(game, playerId, index) {
  guesser(game, playerId);
  if (index === null || index === undefined) {
    delete game.pointers[playerId];
    return;
  }
  const i = wordIndex(game, index);
  if (game.pointers[playerId] === i) delete game.pointers[playerId];
  else game.pointers[playerId] = i;
}

// Revelar uma palavra. Devolve a cor dela.
export function revealWord(game, playerId, index) {
  const player = guesser(game, playerId);
  const i = wordIndex(game, index);
  const color = game.key[i];
  const word = game.words[i];
  const team = game.turn;
  const rival = otherTeam(team);
  game.revealed[i] = true;
  game.guessesMade += 1;
  for (const [id, at] of Object.entries(game.pointers)) if (at === i) delete game.pointers[id];

  if (color === 'assassino') {
    addEvent(game, 'assassin', `${player.name} revelou ${word}: o assassino!`);
    finish(game, rival, 'assassino');
  } else if (color === team) {
    game.guessesLeft -= 1;
    addEvent(game, 'right', `${player.name} revelou ${word}: acertou!`);
    if (remaining(game, team) === 0) finish(game, team, 'todas');
    else if (game.guessesLeft === 0) endTurn(game);
  } else if (color === rival) {
    addEvent(game, 'wrong', `${player.name} revelou ${word}: era do time ${TEAM_NAMES[rival]}.`);
    if (remaining(game, rival) === 0) finish(game, rival, 'todas');
    else endTurn(game);
  } else {
    addEvent(game, 'neutral', `${player.name} revelou ${word}: não era de ninguém.`);
    endTurn(game);
  }
  return color;
}

// O time para de adivinhar (só depois de tentar pelo menos uma palavra).
export function passTurn(game, playerId) {
  guesser(game, playerId);
  if (game.guessesMade === 0) throw new GameError('tente_uma', 'Tente pelo menos uma palavra antes de passar.');
  addEvent(game, 'pass', `O time ${TEAM_NAMES[game.turn]} passou a vez.`);
  endTurn(game);
}

function endTurn(game) {
  game.turn = otherTeam(game.turn);
  game.stage = 'clue';
  game.round += 1;
  game.clue = null;
  game.guessesLeft = 0;
  game.guessesMade = 0;
  game.pointers = {};
}

function finish(game, winner, reason) {
  game.stage = 'over';
  game.winner = winner;
  game.winReason = reason;
  game.pointers = {};
  addEvent(game, 'finish', reason === 'assassino'
    ? `O time ${TEAM_NAMES[winner]} venceu: o outro time achou o assassino.`
    : `O time ${TEAM_NAMES[winner]} venceu: todas as palavras ${TEAM_WORDS[winner]} foram achadas!`);
}

// O líder pula quem caiu e está travando a partida. Devolve true se mudou algo.
// Chefe da vez caiu → outra pessoa do time vira chefe. Ninguém do time da vez
// conectado para adivinhar → a vez passa.
export function skipOfflinePlayers(game, offlineIds) {
  if (game.stage === 'over') return false;
  const offline = new Set(offlineIds);
  const team = game.players.filter(p => p.team === game.turn);
  if (game.stage === 'clue') {
    const chief = team.find(p => p.chief);
    if (!chief || !offline.has(chief.id)) return false;
    const substitute = team.find(p => !p.chief && !offline.has(p.id));
    if (!substitute) {
      addEvent(game, 'pass', `Ninguém do time ${TEAM_NAMES[game.turn]} está conectado: a vez passou.`);
      endTurn(game);
      return true;
    }
    chief.chief = false;
    substitute.chief = true;
    addEvent(game, 'chief', `${substitute.name} virou chefe do time ${TEAM_NAMES[game.turn]} (${chief.name} caiu).`);
    return true;
  }
  if (team.some(p => !p.chief && !offline.has(p.id))) return false;
  addEvent(game, 'pass', `Ninguém do time ${TEAM_NAMES[game.turn]} está conectado para adivinhar: a vez passou.`);
  endTurn(game);
  return true;
}

// ---------------------------------------------------------------- retratos

// O que todos podem ver (a TV recebe só isto). Cor só das palavras reveladas
// (no fim da partida, todas aparecem).
export function publicState(game) {
  const over = game.stage === 'over';
  return {
    stage: game.stage,
    round: game.round,
    turn: game.turn,
    startTeam: game.startTeam,
    cards: game.words.map((word, i) => ({
      word,
      revealed: game.revealed[i],
      color: game.revealed[i] || over ? game.key[i] : null,
    })),
    clue: game.clue,
    guessesLeft: game.guessesLeft,
    guessesMade: game.guessesMade,
    pointers: { ...game.pointers },
    remaining: { vermelho: remaining(game, 'vermelho'), azul: remaining(game, 'azul') },
    totals: { [game.startTeam]: 9, [otherTeam(game.startTeam)]: 8 },
    players: game.players.map(p => ({ id: p.id, team: p.team, chief: p.chief })),
    clues: game.clues,
    winner: game.winner,
    winReason: game.winReason,
    events: game.events,
  };
}

// O que só o dono do celular vê: o mapa de cores, se for chefe.
export function privateState(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return {};
  return {
    team: player.team,
    chief: player.chief,
    key: player.chief && game.stage !== 'over' ? [...game.key] : null,
  };
}
