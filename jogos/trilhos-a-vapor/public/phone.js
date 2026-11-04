import { connect, COLOR_LABELS } from './net.js';
import { CARD_LABELS, CARD_MOTTOS, CARD_TYPES, LOCOMOTIVE } from './cards.js';
import { makeCard, makeDeck, makePortrait, makeTrain, sameImage, finalRevealMs } from './ui.js';
import { CHARACTERS, characterLabel, portraitUrl, trainUrl } from './characters.js';
import { CITIES, ROUTES } from './map-usa.js';
import { ROUTE_POINTS, TICKETS } from './tickets-usa.js';
import { routeAvailability, paymentOptions, ticketPlan, bestPayment, rankRoutes, cardsMissing as missingFor } from './rules.js';
import { createMap, paintClaimedRoutes, highlightCities, focusMap } from './map-view.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);
const roomCode = (location.pathname.split('/')[2] || '').toUpperCase();
const tokenKey = `ttr-token-${roomCode}`;

const SCREENS = ['loading', 'join', 'room', 'game', 'finished', 'message'];
// Imagens reaproveitadas entre uma atualização e outra (não piscam).
const joinTrain = sameImage(makeTrain);
const othersPortrait = sameImage(makePortrait);
const finalPortrait = sameImage(makePortrait);
const TRAINS_LABEL = {
  vermelho: 'Trens vermelhos',
  azul: 'Trens azuis',
  verde: 'Trens verdes',
  amarelo: 'Trens amarelos',
  roxo: 'Trens roxos',
};
const cityName = id => CITIES[id].name;
const routeName = route => `${cityName(route.a)} – ${cityName(route.b)}`;

const nameInput = $('name-input');
const joinButton = $('join-button');
const joinError = $('join-error');
const readyButton = $('ready-button');

let lobby = null;
let game = null;
let you = null;
let selectedColor = null;
let joinPending = false;
let actionPending = false; // evita toque duplo enquanto o servidor responde
let notice = null; // aviso que fica na tela (removido da sala, sala não existe)
let lastTurnKey = null;
let lastHand = null;
let currentScreen = 'loading';
let activeTab = 'cards';

// Uma frase simples explicando cada aba (para quem nunca jogou).
const TAB_HELP = {
  cards: 'Pegue 2 cartas (da mesa ou da pilha). Junte cartas da mesma cor das rotas que você quer.',
  routes: 'Pague com cartas da cor da rota para colocar seus trens nela e ganhar pontos. Vale qualquer rota do mapa — até para atrapalhar alguém.',
  tickets: 'Bilhete = ligar duas cidades com seus trens. No fim, completo soma pontos; incompleto, tira.',
};

$('room-code').textContent = roomCode || '—';

// ---------------------------------------------------------------- som do celular
//
// PRIVACIDADE: o celular só toca o aviso de "sua vez" (todos sabem de quem é a
// vez). Nada que seja segredo seu faz barulho ou vibra — por exemplo, completar
// um bilhete só aparece na sua tela, em silêncio (quem está do lado ouviria).
const sound = createSound();
const soundKey = 'ttr-som-celular';
let phoneSoundOn = readSetting(soundKey) !== 'off';
window.addEventListener('pointerdown', () => sound.unlock()); // iPhone: som só depois de um toque
function updatePhoneSoundButton() {
  $('phone-sound').textContent = phoneSoundOn ? '🔔' : '🔕';
  $('phone-sound').setAttribute('aria-label', phoneSoundOn ? 'Som do celular ligado' : 'Som do celular desligado');
}
$('phone-sound').addEventListener('click', () => {
  phoneSoundOn = !phoneSoundOn;
  writeSetting(soundKey, phoneSoundOn ? 'on' : 'off');
  updatePhoneSoundButton();
  showToast(phoneSoundOn ? 'Aviso de "sua vez" com som' : 'Celular em silêncio');
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
      actionPending = false;
      break;
    case 'welcome':
      saveToken(msg.token);
      return;
    case 'note':
      showToast(msg.text, msg.card);
      return;
    case 'left':
      saveToken(null);
      return;
    case 'kicked':
      saveToken(null);
      notice = {
        title: 'Você saiu da sala',
        text: 'O líder removeu você da partida.',
        button: 'Entrar de novo',
        action: () => { notice = null; render(); },
      };
      break;
    case 'error':
      joinPending = false;
      actionPending = false;
      handleError(msg);
      break;
    default:
      return;
  }
  render();
}

function handleError({ code, message }) {
  if (code === 'sala_inexistente') {
    saveToken(null);
    notice = { title: 'Sala não encontrada', text: message, button: 'Tentar de novo', action: () => location.reload() };
  } else if (currentScreen === 'join') {
    joinError.textContent = message;
    joinError.classList.remove('hidden');
  } else {
    showToast(message, null, true);
  }
}

// ---------------------------------------------------------------- telas

function show(screen) {
  currentScreen = screen;
  for (const name of SCREENS) $(`screen-${name}`).classList.toggle('hidden', name !== screen);
  if (screen !== 'game') {
    closeSheet('tickets-sheet');
    closeSheet('pay-sheet');
    closeSheet('map-sheet');
  }
}

