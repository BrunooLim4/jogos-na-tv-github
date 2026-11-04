// Tela da TV do Stop: só escuta (não manda comandos). A letra no alto, as categorias
// enquanto escrevem, as respostas de todos na correção, o placar e os jogadores ao lado.
//
// REVELAÇÕES (padrão Resistência, ../conhecimento/padrao-resistencia.md): cada lance
// novo vira uma animação na FILA (fila.js), uma de cada vez, com o som dentro dela:
// a roleta da letra, o STOP!, o tempo esgotado, a correção começando, os pontos de cada
// categoria e o placar da rodada. Enquanto a fila anda, o resto não é redesenhado;
// quando ela esvazia, drawAll() acerta tudo pelo retrato mais novo (TV aberta no meio da
// partida: nada do passado anima).
//
// A CARA (visual.css): programa de auditório. A letra e o letreiro da sala têm lâmpadas
// que correm em volta (addBulbs); a roleta é um letreiro grande; STOP! e o fim têm raios
// girando atrás; o fim tem confete.
//
// PRIVACIDADE: enquanto escrevem, a TV só sabe QUANTAS categorias cada um preencheu.
import { connect } from './net.js';
import { makeAvatar, sameImage, addBulbs } from './ui.js';
import { CHARACTERS } from './characters.js';
import { createSound } from './sound.js';
import { createQueue, restartAnimation } from './fila.js';
import { LETTERS, TIMES, ROULETTE_STEPS } from './stop.js';

const $ = id => document.getElementById(id);

let currentCode = null;
let lastEventId = null; // null = ainda não viu nenhum evento (não anima nem toca nada do passado)
let prev = null;
let latest = null;
let byId = {};
let clockOffset = 0; // relógio do servidor − relógio daqui
// O que a TV JÁ mostrou: a lista de jogadores desenha os pontos daqui (senão o placar
// subiria antes da animação da correção).
let view = { scores: {} };

const nameOf = id => byId[id]?.name ?? '?';
const serverNow = () => Date.now() + clockOffset;

// ---------------------------------------------------------------- palco

// A sala e a partida: o mesmo palco de 1920 × 1080, escalado para a tela.
function fitStage() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  const left = (innerWidth - 1920 * scale) / 2;
  const top = (innerHeight - 1080 * scale) / 2;
  for (const stage of document.querySelectorAll('.stage')) stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}
addEventListener('resize', fitStage);
fitStage();

// as lâmpadas do letreiro da sala e da letra da rodada (medidas em tv.css)
addBulbs($('sign'), { width: 720, height: 210, radius: 40, offset: -25, count: 54 });
addBulbs($('letter'), { width: 170, height: 170, radius: 28, offset: 8, count: 27 });

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

// ---------------------------------------------------------------- sala

const avatar = sameImage(key => {
  const [color, name] = key.split(':');
  return makeAvatar(color, name);
});

