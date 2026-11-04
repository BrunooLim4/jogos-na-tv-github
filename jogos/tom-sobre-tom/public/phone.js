// O celular (controle). Sala do modelo; o jogo em renderGame: quem dá a dica
// escolhe a cor da carta e escreve a dica; os outros põem o cone no tabuleiro
// pequeno com a lupa (e a TV mostra onde o dedo está).
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar } from './ui.js';
import { characterLabel } from './characters.js';
import { createSound } from './sound.js';
import { BOARD, ROWS, COLS, cellAt, rowOf, colOf, cellName } from './cores.js';
import { checkCue } from './dicas.js';
import { revealMs } from './tempos.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `tom-sobre-tom-token-${roomCode}`;

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
const soundKey = 'tom-sobre-tom-som-celular';
let phoneSoundOn = readSetting(soundKey) !== 'off';
window.addEventListener('pointerdown', () => sound.unlock()); // iPhone: som só depois de um toque
function updatePhoneSoundButton() {
  $('phone-sound').textContent = phoneSoundOn ? '🔔' : '🔕';
  $('game-phone-sound').textContent = phoneSoundOn ? '🔔 Som deste celular: ligado' : '🔕 Som deste celular: desligado';
}
function togglePhoneSound() {
  phoneSoundOn = !phoneSoundOn;
  writeSetting(soundKey, phoneSoundOn ? 'on' : 'off');
  updatePhoneSoundButton();
  showToast(phoneSoundOn ? 'Som na sua vez' : 'Celular em silêncio');
}
$('phone-sound').addEventListener('click', togglePhoneSound);
$('game-phone-sound').addEventListener('click', togglePhoneSound);
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
      onGameChange(game);
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
  // Na partida, o topo (nome do jogo, sala) sai: tudo tem que caber sem rolar.
  document.querySelector('.phone').classList.toggle('in-game', screen === 'game');
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

const nameOf = id => lobby?.players.find(p => p.id === id)?.name ?? '?';
const ZOOM_COLS = 7;
const ZOOM_ROWS = 5;

// A escolha da casa no tabuleiro: `cell` = a cor escolhida; `center` = o meio da lupa.
let pick = { cell: null, center: cellAt(7, 14) };
let pickedTarget = null; // quem dá a dica: a cor escolhida da carta (antes de enviar)
let lookUntil = 0; // "Olhem a TV!" até esta hora (a TV está revelando)
let lookTimer = null;
let prevGame = null;
let alertKey = null;
let lastHoverSent = 0;
let hoverTimer = null;

// O tabuleiro pequeno: montado uma vez (480 casas), só mudando de classe.
const mini = $('mini');
const miniCells = BOARD.map(color => {
  const cell = document.createElement('div');
  cell.className = 'mini-cell';
  cell.style.background = color;
  return cell;
});
mini.prepend(...miniCells);

// Celular ouviu a revelação ao vivo: espera a TV mostrar antes dos pontos.
function onGameChange(next) {
  const before = prevGame;
  prevGame = next;
  if (!before || !next || before.round !== next.round) return;
  const revealedNow = (next.stage === 'revelacao' || next.stage === 'fim') && before.stage !== 'revelacao' && before.stage !== 'fim';
  if (revealedNow && next.result) {
    lookUntil = Date.now() + 700 + revealMs(next.result);
    clearTimeout(lookTimer);
    lookTimer = setTimeout(render, lookUntil - Date.now() + 50);
  }
}

// O que aparece na tela do jogo: cada desenho diz o que mostra (showEl) e, no fim,
// tudo é ligado/desligado de uma vez — esconder e mostrar de novo a caixa da dica
// fecharia o teclado de quem está digitando.
const GAME_PARTS = ['cue-now', 'card-pick', 'board-box', 'cone-button', 'cue-form', 'result', 'next-button', 'again-button'];
let visible = new Set();
const showEl = (...ids) => ids.forEach(id => visible.add(id));
const setHidden = (id, hidden) => $(id).classList.toggle('hidden', hidden);

function setBanner(text, sub, mine = false) {
  const banner = $('turn-banner');
  banner.classList.toggle('mine', mine);
  banner.replaceChildren(document.createTextNode(text));
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    banner.append(small);
  }
}

function setHelp(text) {
  $('tab-help').textContent = text;
  $('tab-help').classList.toggle('hidden', !text);
}

function cueChip(cue) {
  const chip = document.createElement('span');
  chip.className = `cue-chip${cue.spoken ? ' spoken' : ''}`;
  chip.textContent = cue.spoken ? '🗣 falada em voz alta' : `“${cue.text}”`;
  return chip;
}

