// O celular (controle) do Stop: escrever as respostas, dar STOP, corrigir (votar contra
// a resposta que a turma não aceita) e ver o placar.
//
// PRIVACIDADE: as respostas só saem deste celular para o servidor; a TV e os outros só
// as veem na correção. O celular não faz som (todos jogam juntos; quem grita é a TV).
//
// TECLADO: o formulário das respostas é montado UMA vez por rodada e depois só muda de
// classe — refazer as caixas de texto fecharia o teclado de quem está digitando.
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar } from './ui.js';
import { characterLabel } from './characters.js';
import { startsWithLetter, MAX_ANSWER, TIMES } from './stop.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `stop-token-${roomCode}`;

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
let clockOffset = 0; // relógio do servidor − relógio daqui

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
  document.querySelector('.phone').classList.toggle('in-game', screen === 'game');
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

// ---------------------------------------------------------------- escrevendo

const serverNow = () => Date.now() + clockOffset;
const playerOf = id => lobby?.players.find(p => p.id === id);
let formRound = null; // a rodada para a qual o formulário foi montado
const inputs = new Map(); // categoria → caixa de texto
let sendTimer = null;

function collectAnswers() {
  return Object.fromEntries([...inputs].map(([category, input]) => [category, input.value]));
}

// Manda as respostas pouco depois de parar de digitar (e na hora, quando alguém dá STOP).
function sendAnswersSoon() {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(sendAnswersNow, 600);
}
function sendAnswersNow() {
  clearTimeout(sendTimer);
  if (game && (game.stage === 'escrevendo' || game.stage === 'parando')) {
    socket.send({ type: 'answers', round: game.round, answers: collectAnswers() });
  }
}

function buildForm() {
  formRound = game.round;
  inputs.clear();
  const form = $('answers');
  form.replaceChildren(...game.categories.map((category, i) => {
    const row = document.createElement('label');
    row.className = 'answer-row';
    const name = document.createElement('span');
    name.className = 'answer-cat';
    name.textContent = category;
    const input = document.createElement('input');
    input.maxLength = MAX_ANSWER;
    input.autocapitalize = 'sentences';
    input.spellcheck = false;
    input.enterKeyHint = i === game.categories.length - 1 ? 'done' : 'next';
    input.value = you.answers?.[category] ?? '';
    input.addEventListener('input', () => {
      markRow(category);
      updateStopButton();
      sendAnswersSoon();
    });
    input.addEventListener('blur', sendAnswersNow);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const next = [...inputs.values()][i + 1];
      if (next) next.focus();
      else input.blur();
    });
    const mark = document.createElement('span');
    mark.className = 'answer-mark';
    row.append(name, input, mark);
    inputs.set(category, input);
    return row;
  }));
  for (const category of game.categories) markRow(category);
}

// ✓ quando começa com a letra da rodada; ✗ quando começa com outra.
function markRow(category) {
  const input = inputs.get(category);
  const row = input.closest('.answer-row');
  const text = input.value.trim();
  const ok = text && startsWithLetter(text, game.letter);
  row.classList.toggle('ok', Boolean(ok));
  row.classList.toggle('wrong', Boolean(text) && !ok);
  row.querySelector('.answer-mark').textContent = !text ? '' : ok ? '✓' : `✗ ${game.letter}`;
}

function allFilled() {
  return [...inputs.values()].every(input => startsWithLetter(input.value, game.letter));
}

function updateStopButton() {
  const button = $('stop-button');
  const filled = [...inputs.values()].filter(input => startsWithLetter(input.value, game.letter)).length;
  button.disabled = game.stage !== 'escrevendo' || !allFilled();
  button.textContent = allFilled() ? 'STOP!' : `STOP! (faltam ${inputs.size - filled})`;
}

$('stop-button').addEventListener('click', () => {
  if (!allFilled()) return;
  socket.send({ type: 'stop', round: game.round, answers: collectAnswers() });
});

// ---------------------------------------------------------------- correção

