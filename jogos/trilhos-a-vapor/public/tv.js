import { connect } from './net.js';
import { createMap, paintClaimedRoutes } from './map-view.js';
import { CITIES } from './map-usa.js';
import { makeCard, makeDeck, makePortrait, makeTrain, sameImage, FINAL_REVEAL, ticketStepMs } from './ui.js';
import { CHARACTERS, characterLabel, portraitUrl } from './characters.js';
import { createSound } from './sound.js';
import { drawBackdrop } from './cenario.js';

const $ = id => document.getElementById(id);
const connBanner = $('conn-banner');
drawBackdrop($('bd-gears'), $('bd-steam'));

// Tempo entre um vagão e outro entrando na rota (som e animação juntos).
const CAR_STEP_MS = 140;

let currentCode = null;
let mapReady = false;
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

// ---------------------------------------------------------------- conexão

// A TV só escuta: manda apenas o "hello" ao conectar.
const socket = connect({
  onOpen: () => socket.send({ type: 'hello', role: 'tv' }),
  onStatus: status => connBanner.classList.toggle('hidden', status === 'online'),
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

// ---------------------------------------------------------------- sala

function renderLobby(lobby) {
  if (lobby.code !== currentCode) {
    currentCode = lobby.code;
    // O código entra na URL só para o navegador não reaproveitar um QR antigo.
    $('qr').src = `/qr.svg?sala=${lobby.code}`;
    $('join-url').textContent = lobby.joinUrl.replace(/^https?:\/\//, '');
  }

  // Sons e animações da sala: alguém entrou / ficou pronto.
  const before = prev?.lobby?.phase === 'lobby' ? prev.lobby.players : null;
  const newIds = new Set();
  if (before) {
    const old = Object.fromEntries(before.map(p => [p.id, p]));
    for (const p of lobby.players) {
      if (!old[p.id]) newIds.add(p.id);
    }
    if (newIds.size) play('join');
    else if (lobby.players.some(p => p.ready && old[p.id] && !old[p.id].ready)) play('ready');
  }
  // Voltou da partida para a sala: o mapa é refeito na próxima partida.
  mapReady = false;
  lastEventId = null;

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
  $('seats').replaceChildren(...buildSeats(lobby, newIds));
  $('start-hint').textContent = startHintText(lobby);
}

// Imagens reaproveitadas entre uma atualização e outra (não piscam).
const seatPortrait = sameImage(makePortrait);
const seatTrain = sameImage(makeTrain);
const ghostTrain = sameImage(color => {
  const img = makeTrain(color);
  img.classList.add('ghost');
  return img;
});

function buildSeats(lobby, newIds) {
  const seats = [];
  // Lugares livres mostram, apagados, os trens dos personagens que ainda ninguém escolheu.
  const taken = new Set(lobby.players.map(p => p.color));
  const freeColors = Object.keys(CHARACTERS).filter(color => !taken.has(color));
  for (let i = 0; i < lobby.maxPlayers; i++) {
    const player = lobby.players[i];
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';

    if (!player) {
      li.className = 'seat free';
      name.textContent = 'Lugar livre';
      li.append(ghostTrain(freeColors.shift() ?? 'azul'), name);
      seats.push(li);
      continue;
    }

    li.className = `seat joined${player.online ? '' : ' offline'}${newIds.has(player.id) ? ' seat-in' : ''}`;
    li.dataset.color = player.color;
    name.textContent = player.name;
    if (player.id === lobby.leaderId) name.append(crown());
    const who = document.createElement('span');
    who.className = 'who';
    const character = document.createElement('span');
    character.className = 'character';
    character.textContent = characterLabel(player.color);
    who.append(name, character);

    const status = document.createElement('span');
    if (!player.online) {
      status.className = 'status offline';
      status.textContent = 'reconectando…';
    } else if (player.ready) {
      status.className = 'status ready';
      status.textContent = 'pronto';
    } else {
      status.className = 'status waiting';
      status.textContent = 'se preparando';
    }
    li.append(seatPortrait(player.color), who, seatTrain(player.color), status);
    seats.push(li);
  }
  return seats;
}

function crown() {
  const span = document.createElement('span');
  span.className = 'leader-crown';
  span.title = 'Líder da sala';
  span.textContent = '👑';
  return span;
}

function startHintText(lobby) {
  const { players, minPlayers } = lobby;
  if (players.length < minPlayers) {
    return players.length === 0
      ? `Precisa de pelo menos ${minPlayers} jogadores. O primeiro a entrar vira o líder 👑.`
      : 'Falta mais 1 jogador para começar.';
  }
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) {
    return `Esperando ${listNames(offline)} ${offline.length > 1 ? 'reconectarem' : 'reconectar'}.`;
  }
  const notReady = players.filter(p => !p.ready).map(p => p.name);
  if (notReady.length) {
    return `Esperando ${listNames(notReady)} ${notReady.length > 1 ? 'ficarem prontos' : 'ficar pronto'}.`;
  }
  const leader = players.find(p => p.id === lobby.leaderId);
  return `Tudo pronto! ${leader ? leader.name : 'O líder'} 👑 começa a partida pelo celular.`;
}

function listNames(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

// ---------------------------------------------------------------- partida
//
// PADRÃO RESISTÊNCIA (esboço aprovado pelo Bruno, out/2026): cada jogador é um
// cartão de personagem com a moeda de pontos; a ficha da vez (locomotiva de
// latão) voa de um cartão para o outro; a carta pega voa até quem pegou (a da
// pilha voa virada); ao conquistar rota, os trens descem soltando vapor e o
// carimbo de pontos bate no mapa; a última rodada e a contagem final são
// revelações. TV aberta no meio da partida não anima nem toca nada do passado.

const LOCO_SVG = '<svg viewBox="0 0 64 48" aria-hidden="true"><rect x="9" y="8" width="8" height="12" rx="1"/><rect x="4" y="19" width="38" height="14" rx="6"/><rect x="40" y="10" width="18" height="24" rx="2"/><rect x="38" y="6" width="22" height="4" rx="1"/><rect x="2" y="32" width="60" height="5" rx="2"/><circle cx="14" cy="41" r="6"/><circle cx="30" cy="41" r="6"/><circle cx="51" cy="41" r="5"/></svg>';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let mapSvg = null;
let plateKey = null;
const plates = new Map(); // id → peças do cartão do jogador (montadas uma vez por partida)
let shownTurn = null; // cartão destacado agora (a ficha voa depois das animações do lance)
let turnTimer = null;
let turnDue = 0; // quando o voo marcado acontece
let pendingTurn = null; // para quem a ficha vai voar
let finalGen = 0; // muda a cada contagem final: a anterior para
let finalShownFor = null;
let finalRunning = false; // a contagem final está sendo revelada
let latestGame = null; // retrato mais novo (as animações atrasadas leem daqui)
let latestById = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderGame(lobby, game) {
  const firstPaint = !mapReady;
  if (!mapReady) {
    mapSvg = createMap();
    mapSvg.classList.add('in-game');
    $('map-wrap').replaceChildren(mapSvg);
    $('map-reveal').replaceChildren();
    finalGen += 1;
    finalShownFor = null;
    finalRunning = false;
    mapReady = true;
  }
  // Acabou de sair da sala para a partida: abertura com as rotas aparecendo + apito.
  const justStarted = prev?.lobby?.phase === 'lobby';
  if (justStarted) {
    mapSvg.classList.add('intro');
    setTimeout(() => mapSvg?.classList.remove('intro'), 2600);
    play('whistle', 0.1, 0.7);
    play('whistle', 0.95, 0.35);
  }

  const byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  latestGame = game;
  latestById = byId;
  const fresh = lastEventId === null ? [] : game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(lastEventId ?? 0, ...game.events.map(e => e.id));

  // Cartas que vão voar: a foto da carta é tirada ANTES de a mesa ser redesenhada.
  const flights = [];
  for (const event of fresh) {
    if (event.kind !== 'card' || !event.playerId) continue;
    const market = $('tv-faceup').children;
    const source = event.index !== undefined ? market[event.index] : market[market.length - 1];
    if (source) flights.push({ snap: snapshot(source), playerId: event.playerId });
  }

  // Rotas conquistadas ficam com a cor de trem do dono.
  const claimedColors = {};
  for (const [routeId, playerId] of Object.entries(game.claimed)) claimedColors[routeId] = byId[playerId]?.color;
  paintClaimedRoutes(mapSvg, claimedColors, { animate: !firstPaint });

  // Cartas da mesa: as que mudaram entram virando.
  const prevGame = firstPaint ? null : prev?.game ?? null;
  $('tv-faceup').replaceChildren(
    ...game.faceUp.map((card, i) => {
      const node = makeCard(card);
      if (prevGame && prevGame.faceUp[i] !== card) node.classList.add('card-in');
      return node;
    }),
    makeDeck(game.deckCount),
  );
  $('ticket-deck').textContent = `Bilhetes de destino na pilha: ${game.ticketDeckCount}`;

  if (ensurePlates(game, byId)) shownTurn = null;
  const claims = fresh.filter(e => e.kind === 'claim');
  drawPlates(lobby, game, byId, claims);
  for (const flight of flights) flyCard(flight.snap, flight.playerId);
  for (const claim of claims) animateClaim(claim, byId);

  // A vez: a ficha voa depois do lance (dos trens descendo ou da carta voando).
  const turnId = game.stage === 'turns' ? game.turnPlayerId : null;
  const claimMs = claims.reduce((ms, e) => Math.max(ms, e.length * CAR_STEP_MS + 1100), 0);
  const delay = firstPaint ? 0 : Math.max(claimMs, flights.length ? 950 : 0);
  scheduleTurn(turnId, delay, lobby, game, byId);
  drawStatus(game, byId, turnId === shownTurn);

  const roundOn = game.lastRound && game.stage !== 'finished';
  $('last-round').classList.toggle('on', roundOn);

  // (durante a contagem final o rodapé não entrega quem venceu)
  const last = finalRunning ? 'Fim de jogo! Olhem a contagem final.' : game.events.at(-1)?.text ?? '';
  if ($('tv-ticker').textContent !== last) {
    $('tv-ticker').textContent = last;
    restartAnimation($('tv-ticker'), 'in');
  }

  const busyMs = playEvents(fresh);
  if (fresh.some(e => e.kind === 'lastRound')) setTimeout(() => stampBanner('Última rodada!', lastRoundText(fresh, byId)), busyMs);

  if (game.stage === 'finished' && game.results) {
    const key = game.results.map(r => `${r.id}:${r.total}`).join('|');
    if (finalShownFor !== key) {
      finalShownFor = key;
      const animate = fresh.some(e => e.kind === 'finish');
      finalRunning = animate;
      if (animate) $('tv-ticker').textContent = 'Fim de jogo! Olhem a contagem final.';
      finalReveal(game, byId, animate);
    }
  }
}

function lastRoundText(events, byId) {
  const event = events.find(e => e.kind === 'lastRound');
  return event?.playerId ? `${byId[event.playerId]?.name ?? '?'} ficou com poucos trens: cada um joga mais uma vez` : 'Cada um joga mais uma vez';
}

// ---------------------------------------------------------------- cartões dos jogadores

function ensurePlates(game, byId) {
  const key = game.players.map(p => `${p.id}:${byId[p.id]?.color}`).join(',');
  if (key === plateKey) return false;
  plateKey = key;
  plates.clear();
  $('tv-players').replaceChildren(...game.players.map(stats => {
    const info = byId[stats.id] ?? {};
    const li = el('li', 'pcard');
    li.dataset.color = info.color ?? '';
    const medal = el('div', 'pcard-medal');
    const img = el('img', 'pcard-portrait');
    img.src = portraitUrl(info.color);
    img.alt = characterLabel(info.color);
    const token = el('span', 'turn-token');
    token.innerHTML = LOCO_SVG;
    medal.append(img, token);
    const who = el('div', 'pcard-who');
    const name = el('span', 'pcard-name');
    const toks = el('div', 'pcard-toks');
    const trains = el('span', 'tok');
    const cards = el('span', 'tok');
    const tickets = el('span', 'tok');
    const chip = el('span', 'pcard-chip');
    toks.append(trains, cards, tickets);
    who.append(name, el('span', 'pcard-char', characterLabel(info.color)), toks, chip);
    const coin = el('div', 'pcard-coin');
    const pts = el('b');
    coin.append(pts, el('small', '', 'pts'));
    li.append(medal, who, coin);
    plates.set(stats.id, { li, token, name, trains, cards, tickets, chip, coin, pts, score: null });
    return li;
  }));
  return true;
}

function drawPlates(lobby, game, byId, claims) {
  const choosingStart = game.stage === 'tickets';
  for (const stats of game.players) {
    const plate = plates.get(stats.id);
    if (!plate) continue;
    const info = byId[stats.id] ?? {};
    plate.name.replaceChildren(info.name ?? '?');
    if (stats.id === lobby.leaderId) plate.name.append(crown());
    plate.li.classList.toggle('offline', !info.online);
    plate.trains.innerHTML = `<i>🚂</i>${stats.trains}`;
    plate.cards.innerHTML = `<i>🃏</i>${stats.handCount}`;
    plate.tickets.innerHTML = `<i>🎫</i>${stats.ticketCount}`;
    const chip = !info.online ? ['offline', 'reconectando…']
      : stats.choosingTickets ? ['waiting', 'escolhendo bilhetes']
        : choosingStart ? ['ready', 'pronto'] : null;
    plate.chip.className = `pcard-chip${chip ? ` ${chip[0]}` : ''}`;
    plate.chip.textContent = chip ? chip[1] : '';
    // pontos: depois de conquistar rota, a moeda espera o carimbo e conta junto
    if (claims.some(e => e.playerId === stats.id) && plate.score !== null) plate.pending = true;
    if (!plate.pending) {
      plate.score = stats.score;
      plate.pts.textContent = String(stats.score);
    }
  }
}

// A ficha da vez voa (em arco, girando) do cartão anterior para o próximo.
function scheduleTurn(turnId, delay, lobby, game, byId) {
  pendingTurn = turnId;
  if (turnId === shownTurn) {
    clearTimeout(turnTimer);
    turnTimer = null;
    return;
  }
  // Já tem um voo marcado mais cedo? Mantém o horário (lances rápidos em
  // sequência não podem empurrar a ficha para sempre) e voa para o mais novo.
  const due = Date.now() + delay;
  if (turnTimer && turnDue <= due) return;
  clearTimeout(turnTimer);
  turnDue = due;
  const apply = () => {
    turnTimer = null;
    const target = pendingTurn;
    const before = shownTurn;
    if (target === before) return;
    shownTurn = target;
    for (const [id, plate] of plates) plate.li.classList.toggle('current', id === target);
    drawStatus(latestGame ?? game, latestById ?? byId, true);
    if (!target) return;
    const to = plates.get(target)?.token;
    const from = before ? plates.get(before)?.token : null;
    if (!to) return;
    if (from) flyToken(from, to);
    else restartAnimation(to, 'pop'); // primeira vez (ou TV aberta agora): só aparece
  };
  if (delay) turnTimer = setTimeout(apply, delay);
  else apply();
}

async function flyToken(from, to) {
  await wait(460); // o cartão termina de deslizar
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return restartAnimation(to, 'pop');
  const flyer = to.cloneNode(true);
  flyer.classList.add('flying');
  flyer.style.left = `${a.left}px`;
  flyer.style.top = `${a.top}px`;
  document.body.append(flyer);
  to.classList.add('waiting');
  const dx = b.left - a.left;
  const dy = b.top - a.top;
  await flyer.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)' },
    { transform: `translate(${dx / 2 - 120}px, ${dy / 2}px) scale(1.8) rotate(-180deg)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(-360deg)` },
  ], { duration: 1000, easing: 'cubic-bezier(.45,.05,.3,1)' }).finished;
  flyer.remove();
  to.classList.remove('waiting');
  restartAnimation(to, 'pop');
  play('turn');
}

