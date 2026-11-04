// Teste das regras do Resistência (não precisa do servidor ligado).
// Uso: node tools/teste-regras.mjs
import {
  createGame, publicState, privateState, seeRole, pickPlayer, proposeTeam, castVote, playMission,
  skipOfflinePlayers, GameError,
} from '../game/jogo.js';

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
    return error instanceof GameError && error.code === code;
  }
};
const NAMES = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fê', 'Gil', 'Hugo', 'Iara', 'Juca'];
const makePlayers = n => NAMES.slice(0, n).map(name => ({ id: name.toLowerCase(), name }));

// Sorteio repetível (mesma semente = mesma partida).
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = game => game.players.map(p => p.id);
const spiesOf = game => game.players.filter(p => p.role === 'espiao').map(p => p.id);
const resistanceOf = game => game.players.filter(p => p.role === 'resistencia').map(p => p.id);
const commander = game => publicState(game).commanderId;
const seeAll = game => ids(game).forEach(id => seeRole(game, id));
const size = game => game.missions[game.mission].size;
function propose(game, team) {
  for (const id of team) pickPlayer(game, commander(game), id);
  proposeTeam(game, commander(game));
}
const voteAll = (game, approve) => ids(game).forEach(id => castVote(game, id, approve));
// Time só da Resistência (para a missão dar certo) ou com espiões (para fracassar).
const cleanTeam = game => resistanceOf(game).slice(0, size(game));
const dirtyTeam = (game, spies = 1) => [...spiesOf(game).slice(0, spies), ...resistanceOf(game)].slice(0, size(game));
function runMission(game, team, sabotage = []) {
  propose(game, team);
  voteAll(game, true);
  for (const id of team) playMission(game, id, sabotage.includes(id) ? 'sabotar' : 'sucesso');
}

// ---------------------------------------------------------------- começo

{
  const expected = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
  const ok = Object.entries(expected).every(([n, spies]) => spiesOf(createGame(makePlayers(Number(n)))).length === spies);
  check(ok, 'espiões pelas regras oficiais: 5→2, 6→2, 7→3, 8→3, 9→3, 10→4');
  const sizes5 = createGame(makePlayers(5)).missions.map(m => m.size).join(',');
  const sizes8 = createGame(makePlayers(8)).missions.map(m => m.size).join(',');
  check(sizes5 === '2,3,2,3,3' && sizes8 === '3,4,4,5,5', 'tamanho das missões pelas regras oficiais');
  const two6 = createGame(makePlayers(6)).missions.filter(m => m.needsTwo).length;
  const two7 = createGame(makePlayers(7)).missions.map(m => m.needsTwo);
  check(two6 === 0 && two7.join(',') === 'false,false,false,true,false', 'com 7 ou mais, só a 4ª missão precisa de 2 sabotagens');
  check(throws(() => createGame(makePlayers(4)), 'numero_jogadores'), 'com 4 pessoas não começa');
  const chars = publicState(createGame(makePlayers(10))).players.map(p => p.character);
  check(new Set(chars).size === 10 && chars.every(Boolean), 'cada um recebe uma carta de personagem diferente (a TV vê qual)');
}

{
  const game = createGame(makePlayers(5), { random: seeded(1) });
  check(game.stage === 'roles' && game.events.at(-1)?.kind === 'start', 'começa com cada um vendo o papel (e o lance "começou")');
  check(throws(() => pickPlayer(game, commander(game), 'ana'), 'fase_errada'), 'ninguém monta time antes de todos verem o papel');
  seeRole(game, 'ana');
  seeRole(game, 'ana');
  check(game.stage === 'roles' && game.seen.length === 1, '"Já vi" duas vezes conta uma só');
  seeAll(game);
  check(game.stage === 'pick' && game.events.at(-1).kind === 'commander', 'todos viram → quem comanda monta o time da Missão 1');
}

// ---------------------------------------------------------------- montar o time e votar

