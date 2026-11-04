// Teste das regras do Lobisomem (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, chooseCards, nightAction, callVote, addMinute, castVote, skipOfflinePlayers,
  publicState, privateState, CENTER, dayLength,
} from '../game/jogo.js';
import { DECK, FIXED, roleOf } from '../public/papeis.js';

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
const NAMES = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fê', 'Gabi', 'Hugo', 'Iara', 'Juca'];
const makePlayers = n => NAMES.slice(0, n).map(name => ({ id: name.toLowerCase(), name }));
// partida com as cartas na ordem dada: um por jogador e as 3 últimas no meio
const fixed = (cards, now = 0) => createGame(makePlayers(cards.length - 3), { cards });
const P = (...players) => ({ players, center: [] });
const C = (...center) => ({ players: [], center });
const infoOf = (game, id) => privateState(game, id).info.map(i => i.text).join(' | ');
// seed simples para sortear igual
const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------------------------------------------------------------- as cartas
{
  let ok = true;
  for (let n = 3; n <= 10; n++) {
    for (let s = 1; s <= 200; s++) {
      const cards = chooseCards(n, seeded(s * 31 + n));
      const masons = cards.filter(c => roleOf(c) === 'macom').length;
      if (cards.length !== n + 3 || new Set(cards).size !== cards.length) ok = false;
      if (!FIXED.every(c => cards.includes(c)) || !cards.every(c => DECK.includes(c))) ok = false;
      if (masons === 1) ok = false;
    }
  }
  check(ok, 'cartas = jogadores + 3, sempre com os 2 Lobisomens, Vidente, Ladrão e Encrenqueira; Maçons só os dois juntos');
  const g = createGame(makePlayers(5), { random: seeded(7) });
  check(Object.keys(g.cards).length === 8 && CENTER.every(c => g.cards[c]), 'cada jogador recebe 1 carta e 3 ficam no meio');
  check(g.stage === 'noite' && g.events.at(-1).kind === 'start', 'a partida começa de noite (lance "start" para a TV distribuir)');
  check(dayLength(3) === 180_000 && dayLength(10) === 320_000, 'o dia dura 3 min com 3 jogadores e +20 s por jogador a mais');
}