function drawReview() {
  const review = game.review;
  const myVotes = new Set(you.myVotes ?? []);
  // respostas iguais numa linha só (um voto contra vale para todas elas)
  const rows = [];
  for (const answer of review.answers) {
    const same = answer.key && rows.find(r => r.key === answer.key);
    if (same) same.playerIds.push(answer.playerId);
    else rows.push({ ...answer, playerIds: [answer.playerId] });
  }
  const nameIn = id => (id === you.id ? 'Você' : playerOf(id)?.name ?? '?');
  $('review-list').replaceChildren(...rows.map(answer => {
    const li = document.createElement('li');
    const player = playerOf(answer.playerId);
    li.className = `review-item ${answer.status}`;
    const text = document.createElement('span');
    text.className = 'review-text';
    text.textContent = answer.text || '(em branco)';
    const who = document.createElement('span');
    who.className = 'review-who';
    who.textContent = answer.playerIds.map(nameIn).join(', ') + (answer.playerIds.length > 1 ? ' (iguais: 5 pontos cada)' : '');
    const info = document.createElement('span');
    info.className = 'review-info';
    info.append(text, who);
    li.append(makeAvatar(player?.color, player?.name ?? '?'), info);
    if (answer.status === 'letra') li.append(tag(`não começa com ${game.letter}`));
    else if (answer.status === 'vazio') li.append(tag('0'));
    else if (answer.status === 'ok' && answer.playerId !== you.id && !isMine(answer.key)) {
      const vote = document.createElement('button');
      vote.type = 'button';
      vote.className = 'reject';
      const on = myVotes.has(answer.key);
      vote.setAttribute('aria-pressed', String(on));
      vote.textContent = `👎 ${answer.votes || ''}`.trim();
      vote.setAttribute('aria-label', `Votar contra "${answer.text}"`);
      vote.addEventListener('click', () => socket.send({ type: 'reject', round: game.round, index: review.index, key: answer.key, on: !on }));
      li.append(vote);
    } else if (answer.votes) {
      li.append(tag(`👎 ${answer.votes}`));
    }
    return li;
  }));
}

const isMine = key => game.review.answers.some(a => a.playerId === you.id && a.key === key);

function tag(text) {
  const span = document.createElement('span');
  span.className = 'review-tag';
  span.textContent = text;
  return span;
}

$('ready-review').addEventListener('click', () => socket.send({ type: 'reviewed', round: game.round }));

// ---------------------------------------------------------------- placar

function drawScores(points) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const placeOf = score => sorted.findIndex(o => o.score === score) + 1; // empate = mesmo lugar
  $('score-list').replaceChildren(...sorted.map(stats => {
    const player = playerOf(stats.id);
    const li = document.createElement('li');
    li.classList.toggle('me', stats.id === you.id);
    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = `${placeOf(stats.score)}º ${player?.name ?? '?'}`;
    const gain = document.createElement('span');
    gain.className = 'score-gain';
    gain.textContent = points ? `+${points[stats.id] ?? 0}` : '';
    const total = document.createElement('span');
    total.className = 'score-total';
    total.textContent = String(stats.score);
    li.append(makeAvatar(player?.color, player?.name ?? '?'), name, gain, total);
    return li;
  }));
}

$('next-round').addEventListener('click', () => socket.send({ type: 'nextRound', round: game.round }));
$('again-button').addEventListener('click', () => socket.send({ type: 'playAgain' }));

// ---------------------------------------------------------------- partida

