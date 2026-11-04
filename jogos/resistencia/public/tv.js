// Tela da TV: só escuta (não manda comandos). Sala (cartaz com o QR, recrutas e
// as 12 cartas) e a mesa: o tabuleiro (mapa da cidade com as 5 missões), os
// times recusados e a carta de personagem de cada um.
//
// ANIMAÇÕES: a TV compara o retrato novo com o anterior e enfileira as grandes
// (distribuir as cartas, revelar os votos, revelar a missão, revelar os papéis):
// uma de cada vez, sem atropelar. O que ainda não foi revelado na TV fica
// guardado em `view` (o tabuleiro mostra `view`, não o estado mais novo).
//
// PRIVACIDADE: a TV nunca recebe o papel de ninguém (só no fim), o voto antes de
// todos votarem nem a escolha da missão (só quantas sabotagens houve).
import { connect } from './net.js';
import { makeAvatar, joinNames } from './ui.js';
import { CHARACTERS } from './characters.js';
import { PERSONAGENS, personagem, cardImage } from './personagens.js';
import { drawSkyline, drawCityMap, MISSION_POINTS, MISSION_NAMES, MAP_W, MAP_H } from './cenario.js';
import { createSound } from './sound.js';

const $ = id => document.getElementById(id);

let currentCode = null;
let prev = null; // retrato anterior, para saber o que mudou
let latest = null; // retrato mais novo (para redesenhar depois de cada animação)

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

// Os sons da partida tocam junto com as animações (distribuir, revelar voto,
// revelar missão, fim), não quando o lance chega: veja as animações grandes.
// TV aberta no meio da partida não anima — e não toca nada do passado.

// ---------------------------------------------------------------- cenário

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// As 12 cartas em leque na sala, balançando devagar.
function buildCardFan() {
  $('card-fan').replaceChildren(...PERSONAGENS.map((p, i) => {
    const img = el('img', 'fan-card');
    img.src = cardImage(p.id);
    img.alt = '';
    img.style.setProperty('--i', i);
    img.style.setProperty('--r', `${(i - 5.5) * 4.2}deg`);
    img.style.setProperty('--y', `${Math.abs(i - 5.5) ** 1.6 * 2.4}px`);
    return img;
  }));
}

// As 5 missões no mapa (o texto e o resultado mudam a cada retrato).
const missionEls = [];
function buildMissionNodes() {
  $('missions').replaceChildren(...MISSION_POINTS.map(([x, y], i) => {
    const node = el('div', 'mission');
    node.style.left = `${(x / MAP_W) * 100}%`;
    node.style.top = `${(y / MAP_H) * 100}%`;
    const title = el('span', 'mission-title', `Missão ${i + 1}`);
    const disc = el('div', 'mission-disc');
    const size = el('span', 'mission-size');
    const token = el('span', 'mission-token');
    token.append(el('span', 'token-mark'), el('span', 'token-label'));
    disc.append(el('span', 'mission-ping'), size, token);
    const name = el('span', 'mission-name', MISSION_NAMES[i]);
    const info = el('span', 'mission-info');
    const team = el('span', 'mission-team');
    node.append(title, disc, name, info, team);
    missionEls.push({ node, size, token, info, team, shownResult: undefined });
    return node;
  }));
}

drawSkyline($('skyline'));
drawCityMap($('city'));
buildCardFan();
buildMissionNodes();

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
  document.body.classList.toggle('in-game', Boolean(playing));
  latest = state;
  if (playing) onGameState(lobby, game);
  else {
    resetGameView();
    renderLobby(lobby);
  }
  prev = state;
}

// ---------------------------------------------------------------- sala

const lobbyAvatars = new Map();

