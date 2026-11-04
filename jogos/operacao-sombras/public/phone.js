// O celular (controle): sala com os dois times e a partida — o chefe vê o mapa
// de cores e dá a dica; quem adivinha aponta uma palavra e revela.
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar, makeNameBar } from './ui.js';
import { characterLabel } from './characters.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `codinomes-token-${roomCode}`;
const TEAM_NAMES = { vermelho: 'Vermelho', azul: 'Azul' };
const TEAM_WORDS = { vermelho: 'vermelhas', azul: 'azuis' };
const otherTeam = team => (team === 'vermelho' ? 'azul' : 'vermelho');
const MAX_CLUE_NUMBER = 9;

const SCREENS = ['loading', 'join', 'room', 'game', 'message'];
const nameInput = $('name-input');
const joinButton = $('join-button');
const joinError = $('join-error');
const readyButton = $('ready-button');
const clueInput = $('clue-input');

let lobby = null;
let game = null;
let you = null;
let selectedColor = null;
let joinPending = false;
let notice = null; // aviso que fica na tela (removido da sala, sala não existe)
let currentScreen = 'loading';
let clueNumber = null; // número escolhido para a dica
let lastMoment = null; // "rodada:fase" do último retrato (para avisar a vez só quando muda)

$('room-code').textContent = roomCode || '—';

// ---------------------------------------------------------------- som do celular
//
// PRIVACIDADE: o celular só toca o aviso de "sua vez" (público). Segredo seu
// nunca faz barulho nem vibra — quem está do lado perceberia. E poucos sons:
// só quando é a vez DESTA pessoa sozinha (no Operação Sombras: o chefe, na hora da dica).
const sound = createSound();
const soundKey = 'codinomes-som-celular';
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------- entrar

function renderJoin() {
  const taken = new Set(lobby.players.map(p => p.color));
  if (!selectedColor || taken.has(selectedColor)) selectedColor = lobby.colors.find(c => !taken.has(c)) ?? null;
  // Cada cor é um agente: retrato + codinome (ocupado = apagado).
  $('colors').replaceChildren(...lobby.colors.map(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'agent-option';
    button.dataset.color = color;
    button.disabled = taken.has(color);
    button.setAttribute('aria-pressed', String(color === selectedColor));
    button.setAttribute('aria-label', `${characterLabel(color) || COLOR_LABELS[color]}${taken.has(color) ? ' (ocupado)' : ''}`);
    button.append(makeAvatar(color), el('span', 'codename', characterLabel(color)));
    button.addEventListener('click', () => {
      selectedColor = color;
      render();
    });
    return button;
  }));
  $('agent-picked').textContent = selectedColor ? `Codinome: ${characterLabel(selectedColor)}` : '';
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
  lastMoment = 'sala';
  const isLeader = you.id === lobby.leaderId;
  const leader = lobby.players.find(p => p.id === lobby.leaderId);
  const name = makeNameBar(isLeader ? `${you.name} 👑` : you.name);
  const sub = el('p', 'me-color codename', isLeader ? `Codinome: ${characterLabel(you.color)} · líder` : `Codinome: ${characterLabel(you.color)}`);
  $('me-card').replaceChildren(makeAvatar(you.color, you.name), name, sub);

  // Time e chefe
  const mates = lobby.players.filter(p => p.team === you.team && p.id !== you.id).map(p => p.name);
  const chiefTaken = lobby.players.find(p => p.team === you.team && p.wantsChief && p.id !== you.id);
  $('team-box').dataset.team = you.team;
  $('team-title').textContent = `Seu time: ${TEAM_NAMES[you.team]}`;
  $('team-mates').textContent = mates.length ? `Com: ${mates.join(', ')}` : 'Por enquanto, só você.';
  $('switch-team').textContent = `Trocar para o time ${TEAM_NAMES[otherTeam(you.team)]}`;
  const chiefButton = $('chief-button');
  chiefButton.classList.toggle('chief-on', you.wantsChief);
  chiefButton.textContent = you.wantsChief ? 'Vou ser o chefe ✓' : 'Quero ser o chefe';
  chiefButton.disabled = Boolean(chiefTaken);
  $('chief-hint').textContent = chiefTaken
    ? `${chiefTaken.name} vai ser o chefe do seu time.`
    : you.wantsChief
      ? 'Você vai dar as dicas do seu time. Para desistir, toque no botão de novo.'
      : 'O chefe vê de quem é cada palavra e dá as dicas. Se ninguém pedir, o jogo escolhe.';

  readyButton.classList.toggle('ready-on', you.ready);
  readyButton.textContent = you.ready ? 'Pronto ✓ (cancelar)' : 'Estou pronto!';
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
    const who = el('span', 'who', player.id === lobby.leaderId ? `${player.name} 👑` : player.name);
    const team = el('span', 'team-tag', TEAM_NAMES[player.team]);
    team.dataset.team = player.team;
    const status = el('span', `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`,
      !player.online ? 'offline' : player.ready ? 'pronto' : 'se preparando');
    li.append(makeAvatar(player.color, player.name), who, team, status);
    if (isLeader) {
      const kick = el('button', 'kick-player', '×');
      kick.type = 'button';
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
  const { players, minPerTeam } = lobby;
  const short = ['vermelho', 'azul'].filter(team => players.filter(p => p.team === team).length < minPerTeam);
  if (short.length) return `Cada time precisa de pelo menos ${minPerTeam} pessoas.`;
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  return `Esperando: ${players.filter(p => !p.ready).map(p => p.name).join(', ')}.`;
}