function drawCues() {
  const box = $('cue-now');
  if (!game.cue1) return;
  const label = document.createElement('span');
  label.className = 'cue-label';
  label.textContent = `Dica de ${nameOf(game.cueGiverId)}`;
  const parts = [label, cueChip(game.cue1)];
  if (game.cue2 && !game.cue2.passed) parts.push(cueChip(game.cue2));
  box.replaceChildren(...parts);
  showEl('cue-now');
}

// Pinta o tabuleiro pequeno: cones, a cor certa (só de quem dá a dica), a escolha
// e o quadrado da lupa.
function drawMini({ target = null } = {}) {
  const taken = new Map(game.pieces.map(p => [p.cell, p]));
  const colorOf = id => lobby.players.find(p => p.id === id)?.color ?? '';
  miniCells.forEach((node, cell) => {
    const piece = taken.get(cell);
    node.classList.toggle('taken', Boolean(piece));
    if (piece) node.dataset.color = colorOf(piece.playerId);
    else delete node.dataset.color;
    node.classList.toggle('target', cell === target);
    node.classList.toggle('picked', cell === pick.cell);
  });
  const { row, col } = zoomOrigin();
  const box = $('mini-window');
  box.style.left = `${(col / COLS) * 100}%`;
  box.style.top = `${(row / ROWS) * 100}%`;
  box.style.width = `${(ZOOM_COLS / COLS) * 100}%`;
  box.style.height = `${(ZOOM_ROWS / ROWS) * 100}%`;
}

// O canto de cima à esquerda da lupa (7 × 5 casas em volta do centro, sem sair do tabuleiro).
function zoomOrigin() {
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  return {
    row: clamp(rowOf(pick.center) - Math.floor(ZOOM_ROWS / 2), ROWS - ZOOM_ROWS),
    col: clamp(colOf(pick.center) - Math.floor(ZOOM_COLS / 2), COLS - ZOOM_COLS),
  };
}

// A lupa: as casas bem grandes, com o nome (C12); tocar escolhe (se puder escolher).
function drawZoom({ target = null, interactive = false } = {}) {
  const taken = new Map(game.pieces.map(p => [p.cell, p]));
  const { row, col } = zoomOrigin();
  const cells = [];
  for (let r = row; r < row + ZOOM_ROWS; r++) {
    for (let c = col; c < col + ZOOM_COLS; c++) {
      const cell = cellAt(r, c);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zoom-cell';
      button.style.background = BOARD[cell];
      const name = document.createElement('span');
      name.className = 'zoom-name';
      name.textContent = cellName(cell);
      button.append(name);
      const piece = taken.get(cell);
      if (piece) {
        const info = lobby.players.find(p => p.id === piece.playerId);
        button.classList.add('taken');
        button.append(makeCone(info?.color, info?.name));
      } else if (cell === pick.cell && interactive) {
        button.classList.add('picked');
        button.append(makeCone(you.color, you.name));
      }
      if (cell === target) button.classList.add('target');
      button.disabled = !interactive || Boolean(piece);
      if (interactive && !piece) button.addEventListener('click', () => choose(cell, false));
      cells.push(button);
    }
  }
  $('zoom').replaceChildren(...cells);
}

function makeCone(color, name) {
  const cone = document.createElement('span');
  cone.className = 'zoom-cone';
  cone.dataset.color = color ?? '';
  cone.textContent = (name?.trim()[0] ?? '?').toUpperCase();
  return cone;
}

const isTaken = cell => game.pieces.some(p => p.cell === cell);
const myTurn = () => game.turnId === you.id;

// Escolheu uma casa (na lupa ou arrastando no tabuleiro pequeno).
function choose(cell, recenter) {
  if (recenter) pick.center = cell;
  if (!isTaken(cell)) pick.cell = cell;
  drawPicker();
  if (myTurn()) sendHover();
}

// A TV mostra o cone "flutuando" onde o dedo aponta (no máximo ~8 por segundo).
function sendHover() {
  clearTimeout(hoverTimer);
  const wait = 120 - (Date.now() - lastHoverSent);
  if (wait > 0) {
    hoverTimer = setTimeout(sendHover, wait);
    return;
  }
  lastHoverSent = Date.now();
  socket.send({ type: 'hover', cell: pick.cell });
}

