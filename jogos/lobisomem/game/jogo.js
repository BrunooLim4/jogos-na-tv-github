// Regras do Lobisomem: uma noite (One Night Ultimate Werewolf). Sem nada de rede
// (testes em tools/teste-regras.mjs); o servidor só chama estas funções.
//
// A partida: distribui uma carta para cada um (+ 3 no meio) → NOITE: todos mexem no
// celular ao mesmo tempo (escolha do Bruno); quando o último termina, o servidor
// resolve as ações na ordem oficial e cada um recebe, em segredo, o que descobriu →
// DIA: conversa com relógio → VOTAÇÃO: todos votam → FIM: as cartas viram.
//
// PRIVACIDADE: publicState() é o que a TV (e todos) recebem — nunca a carta de alguém,
// a escolha da noite nem o voto antes do fim. Só no FIM tudo vira público (como no
// jogo de mesa, em que as cartas são viradas). privateState() vai só para o dono.
import {
  DECK, FIXED, roleOf, ROLES, IMMEDIATE, validPick,
} from '../public/papeis.js';

const MAX_EVENTS = 40;
export const CENTER = ['meio-1', 'meio-2', 'meio-3'];

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// As cartas da partida: jogadores + 3. Os 2 Lobisomens, a Vidente, o Ladrão e a
// Encrenqueira sempre; o resto sorteado, com as regras da caixa (os 2 Maçons só
// entram juntos; a Insone precisa de Ladrão ou Encrenqueira — que sempre estão).
export function chooseCards(playerCount, random = Math.random) {
  const units = shuffle(
    DECK.filter(card => !FIXED.includes(card) && roleOf(card) !== 'macom').map(card => [card]).concat([['macom-1', 'macom-2']]),
    random,
  );
  let need = playerCount + 3 - FIXED.length;
  const chosen = [...FIXED];
  for (const unit of units) {
    if (need === 0) break;
    if (unit.length > need) continue;
    chosen.push(...unit);
    need -= unit.length;
  }
  return chosen;
}

// Duração do dia (a conversa): 3 min com 3 jogadores, +20 s por jogador a mais.
export const dayLength = playerCount => (180 + 20 * (playerCount - 3)) * 1000;

// `players` = [{ id, name, wins }] na ordem da roda. `match` = número da partida
// (Jogar de novo soma 1). `random` para os testes repetirem a mesma partida.
export function createGame(players, { random = Math.random, match = 1, cards = null } = {}) {
  const inPlay = cards ?? chooseCards(players.length, random);
  const dealt = cards ? [...cards] : shuffle(inPlay, random);
  const game = {
    match,
    players: players.map(p => ({ id: p.id, name: p.name, wins: p.wins ?? 0 })),
    stage: 'noite',
    cards: {}, // onde cada carta está AGORA (jogador ou meio-1..3)
    original: {}, // a carta que cada um recebeu (e viu) no começo
    inPlay: sortByNight(inPlay), // público: quais cartas estão na partida (como no jogo de mesa)
    night: {}, // por jogador: { step: 'escolher' | 'sosia-2' | 'feito', pick, pick2, skipped }
    doppel: null, // a Sósia: { playerId, target, copied }
    info: {}, // o que cada um descobriu à noite (vai só para o dono)
    story: [], // o que aconteceu à noite (público só no fim)
    dayEndsAt: null,
    dayMs: dayLength(players.length),
    votes: {},
    abstain: [],
    result: null,
    events: [],
    eventSeq: 0,
  };
  game.players.forEach((p, i) => {
    game.cards[p.id] = dealt[i];
    game.original[p.id] = dealt[i];
    game.night[p.id] = { step: 'escolher', pick: null, pick2: null, skipped: false };
  });
  CENTER.forEach((pos, i) => { game.cards[pos] = dealt[players.length + i]; });
  addEvent(game, 'start', { count: players.length });
  return game;
}

function sortByNight(cards) {
  const order = ['sosia', 'lobisomem', 'lacaio', 'macom', 'vidente', 'ladrao', 'encrenqueira', 'bebado', 'insone', 'cacador', 'curtidor', 'aldeao'];
  return [...cards].sort((a, b) => order.indexOf(roleOf(a)) - order.indexOf(roleOf(b)) || a.localeCompare(b));
}

