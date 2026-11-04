// O celular (controle) do Lobisomem.
//
// PRIVACIDADE (regra de ouro do jogo de papel secreto): a tela é IGUAL para todos os
// personagens — a mesma carta para segurar, a mesma mesa para tocar (jogadores + as 3
// do meio) e o mesmo botão "Confirmar". O personagem, o que fazer à noite e o que a
// pessoa descobriu só aparecem enquanto o dedo SEGURA a carta. Quem não tem ação toca
// numa carta qualquer (só para disfarçar). O celular não faz som nem vibra: à noite
// todos mexem juntos e qualquer barulho entregaria alguém.
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar, makeCard, setCardFace } from './ui.js';
import { characterLabel } from './characters.js';
import { ROLES, TEAMS, roleOf, actOf, validPick } from './papeis.js';
import { revealMs } from './tempos.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `lobisomem-token-${roomCode}`;

const SCREENS = ['loading', 'join', 'room', 'game', 'message'];
const nameInput = $('name-input');
const joinButton = $('join-button');
const joinError = $('join-error');
const readyButton = $('ready-button');

let lobby = null;
let game = null;
let you = null;
let selectedColor = null;
let joinPending = false;
let notice = null; // aviso que fica na tela (removido da sala, sala não existe)
let currentScreen = 'loading';

$('room-code').textContent = roomCode || '—';

// Botões do líder para ligar/desligar o som da TV (na sala e na partida).
for (const button of document.querySelectorAll('.tv-sound-button')) {
  button.addEventListener('click', () => socket.send({ type: 'setTvSound', on: !(lobby?.tvSound ?? true) }));
}
function updateTvSoundButtons() {
  const isLeader = you && lobby && you.id === lobby.leaderId;
  for (const button of document.querySelectorAll('.tv-sound-button')) {
    button.textContent = lobby?.tvSound === false ? '🔇 Som da TV: desligado' : '🔊 Som da TV: ligado';
    if (button.id === 'game-tv-sound') button.classList.toggle('hidden', !isLeader);
  }
}

const socket = connect({
  onOpen: () => socket.send({ type: 'hello', role: 'phone', code: roomCode, token: loadToken() }),
  onStatus: status => $('conn-banner').classList.toggle('hidden', status === 'online'),
  onMessage: handleMessage,
});

let clockOffset = 0; // relógio do servidor − relógio daqui

function handleMessage(msg) {
  switch (msg.type) {
    case 'state':
      lobby = msg.lobby;
      onGameChange(game, msg.game);
      game = msg.game;
      you = msg.you;
      if (game) clockOffset = game.now - Date.now();
      joinPending = false;
      break;
    case 'welcome':
      saveToken(msg.token);
      return;
    case 'note':
      showToast(msg.text);
      return;
    case 'left':
      saveToken(null);
      return;
    case 'kicked':
      saveToken(null);
      notice = { title: 'Você saiu da sala', text: 'O líder removeu você da partida.', button: 'Entrar de novo', action: () => { notice = null; render(); } };
      break;
    case 'error':
      joinPending = false;
      if (msg.code === 'sala_inexistente') {
        saveToken(null);
        notice = { title: 'Sala não encontrada', text: msg.message, button: 'Tentar de novo', action: () => location.reload() };
      } else if (currentScreen === 'join') {
        joinError.textContent = msg.message;
        joinError.classList.remove('hidden');
      } else {
        showToast(msg.message, true);
      }
      break;
    default:
      return;
  }
  render();
}

// ---------------------------------------------------------------- telas

function show(screen) {
  currentScreen = screen;
  for (const name of SCREENS) $(`screen-${name}`).classList.toggle('hidden', name !== screen);
  $('phone').classList.toggle('in-game', screen === 'game');
}

function render() {
  if (notice) return renderNotice(notice);
  if (!lobby) return show('loading');
  updateTvSoundButtons();
  if (you) return lobby.phase === 'playing' && game ? renderGame() : renderRoom();
  if (lobby.phase !== 'lobby') {
    return renderNotice({ title: 'A partida já começou', text: 'Espere a próxima partida para entrar.', button: 'Atualizar', action: () => location.reload() });
  }
  if (lobby.players.length >= lobby.maxPlayers) {
    return renderNotice({ title: 'Sala cheia', text: `Esta partida já tem ${lobby.maxPlayers} jogadores.`, button: 'Atualizar', action: () => location.reload() });
  }
  renderJoin();
}