function renderLobby(lobby) {
  if (lobby.code !== currentCode) {
    currentCode = lobby.code;
    // O código entra na URL só para o navegador não reaproveitar um QR antigo.
    $('qr').src = `/qr.svg?sala=${lobby.code}`;
    $('join-url').textContent = lobby.joinUrl.replace(/^https?:\/\//, '');
  }
  // Som (e a bancada acendendo): alguém entrou na sala.
  const before = prev?.lobby?.phase === 'lobby' ? prev.lobby.players : null;
  const arrived = new Set(before ? lobby.players.filter(p => !before.find(b => b.id === p.id)).map(p => p.id) : []);
  if (arrived.size) play('join');
  lastEventId = null;

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
  const freeColors = Object.keys(CHARACTERS).filter(c => !lobby.players.some(p => p.color === c));
  $('seats').replaceChildren(...Array.from({ length: lobby.maxPlayers }, (_, i) => {
    const player = lobby.players[i];
    const li = document.createElement('li');
    // a bancada do participante: a bolinha em cima, o nome no visor e a luz de pronto
    const desk = el('div', 'desk');
    const name = el('span', 'name');
    desk.append(name);
    if (!player) {
      li.className = 'seat free';
      name.textContent = 'Lugar livre';
      desk.append(el('span', 'status waiting', i < lobby.minPlayers ? 'falta gente' : 'opcional'));
      li.append(makeAvatar(freeColors.shift() ?? 'azul', '?'), desk);
      return li;
    }
    li.className = `seat${player.online ? '' : ' offline'}${arrived.has(player.id) ? ' join' : ''}`;
    name.textContent = player.id === lobby.leaderId ? `${player.name} 👑` : player.name;
    desk.append(el('span', `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`,
      !player.online ? 'reconectando…' : player.ready ? 'pronto' : 'se preparando'));
    li.append(avatar(`${player.color}:${player.name}`), desk);
    return li;
  }));
  $('start-hint').textContent = startHintText(lobby);
}

function startHintText(lobby) {
  const { players, minPlayers } = lobby;
  if (players.length < minPlayers) {
    const missing = minPlayers - players.length;
    return players.length === 0
      ? `Precisa de pelo menos ${minPlayers} jogadores. O primeiro a entrar vira o líder 👑.`
      : `Falta${missing > 1 ? 'm' : ''} mais ${missing} jogador${missing > 1 ? 'es' : ''} para começar.`;
  }
  const offline = players.filter(p => !p.online).map(p => p.name);
  if (offline.length) return `Esperando ${offline.join(', ')} reconectar.`;
  const notReady = players.filter(p => !p.ready).map(p => p.name);
  if (notReady.length) return `Esperando ${notReady.join(', ')} ficar pronto.`;
  const leader = players.find(p => p.id === lobby.leaderId);
  return `Tudo pronto! ${leader ? leader.name : 'O líder'} 👑 começa a partida pelo celular.`;
}

// ---------------------------------------------------------------- a mesa

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// "Leo venceu com 160 pontos!" — empate no 1º lugar: "Leo e Gabi venceram com 160 pontos!"
function winnersText(ranking) {
  const names = ranking.filter(r => r.place === 1).map(r => nameOf(r.id));
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
  return `${who} ${names.length > 1 ? 'venceram' : 'venceu'} com ${ranking[0].score} pontos!`;
}

function setHeading(title, sub = '') {
  $('heading').textContent = title;
  $('sub').textContent = sub;
}

// As categorias desta rodada (enquanto escrevem).
function drawCategories(game, animate = false) {
  const grid = el('div', 'cats');
  game.categories.forEach((category, i) => {
    const tile = el('div', `cat${animate ? ' in' : ''}`, category);
    if (animate) tile.style.animationDelay = `${i * 90}ms`;
    grid.append(tile);
  });
  $('board').replaceChildren(grid);
}

// As respostas de uma categoria (na correção). `result` = já corrigida (com os pontos).
function drawAnswers(answers, { result = false, animate = false } = {}) {
  const grid = el('div', `answers-tv${animate ? ' animate' : ''}`); // animate: "NÃO VALE" bate e a placa treme
  grid.style.setProperty('--cols', answers.length <= 4 ? answers.length : answers.length <= 6 ? 3 : 5);
  answers.forEach((answer, i) => {
    const info = byId[answer.playerId] ?? {};
    const card = el('div', `ans ${answer.status}`);
    const who = el('div', 'ans-who');
    who.append(makeAvatar(info.color, info.name ?? '?'), el('span', '', info.name ?? '?'));
    const text = el('div', 'ans-text', answer.text || '(em branco)');
    if (answer.status === 'letra') text.title = 'não começa com a letra';
    card.append(who, text, el('span', 'ans-votes', answer.votes ? `👎 ${answer.votes}` : ''));
    if (result) {
      const points = el('span', `ans-points${answer.points === 0 ? ' zero' : answer.shared ? ' shared' : ''}${animate ? ' pop' : ''}`, answer.points ? `+${answer.points}` : '0');
      if (animate) points.style.animationDelay = `${i * 120}ms`;
      card.append(points);
    }
    grid.append(card);
  });
  $('board').replaceChildren(grid);
}

// O placar da rodada (e o final).
function drawTable(game, points, animate = false) {
  const sorted = [...game.players].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  const list = el('ol', 'round-table');
  const placeOf = id => sorted.findIndex(o => (view.scores[o.id] ?? 0) === (view.scores[id] ?? 0)) + 1; // empate = mesmo lugar
  sorted.forEach((stats, i) => {
    const info = byId[stats.id] ?? {};
    const li = el('li', `${placeOf(stats.id) === 1 ? 'first' : ''}${animate ? ' in' : ''}`);
    if (animate) li.style.animationDelay = `${(sorted.length - 1 - i) * 160}ms`;
    li.append(el('span', 'place', `${placeOf(stats.id)}º`), makeAvatar(info.color, info.name ?? '?'), el('span', '', info.name ?? '?'),
      el('span', 'gain', points ? `+${points[stats.id] ?? 0}` : ''), el('span', 'total', String(view.scores[stats.id] ?? 0)));
    list.append(li);
  });
  $('board').replaceChildren(list);
}

// Os jogadores ao lado: quanto preencheu (escrevendo), se já conferiu (correção), pontos.
function drawPlayers(game, gains = null) {
  const leaderId = latest?.lobby?.leaderId;
  const writing = game.stage === 'escrevendo' || game.stage === 'parando';
  const sorted = [...game.players].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  $('players').replaceChildren(...sorted.map(stats => {
    const info = byId[stats.id] ?? {};
    const li = el('li', 'st-player');
    li.classList.toggle('offline', info.online === false);
    li.classList.toggle('stopper', game.stopperId === stats.id && game.stage === 'parando');
    const who = el('div', 'st-player-who');
    who.append(el('span', 'st-player-name', stats.id === leaderId ? `${info.name ?? '?'} 👑` : info.name ?? '?'));
    if (writing) {
      const dots = el('div', 'st-dots');
      for (let i = 0; i < game.categories.length; i++) dots.append(el('i', i < (stats.filled ?? 0) ? 'on' : ''));
      who.append(dots);
    } else if (game.stage === 'correcao') {
      who.append(el('span', 'st-player-note', stats.ready ? 'tudo certo ✓' : 'conferindo…'));
    }
    const score = el('span', 'st-score', String(view.scores[stats.id] ?? 0));
    if (gains?.[stats.id]) score.append(el('span', 'gain', `+${gains[stats.id]}`));
    li.append(avatar(`${info.color}:${info.name}`), who, score);
    return li;
  }));
}

function drawTop(game) {
  $('round-label').textContent = `Rodada ${game.round} de ${game.totalRounds}`;
  $('letter-text').textContent = game.letter;
}

// Desenha a mesa inteira, sem animação, pelo retrato mais novo.
function drawAll() {
  const game = latest?.game;
  if (!game || latest.lobby.phase !== 'playing') return;
  view.scores = Object.fromEntries(game.players.map(p => [p.id, p.score]));
  drawTop(game);
  if (game.stage === 'escrevendo' || game.stage === 'parando') {
    setHeading('Preencham as categorias!', `Uma palavra com a letra ${game.letter} em cada uma. Quem terminar primeiro aperta STOP no celular.`);
    drawCategories(game);
  } else if (game.stage === 'correcao') {
    const review = game.review;
    setHeading(`Correção: ${review.category}`, `Categoria ${review.index + 1} de ${game.categories.length}. Não gostou de uma resposta? Vote contra no celular (👎).`);
    drawAnswers(review.answers);
  } else if (game.stage === 'placar') {
    setHeading(`Placar da rodada ${game.round}`, `${nameOf(latest.lobby.leaderId)} 👑 começa a próxima rodada pelo celular.`);
    drawTable(game, game.roundPoints);
  } else if (game.stage === 'fim') {
    setHeading('Fim de jogo!', winnersText(game.ranking));
    drawTable(game, null);
  }
  drawPlayers(game);
  updateClock();
}

// O relógio e a barra do tempo.
function updateClock() {
  const game = latest?.game;
  if (!game || latest.lobby.phase !== 'playing') return;
  const now = serverNow();
  let start = null;
  let end = null;
  let label = '';
  if (game.stage === 'escrevendo' && now >= game.writingStartsAt) [start, end, label] = [game.writingStartsAt, game.deadline, 'para escrever'];
  else if (game.stage === 'parando') [start, end, label] = [game.stopAt - TIMES.stop, game.stopAt, 'STOP!'];
  else if (game.stage === 'correcao') [start, end, label] = [game.review.endsAt - TIMES.review, game.review.endsAt, 'nesta categoria'];
  const clock = $('clock');
  const bar = $('timebar');
  if (start === null) {
    clock.textContent = '';
    bar.style.width = '0';
    return;
  }
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  clock.innerHTML = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}<small>${label}</small>`;
  clock.classList.toggle('late', left <= 10);
  bar.style.width = `${Math.max(0, Math.min(1, (end - now) / (end - start))) * 100}%`;
  bar.classList.toggle('late', left <= 10);
}
setInterval(updateClock, 250);

// ---------------------------------------------------------------- revelações

const fila = createQueue({ onIdle: drawAll });

// Um carimbo grande por cima de tudo: entra batendo, fica e sai. `rays` = raios girando
// atrás (STOP! e fim de jogo).
async function stamp(gen, title, sub = '', hold = 1600, variant = '', rays = '') {
  const back = rays ? el('div', `rays ${rays}`) : null;
  const banner = el('div', `banner ${variant}`.trim());
  banner.append(el('span', 'banner-title', title));
  if (sub) banner.append(el('span', 'banner-sub', sub));
  if (back) $('reveal').append(back);
  $('reveal').append(banner);
  await fila.wait(hold);
  if (fila.stale(gen)) { // a partida mudou no meio
    banner.remove();
    back?.remove();
    return;
  }
  banner.classList.add('out');
  back?.classList.add('out');
  await fila.wait(450);
  banner.remove();
  back?.remove();
}

// A roleta: o letreiro grande; as letras passam rápido e vão desacelerando até parar
// na da rodada (as lâmpadas correm rápido e piscam juntas quando para). O som recebe
// os mesmos intervalos, para cada clique cair numa letra.
async function roulette(gen, letter) {
  const box = el('div', 'roulette');
  const face = el('span', 'roulette-face', '?');
  box.append(face);
  const bulbs = addBulbs(box, { width: 420, height: 420, radius: 70, offset: 17, count: 45 });
  bulbs.classList.add('fast');
  $('reveal').append(box);
  const speed = fila.speed;
  play('roulette', ROULETTE_STEPS.map(d => d * speed));
  let elapsed = 0;
  for (const [i, delay] of ROULETTE_STEPS.entries()) {
    if (fila.stale(gen)) return box.remove();
    face.textContent = i === ROULETTE_STEPS.length - 1 ? letter : LETTERS[Math.floor(Math.random() * LETTERS.length)];
    elapsed += delay;
    await fila.wait(delay);
  }
  restartAnimation(box, 'land');
  bulbs.classList.replace('fast', 'flash');
  play('letter');
  await fila.wait(Math.max(700, TIMES.roulette - elapsed - 500));
  box.classList.add('out');
  await fila.wait(450);
  box.remove();
}

// Confete caindo por cima de tudo (fim de jogo).
function confetti(count = 140) {
  const colors = ['#ffcf3f', '#ff3d8b', '#33e1ff', '#3cf2a0', '#ffffff', '#a66bff'];
  const layer = el('div', 'confetti');
  for (let i = 0; i < count; i++) {
    const piece = el('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty('--c', colors[i % colors.length]);
    piece.style.setProperty('--d', `${(2.6 + Math.random() * 2.2).toFixed(2)}s`);
    piece.style.setProperty('--delay', `${(Math.random() * 1.6).toFixed(2)}s`);
    piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 360)}px`);
    piece.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 1440)}deg`);
    layer.append(piece);
  }
  $('reveal').append(layer);
  setTimeout(() => layer.remove(), 6800);
}

const REVEAL = {
  round: async (gen, event) => {
    const game = latest.game;
    $('letter-text').textContent = '?';
    $('round-label').textContent = `Rodada ${event.round} de ${game.totalRounds}`;
    setHeading(`Rodada ${event.round}`, 'Sorteando a letra…');
    $('board').replaceChildren();
    view.scores = Object.fromEntries(game.players.map(p => [p.id, view.scores[p.id] ?? 0]));
    await roulette(gen, event.letter);
    if (fila.stale(gen)) return;
    $('letter-text').textContent = event.letter;
    restartAnimation($('letter'), 'pop');
    setHeading('Preencham as categorias!', `Uma palavra com a letra ${event.letter} em cada uma. Quem terminar primeiro aperta STOP no celular.`);
    drawCategories(game, true);
    await fila.wait(900);
  },
  stop: async (gen, event) => {
    play('stop');
    await stamp(gen, 'STOP!', `${nameOf(event.playerId)} terminou! Os outros têm 3 segundos…`, 1300, 'stop', 'pink');
    for (const n of [3, 2, 1]) {
      if (fila.stale(gen)) return;
      const count = el('div', 'countdown', String(n));
      $('reveal').append(count);
      play('tick', n);
      setTimeout(() => count.remove(), 1000);
      await fila.wait(fila.speed < 1 ? 300 : 520);
    }
  },
  time: async gen => {
    play('timeUp');
    await stamp(gen, 'Tempo esgotado!', 'Acabou a rodada.', 1500, 'time');
  },
  review: async gen => {
    play('review');
    await stamp(gen, 'Correção!', 'Categoria por categoria. Vote contra no celular a resposta que não vale.', 1700);
  },
  category: async (gen, event) => {
    const { result } = event;
    setHeading(`Correção: ${result.category}`, 'Sozinho: 10 · igual a de alguém: 5 · em branco, letra errada ou excluída: 0');
    drawAnswers(result.answers, { result: true, animate: true });
    play('points', result.answers.some(a => a.status === 'excluida'));
    await fila.wait(1500 + result.answers.length * 120);
  },
  roundEnd: async (gen, event) => {
    const game = latest.game;
    for (const [id, points] of Object.entries(event.points)) view.scores[id] = (view.scores[id] ?? 0) + points;
    setHeading(`Placar da rodada ${event.round}`, '');
    drawTable(game, event.points, true);
    drawPlayers(game, event.points);
    play('scores');
    await fila.wait(1200 + game.players.length * 160);
  },
  finish: async (gen, event) => {
    play('fanfare');
    if (fila.speed === 1) confetti();
    await stamp(gen, 'Fim de jogo!', winnersText(event.ranking), 2600, 'finish', 'gold');
  },
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
  byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  if (game) clockOffset = game.now - Date.now();

  const playing = lobby.phase === 'playing' && game;
  $('lobby-view').classList.toggle('hidden', playing);
  $('game-view').classList.toggle('hidden', !playing);
  latest = state;
  if (playing) {
    onGameState(game);
    if (!fila.running) drawAll();
    else if (game.stage === 'escrevendo' || game.stage === 'parando') drawPlayers(game); // o quanto cada um preencheu, ao vivo
  } else {
    fila.reset();
    $('reveal').replaceChildren();
    renderLobby(lobby);
  }
  prev = state;
}

// Retrato novo: o que aconteceu de novo vira revelação na fila. (Saiu da sala ou outra
// partida começou: do zero; TV aberta no meio da partida: nada do passado anima.)
function onGameState(game) {
  const newestId = Math.max(0, ...game.events.map(e => e.id));
  const justStarted = prev?.lobby?.phase === 'lobby' || (lastEventId !== null && newestId < lastEventId);
  if (justStarted) {
    fila.reset();
    $('reveal').replaceChildren();
    view.scores = {};
  }
  const fresh = justStarted ? game.events : lastEventId === null ? [] : game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(justStarted ? 0 : lastEventId ?? 0, newestId);
  for (const event of fresh) {
    const reveal = REVEAL[event.kind];
    if (reveal) fila.add(gen => reveal(gen, event));
  }
}