function renderLobby(lobby) {
  if (lobby.code !== currentCode) {
    currentCode = lobby.code;
    // O código entra na URL só para o navegador não reaproveitar um QR antigo.
    $('qr').src = `/qr.svg?sala=${lobby.code}`;
    $('join-url').textContent = lobby.joinUrl.replace(/^https?:\/\//, '');
  }
  // Som: alguém entrou na sala.
  const before = prev?.lobby?.phase === 'lobby' ? prev.lobby.players : null;
  const newcomers = before ? lobby.players.filter(p => !before.find(b => b.id === p.id)).map(p => p.id) : [];
  if (newcomers.length) play('join');

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
  // lugares livres mostram, apagadas, as fichas que ainda ninguém escolheu
  const freeColors = Object.keys(CHARACTERS).filter(c => !lobby.players.some(p => p.color === c));
  $('seats').replaceChildren(...Array.from({ length: lobby.maxPlayers }, (_, i) => {
    const player = lobby.players[i];
    const li = el('li');
    const name = el('span', 'name');
    if (!player) {
      li.className = 'seat free';
      name.textContent = i < lobby.minPlayers ? 'Lugar livre' : 'Lugar livre (opcional)';
      li.append(makeAvatar(freeColors.shift() ?? 'azul', '?'), name);
      return li;
    }
    li.className = `seat${player.online ? '' : ' offline'}${newcomers.includes(player.id) ? ' new' : ''}`;
    name.textContent = player.id === lobby.leaderId ? `${player.name} 👑` : player.name;
    const status = el('span', `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`,
      !player.online ? 'reconectando…' : player.ready ? 'pronto' : 'se preparando');
    const key = `${player.color}:${player.name}`;
    if (!lobbyAvatars.has(key)) lobbyAvatars.set(key, makeAvatar(player.color, player.name));
    li.append(lobbyAvatars.get(key), name, status);
    return li;
  }));
  $('start-hint').textContent = startHintText(lobby);
}

function startHintText(lobby) {
  const { players, minPlayers } = lobby;
  if (players.length < minPlayers) {
    const missing = minPlayers - players.length;
    return players.length === 0
      ? `Precisa de pelo menos ${minPlayers} pessoas. O primeiro a entrar vira o líder 👑.`
      : `Falta${missing > 1 ? 'm' : ''} mais ${missing} pessoa${missing > 1 ? 's' : ''} para começar.`;
  }
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  const notReady = players.filter(p => !p.ready).map(p => p.name);
  if (notReady.length) return `Esperando ${notReady.join(', ')} ficar pronto.`;
  const leader = players.find(p => p.id === lobby.leaderId);
  return `Tudo pronto! ${leader ? leader.name : 'O líder'} 👑 começa a partida pelo celular.`;
}

// ---------------------------------------------------------------- partida: o que a TV já mostrou

const voteKey = vote => (vote ? `${vote.mission}:${vote.proposal}` : null);
const resultCount = game => game.missions.filter(m => m.result).length;

// O que a TV já revelou (o estado novo pode estar à frente, esperando animação).
const view = {
  results: 0, // missões com resultado no tabuleiro
  rejections: 0, // X na trilha de recusas
  voteKey: null, // última votação já revelada
  ended: false, // papéis revelados
  commander: null, // em quem está a ficha de comanda
  collecting: false, // as cartas da missão estão no meio da mesa
};

function syncView(game) {
  view.results = resultCount(game);
  view.rejections = game.rejections;
  view.voteKey = voteKey(game.lastVote);
  view.ended = game.stage === 'over';
  view.commander = game.commanderId;
  view.collecting = false;
}

// Fila das animações grandes: uma de cada vez. Se acumular (robôs jogando
// rápido), as próximas andam mais depressa.
const queue = [];
let running = false;
let generation = 0; // muda a cada partida nova: animação de partida velha para
let speed = 1;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms * speed));

function enqueue(step) {
  queue.push(step);
  if (!running) runQueue();
}

async function runQueue() {
  running = true;
  while (queue.length) {
    const step = queue.shift();
    speed = queue.length ? 0.35 : 1;
    const gen = generation;
    try {
      await step(gen);
    } catch (error) {
      console.error(error);
    }
    if (gen === generation && latest?.game && queue.length) drawGame(latest.lobby, latest.game);
  }
  running = false;
  speed = 1;
  // fila vazia: agora a ficha de comanda pode voar para quem comanda
  if (latest?.lobby?.phase === 'playing' && latest.game) drawGame(latest.lobby, latest.game);
}

function resetGameView() {
  generation += 1;
  queue.length = 0;
  seatKey = null;
  $('reveal').replaceChildren();
}

// ---------------------------------------------------------------- partida: retrato novo

