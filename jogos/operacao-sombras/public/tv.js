// Tela da TV: só escuta (não manda comandos). Sala com os dois times e a mesa
// com as 25 palavras. Nunca recebe o mapa de cores: só a cor do que já foi
// revelado (e de tudo, no fim da partida).
import { connect } from './net.js';
import { makeAvatar, makeNameBar, sameImage } from './ui.js';
import { characterLabel } from './characters.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const TEAMS = ['vermelho', 'azul'];
const TEAM_NAMES = { vermelho: 'Vermelho', azul: 'Azul' };
const TEAM_WORDS = { vermelho: 'vermelhas', azul: 'azuis' };

let currentCode = null;
let lastEventId = null; // null = ainda não viu nenhum evento (não toca som do passado)
let prev = null; // retrato anterior, para saber o que mudou

// ---------------------------------------------------------------- som

// PRIVACIDADE: a TV só toca som de lances públicos (veja sound.js).
const sound = createSound();
sound.unlock(); // abrindo pelo iniciar.bat, o som já vem liberado
const unlockSound = () => {
  sound.unlock();
  setTimeout(updateSoundBanner, 100);
};
window.addEventListener('keydown', unlockSound);
window.addEventListener('pointerdown', unlockSound);
let tvSoundOn = true;

function updateSoundBanner() {
  $('sound-banner').classList.toggle('hidden', !tvSoundOn || !sound.locked);
}
setTimeout(updateSoundBanner, 1500);

function play(name, ...args) {
  if (tvSoundOn) sound.play(name, ...args);
}

// Lance do jogo (`kind` do evento) → som, do mais importante para o menos.
const EVENT_SOUND = {
  assassin: 'assassin',
  finish: 'victory',
  start: 'start',
  wrong: 'miss',
  neutral: 'miss',
  clue: 'clue',
};

// ---------------------------------------------------------------- conexão

const socket = connect({
  onOpen: () => socket.send({ type: 'hello', role: 'tv' }),
  onStatus: status => $('conn-banner').classList.toggle('hidden', status === 'online'),
  onMessage: message => {
    if (message.type === 'state') render(message);
  },
});

