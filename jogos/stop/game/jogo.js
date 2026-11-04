// Regras do Stop (a brincadeira de sempre: letra sorteada, uma palavra por categoria).
// Sem nada de rede (testes em tools/teste-regras.mjs); o servidor só chama estas funções
// e, para os relógios, `advance(game, now)` quando `nextDeadline(game)` chega.
//
// A rodada: a TV sorteia a letra (roleta) → ESCREVENDO: cada um preenche as categorias no
// celular; acaba com o STOP de alguém (que preencheu tudo; os outros têm 3 s) ou com o
// relógio → CORREÇÃO: categoria por categoria, as respostas aparecem e a turma vota para
// EXCLUIR a que não gostou (pedido do Bruno: tudo vale até a maioria votar contra) →
// PLACAR da rodada → próxima rodada (o líder) … → FIM.
// Pontos: resposta que só você deu 10; igual à de outra pessoa 5; em branco, com a letra
// errada ou excluída 0.
//
// PRIVACIDADE: enquanto escrevem, ninguém vê as respostas dos outros — publicState() tem só
// QUANTAS categorias cada um preencheu. As respostas viram públicas na correção.
import {
  LETTERS, CATEGORIES, CATEGORIES_PER_ROUND, TOTAL_ROUNDS, TIMES, normalize, startsWithLetter, cleanAnswer,
  POINTS_ALONE, POINTS_SHARED,
} from '../public/stop.js';

export { TIMES, TOTAL_ROUNDS };
const MAX_EVENTS = 40;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

function pick(list, count, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// `players` = [{ id, name }]. `random` e `now` para os testes repetirem a partida.
export function createGame(players, { random = Math.random, now = Date.now(), rounds = TOTAL_ROUNDS, times = TIMES } = {}) {
  const game = {
    players: players.map(p => ({ id: p.id, name: p.name, score: 0 })),
    round: 0,
    totalRounds: rounds,
    times,
    random,
    usedLetters: [],
    categories: [],
    letter: null,
    stage: 'escrevendo',
    writingStartsAt: null,
    deadline: null,
    stopperId: null,
    stopAt: null,
    answers: {}, // por jogador: { categoria: texto } (só o dono vê até a correção)
    review: null, // a correção: { index, endsAt, items, votes: { chave: [quem votou] }, ready: [] }
    results: [], // as categorias já corrigidas nesta rodada
    roundPoints: null,
    ranking: null,
    events: [],
    eventSeq: 0,
  };
  addEvent(game, 'start');
  startRound(game, now);
  return game;
}

// Lances públicos. A TV anima e toca som pelo `kind`.
function addEvent(game, kind, data = {}) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, ...data });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

const ids = game => game.players.map(p => p.id);

function startRound(game, now) {
  game.round += 1;
  const letters = LETTERS.filter(l => !game.usedLetters.includes(l));
  game.letter = pick(letters.length ? letters : LETTERS, 1, game.random)[0];
  game.usedLetters.push(game.letter);
  // categorias novas: evita repetir as da rodada anterior
  const fresh = CATEGORIES.filter(c => !game.categories.includes(c));
  game.categories = pick(fresh.length >= CATEGORIES_PER_ROUND ? fresh : CATEGORIES, CATEGORIES_PER_ROUND, game.random);
  game.answers = Object.fromEntries(ids(game).map(id => [id, {}]));
  game.stage = 'escrevendo';
  game.writingStartsAt = now + game.times.roulette;
  game.deadline = game.writingStartsAt + game.times.write;
  game.stopperId = null;
  game.stopAt = null;
  game.review = null;
  game.results = [];
  game.roundPoints = null;
  addEvent(game, 'round', { round: game.round, letter: game.letter });
}

// ---------------------------------------------------------------- escrevendo

// O celular manda as respostas enquanto a pessoa escreve (e de novo quando alguém dá STOP).
export function setAnswers(game, playerId, answers, { now = Date.now() } = {}) {
  if (!game.answers[playerId]) throw new GameError('nao_joga', 'Você não está nesta partida.');
  const open = game.stage === 'escrevendo' || (game.stage === 'parando' && now <= game.stopAt + game.times.grace);
  if (!open) throw new GameError('acabou', 'O tempo para escrever acabou.');
  for (const category of game.categories) {
    if (answers && typeof answers[category] === 'string') game.answers[playerId][category] = cleanAnswer(answers[category]);
  }
}