// Arrastar o dedo no tabuleiro pequeno move a lupa e escolhe a casa debaixo do dedo.
let miniDragging = false;
let miniInteractive = false;
function miniCellAt(event) {
  const rect = mini.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * COLS);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return cellAt(row, col);
}
mini.addEventListener('pointerdown', event => {
  if (!miniInteractive) return;
  miniDragging = true;
  mini.setPointerCapture(event.pointerId);
  const cell = miniCellAt(event);
  if (cell !== null) choose(cell, true);
});
mini.addEventListener('pointermove', event => {
  if (!miniDragging) return;
  const cell = miniCellAt(event);
  if (cell !== null && cell !== pick.center) choose(cell, true);
});
mini.addEventListener('pointerup', () => { miniDragging = false; });
mini.addEventListener('pointercancel', () => { miniDragging = false; });

function drawPicker() {
  const placing = game.stage === 'cones1' || game.stage === 'cones2';
  const n = game.stage === 'cones1' ? 1 : 2;
  const placed = game.pieces.some(p => p.playerId === you.id && p.n === n);
  const interactive = placing && !placed && game.cueGiverId !== you.id;
  miniInteractive = interactive;
  mini.classList.toggle('interactive', interactive);
  drawMini();
  drawZoom({ interactive });
  const button = $('cone-button');
  button.classList.toggle('hidden', !interactive);
  const ready = interactive && myTurn() && pick.cell !== null && !isTaken(pick.cell);
  button.disabled = !ready;
  if (!myTurn()) button.textContent = pick.cell === null ? 'Espere a sua vez' : `Espere a sua vez (${cellName(pick.cell)})`;
  else if (pick.cell === null) button.textContent = 'Toque numa cor abaixo';
  else button.textContent = `Pôr o ${n}º cone em ${cellName(pick.cell)}`;
}

$('cone-button').addEventListener('click', () => {
  if (pick.cell === null || !myTurn()) return;
  socket.send({ type: 'cone', cell: pick.cell });
});