let noticeAction = null;
function renderNotice({ title, text, button, action }) {
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  $('message-button').textContent = button;
  noticeAction = action;
  show('message');
}
$('message-button').addEventListener('click', () => noticeAction?.());

// ---------------------------------------------------------------- entrar

function renderJoin() {
  const taken = new Set(lobby.players.map(p => p.color));
  if (!selectedColor || taken.has(selectedColor)) selectedColor = lobby.colors.find(c => !taken.has(c)) ?? null;
  $('colors').replaceChildren(...lobby.colors.map(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-option';
    button.dataset.color = color;
    button.disabled = taken.has(color);
    button.setAttribute('aria-pressed', String(color === selectedColor));
    button.setAttribute('aria-label', `${COLOR_LABELS[color]}${taken.has(color) ? ' (ocupada)' : ''}`);
    button.addEventListener('click', () => {
      selectedColor = color;
      render();
    });
    return button;
  }));
  updateJoinButton();
  show('join');
}

function updateJoinButton() {
  joinButton.disabled = joinPending || !nameInput.value.trim() || !selectedColor;
}
nameInput.addEventListener('input', () => {
  joinError.classList.add('hidden');
  updateJoinButton();
});
$('screen-join').addEventListener('submit', event => {
  event.preventDefault();
  if (joinButton.disabled) return;
  joinPending = true;
  updateJoinButton();
  nameInput.blur();
  socket.send({ type: 'join', name: nameInput.value, color: selectedColor });
});

// ---------------------------------------------------------------- sala

function renderRoom() {
  const isLeader = you.id === lobby.leaderId;
  const leader = lobby.players.find(p => p.id === lobby.leaderId);
  const name = document.createElement('p');
  name.className = 'me-name';
  name.textContent = isLeader ? `${you.name} 👑` : you.name;
  const sub = document.createElement('p');
  sub.className = 'me-color';
  sub.textContent = isLeader ? `${characterLabel(you.color)} · você é o líder` : characterLabel(you.color);
  $('me-card').replaceChildren(makeAvatar(you.color, you.name), name, sub);

  readyButton.classList.toggle('ready-on', you.ready);
  readyButton.textContent = you.ready ? 'Pronto ✓ (toque para cancelar)' : 'Estou pronto!';
  $('leader-box').classList.toggle('hidden', !isLeader);
  $('waiting-leader').classList.toggle('hidden', isLeader);
  if (isLeader) {
    $('start-button').disabled = !lobby.canStart;
    $('leader-hint').textContent = lobby.canStart ? 'Todos prontos. Pode começar!' : waitingText();
  } else {
    $('waiting-leader').textContent = `Quando todos estiverem prontos, ${leader?.name ?? 'o líder'} 👑 começa a partida.`;
  }

  const others = lobby.players.filter(p => p.id !== you.id);
  $('others-title').textContent = `Na sala (${lobby.players.length}/${lobby.maxPlayers})`;
  $('others-list').replaceChildren(...others.map(player => {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = player.id === lobby.leaderId ? `${player.name} 👑` : player.name;
    const status = document.createElement('span');
    status.className = `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`;
    status.textContent = !player.online ? 'offline' : player.ready ? 'pronto' : 'se preparando';
    li.append(makeAvatar(player.color, player.name), who, status);
    if (isLeader) {
      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'kick-player';
      kick.textContent = '×';
      kick.setAttribute('aria-label', `Remover ${player.name}`);
      kick.addEventListener('click', () => {
        if (confirm(`Remover ${player.name} da sala?`)) socket.send({ type: 'kick', id: player.id });
      });
      li.append(kick);
    }
    return li;
  }));
  show('room');
}

function waitingText() {
  const { players, minPlayers } = lobby;
  if (players.length < minPlayers) return `Precisa de pelo menos ${minPlayers} jogadores.`;
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  return `Esperando: ${players.filter(p => !p.ready).map(p => p.name).join(', ')}.`;
}