// Lances públicos. A TV anima e toca som pelo `kind`, nunca por segredo.
function addEvent(game, kind, data = {}) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, ...data });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

const nameOf = (game, id) => game.players.find(p => p.id === id)?.name ?? '?';
const ids = game => game.players.map(p => p.id);

// O personagem que conta no fim: a carta da Sósia vale o que ela copiou.
function finalRole(game, card) {
  const role = roleOf(card);
  if (role === 'sosia') return game.doppel?.copied ?? 'sosia';
  return role;
}

function cardLabel(game, card) {
  const role = roleOf(card);
  if (role === 'sosia' && game.doppel) return `Sósia (que virou ${ROLES[game.doppel.copied].name})`;
  return ROLES[role].name;
}

// ---------------------------------------------------------------- noite

// Uma escolha da noite. A Sósia escolhe duas vezes quando copia alguém que age na hora
// (Vidente, Ladrão, Encrenqueira, Bêbado): a 1ª mostra o que ela virou.
export function nightAction(game, playerId, pick, { now = Date.now() } = {}) {
  if (game.stage !== 'noite') throw new GameError('nao_e_noite', 'A noite já acabou.');
  const state = game.night[playerId];
  if (!state) throw new GameError('nao_joga', 'Você não está nesta partida.');
  if (state.step === 'feito') throw new GameError('ja_fez', 'Você já fez a sua parte. Espere os outros.');
  const role = roleOf(game.original[playerId]);
  const acting = state.step === 'sosia-2' ? game.doppel.copied : role === 'sosia' ? 'sosia' : role;
  const clean = { players: [...(pick?.players ?? [])], center: [...(pick?.center ?? [])] };
  if (!validPick(acting, clean, playerId, ids(game))) {
    throw new GameError('escolha_invalida', 'Essa escolha não vale para o seu personagem. Segure a sua carta para ver o que fazer.');
  }
  if (state.step === 'sosia-2') {
    state.pick2 = clean;
    state.step = 'feito';
  } else {
    state.pick = clean;
    if (role === 'sosia') {
      const target = clean.players[0];
      const copied = roleOf(game.cards[target]); // ninguém trocou nada ainda: é a carta que ele recebeu
      game.doppel = { playerId, target, copied };
      state.step = IMMEDIATE.includes(copied) ? 'sosia-2' : 'feito';
    } else {
      state.step = 'feito';
    }
  }
  if (state.step === 'feito') addEvent(game, 'sleep', { playerId });
  if (Object.values(game.night).every(s => s.step === 'feito')) resolveNight(game, now);
}

