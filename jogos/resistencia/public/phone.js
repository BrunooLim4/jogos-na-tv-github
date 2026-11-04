// O celular (controle): entrar, sala e a partida (ver o papel em segredo,
// montar o time, votar, escolher na missão).
import { connect, COLOR_LABELS } from './net.js';
import { makeAvatar, joinNames } from './ui.js';
import { characterLabel } from './characters.js';
import { personagem, cardImage } from './personagens.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `resistencia-token-${roomCode}`;

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
const soundKey = 'resistencia-som-celular';
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
  sub.textContent = isLeader ? `Ficha ${characterLabel(you.color).toLowerCase()} · você é o líder` : `Ficha ${characterLabel(you.color).toLowerCase()}`;
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

let lastMoment = null; // "missão:recusas:fase:comandante" do último retrato (avisar a vez só quando muda)

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Rosto do personagem (recorte redondo da carta).
function face(character, className = 'face-mini') {
  const node = el('span', className);
  if (character) node.style.backgroundImage = `url(${cardImage(character)})`;
  return node;
}

const resultCount = g => g.missions.filter(m => m.result).length;

// "Olhem a TV!": quando sai o resultado de uma missão (ou o fim), a TV faz a
// revelação com animação. O celular espera esse tempo antes de mostrar o
// resultado e a próxima jogada — senão estragava a surpresa.
const phoneView = { results: null, over: false };
let holdTimer = null;

function updateHold() {
  const results = resultCount(game);
  const over = game.stage === 'over';
  const fresh = phoneView.results === null || results < phoneView.results || (!over && phoneView.over);
  if (fresh) {
    // primeiro retrato ou partida nova: nada para esperar
    clearTimeout(holdTimer);
    holdTimer = null;
    Object.assign(phoneView, { results, over });
    return;
  }
  if (holdTimer || (results === phoneView.results && over === phoneView.over)) return;
  const newMission = results > phoneView.results ? game.missions[results - 1] : null;
  const ms = (newMission ? 5400 + 760 * newMission.team.length : 3400) + (over ? 2600 : 0);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (game) Object.assign(phoneView, { results: resultCount(game), over: game.stage === 'over' });
    render();
  }, ms);
}

let sending = false; // as cartas da missão estão na animação de "enviar"

function renderGame() {
  const isLeader = you.id === lobby.leaderId;
  const byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  const charOf = Object.fromEntries(game.players.map(p => [p.id, p.character]));
  const nameOf = id => byId[id]?.name ?? '?';
  updateHold();
  const holding = Boolean(holdTimer);
  const over = game.stage === 'over' && !holding;
  const commanding = !holding && game.stage === 'pick' && game.commanderId === you.id;
  const onTeam = game.stage === 'mission' && game.team.includes(you.id);

  // Aviso de vez: só quem passa a comandar (é a vez só dele). Votar e escolher
  // na missão são de várias pessoas ao mesmo tempo: sem som.
  if (!holding) {
    const moment = `${game.mission}:${game.rejections}:${game.stage}:${game.commanderId}`;
    if (commanding && lastMoment !== null && lastMoment !== moment) alertYourTurn();
    lastMoment = moment;
  }

  const [title, small] = holding ? holdText() : bannerText(nameOf, commanding, onTeam);
  $('turn-banner').replaceChildren(el('span', 'tb-title', title), el('small', '', small));
  $('turn-banner').classList.toggle('alert', commanding || (onTeam && you.choice === null) || (game.stage === 'vote' && you.vote === null));
  $('tab-help').textContent = holding ? '' : helpText(nameOf, commanding, onTeam);
  renderRole(byId, charOf);
  $('role-card').classList.toggle('compact', game.stage !== 'roles');

  $('roles-box').classList.toggle('hidden', game.stage !== 'roles' || game.seen.includes(you.id));
  renderPick(byId, charOf, commanding, holding);
  $('vote-box').classList.toggle('hidden', game.stage !== 'vote');
  $('vote-yes').classList.toggle('picked', you.vote === true);
  $('vote-no').classList.toggle('picked', you.vote === false);
  // Depois de escolher, as cartas viram e somem — igual para quem escolheu
  // Sucesso ou Sabotar —, e fica só "Escolha enviada".
  $('mission-box').classList.toggle('hidden', !sending && (!onTeam || you.choice !== null));
  renderOver(byId, charOf, isLeader, over);
  renderMissionsMini(holding);

  $('skip-button').classList.toggle('hidden', over || !isLeader || !lobby.players.some(p => !p.online));
  $('end-game-button').classList.toggle('hidden', !isLeader);
  $('end-game-button').textContent = over ? 'Voltar todos para a sala' : 'Encerrar partida (líder)';
  show('game');
}