function render() {
  if (notice) return renderNotice(notice);
  if (!lobby) return show('loading');
  updateTvSoundButtons();

  if (you) {
    if (lobby.phase === 'playing' && game) {
      if (game.stage !== 'finished') sawPlaying = true;
      return game.stage === 'finished' ? renderFinished() : renderGame();
    }
    lastTurnKey = null;
    lastHand = null;
    lastDoneTickets = null;
    return renderRoom();
  }

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
  if (!selectedColor || taken.has(selectedColor)) {
    selectedColor = lobby.colors.find(color => !taken.has(color)) ?? null;
  }

  $('colors').replaceChildren(...lobby.colors.map(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-option';
    button.dataset.color = color;
    button.disabled = taken.has(color);
    button.setAttribute('aria-pressed', String(color === selectedColor));
    button.setAttribute('aria-label', `${characterLabel(color)}, ${COLOR_LABELS[color].toLowerCase()}${taken.has(color) ? ' (ocupado)' : ''}`);
    const face = document.createElement('img');
    face.src = portraitUrl(color);
    face.alt = '';
    button.append(face);
    button.addEventListener('click', () => {
      selectedColor = color;
      render();
    });
    return button;
  }));

  // Cartão do personagem escolhido: quem é e a cor dos trens dele.
  const card = $('character-card');
  card.dataset.color = selectedColor ?? '';
  if (selectedColor) {
    const title = document.createElement('strong');
    title.textContent = characterLabel(selectedColor);
    const text = document.createElement('span');
    text.textContent = `${TRAINS_LABEL[selectedColor]} · ${CHARACTERS[selectedColor].tagline}`;
    card.replaceChildren(joinTrain(selectedColor), title, text);
  } else {
    const text = document.createElement('span');
    text.textContent = 'Todos os personagens já foram escolhidos.';
    card.replaceChildren(text);
  }
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
  joinError.classList.add('hidden');
  updateJoinButton();
  nameInput.blur();
  socket.send({ type: 'join', name: nameInput.value, color: selectedColor });
});

// ---------------------------------------------------------------- sala

