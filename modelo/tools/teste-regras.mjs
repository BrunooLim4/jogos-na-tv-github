// Teste das regras do jogo (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
// TROCAR/ACRESCENTAR: um check para cada regra, e os de PRIVACIDADE.
import { createGame, publicState, privateState } from '../game/jogo.js';

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${label}`);
  if (!ok) failures++;
};
const makePlayers = n => ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fê'].slice(0, n)
  .map(name => ({ id: name.toLowerCase(), name }));

{
  const game = createGame(makePlayers(3));
  check(game.players.length === 3 && game.round === 1, 'a partida começa com todos os jogadores');
  check(game.events.at(-1)?.kind === 'start', 'o começo vira um lance público (a TV toca o som de "começou")');
}

// ---------------------------------------------------------------- privacidade
// O teste mais forte: duas partidas iguais em que só muda um SEGREDO (a carta
// escolhida, a mão...) têm que dar exatamente o mesmo publicState.
{
  const game = createGame(makePlayers(3));
  const tv = JSON.stringify(publicState(game));
  check(!/"hand"|"deck"|"token"/.test(tv), 'a TV não recebe mão, baralho nem token');
  check(typeof privateState(game, 'ana') === 'object', 'cada celular recebe o seu estado privado');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
