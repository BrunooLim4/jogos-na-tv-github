// Regras do Resistência (inspirado no The Resistance). Sem nada de rede (fácil
// de testar sozinho em tools/teste-regras.mjs). O servidor só chama estas funções.
//
// Fases: roles (cada um vê o papel em segredo) → pick (o comandante monta o time)
// → vote (todos votam) → mission (o time escolhe Sucesso ou Sabotar) → pick...
// até 3 missões de um lado (ou 5 times recusados seguidos) → over.
//
// PRIVACIDADE: publicState() é o que a TV (e todos) recebem — nunca pode ter o
// papel de ninguém (só no fim), o voto antes de todos votarem nem a escolha da
// missão (essa nunca sai com nome: só quantas sabotagens houve). privateState()
// vai só para o dono do celular. Teste: duas partidas iguais em que só muda um
// segredo têm que dar o MESMO publicState.

import { CHARACTER_IDS } from '../public/personagens.js';

const MAX_EVENTS = 6;
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
const WINS = 3; // missões para vencer
const MAX_REJECTIONS = 5; // times recusados seguidos na mesma missão → espiões vencem

// Regras oficiais pelo número de jogadores: quantos espiões e o tamanho de cada
// missão. Com 7 ou mais, a 4ª missão só fracassa com 2 sabotagens.
const SPIES = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
const MISSION_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // a mensagem já vai em português, para mostrar no celular
  }
}

// `players` = [{ id, name }] na ordem da roda. `random` só para os testes.
export function createGame(players, { random = Math.random } = {}) {
  const n = players.length;
  if (!SPIES[n]) throw new GameError('numero_jogadores', `O jogo é de ${MIN_PLAYERS} a ${MAX_PLAYERS} pessoas.`);
  const spies = new Set(shuffle(players.map(p => p.id), random).slice(0, SPIES[n]));
  // Cada um recebe uma carta de personagem sorteada (pública: é a "cara" da pessoa na mesa).
  const characters = shuffle(CHARACTER_IDS, random);
  const game = {
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      character: characters[i],
      role: spies.has(p.id) ? 'espiao' : 'resistencia',
    })),
    missions: MISSION_SIZES[n].map((size, i) => ({
      size,
      needsTwo: i === 3 && n >= 7,
      result: null, // 'sucesso' | 'fracasso'
      sabotages: 0,
      team: [],
    })),
    mission: 0, // a missão da vez (0 a 4)
    commander: Math.floor(random() * n), // posição na roda de quem monta o time
    rejections: 0, // times recusados seguidos nesta missão
    stage: 'roles',
    seen: [], // quem já viu o próprio papel
    draft: [], // o time que o comandante está montando (aparece na TV)
    votes: {}, // id → true (aprovo) / false (recuso). SEGREDO até todos votarem
    lastVote: null, // a última votação, já revelada (pública)
    choices: {}, // id → 'sucesso' / 'sabotar'. SEGREDO: nunca sai com nome
    winner: null, // 'resistencia' | 'espioes'
    winReason: null, // 'missoes' | 'recusas'
    events: [],
    eventSeq: 0,
  };
  addEvent(game, 'start', `A partida começou! Há ${SPIES[n]} espiões entre vocês.`);
  return game;
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Lances públicos (os últimos 6). A TV toca som/animação pelo `kind`, nunca por segredo.
function addEvent(game, kind, text) {
  game.eventSeq += 1;
  game.events.push({ id: game.eventSeq, kind, text });
  if (game.events.length > MAX_EVENTS) game.events.shift();
}

// "Ana", "Ana e Caio", "Ana, Caio e Duda"
export function joinNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

const nameOf = (game, id) => game.players.find(p => p.id === id)?.name ?? '?';
const teamNames = (game, ids) => joinNames(ids.map(id => nameOf(game, id)));
const currentMission = game => game.missions[game.mission];
const commanderOf = game => game.players[game.commander];

function findPlayer(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new GameError('nao_joga', 'Você não está nesta partida.');
  if (game.stage === 'over') throw new GameError('fim', 'A partida já acabou.');
  return player;
}

function needStage(game, stage, message) {
  if (game.stage !== stage) throw new GameError('fase_errada', message);
}

// ---------------------------------------------------------------- jogadas

// Cada um confirma que já viu o papel; quando todos viram, começa a 1ª missão.
export function seeRole(game, playerId) {
  const player = findPlayer(game, playerId);
  needStage(game, 'roles', 'Todos já viram o papel.');
  if (!game.seen.includes(player.id)) game.seen.push(player.id);
  if (game.seen.length === game.players.length) startPick(game);
}