function renderRoom() {
  const isLeader = you.id === lobby.leaderId;
  const leader = lobby.players.find(p => p.id === lobby.leaderId);

  $('me-card').dataset.color = you.color;
  setImage($('me-portrait'), portraitUrl(you.color), characterLabel(you.color));
  setImage($('me-train'), trainUrl(you.color), '');
  $('me-name').textContent = isLeader ? `${you.name} 👑` : you.name;
  $('me-color').textContent = isLeader
    ? `${characterLabel(you.color)} · você é o líder`
    : `${characterLabel(you.color)} · ${TRAINS_LABEL[you.color].toLowerCase()}`;

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
  const list = $('others-list');
  if (!others.length) {
    const li = document.createElement('li');
    li.textContent = 'Esperando os outros jogadores…';
    list.replaceChildren(li);
  } else {
    list.replaceChildren(...others.map(player => {
      const li = document.createElement('li');
      li.dataset.color = player.color;
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = player.id === lobby.leaderId ? `${player.name} 👑` : player.name;
      li.append(othersPortrait(player.color), who, statusOf(player));
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
  }
  show('room');
}

function statusOf(player) {
  const status = document.createElement('span');
  if (!player.online) {
    status.className = 'status offline';
    status.textContent = 'offline';
  } else if (player.ready) {
    status.className = 'status ready';
    status.textContent = 'pronto';
  } else {
    status.className = 'status waiting';
    status.textContent = 'se preparando';
  }
  return status;
}

function waitingText() {
  const { players, minPlayers } = lobby;
  if (players.length < minPlayers) return `Precisa de pelo menos ${minPlayers} jogadores.`;
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  const notReady = players.filter(p => !p.ready).map(p => p.name);
  return `Esperando: ${notReady.join(', ')}.`;
}

readyButton.addEventListener('click', () => {
  if (you) socket.send({ type: 'ready', ready: !you.ready });
});
$('start-button').addEventListener('click', () => socket.send({ type: 'start' }));
$('leave-button').addEventListener('click', () => socket.send({ type: 'leave' }));

// ---------------------------------------------------------------- partida

const isOnline = id => lobby.players.find(p => p.id === id)?.online ?? false;
const myStats = () => game.players.find(p => p.id === you.id);

function claimedColors() {
  const colors = {};
  for (const [routeId, playerId] of Object.entries(game.claimed)) {
    colors[routeId] = lobby.players.find(p => p.id === playerId)?.color;
  }
  return colors;
}

function renderGame() {
  const myTurn = game.stage === 'turns' && game.turnPlayerId === you.id;
  const isLeader = you.id === lobby.leaderId;
  const current = lobby.players.find(p => p.id === game.turnPlayerId);
  const secondCard = game.cardsDrawn > 0;

  // Aviso de "sua vez" (pisca a tela; no Android também vibra).
  const turnKey = `${game.stage}:${game.turnNumber}`;
  if (myTurn && lastTurnKey !== null && lastTurnKey !== turnKey) alertYourTurn();
  lastTurnKey = turnKey;

  renderBanner(myTurn, current, secondCard);
  const stats = myStats();
  $('my-stats').replaceChildren(
    chip(`🚃 ${stats.trains} trens`),
    chip(`⭐ ${stats.score} pts`),
    chip(`🎫 ${you.tickets.length} ${you.tickets.length === 1 ? 'bilhete' : 'bilhetes'}`),
  );

  // Abas: depois de pegar a 1ª carta, a vez fica presa em "Cartas".
  const locked = myTurn && secondCard;
  if (locked) activeTab = 'cards';
  for (const tab of $('tabs').children) {
    const selected = tab.dataset.tab === activeTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.disabled = locked && tab.dataset.tab !== 'cards';
  }
  for (const name of ['cards', 'routes', 'tickets']) {
    $(`panel-${name}`).classList.toggle('hidden', name !== activeTab);
  }
  $('tab-help').textContent = TAB_HELP[activeTab];

  renderFaceUp(myTurn, secondCard);
  renderRoutes(myTurn && !secondCard);
  const canDrawTickets = myTurn && !secondCard && game.ticketDeckCount > 0 && !actionPending;
  $('draw-tickets-button').disabled = !canDrawTickets;
  $('tickets-hint').textContent = game.ticketDeckCount
    ? `Você recebe 3 e fica com pelo menos 1. Isso ocupa a sua vez. (${game.ticketDeckCount} na pilha)`
    : 'Acabaram os bilhetes de destino.';

  renderMyTickets();
  renderHand();

  const blocking = (game.stage === 'tickets' && game.players.some(p => p.choosingTickets && !isOnline(p.id)))
    || (game.stage === 'turns' && !isOnline(game.turnPlayerId));
  $('skip-button').classList.toggle('hidden', !(isLeader && blocking));
  $('end-game-button').classList.toggle('hidden', !isLeader);

  renderTicketChoice();
  if (payRoute && !routeStillPayable(payRoute)) closeSheet('pay-sheet');
  if (!$('pick-sheet').classList.contains('hidden')) refreshPicker();
  show('game');
}

function renderBanner(myTurn, current, secondCard) {
  const banner = $('turn-banner');
  banner.classList.toggle('mine', myTurn || Boolean(you.pending));
  const color = game.stage === 'tickets' ? you.color : current?.color ?? you.color;
  banner.dataset.color = color;
  // O retrato fica o mesmo nó (só troca a imagem), para não piscar a cada atualização.
  const portrait = banner.querySelector('.portrait') ?? makePortrait(color);
  setImage(portrait, portraitUrl(color), characterLabel(color));
  const text = document.createElement('span');
  text.className = 'turn-text';
  const small = document.createElement('small');
  let title;
  if (game.stage === 'tickets') {
    title = you.pending ? 'Escolha seus bilhetes!' : 'Esperando os outros escolherem…';
    small.textContent = 'Bilhete = ligar duas cidades com seus trens até o fim do jogo';
  } else if (myTurn) {
    title = game.lastRound ? 'Sua ÚLTIMA vez!' : 'Sua vez!';
    small.textContent = secondCard
      ? 'Pegue mais 1 carta'
      : 'Escolha UMA: pegar cartas, colocar trens ou pegar bilhetes';
  } else {
    title = `Vez de ${current?.name ?? '…'}`;
    small.textContent = game.lastRound ? 'Última rodada!' : 'Enquanto isso, planeje suas rotas';
  }
  text.append(title, small);
  banner.replaceChildren(portrait, text);
}

// Troca a imagem só quando ela muda (evita recarregar e piscar).
function setImage(img, src, alt) {
  if (img.getAttribute('src') !== src) img.src = src;
  img.alt = alt;
}

function chip(text) {
  const span = document.createElement('span');
  span.className = 'stat-chip';
  span.textContent = text;
  return span;
}

for (const tab of $('tabs').children) {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    render();
  });
}

// ---- aba Cartas

function renderFaceUp(myTurn, secondCard) {
  $('draw-count').textContent = myTurn ? `${game.cardsDrawn}/${game.cardsPerTurn}` : '';
  const faceUpButtons = game.faceUp.map((card, index) => {
    const button = makeCard(card, { tag: 'button' });
    button.disabled = !myTurn || actionPending || !card || (card === LOCOMOTIVE && secondCard);
    button.addEventListener('click', () => sendAction({ type: 'drawFaceUp', index }));
    return button;
  });
  const deckButton = makeDeck(game.deckCount, { tag: 'button' });
  deckButton.disabled = !myTurn || actionPending || game.deckCount + game.discardCount === 0;
  deckButton.addEventListener('click', () => sendAction({ type: 'drawDeck' }));
  $('phone-faceup').replaceChildren(...faceUpButtons, deckButton);

  $('pick-hint').textContent = !myTurn
    ? 'Na sua vez: 2 cartas (da mesa ou da pilha).'
    : secondCard
      ? 'A 2ª carta não pode ser o coringa da mesa.'
      : 'Coringa da mesa vale a vez inteira.';
}

// ---- aba Colocar trens
//
// Feita para quem nunca jogou: só aparecem as rotas que dá para pagar AGORA,
// cada uma como um cartão (vagõezinhos na cor da rota, cidades e pontos), e o
// pagamento já vem escolhido. Antes de confirmar, um mapa mostra onde fica.

// Cartas no plural, para as dicas ("cartas amarelas").
const CARDS_PLURAL = {
  roxo: 'roxas',
  branco: 'brancas',
  azul: 'azuis',
  amarelo: 'amarelas',
  laranja: 'laranja',
  preto: 'pretas',
  vermelho: 'vermelhas',
  verde: 'verdes',
};

// Quantas cartas faltam para pagar a rota (contando os coringas).
const cardsMissing = route => missingFor(route, you.hand);

function routeStillPayable(route) {
  return routeAvailability(route, game.claimed, you.id, game.players.length).ok
    && paymentOptions(route, you.hand).length > 0
    && myStats().trains >= route.length;
}

// Cores que você está juntando para os seus bilhetes (o pagamento automático evita gastá-las).
function colorsToKeep() {
  const keep = new Set();
  for (const ticket of you.tickets) {
    if (ticket.done) continue;
    for (const route of ticketPlan(ticket, game.claimed, you.id, game.players.length).steps) {
      if (route.color !== 'cinza') keep.add(route.color);
    }
  }
  return keep;
}

// "Junte 4 cartas amarelas" — o que falta para uma rota.
function collectText(route) {
  const missing = cardsMissing(route);
  if (!missing) return 'dá para colocar trens agora!';
  const cards = missing === 1 ? 'carta' : 'cartas';
  return route.color === 'cinza'
    ? `junte mais ${missing} ${cards} de uma mesma cor`
    : `junte mais ${missing} ${cards} ${missing === 1 ? CARD_LABELS[route.color].toLowerCase() : CARDS_PLURAL[route.color]}`;
}

// Os vagõezinhos desenhados na cor da rota: mostra o tamanho sem precisar ler.
function carRow(route) {
  const row = document.createElement('span');
  row.className = 'car-row';
  row.dataset.card = route.color;
  for (let i = 0; i < route.length; i++) row.append(document.createElement('i'));
  return row;
}

function cardCount(card, count) {
  const wrap = document.createElement('span');
  wrap.className = 'card-count';
  const number = document.createElement('b');
  number.textContent = `${count}×`;
  wrap.append(number, makeCard(card, { label: false }));
  return wrap;
}

// "Você paga" em figurinhas: 3× [laranja] + 1× [locomotiva]
function payChips(option) {
  const wrap = document.createElement('span');
  wrap.className = 'pay-chips';
  if (option.count) wrap.append(cardCount(option.color, option.count));
  if (option.locomotives) wrap.append(cardCount(LOCOMOTIVE, option.locomotives));
  return wrap;
}

let routesCanAct = false;
let routesAllOpen = false;

// A lista de rotas que dá para pagar agora, já com nota (rankRoutes, em rules.js):
// as melhores jogadas em cima, com o motivo; todas as outras logo abaixo, numa
// lista que abre ao tocar. E o botão do mapa deixa escolher QUALQUER rota.
function renderRoutes(canAct) {
  routesCanAct = canAct;
  const ranked = rankRoutes({
    hand: you.hand,
    tickets: you.tickets,
    claimed: game.claimed,
    playerId: you.id,
    playerCount: game.players.length,
    trains: myStats().trains,
    colorsToKeep: colorsToKeep(),
  });

  const box = $('route-groups');
  if (!ranked.length) {
    box.replaceChildren(emptyRoutesMessage('Ainda não dá para pagar nenhuma rota.'));
    return;
  }
  // Só vira sugestão o que vale a pena (gastar coringa numa rota de 1 ponto, não).
  const helpful = ranked.filter(x => x.helps.length && x.score > 0);
  const top = helpful.length
    ? helpful.slice(0, 4)
    : ranked.filter(x => x.payment.locomotives === 0 && x.score > 0).slice(0, 3);
  const rest = ranked.filter(x => !top.includes(x));
  const groups = [];
  if (helpful.length) groups.push(routeGroup('⭐ Melhores jogadas agora', top, canAct));
  else if (top.length) {
    groups.push(routeGroup('⭐ Mais pontos agora', top, canAct, 'Nenhuma rota que dá para pagar agora ajuda os seus bilhetes.'));
  } else groups.push(emptyRoutesMessage('Nenhuma jogada boa de trens agora.'));
  if (rest.length) {
    const all = document.createElement('details');
    all.className = 'route-all';
    all.open = routesAllOpen;
    all.addEventListener('toggle', () => { routesAllOpen = all.open; });
    const summary = document.createElement('summary');
    summary.textContent = `Todas as outras que você consegue pagar (${rest.length})`;
    const list = document.createElement('div');
    list.className = 'route-cards';
    list.append(...rest.map(item => routeCard(item, canAct)));
    all.append(summary, list);
    groups.push(all);
  }
  box.replaceChildren(...groups);
}

function routeGroup(title, items, canAct, note = null) {
  const section = document.createElement('section');
  section.className = 'route-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);
  if (note) {
    const p = document.createElement('p');
    p.className = 'route-group-note';
    p.textContent = note;
    section.append(p);
  }
  const list = document.createElement('div');
  list.className = 'route-cards';
  list.append(...items.map(item => routeCard(item, canAct)));
  section.append(list);
  return section;
}

// Uma frase curta dizendo por que a rota é boa (só no seu celular).
function routeReason(helps) {
  if (!helps.length) return '';
  const name = h => `${cityName(h.ticket.a)} → ${cityName(h.ticket.b)}`;
  const done = helps.find(h => h.completes);
  if (done) return `✓ Completa o bilhete ${name(done)}!`;
  if (helps.length === 1) return `Ajuda o bilhete ${name(helps[0])}`;
  return `Ajuda ${helps.length} bilhetes seus`;
}

function routeCard({ route, payment, helps }, canAct) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `route-card${helps.length ? ' helps' : ''}`;

  const cities = document.createElement('span');
  cities.className = 'route-cities';
  cities.textContent = `${cityName(route.a)} → ${cityName(route.b)}`;
  const points = document.createElement('span');
  points.className = 'route-points';
  points.textContent = `+${ROUTE_POINTS[route.length]}`;
  const pay = document.createElement('span');
  pay.className = 'route-pay';
  pay.append(carRow(route));
  if (route.color === 'cinza') {
    const any = document.createElement('span');
    any.className = 'any-color';
    any.textContent = 'qualquer cor';
    pay.append(any);
  }
  pay.append(payChips(payment));
  button.append(cities, points, pay);

  const reason = routeReason(helps);
  if (reason) {
    const why = document.createElement('span');
    why.className = `route-why${helps.some(h => h.completes) ? ' completes' : ''}`;
    why.textContent = reason;
    button.append(why);
  }
  button.addEventListener('click', () => {
    if (!canAct) {
      return showToast(game.turnPlayerId === you.id ? 'Você já começou a pegar cartas nesta vez.' : 'Espere a sua vez.', null, true);
    }
    openPay(route);
  });
  return button;
}