function holdText() {
  return game.stage === 'over' && resultCount(game) === phoneView.results
    ? ['Olhem a TV!', 'Os papéis estão sendo revelados.']
    : ['Olhem a TV!', 'O resultado da missão está saindo.'];
}

function bannerText(nameOf, commanding, onTeam) {
  const mission = game.missions[game.mission];
  const team = joinNames(game.team.map(nameOf));
  const total = game.players.length;
  switch (game.stage) {
    case 'roles':
      return game.seen.includes(you.id)
        ? ['Esperando os outros', `Já viram o papel: ${game.seen.length} de ${total}.`]
        : ['Veja o seu papel em segredo', 'Segure a sua carta e depois toque em “Já vi meu papel”.'];
    case 'pick':
      return commanding
        ? [`Você comanda! Escolha ${mission.size} pessoas`, `Para a Missão ${game.mission + 1}. Toque nos nomes (pode se escolher).`]
        : [`${nameOf(game.commanderId)} está montando o time`, `${mission.size} pessoas para a Missão ${game.mission + 1}. Conversem!`];
    case 'vote':
      return you.vote === null
        ? ['Vote: este time vai para a missão?', team]
        : [`Você votou: ${you.vote ? 'Aprovo' : 'Recuso'}`, `Dá para trocar até todos votarem. Já votaram ${game.voted.length} de ${total}.`];
    case 'mission':
      if (!onTeam) return [`Missão ${game.mission + 1} em andamento`, `${team} estão escolhendo em segredo.`];
      return you.choice === null || sending
        ? ['Você está na missão!', 'Escolha uma carta em segredo.']
        : ['Escolha enviada ✓', `Esperando o resto do time (${game.chosen.length} de ${game.team.length}).`];
    default: {
      const mine = you.role === 'espiao' ? 'espioes' : 'resistencia';
      return [game.winner === 'resistencia' ? 'A Resistência venceu!' : 'Os espiões venceram!',
        game.winner === mine ? 'Você ganhou! 🎉' : 'Você perdeu desta vez.'];
    }
  }
}

// Uma frase curta explicando a fase (para quem nunca jogou). O mesmo texto para
// a Resistência e para os espiões.
function helpText(nameOf, commanding, onTeam) {
  switch (game.stage) {
    case 'roles':
      return 'A Resistência quer que as missões deem certo. Os espiões querem sabotar sem serem descobertos.';
    case 'pick':
      return commanding ? 'Escolha quem vai. Depois todos votam se aprovam o time.' : 'Quem comanda escolhe o time. Depois todos votam.';
    case 'vote':
      return `Mais da metade aprovando, o time vai. Times recusados seguidos: ${game.rejections} de ${game.maxRejections} (no ${game.maxRejections}º, os espiões vencem).`;
    case 'mission':
      return onTeam && (you.choice === null || sending)
        ? 'Resistência: sempre Sucesso. Espiões: podem sabotar. Ninguém vê quem escolheu o quê.'
        : 'Ninguém vê quem escolheu o quê: só quantas sabotagens houve.';
    default:
      return `Os espiões eram ${joinNames(game.spies.map(nameOf))}.`;
  }
}

// A sua carta (frente) e o papel (verso, só enquanto o dedo segura).
function renderRole(byId, charOf) {
  const mine = charOf[you.id];
  const img = $('my-card');
  if (mine && img.dataset.character !== mine) {
    img.dataset.character = mine;
    img.src = cardImage(mine);
    img.alt = personagem(mine)?.name ?? '';
  }
  const spy = you.role === 'espiao';
  const shown = $('role-shown');
  shown.dataset.role = you.role;
  const parts = [
    el('span', 'rs-kicker', 'Seu papel'),
    el('strong', 'rs-role', spy ? 'Espião' : 'Resistência'),
    el('span', 'rs-text', spy ? 'Sabote missões sem ser descoberto.' : 'Faça as missões darem certo e descubra os espiões.'),
  ];
  if (spy) {
    const others = el('span', 'rs-others');
    others.append(el('span', 'rs-others-title', you.otherSpies.length > 1 ? 'Os outros espiões' : 'O outro espião'),
      ...you.otherSpies.map(id => {
        const chip = el('span', 'spy-chip');
        chip.append(face(charOf[id]), el('span', '', byId[id]?.name ?? '?'));
        return chip;
      }));
    parts.push(others);
  }
  shown.replaceChildren(...parts);
}