// Quando o último termina: tudo acontece na ordem oficial, e cada um descobre o seu.
function resolveNight(game, now) {
  const cards = game.cards;
  const info = Object.fromEntries(ids(game).map(id => [id, []]));
  const story = [];
  const name = id => nameOf(game, id);
  const see = (id, text, shown = []) => info[id].push({ text, cards: shown });
  const done = id => !game.night[id].skipped;
  const holders = role => ids(game).filter(id => roleOf(game.original[id]) === role && done(id));
  const swap = (a, b) => { [cards[a], cards[b]] = [cards[b], cards[a]]; };
  const d = game.doppel && done(game.doppel.playerId) ? game.doppel : null;
  if (game.doppel && !d) game.doppel = null; // a Sósia caiu antes de copiar

  // ações que a Sósia também pode fazer (com o "prefixo" de quem fez, para a história)
  function perform(role, actor, pick, who) {
    if (!pick) return;
    if (role === 'vidente') {
      if (pick.players.length) {
        const t = pick.players[0];
        see(actor, `Você espiou a carta de ${name(t)}: ${cardLabel(game, cards[t])}.`, [cards[t]]);
        story.push({ role, actor, text: `${who} espiou a carta de ${name(t)} (${cardLabel(game, cards[t])}).` });
      } else {
        const [a, b] = pick.center;
        see(actor, `Você espiou as cartas ${a + 1} e ${b + 1} do meio: ${cardLabel(game, cards[CENTER[a]])} e ${cardLabel(game, cards[CENTER[b]])}.`, [cards[CENTER[a]], cards[CENTER[b]]]);
        story.push({ role, actor, text: `${who} espiou 2 cartas do meio.` });
      }
    } else if (role === 'ladrao') {
      const t = pick.players[0];
      swap(actor, t);
      see(actor, `Você trocou de carta com ${name(t)} e agora é: ${cardLabel(game, cards[actor])}.`, [cards[actor]]);
      story.push({ role, actor, text: `${who} roubou a carta de ${name(t)}.` });
    } else if (role === 'encrenqueira') {
      const [a, b] = pick.players;
      swap(a, b);
      see(actor, `Você trocou as cartas de ${name(a)} e ${name(b)}.`);
      story.push({ role, actor, text: `${who} trocou as cartas de ${name(a)} e ${name(b)}.` });
    } else if (role === 'bebado') {
      const c = pick.center[0];
      swap(actor, CENTER[c]);
      see(actor, `Você trocou a sua carta com a carta ${c + 1} do meio (sem ver).`);
      story.push({ role, actor, text: `${who} trocou a carta dele com a carta ${c + 1} do meio.` });
    }
  }

  // 1. Sósia
  if (d) {
    const copiedName = ROLES[d.copied].name;
    see(d.playerId, `Você copiou ${name(d.target)}: agora você é ${copiedName}.`, [game.original[d.target]]);
    story.push({ role: 'sosia', actor: d.playerId, text: `Sósia (${name(d.playerId)}) copiou ${name(d.target)} e virou ${copiedName}.` });
    if (IMMEDIATE.includes(d.copied)) perform(d.copied, d.playerId, game.night[d.playerId].pick2, `Sósia-${copiedName} (${name(d.playerId)})`);
  }
  const withDoppel = (list, role) => (d && d.copied === role ? [...list, d.playerId] : list);
  const names = list => list.map(name).join(' e ');

  // 2. Lobisomens
  const wolves = withDoppel(holders('lobisomem'), 'lobisomem');
  if (wolves.length === 1) {
    const w = wolves[0];
    const c = game.night[w].pick?.center?.[0];
    if (c !== undefined && w !== d?.playerId) {
      see(w, `Você é o único lobisomem. Você espiou a carta ${c + 1} do meio: ${cardLabel(game, cards[CENTER[c]])}.`, [cards[CENTER[c]]]);
      story.push({ role: 'lobisomem', actor: w, text: `Lobisomem sozinho (${name(w)}) espiou a carta ${c + 1} do meio.` });
    } else {
      see(w, 'Você é o único lobisomem.');
    }
  } else if (wolves.length > 1) {
    for (const w of wolves) see(w, `Os lobisomens são: ${names(wolves)}.`);
    story.push({ role: 'lobisomem', actor: wolves[0], text: `Os lobisomens (${names(wolves)}) se reconheceram.` });
  } else {
    story.push({ role: 'lobisomem', actor: null, text: 'Nenhum jogador era lobisomem: estavam no meio.' });
  }
  // 3. Lacaio
  for (const m of withDoppel(holders('lacaio'), 'lacaio')) {
    see(m, wolves.length ? `Os lobisomens são: ${names(wolves)}.` : 'Nenhum jogador é lobisomem: eles estão no meio.');
    story.push({ role: 'lacaio', actor: m, text: `Lacaio (${name(m)}) viu quem eram os lobisomens.` });
  }
  // 4. Maçons
  const masons = withDoppel(holders('macom'), 'macom');
  for (const m of masons) {
    const others = masons.filter(o => o !== m);
    see(m, others.length ? `O outro maçom é: ${names(others)}.` : 'O outro maçom está no meio.');
  }
  if (masons.length > 1) story.push({ role: 'macom', actor: masons[0], text: `Os maçons (${names(masons)}) se reconheceram.` });
  else if (masons.length) story.push({ role: 'macom', actor: masons[0], text: `Maçom (${name(masons[0])}) viu que o outro maçom estava no meio.` });
  // 5–8. Vidente, Ladrão, Encrenqueira, Bêbado
  for (const role of ['vidente', 'ladrao', 'encrenqueira', 'bebado']) {
    for (const actor of holders(role)) perform(role, actor, game.night[actor].pick, `${ROLES[role].name} (${name(actor)})`);
  }
  // 9. Insone (e a Sósia que virou Insone)
  for (const i of withDoppel(holders('insone'), 'insone')) {
    see(i, `No fim da noite, a sua carta é: ${cardLabel(game, cards[i])}.`, [cards[i]]);
    story.push({ role: 'insone', actor: i, text: `Insone (${name(i)}) olhou a própria carta.` });
  }
  // quem não acordou
  for (const id of ids(game)) {
    if (game.night[id].skipped) info[id].push({ text: 'Você caiu e dormiu a noite toda.', cards: [] });
    else if (!info[id].length) info[id].push({ text: 'Você dormiu a noite toda.', cards: [] });
  }

  game.info = info;
  game.story = story;
  game.stage = 'dia';
  game.dayEndsAt = now + game.dayMs;
  addEvent(game, 'dawn');
}