// ---------------------------------------------------------------- uma noite completa
// Ana=Vidente, Bia=Ladrão, Caio=Lobisomem, Duda=Encrenqueira, Eva=Insone; meio: Lobisomem, Aldeão, Bêbado
{
  const g = fixed(['vidente', 'ladrao', 'lobisomem-1', 'encrenqueira', 'insone', 'lobisomem-2', 'aldeao-1', 'bebado']);
  check(throws(() => nightAction(g, 'bia', P('caio', 'ana')), 'escolha_invalida'), 'o Ladrão não pode escolher 2 jogadores');
  check(throws(() => nightAction(g, 'ana', P('ana')), 'escolha_invalida'), 'ninguém escolhe a si mesmo');
  check(throws(() => nightAction(g, 'ana', C(0)), 'escolha_invalida'), 'a Vidente espia 1 jogador ou 2 do meio (1 do meio não vale)');
  nightAction(g, 'ana', P('caio'));
  nightAction(g, 'bia', P('caio'));
  nightAction(g, 'caio', C(0));
  nightAction(g, 'duda', P('ana', 'bia'));
  check(g.stage === 'noite' && publicState(g).players.filter(p => p.nightDone).length === 4, 'a noite espera todos (a TV vê só quem já terminou)');
  check(throws(() => nightAction(g, 'ana', P('bia')), 'ja_fez'), 'quem já fez a sua parte não escolhe de novo');
  nightAction(g, 'eva', C(2), { now: 1000 }); // a Insone só disfarça
  check(g.stage === 'dia' && g.dayEndsAt === 1000 + dayLength(5), 'quando o último termina, amanhece e o relógio do dia começa');
  check(infoOf(g, 'ana').includes('Caio: Lobisomem'), 'a Vidente vê a carta antes do Ladrão roubar (ordem oficial)');
  check(infoOf(g, 'bia').includes('agora é: Lobisomem'), 'o Ladrão vê a carta que pegou');
  check(infoOf(g, 'caio').includes('único lobisomem') && infoOf(g, 'caio').includes('carta 1 do meio: Lobisomem'), 'lobisomem sozinho espia a carta do meio que escolheu');
  check(infoOf(g, 'duda').includes('trocou as cartas de Ana e Bia'), 'a Encrenqueira sabe quem trocou, sem ver as cartas');
  check(infoOf(g, 'eva').includes('a sua carta é: Insone'), 'a Insone vê a própria carta no fim da noite');
  check(g.cards.ana === 'lobisomem-1' && g.cards.bia === 'vidente' && g.cards.caio === 'ladrao', 'as trocas acontecem na ordem: Ladrão (Bia↔Caio) e depois Encrenqueira (Ana↔Bia)');
  check(privateState(g, 'ana').card === 'vidente', 'cada um continua vendo a carta que recebeu (não sabe que mudou)');
  // dia → votação
  addMinute(g, { now: 5000 });
  check(g.dayEndsAt === 1000 + dayLength(5) + 60_000, 'o líder pode dar mais 1 minuto');
  callVote(g);
  check(g.stage === 'votacao' && throws(() => castVote(g, 'ana', 'ana'), 'voto_em_si'), 'na votação ninguém vota em si');
  castVote(g, 'ana', 'caio');
  castVote(g, 'ana', 'eva'); // trocou o voto
  castVote(g, 'bia', 'ana');
  castVote(g, 'caio', 'ana');
  castVote(g, 'duda', 'ana');
  const tv = JSON.stringify(publicState(g));
  check(!tv.includes('"votes"') && publicState(g).players.filter(p => p.voted).length === 4, 'antes do último voto, a TV sabe quem votou, não em quem');
  castVote(g, 'eva', 'ana');
  const r = g.result;
  check(g.stage === 'fim' && r.dead.length === 1 && r.dead[0] === 'ana', 'o mais votado morre (Ana, com 4 votos)');
  check(r.villageWins && !r.wolfTeamWins && r.headline === 'A vila venceu!', 'Ana tinha virado Lobisomem: a vila vence');
  check(!r.winners.includes('ana') && r.winners.includes('caio') && r.winners.includes('bia'), 'cada um vence pelo time da carta do FIM (Caio virou Ladrão, Bia virou Vidente)');
  check(privateState(g, 'ana').won === false && privateState(g, 'ana').finalCard === 'lobisomem-1', 'no fim o celular mostra a carta final e se venceu');
  check(g.players.find(p => p.id === 'bia').wins === 1, 'quem venceu soma 1 vitória');
}