function onGameState(lobby, game) {
  const prevGame = prev?.lobby?.phase === 'playing' ? prev.game : null;
  const justStarted = prev?.lobby?.phase === 'lobby' || (prevGame?.stage === 'over' && game.stage !== 'over');
  const rebuilt = ensureSeats(game);

  if (justStarted || (rebuilt && !prevGame)) {
    // partida nova (ou TV aberta no meio): começa do zero
    generation += 1;
    queue.length = 0;
    $('reveal').replaceChildren();
    syncView(game);
    view.commander = null;
    if (justStarted) {
      for (const seat of seats.values()) seat.li.classList.add('undealt');
      enqueue(dealCards);
    } else {
      view.commander = game.commanderId;
    }
  } else if (prevGame) {
    if (voteKey(game.lastVote) !== voteKey(prevGame.lastVote)) {
      const vote = game.lastVote;
      enqueue(gen => revealVote(gen, vote));
    }
    for (let i = resultCount(prevGame); i < resultCount(game); i++) enqueue(gen => revealMission(gen, i));
    if (game.stage === 'over' && prevGame.stage !== 'over') enqueue(revealRoles);
  }
  drawGame(lobby, game);
}

// ---------------------------------------------------------------- partida: desenhar

function drawGame(lobby, game) {
  const byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  const nameOf = id => byId[id]?.name ?? '?';
  $('round-chip').textContent = `${game.spyCount} espiões infiltrados`;
  drawStatus(game, nameOf);
  drawBoard(game);
  drawRejections();
  drawSeats(lobby, game, byId);
  // a ficha de comanda aparece depois que todos viram o papel
  if (!running) moveCommander(['pick', 'vote', 'mission'].includes(game.stage) ? game.commanderId : null);
  const last = game.events.at(-1)?.text ?? '';
  if ($('ticker').textContent !== last) {
    $('ticker').textContent = last;
    restartAnimation($('ticker'), 'ticker-in');
  }
}

function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function drawStatus(game, nameOf) {
  const [main, sub] = statusText(game, nameOf);
  const status = $('status');
  status.dataset.winner = view.ended ? game.winner ?? '' : '';
  if (status.dataset.main !== main) {
    status.dataset.main = main;
    status.replaceChildren(el('span', 'status-main', main), el('span', 'status-sub', sub));
    restartAnimation(status, 'status-in');
  } else {
    status.querySelector('.status-sub').textContent = sub;
  }
}

function statusText(game, nameOf) {
  const total = game.players.length;
  const mission = game.missions[game.mission];
  const team = joinNames(game.team.map(nameOf));
  if (game.stage === 'over' && !view.ended) return ['Revelando…', 'Olhem a mesa.'];
  // a TV ainda vai revelar uma missão: a frase espera (senão entregava o resultado)
  if (view.results < resultCount(game)) return [`Missão ${view.results + 1}: o resultado vai sair…`, 'Olhem a mesa.'];
  switch (game.stage) {
    case 'roles':
      return ['Cada um vê o seu papel em segredo',
        `No celular, segure a sua carta para ver. Já viram: ${game.seen.length} de ${total}.`];
    case 'pick':
      return [`${nameOf(game.commanderId)} escolhe ${mission.size} pessoas para a Missão ${game.mission + 1}`,
        'Conversem: em quem vocês confiam?'];
    case 'vote':
      return ['Votação: este time vai para a missão?', `${team}. Já votaram ${game.voted.length} de ${total}.`];
    case 'mission':
      return [`Missão ${game.mission + 1}: ${team}`,
        `Cada um escolhe em segredo: Sucesso ou Sabotar. Já escolheram ${game.chosen.length} de ${game.team.length}.`];
    default: {
      const why = game.winReason === 'recusas' ? `${game.maxRejections} times recusados seguidos.`
        : game.winner === 'resistencia' ? '3 missões cumpridas.' : '3 missões sabotadas.';
      return [game.winner === 'resistencia' ? 'A Resistência venceu!' : 'Os espiões venceram!',
        `${why} Os espiões eram ${joinNames(game.spies.map(nameOf))}.`];
    }
  }
}

const sabotageText = n => (n === 0 ? 'nenhuma sabotagem' : `${n} ${n === 1 ? 'sabotagem' : 'sabotagens'}`);

