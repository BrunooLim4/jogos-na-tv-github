// O celular (controle). Sala pronta; o controle do jogo entra em renderGame (TROCAR).
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar } from './ui.js';
import { characterLabel } from './characters.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `modelo-token-${roomCode}`; // TROCAR "modelo" pelo nome do jogo

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

// ---------------------------------------------------------------- som do celular
//
// PRIVACIDADE: o celular só toca o aviso de "sua vez" (público). Segredo seu
// (carta boa, objetivo cumprido) nunca faz barulho nem vibra — quem está do
// lado perceberia. E poucos sons: só quando é a vez DESTA pessoa.
const sound = createSound();
const soundKey = 'modelo-som-celular'; // TROCAR "modelo" pelo nome do jogo
let phoneSoundOn = readSetting(soundKey) !== 'off';
window.addEventListener('pointerdown', () => sound.unlock()); // iPhone: som só depois de um toque
function updatePhoneSoundButton() {
  $('phone-sound').textContent = phoneSoundOn ? '🔔' : '🔕';
}
$('phone-sound').addEventListener('click', () => {
  phoneSoundOn = !phoneSoundOn;
  writeSetting(soundKey, phoneSoundOn ? 'on' : 'off');
  updatePhoneSoundButton();
  showToast(phoneSoundOn ? 'Som na sua vez' : 'Celular em silêncio');
});
updatePhoneSoundButton();

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

function handleMessage(msg) {
  switch (msg.type) {
    case 'state':
      lobby = msg.lobby;
      game = msg.game;
      you = msg.you;
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

// ---------------------------------------------------------------- partida

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  $('skip-button').classList.toggle('hidden', !isLeader || !lobby.players.some(p => !p.online));
  $('end-game-button').classList.toggle('hidden', !isLeader);
  show('game');
}

$('skip-button').addEventListener('click', () => {
  if (confirm('Pular quem está desconectado?')) socket.send({ type: 'skipOffline' });
});
$('end-game-button').addEventListener('click', () => {
  if (confirm('Encerrar a partida e voltar todos para a sala?')) socket.send({ type: 'endGame' });
});

// Chamar (no renderGame) quando passa a ser a vez DESTA pessoa: pisca, vibra e,
// se o 🔔 estiver ligado, toca. Só a vez dela — vários celulares tocando juntos cansa.
function alertYourTurn() {
  document.body.classList.remove('your-turn-flash');
  void document.body.offsetWidth; // reinicia a animação
  document.body.classList.add('your-turn-flash');
  navigator.vibrate?.([120, 60, 120]); // (Android; o iPhone não vibra pelo navegador)
  if (phoneSoundOn) sound.play('yourTurn');
}

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

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sem armazenamento: vale só até recarregar a página
  }
}

// O token volta o celular para o mesmo lugar (e a mesma mão) se a conexão cair.
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
