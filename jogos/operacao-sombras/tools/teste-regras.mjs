// Teste das regras do Operação Sombras (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, giveClue, pointWord, revealWord, passTurn, skipOfflinePlayers,
  publicState, privateState, remaining, clueProblem,
} from '../game/jogo.js';
import { WORDS } from '../game/palavras.js';

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

// 4 jogadores: Ana (chefe) e Bia no vermelho; Caio (chefe) e Duda no azul.
const PLAYERS = [
  { id: 'ana', name: 'Ana', team: 'vermelho' },
  { id: 'bia', name: 'Bia', team: 'vermelho' },
  { id: 'caio', name: 'Caio', team: 'azul' },
  { id: 'duda', name: 'Duda', team: 'azul' },
];
const CHIEFS = { vermelho: 'ana', azul: 'caio' };
const BOARD = WORDS.slice(0, 25);
// Mapa fixo (vermelho começa): 0–8 vermelho, 9–16 azul, 17–23 neutro, 24 assassino.
const KEY = [
  ...Array(9).fill('vermelho'), ...Array(8).fill('azul'), ...Array(7).fill('neutro'), 'assassino',
];
const newGame = (key = KEY) => createGame(PLAYERS, { chiefs: CHIEFS, words: BOARD, key, startTeam: 'vermelho' });
const firstNotOnBoard = 'ZZTESTE';

// ---------------------------------------------------------------- palavras
{
  const plain = WORDS.map(w => w.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  check(new Set(plain).size === WORDS.length, 'lista de palavras sem repetidas (nem com/sem acento)');
  check(WORDS.every(w => [...w].length <= 9 && w === w.toUpperCase()), 'palavras em maiúsculas e com até 9 letras');
  check(WORDS.length >= 400, `lista com pelo menos 400 palavras (${WORDS.length})`);
}

// ---------------------------------------------------------------- começo
{
  const game = createGame(PLAYERS, { chiefs: CHIEFS });
  const counts = c => game.key.filter(k => k === c).length;
  check(game.words.length === 25 && new Set(game.words).size === 25, '25 palavras diferentes no tabuleiro');
  check(counts(game.startTeam) === 9 && counts(game.startTeam === 'vermelho' ? 'azul' : 'vermelho') === 8
    && counts('neutro') === 7 && counts('assassino') === 1, 'mapa: 9 de quem começa, 8 do outro, 7 neutras, 1 assassino');
  check(game.turn === game.startTeam && game.stage === 'clue', 'começa com o chefe de quem tem 9 palavras');
  check(game.players.filter(p => p.chief).map(p => p.id).sort().join() === 'ana,caio', 'um chefe por time');
}

// ---------------------------------------------------------------- dica
{
  const game = newGame();
  check(throws(() => giveClue(game, 'bia', firstNotOnBoard, 2), 'so_chefe'), 'só o chefe dá a dica');
  check(throws(() => giveClue(game, 'caio', firstNotOnBoard, 2), 'nao_e_sua_vez'), 'chefe do outro time espera a vez');
  check(throws(() => giveClue(game, 'ana', 'DUAS PALAVRAS', 2), 'dica_invalida'), 'dica com espaço é recusada');
  check(throws(() => giveClue(game, 'ana', BOARD[3].toLowerCase(), 2), 'dica_invalida'), 'dica igual a uma palavra do tabuleiro é recusada');
  check(throws(() => giveClue(game, 'ana', firstNotOnBoard, 0), 'numero_invalido')
    && throws(() => giveClue(game, 'ana', firstNotOnBoard, 10), 'numero_invalido'), 'número da dica de 1 a 9');
  check(throws(() => revealWord(game, 'bia', 0), 'espere_a_dica'), 'ninguém revela antes da dica');
  giveClue(game, 'ana', ' zzteste ', 2);
  check(game.stage === 'guess' && game.clue.word === 'ZZTESTE' && game.guessesLeft === 3, 'dica dada: o time pode tentar número + 1');
  check(game.events.at(-1).kind === 'clue', 'a dica vira lance público');
}
{
  const accented = createGame(PLAYERS, { chiefs: CHIEFS, words: ['ÁGUIA', ...BOARD.slice(1)], key: KEY, startTeam: 'vermelho' });
  check(clueProblem(accented, 'aguia') !== null && clueProblem(accented, 'ÁGUIAS') !== null, 'dica sem acento ou no plural também conta como a do tabuleiro');
}

// ---------------------------------------------------------------- palpites
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 1);
  check(throws(() => revealWord(game, 'ana', 0), 'chefe_nao_adivinha'), 'o chefe não revela palavras');
  check(throws(() => revealWord(game, 'duda', 0), 'nao_e_sua_vez'), 'o outro time não revela na vez de ninguém');
  check(throws(() => passTurn(game, 'bia'), 'tente_uma'), 'não dá para passar sem tentar uma');
  pointWord(game, 'bia', 5);
  check(publicState(game).pointers.bia === 5, 'apontar uma palavra aparece para todos');
  pointWord(game, 'bia', 5);
  check(publicState(game).pointers.bia === undefined, 'tocar de novo desaponta');
  pointWord(game, 'bia', 0);
  check(revealWord(game, 'bia', 0) === 'vermelho' && game.turn === 'vermelho' && game.guessesLeft === 1, 'acertou: continua');
  check(publicState(game).pointers.bia === undefined, 'a palavra revelada sai dos apontados');
  check(throws(() => revealWord(game, 'bia', 0), 'ja_revelada'), 'palavra revelada não volta');
  revealWord(game, 'bia', 1);
  check(game.turn === 'azul' && game.stage === 'clue' && remaining(game, 'vermelho') === 7, 'acabaram as tentativas (número + 1): a vez passa');
}
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 3);
  revealWord(game, 'bia', 17);
  check(game.turn === 'azul', 'palavra de ninguém: a vez passa');
  giveClue(game, 'caio', firstNotOnBoard, 2);
  revealWord(game, 'duda', 0);
  check(game.turn === 'vermelho' && remaining(game, 'vermelho') === 8, 'palavra do outro time: ajuda o outro time e a vez passa');
  giveClue(game, 'ana', firstNotOnBoard, 2);
  revealWord(game, 'bia', 1);
  passTurn(game, 'bia');
  check(game.turn === 'azul' && game.events.at(-1).kind === 'pass', 'depois de uma tentativa, dá para passar a vez');
}
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 2);
  revealWord(game, 'bia', 24);
  check(game.stage === 'over' && game.winner === 'azul' && game.winReason === 'assassino', 'assassino: o outro time vence na hora');
  check(throws(() => giveClue(game, 'caio', firstNotOnBoard, 1), 'fim'), 'depois do fim, nada mais acontece');
}
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 9);
  for (let i = 0; i < 9; i++) revealWord(game, 'bia', i);
  check(game.stage === 'over' && game.winner === 'vermelho' && game.winReason === 'todas', 'achou todas as suas palavras: vence');
}
{
  const game = newGame();
  // Azul já achou 7 das 8; vermelho revela a última azul por engano → azul vence.
  for (let i = 9; i < 16; i++) game.revealed[i] = true;
  giveClue(game, 'ana', firstNotOnBoard, 1);
  revealWord(game, 'bia', 16);
  check(game.stage === 'over' && game.winner === 'azul', 'revelar a última palavra do outro time faz o outro time vencer');
}