// A frase do topo: retrato e nome de quem joga (segue a ficha da vez).
function drawStatus(game, byId, settled) {
  const status = $('game-status');
  let color = '';
  let main;
  let sub;
  if (game.stage === 'finished') {
    main = 'Fim de jogo!';
    sub = 'Olhem a contagem final no mapa.';
  } else if (game.stage === 'tickets') {
    main = 'Escolhendo bilhetes';
    sub = `Cada um escolhe no celular. Faltam ${game.players.filter(p => p.choosingTickets).length}.`;
  } else {
    const id = shownTurn ?? game.turnPlayerId;
    const info = byId[id] ?? {};
    color = info.color ?? '';
    const stats = game.players.find(p => p.id === id);
    main = `Vez de <b>${escapeHtml(info.name ?? '…')}</b>`;
    sub = settled && id === game.turnPlayerId
      ? `${CHARACTERS[color]?.name ?? ''}: ${turnStepText(game, info, stats)}`
      : game.events.at(-1)?.text ?? '';
  }
  if (status.dataset.main !== main) {
    status.dataset.main = main;
    status.dataset.color = color;
    const parts = [];
    if (color) {
      const face = el('img', 'status-face');
      face.src = portraitUrl(color);
      face.alt = '';
      parts.push(face);
    }
    const text = el('div', 'status-text');
    const big = el('span', 'status-main');
    big.innerHTML = main;
    text.append(big, el('span', 'status-sub', sub));
    parts.push(text);
    status.replaceChildren(...parts);
    restartAnimation(status, 'in');
  } else {
    status.querySelector('.status-sub').textContent = sub;
  }
}

