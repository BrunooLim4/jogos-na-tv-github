// Teste das regras do Tom Sobre Tom (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, publicState, privateState, giveFirstCue, giveSecondCue, placeCone,
  nextRound, skipOfflinePlayers, turnId, conePoints,
} from '../game/jogo.js';
import { cellAt, distance, BOARD, CELLS, cellName } from '../public/cores.js';
import { checkCue } from '../public/dicas.js';

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
const NAMES = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fê', 'Gil', 'Hugo', 'Iara', 'Juca'];
const makePlayers = n => NAMES.slice(0, n).map(name => ({ id: name.toLowerCase(), name }));
// Sorteio repetível (para duas partidas iguais).
const seeded = seed => n => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};
// Põe o cone de quem está na vez na primeira casa livre a partir de `from`.
const coneNear = (game, from) => {
  let cell = from;
  while (game.pieces.some(p => p.cell === cell)) cell = (cell + 1) % CELLS;
  placeCone(game, turnId(game), cell);
};

// ---------------------------------------------------------------- tabuleiro e dica
check(BOARD.length === 480 && BOARD.every(c => /^#[0-9a-f]{6}$/.test(c)), 'o tabuleiro tem 480 cores');
check(cellName(0) === 'A1' && cellName(479) === 'P30' && cellName(cellAt(2, 11)) === 'C12', 'nomes das casas: letra da linha + número da coluna');
check(distance(cellAt(5, 5), cellAt(6, 6)) === 1 && distance(cellAt(5, 5), cellAt(7, 4)) === 2, 'distância conta a diagonal como 1');
check(checkCue('Oceano', 1).ok && checkCue('lavanda', 1).ok && checkCue('verdade', 1).ok && checkCue('Rosário', 1).ok, 'dicas boas passam (oceano, lavanda, verdade, Rosário)');
check(!checkCue('azul', 1).ok && !checkCue('Azulado', 1).ok && !checkCue('rosa', 1).ok && !checkCue('VERMELHO', 1).ok && !checkCue('esverdeado', 1).ok, 'não vale nome de cor comum');
check(!checkCue('C12', 1).ok && !checkCue('b', 1).ok, 'não vale letra nem número do tabuleiro');
check(!checkCue('céu limpo', 1).ok && checkCue('céu limpo', 2).ok && !checkCue('um dois três', 2).ok, '1ª dica = 1 palavra; 2ª = até 2');
check(!checkCue('  ', 1).ok, 'dica vazia é recusada');

// ---------------------------------------------------------------- começo
{
  check(createGame(makePlayers(3)).totalRounds === 6, '3 jogadores: cada um dá a dica 2 vezes (6 rodadas)');
  check(createGame(makePlayers(6)).totalRounds === 12, '6 jogadores: 12 rodadas');
  check(createGame(makePlayers(7)).totalRounds === 7, '7 jogadores: cada um dá a dica 1 vez');
  check(createGame(makePlayers(10)).totalRounds === 10, '10 jogadores: 10 rodadas');
  const game = createGame(makePlayers(4));
  check(game.stage === 'dica1' && publicState(game).cueGiverId === 'ana', 'começa com Ana dando a dica');
  const card = privateState(game, 'ana').card;
  check(card.length === 4 && new Set(card).size === 4, 'a carta tem 4 cores diferentes');
  check(card.every(a => card.every(b => a === b || distance(a, b) >= 5)), 'as 4 cores da carta são espalhadas pelo tabuleiro');
  check(privateState(game, 'bia').card === undefined, 'só quem dá a dica vê a carta');
  check(game.events.some(e => e.kind === 'start') && game.events.at(-1).kind === 'round', 'começo e rodada viram lances públicos');
}

// ---------------------------------------------------------------- uma rodada inteira
{
  const game = createGame(makePlayers(4));
  const card = privateState(game, 'ana').card;
  check(throws(() => giveFirstCue(game, 'bia', { target: card[0], text: 'mar' }), 'nao_e_sua_vez'), 'só quem dá a dica pode dar a dica');
  const notInCard = [...Array(CELLS).keys()].find(c => !card.includes(c));
  check(throws(() => giveFirstCue(game, 'ana', { target: notInCard, text: 'mar' }), 'cor_invalida'), 'a cor tem que ser uma das 4 da carta');
  check(throws(() => giveFirstCue(game, 'ana', { target: card[1], text: 'azul' }), 'dica_invalida'), 'o servidor também recusa nome de cor');
  check(throws(() => placeCone(game, 'bia', 10), 'fora_de_hora'), 'não dá para pôr cone antes da dica');

  // Alvo longe das beiradas (para todos os cones do teste caberem).
  const target = cellAt(6, 12);
  game.card[0] = target;
  giveFirstCue(game, 'ana', { target, text: 'Oceano' });
  const tv = publicState(game);
  check(tv.stage === 'cones1' && tv.cue1.text === 'Oceano', 'a 1ª dica aparece para todos');
  check(tv.order.join() === 'bia,caio,duda', '1ª volta: sentido horário depois de quem dá a dica');
  check(!JSON.stringify(tv).includes('"target"') && !JSON.stringify(tv).includes('"card"'), 'a TV não recebe a carta nem a cor escolhida');
  check(privateState(game, 'ana').target === target, 'quem dá a dica vê a cor escolhida no celular');
  check(throws(() => placeCone(game, 'caio', 5), 'nao_e_sua_vez'), 'cone fora da vez é recusado');

  const t = { r: Math.floor(target / 30), c: target % 30 };
  placeCone(game, 'bia', target); // 3
  check(throws(() => placeCone(game, 'caio', target), 'casa_ocupada'), 'casa com cone não aceita outro cone');
  placeCone(game, 'caio', cellAt(t.r + 2, t.c)); // 1
  placeCone(game, 'duda', cellAt(t.r - 1, t.c - 1)); // 2
  check(game.stage === 'dica2', 'depois da 1ª volta, vem a 2ª dica');
  check(throws(() => giveSecondCue(game, 'ana', { text: 'mar muito fundo' }), 'dica_invalida'), '2ª dica com 3 palavras é recusada');
  giveSecondCue(game, 'ana', { text: 'mar profundo' });
  check(publicState(game).order.join() === 'duda,caio,bia', '2ª volta: na ordem contrária');
  placeCone(game, 'duda', cellAt(t.r + 3, t.c)); // 0
  placeCone(game, 'caio', cellAt(t.r, t.c + 1)); // 2
  placeCone(game, 'bia', cellAt(t.r + 1, t.c + 2)); // 1
  const after = publicState(game);
  check(after.stage === 'revelacao' && after.result.target === target, 'depois da 2ª volta, revela a cor');
  const pts = after.result.points;
  check(pts.bia === 4 && pts.caio === 3 && pts.duda === 2, 'pontos dos cones: 3 na cor, 2 dentro do quadro, 1 encostado por fora');
  check(pts.ana === 3, 'quem deu a dica: 1 ponto por cone dentro do quadro (3 cones)');
  check(after.players.find(p => p.id === 'bia').score === 4, 'os pontos vão para o placar');
  check(privateState(game, 'ana').card === undefined, 'depois de revelar, a carta não é mais segredo de ninguém');
  check(conePoints(3) === 0, 'cone longe não vale nada');

  check(throws(() => nextRound(game, 'caio'), 'nao_e_sua_vez'), 'a próxima rodada começa por quem dá a próxima dica');
  nextRound(game, 'bia');
  check(game.round === 2 && publicState(game).cueGiverId === 'bia' && game.pieces.length === 0, 'rodada 2: Bia dá a dica e os cones voltam');
  check(publicState(game).players.find(p => p.id === 'bia').score === 4, 'o placar continua');
}

// ---------------------------------------------------------------- passar a 2ª dica e 3 jogadores
{
  const game = createGame(makePlayers(3));
  const target = privateState(game, 'ana').card[0];
  giveFirstCue(game, 'ana', { target, spoken: true });
  check(publicState(game).cue1.spoken === true && publicState(game).cue1.text === null, 'dica falada em voz alta');
  placeCone(game, 'bia', target);
  coneNear(game, target + 1);
  giveSecondCue(game, 'ana', { pass: true });
  const s = publicState(game);
  check(s.stage === 'revelacao' && s.pieces.length === 2, 'passar a 2ª dica revela na hora, sem a 2ª volta');
  const inFrame = s.result.pieces.filter(p => p.d <= 1).length;
  check(s.result.giverPoints === inFrame * 2, 'com 3 jogadores, quem dá a dica ganha 2 por cone no quadro');
  nextRound(game, 'caio', { isLeader: true });
  check(game.round === 2, 'o líder também pode começar a próxima rodada');
}

// ---------------------------------------------------------------- partida inteira e empate
{
  const game = createGame(makePlayers(3), { random: seeded(7) });
  let guard = 0;
  const kinds = new Set();
  while (game.stage !== 'fim' && guard++ < 200) {
    game.events.forEach(e => kinds.add(e.kind));
    const giver = publicState(game).cueGiverId;
    if (game.stage === 'dica1') giveFirstCue(game, giver, { target: privateState(game, giver).card[2], text: 'luar' });
    else if (game.stage === 'dica2') giveSecondCue(game, giver, { text: 'luar forte' });
    else if (game.stage === 'revelacao') nextRound(game, publicState(game).nextCueGiverId);
    else coneNear(game, (game.round * 37) % CELLS);
  }
  const s = publicState(game);
  check(s.stage === 'fim' && game.round === 6, 'a partida acaba depois da última rodada');
  check(s.ranking.length === 3 && s.ranking[0].score >= s.ranking[1].score, 'placar final do 1º ao último');
  check(kinds.has('lastRound') && game.events.at(-1).kind === 'finish', 'última rodada e fim viram lances');

  // empate em 10 pontos: Caio deu a dica por último
  const t2 = createGame(makePlayers(3));
  t2.players.forEach(p => { p.score = 10; });
  t2.players[1].lastCueRound = 3;
  t2.players[2].lastCueRound = 6;
  t2.round = t2.totalRounds;
  t2.cueGiver = 2;
  t2.stage = 'dica1';
  skipOfflinePlayers(t2, ['caio']);
  check(t2.stage === 'fim' && t2.ranking[0].id === 'caio', 'empate: ganha quem deu a dica por último');
}

// ---------------------------------------------------------------- quem caiu
{
  const game = createGame(makePlayers(4));
  check(!skipOfflinePlayers(game, ['bia']), 'pular só quando quem caiu está travando');
  check(skipOfflinePlayers(game, ['ana']) && game.round === 2 && publicState(game).cueGiverId === 'bia', 'quem dá a dica caiu: a rodada é pulada');
  giveFirstCue(game, 'bia', { target: privateState(game, 'bia').card[0], text: 'mel' });
  check(skipOfflinePlayers(game, ['caio']) && turnId(game) === 'duda', 'quem caiu na vez do cone: a vez é pulada');
}

// ---------------------------------------------------------------- privacidade
// Duas partidas iguais em que só muda o SEGREDO (a cor escolhida da carta) têm que
// dar exatamente o mesmo publicState até a revelação.
{
  const play = pick => {
    const game = createGame(makePlayers(5), { random: seeded(42) });
    const card = privateState(game, 'ana').card;
    giveFirstCue(game, 'ana', { target: card[pick], text: 'pôr-do-sol' });
    const states = [JSON.stringify(publicState(game))];
    placeCone(game, 'bia', 100);
    placeCone(game, 'caio', 200);
    states.push(JSON.stringify(publicState(game)));
    return states.join('|');
  };
  check(play(0) === play(3), 'a TV recebe exatamente o mesmo retrato, seja qual for a cor escolhida');
  const game = createGame(makePlayers(4));
  const tv = JSON.stringify(publicState(game));
  check(!/"card"|"target"|"token"|"random"/.test(tv), 'a TV não recebe carta, cor escolhida, sorteio nem token');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