// O tabuleiro: missão da vez pulsando, resultados (só os já revelados) e a rota.
function drawBoard(game) {
  const pendingReveal = view.results < resultCount(game);
  const current = view.ended || (game.stage === 'over' && !pendingReveal) ? -1 : pendingReveal ? view.results : game.mission;
  game.missions.forEach((mission, i) => {
    const m = missionEls[i];
    const shown = i < view.results ? mission.result : null;
    m.node.classList.toggle('current', i === current);
    m.node.dataset.result = shown ?? '';
    m.size.textContent = String(mission.size);
    if (shown) {
      m.info.textContent = `${shown === 'sucesso' ? 'Cumprida' : 'Sabotada'} · ${sabotageText(mission.sabotages)}`;
      m.token.querySelector('.token-mark').textContent = shown === 'sucesso' ? '✓' : '✗';
      m.token.querySelector('.token-label').textContent = shown === 'sucesso' ? 'Cumprida' : 'Sabotada';
      if (m.shownResult !== shown) {
        // a ficha cai no tabuleiro e os rostos de quem foi aparecem (não na
        // primeira vez que a TV desenha: ela pode ter sido aberta no meio)
        if (m.shownResult !== undefined) restartAnimation(m.node, 'stamp');
        const playersById = Object.fromEntries(game.players.map(p => [p.id, p]));
        m.team.replaceChildren(...mission.team.map((id, k) => {
          const face = el('span', 'mini-face');
          face.style.backgroundImage = `url(${cardImage(playersById[id]?.character)})`;
          face.style.setProperty('--k', k);
          return face;
        }));
      }
    } else {
      m.info.textContent = mission.needsTwo ? `${mission.size} pessoas · só cai com 2 sabotagens` : `${mission.size} pessoas`;
      m.team.replaceChildren();
    }
    m.node.classList.toggle('needs-two', mission.needsTwo && !shown);
    m.shownResult = shown;
  });
  for (const path of $('city').querySelectorAll('.route-progress')) {
    path.classList.toggle('done', Number(path.dataset.segment) < view.results);
  }
}

function drawRejections() {
  const box = $('rejections');
  const max = latest?.game?.maxRejections ?? 5;
  if (!box.children.length) {
    const slots = el('span', 'rejection-slots');
    for (let i = 0; i < max; i++) {
      const slot = el('span', `rejection-slot${i === max - 1 ? ' last' : ''}`);
      slot.append(el('span', 'slot-number', String(i + 1)), el('span', 'slot-x', '✗'));
      slots.append(slot);
    }
    box.append(el('span', 'rejection-label', 'Times recusados'), slots, el('span', 'rejection-note', `No ${max}º, os espiões vencem`));
  }
  box.classList.toggle('hidden', view.ended);
  [...box.querySelectorAll('.rejection-slot')].forEach((slot, i) => {
    const on = i < view.rejections;
    if (on && !slot.classList.contains('on')) restartAnimation(slot, 'stamp');
    slot.classList.toggle('on', on);
  });
}

// ---------------------------------------------------------------- as cartas na mesa

let seatKey = null;
const seats = new Map(); // id → peças da carta

// Monta as cartas uma vez por partida (mesmas peças a cada retrato: as animações
// não reiniciam). Devolve true se montou de novo.
function ensureSeats(game) {
  const key = game.players.map(p => `${p.id}:${p.character}`).join(',');
  if (key === seatKey) return false;
  seatKey = key;
  seats.clear();
  const row = $('table-players');
  const n = game.players.length;
  const avail = row.clientWidth || window.innerWidth - 72;
  const top = row.getBoundingClientRect().top || window.innerHeight * 0.66;
  const byHeight = Math.floor((window.innerHeight - top - 30 - 92) / 1.624); // folga: plaquinha, status e rodapé
  row.style.setProperty('--card-w', `${Math.max(110, Math.min(180, byHeight, Math.floor((avail - (n - 1) * 14) / n)))}px`);
  row.replaceChildren(...game.players.map(({ id, character }, i) => {
    const li = el('li', 'seat-card');
    li.style.setProperty('--i', i);
    const card = el('div', 'card3d');
    const inner = el('div', 'card-inner');
    const front = el('img', 'face front');
    front.src = cardImage(character);
    front.alt = personagem(character)?.name ?? '';
    const back = el('div', 'face back');
    back.append(el('span', 'back-x', 'X'), el('span', 'back-word', 'Resistência'));
    inner.append(front, back);
    const badge = el('span', 'commander-badge');
    badge.append(el('span', 'ct-star', '★'), el('span', 'ct-label', 'Comanda'));
    const teamToken = el('span', 'team-token');
    const vote = el('span', 'vote-token');
    const voteInner = el('span', 'vt-inner');
    const voteFront = el('span', 'vt-front');
    voteInner.append(el('span', 'vt-back', 'X'), voteFront);
    vote.append(voteInner);
    const chip = el('span', 'mission-chip');
    const stamp = el('span', 'role-stamp');
    const seen = el('span', 'seen-mark', '✓');
    card.append(inner, teamToken, vote, chip, seen, stamp, badge);
    const plate = el('div', 'plate');
    const plateName = el('span', 'plate-name');
    const plateStatus = el('span', 'plate-status');
    plate.append(el('span', 'plate-avatar'), plateName, plateStatus);
    li.append(card, plate);
    seats.set(id, { li, card, inner, badge, teamToken, vote, voteFront, chip, stamp, seen, plate, plateName, plateStatus, avatarKey: null, voteState: null, chipOn: false, teamOn: false });
    return li;
  }));
  return true;
}