readyButton.addEventListener('click', () => {
  if (you) socket.send({ type: 'ready', ready: !you.ready });
});
$('switch-team').addEventListener('click', () => socket.send({ type: 'setTeam', team: otherTeam(you.team) }));
$('chief-button').addEventListener('click', () => socket.send({ type: 'wantChief', on: !you.wantsChief }));
$('start-button').addEventListener('click', () => socket.send({ type: 'start' }));
$('leave-button').addEventListener('click', () => socket.send({ type: 'leave' }));

// ---------------------------------------------------------------- partida

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  const over = game.stage === 'over';
  const myTurn = game.turn === you.team;
  const canClue = !over && myTurn && you.chief && game.stage === 'clue';
  const canGuess = !over && myTurn && !you.chief && game.stage === 'guess';
  const pointing = game.pointers[you.id] ?? null;

  // Aviso de vez: só o chefe, na hora de dar a dica (é a vez só dele).
  const moment = `${game.round}:${game.stage}`;
  if (canClue && lastMoment !== null && lastMoment !== moment) alertYourTurn();
  lastMoment = moment;

  renderBanner({ over, myTurn, canClue, canGuess });
  renderGrid(canGuess, pointing);

  // Chefe: a dica
  $('clue-form').classList.toggle('hidden', !canClue);
  if (!canClue) {
    clueInput.value = '';
    clueNumber = null;
  }
  updateClueForm();

  // Quem adivinha: revelar a palavra apontada ou passar
  $('guess-actions').classList.toggle('hidden', !canGuess);
  const revealButton = $('reveal-button');
  revealButton.disabled = pointing === null;
  revealButton.textContent = pointing === null ? 'Toque numa palavra' : `Revelar ${game.cards[pointing].word}`;
  $('pass-button').disabled = game.guessesMade === 0;

  $('rematch-button').classList.toggle('hidden', !(isLeader && over));
  $('skip-button').classList.toggle('hidden', !isLeader || over || !lobby.players.some(p => !p.online));
  $('end-game-button').classList.toggle('hidden', !isLeader);
  $('end-game-button').textContent = over ? 'Voltar para a sala (trocar times)' : 'Encerrar partida (líder)';
  show('game');
}

function renderBanner({ over, myTurn, canClue, canGuess }) {
  const banner = $('turn-banner');
  const chief = game.players.find(p => p.team === game.turn && p.chief);
  const chiefName = lobby.players.find(p => p.id === chief?.id)?.name ?? 'O chefe';
  const clueText = game.clue ? `${game.clue.word} · ${game.clue.number}` : '';
  const left = game.guessesLeft;
  let title;
  let small;
  let help;
  if (over) {
    title = `Time ${TEAM_NAMES[game.winner]} venceu!`;
    small = game.winReason === 'assassino' ? 'O outro time revelou o assassino.' : `Todas as palavras ${TEAM_WORDS[game.winner]} foram achadas.`;
    help = 'Agora aparecem as cores de todas as palavras.';
  } else if (canClue) {
    title = 'Sua vez de dar a dica!';
    small = `Você é o chefe do time ${TEAM_NAMES[you.team]}`;
    help = `Só você e o outro chefe veem as cores. Escreva UMA palavra que lembre palavras ${TEAM_WORDS[you.team]} e diga quantas.`;
  } else if (you.chief && myTurn) {
    title = 'Seu time está adivinhando';
    small = `Sua dica: ${clueText}`;
    help = 'Não fale nada nem faça careta: o time tem que descobrir sozinho!';
  } else if (you.chief) {
    title = `Vez do time ${TEAM_NAMES[game.turn]}`;
    small = `Você é o chefe do time ${TEAM_NAMES[you.team]}`;
    help = 'No seu mapa: vermelho e azul são dos times, bege é de ninguém e preto é o assassino.';
  } else if (canGuess) {
    title = `Dica: ${clueText}`;
    small = `Vocês podem tentar mais ${left} ${left === 1 ? 'palavra' : 'palavras'}`;
    help = 'Conversem! Toque numa palavra (todos veem na TV) e depois em Revelar.';
  } else if (myTurn) {
    title = 'Esperando a dica';
    small = `${chiefName} (chefe) está pensando…`;
    help = 'Quando a dica chegar, achem as palavras do seu time.';
  } else {
    title = `Vez do time ${TEAM_NAMES[game.turn]}`;
    small = game.stage === 'guess' ? `Dica deles: ${clueText}` : 'Esperando a dica deles…';
    help = 'Fique de olho: o que eles revelarem também ajuda vocês.';
  }
  banner.dataset.team = over ? game.winner : game.turn;
  banner.replaceChildren(document.createTextNode(title), el('small', '', small));
  $('game-help').textContent = help;
}