export const filledCount = (game, playerId) => game.categories.filter(c => game.answers[playerId]?.[c]).length;

// STOP! Só quem preencheu tudo com a letra certa. Os outros ainda têm 3 segundos.
export function callStop(game, playerId, answers, { now = Date.now() } = {}) {
  if (game.stage !== 'escrevendo') throw new GameError('nao_escrevendo', 'Agora não dá para dar STOP.');
  if (answers) setAnswers(game, playerId, answers, { now });
  const missing = game.categories.filter(c => !startsWithLetter(game.answers[playerId]?.[c], game.letter));
  if (missing.length) {
    throw new GameError('faltam', `Para dar STOP, preencha tudo com a letra ${game.letter} (falta: ${missing.join(', ')}).`);
  }
  game.stage = 'parando';
  game.stopperId = playerId;
  game.stopAt = now + game.times.stop;
  addEvent(game, 'stop', { playerId });
}

// ---------------------------------------------------------------- correção

function startReview(game, now, reason) {
  game.stage = 'correcao';
  game.review = { index: -1, endsAt: null, items: [], votes: {}, ready: [] };
  addEvent(game, 'review', { reason, stopperId: game.stopperId });
  openCategory(game, 0, now);
}

function openCategory(game, index, now) {
  const category = game.categories[index];
  const items = game.players.map(p => {
    const text = game.answers[p.id]?.[category] ?? '';
    const status = !text ? 'vazio' : !startsWithLetter(text, game.letter) ? 'letra' : 'ok';
    return { playerId: p.id, text, key: status === 'ok' ? normalize(text) : null, status };
  });
  Object.assign(game.review, { index, endsAt: now + game.times.review, items, votes: {}, ready: [] });
}

// Voto para EXCLUIR uma resposta (vale para todas as respostas iguais a ela). Quem
// escreveu aquela resposta não vota nela. Tocar de novo tira o voto.
export function rejectAnswer(game, playerId, { index, key, on }) {
  if (game.stage !== 'correcao' || game.review.index !== index) throw new GameError('passou', 'Essa categoria já foi corrigida.');
  if (!game.answers[playerId]) throw new GameError('nao_joga', 'Você não está nesta partida.');
  const authors = game.review.items.filter(i => i.key === key && i.status === 'ok').map(i => i.playerId);
  if (!authors.length) throw new GameError('sem_resposta', 'Essa resposta não existe.');
  if (authors.includes(playerId)) throw new GameError('propria', 'Não dá para votar contra a sua própria resposta.');
  const voters = new Set(game.review.votes[key] ?? []);
  if (on) voters.add(playerId);
  else voters.delete(playerId);
  game.review.votes[key] = [...voters];
}

// "Tudo certo nesta categoria": quando todos que estão online tocam, passa para a próxima.
export function markReady(game, playerId, { now = Date.now(), onlineIds = ids(game) } = {}) {
  if (game.stage !== 'correcao') return;
  if (!game.review.ready.includes(playerId)) game.review.ready.push(playerId);
  if (onlineIds.filter(id => game.answers[id]).every(id => game.review.ready.includes(id))) finishCategory(game, now);
}

// Excluída: a maioria de quem NÃO escreveu aquela resposta votou contra.
function isExcluded(game, key) {
  const authors = game.review.items.filter(i => i.key === key).length;
  const others = game.players.length - authors;
  return (game.review.votes[key]?.length ?? 0) > others / 2;
}

function finishCategory(game, now) {
  const { index, items } = game.review;
  const counts = {};
  for (const item of items) {
    if (item.status === 'ok' && isExcluded(game, item.key)) item.status = 'excluida';
  }
  for (const item of items) if (item.status === 'ok') counts[item.key] = (counts[item.key] ?? 0) + 1;
  const result = {
    index,
    category: game.categories[index],
    answers: items.map(item => ({
      playerId: item.playerId,
      text: item.text,
      status: item.status,
      shared: item.status === 'ok' && counts[item.key] > 1,
      votes: item.key ? game.review.votes[item.key]?.length ?? 0 : 0,
      points: item.status === 'ok' ? (counts[item.key] > 1 ? POINTS_SHARED : POINTS_ALONE) : 0,
    })),
  };
  game.results.push(result);
  addEvent(game, 'category', { index, result });
  if (index + 1 < game.categories.length) openCategory(game, index + 1, now);
  else finishRound(game);
}