function drawSeats(lobby, game, byId) {
  const pendingResult = view.results < resultCount(game) ? game.missions[view.results] : null;
  game.players.forEach(({ id }, index) => {
    const seat = seats.get(id);
    if (!seat) return;
    const info = byId[id] ?? {};
    const avatarKey = `${info.color}:${info.name}`;
    if (seat.avatarKey !== avatarKey) {
      seat.avatarKey = avatarKey;
      seat.plate.querySelector('.plate-avatar').replaceChildren(makeAvatar(info.color, info.name));
    }
    seat.plateName.textContent = id === lobby.leaderId ? `${info.name} 👑` : info.name ?? '?';
    seat.li.classList.toggle('offline', info.online === false);
    seat.plateStatus.textContent = plateStatus(game, id, info);

    // no time: o time da missão sendo revelada; senão, o que o comandante monta
    const team = pendingResult ? pendingResult.team : game.stage === 'pick' ? game.draft : game.team;
    const inTeam = !view.ended && team.includes(id);
    if (inTeam && !seat.teamOn) restartAnimation(seat.teamToken, 'drop');
    seat.teamOn = inTeam;
    seat.li.classList.toggle('in-team', inTeam);

    // ficha de voto: virada para baixo enquanto votam; virada para cima depois
    const voteState = voteTokenState(game, id);
    if (voteState !== seat.voteState) {
      seat.vote.className = `vote-token${voteState ? ` show ${voteState}` : ''}`;
      if (voteState === 'down') restartAnimation(seat.vote, 'drop');
      if (voteState === 'yes' || voteState === 'no') {
        seat.voteFront.textContent = voteState === 'yes' ? '👍' : '👎';
        seat.vote.style.setProperty('--i', index);
        if (seat.voteState === 'down') restartAnimation(seat.vote, 'flip');
      }
      seat.voteState = voteState;
    }

    // carta da missão (virada para baixo) de quem já escolheu
    const chipOn = !view.collecting && (game.stage === 'mission' ? game.chosen.includes(id) : Boolean(pendingResult?.team.includes(id)));
    if (chipOn && !seat.chipOn) restartAnimation(seat.chip, 'drop');
    seat.chip.classList.toggle('show', chipOn);
    seat.chipOn = chipOn;

    seat.seen.classList.toggle('show', game.stage === 'roles' && game.seen.includes(id));
    seat.li.classList.toggle('looking', game.stage === 'roles' && !game.seen.includes(id));

    // fim: o papel de cada um (carimbo)
    const role = view.ended && game.spies ? (game.spies.includes(id) ? 'espiao' : 'resistencia') : '';
    if (seat.li.dataset.role !== role) {
      seat.li.dataset.role = role;
      seat.stamp.textContent = role === 'espiao' ? 'Espião' : role === 'resistencia' ? 'Resistência' : '';
    }
  });
}

function plateStatus(game, id, info) {
  if (info.online === false) return 'reconectando…';
  if (game.stage === 'roles') return game.seen.includes(id) ? 'já viu o papel' : 'olhando o papel…';
  if (game.stage === 'vote') return game.voted.includes(id) ? 'votou' : 'votando…';
  if (game.stage === 'mission' && game.team.includes(id)) return game.chosen.includes(id) ? 'escolheu' : 'escolhendo…';
  return '';
}

function voteTokenState(game, id) {
  if (game.stage === 'vote') return game.voted.includes(id) ? 'down' : null;
  const vote = game.lastVote;
  if (!vote || !(id in vote.votes) || view.ended) return null;
  if (view.voteKey !== voteKey(vote)) return 'down'; // ainda vai ser revelado
  if (vote.mission < view.results) return null; // a missão desse time já foi revelada
  return vote.votes[id] ? 'yes' : 'no';
}