// ---------------------------------------------------------------- votação: empate, ninguém, Caçador, Curtidor
function playNight(g) {
  for (const p of g.players) {
    const role = roleOf(g.original[p.id]);
    const other = g.players.find(o => o.id !== p.id).id;
    const others = g.players.filter(o => o.id !== p.id).map(o => o.id);
    const pick = { vidente: C(0, 1), ladrao: P(other), encrenqueira: P(others[0], others[1]), bebado: C(0), lobisomem: C(0), sosia: P(other) }[role] ?? C(1);
    nightAction(g, p.id, pick);
  }
}
function vote(g, votes) {
  callVote(g);
  for (const [a, b] of Object.entries(votes)) castVote(g, a, b);
  return g.result;
}
{
  // ninguém troca: Ana=Aldeão, Bia=Lobisomem, Caio=Caçador, Duda=Curtidor; meio: Lobisomem, Vidente... (cartas inventadas para o teste)
  let g = fixed(['aldeao-1', 'lobisomem-1', 'cacador', 'curtidor', 'lobisomem-2', 'aldeao-2', 'aldeao-3']);
  playNight(g);
  let r = vote(g, { ana: 'bia', bia: 'ana', caio: 'duda', duda: 'caio' });
  check(r.dead.length === 0 && r.wolfTeamWins && r.headline === 'Os lobisomens venceram!', 'ninguém com mais de 1 voto: ninguém morre e o lobisomem vence');

  g = fixed(['aldeao-1', 'lobisomem-1', 'cacador', 'curtidor', 'lobisomem-2', 'aldeao-2', 'aldeao-3']);
  playNight(g);
  r = vote(g, { ana: 'bia', caio: 'bia', bia: 'ana', duda: 'ana' });
  check(r.dead.includes('ana') && r.dead.includes('bia') && r.villageWins, 'empate no mais votado: os dois morrem (e o lobisomem morto dá a vitória à vila)');

  g = fixed(['aldeao-1', 'lobisomem-1', 'cacador', 'curtidor', 'lobisomem-2', 'aldeao-2', 'aldeao-3']);
  playNight(g);
  r = vote(g, { ana: 'caio', bia: 'caio', caio: 'bia', duda: 'ana' });
  check(r.dead.includes('caio') && r.dead.includes('bia') && r.hunterKills[0]?.target === 'bia' && r.villageWins, 'o Caçador morre e leva junto quem ele votou (o lobisomem)');

  g = fixed(['aldeao-1', 'lobisomem-1', 'cacador', 'curtidor', 'lobisomem-2', 'aldeao-2', 'aldeao-3']);
  playNight(g);
  r = vote(g, { ana: 'duda', bia: 'duda', caio: 'duda', duda: 'ana' });
  check(r.dead[0] === 'duda' && r.tannerDead && !r.wolfTeamWins && !r.villageWins && r.headline === 'O Curtidor venceu!', 'o Curtidor morre: só ele vence (os lobisomens não)');

  // os dois lobisomens no meio, com Lacaio
  g = fixed(['aldeao-1', 'lacaio', 'vidente', 'lobisomem-1', 'lobisomem-2', 'aldeao-2']);
  playNight(g);
  check(infoOf(g, 'bia').includes('Nenhum jogador é lobisomem'), 'o Lacaio sabe quando os lobisomens estão no meio');
  r = vote(g, { ana: 'bia', bia: 'ana', caio: 'ana' });
  check(r.dead[0] === 'ana' && r.wolfTeamWins && r.headline === 'O Lacaio venceu!', 'sem lobisomem entre os jogadores: alguém (que não o Lacaio) morre → o Lacaio vence');
  g = fixed(['aldeao-1', 'lacaio', 'vidente', 'lobisomem-1', 'lobisomem-2', 'aldeao-2']);
  playNight(g);
  r = vote(g, { ana: 'bia', bia: 'caio', caio: 'ana' });
  check(r.dead.length === 0 && r.villageWins && r.reason.includes('no meio'), 'sem lobisomem entre os jogadores e ninguém morre → a vila vence');
}

// ---------------------------------------------------------------- Sósia, Maçons, Bêbado
{
  // Ana=Sósia copia Bia (Vidente) e espia 2 do meio; Caio=Lobisomem; Duda=Maçom; Eva=Bêbado
  const g = fixed(['sosia', 'vidente', 'lobisomem-1', 'macom-1', 'bebado', 'lobisomem-2', 'macom-2', 'aldeao-1']);
  nightAction(g, 'ana', P('bia'));
  check(privateState(g, 'ana').copied === 'vidente' && privateState(g, 'ana').step === 'sosia-2', 'a Sósia vê na hora o que virou e, se age na hora, escolhe de novo');
  const other = fixed(['sosia', 'vidente', 'lobisomem-1', 'macom-1', 'bebado', 'lobisomem-2', 'macom-2', 'aldeao-1']);
  nightAction(other, 'ana', P('eva')); // copiou o Bêbado (também age na hora)
  check(!publicState(g).players[0].nightDone && JSON.stringify(publicState(g, 0)) === JSON.stringify(publicState(other, 0)), 'a TV não fica sabendo o que a Sósia copiou');
  nightAction(g, 'ana', C(0, 1));
  nightAction(g, 'bia', P('caio'));
  nightAction(g, 'caio', C(2));
  nightAction(g, 'duda', P('ana'));
  nightAction(g, 'eva', C(1));
  check(infoOf(g, 'ana').includes('virou') || infoOf(g, 'ana').includes('agora você é Vidente'), 'a Sósia sabe quem copiou');
  check(infoOf(g, 'ana').includes('cartas 1 e 2 do meio: Lobisomem e Maçom'), 'a Sósia-Vidente espia antes de todos (antes do Bêbado trocar)');
  check(infoOf(g, 'duda').includes('O outro maçom está no meio'), 'Maçom sozinho: o outro está no meio');
  check(g.cards.eva === 'macom-2' && g.cards['meio-2'] === 'bebado', 'o Bêbado troca com a carta do meio escolhida');
}
{
  // Sósia copia o Lobisomem: os lobisomens se veem; o Ladrão rouba a carta da Sósia e vira lobisomem
  const g = fixed(['sosia', 'lobisomem-1', 'ladrao', 'aldeao-1', 'lobisomem-2', 'vidente', 'encrenqueira']);
  nightAction(g, 'ana', P('bia'));
  check(privateState(g, 'ana').step === 'feito', 'Sósia que copia o Lobisomem termina na 1ª escolha');
  nightAction(g, 'bia', C(0));
  nightAction(g, 'caio', P('ana'));
  nightAction(g, 'duda', P('bia'));
  check(infoOf(g, 'bia').includes('Os lobisomens são: Bia e Ana'), 'o Lobisomem vê a Sósia que virou lobisomem');
  check(infoOf(g, 'caio').includes('Sósia (que virou Lobisomem)'), 'o Ladrão que pega a carta da Sósia vira o que ela copiou');
  const r = vote(g, { ana: 'duda', bia: 'duda', caio: 'bia', duda: 'caio' });
  check(r.roles.caio === 'lobisomem' && r.roles.ana === 'ladrao' && r.wolfTeamWins, 'no fim, quem tem a carta da Sósia é do time do que ela copiou');
}