// As 25 palavras. Chefe: com as cores do mapa. Quem adivinha: toca para apontar.
function renderGrid(canGuess, pointing) {
  const colorOf = Object.fromEntries(lobby.players.map(p => [p.id, p.color]));
  $('word-grid').replaceChildren(...game.cards.map((card, i) => {
    const cell = el('button', 'word-cell');
    cell.type = 'button';
    const word = el('span', [...card.word].length >= 8 ? 'word long' : 'word', card.word);
    cell.append(word);
    if (card.revealed) {
      cell.dataset.state = 'revealed';
      cell.dataset.color = card.color;
    } else if (card.color) {
      cell.dataset.state = 'shown';
      cell.dataset.color = card.color;
    } else if (you.key) {
      cell.dataset.state = 'key';
      cell.dataset.color = you.key[i];
    }
    cell.classList.toggle('pointing', pointing === i);
    // Quem do time está apontando esta palavra (bolinhas na cor da pessoa)
    const others = Object.entries(game.pointers).filter(([id, at]) => at === i && id !== you.id);
    if (others.length) {
      const dots = el('span', 'cell-dots');
      for (const [id] of others) {
        const dot = el('i');
        dot.dataset.color = colorOf[id];
        dots.append(dot);
      }
      cell.append(dots);
    }
    cell.disabled = !canGuess || card.revealed;
    cell.addEventListener('click', () => socket.send({ type: 'point', index: i }));
    return cell;
  }));
}

// Números da dica (1 a 9), criados uma vez só.
$('clue-numbers').replaceChildren(...Array.from({ length: MAX_CLUE_NUMBER }, (_, i) => {
  const button = el('button', 'clue-number', String(i + 1));
  button.type = 'button';
  button.addEventListener('click', () => {
    clueNumber = i + 1;
    updateClueForm();
  });
  return button;
}));

function updateClueForm() {
  for (const button of $('clue-numbers').children) {
    button.setAttribute('aria-pressed', String(Number(button.textContent) === clueNumber));
  }
  $('clue-button').disabled = !clueInput.value.trim() || !clueNumber;
  $('clue-button').textContent = clueInput.value.trim() && clueNumber
    ? `Dar a dica: ${clueInput.value.trim().toUpperCase()} · ${clueNumber}`
    : 'Dar a dica';
}
clueInput.addEventListener('input', updateClueForm);
$('clue-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('clue-button').disabled) return;
  clueInput.blur();
  socket.send({ type: 'clue', word: clueInput.value, number: clueNumber });
});

$('reveal-button').addEventListener('click', () => {
  const pointing = game?.pointers[you?.id];
  if (pointing !== undefined) socket.send({ type: 'reveal', index: pointing });
});
$('pass-button').addEventListener('click', () => {
  if (confirm('Parar de adivinhar e passar a vez para o outro time?')) socket.send({ type: 'pass' });
});
$('rematch-button').addEventListener('click', () => socket.send({ type: 'rematch' }));
$('skip-button').addEventListener('click', () => {
  if (confirm('Pular quem está desconectado?')) socket.send({ type: 'skipOffline' });
});
$('end-game-button').addEventListener('click', () => {
  const question = game?.stage === 'over' ? 'Voltar todos para a sala?' : 'Encerrar a partida e voltar todos para a sala?';
  if (confirm(question)) socket.send({ type: 'endGame' });
});

// Quando passa a ser a vez DESTA pessoa: pisca, vibra e, se o 🔔 estiver
// ligado, toca. Só a vez dela — vários celulares tocando juntos cansa.
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

// O token volta o celular para o mesmo lugar (e o mesmo time) se a conexão cair.
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