// ---- escolher qualquer rota tocando no mapa (inclusive para atrapalhar alguém)

const ROUTE_BY_ID = Object.fromEntries(ROUTES.map(r => [r.id, r]));
let pickRouteId = null;
let pickSvg = null;

function openPicker() {
  pickRouteId = null;
  pickSvg = createMap();
  pickSvg.classList.add('pick-mode');
  pickSvg.addEventListener('click', event => {
    const id = nearestRoute(pickSvg, event);
    if (id) {
      pickRouteId = id;
      refreshPicker();
    }
  });
  $('pick-map').replaceChildren(pickSvg);
  refreshPicker();
  openSheet('pick-sheet');
  // começa mostrando o meio do mapa
  requestAnimationFrame(() => {
    const box = $('pick-map');
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  });
}
$('pick-open').addEventListener('click', openPicker);
$('pick-close').addEventListener('click', () => closeSheet('pick-sheet'));

// A rota mais perto do toque (pelo vagão mais próximo).
function nearestRoute(svg, event) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  let best = null;
  for (const group of svg.querySelectorAll('.route')) {
    for (const car of group.querySelectorAll('.car')) {
      const m = car.transform.baseVal.consolidate()?.matrix;
      if (!m) continue;
      const d = Math.hypot(m.e - point.x, m.f - point.y);
      if (!best || d < best.d) best = { id: group.dataset.route, d };
    }
  }
  return best && best.d < 34 ? best.id : null;
}