// ---------------------------------------------------------------- dia e votação

// O relógio do dia acabou (o servidor chama) ou o líder mandou votar agora.
export function callVote(game) {
  if (game.stage !== 'dia') throw new GameError('nao_e_dia', 'Agora não é hora de votar.');
  game.stage = 'votacao';
  game.dayEndsAt = null;
  addEvent(game, 'vote');
}

// O líder dá mais 1 minuto de conversa.
export function addMinute(game, { now = Date.now() } = {}) {
  if (game.stage !== 'dia') throw new GameError('nao_e_dia', 'Só dá para dar mais tempo durante o dia.');
  game.dayEndsAt = Math.max(game.dayEndsAt, now) + 60_000;
}

// Voto em quem morre. Dá para trocar até o último votar; o último voto já resolve.
export function castVote(game, playerId, targetId) {
  if (game.stage !== 'votacao') throw new GameError('nao_e_votacao', 'Agora não é hora de votar.');
  if (!game.night[playerId]) throw new GameError('nao_joga', 'Você não está nesta partida.');
  if (targetId === playerId) throw new GameError('voto_em_si', 'Vote em outra pessoa.');
  if (!game.night[targetId]) throw new GameError('voto_invalido', 'Escolha um jogador.');
  const first = !(playerId in game.votes);
  game.votes[playerId] = targetId;
  game.abstain = game.abstain.filter(id => id !== playerId);
  if (first) addEvent(game, 'voted', { playerId });
  maybeResolveVotes(game);
}

function maybeResolveVotes(game) {
  if (ids(game).every(id => id in game.votes || game.abstain.includes(id))) resolveVotes(game);
}