function finishRound(game) {
  const points = Object.fromEntries(ids(game).map(id => [id, 0]));
  for (const result of game.results) for (const a of result.answers) points[a.playerId] += a.points;
  for (const p of game.players) p.score += points[p.id];
  game.roundPoints = points;
  game.review = null;
  game.stage = 'placar';
  addEvent(game, 'roundEnd', { round: game.round, points });
  if (game.round >= game.totalRounds) {
    game.stage = 'fim';
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    game.ranking = sorted.map(p => ({ id: p.id, score: p.score, place: sorted.findIndex(o => o.score === p.score) + 1 }));
    addEvent(game, 'finish', { ranking: game.ranking });
  }
}

// O líder começa a próxima rodada depois do placar. `round` = a rodada que a pessoa viu
// (dois toques juntos não pulam uma rodada).
export function nextRound(game, { isLeader, round, now = Date.now() } = {}) {
  if (!isLeader) throw new GameError('so_lider', 'Só o líder começa a próxima rodada.');
  if (round !== undefined && round !== game.round) return false;
  if (game.stage !== 'placar') throw new GameError('nao_acabou', 'A rodada ainda não acabou.');
  startRound(game, now);
  return true;
}

// ---------------------------------------------------------------- relógios

// Quando é o próximo momento em que algo acontece sozinho (o servidor marca um alarme).
export function nextDeadline(game) {
  if (game.stage === 'escrevendo') return game.deadline;
  if (game.stage === 'parando') return game.stopAt + game.times.grace;
  if (game.stage === 'correcao') return game.review.endsAt;
  return null;
}

// Faz o que já venceu: fim do tempo de escrever, fim dos 3 s do STOP, fim do tempo de
// uma categoria na correção. Devolve true se mudou algo.
export function advance(game, { now = Date.now() } = {}) {
  const due = nextDeadline(game);
  if (due === null || now < due) return false;
  if (game.stage === 'escrevendo') {
    addEvent(game, 'time');
    startReview(game, now, 'tempo');
  } else if (game.stage === 'parando') {
    startReview(game, now, 'stop');
  } else if (game.stage === 'correcao') {
    finishCategory(game, now);
  }
  return true;
}

// O Stop não trava por quem caiu (os relógios andam sozinhos).
export function skipOfflinePlayers() {
  return false;
}

// ---------------------------------------------------------------- retratos

// O que todos podem ver (a TV recebe só isto). `now` = relógio do servidor, para a TV e o
// celular acertarem os relógios.
export function publicState(game, now = Date.now()) {
  const writing = game.stage === 'escrevendo' || game.stage === 'parando';
  const review = game.stage === 'correcao' ? game.review : null;
  return {
    stage: game.stage,
    round: game.round,
    totalRounds: game.totalRounds,
    letter: game.letter,
    categories: game.categories,
    writingStartsAt: game.writingStartsAt,
    deadline: game.deadline,
    stopperId: game.stopperId,
    stopAt: game.stopAt,
    players: game.players.map(p => ({
      id: p.id,
      score: p.score,
      filled: writing ? filledCount(game, p.id) : null,
      ready: review ? review.ready.includes(p.id) : false,
    })),
    review: review && {
      index: review.index,
      category: game.categories[review.index],
      endsAt: review.endsAt,
      answers: review.items.map(i => ({ playerId: i.playerId, text: i.text, key: i.key, status: i.status, votes: i.key ? review.votes[i.key]?.length ?? 0 : 0 })),
    },
    results: writing ? [] : game.results,
    roundPoints: game.roundPoints,
    ranking: game.ranking,
    now,
    events: game.events,
  };
}

// O que só o dono do celular vê: as próprias respostas (e os votos dele na correção).
export function privateState(game, playerId) {
  if (!game.answers[playerId]) return {};
  const review = game.stage === 'correcao' ? game.review : null;
  return {
    answers: game.answers[playerId],
    myVotes: review ? Object.keys(review.votes).filter(key => review.votes[key].includes(playerId)) : [],
    ready: review ? review.ready.includes(playerId) : false,
  };
}