readyButton.addEventListener('click', () => {
  if (you) socket.send({ type: 'ready', ready: !you.ready });
});
$('start-button').addEventListener('click', () => socket.send({ type: 'start' }));
$('leave-button').addEventListener('click', () => socket.send({ type: 'leave' }));

// ---------------------------------------------------------------- a sua carta (segure para ver)

const holdCard = makeCard();
$('hold-card').append(holdCard);
const hold = $('hold');
function setHolding(on) {
  hold.classList.toggle('holding', on);
  holdCard.classList.toggle('flipped', on);
}
hold.addEventListener('pointerdown', event => {
  event.preventDefault();
  hold.setPointerCapture?.(event.pointerId);
  setHolding(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(type, () => setHolding(false));
hold.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('visibilitychange', () => setHolding(false));

const playerName = id => lobby?.players.find(p => p.id === id)?.name ?? '?';

// O que aparece enquanto segura: o personagem, o time, o que fazer (de noite) e o que
// descobriu (de dia em diante).
function drawSecret() {
  const role = roleOf(you.card);
  const data = ROLES[role];
  const parts = [];
  const add = (html, cls = '') => parts.push(`<span class="${cls}">${html}</span>`);
  add(`Você é <strong>${data.name}</strong>`);
  add(TEAMS[data.team].name, data.team === 'lobos' ? 'team-lobos' : '');
  if (game.stage === 'noite') {
    if (you.copied) {
      add(`Você copiou e agora é <strong>${ROLES[you.copied].name}</strong>.`);
      add(you.step === 'sosia-2' ? `Agora: ${actOf(you.copied).hint}` : ROLES[you.copied].night);
    } else if (you.step !== 'feito') {
      add(data.night);
      add(`<strong>${actOf(role).hint}</strong>`);
    } else {
      add(data.night);
    }
  } else {
    add(data.day);
  }
  let html = parts.join('');
  if (game.stage !== 'noite' && you.info?.length) {
    html += '<span class="hold-info"><strong>À noite:</strong>';
    for (const item of you.info) {
      html += `<span>${item.text}</span>`;
      if (item.cards.length) html += `<span class="seen">${item.cards.map(c => `<img src="/cartas/${c}.webp" alt="">`).join('')}</span>`;
    }
    html += '</span>';
  }
  $('hold-secret').innerHTML = html;
  setCardFace(holdCard, you.card);
  $('hold-sub').textContent = game.stage === 'noite'
    ? 'Segure aqui para ver quem você é e o que fazer.'
    : 'Segure aqui para ver quem você é e o que descobriu à noite.';
}

// ---------------------------------------------------------------- a mesa (tocar nas cartas)

let pick = { players: [], center: [] };
let pickKey = ''; // muda de fase/passo → começa a escolha do zero
let voteChoice = null;

function togglePlayer(id) {
  if (game.stage === 'votacao') {
    voteChoice = id;
    return renderGame();
  }
  const i = pick.players.indexOf(id);
  if (i >= 0) pick.players.splice(i, 1);
  else pick.players.push(id);
  trimPick(pick.players);
  renderGame();
}

function toggleCenter(index) {
  const i = pick.center.indexOf(index);
  if (i >= 0) pick.center.splice(i, 1);
  else pick.center.push(index);
  trimPick(pick.center);
  renderGame();
}

// No máximo 2 cartas tocadas: a 3ª tira a mais antiga (o mesmo para todos os personagens).
function trimPick(list) {
  while (pick.players.length + pick.center.length > 2) {
    if (list === pick.players && pick.center.length) pick.center.shift();
    else if (list === pick.center && pick.players.length) pick.players.shift();
    else list.shift();
  }
}

function actingRole() {
  if (you.step === 'sosia-2') return you.copied;
  return roleOf(you.card);
}

function drawPickArea(mode) {
  const others = lobby.players.filter(p => p.id !== you.id);
  const chosen = mode === 'vote' ? [voteChoice] : pick.players;
  $('pick-players').classList.toggle('three', others.length >= 5);
  $('pick-players').replaceChildren(...others.map(p => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pick-player';
    button.setAttribute('aria-pressed', String(chosen.includes(p.id)));
    const name = document.createElement('span');
    name.textContent = p.name;
    button.append(makeAvatar(p.color, p.name), name);
    button.addEventListener('click', () => togglePlayer(p.id));
    return button;
  }));
  const showCenter = mode === 'night';
  $('center-label').classList.toggle('hidden', !showCenter);
  $('pick-center').classList.toggle('hidden', !showCenter);
  if (showCenter) {
    $('pick-center').replaceChildren(...[0, 1, 2].map(i => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick-card';
      button.setAttribute('aria-pressed', String(pick.center.includes(i)));
      button.setAttribute('aria-label', `Carta ${i + 1} do meio`);
      const img = document.createElement('img');
      img.src = '/cartas/verso.webp';
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = String(i + 1);
      button.append(img, label);
      button.addEventListener('click', () => toggleCenter(i));
      return button;
    }));
  }
}

$('confirm-button').addEventListener('click', () => {
  if (game.stage === 'noite') {
    if (!validPick(actingRole(), pick, you.id, game.players.map(p => p.id))) return;
    socket.send({ type: 'night', pick });
  } else if (game.stage === 'votacao' && voteChoice) {
    socket.send({ type: 'vote', target: voteChoice });
  }
});

// ---------------------------------------------------------------- partida

// "Olhem a TV!": quando o resultado sai, o celular espera a TV mostrar.
let lookUntil = 0;
let lookTimer = null;
function onGameChange(before, after) {
  if (!before || !after || before.stage !== 'votacao' || after.stage !== 'fim') return;
  lookUntil = Date.now() + 700 + revealMs(after.result, after.players.length);
  clearTimeout(lookTimer);
  lookTimer = setTimeout(render, lookUntil - Date.now() + 50);
}

function banner(title, sub, act = false) {
  const el = $('turn-banner');
  el.replaceChildren(document.createTextNode(title));
  const small = document.createElement('small');
  small.textContent = sub;
  el.append(small);
  el.classList.toggle('act', act);
}

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  const key = `${game.match}:${game.stage}:${you.step}`;
  if (key !== pickKey) {
    pickKey = key;
    pick = { players: [], center: [] };
    voteChoice = you.vote;
  }
  const visible = new Set(['hold']);
  drawSecret();

  if (game.stage === 'noite') {
    if (you.step === 'feito') {
      banner('A noite caiu', 'Pronto! Agora é só esperar os outros terminarem.');
      $('pick-done').textContent = 'Você já fez a sua parte. Não conte nada para ninguém!';
      visible.add('pick-done');
    } else {
      banner('A noite caiu', 'Segure a sua carta e faça o que ela manda.', true);
      drawPickArea('night');
      $('confirm-button').textContent = 'Confirmar';
      $('confirm-button').disabled = !validPick(actingRole(), pick, you.id, game.players.map(p => p.id));
      visible.add('confirm-button').add('pick-area');
    }
  } else if (game.stage === 'dia') {
    banner('Amanheceu!', 'Segure a sua carta para ver o que descobriu. Conversem!');
    visible.add('day-clock');
    updateDayClock();
  } else if (game.stage === 'votacao') {
    const voted = you.vote;
    banner('Hora de votar', voted ? `Você votou em ${playerName(voted)}. Dá para trocar até todos votarem.` : 'Toque em quem deve morrer e confirme.', !voted);
    drawPickArea('vote');
    const button = $('confirm-button');
    button.className = 'btn danger';
    button.textContent = !voteChoice ? 'Escolha alguém' : voteChoice === voted ? `Voto em ${playerName(voted)} ✓` : voted ? `Trocar o voto para ${playerName(voteChoice)}` : `Votar em ${playerName(voteChoice)}`;
    button.disabled = !voteChoice || voteChoice === voted;
    visible.add('confirm-button').add('pick-area');
  } else if (game.stage === 'fim') {
    if (Date.now() < lookUntil) {
      banner('Votação encerrada', 'Olhem a TV!');
      visible.add('look-tv');
    } else {
      banner('Fim da partida', game.result.reason);
      drawResult();
      visible.add('result-card').add('result-headline');
    }
  }
  if (game.stage !== 'votacao') $('confirm-button').className = 'btn';

  // ferramentas do líder
  const leaderTools = isLeader && (game.stage === 'dia' || (game.stage === 'fim' && Date.now() >= lookUntil));
  $('vote-now-button').classList.toggle('hidden', game.stage !== 'dia');
  $('add-minute-button').classList.toggle('hidden', game.stage !== 'dia');
  $('again-button').classList.toggle('hidden', game.stage !== 'fim');
  if (leaderTools) visible.add('leader-tools');
  if (!isLeader && game.stage === 'fim' && Date.now() >= lookUntil) {
    const leader = lobby.players.find(p => p.id === lobby.leaderId);
    $('waiting-next').textContent = `${leader?.name ?? 'O líder'} 👑 pode começar outra partida.`;
    visible.add('waiting-next');
  }
  for (const id of ['day-clock', 'confirm-button', 'pick-area', 'pick-done', 'look-tv', 'result-card', 'result-headline', 'leader-tools', 'waiting-next']) {
    $(id).classList.toggle('hidden', !visible.has(id));
  }

  const someoneStuck = lobby.players.some(p => !p.online) && (game.stage === 'noite' || game.stage === 'votacao');
  $('skip-button').classList.toggle('hidden', !isLeader || !someoneStuck);
  $('end-game-button').classList.toggle('hidden', !isLeader);
  $('end-game-button').textContent = game.stage === 'fim' ? 'Voltar todos para a sala (líder)' : 'Encerrar partida (líder)';
  show('game');
}