function resolveVotes(game) {
  const counts = {};
  for (const target of Object.values(game.votes)) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  // mais votado morre (empate: todos); se ninguém teve mais de 1 voto, ninguém morre
  const dead = max >= 2 ? ids(game).filter(id => counts[id] === max) : [];
  const role = id => finalRole(game, game.cards[id]);
  // o Caçador leva junto quem ele votou (e se esse também for Caçador, segue)
  const hunterKills = [];
  for (let i = 0; i < dead.length; i++) {
    const victim = game.votes[dead[i]];
    if (role(dead[i]) === 'cacador' && victim && !dead.includes(victim)) {
      dead.push(victim);
      hunterKills.push({ hunter: dead[i], target: victim });
    }
  }
  const roles = Object.fromEntries(ids(game).map(id => [id, role(id)]));
  const wolvesAmong = ids(game).some(id => roles[id] === 'lobisomem');
  const deadWolf = dead.some(id => roles[id] === 'lobisomem');
  const tannerDead = dead.some(id => roles[id] === 'curtidor');
  const villageWins = wolvesAmong ? deadWolf : dead.length === 0;
  const wolfTeamWins = wolvesAmong
    ? !deadWolf && !tannerDead
    : dead.some(id => roles[id] !== 'lacaio') && ids(game).some(id => roles[id] === 'lacaio');
  const teamOf = r => ROLES[r]?.team ?? 'vila';
  const winners = ids(game).filter(id => {
    const team = teamOf(roles[id]);
    if (team === 'curtidor') return dead.includes(id);
    return team === 'lobos' ? wolfTeamWins : villageWins;
  });
  for (const p of game.players) if (winners.includes(p.id)) p.wins += 1;

  const parts = [];
  if (villageWins) parts.push('A vila venceu');
  if (wolfTeamWins) parts.push(wolvesAmong ? 'Os lobisomens venceram' : 'O Lacaio venceu');
  if (tannerDead) parts.push('O Curtidor venceu');
  const headline = parts.length ? `${parts.join(' e ')}!` : 'Ninguém venceu!';
  let reason;
  if (dead.length) reason = `${dead.map(id => `${nameOf(game, id)} (${cardLabel(game, game.cards[id])})`).join(', ')} ${dead.length > 1 ? 'morreram' : 'morreu'}.`;
  else if (max <= 1) reason = 'Ninguém teve mais de 1 voto: ninguém morreu.';
  else reason = 'Ninguém morreu.';
  if (!wolvesAmong) reason += ' Os dois lobisomens estavam no meio.';

  game.result = {
    votes: { ...game.votes },
    counts,
    dead,
    hunterKills,
    cards: { ...game.cards }, // todas as cartas viradas (jogadores e meio)
    original: { ...game.original },
    roles,
    copied: game.doppel?.copied ?? null,
    winners,
    villageWins,
    wolfTeamWins,
    tannerDead,
    headline,
    reason,
    story: game.story,
  };
  game.stage = 'fim';
  addEvent(game, 'reveal', { result: game.result });
}

// ---------------------------------------------------------------- quem caiu

// O líder pula quem caiu e está travando a partida. Devolve true se mudou algo.
export function skipOfflinePlayers(game, offlineIds, { now = Date.now() } = {}) {
  const stuck = offlineIds.filter(id => game.night[id]);
  if (game.stage === 'noite') {
    const pending = stuck.filter(id => game.night[id].step !== 'feito');
    if (!pending.length) return false;
    for (const id of pending) {
      game.night[id].step = 'feito';
      game.night[id].skipped = true;
      addEvent(game, 'sleep', { playerId: id });
    }
    if (Object.values(game.night).every(s => s.step === 'feito')) resolveNight(game, now);
    return true;
  }
  if (game.stage === 'votacao') {
    const pending = stuck.filter(id => !(id in game.votes) && !game.abstain.includes(id));
    if (!pending.length) return false;
    game.abstain.push(...pending);
    maybeResolveVotes(game);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- retratos

// O que todos podem ver (a TV recebe só isto). `now` = relógio do servidor, para a TV
// e o celular acertarem o relógio do dia.
export function publicState(game, now = Date.now()) {
  return {
    stage: game.stage,
    match: game.match,
    players: game.players.map(p => ({
      id: p.id,
      wins: p.wins,
      nightDone: game.night[p.id].step === 'feito',
      voted: p.id in game.votes,
    })),
    inPlay: game.inPlay,
    dayEndsAt: game.dayEndsAt,
    dayMs: game.dayMs,
    now,
    result: game.stage === 'fim' ? game.result : null,
    events: game.events,
  };
}

// O que só o dono do celular vê.
export function privateState(game, playerId) {
  const state = game.night[playerId];
  if (!state) return {};
  const mine = game.doppel?.playerId === playerId;
  return {
    card: game.original[playerId], // a carta que recebeu (pode ter mudado à noite sem ele saber)
    step: state.step,
    pick: state.pick,
    copied: mine ? game.doppel.copied : null, // a Sósia vê na hora o que virou
    copiedCard: mine ? game.original[game.doppel.target] : null,
    info: game.stage === 'noite' ? [] : game.info[playerId] ?? [],
    vote: game.votes[playerId] ?? null,
    finalCard: game.stage === 'fim' ? game.cards[playerId] : null,
    won: game.stage === 'fim' ? game.result.winners.includes(playerId) : null,
  };
}
