// Teste das regras do Stop (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, setAnswers, callStop, rejectAnswer, markReady, nextRound, advance, nextDeadline,
  publicState, privateState, TIMES,
} from '../game/jogo.js';
import { normalize, startsWithLetter, LETTERS, CATEGORIES, CATEGORIES_PER_ROUND } from '../public/stop.js';

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${label}`);
  if (!ok) failures++;
};
const throws = (fn, code) => {
  try {
    fn();
    return false;
  } catch (error) {
    return error.code === code;
  }
};
const makePlayers = n => ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fê'].slice(0, n).map(name => ({ id: name.toLowerCase(), name }));
const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
// partida com letra e categorias conhecidas (troca o sorteio depois de criar)
function fixedGame(n, letter = 'B', categories = ['Animal', 'Fruta', 'Cor']) {
  const game = createGame(makePlayers(n), { now: 0, random: seeded(3) });
  game.letter = letter;
  game.categories = categories;
  game.writingStartsAt = 0;
  game.deadline = TIMES.write;
  return game;
}
// fecha a escrita (dá STOP) e corrige as categorias sem votos
function stopAndReview(game, stopper, now = 1000) {
  callStop(game, stopper, null, { now });
  advance(game, { now: now + TIMES.stop + TIMES.grace });
}

// ---------------------------------------------------------------- palavras
check(normalize(' Maçã! ') === 'maca' && normalize('MACA') === 'maca', '"Maçã", "maca" e "MAÇÃ!" são a mesma resposta');
check(startsWithLetter('Árvore', 'A') && startsWithLetter('çapo', 'C') && !startsWithLetter('Bola', 'A'), 'Á conta como A e Ç como C');
check(!LETTERS.includes('K') && !LETTERS.includes('Y') && !LETTERS.includes('W'), 'sem K, W e Y (quase nada começa com elas)');

// ---------------------------------------------------------------- a rodada
{
  const game = createGame(makePlayers(3), { now: 0, random: seeded(7) });
  check(game.round === 1 && LETTERS.includes(game.letter) && game.categories.length === CATEGORIES_PER_ROUND, 'a partida começa: rodada 1, letra sorteada e 8 categorias');
  check(game.categories.every(c => CATEGORIES.includes(c)) && new Set(game.categories).size === CATEGORIES_PER_ROUND, 'as categorias saem da lista grande, sem repetir');
  check(game.writingStartsAt === TIMES.roulette && game.deadline === TIMES.roulette + TIMES.write, 'escrever começa depois da roleta e tem um relógio');
  const tv = JSON.stringify(publicState(game, 0));
  setAnswers(game, 'ana', { [game.categories[0]]: 'segredo da ana' }, { now: 5000 });
  const tv2 = publicState(game, 0);
  check(!JSON.stringify(tv2).includes('segredo') && tv2.players[0].filled === 1 && tv !== JSON.stringify(tv2), 'enquanto escrevem, a TV só sabe QUANTAS categorias cada um preencheu');
  check(privateState(game, 'ana').answers[game.categories[0]] === 'segredo da ana' && !privateState(game, 'bia').answers[game.categories[0]], 'cada celular vê só as próprias respostas');
}

// ---------------------------------------------------------------- STOP e relógio
{
  const game = fixedGame(3);
  setAnswers(game, 'ana', { Animal: 'Baleia', Fruta: 'Banana' });
  check(throws(() => callStop(game, 'ana', null, { now: 1000 }), 'faltam'), 'só dá STOP quem preencheu todas as categorias');
  setAnswers(game, 'ana', { Cor: 'Azul' });
  check(throws(() => callStop(game, 'ana', null, { now: 1000 }), 'faltam'), 'e todas com a letra da rodada');
  callStop(game, 'ana', { Cor: 'Branco' }, { now: 1000 });
  check(game.stage === 'parando' && game.stopperId === 'ana' && game.events.at(-1).kind === 'stop', 'STOP! (a TV anuncia quem deu)');
  setAnswers(game, 'bia', { Animal: 'Burro' }, { now: 1000 + TIMES.stop });
  check(game.answers.bia.Animal === 'Burro', 'depois do STOP os outros ainda têm 3 segundos');
  check(nextDeadline(game) === 1000 + TIMES.stop + TIMES.grace && !advance(game, { now: 1500 }), 'o fim dos 3 s é um alarme do servidor');
  advance(game, { now: 1000 + TIMES.stop + TIMES.grace });
  check(game.stage === 'correcao' && game.review.index === 0, 'acabou o tempo do STOP: começa a correção pela 1ª categoria');
  check(throws(() => setAnswers(game, 'caio', { Animal: 'Boi' }, { now: 9999 }), 'acabou'), 'depois disso, não dá mais para escrever');

  const slow = fixedGame(3);
  setAnswers(slow, 'bia', { Animal: 'Boi' });
  advance(slow, { now: TIMES.write });
  check(slow.stage === 'correcao' && slow.events.some(e => e.kind === 'time'), 'se ninguém der STOP, o relógio acaba a rodada');
}

// ---------------------------------------------------------------- pontos e votos
{
  const game = fixedGame(4);
  setAnswers(game, 'ana', { Animal: 'Baleia', Fruta: 'Banana', Cor: 'Branco' });
  setAnswers(game, 'bia', { Animal: 'baleia', Fruta: 'Blábláblá', Cor: 'Azul' });
  setAnswers(game, 'caio', { Animal: 'Boi', Fruta: 'Banana' });
  setAnswers(game, 'duda', { Animal: 'Búfalo', Fruta: 'Bergamota', Cor: 'Bege' });
  stopAndReview(game, 'ana');
  const tv = publicState(game, 0);
  check(tv.review.category === 'Animal' && tv.review.answers.length === 4, 'na correção a TV vê todas as respostas da categoria');
  check(throws(() => rejectAnswer(game, 'ana', { index: 0, key: 'baleia', on: true }), 'propria'), 'ninguém vota contra a própria resposta');
  // categoria 0 (Animal): sem votos
  for (const id of ['ana', 'bia', 'caio', 'duda']) markReady(game, id, { now: 2000 });
  const animal = game.results[0].answers;
  const pts = id => animal.find(a => a.playerId === id).points;
  check(pts('ana') === 5 && pts('bia') === 5 && pts('caio') === 10 && pts('duda') === 10, 'resposta igual à de outro (Baleia = baleia) vale 5; só sua vale 10');
  check(game.review.index === 1, 'todos tocaram em "Tudo certo": vai para a próxima categoria');
  // categoria 1 (Fruta): "Blábláblá" é excluída pela maioria; 1 voto só não exclui
  rejectAnswer(game, 'ana', { index: 1, key: 'blablabla', on: true });
  rejectAnswer(game, 'caio', { index: 1, key: 'blablabla', on: true });
  check(publicState(game, 0).review.answers.find(a => a.playerId === 'bia').votes === 2, 'a TV mostra quantos votaram contra');
  rejectAnswer(game, 'duda', { index: 1, key: 'blablabla', on: true });
  rejectAnswer(game, 'duda', { index: 1, key: 'blablabla', on: false });
  rejectAnswer(game, 'bia', { index: 1, key: 'bergamota', on: true });
  advance(game, { now: game.review.endsAt });
  const fruta = game.results[1].answers;
  check(fruta.find(a => a.playerId === 'bia').status === 'excluida' && fruta.find(a => a.playerId === 'bia').points === 0, 'a maioria votou contra: a resposta não vale (2 de 3)');
  check(fruta.find(a => a.playerId === 'duda').points === 10, '1 voto contra só não exclui');
  check(fruta.find(a => a.playerId === 'ana').points === 5 && fruta.find(a => a.playerId === 'caio').points === 5, 'Banana de dois: 5 para cada');
  // categoria 2 (Cor): Azul (letra errada) e em branco valem 0
  advance(game, { now: game.review.endsAt });
  const cor = game.results[2].answers;
  check(cor.find(a => a.playerId === 'bia').status === 'letra' && cor.find(a => a.playerId === 'caio').status === 'vazio' && cor.every(a => a.status !== 'ok' || a.points === 10), 'letra errada e em branco valem 0');
  check(game.stage === 'placar' && game.players.find(p => p.id === 'ana').score === 5 + 5 + 10, 'fim da correção: placar da rodada somado');
  check(throws(() => nextRound(game, { isLeader: false }), 'so_lider'), 'só o líder começa a próxima rodada');
  check(nextRound(game, { isLeader: true, round: 1, now: 50_000 }) && game.round === 2 && game.letter !== 'B' && game.stage === 'escrevendo', 'próxima rodada: letra nova');
  check(nextRound(game, { isLeader: true, round: 1 }) === false && game.round === 2, 'toque repetido do líder é ignorado (não pula rodada nem dá erro)');
}
{
  // quem está offline não trava o "Tudo certo"
  const game = fixedGame(3);
  setAnswers(game, 'ana', { Animal: 'Baleia', Fruta: 'Banana', Cor: 'Branco' });
  stopAndReview(game, 'ana');
  markReady(game, 'ana', { now: 2000, onlineIds: ['ana', 'bia'] });
  markReady(game, 'bia', { now: 2000, onlineIds: ['ana', 'bia'] });
  check(game.review.index === 1, 'quem caiu não precisa tocar em "Tudo certo"');
}

// ---------------------------------------------------------------- fim
{
  const game = createGame(makePlayers(2), { now: 0, random: seeded(11), rounds: 2 });
  for (let r = 1; r <= 2; r++) {
    advance(game, { now: game.deadline });
    while (game.stage === 'correcao') advance(game, { now: game.review.endsAt });
    if (r === 1) nextRound(game, { isLeader: true, now: 1 });
  }
  check(game.stage === 'fim' && game.ranking.length === 2 && game.events.at(-1).kind === 'finish', 'depois da última rodada: placar final');
  check(game.usedLetters.length === 2 && game.usedLetters[0] !== game.usedLetters[1], 'a letra não se repete na partida');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