// Repinta o mapa do "escolher": trens de todos, rotas que dá para pagar e a escolhida.
function refreshPicker() {
  if (!pickSvg) return;
  paintClaimedRoutes(pickSvg, claimedColors(), { animate: false });
  for (const group of pickSvg.querySelectorAll('.route')) {
    const route = ROUTE_BY_ID[group.dataset.route];
    group.classList.toggle('payable', !game.claimed[route.id] && routeStillPayable(route));
    group.classList.toggle('picked', route.id === pickRouteId);
  }
  const info = $('pick-info');
  const confirm = $('pick-confirm');
  const route = pickRouteId ? ROUTE_BY_ID[pickRouteId] : null;
  confirm.disabled = true;
  if (!route) {
    info.replaceChildren();
    confirm.textContent = 'Escolha uma rota';
    return;
  }
  const title = document.createElement('strong');
  title.textContent = `${cityName(route.a)} → ${cityName(route.b)}`;
  const line = document.createElement('span');
  line.className = 'pick-line';
  line.append(carRow(route), ` +${ROUTE_POINTS[route.length]} pontos`);
  const status = document.createElement('span');
  status.className = 'pick-status';
  const owner = game.claimed[route.id];
  const availability = routeAvailability(route, game.claimed, you.id, game.players.length);
  if (owner) {
    const player = lobby.players.find(p => p.id === owner);
    status.textContent = owner === you.id ? 'Essa rota já é sua.' : `Essa rota já é de ${player?.name ?? 'outro jogador'}.`;
  } else if (!availability.ok) {
    status.textContent = availability.reason;
  } else if (myStats().trains < route.length) {
    status.textContent = `Você só tem ${myStats().trains} trens.`;
  } else if (!paymentOptions(route, you.hand).length) {
    status.textContent = `Ainda não dá: ${collectText(route)}.`;
  } else {
    status.className = 'pick-status ok';
    status.textContent = 'Você consegue pagar esta rota agora!';
    confirm.disabled = false;
  }
  info.replaceChildren(title, line, status);
  if (confirm.disabled) {
    confirm.textContent = 'Não dá para colocar aqui agora';
  } else if (!routesCanAct) {
    confirm.disabled = true;
    confirm.textContent = game.turnPlayerId === you.id ? 'Você já começou a pegar cartas' : 'Espere a sua vez';
  } else {
    confirm.textContent = `Colocar ${route.length} ${route.length === 1 ? 'trem' : 'trens'} aqui`;
  }
}
$('pick-confirm').addEventListener('click', () => {
  const route = pickRouteId ? ROUTE_BY_ID[pickRouteId] : null;
  if (!route || !routesCanAct || !routeStillPayable(route)) return;
  closeSheet('pick-sheet');
  openPay(route);
});

// Nenhuma rota dá para pagar: explica o que fazer, com uma dica do bilhete.
function emptyRoutesMessage(heading) {
  const box = document.createElement('div');
  box.className = 'route-empty';
  const title = document.createElement('strong');
  title.textContent = heading;
  const text = document.createElement('p');
  text.textContent = 'Vá em 🃏 Pegar cartas e junte cartas da mesma cor da rota que você quer.';
  box.append(title, text);
  const tip = nextTicketTip();
  if (tip) {
    const hint = document.createElement('p');
    hint.className = 'route-tip';
    hint.textContent = `Dica: ${tip}`;
    box.append(hint);
  }
  return box;
}

// O próximo passo mais fácil entre os seus bilhetes.
function nextTicketTip() {
  let best = null;
  for (const ticket of you.tickets) {
    if (ticket.done) continue;
    const plan = ticketPlan(ticket, game.claimed, you.id, game.players.length);
    for (const route of plan.steps) {
      const missing = cardsMissing(route);
      if (!best || missing < best.missing) best = { ticket, route, missing };
    }
  }
  if (!best) return null;
  return `para o bilhete ${cityName(best.ticket.a)} → ${cityName(best.ticket.b)}, ${collectText(best.route)} (rota ${cityName(best.route.a)} → ${cityName(best.route.b)}).`;
}

// ---- confirmar: mapa com zoom na rota + como vai pagar

let payRoute = null;
let payOptions = [];
let paySelected = 0;