// Quando alguém dá STOP: manda as respostas na hora (os 3 segundos contam no servidor).
function onGameChange(before, after) {
  if (after?.stage === 'parando' && before?.stage === 'escrevendo') {
    setTimeout(sendAnswersNow, 0);
    document.body.classList.remove('stop-flash');
    void document.body.offsetWidth;
    document.body.classList.add('stop-flash');
  }
}

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  const visible = new Set();
  $('stop-letter').textContent = game.letter;
  const now = serverNow();
  const rolling = game.stage === 'escrevendo' && now < game.writingStartsAt;
  $('stop-letter').classList.toggle('rolling', rolling); // a TV está sorteando a letra

  if (game.stage === 'escrevendo' || game.stage === 'parando') {
    if (formRound !== game.round) buildForm();
    if (rolling) {
      setTop('Sorteando a letra…', 'Olhe a TV!');
      $('stop-letter').textContent = '?';
    } else if (game.stage === 'escrevendo') {
      setTop(`Rodada ${game.round} de ${game.totalRounds}`, 'Uma palavra com a letra em cada categoria.');
      visible.add('stop-button').add('answers');
    } else {
      const stopper = playerOf(game.stopperId);
      const mine = game.stopperId === you.id;
      setTop(mine ? 'Você deu STOP!' : `STOP de ${stopper?.name ?? '?'}!`, mine ? 'Os outros têm 3 segundos…' : 'Você tem 3 segundos para terminar!');
      visible.add('answers');
    }
    updateStopButton();
    for (const input of inputs.values()) input.disabled = rolling || (game.stage === 'parando' && now > game.stopAt);
  } else if (game.stage === 'correcao') {
    const review = game.review;
    setTop(`Correção: ${review.category}`, `Categoria ${review.index + 1} de ${game.categories.length}. Não gostou de uma resposta? Toque em 👎.`);
    const ready = $('ready-review');
    ready.disabled = you.ready;
    ready.textContent = you.ready ? 'Esperando os outros…' : 'Tudo certo ✓';
    drawReview();
    visible.add('ready-review').add('review-list');
  } else if (game.stage === 'placar' || game.stage === 'fim') {
    const mine = game.roundPoints?.[you.id] ?? 0;
    if (game.stage === 'fim') {
      const place = game.ranking.find(r => r.id === you.id)?.place;
      setTop('Fim de jogo!', place === 1 ? 'Você venceu! 🏆' : `Você ficou em ${place}º lugar.`);
    } else {
      setTop(`Fim da rodada ${game.round}`, `Você fez ${mine} ponto${mine === 1 ? '' : 's'} nesta rodada.`);
    }
    drawScores(game.roundPoints);
    visible.add('score-list');
    if (isLeader) visible.add(game.stage === 'fim' ? 'again-button' : 'next-round');
    else {
      const leader = playerOf(lobby.leaderId);
      $('waiting-next').textContent = game.stage === 'fim'
        ? `${leader?.name ?? 'O líder'} 👑 pode começar outra partida.`
        : `${leader?.name ?? 'O líder'} 👑 começa a próxima rodada.`;
      visible.add('waiting-next');
    }
  }
  if (game.stage !== 'escrevendo' && game.stage !== 'parando') formRound = null;

  // liga/desliga as partes de uma vez (sem refazer o formulário: o teclado fica aberto)
  for (const id of ['stop-button', 'answers', 'ready-review', 'review-list', 'next-round', 'again-button', 'score-list', 'waiting-next']) {
    $(id).classList.toggle('hidden', !visible.has(id));
  }
  $('skip-button').classList.add('hidden'); // o Stop não trava por quem caiu: os relógios andam sozinhos
  $('end-game-button').classList.toggle('hidden', !isLeader);
  $('end-game-button').textContent = game.stage === 'fim' ? 'Voltar todos para a sala (líder)' : 'Encerrar partida (líder)';
  updateTimeBar();
  show('game');
}

function setTop(title, sub) {
  $('stop-title').textContent = title;
  $('stop-sub').textContent = sub;
}

// A barra do tempo: quanto falta para escrever / para corrigir esta categoria.
function updateTimeBar() {
  if (!game || lobby?.phase !== 'playing') return;
  const now = serverNow();
  let start = null;
  let end = null;
  if (game.stage === 'escrevendo') [start, end] = [game.writingStartsAt, game.deadline];
  else if (game.stage === 'parando') [start, end] = [game.stopAt - TIMES.stop, game.stopAt];
  else if (game.stage === 'correcao') [start, end] = [game.review.endsAt - TIMES.review, game.review.endsAt];
  const bar = $('time-bar');
  bar.parentElement.classList.toggle('hidden', start === null);
  if (start === null) return;
  const left = Math.max(0, Math.min(1, (end - now) / (end - start)));
  bar.style.width = `${left * 100}%`;
  bar.classList.toggle('late', end - now < 10_000);
  // a roleta acabou: mostra as categorias
  if (game.stage === 'escrevendo' && $('answers').classList.contains('hidden') && now >= game.writingStartsAt) renderGame();
  if (game.stage === 'parando' && now > game.stopAt && !inputs.values().next().value?.disabled) renderGame();
}
setInterval(updateTimeBar, 250);

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
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ---------------------------------------------------------------- guardado no celular

function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// O token volta o celular para o mesmo lugar (e as mesmas respostas) se a conexão cair.
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