// ---------------------------------------------------------------- quem caiu
{
  const g = fixed(['vidente', 'ladrao', 'lobisomem-1', 'aldeao-1', 'lobisomem-2', 'aldeao-2']);
  nightAction(g, 'bia', P('caio'));
  nightAction(g, 'caio', C(0));
  check(!skipOfflinePlayers(g, ['bia']), 'pular quem já terminou não muda nada');
  check(skipOfflinePlayers(g, ['ana']) && g.stage === 'dia', 'a Vidente caiu: o líder pula e amanhece');
  check(infoOf(g, 'ana').includes('caiu'), 'quem caiu não faz nada à noite');
  callVote(g);
  castVote(g, 'bia', 'caio');
  castVote(g, 'caio', 'bia');
  check(skipOfflinePlayers(g, ['ana']) && g.stage === 'fim', 'na votação, quem caiu não vota e o resultado sai');
}

// ---------------------------------------------------------------- privacidade
// Duas partidas iguais em que só muda o SEGREDO (o que cada um escolheu à noite) têm
// que dar exatamente o mesmo retrato público até o fim.
{
  const cards = ['vidente', 'ladrao', 'lobisomem-1', 'encrenqueira', 'aldeao-1', 'lobisomem-2', 'insone', 'bebado'];
  const a = fixed(cards);
  const b = fixed(cards);
  nightAction(a, 'ana', P('caio'));
  nightAction(b, 'ana', C(0, 2));
  nightAction(a, 'bia', P('caio'));
  nightAction(b, 'bia', P('duda'));
  for (const g of [a, b]) {
    nightAction(g, 'caio', C(1));
    nightAction(g, 'duda', P('ana', 'eva'));
    nightAction(g, 'eva', C(0), { now: 0 });
  }
  check(JSON.stringify(publicState(a, 0)) === JSON.stringify(publicState(b, 0)), 'o que a Vidente espiou e quem o Ladrão roubou não muda nada na TV');
  // trocar as cartas de duas pessoas (o segredo de quem é quem) também não
  const c = fixed(['ladrao', 'vidente', 'lobisomem-1', 'encrenqueira', 'aldeao-1', 'lobisomem-2', 'insone', 'bebado']);
  const d = fixed(['vidente', 'ladrao', 'lobisomem-1', 'encrenqueira', 'aldeao-1', 'lobisomem-2', 'insone', 'bebado']);
  check(JSON.stringify(publicState(c, 0)) === JSON.stringify(publicState(d, 0)), 'quem recebeu qual carta não aparece na TV');
  const tv = JSON.stringify(publicState(a, 0));
  check(!/"cards"|"original"|"info"|"votes"|"story"|"token"/.test(tv), 'a TV não recebe cartas, descobertas, votos nem a história da noite antes do fim');
  check(JSON.stringify(privateState(a, 'ana')).includes('Caio') && !JSON.stringify(privateState(a, 'bia')).includes('Você espiou'), 'cada celular recebe só o que ELE descobriu');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