function openPay(route) {
  payRoute = route;
  payOptions = paymentOptions(route, you.hand);
  paySelected = Math.max(payOptions.indexOf(bestPayment(payOptions, you.hand, colorsToKeep())), 0);
  $('pay-route').textContent = `${cityName(route.a)} → ${cityName(route.b)}`;
  const map = createMap();
  paintClaimedRoutes(map, claimedColors(), { animate: false });
  focusMap(map, { routeIds: [route.id] });
  $('pay-map').replaceChildren(map);
  renderPay();
  openSheet('pay-sheet');
}

function renderPay() {
  const option = payOptions[paySelected];
  const points = ROUTE_POINTS[payRoute.length];
  $('pay-cards').replaceChildren(payChips(option));
  $('pay-gain').textContent = `+${points} ${points === 1 ? 'ponto' : 'pontos'}`;

  // Outras formas de pagar (só se existirem), como botões simples.
  const others = payOptions.map((o, i) => ({ o, i })).filter(x => x.i !== paySelected).slice(0, 4);
  const box = $('pay-alternatives');
  box.replaceChildren();
  if (others.length) {
    const label = document.createElement('span');
    label.className = 'pay-caption';
    label.textContent = 'Ou pagar com:';
    box.append(label, ...others.map(({ o, i }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pay-alt';
      button.append(payChips(o));
      button.addEventListener('click', () => {
        paySelected = i;
        renderPay();
      });
      return button;
    }));
  }
  const n = payRoute.length;
  $('pay-confirm').textContent = `Colocar ${n} ${n === 1 ? 'trem' : 'trens'}`;
}

$('pay-confirm').addEventListener('click', () => {
  const option = payOptions[paySelected];
  if (!payRoute || !option) return;
  sendAction({
    type: 'claimRoute',
    routeId: payRoute.id,
    color: option.color === LOCOMOTIVE ? null : option.color,
    locomotives: option.locomotives,
  });
  closeSheet('pay-sheet');
});
$('pay-cancel').addEventListener('click', () => closeSheet('pay-sheet'));

// ---- aba Bilhetes

$('draw-tickets-button').addEventListener('click', () => sendAction({ type: 'drawTickets' }));

// Bilhetes que já estavam completos no retrato anterior (para notar os novos).
let lastDoneTickets = null;

function renderMyTickets() {
  const list = $('my-tickets');
  const done = you.tickets.filter(t => t.done).length;
  // Bilhete que acabou de ficar completo: brilha e avisa por escrito, SEM som e
  // SEM vibrar — quem está do lado não pode ficar sabendo.
  const nowDone = new Set(you.tickets.filter(t => t.done).map(t => t.id));
  const justDone = lastDoneTickets ? [...nowDone].filter(id => !lastDoneTickets.has(id)) : [];
  lastDoneTickets = nowDone;
  for (const id of justDone) {
    const t = you.tickets.find(x => x.id === id);
    showToast(`✓ Bilhete completo: ${cityName(t.a)} → ${cityName(t.b)}`);
  }

  $('tickets-total').textContent = you.tickets.length ? `${done} de ${you.tickets.length} completos` : '';
  if (!you.tickets.length) {
    const li = document.createElement('li');
    li.className = 'route-empty';
    li.textContent = game.stage === 'tickets' ? 'Escolha seus bilhetes na janela que abriu.' : 'Nenhum bilhete.';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...you.tickets.map(ticket => {
    const li = document.createElement('li');
    if (justDone.includes(ticket.id)) li.classList.add('just-done');
    const button = ticketCard(ticket, {
      tag: 'button',
      state: ticket.done ? 'done' : 'open',
      status: ticketStatusText(ticket),
    });
    button.addEventListener('click', () => openTicketMap(ticket));
    li.append(button);
    return li;
  }));
}

// Um bilhete com cara de passagem de trem: cabeçalho com número de série, as
// cidades, o que falta, e o canhoto picotado com os pontos — vermelho enquanto
// falta (se acabar assim, perde os pontos) e verde quando completa (ganha).
// state: 'open' (falta), 'done' (completo) ou 'missed' (fim de jogo, não fez).
function ticketCard(ticket, { tag = 'div', state = 'open', status = '', pointsText = String(ticket.points) } = {}) {
  const node = document.createElement(tag);
  if (tag === 'button') node.type = 'button';
  node.className = `ticket-item ${state}`;

  const body = textNode('span', 'ticket-body');
  const head = textNode('span', 'ticket-head');
  head.append(textNode('span', '', 'Bilhete de destino'), textNode('span', 'ticket-serial', `Nº ${ticketSerial(ticket)}`));
  body.append(head, textNode('span', 'ticket-name', `${cityName(ticket.a)} → ${cityName(ticket.b)}`));
  if (status) body.append(textNode('small', 'ticket-next', status));
  if (state !== 'open') body.append(textNode('span', 'ticket-stamp', state === 'done' ? 'Completo' : 'Incompleto'));

  const stub = textNode('span', 'ticket-stub');
  stub.append(textNode('span', 'ticket-points', pointsText), textNode('span', 'ticket-caption', 'pontos'));
  node.append(body, stub);
  return node;
}

// Número de série "de mentira", sempre o mesmo para cada bilhete.
function ticketSerial(ticket) {
  const index = Math.max(0, TICKETS.findIndex(t => t.id === ticket.id));
  return String(1000 + ((index + 7) * 2741) % 9000);
}