function startPick(game) {
  game.stage = 'pick';
  game.draft = [];
  const mission = currentMission(game);
  addEvent(game, 'commander', `${commanderOf(game).name} é quem comanda: escolha ${mission.size} pessoas para a Missão ${game.mission + 1}.`);
}

// O comandante põe ou tira alguém do time (a TV mostra na hora, para conversarem).
export function pickPlayer(game, playerId, targetId) {
  const player = findPlayer(game, playerId);
  needStage(game, 'pick', 'Agora não é hora de montar o time.');
  if (commanderOf(game).id !== player.id) throw new GameError('nao_comanda', 'Só quem comanda monta o time.');
  if (!game.players.some(p => p.id === targetId)) throw new GameError('quem', 'Essa pessoa não está na partida.');
  const size = currentMission(game).size;
  if (game.draft.includes(targetId)) {
    game.draft = game.draft.filter(id => id !== targetId);
  } else {
    if (game.draft.length >= size) throw new GameError('time_cheio', `O time já tem ${size} pessoas. Tire alguém antes.`);
    game.draft.push(targetId);
  }
}

// O comandante manda o time para a votação.
export function proposeTeam(game, playerId) {
  const player = findPlayer(game, playerId);
  needStage(game, 'pick', 'Agora não é hora de montar o time.');
  if (commanderOf(game).id !== player.id) throw new GameError('nao_comanda', 'Só quem comanda manda o time para a votação.');
  const size = currentMission(game).size;
  if (game.draft.length !== size) throw new GameError('time_incompleto', `Escolha ${size} pessoas para o time.`);
  game.stage = 'vote';
  game.votes = {};
  addEvent(game, 'proposal', `${player.name} quer mandar ${teamNames(game, game.draft)}. Todos votam!`);
}

// Todos votam ao mesmo tempo (dá para trocar até o último votar).
export function castVote(game, playerId, approve) {
  const player = findPlayer(game, playerId);
  needStage(game, 'vote', 'Agora não é hora de votar.');
  game.votes[player.id] = Boolean(approve);
  if (Object.keys(game.votes).length === game.players.length) resolveVote(game);
}

// Aprovado = mais da metade dos votos. Empate recusa (regra oficial).
function resolveVote(game) {
  const ids = Object.keys(game.votes);
  const approvals = ids.filter(id => game.votes[id]).length;
  const approved = approvals > ids.length / 2;
  const score = `${approvals} a ${ids.length - approvals}`;
  game.lastVote = {
    mission: game.mission,
    proposal: game.rejections + 1,
    commanderId: commanderOf(game).id,
    team: [...game.draft],
    votes: { ...game.votes },
    approved,
  };
  game.votes = {};
  if (approved) {
    game.stage = 'mission';
    game.choices = {};
    addEvent(game, 'approved', `Time aprovado (${score})! ${teamNames(game, game.draft)} vão para a missão.`);
    return;
  }
  game.rejections += 1;
  if (game.rejections >= MAX_REJECTIONS) {
    addEvent(game, 'rejected', `Time recusado (${score}): ${MAX_REJECTIONS} times recusados seguidos.`);
    finish(game, 'espioes', 'recusas');
    return;
  }
  addEvent(game, 'rejected', `Time recusado (${score}). O comando passa para a próxima pessoa.`);
  passCommand(game);
  startPick(game);
}

function passCommand(game) {
  game.commander = (game.commander + 1) % game.players.length;
}

// Quem está no time escolhe Sucesso ou Sabotar (dá para trocar até o último).
// A Resistência sempre escolhe Sucesso: o botão Sabotar aparece igual para
// todos (para ninguém descobrir o papel olhando a tela) e é recusado aqui.
export function playMission(game, playerId, choice) {
  const player = findPlayer(game, playerId);
  needStage(game, 'mission', 'Agora não é hora da missão.');
  if (!game.lastVote.team.includes(player.id)) throw new GameError('fora_do_time', 'Você não está no time desta missão.');
  if (choice !== 'sucesso' && choice !== 'sabotar') throw new GameError('escolha', 'Escolha Sucesso ou Sabotar.');
  if (choice === 'sabotar' && player.role !== 'espiao') {
    throw new GameError('so_sucesso', 'Quem é da Resistência sempre escolhe Sucesso.');
  }
  game.choices[player.id] = choice;
  if (Object.keys(game.choices).length === game.lastVote.team.length) resolveMission(game);
}