const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function turnStepText(game, current, stats) {
  if (current && current.online === false) return 'reconectando…';
  if (stats?.choosingTickets) return 'escolhendo bilhetes';
  if (game.cardsDrawn > 0) return `pegou ${game.cardsDrawn} de ${game.cardsPerTurn} cartas`;
  return 'pegue cartas, conquiste uma rota ou peça bilhetes';
}

// ---------------------------------------------------------------- animações dos lances

function snapshot(node) {
  return { clone: node.cloneNode(true), rect: node.getBoundingClientRect() };
}

// A carta voa da mesa (ou da pilha, sempre virada) até o cartão de quem pegou.
async function flyCard({ clone, rect }, playerId) {
  const plate = plates.get(playerId);
  if (!plate || !rect.width) return;
  const target = plate.cards.getBoundingClientRect();
  clone.classList.remove('card-in');
  clone.classList.add('flying-card');
  Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  document.body.append(clone);
  const dx = target.left + target.width / 2 - (rect.left + rect.width / 2);
  const dy = target.top + target.height / 2 - (rect.top + rect.height / 2);
  await clone.animate([
    { transform: 'translate(0,0) scale(1.08) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(0.85) rotate(-12deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.25) rotate(8deg)`, opacity: 0.2 },
  ], { duration: 850, easing: 'cubic-bezier(.4,.1,.3,1)' }).finished;
  clone.remove();
  restartAnimation(plate.cards, 'bump');
}

function vapor(x, y, count = 2) {
  for (let k = 0; k < count; k++) {
    const puff = el('div', 'vapor');
    puff.style.left = `${x}px`;
    puff.style.top = `${y}px`;
    puff.style.setProperty('--vx', `${(Math.random() - 0.5) * 120}px`);
    puff.style.setProperty('--vy', `${-40 - Math.random() * 80}px`);
    document.body.append(puff);
    setTimeout(() => puff.remove(), 1400);
  }
}

function countUp(node, from, to, ms = 700) {
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Rota conquistada: os trens descem um por um (map-view.js) soltando vapor, o
// carimbo de pontos bate em cima da rota e a moeda do jogador conta.
async function animateClaim(event, byId) {
  const group = mapSvg?.querySelector(`.route[data-route="${event.routeId}"]`);
  const plate = plates.get(event.playerId);
  if (!plate) return;
  const target = () => latestGame?.players.find(p => p.id === event.playerId)?.score ?? plate.score + event.points;
  if (!group) {
    plate.pending = false;
    plate.score = target();
    plate.pts.textContent = String(plate.score);
    return;
  }
  [...group.querySelectorAll('.car')].forEach((car, i) => setTimeout(() => {
    const b = car.getBoundingClientRect();
    vapor(b.left + b.width / 2, b.top + b.height / 2);
  }, i * CAR_STEP_MS + 380));
  await wait(event.length * CAR_STEP_MS + 650);
  const box = group.getBoundingClientRect();
  const stamp = el('div', 'stamp');
  stamp.dataset.color = byId[event.playerId]?.color ?? '';
  stamp.style.left = `${box.left + box.width / 2}px`;
  stamp.style.top = `${box.top + box.height / 2 - 50}px`;
  stamp.append(el('b', '', `+${event.points}`), el('span', '', 'Rota conquistada'));
  document.body.append(stamp);
  const score = target();
  countUp(plate.pts, plate.score, score);
  plate.score = score;
  plate.pending = false;
  restartAnimation(plate.coin, 'bump');
  restartAnimation(plate.trains, 'bump');
  await wait(1700);
  stamp.classList.add('out');
  await wait(450);
  stamp.remove();
}

// Um carimbo grande no meio do mapa (ex.: "Última rodada!").
async function stampBanner(title, sub, hold = 2200) {
  const banner = el('div', 'banner');
  banner.append(el('b', '', title), el('span', '', sub));
  $('map-reveal').append(banner);
  await wait(hold);
  banner.classList.add('out');
  await wait(450);
  banner.remove();
}

// ---------------------------------------------------------------- fim de jogo

// Contagem final: os bilhetes de todos viram um por um (em rodízio), carimbam ✓/✗
// e somam; a medalha do maior caminho voa até o dono; o vencedor ganha a coroa,
// a fanfarra e o confete. O celular espera o mesmo tempo ("Olhem a TV!").
// TV aberta depois do fim: mostra tudo direto, sem suspense.
async function finalReveal(game, byId, animate) {
  const gen = ++finalGen;
  const results = game.results;
  const byResult = Object.fromEntries(results.map(r => [r.id, r]));
  const panel = el('div', 'final-panel');
  const title = el('h2', '', 'Contagem final');
  const note = el('p', 'final-note', 'O líder volta todos para a sala pelo celular.');
  const cols = el('div', 'final-cols');
  cols.style.setProperty('--n', game.players.length);
  panel.append(title, cols, note);
  const col = {};
  for (const { id } of game.players) {
    const r = byResult[id];
    const info = byId[id] ?? {};
    const c = el('div', 'final-col');
    c.dataset.color = info.color ?? '';
    const img = el('img');
    img.src = portraitUrl(info.color);
    img.alt = '';
    const score = el('span', 'final-score', String(animate ? r.routePoints : r.total));
    const list = el('div', 'final-tickets');
    c.append(img, el('span', 'final-name', info.name ?? '?'), el('span', 'final-char', characterLabel(info.color)), score, list);
    cols.append(c);
    col[id] = { c, score, list, pts: r.routePoints };
  }
  $('map-reveal').replaceChildren(panel);

  const ticketNode = t => {
    const node = el('div', `final-ticket ${t.done ? 'ok' : 'ko'}`);
    node.append(el('i', '', `${CITIES[t.a].name} → ${CITIES[t.b].name}`), el('span', 'fin-stamp', `${t.done ? '+' : '−'}${t.points}`));
    return node;
  };
  const crownWinners = () => {
    const winners = results.filter(r => r.winner);
    for (const r of winners) {
      col[r.id].c.classList.add('winner');
      col[r.id].c.append(el('span', 'final-crown', '👑'));
    }
    const names = winners.map(r => byId[r.id]?.name ?? '?');
    title.textContent = `🏆 ${names.join(' e ')} ${names.length > 1 ? 'venceram' : 'venceu'}!`;
    note.classList.add('show');
  };

  if (!animate) {
    for (const r of results) {
      col[r.id].list.append(...r.tickets.map(ticketNode));
      if (r.longestBonus) col[r.id].list.append(el('div', 'final-longest', `🏅 Maior caminho +${r.longestBonus}`));
    }
    crownWinners();
    return;
  }

  const total = results.reduce((n, r) => n + r.tickets.length, 0);
  const step = ticketStepMs(total);
  await wait(FINAL_REVEAL.intro);
  const rounds = Math.max(0, ...results.map(r => r.tickets.length));
  for (let k = 0; k < rounds; k++) {
    for (const { id } of game.players) {
      const t = byResult[id].tickets[k];
      if (!t) continue;
      if (gen !== finalGen) return;
      col[id].list.append(ticketNode(t));
      await wait(step * 0.5);
      play('tick');
      const from = col[id].pts;
      col[id].pts += t.done ? t.points : -t.points;
      countUp(col[id].score, from, col[id].pts, step * 0.45);
      restartAnimation(col[id].score, 'bump');
      await wait(step * 0.5);
    }
  }
  if (gen !== finalGen) return;
  // a medalha do maior caminho voa até quem tem (pode ser mais de um)
  const box = $('map-reveal').getBoundingClientRect();
  await Promise.all(results.filter(r => r.longestBonus).map(async r => {
    const medal = el('div', 'medal-longest', `🏅 Maior caminho +${r.longestBonus}`);
    medal.style.left = `${box.left + box.width / 2 - 130}px`;
    medal.style.top = `${box.top + 30}px`;
    document.body.append(medal);
    const target = col[r.id].score.getBoundingClientRect();
    const m = medal.getBoundingClientRect();
    await medal.animate([
      { transform: 'translate(0,0) scale(0.4)', opacity: 0 },
      { transform: 'translate(0,0) scale(1.3)', opacity: 1, offset: 0.3 },
      { transform: `translate(${target.left - m.left}px, ${target.top - m.top}px) scale(0.6)`, opacity: 0.9 },
    ], { duration: 1300, easing: 'cubic-bezier(.4,.1,.3,1)' }).finished;
    medal.remove();
    col[r.id].list.append(el('div', 'final-longest', `🏅 Maior caminho +${r.longestBonus}`));
    countUp(col[r.id].score, col[r.id].pts, col[r.id].pts + r.longestBonus, 500);
    col[r.id].pts += r.longestBonus;
    restartAnimation(col[r.id].score, 'bump');
  }));
  await wait(Math.max(0, FINAL_REVEAL.longest - 1300));
  if (gen !== finalGen) return;
  crownWinners();
  play('fanfare');
  confetti();
  finalRunning = false;
  $('tv-ticker').textContent = game.events.at(-1)?.text ?? '';
}

function confetti() {
  const layer = $('confetti');
  const colors = ['#c33a2c', '#2f6cb5', '#3e8f3a', '#d9a521', '#7c3fa8', '#f4d78f', '#c9a24a'];
  const pieces = [];
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
    pieces.push(piece);
  }
  layer.replaceChildren(...pieces);
  setTimeout(() => layer.replaceChildren(), 5500);
}

// ---------------------------------------------------------------- sons dos lances

// Toca o som de cada lance novo, junto com a animação. Devolve quanto tempo (ms)
// os sons ocupam.
function playEvents(events) {
  let busy = 0;
  for (const event of events) {
    switch (event.kind) {
      case 'card':
        play('card');
        busy = Math.max(busy, 150);
        break;
      case 'claim': {
        // um "clac" por vagão, junto com a animação, e um apito curto no fim
        for (let i = 0; i < event.length; i++) play('clack', (i * CAR_STEP_MS) / 1000);
        const end = event.length * CAR_STEP_MS;
        play('whistle', end / 1000 + 0.05, 0.3);
        busy = Math.max(busy, end + 400);
        break;
      }
      case 'tickets':
        play('paper');
        busy = Math.max(busy, 300);
        break;
      case 'shuffle':
        play('shuffle');
        busy = Math.max(busy, 350);
        break;
      case 'lastRound':
        setTimeout(() => play('lastRound'), busy);
        busy += 900;
        break;
      case 'go':
        play('whistle', 0, 0.4);
        busy = Math.max(busy, 500);
        break;
      default:
        break;
    }
  }
  return busy;
}

function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // força o navegador a recomeçar a animação
  node.classList.add(className);
}