function textNode(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Uma linha curta embaixo de cada bilhete: o que falta.
function ticketStatusText(ticket) {
  if (ticket.done) return 'Toque para ver no mapa.';
  const plan = ticketPlan(ticket, game.claimed, you.id, game.players.length);
  if (plan.blocked) return '⚠️ Caminho fechado por outros trens';
  const easiest = [...plan.steps].sort((x, y) => cardsMissing(x) - cardsMissing(y))[0];
  const routes = plan.steps.length === 1 ? 'Falta 1 rota' : `Faltam ${plan.steps.length} rotas`;
  return `${routes} · próxima: ${cityName(easiest.a)} → ${cityName(easiest.b)}, ${collectText(easiest)}`;
}

function miniMap(cities) {
  const svg = createMap({ mini: true });
  paintClaimedRoutes(svg, claimedColors(), { animate: false });
  highlightCities(svg, cities);
  return svg;
}

// Toque num bilhete: mapa com zoom no caminho sugerido.
function openTicketMap(ticket) {
  const plan = ticketPlan(ticket, game.claimed, you.id, game.players.length);
  $('map-title').textContent = `${cityName(ticket.a)} → ${cityName(ticket.b)} · ${ticket.points} pts`;
  const map = createMap();
  paintClaimedRoutes(map, claimedColors(), { animate: false });
  focusMap(map, { routeIds: plan.steps.map(r => r.id), cityIds: [ticket.a, ticket.b] });
  $('sheet-map').replaceChildren(map);
  $('map-hint').textContent = ticket.done
    ? 'Completo! Seus trens já ligam as duas cidades.'
    : plan.blocked
      ? 'Outros jogadores fecharam o caminho. Se não completar, o bilhete tira pontos no fim.'
      : `Caminho sugerido (piscando): ${plan.steps.length} ${plan.steps.length === 1 ? 'rota' : 'rotas'}, ${plan.steps.reduce((s, r) => s + r.length, 0)} trens.`;
  openSheet('map-sheet');
}
$('map-close').addEventListener('click', () => closeSheet('map-sheet'));

// ---- escolher bilhetes (começo da partida ou quando pega novos)

let offerKey = null;
let keepSet = new Set();

function renderTicketChoice() {
  const pending = you.pending;
  if (!pending) {
    offerKey = null;
    closeSheet('tickets-sheet');
    return;
  }
  const key = pending.offered.map(t => t.id).join('|');
  if (key !== offerKey) {
    offerKey = key;
    keepSet = new Set(pending.offered.map(t => t.id)); // começa com todos marcados
    $('ticket-choices').replaceChildren(...pending.offered.map(ticket => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ticket-choice';
      button.dataset.ticket = ticket.id;
      const map = document.createElement('span');
      map.className = 'ticket-map';
      map.append(miniMap([ticket.a, ticket.b]));
      const info = document.createElement('span');
      info.className = 'ticket-info';
      const name = document.createElement('strong');
      name.textContent = `${cityName(ticket.a)} → ${cityName(ticket.b)}`;
      const points = document.createElement('span');
      points.className = 'ticket-points';
      points.textContent = `${ticket.points} pts`;
      info.append(name, points);
      button.append(map, info);
      button.addEventListener('click', () => {
        if (keepSet.has(ticket.id)) keepSet.delete(ticket.id);
        else keepSet.add(ticket.id);
        updateTicketChoice();
      });
      return button;
    }));
  }
  $('tickets-sheet-title').textContent = game.stage === 'tickets' ? 'Seus bilhetes de destino' : 'Bilhetes novos';
  $('tickets-sheet-hint').textContent =
    `Toque para marcar ou desmarcar. Fique com pelo menos ${pending.minKeep}. No fim do jogo, bilhete completo soma os pontos; incompleto, tira.`;
  updateTicketChoice();
  openSheet('tickets-sheet');
}

function updateTicketChoice() {
  for (const button of $('ticket-choices').children) {
    button.setAttribute('aria-pressed', String(keepSet.has(button.dataset.ticket)));
  }
  const n = keepSet.size;
  const confirmButton = $('tickets-confirm');
  confirmButton.disabled = actionPending || n < (you.pending?.minKeep ?? 1);
  confirmButton.textContent = n ? `Ficar com ${n} ${n > 1 ? 'bilhetes' : 'bilhete'}` : 'Marque pelo menos um';
}

$('tickets-confirm').addEventListener('click', () => {
  if (!you?.pending) return;
  sendAction({ type: 'chooseTickets', keep: [...keepSet] });
});

// ---- mão

function renderHand() {
  const hand = you.hand ?? {};
  const total = Object.values(hand).reduce((sum, n) => sum + n, 0);
  $('hand-total').textContent = `${total} ${total === 1 ? 'carta' : 'cartas'}`;
  $('hand').replaceChildren(...CARD_TYPES.map(type => {
    const count = hand[type] ?? 0;
    const tile = document.createElement('div');
    tile.className = 'hand-tile';
    tile.title = CARD_LABELS[type];
    if (!count) tile.classList.add('zero');
    if (lastHand && count > (lastHand[type] ?? 0)) tile.classList.add('bump');
    const number = document.createElement('span');
    number.className = 'count';
    number.textContent = count;
    tile.append(makeCard(type, { label: false }), number);
    return tile;
  }));
  lastHand = { ...hand };
}

// ---- líder

$('skip-button').addEventListener('click', () => {
  if (confirm('Pular quem está desconectado? (Se estava escolhendo bilhetes, fica com todos.)')) {
    socket.send({ type: 'skipOffline' });
  }
});
$('end-game-button').addEventListener('click', () => {
  if (confirm('Encerrar a partida e voltar todos para a sala?')) socket.send({ type: 'endGame' });
});

function sendAction(action) {
  if (actionPending) return;
  actionPending = true;
  render();
  socket.send(action);
}