const resultCard = makeCard();
$('result-card-img').append(resultCard);
function drawResult() {
  const result = game.result;
  const won = you.won;
  const finalRole = result.roles[you.id];
  const card = $('result-card');
  card.classList.toggle('won', won);
  card.classList.toggle('lost', !won);
  setCardFace(resultCard, you.finalCard);
  resultCard.classList.add('flipped');
  const dead = result.dead.includes(you.id);
  $('result-title').textContent = won ? 'Você venceu!' : 'Você perdeu';
  const changed = you.finalCard !== you.card;
  $('result-text').textContent = `${dead ? 'Você morreu. ' : ''}No fim da noite você era ${ROLES[finalRole]?.name ?? 'Sósia'} (${TEAMS[ROLES[finalRole]?.team ?? 'vila'].name.toLowerCase()}).${changed ? ' Sua carta foi trocada à noite!' : ''}`;
  $('result-headline').textContent = result.headline;
}

// relógio do dia no celular
function updateDayClock() {
  if (!game || game.stage !== 'dia' || !game.dayEndsAt) return;
  const left = Math.max(0, Math.ceil((game.dayEndsAt - (Date.now() + clockOffset)) / 1000));
  const clock = $('day-clock');
  clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  clock.classList.toggle('late', left <= 10);
}
setInterval(updateDayClock, 500);