const roleCard = $('role-card');
function setRoleVisible(visible) {
  roleCard.classList.toggle('open', visible);
}
roleCard.addEventListener('pointerdown', event => {
  event.preventDefault();
  roleCard.setPointerCapture?.(event.pointerId);
  setRoleVisible(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  roleCard.addEventListener(type, () => setRoleVisible(false));
}
roleCard.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('visibilitychange', () => setRoleVisible(false));

// Montar o time: quem comanda toca nos nomes; os outros veem a escolha.
function renderPick(byId, charOf, commanding, holding) {
  $('pick-box').classList.toggle('hidden', game.stage !== 'pick' || holding);
  if (game.stage !== 'pick') return;
  const size = game.missions[game.mission].size;
  $('pick-list').replaceChildren(...game.players.map(({ id }) => {
    const chosen = game.draft.includes(id);
    const button = el('button', `pick-option${chosen ? ' chosen' : ''}`);
    button.type = 'button';
    button.disabled = !commanding;
    button.setAttribute('aria-pressed', String(chosen));
    const who = el('span', 'who');
    who.append(el('strong', '', id === you.id ? `${byId[id]?.name} (você)` : byId[id]?.name ?? '?'),
      el('small', '', personagem(charOf[id])?.name ?? ''));
    button.append(face(charOf[id]), who, el('span', 'check', chosen ? '◎' : ''));
    button.addEventListener('click', () => socket.send({ type: 'pick', id }));
    const li = el('li');
    li.append(button);
    return li;
  }));
  const ready = game.draft.length === size;
  $('propose-button').classList.toggle('hidden', !commanding);
  $('propose-button').disabled = !ready;
  $('propose-button').textContent = ready ? 'Mandar para votação' : `Escolha ${size} pessoas (${game.draft.length} de ${size})`;
}

// Fim: o papel de cada um e, para o líder, jogar de novo.
function renderOver(byId, charOf, isLeader, over) {
  $('over-box').classList.toggle('hidden', !over);
  if (!over) return;
  $('role-list').replaceChildren(...game.players.map(({ id }) => {
    const spy = game.spies.includes(id);
    const li = el('li', spy ? 'spy' : '');
    li.append(face(charOf[id]), el('span', 'who', byId[id]?.name ?? '?'), el('span', 'role-tag', spy ? 'Espião' : 'Resistência'));
    return li;
  }));
  $('rematch-button').classList.toggle('hidden', !isLeader);
}

// As 5 missões em miniatura (o tabuleiro está na TV). Durante o "Olhem a TV!",
// o resultado novo ainda não aparece.
function renderMissionsMini(holding) {
  const visible = holding ? phoneView.results : resultCount(game);
  const row = el('div', 'mini-row');
  row.append(...game.missions.map((mission, i) => {
    const shown = i < visible ? mission.result : null;
    const dot = el('span', 'mini-mission', shown ? (shown === 'sucesso' ? '✓' : '✗') : String(mission.size));
    if (shown) dot.dataset.result = shown;
    dot.classList.toggle('current', !holding && game.stage !== 'over' && i === game.mission);
    return dot;
  }));
  $('missions-mini').replaceChildren(row);
}

// Escolher na missão: as duas cartas viram, trocam de lugar e descem — a mesma
// animação para Sucesso e Sabotar (quem estiver do lado não descobre nada).
function chooseMission(choice) {
  if (sending || you.choice !== null) return;
  if (choice === 'sabotar' && you.role !== 'espiao') {
    showToast('Quem é da Resistência sempre escolhe Sucesso.', true);
    return;
  }
  sending = true;
  socket.send({ type: 'mission', choice });
  const box = $('mission-box');
  box.classList.remove('sending');
  void box.offsetWidth;
  box.classList.add('sending');
  setTimeout(() => {
    sending = false;
    box.classList.remove('sending');
    render();
  }, 1500);
}

$('seen-button').addEventListener('click', () => socket.send({ type: 'seeRole' }));
$('propose-button').addEventListener('click', () => socket.send({ type: 'propose' }));
$('vote-yes').addEventListener('click', () => socket.send({ type: 'vote', approve: true }));
$('vote-no').addEventListener('click', () => socket.send({ type: 'vote', approve: false }));
$('mission-success').addEventListener('click', () => chooseMission('sucesso'));
$('mission-sabotage').addEventListener('click', () => chooseMission('sabotar'));
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