// A ficha de comanda voa de uma carta para a outra.
function moveCommander(id) {
  const before = view.commander;
  view.commander = id;
  for (const [seatId, seat] of seats) seat.li.classList.toggle('commander', seatId === id);
  if (!id || before === id) return;
  const to = seats.get(id)?.badge;
  const from = before ? seats.get(before)?.badge : null;
  if (!to) return;
  if (!from) {
    restartAnimation(to, 'badge-pop');
    return;
  }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const flyer = to.cloneNode(true);
  flyer.classList.add('flying');
  flyer.style.left = `${a.left}px`;
  flyer.style.top = `${a.top}px`;
  document.body.append(flyer);
  to.classList.add('waiting');
  const dx = b.left - a.left;
  const dy = b.top - a.top;
  flyer.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
    { transform: `translate(${dx / 2}px, ${dy / 2 - 160}px) scale(1.7) rotate(-200deg)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(-360deg)` },
  ], { duration: 1100, easing: 'cubic-bezier(.45,.05,.3,1)' }).finished.then(() => {
    flyer.remove();
    to.classList.remove('waiting');
    restartAnimation(to, 'badge-pop');
  });
}

// ---------------------------------------------------------------- animações grandes

// Começo: o baralho no meio da mesa e cada carta voando para o seu lugar, virando.
async function dealCards(gen) {
  const reveal = $('reveal');
  const deck = el('div', 'deck');
  for (let k = 0; k < 6; k++) {
    const card = el('div', 'deck-card');
    card.style.setProperty('--k', k);
    card.append(el('span', 'back-x', 'X'));
    deck.append(card);
  }
  reveal.replaceChildren(deck);
  play('deal');
  await wait(500);
  if (gen !== generation) return;
  const center = deck.getBoundingClientRect();
  const cx = center.left + center.width / 2;
  const cy = center.top + center.height / 2;
  for (const seat of seats.values()) {
    const r = seat.card.getBoundingClientRect();
    seat.li.style.setProperty('--dx', `${cx - (r.left + r.width / 2)}px`);
    seat.li.style.setProperty('--dy', `${cy - (r.top + r.height / 2)}px`);
    seat.li.classList.remove('dealt', 'undealt');
    restartAnimation(seat.li, 'deal');
  }
  await wait(seats.size * 160 + 1400);
  if (gen !== generation) return;
  deck.classList.add('gone');
  for (const seat of seats.values()) seat.li.classList.replace('deal', 'dealt');
  await wait(400);
  deck.remove();
}

// Votos: as fichas viram todas juntas (uma atrás da outra) e o resultado bate na mesa.
async function revealVote(gen, vote) {
  view.voteKey = voteKey(vote);
  if (latest?.game) drawSeats(latest.lobby, latest.game, Object.fromEntries(latest.lobby.players.map(p => [p.id, p])));
  await wait(seats.size * 110 + 700);
  if (gen !== generation) return;
  const ids = Object.keys(vote.votes);
  const approvals = ids.filter(id => vote.votes[id]).length;
  play(vote.approved ? 'approved' : 'rejected');
  await showBanner(gen, vote.approved ? 'Time aprovado' : 'Time recusado', `${approvals} × ${ids.length - approvals}`,
    vote.approved ? 'good' : 'bad', 1700);
  if (gen !== generation) return;
  if (!vote.approved) view.rejections = vote.proposal;
}

// Um carimbo grande no meio do tabuleiro.
async function showBanner(gen, title, sub, kind, hold) {
  const banner = el('div', `banner ${kind}`);
  banner.append(el('span', 'banner-title', title), el('span', 'banner-sub', sub));
  $('reveal').append(banner);
  await wait(hold);
  banner.classList.add('out');
  await wait(450);
  banner.remove();
}