function alertYourTurn() {
  document.body.classList.remove('your-turn-flash');
  void document.body.offsetWidth; // reinicia a animação
  document.body.classList.add('your-turn-flash');
  navigator.vibrate?.([120, 60, 120]); // (Android; o iPhone não vibra pelo navegador)
  if (phoneSoundOn) sound.play('yourTurn');
}

// ---------------------------------------------------------------- fim de jogo

// "Olhem a TV!" (padrão Resistência): a TV faz a contagem final com suspense
// (bilhetes virando, medalha, coroa); o celular espera o mesmo tempo antes de
// mostrar o resultado — senão quem olha o celular já sabe quem venceu.
let sawPlaying = false; // viu a partida rolando (abriu agora, depois do fim: mostra direto)
const finishHold = { key: null, until: 0 };

function renderFinished() {
  const results = game.results ?? [];
  const key = results.map(r => `${r.id}:${r.total}`).join('|');
  if (finishHold.key !== key) {
    finishHold.key = key;
    const ms = sawPlaying ? finalRevealMs(results) : 0;
    finishHold.until = Date.now() + ms;
    sawPlaying = false;
    if (ms) setTimeout(render, ms + 50);
  }
  if (Date.now() < finishHold.until) return renderWatchTv();
  const index = results.findIndex(r => r.id === you.id);
  const mine = results[index];
  const card = $('final-card');
  card.dataset.color = you.color;
  card.replaceChildren();
  if (mine) {
    const title = document.createElement('h1');
    title.textContent = mine.winner ? '🏆 Você venceu!' : `Você ficou em ${index + 1}º lugar`;
    const total = document.createElement('p');
    total.className = 'final-total';
    total.textContent = `${mine.total} pontos`;
    const parts = document.createElement('ul');
    parts.className = 'final-parts';
    for (const text of [
      `Rotas: ${mine.routePoints}`,
      `Bilhetes: ${mine.ticketPoints >= 0 ? '+' : ''}${mine.ticketPoints} (${mine.ticketsDone} de ${mine.tickets.length} completos)`,
      mine.longestBonus ? `Maior caminho: +${mine.longestBonus} (${mine.longest} vagões)` : `Seu maior caminho: ${mine.longest} vagões`,
    ]) {
      const li = document.createElement('li');
      li.textContent = text;
      parts.append(li);
    }
    const ranking = document.createElement('ol');
    ranking.className = 'final-ranking';
    for (const r of results) {
      const li = document.createElement('li');
      const p = lobby.players.find(x => x.id === r.id);
      li.dataset.color = p?.color ?? '';
      li.textContent = `${p?.name ?? '?'} — ${r.total} pts${r.winner ? ' 🏆' : ''}`;
      ranking.append(li);
    }
    card.append(finalPortrait(you.color), title, total, parts, ranking);
  }

  $('final-tickets').replaceChildren(...(mine?.tickets ?? []).map(t => {
    const li = document.createElement('li');
    li.append(ticketCard(t, {
      state: t.done ? 'done' : 'missed',
      status: t.done ? `Você ganhou ${t.points} pontos.` : `Você perdeu ${t.points} pontos.`,
      pointsText: `${t.done ? '+' : '−'}${t.points}`,
    }));
    return li;
  }));

  const isLeader = you.id === lobby.leaderId;
  $('back-lobby-button').classList.toggle('hidden', !isLeader);
  $('final-wait').classList.toggle('hidden', isLeader);
  show('finished');
}

function renderWatchTv() {
  const card = $('final-card');
  card.dataset.color = you.color;
  const title = document.createElement('h1');
  title.textContent = '📺 Olhem a TV!';
  const text = document.createElement('p');
  text.className = 'final-total';
  text.textContent = 'A contagem final está saindo.';
  card.replaceChildren(finalPortrait(you.color), title, text);
  $('final-tickets').replaceChildren();
  $('back-lobby-button').classList.add('hidden');
  $('final-wait').classList.add('hidden');
  show('finished');
}

$('back-lobby-button').addEventListener('click', () => socket.send({ type: 'endGame' }));

// ---------------------------------------------------------------- janelas por cima

function openSheet(id) {
  $(id).classList.remove('hidden');
}

function closeSheet(id) {
  $(id).classList.add('hidden');
  if (id === 'pay-sheet') payRoute = null;
}

// ---------------------------------------------------------------- aviso rápido

let toastTimer = null;
function showToast(text, card = null, isError = false) {
  const toast = $('toast');
  toast.classList.toggle('error', isError);
  toast.classList.toggle('with-card', Boolean(card));
  if (card) {
    // Carta que você pegou: a carta, o nome e a frase dela (só no seu celular).
    const words = document.createElement('span');
    words.className = 'toast-text';
    const motto = document.createElement('small');
    motto.textContent = CARD_MOTTOS[card] ?? '';
    words.append(text, motto);
    toast.replaceChildren(makeCard(card, { label: false }), words);
  } else {
    toast.replaceChildren(text);
  }
  toast.classList.remove('hidden');
  toast.style.animation = 'none';
  void toast.offsetWidth; // reinicia a animação de entrada
  toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

// ---------------------------------------------------------------- token

// Preferências guardadas no próprio celular (som ligado/desligado).
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
    // sem armazenamento: a preferência vale só até recarregar a página
  }
}

// Guardado no celular para voltar ao mesmo lugar (e à mesma mão) se a conexão cair.
function loadToken() {
  try {
    return localStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(tokenKey, token);
    else localStorage.removeItem(tokenKey);
  } catch {
    // Navegação privada pode bloquear o armazenamento: o jogo continua, só não reconecta sozinho.
  }
}