function resolveMission(game) {
  const mission = currentMission(game);
  const sabotages = Object.values(game.choices).filter(c => c === 'sabotar').length;
  const failed = sabotages >= (mission.needsTwo ? 2 : 1);
  mission.result = failed ? 'fracasso' : 'sucesso';
  mission.sabotages = sabotages;
  mission.team = [...game.lastVote.team];
  game.choices = {};
  const label = `Missão ${game.mission + 1}`;
  const count = sabotages === 0 ? 'nenhuma sabotagem' : `${sabotages} ${sabotages === 1 ? 'sabotagem' : 'sabotagens'}`;
  addEvent(game, failed ? 'missionFail' : 'missionSuccess', failed
    ? `${label} fracassou: ${count}.`
    : `${label} deu certo (${count})!`);

  const done = result => game.missions.filter(m => m.result === result).length;
  if (done('sucesso') >= WINS) return finish(game, 'resistencia', 'missoes');
  if (done('fracasso') >= WINS) return finish(game, 'espioes', 'missoes');
  game.mission += 1;
  game.rejections = 0;
  passCommand(game);
  startPick(game);
}

function finish(game, winner, reason) {
  game.stage = 'over';
  game.winner = winner;
  game.winReason = reason;
  game.draft = [];
  const spies = teamNames(game, game.players.filter(p => p.role === 'espiao').map(p => p.id));
  addEvent(game, 'finish', winner === 'resistencia'
    ? `A Resistência venceu! Os espiões eram ${spies}.`
    : `Os espiões venceram! Eram ${spies}.`);
}

// O líder pula quem caiu e está travando a partida. Devolve true se mudou algo.
// Papel: conta como visto. Comandante caiu: o comando passa (sem contar recusa).
// Votação: decide com os votos de quem está conectado. Missão: quem caiu conta
// como Sucesso.
export function skipOfflinePlayers(game, offlineIds) {
  if (game.stage === 'over') return false;
  const offline = new Set(offlineIds);
  const online = game.players.filter(p => !offline.has(p.id));
  if (online.length === 0) return false;
  if (game.stage === 'roles') {
    const missing = game.players.filter(p => offline.has(p.id) && !game.seen.includes(p.id));
    if (!missing.length) return false;
    game.seen.push(...missing.map(p => p.id));
    if (game.seen.length === game.players.length) startPick(game);
    return true;
  }
  if (game.stage === 'pick') {
    if (!offline.has(commanderOf(game).id)) return false;
    const from = commanderOf(game).name;
    do passCommand(game); while (offline.has(commanderOf(game).id));
    game.draft = [];
    addEvent(game, 'commander', `${from} caiu: agora ${commanderOf(game).name} comanda e escolhe ${currentMission(game).size} pessoas.`);
    return true;
  }
  if (game.stage === 'vote') {
    const waiting = game.players.filter(p => !(p.id in game.votes));
    if (!waiting.length || waiting.some(p => !offline.has(p.id))) return false;
    if (!Object.keys(game.votes).length) return false;
    resolveVote(game);
    return true;
  }
  // missão
  const waiting = game.lastVote.team.filter(id => !(id in game.choices));
  if (!waiting.length || waiting.some(id => !offline.has(id))) return false;
  for (const id of waiting) game.choices[id] = 'sucesso';
  resolveMission(game);
  return true;
}

// ---------------------------------------------------------------- retratos

// O que todos podem ver (a TV recebe só isto).
export function publicState(game) {
  const over = game.stage === 'over';
  return {
    stage: game.stage,
    mission: game.mission,
    missions: game.missions.map(m => ({ size: m.size, needsTwo: m.needsTwo, result: m.result, sabotages: m.sabotages, team: m.team })),
    rejections: game.rejections,
    maxRejections: MAX_REJECTIONS,
    spyCount: game.players.filter(p => p.role === 'espiao').length,
    commanderId: over ? null : commanderOf(game).id,
    players: game.players.map(p => ({ id: p.id, character: p.character })),
    seen: game.seen,
    draft: game.draft,
    team: game.stage === 'vote' ? game.draft : game.stage === 'mission' ? game.lastVote.team : [],
    voted: Object.keys(game.votes), // QUEM já votou, nunca o voto
    chosen: Object.keys(game.choices), // QUEM já escolheu, nunca o quê
    lastVote: game.lastVote,
    winner: game.winner,
    winReason: game.winReason,
    spies: over ? game.players.filter(p => p.role === 'espiao').map(p => p.id) : null,
    events: game.events,
  };
}

// O que só o dono do celular vê: o papel, os outros espiões (se for espião), o
// próprio voto e a própria escolha da missão.
export function privateState(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return {};
  const spy = player.role === 'espiao';
  return {
    role: player.role,
    otherSpies: spy ? game.players.filter(p => p.role === 'espiao' && p.id !== playerId).map(p => p.id) : [],
    vote: playerId in game.votes ? game.votes[playerId] : null,
    choice: game.choices[playerId] ?? null,
  };
}