$('vote-now-button').addEventListener('click', () => {
  if (confirm('Encerrar a conversa e começar a votação agora?')) socket.send({ type: 'voteNow' });
});
$('add-minute-button').addEventListener('click', () => socket.send({ type: 'addMinute' }));
$('again-button').addEventListener('click', () => socket.send({ type: 'playAgain' }));
$('skip-button').addEventListener('click', () => {
  if (confirm('Pular quem está desconectado?')) socket.send({ type: 'skipOffline' });
});
$('end-game-button').addEventListener('click', () => {
  const question = game?.stage === 'fim' ? 'Voltar todos para a sala?' : 'Encerrar a partida e voltar todos para a sala?';
  if (confirm(question)) socket.send({ type: 'endGame' });
});

// ---------------------------------------------------------------- aviso rápido

let toastTimer = null;
function showToast(text, isError = false) {
  const toast = $('toast');
  toast.classList.toggle('error', isError);
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

// ---------------------------------------------------------------- guardado no celular

function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// O token volta o celular para o mesmo lugar (e a mesma carta) se a conexão cair.
function loadToken() {
  return readSetting(tokenKey);
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(tokenKey, token);
    else localStorage.removeItem(tokenKey);
  } catch {
    // navegação privada: o jogo continua, só não reconecta sozinho
  }
}