function render(state) {
  const { lobby, game } = state;
  tvSoundOn = lobby.tvSound !== false;
  sound.enabled = tvSoundOn;
  updateSoundBanner();

  const playing = lobby.phase === 'playing' && game;
  $('lobby-view').classList.toggle('hidden', playing);
  $('game-view').classList.toggle('hidden', !playing);
  if (playing) renderGame(lobby, game);
  else renderLobby(lobby);
  prev = state;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Bolinhas reaproveitadas entre uma atualização e outra (não piscam). As da
// palavra apontada são outras (a mesma pessoa aparece no time e na palavra).
const avatar = sameImage(key => {
  const [color, name] = key.split(':');
  return makeAvatar(color, name);
});
const pointerAvatar = sameImage(key => {
  const [color, name] = key.split(':');
  return makeAvatar(color, name);
});

// ---------------------------------------------------------------- sala

function renderLobby(lobby) {
  if (lobby.code !== currentCode) {
    currentCode = lobby.code;
    // O código entra na URL só para o navegador não reaproveitar um QR antigo.
    $('qr').src = `/qr.svg?sala=${lobby.code}`;
    $('join-url').textContent = lobby.joinUrl.replace(/^https?:\/\//, '');
  }
  // Som: alguém entrou na sala.
  const before = prev?.lobby?.phase === 'lobby' ? prev.lobby.players : null;
  if (before && lobby.players.some(p => !before.find(b => b.id === p.id))) play('join');
  lastEventId = null;

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers} agentes`;
  for (const team of TEAMS) {
    const members = lobby.players.filter(p => p.team === team);
    const seats = members.map(player => seatItem(player, lobby));
    for (let i = members.length; i < lobby.minPerTeam; i++) {
      const li = el('li', 'seat free');
      const info = el('span', 'seat-info');
      info.append(el('span', 'codename', 'Vaga para agente'));
      li.append(makeAvatar('', '?'), info);
      seats.push(li);
    }
    $(`seats-${team}`).replaceChildren(...seats);
  }
  $('start-hint').textContent = startHintText(lobby);
}

// Ficha do agente: retrato, codinome (máquina de escrever) e o nome na faixa preta.
function seatItem(player, lobby) {
  const li = el('li', `seat${player.online ? '' : ' offline'}`);
  const info = el('span', 'seat-info');
  info.append(
    el('span', 'codename', `Codinome: ${characterLabel(player.color)}`),
    makeNameBar(player.id === lobby.leaderId ? `${player.name} 👑` : player.name),
  );
  const status = el('span', `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`,
    !player.online ? 'reconectando…' : player.ready ? 'pronto' : 'se preparando');
  li.append(avatar(`${player.color}:${player.name}`), info);
  if (player.wantsChief) li.append(el('span', 'chief-tag', 'Chefe'));
  li.append(status);
  return li;
}

function startHintText(lobby) {
  const { players, minPerTeam } = lobby;
  if (players.length === 0) return `Cada time precisa de pelo menos ${minPerTeam} pessoas. O primeiro a entrar vira o líder 👑.`;
  const short = TEAMS.filter(team => players.filter(p => p.team === team).length < minPerTeam);
  if (short.length) return `Falta gente no time ${short.map(t => TEAM_NAMES[t]).join(' e no ')}: cada time precisa de ${minPerTeam}.`;
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  const notReady = players.filter(p => !p.ready).map(p => p.name);
  if (notReady.length) return `Esperando ${notReady.join(', ')} ficar pronto.`;
  const leader = players.find(p => p.id === lobby.leaderId);
  return `Tudo pronto! ${leader ? leader.name : 'O líder'} 👑 começa a partida pelo celular.`;
}

// ---------------------------------------------------------------- partida

function renderGame(lobby, game) {
  const byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  $('round-chip').textContent = `Rodada ${game.round}`;
  renderStatus(game, byId);
  for (const team of TEAMS) renderTeamPanel(team, game, byId);
  renderBoard(game, byId);
  $('events').replaceChildren(...game.events.slice(-3).map(e => el('li', '', e.text)));

  // Som dos lances novos (poucos: só os momentos importantes — ver sound.js).
  // (acabou de sair da sala: os lances são novos e o "começou" toca; TV aberta no
  // meio da partida: nada do passado toca)
  const justStarted = prev?.lobby?.phase === 'lobby' || prev?.game?.stage === 'over' && game.stage !== 'over';
  const fresh = justStarted ? game.events : lastEventId === null ? [] : game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(justStarted ? 0 : lastEventId ?? 0, ...game.events.map(e => e.id));
  // Um som só, o mais importante (revelar a última palavra também encerra a
  // partida: toca só a vitória; o assassino encerra com o som dele). Acertar,
  // apontar e passar a vez não têm som.
  const kinds = new Set(fresh.map(e => e.kind));
  const top = Object.keys(EVENT_SOUND).find(kind => kinds.has(kind));
  if (top) play(EVENT_SOUND[top]);
}

// A frase grande do topo: de quem é a vez e o que está acontecendo.
function renderStatus(game, byId) {
  const status = $('status');
  status.dataset.team = game.stage === 'over' ? game.winner : game.turn;
  if (game.stage === 'over') {
    status.replaceChildren(
      el('span', 'status-main', `Time ${TEAM_NAMES[game.winner]} venceu!`),
      el('span', 'status-sub', game.winReason === 'assassino'
        ? 'O outro time revelou o assassino.'
        : `Todas as palavras ${TEAM_WORDS[game.winner]} foram achadas.`),
    );
    return;
  }
  if (game.stage === 'clue') {
    const chief = game.players.find(p => p.team === game.turn && p.chief);
    status.replaceChildren(
      el('span', 'status-main', `Vez do time ${TEAM_NAMES[game.turn]}`),
      el('span', 'status-sub', `${byId[chief?.id]?.name ?? 'O chefe'} (chefe) está pensando na dica…`),
    );
    return;
  }
  const clue = el('span', 'status-main');
  clue.append('Dica: ', el('strong', 'clue-word', game.clue.word), el('span', 'clue-count', String(game.clue.number)));
  const left = game.guessesLeft;
  status.replaceChildren(clue, el('span', 'status-sub',
    `Time ${TEAM_NAMES[game.turn]}: pode tentar mais ${left} ${left === 1 ? 'palavra' : 'palavras'}`));
}

function renderTeamPanel(team, game, byId) {
  const panel = $(`panel-${team}`);
  panel.classList.toggle('active', game.stage !== 'over' && game.turn === team);
  panel.classList.toggle('winner', game.winner === team);
  const left = game.remaining[team];
  const count = el('p', 'team-left');
  count.append(el('strong', '', String(left)), el('span', '', left === 1 ? 'palavra falta' : 'palavras faltam'));
  const members = el('ul', 'team-members');
  members.append(...game.players.filter(p => p.team === team).map(p => {
    const info = byId[p.id] ?? {};
    const li = el('li', info.online === false ? 'offline' : '');
    li.append(avatar(`${info.color}:${info.name}`), makeNameBar(info.name ?? '?'));
    if (p.chief) li.append(el('span', 'chief-tag', 'Chefe'));
    return li;
  }));
  const clues = el('ul', 'team-clues');
  clues.append(...game.clues.filter(c => c.team === team).map(c => el('li', '', `${c.word} · ${c.number}`)));
  panel.replaceChildren(el('h2', '', `Time ${TEAM_NAMES[team]}`), count, members,
    ...(clues.children.length ? [el('h3', '', 'Dicas'), clues] : []));
}

function renderBoard(game, byId) {
  const pointed = {}; // palavra → quem está apontando
  for (const [id, index] of Object.entries(game.pointers)) (pointed[index] ??= []).push(id);
  $('board').replaceChildren(...game.cards.map((card, i) => {
    const node = el('div', 'card');
    if (card.color) node.dataset.color = card.color;
    node.classList.toggle('revealed', card.revealed);
    node.classList.toggle('shown', !card.revealed && card.color !== null); // fim: o que faltou
    node.append(el('span', 'word', card.word));
    if (pointed[i]) {
      const dots = el('span', 'pointers');
      dots.append(...pointed[i].map(id => pointerAvatar(`${byId[id]?.color}:${byId[id]?.name}`)));
      node.append(dots);
    }
    return node;
  }));
}