// Quem dá a dica: a carta com as 4 cores; tocar escolhe a cor.
function drawCard() {
  const card = you.card ?? [];
  if (pickedTarget !== null && !card.includes(pickedTarget)) pickedTarget = null;
  $('card-pick').replaceChildren(...card.map(cell => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card-color${cell === pickedTarget ? ' chosen' : ''}`;
    const swatch = document.createElement('span');
    swatch.className = 'card-swatch';
    swatch.style.background = BOARD[cell];
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = cellName(cell);
    button.append(swatch, name);
    button.addEventListener('click', () => {
      pickedTarget = cell;
      pick.center = cell;
      render();
    });
    return button;
  }));
}

// O formulário da dica (1ª: 1 palavra; 2ª: até 2 palavras ou passar).
function drawCueForm(n) {
  const form = $('cue-form');
  if (form.dataset.n !== String(n) || form.dataset.round !== String(game.round)) {
    form.dataset.n = String(n);
    form.dataset.round = String(game.round);
    $('cue-input').value = '';
    setHidden('cue-error', true);
  }
  $('cue-input-label').textContent = n === 1 ? 'Sua dica: 1 palavra' : 'Sua 2ª dica: até 2 palavras';
  $('cue-input').placeholder = n === 1 ? 'Ex.: oceano' : 'Ex.: mar profundo';
  $('cue-pass').classList.toggle('hidden', n !== 2);
  const needsColor = n === 1 && pickedTarget === null;
  $('cue-send').disabled = needsColor;
  $('cue-spoken').disabled = needsColor;
  showEl('cue-form');
}

function cueError(text) {
  $('cue-error').textContent = text;
  setHidden('cue-error', false);
}

function sendCue({ spoken = false, pass = false } = {}) {
  const n = game.stage === 'dica1' ? 1 : 2;
  const text = $('cue-input').value;
  if (!spoken && !pass) {
    const checked = checkCue(text, n);
    if (!checked.ok) return cueError(checked.error);
  }
  setHidden('cue-error', true);
  $('cue-input').blur();
  if (n === 1) socket.send({ type: 'cue1', target: pickedTarget, text, spoken });
  else socket.send({ type: 'cue2', text, spoken, pass });
}
$('cue-form').addEventListener('submit', event => {
  event.preventDefault();
  sendCue();
});
$('cue-input').addEventListener('input', () => setHidden('cue-error', true));
$('cue-spoken').addEventListener('click', () => sendCue({ spoken: true }));
$('cue-pass').addEventListener('click', () => {
  if (confirm('Passar a 2ª dica e revelar a cor agora?')) sendCue({ pass: true });
});

// Os pontos da rodada (depois que a TV mostrou).
function drawResult() {
  const result = game.result;
  const box = $('result');
  const parts = [];
  const target = document.createElement('div');
  target.className = 'result-target';
  const swatch = document.createElement('span');
  swatch.className = 'card-swatch';
  swatch.style.background = BOARD[result.target];
  const label = document.createElement('span');
  label.textContent = `A cor era ${cellName(result.target)}`;
  target.append(swatch, label);
  parts.push(target);

  const mine = result.points[you.id] ?? 0;
  const big = document.createElement('p');
  big.className = 'result-points';
  big.textContent = mine > 0 ? `+${mine} ponto${mine > 1 ? 's' : ''}` : 'Nenhum ponto desta vez';
  parts.push(big);
  const lines = document.createElement('ul');
  lines.className = 'result-lines';
  const line = text => {
    const li = document.createElement('li');
    li.textContent = text;
    lines.append(li);
  };
  if (result.cueGiverId === you.id) {
    const inFrame = result.pieces.filter(p => p.d <= 1).length;
    line(inFrame ? `${inFrame} cone${inFrame > 1 ? 's' : ''} dentro do quadro: +${result.giverPoints}` : 'Nenhum cone dentro do quadro.');
  } else {
    const WHY = { 3: 'na cor certa!', 2: 'dentro do quadro', 1: 'encostado por fora', 0: 'longe demais' };
    for (const piece of result.pieces.filter(p => p.playerId === you.id)) {
      line(`${piece.n}º cone em ${cellName(piece.cell)}: ${WHY[piece.points]}${piece.points ? ` +${piece.points}` : ''}`);
    }
  }
  parts.push(lines);
  const score = game.players.find(p => p.id === you.id)?.score ?? 0;
  const place = [...game.players].sort((a, b) => b.score - a.score).findIndex(p => p.score === score) + 1;
  const tied = game.players.filter(p => p.score === score).length > 1;
  const total = document.createElement('p');
  total.className = 'result-total';
  total.textContent = `Você tem ${score} ponto${score === 1 ? '' : 's'} (${place}º lugar${tied ? ', empatado' : ''}).`;
  parts.push(total);
  box.replaceChildren(...parts);
  showEl('result');
}

function drawFinal() {
  const box = $('result');
  const me = game.ranking.find(r => r.id === you.id);
  const title = document.createElement('p');
  title.className = 'result-points';
  title.textContent = me?.place === 1 ? 'Você venceu! 🎉' : `Você ficou em ${me?.place ?? '?'}º lugar`;
  const list = document.createElement('ol');
  list.className = 'final-list';
  for (const row of game.ranking) {
    const info = lobby.players.find(p => p.id === row.id);
    const li = document.createElement('li');
    li.classList.toggle('me', row.id === you.id);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${row.place}º ${info?.name ?? '?'}`;
    const score = document.createElement('strong');
    score.textContent = String(row.score);
    li.append(makeAvatar(info?.color, info?.name ?? '?'), who, score);
    list.append(li);
  }
  box.replaceChildren(title, list);
  showEl('result');
}

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  $('skip-button').classList.toggle('hidden', !isLeader || !lobby.players.some(p => !p.online) || game.stage === 'fim');
  $('end-game-button').classList.toggle('hidden', !isLeader);
  $('end-game-button').textContent = game.stage === 'fim' ? 'Voltar para a sala' : 'Encerrar partida (líder)';
  visible = new Set();
  const boardBox = $('board-box');
  boardBox.classList.remove('zoom-only', 'mini-only');
  miniInteractive = false;
  mini.classList.remove('interactive');

  const giver = game.cueGiverId === you.id;
  const n = game.stage === 'cones2' || game.stage === 'dica2' ? 2 : 1;
  // Rodada nova: esquece a escolha da rodada anterior.
  if (pick.round !== game.round) pick = { cell: null, center: cellAt(7, 14), round: game.round };
  if (pick.cell !== null && isTaken(pick.cell)) pick.cell = null;

  // Vez desta pessoa: pisca, vibra e (com o 🔔) toca — uma vez por vez.
  const mineNow = (giver && (game.stage === 'dica1' || game.stage === 'dica2')) || game.turnId === you.id;
  const key = `${game.round}:${game.stage}:${game.turnId}`;
  if (mineNow && alertKey !== key) alertYourTurn();
  alertKey = mineNow ? key : null;

  const looking = Date.now() < lookUntil;
  if (looking && (game.stage === 'revelacao' || game.stage === 'fim')) {
    setBanner('Olhem a TV! 📺', 'A cor certa vai aparecer lá.');
    setHelp('');
    return finishGameRender();
  }

  switch (game.stage) {
    case 'dica1':
      if (giver) {
        setBanner('Sua vez de dar a dica!', pickedTarget === null
          ? '1. Toque numa das 4 cores da sua carta (só você vê).'
          : '2. Uma palavra que lembre essa cor (sem dizer o nome da cor).', true);
        setHelp('');
        drawCard();
        showEl('card-pick');
        if (pickedTarget !== null) {
          pick.center = pickedTarget;
          drawMini({ target: pickedTarget });
          drawZoom({ target: pickedTarget });
          showEl('board-box');
          boardBox.classList.add('zoom-only');
        }
        drawCueForm(1);
      } else {
        setBanner(`${nameOf(game.cueGiverId)} vai dar a dica`, 'Escolhendo uma cor da carta…');
        setHelp('Depois da dica, cada um põe o cone na cor que combina com ela.');
        drawMini();
        showEl('board-box');
        boardBox.classList.add('mini-only');
      }
      break;

    case 'cones1':
    case 'cones2': {
      drawCues();
      const placed = game.pieces.find(p => p.playerId === you.id && p.n === n);
      if (giver) {
        setBanner('Os outros estão pondo os cones', `Vez de ${nameOf(game.turnId)}. O quadrado branco é a sua cor.`);
        setHelp('');
        pick.center = privateTarget();
        drawMini({ target: privateTarget() });
        drawZoom({ target: privateTarget() });
        showEl('board-box');
      } else if (placed) {
        setBanner(`Cone posto em ${cellName(placed.cell)} ✓`, `Agora é a vez de ${nameOf(game.turnId)}.`);
        setHelp('');
        drawMini();
        showEl('board-box');
        boardBox.classList.add('mini-only');
      } else if (myTurn()) {
        setBanner(`Sua vez de pôr o ${n}º cone!`, 'Arraste no tabuleiro e toque na cor.', true);
        setHelp('');
        drawPicker();
        showEl('board-box', 'cone-button');
      } else {
        const position = game.order.indexOf(you.id) - game.order.indexOf(game.turnId);
        setBanner(`Vez de ${nameOf(game.turnId)} pôr o cone`, position > 0 ? `Você é o ${position + 1}º da fila — pode ir escolhendo.` : '');
        setHelp('');
        drawPicker();
        showEl('board-box', 'cone-button');
      }
      break;
    }

    case 'dica2':
      drawCues();
      if (giver) {
        setBanner('Hora da 2ª dica!', 'Até 2 palavras para puxar os cones para a sua cor — ou passe.', true);
        setHelp('');
        pick.center = privateTarget();
        drawMini({ target: privateTarget() });
        drawZoom({ target: privateTarget() });
        showEl('board-box');
        drawCueForm(2);
      } else {
        setBanner(`${nameOf(game.cueGiverId)} vai dar a 2ª dica`, 'Depois, cada um põe o 2º cone.');
        setHelp('');
        drawMini();
        showEl('board-box');
        boardBox.classList.add('mini-only');
      }
      break;

    case 'revelacao': {
      setBanner(`Fim da rodada ${game.round} de ${game.totalRounds}`, '');
      setHelp('');
      drawResult();
      const nextId = game.nextCueGiverId;
      if (nextId === you.id || isLeader) {
        $('next-button').textContent = nextId === you.id ? 'Começar a próxima rodada (você dá a dica)' : `Começar a próxima rodada (${nameOf(nextId)} dá a dica)`;
        showEl('next-button');
      } else {
        setHelp(`Esperando ${nameOf(nextId)} começar a próxima rodada.`);
      }
      break;
    }

    case 'fim':
      setBanner('Fim de jogo!', '');
      setHelp('');
      drawFinal();
      if (isLeader) showEl('again-button');
      break;

    default:
      break;
  }
  finishGameRender();
}

function finishGameRender() {
  for (const id of GAME_PARTS) setHidden(id, !visible.has(id));
  show('game');
}

// A cor escolhida de quem dá a dica (vem só no celular dele).
const privateTarget = () => you.target ?? pickedTarget;

$('next-button').addEventListener('click', () => socket.send({ type: 'nextRound', round: game.round }));
$('again-button').addEventListener('click', () => socket.send({ type: 'playAgain' }));
$('skip-button').addEventListener('click', () => {
  if (confirm('Pular quem está desconectado?')) socket.send({ type: 'skipOffline' });
});
$('end-game-button').addEventListener('click', () => {
  const question = game?.stage === 'fim' ? 'Voltar todos para a sala?' : 'Encerrar a partida e voltar todos para a sala?';
  if (confirm(question)) socket.send({ type: 'endGame' });
});

// Chamado quando passa a ser a vez DESTA pessoa: pisca, vibra e, se o 🔔 estiver
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