{
  const game = createGame(makePlayers(5), { random: seeded(2) });
  seeAll(game);
  const boss = commander(game);
  const other = ids(game).find(id => id !== boss);
  check(throws(() => pickPlayer(game, other, boss), 'nao_comanda'), 'só quem comanda escolhe o time');
  check(throws(() => proposeTeam(game, boss), 'time_incompleto'), 'não manda para votação com o time incompleto');
  pickPlayer(game, boss, 'ana');
  pickPlayer(game, boss, 'bia');
  check(throws(() => pickPlayer(game, boss, 'caio'), 'time_cheio'), 'não passa do tamanho da missão');
  pickPlayer(game, boss, 'bia');
  check(publicState(game).draft.join() === 'ana', 'tocar de novo tira a pessoa do time (a TV vê na hora)');
  pickPlayer(game, boss, 'caio');
  proposeTeam(game, boss);
  check(game.stage === 'vote', 'time completo → votação');
  castVote(game, 'ana', true);
  castVote(game, 'ana', false);
  check(privateState(game, 'ana').vote === false, 'dá para trocar o voto antes de todos votarem');
  ['bia', 'caio'].forEach(id => castVote(game, id, true));
  ['duda', 'eva'].forEach(id => castVote(game, id, false));
  check(game.stage === 'pick' && game.rejections === 1 && commander(game) !== boss, 'maioria recusou → comando passa e conta 1 recusa');
  check(publicState(game).lastVote.votes.ana === false, 'depois que todos votam, o voto de cada um aparece');
}

{
  const game = createGame(makePlayers(6), { random: seeded(3) });
  seeAll(game);
  propose(game, ['ana', 'bia']);
  ['ana', 'bia', 'caio'].forEach(id => castVote(game, id, true));
  ['duda', 'eva', 'fê'].forEach(id => castVote(game, id, false));
  check(game.stage === 'pick' && game.rejections === 1, 'empate recusa o time');
}

{
  const game = createGame(makePlayers(5), { random: seeded(4) });
  seeAll(game);
  for (let i = 0; i < 4; i++) {
    propose(game, ids(game).slice(0, 2));
    voteAll(game, false);
  }
  check(game.stage === 'pick' && game.rejections === 4, '4 times recusados: o jogo continua');
  propose(game, ids(game).slice(0, 2));
  voteAll(game, false);
  check(game.stage === 'over' && game.winner === 'espioes' && game.winReason === 'recusas', '5º time recusado seguido → espiões vencem');
}

// ---------------------------------------------------------------- missões

{
  const game = createGame(makePlayers(5), { random: seeded(5) });
  seeAll(game);
  const team = dirtyTeam(game);
  propose(game, team);
  voteAll(game, true);
  check(game.stage === 'mission', 'time aprovado → missão');
  const resist = team.find(id => resistanceOf(game).includes(id));
  const spy = team.find(id => spiesOf(game).includes(id));
  const outsider = ids(game).find(id => !team.includes(id));
  check(throws(() => playMission(game, resist, 'sabotar'), 'so_sucesso'), 'quem é da Resistência não consegue sabotar');
  check(throws(() => playMission(game, outsider, 'sucesso'), 'fora_do_time'), 'quem não está no time não escolhe');
  playMission(game, spy, 'sabotar');
  check(publicState(game).chosen.length === 1 && privateState(game, spy).choice === 'sabotar', 'a TV sabe QUEM escolheu; só o dono sabe O QUÊ');
  for (const id of team.filter(id => id !== spy)) playMission(game, id, 'sucesso');
  check(game.missions[0].result === 'fracasso' && game.missions[0].sabotages === 1, '1 sabotagem → missão fracassa');
  check(game.mission === 1 && game.rejections === 0 && game.stage === 'pick', 'depois da missão: próxima missão, recusas zeram');
}

{
  const game = createGame(makePlayers(7), { random: seeded(6) });
  seeAll(game);
  runMission(game, cleanTeam(game));
  runMission(game, dirtyTeam(game), spiesOf(game).slice(0, 1));
  runMission(game, cleanTeam(game));
  check(game.mission === 3 && game.missions[3].needsTwo, 'com 7, a 4ª missão precisa de 2 sabotagens');
  const team = dirtyTeam(game, 2);
  runMission(game, team, spiesOf(game).slice(0, 1));
  check(game.missions[3].result === 'sucesso' && game.missions[3].sabotages === 1, '4ª missão com 1 sabotagem dá certo (mas mostra a sabotagem)');
  check(game.stage === 'over' && game.winner === 'resistencia' && game.winReason === 'missoes', '3 missões certas → Resistência vence');
  check(game.events.at(-1).kind === 'finish', 'o fim vira um lance público');
}