// Missão: as cartas do time vão para o meio, embaralham e viram uma por uma.
async function revealMission(gen, index) {
  const game = latest?.game;
  if (!game) return;
  const mission = game.missions[index];
  const reveal = $('reveal');
  const overlay = el('div', 'mission-reveal');
  const title = el('div', 'mr-title');
  title.append(el('span', 'mr-kicker', `Missão ${index + 1}`), el('span', 'mr-name', MISSION_NAMES[index]));
  const table = el('div', 'mr-table');
  overlay.append(title, table);
  reveal.append(overlay);
  view.collecting = true;
  drawSeats(latest.lobby, latest.game, Object.fromEntries(latest.lobby.players.map(p => [p.id, p])));

  // as cartas em ordem sorteada (ninguém sabe de quem é cada uma)
  const faces = Array.from({ length: mission.team.length }, (_, k) => (k < mission.sabotages ? 'sabotar' : 'sucesso'));
  for (let k = faces.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [faces[k], faces[j]] = [faces[j], faces[k]];
  }
  const n = faces.length;
  const slot = k => `${(k - (n - 1) / 2) * 118}%`;
  const cards = faces.map(face => {
    const card = el('div', `mr-card ${face}`);
    const inner = el('div', 'mr-inner');
    const back = el('div', 'mr-face mr-back');
    back.append(el('span', 'back-x', 'X'), el('span', 'mr-back-word', 'Missão'));
    const front = el('div', 'mr-face mr-front');
    front.append(el('span', 'mr-mark', face === 'sabotar' ? '✗' : '✓'), el('span', 'mr-word', face === 'sabotar' ? 'Sabotagem' : 'Sucesso'));
    inner.append(back, front);
    card.append(inner);
    table.append(card);
    return card;
  });
  await wait(80);
  overlay.classList.add('in');
  if (speed === 1) play('tension'); // coração batendo (com fila acumulada, pula)
  await wait(500);
  if (gen !== generation) return;
  // espalham em fila
  cards.forEach((card, k) => { card.style.setProperty('--x', slot(k)); });
  await wait(650);
  // embaralham: duas trocas de lugar
  const order = cards.map((_, k) => k);
  for (let s = 0; s < (n > 1 ? 2 : 0); s++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a === b) b = (a + 1) % n;
    [order[a], order[b]] = [order[b], order[a]];
    cards.forEach((card, k) => {
      card.style.setProperty('--x', slot(order[k]));
      card.classList.toggle('lift', k === a || k === b);
    });
    await wait(520);
  }
  cards.forEach(card => card.classList.remove('lift'));
  await wait(350);
  if (gen !== generation) return;
  // viram da esquerda para a direita
  const byPlace = [...cards].sort((p, q) => order[cards.indexOf(p)] - order[cards.indexOf(q)]);
  for (const card of byPlace) {
    card.classList.add('flipped');
    if (card.classList.contains('sabotar')) {
      await wait(260);
      play('sabotage');
      restartAnimation(overlay, 'hit');
      await wait(560);
    } else {
      await wait(720);
    }
    if (gen !== generation) return;
  }
  await wait(300);
  const ok = mission.result === 'sucesso';
  const banner = el('div', `banner ${ok ? 'good' : 'bad'}`);
  banner.append(el('span', 'banner-title', ok ? 'Missão cumprida' : 'Missão sabotada'), el('span', 'banner-sub', sabotageText(mission.sabotages)));
  overlay.append(banner);
  play(ok ? 'missionOk' : 'missionFail');
  await wait(1900);
  if (gen !== generation) return;
  overlay.classList.add('out');
  await wait(450);
  overlay.remove();
  view.collecting = false;
  view.results = index + 1;
  view.rejections = 0;
}

// Fim: cada carta ganha o carimbo do papel; espião treme em vermelho.
async function revealRoles(gen) {
  const game = latest?.game;
  if (!game) return;
  view.ended = true;
  drawGame(latest.lobby, game);
  const win = game.winner === 'resistencia';
  const banner = el('div', `banner final ${win ? 'good' : 'bad'}`);
  banner.append(el('span', 'banner-title', win ? 'A Resistência venceu!' : 'Os espiões venceram!'),
    el('span', 'banner-sub', game.winReason === 'recusas' ? `${game.maxRejections} times recusados seguidos`
      : win ? '3 missões cumpridas' : '3 missões sabotadas'));
  await wait(seats.size * 280 + 600);
  if (gen !== generation) return;
  $('reveal').append(banner);
  play(win ? 'resistanceWins' : 'spiesWin');
}

window.addEventListener('resize', () => {
  if (!latest?.game) return;
  seatKey = null; // remonta as cartas com o tamanho novo
  ensureSeats(latest.game);
  for (const seat of seats.values()) seat.li.classList.add('dealt');
  drawGame(latest.lobby, latest.game);
});
