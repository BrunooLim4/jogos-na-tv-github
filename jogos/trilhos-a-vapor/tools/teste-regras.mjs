// Teste das regras do jogo (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, drawDeck, drawFaceUp, claimRoute, drawTickets, chooseTickets, skipOfflinePlayers,
  publicState, privateState, currentPlayerId, GameError,
} from '../game/ttr.js';
import { LOCOMOTIVE } from '../public/cards.js';
import { ROUTES_BY_ID, paymentOptions, longestPath, citiesConnected, suggestRoutes, rankRoutes, routeAvailability } from '../public/rules.js';
import { ROUTES } from '../public/map-usa.js';

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${label}`);
  if (!ok) failures++;
};
const errorCode = fn => {
  try {
    fn();
    return null;
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    return error.code;
  }
};
const makePlayers = n => ['Ana', 'Bia', 'Caio', 'Duda', 'Eva'].slice(0, n)
  .map((name, i) => ({ id: name.toLowerCase(), name, color: ['azul', 'verde', 'roxo', 'amarelo', 'vermelho'][i] }));
const handSize = (game, id) => Object.values(game.players[id].hand).reduce((s, n) => s + n, 0);
const totalCards = game =>
  game.deck.length + game.discard.length + game.faceUp.filter(Boolean).length
  + game.order.reduce((s, id) => s + handSize(game, id), 0);

// Começa uma partida e já faz todos escolherem os bilhetes (fica na fase de vezes).
function startedGame(n = 3) {
  const game = createGame(makePlayers(n));
  for (const id of game.order) chooseTickets(game, id, game.players[id].pending.offered);
  return game;
}
function giveCards(game, id, cards) {
  for (const [card, n] of Object.entries(cards)) game.players[id].hand[card] += n;
}

// ---------------------------------------------------------------- começo
let game = createGame(makePlayers(3));
check(game.stage === 'tickets', 'a partida começa com todos escolhendo bilhetes');
check(game.order.every(id => handSize(game, id) === 4), 'cada jogador começa com 4 cartas');
check(game.order.every(id => game.players[id].pending.offered.length === 3), 'cada jogador recebe 3 bilhetes para escolher');
check(game.faceUp.filter(Boolean).length === 5, '5 cartas abertas na mesa');
check(totalCards(game) === 110, 'baralho tem 110 cartas no total');
const pub = JSON.stringify(publicState(game));
check(!pub.includes('"hand"') && !pub.includes('"offered"'), 'estado público não mostra mão nem bilhetes de ninguém');

const [ana, bia, caio] = game.order;
check(errorCode(() => drawDeck(game, currentPlayerId(game))) === 'fora_de_hora', 'ninguém joga antes de todos escolherem os bilhetes');
const offered = game.players[ana].pending.offered;
check(errorCode(() => chooseTickets(game, ana, [offered[0]])) === 'poucos_bilhetes', 'no começo, ficar com só 1 bilhete é recusado');
chooseTickets(game, ana, offered.slice(0, 2));
check(game.players[ana].tickets.length === 2 && game.ticketDeck[0] === offered[2], 'o bilhete devolvido vai para o fundo da pilha');
chooseTickets(game, bia, game.players[bia].pending.offered);
check(game.stage === 'tickets', 'ainda espera o último escolher');
chooseTickets(game, caio, game.players[caio].pending.offered.slice(0, 2));
check(game.stage === 'turns', 'quando todos escolhem, começam as vezes');

// ---------------------------------------------------------------- comprar cartas
game = startedGame();
let p = currentPlayerId(game);
const other = game.order.find(id => id !== p);
check(errorCode(() => drawDeck(game, other)) === 'nao_e_sua_vez', 'quem não está na vez não compra');
drawDeck(game, p);
check(currentPlayerId(game) === p && game.turn.drawn === 1, 'depois de 1 carta, a vez continua');
check(errorCode(() => drawTickets(game, p)) === 'ja_comprou', 'depois de comprar carta não dá para pegar bilhetes');
drawDeck(game, p);
check(currentPlayerId(game) !== p, 'depois de 2 cartas, a vez passa');

game = startedGame();
p = currentPlayerId(game);
game.faceUp[0] = LOCOMOTIVE;
drawFaceUp(game, p, 0);
check(currentPlayerId(game) !== p, 'locomotiva da mesa como 1ª carta encerra a vez');

game = startedGame();
p = currentPlayerId(game);
game.faceUp = ['azul', LOCOMOTIVE, 'verde', 'roxo', 'preto'];
drawFaceUp(game, p, 0);
check(errorCode(() => drawFaceUp(game, p, 1)) === 'locomotiva_segunda', 'locomotiva da mesa como 2ª carta é recusada');

game = startedGame();
p = currentPlayerId(game);
game.faceUp = [LOCOMOTIVE, LOCOMOTIVE, 'azul', 'verde', 'roxo'];
game.deck.push(LOCOMOTIVE);
drawFaceUp(game, p, 2);
check(game.faceUp.filter(c => c === LOCOMOTIVE).length < 3, 'com 3 locomotivas na mesa, as cartas são trocadas');

// ---------------------------------------------------------------- rotas
game = startedGame(3);
p = currentPlayerId(game);
const denKcy = 'den-kcy-2'; // Denver–Kansas City, 4 vagões, laranja (faixa 2)
check(ROUTES_BY_ID[denKcy].color === 'laranja' && ROUTES_BY_ID[denKcy].length === 4, 'rota Denver–Kansas City laranja tem 4 vagões');
game.players[p].hand = { ...game.players[p].hand, laranja: 2, [LOCOMOTIVE]: 0 };
check(errorCode(() => claimRoute(game, p, denKcy, { locomotives: 0 })) === 'cartas_insuficientes', 'sem cartas suficientes, a rota é recusada');
giveCards(game, p, { laranja: 1, [LOCOMOTIVE]: 1 });
const before = { trains: game.players[p].trains, score: game.players[p].score, discard: game.discard.length };
claimRoute(game, p, denKcy, { locomotives: 1 });
check(game.claimed[denKcy] === p, 'rota conquistada fica com o jogador');
check(game.players[p].trains === before.trains - 4, 'gasta 4 trens');
check(game.players[p].score === before.score + 7, 'rota de 4 vagões vale 7 pontos');
check(game.players[p].hand.laranja === 0 && game.players[p].hand[LOCOMOTIVE] === 0, 'paga 3 laranjas + 1 locomotiva');
check(game.discard.length === before.discard + 4, 'as cartas pagas vão para o descarte');
check(currentPlayerId(game) !== p, 'conquistar uma rota encerra a vez');

// rota dupla com 3 jogadores: a outra faixa fica bloqueada
let q = currentPlayerId(game);
giveCards(game, q, { preto: 4 });
check(errorCode(() => claimRoute(game, q, 'den-kcy-1', { locomotives: 0 })) === 'rota_indisponivel', 'com 3 jogadores, a outra faixa da rota dupla fica bloqueada');

// rota dupla com 4 jogadores: outro jogador pode, o mesmo não
game = startedGame(4);
p = currentPlayerId(game);
giveCards(game, p, { laranja: 4, preto: 4 });
claimRoute(game, p, 'den-kcy-2', { locomotives: 0 });
q = currentPlayerId(game);
giveCards(game, q, { preto: 4 });
claimRoute(game, q, 'den-kcy-1', { locomotives: 0 });
check(game.claimed['den-kcy-1'] === q, 'com 4 jogadores, outro jogador pega a outra faixa');
game.claimed['den-kcy-1'] = undefined;
delete game.claimed['den-kcy-1'];
game.turn.index = game.order.indexOf(p);
check(errorCode(() => claimRoute(game, p, 'den-kcy-1', { locomotives: 0 })) === 'rota_indisponivel', 'o mesmo jogador não pega as duas faixas');

// rota cinza: escolhe a cor
game = startedGame(2);
p = currentPlayerId(game);
game.players[p].hand = { ...game.players[p].hand, azul: 0, roxo: 3, [LOCOMOTIVE]: 0 };
check(errorCode(() => claimRoute(game, p, 'lax-phx', { color: 'azul', locomotives: 0 })) === 'cartas_insuficientes', 'rota cinza com cor que não tem: recusada');
claimRoute(game, p, 'lax-phx', { color: 'roxo', locomotives: 0 });
check(game.claimed['lax-phx'] === p && game.players[p].score === 4, 'rota cinza de 3 com roxas: conquistada, +4 pontos');

// sem trens suficientes
game = startedGame(2);
p = currentPlayerId(game);
game.players[p].trains = 3;
giveCards(game, p, { amarelo: 6 });
check(errorCode(() => claimRoute(game, p, 'sea-hel', { locomotives: 0 })) === 'sem_trens', 'sem trens suficientes, a rota é recusada');

// formas de pagar (o celular mostra estas opções)
const options = paymentOptions(ROUTES_BY_ID['lax-phx'], { roxo: 2, azul: 3, [LOCOMOTIVE]: 1 });
check(options[0].locomotives === 0 && options.some(o => o.color === 'roxo' && o.locomotives === 1), 'opções de pagamento: primeiro sem locomotiva, roxo precisa de 1 loco');

// ---------------------------------------------------------------- bilhetes no meio do jogo
game = startedGame(2);
p = currentPlayerId(game);
const ticketsBefore = game.players[p].tickets.length;
drawTickets(game, p);
check(game.players[p].pending?.offered.length === 3 && game.players[p].pending.minKeep === 1, 'pegar bilhetes: 3 para escolher, fica com pelo menos 1');
check(errorCode(() => drawDeck(game, p)) === 'escolha_bilhetes', 'enquanto escolhe bilhetes, não compra carta');
chooseTickets(game, p, [game.players[p].pending.offered[0]]);
check(game.players[p].tickets.length === ticketsBefore + 1 && currentPlayerId(game) !== p, 'fica com 1 bilhete e a vez passa');

// ---------------------------------------------------------------- última rodada e fim
game = startedGame(3);
p = currentPlayerId(game);
game.players[p].trains = 3;
giveCards(game, p, { [LOCOMOTIVE]: 1 });
claimRoute(game, p, 'oma-kcy-1', { locomotives: 1 }); // 1 vagão: fica com 2 trens
check(game.lastRound?.by === p, 'ficar com 2 trens começa a última rodada');
drawDeck(game, currentPlayerId(game)); drawDeck(game, currentPlayerId(game)); // jogador 2
drawDeck(game, currentPlayerId(game)); drawDeck(game, currentPlayerId(game)); // jogador 3
check(game.stage === 'turns' && currentPlayerId(game) === p, 'todos jogam mais uma vez, inclusive quem disparou');
drawDeck(game, p); drawDeck(game, p);
check(game.stage === 'finished' && game.results?.length === 3, 'depois da vez final de quem disparou, o jogo acaba');

// contagem: bilhete completo soma, incompleto subtrai; maior caminho +10
game = startedGame(2);
const [x, y] = game.order;
game.players[x].tickets = ['den-elp']; // Denver → El Paso (4)
game.players[y].tickets = ['sea-nyc']; // Seattle → New York (22)
game.claimed = { 'den-saf': x, 'saf-elp': x };
game.players[x].score = 4;
game.players[x].trains = 2;
game.turn.index = game.order.indexOf(x);
game.lastRound = { by: x };
drawDeck(game, x); drawDeck(game, x);
const rx = game.results.find(r => r.id === x);
const ry = game.results.find(r => r.id === y);
check(rx.tickets[0].done && rx.ticketPoints === 4, 'bilhete completo soma os pontos');
check(!ry.tickets[0].done && ry.ticketPoints === -22, 'bilhete incompleto tira os pontos');
check(rx.longest === 4 && rx.longestBonus === 10 && ry.longestBonus === 0, 'maior caminho contínuo ganha +10');
check(rx.total === 4 + 4 + 10 && rx.winner && !ry.winner, 'total e vencedor calculados');
check(JSON.stringify(publicState(game)).includes('"results"'), 'no fim, o resultado (com bilhetes) fica público');

// ---------------------------------------------------------------- caminhos
check(longestPath(['den-saf', 'saf-elp', 'elp-hou', 'phx-elp']) === 10, 'maior caminho escolhe o trecho mais longo (Denver→Houston = 10)');
check(citiesConnected(['den-saf', 'saf-elp'], 'den', 'elp') && !citiesConnected(['den-saf'], 'den', 'elp'), 'cidades ligadas pelas rotas do jogador');
const help = suggestRoutes([{ id: 'den-elp', a: 'den', b: 'elp', points: 4 }], {}, 'x', 2);
check(Boolean(help['den-saf'] && help['saf-elp']), 'sugestão: caminho mais curto Denver → Santa Fe → El Paso');

// ---------------------------------------------------------------- melhores jogadas (aba "Colocar trens")
const denElp = { id: 'den-elp', a: 'den', b: 'elp', points: 4 };
{
  // Já tem Denver → Santa Fe: Santa Fe → El Paso fecha o bilhete e vem em 1º.
  const ranked = rankRoutes({ hand: { vermelho: 2 }, tickets: [denElp], claimed: { 'den-saf': 'x' }, playerId: 'x', playerCount: 2, trains: 45 });
  check(ranked[0]?.route.id === 'saf-elp' && ranked[0].helps[0]?.completes, 'rota que completa o bilhete vem em 1º e marcada');
}
{
  // Outro jogador fechou Denver → Santa Fe: aparece também o caminho alternativo por Oklahoma City.
  const ranked = rankRoutes({ hand: { vermelho: 4 }, tickets: [denElp], claimed: { 'den-saf': 'y' }, playerId: 'x', playerCount: 2, trains: 45 });
  const ids = ranked.filter(r => r.helps.length).map(r => r.route.id);
  check(ids.includes('den-okc') && ids.includes('phx-elp'), 'sugestão considera caminhos alternativos (não só o mais curto)');
}
{
  // A lista traz TODAS as rotas que dá para pagar (uma por par de cidades).
  const hand = { vermelho: 3, azul: 2, verde: 4, amarelo: 1, laranja: 2, branco: 1, roxo: 2, [LOCOMOTIVE]: 1 };
  const claimed = { 'den-saf': 'y' };
  const ranked = rankRoutes({ hand, tickets: [denElp], claimed, playerId: 'x', playerCount: 3, trains: 45 });
  const pairs = new Set(ROUTES.filter(r => routeAvailability(r, claimed, 'x', 3).ok && paymentOptions(r, hand).length).map(r => `${r.a}-${r.b}`));
  check(ranked.length === pairs.size && pairs.size > 20, `lista com todas as rotas pagáveis (${pairs.size})`);
  const few = rankRoutes({ hand, tickets: [], claimed, playerId: 'x', playerCount: 3, trains: 3 });
  check(few.every(r => r.route.length <= 3), 'não sugere rota maior que os trens que sobraram');
}

// ---------------------------------------------------------------- desconectado
game = createGame(makePlayers(2));
chooseTickets(game, game.order[0], game.players[game.order[0]].pending.offered);
skipOfflinePlayers(game, [game.order[1]]);
check(game.stage === 'turns', 'líder destrava quem caiu durante a escolha dos bilhetes');
const stuck = currentPlayerId(game);
skipOfflinePlayers(game, [stuck]);
check(currentPlayerId(game) !== stuck, 'líder pula a vez de quem está desconectado');

// ---------------------------------------------------------------- privacidade dos sons/animações
// A TV toca som a partir dos eventos públicos: eles não podem revelar segredos.
game = startedGame(2);
p = currentPlayerId(game);
const { card: secretCard } = drawDeck(game, p);
const deckEvent = game.events.at(-1);
check(deckEvent.kind === 'card' && !('card' in deckEvent) && !deckEvent.text.toLowerCase().includes(`pegou ${secretCard}`),
  'evento "comprou da pilha" não diz qual carta foi');
drawDeck(game, p);
q = currentPlayerId(game);
game.players[q].tickets = ['den-elp'];
giveCards(game, q, { roxo: 2 });
claimRoute(game, q, 'den-saf', { color: 'roxo', locomotives: 0 });
p = currentPlayerId(game);
drawDeck(game, p); drawDeck(game, p);
giveCards(game, q, { roxo: 2 });
claimRoute(game, q, 'saf-elp', { color: 'roxo', locomotives: 0 }); // completa Denver → El Paso
const publicJson = JSON.stringify(publicState(game));
check(privateState(game, q).tickets[0].done, 'o dono vê o bilhete completo');
check(!publicJson.includes('"done"') && !publicJson.includes('den-elp') && !publicJson.includes('El Paso (4'),
  'TV/eventos não revelam bilhete completo');
check(game.events.at(-1).kind === 'claim', 'completar bilhete soa igual a qualquer rota (só o evento da rota)');

const priv = privateState(game, game.order[0]);
check(Array.isArray(priv.tickets) && priv.hand && priv.pending === null, 'estado privado tem mão e bilhetes do dono');

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