{
  const game = createGame(makePlayers(5), { random: seeded(7) });
  seeAll(game);
  for (let i = 0; i < 3; i++) runMission(game, dirtyTeam(game), spiesOf(game).slice(0, 1));
  check(game.stage === 'over' && game.winner === 'espioes' && game.winReason === 'missoes', '3 missões fracassadas → espiões vencem');
  check(publicState(game).spies.join() === spiesOf(game).join(), 'no fim, a TV mostra quem eram os espiões');
}

// ---------------------------------------------------------------- quem caiu

{
  const game = createGame(makePlayers(5), { random: seeded(8) });
  seeRole(game, 'ana');
  check(skipOfflinePlayers(game, ['bia', 'caio', 'duda', 'eva']) && game.stage === 'pick', 'papel: quem caiu conta como visto');
  const boss = commander(game);
  check(skipOfflinePlayers(game, [boss]) && commander(game) !== boss && game.rejections === 0, 'comandante caiu → o comando passa, sem contar recusa');
  check(!skipOfflinePlayers(game, []), 'ninguém caiu → nada a pular');
  propose(game, ids(game).slice(0, 2));
  ['ana', 'bia', 'caio', 'duda'].forEach(id => castVote(game, id, true));
  check(skipOfflinePlayers(game, ['eva']) && game.stage === 'mission', 'votação: decide com os votos de quem está conectado');
  const team = publicState(game).team;
  playMission(game, team[0], 'sucesso');
  check(skipOfflinePlayers(game, [team[1]]) && game.missions[0].result === 'sucesso', 'missão: quem caiu conta como Sucesso');
}

// ---------------------------------------------------------------- privacidade

{
  const game = createGame(makePlayers(10), { random: seeded(9) });
  const tv = JSON.stringify(publicState(game));
  check(!/espiao|resistencia|"role"|"votes":\{"|token/.test(tv), 'a TV não recebe papel, voto nem token');
  const spy = spiesOf(game)[0];
  const resist = resistanceOf(game)[0];
  check(privateState(game, spy).otherSpies.length === 3 && !privateState(game, spy).otherSpies.includes(spy), 'espião vê os outros 3 espiões');
  check(privateState(game, resist).otherSpies.length === 0, 'quem é da Resistência não vê ninguém');
}

// O teste mais forte: duas partidas iguais em que só muda um SEGREDO têm que
// dar exatamente o mesmo publicState.
{
  const a = createGame(makePlayers(5), { random: seeded(10) });
  const b = structuredClone(a);
  // b: troca o papel de um espião com o de alguém da Resistência
  const spy = spiesOf(b)[0];
  const resist = resistanceOf(b)[0];
  b.players.find(p => p.id === spy).role = 'resistencia';
  b.players.find(p => p.id === resist).role = 'espiao';
  const same = () => JSON.stringify(publicState(a)) === JSON.stringify(publicState(b));
  let ok = same();
  for (const game of [a, b]) seeAll(game);
  ok &&= same();
  for (const game of [a, b]) propose(game, ['ana', 'bia']);
  for (const game of [a, b]) ['ana', 'bia', 'caio'].forEach(id => castVote(game, id, true));
  ok &&= same();
  for (const game of [a, b]) ['duda', 'eva'].forEach(id => castVote(game, id, false));
  for (const game of [a, b]) ['ana', 'bia'].forEach(id => playMission(game, id, 'sucesso'));
  ok &&= same();
  check(ok, 'papéis diferentes → mesmo retrato público (antes do fim)');
}

{
  const a = createGame(makePlayers(7), { random: seeded(11) });
  seeAll(a);
  const team = dirtyTeam(a, 2);
  propose(a, team);
  voteAll(a, true);
  const b = structuredClone(a);
  const [s1, s2] = spiesOf(a).filter(id => team.includes(id));
  // a: o 1º espião sabota; b: o 2º espião sabota. Mesmo número de sabotagens.
  for (const id of team) playMission(a, id, id === s1 ? 'sabotar' : 'sucesso');
  for (const id of team) playMission(b, id, id === s2 ? 'sabotar' : 'sucesso');
  check(JSON.stringify(publicState(a)) === JSON.stringify(publicState(b)), 'sabotagem de espiões diferentes → mesmo retrato público');
  check(!/sabotar/.test(JSON.stringify(publicState(a).events)), 'o lance da missão não diz quem sabotou');
}

console.log(failures ? `\n${failures} teste(s) falharam.` : '\nTudo certo!');
process.exit(failures ? 1 : 0);