// ---------------------------------------------------------------- quem caiu
{
  const game = newGame();
  check(!skipOfflinePlayers(game, ['caio']), 'nada a pular se quem caiu não está travando');
  check(skipOfflinePlayers(game, ['ana']) && game.players.find(p => p.id === 'bia').chief
    && !game.players.find(p => p.id === 'ana').chief, 'chefe da vez caiu: outra pessoa do time vira chefe');
  check(privateState(game, 'bia').key !== null, 'o novo chefe recebe o mapa');
}
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 2);
  check(skipOfflinePlayers(game, ['bia']) && game.turn === 'azul', 'ninguém do time para adivinhar: a vez passa');
}

// ---------------------------------------------------------------- privacidade
{
  const game = newGame();
  const tv = JSON.stringify(publicState(game));
  check(!/"key"|"token"|assassino|neutro/.test(tv), 'a TV não recebe o mapa de cores no começo');
  check(privateState(game, 'ana').key?.length === 25 && privateState(game, 'caio').key?.length === 25, 'os 2 chefes recebem o mapa');
  check(privateState(game, 'bia').key === null && privateState(game, 'duda').key === null, 'quem adivinha não recebe o mapa');
}
{
  // O teste mais forte: duas partidas iguais em que só muda o MAPA dão o mesmo
  // retrato público (no começo, depois da dica e com palavras apontadas).
  const otherKey = [...KEY.slice(0, 2), KEY[20], ...KEY.slice(3, 20), KEY[2], ...KEY.slice(21)];
  const a = newGame();
  const b = newGame(otherKey);
  const same = () => JSON.stringify(publicState(a)) === JSON.stringify(publicState(b));
  check(same(), 'mapas diferentes → mesmo retrato público (começo)');
  giveClue(a, 'ana', firstNotOnBoard, 2);
  giveClue(b, 'ana', firstNotOnBoard, 2);
  pointWord(a, 'bia', 2);
  pointWord(b, 'bia', 2);
  check(same(), 'mapas diferentes → mesmo retrato público (dica e palavra apontada)');
  revealWord(a, 'bia', 0);
  revealWord(b, 'bia', 0);
  check(same(), 'mapas diferentes → mesmo retrato público (depois de revelar uma palavra igual nos dois)');
}
{
  const game = newGame();
  giveClue(game, 'ana', firstNotOnBoard, 1);
  revealWord(game, 'bia', 24);
  const cards = publicState(game).cards;
  check(cards.every(c => c.color !== null), 'no fim, todas as cores aparecem na TV');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
