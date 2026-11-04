// Tela da TV: só escuta (não manda comandos). Mostra o tabuleiro de 480 cores,
// a dica, os cones e o placar.
//
// REVELAÇÕES (padrão Resistência, ../conhecimento/padrao-resistencia.md): cada
// lance novo do servidor vira uma animação na FILA (fila.js), uma de cada vez, com
// o som tocando dentro da animação. Enquanto a fila anda, a mesa não é redesenhada;
// quando ela esvazia, drawAll() desenha tudo a partir do retrato mais novo (é também
// o que acontece com uma TV aberta no meio da partida: nada do passado anima).
import { connect } from './net.js';
import { makeAvatar, sameImage } from './ui.js';
import { CHARACTERS } from './characters.js';
import { createSound } from './sound.js';
import { createQueue, restartAnimation } from './fila.js';
import { BOARD, ROWS, COLS, ROW_LETTERS, rowOf, colOf, cellName } from './cores.js';
import { TEMPOS } from './tempos.js';

const $ = id => document.getElementById(id);
const CELL = 47; // tamanho de cada casa no palco de 1920 × 1080
const GUTTER = 34; // espaço das letras e números em volta do tabuleiro

let currentCode = null;
let lastEventId = null; // null = ainda não viu nenhum evento (não anima nem toca nada do passado)
let prev = null; // retrato anterior, para saber o que mudou
let latest = null; // retrato mais novo (desenhado quando a fila esvazia)
let byId = {}; // jogadores da sala (nome, cor, online)
// O que a TV JÁ mostrou (padrão Resistência): a lista de jogadores desenha isto, não
// o retrato mais novo — senão o placar e a vez andam antes da animação.
let view = { round: 1, cueGiverId: null, stage: 'dica1', turnId: null, pieces: [], scores: {} };
let hover = null; // onde o dedo de quem está na vez está apontando { playerId, cell }

// ---------------------------------------------------------------- palco

// O palco tem sempre 1920 × 1080 e é escalado para caber na tela (1536×864 e
// 1280×720 ficam iguais, só menores).
function fitStage() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  const left = (innerWidth - 1920 * scale) / 2;
  const top = (innerHeight - 1080 * scale) / 2;
  $('stage').style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}
addEventListener('resize', fitStage);
fitStage();

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

// ---------------------------------------------------------------- tabuleiro

const cellLeft = cell => colOf(cell) * CELL;
const cellTop = cell => rowOf(cell) * CELL;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Montado uma vez: as 480 casas, as letras e os números, e as camadas por cima.
const layer = $('layer');
const dimmer = el('div', 'hc-dimmer hidden');
const hole = el('div', 'hc-hole');
dimmer.append(hole);
const frame = el('div', 'hc-frame hidden'); // o quadro de pontos (3 × 3)
const ring = el('div', 'hc-ring hidden'); // o anel de fora (5 × 5): vale 1 ponto
const targetMark = el('div', 'hc-target hidden');
const ghost = el('div', 'hc-ghost hidden'); // o cone "flutuando" onde o dedo de quem está na vez aponta
const ghostTag = el('span', 'hc-ghost-tag');
const ghostCell = el('div', 'hc-ghost-cell hidden');
(function buildBoard() {
  $('grid').replaceChildren(...BOARD.map(color => {
    const cell = el('div', 'hc-cell');
    cell.style.background = color;
    return cell;
  }));
  const labels = [];
  for (let c = 0; c < COLS; c++) {
    for (const side of ['top', 'bottom']) {
      const label = el('span', `hc-label hc-col ${side}`, String(c + 1));
      label.style.left = `${GUTTER + c * CELL}px`;
      labels.push(label);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (const side of ['left', 'right']) {
      const label = el('span', `hc-label hc-row ${side}`, ROW_LETTERS[r]);
      label.style.top = `${GUTTER + r * CELL}px`;
      labels.push(label);
    }
  }
  $('labels').replaceChildren(...labels);
  ghost.append(ghostTag);
  layer.append(dimmer, ring, frame, targetMark, ghostCell, ghost);
}());

// Visual "tudo em cores" (visual.css): na sala, uma parede de quadradinhos tirados do
// próprio tabuleiro atrás do logo, e riscos coloridos de "explosão" dos lados.
const RAINBOW = ['#e8232b', '#f47a20', '#fbd116', '#8cc63f', '#1aa260', '#1ebde8', '#3a5fa8', '#8e44ad', '#e91e8c'];
(function buildHero() {
  const tiles = [];
  for (const row of [2, 6, 10, 14]) {
    for (let i = 0; i < 12; i++) {
      const tile = el('i');
      tile.style.background = BOARD[row * COLS + Math.round((i * (COLS - 1)) / 11)];
      tiles.push(tile);
    }
  }
  $('hero-wall').replaceChildren(...tiles);
  for (const [side, colors] of [['left', ['#f47a20', '#e8232b', '#f47a20']], ['right', ['#8cc63f', '#1aa260', '#3a5fa8']]]) {
    document.querySelector(`.bursts.${side}`).replaceChildren(...colors.map(color => {
      const wedge = el('i');
      wedge.style.background = color;
      return wedge;
    }));
  }
}());

// Riscos de explosão em volta da cor certa, na hora em que o quadro cai.
function burstAround(target) {
  for (let i = 0; i < 12; i++) {
    const wedge = el('i', 'hc-burst');
    wedge.style.left = `${cellLeft(target) + CELL / 2}px`;
    wedge.style.top = `${cellTop(target) + CELL / 2}px`;
    wedge.style.setProperty('--a', `${i * 30 + 15}deg`);
    wedge.style.background = RAINBOW[i % RAINBOW.length];
    layer.append(wedge);
    setTimeout(() => wedge.remove(), 2200);
  }
}

// Cones no tabuleiro: um elemento por cone (chave "jogador:1" / "jogador:2"),
// montado uma vez e só mudando de classe.
const cones = new Map();

function makeCone(piece) {
  const info = byId[piece.playerId] ?? {};
  const cone = el('div', 'hc-cone');
  cone.dataset.color = info.color ?? 'azul';
  cone.append(el('span', 'hc-cone-letter', (info.name?.trim()[0] ?? '?').toUpperCase()));
  cone.style.left = `${cellLeft(piece.cell) + CELL / 2}px`;
  cone.style.top = `${cellTop(piece.cell) + CELL / 2}px`;
  layer.append(cone);
  cones.set(`${piece.playerId}:${piece.n}`, cone);
  return cone;
}

function syncCones(pieces) {
  const keys = new Set(pieces.map(p => `${p.playerId}:${p.n}`));
  for (const [key, cone] of cones) {
    if (!keys.has(key)) {
      cone.remove();
      cones.delete(key);
    }
  }
  for (const piece of pieces) {
    if (!cones.has(`${piece.playerId}:${piece.n}`)) makeCone(piece);
  }
}

// De qual rodada é a revelação que está desenhada (para não refazer a cada retrato:
// os números de pontos e o placar final piscariam quando alguém reconecta).
let scoredRound = null;

function clearScoring() {
  scoredRound = null;
  for (const node of [dimmer, frame, ring, targetMark]) node.classList.add('hidden');
  for (const cone of cones.values()) {
    cone.classList.remove('scored', 'miss');
    cone.querySelector('.hc-points')?.remove();
  }
}

// O quadro de pontos em volta da cor certa (e o resto do tabuleiro escurece).
function showFrame(target, animate) {
  const place = (node, size) => {
    node.style.left = `${cellLeft(target) + CELL / 2 - (size * CELL) / 2}px`;
    node.style.top = `${cellTop(target) + CELL / 2 - (size * CELL) / 2}px`;
    node.style.width = node.style.height = `${size * CELL}px`;
    node.classList.remove('hidden');
  };
  place(hole, 5);
  place(frame, 3);
  place(ring, 5);
  place(targetMark, 1);
  dimmer.classList.remove('hidden');
  if (animate) {
    restartAnimation(frame, 'drop');
    restartAnimation(ring, 'fade-in');
    restartAnimation(dimmer, 'fade-in');
    restartAnimation(targetMark, 'pulse');
  }
}

function markCone(piece, animate) {
  const cone = cones.get(`${piece.playerId}:${piece.n}`);
  if (!cone) return;
  if (piece.points > 0) {
    cone.classList.add('scored');
    if (!cone.querySelector('.hc-points')) cone.append(el('span', `hc-points p${piece.points}${animate ? '' : ' still'}`, `+${piece.points}`));
    if (animate) restartAnimation(cone, 'pop');
  } else {
    cone.classList.add('miss');
  }
}

// O cone "flutuando" onde o dedo de quem está na vez aponta (só com a fila parada).
function drawGhost() {
  const game = latest?.game;
  const show = Boolean(hover && game && game.turnId === hover.playerId && hover.cell !== null
    && !game.pieces.some(p => p.cell === hover.cell) && !fila.running);
  ghost.classList.toggle('hidden', !show);
  ghostCell.classList.toggle('hidden', !show);
  if (!show) return;
  const info = byId[hover.playerId] ?? {};
  ghost.dataset.color = info.color ?? 'azul';
  ghostTag.textContent = cellName(hover.cell);
  for (const node of [ghost, ghostCell]) {
    node.style.left = `${cellLeft(hover.cell) + (node === ghost ? CELL / 2 : 0)}px`;
    node.style.top = `${cellTop(hover.cell) + (node === ghost ? CELL / 2 : 0)}px`;
  }
}

// ---------------------------------------------------------------- topo, jogadores

const nameOf = id => byId[id]?.name ?? '?';

function setCue(game, cue1 = game.cue1, cue2 = game.cue2) {
  const giver = nameOf(game.cueGiverId);
  const words = $('cue-words');
  if (!cue1) {
    $('cue-label').textContent = `Vez de ${giver} dar a dica`;
    words.replaceChildren(el('span', 'hc-cue-wait', 'pensando na dica…'));
    return;
  }
  $('cue-label').textContent = `Dica de ${giver}`;
  const chip = cue => (cue.spoken ? el('span', 'hc-cue-chip spoken', '🗣 falada em voz alta') : el('span', 'hc-cue-chip', `“${cue.text}”`));
  const parts = [chip(cue1)];
  if (cue2?.passed) parts.push(el('span', 'hc-cue-pass', '(sem 2ª dica)'));
  else if (cue2) parts.push(el('span', 'hc-cue-arrow', '→'), chip(cue2));
  words.replaceChildren(...parts);
}

function phaseText(game) {
  const giver = nameOf(game.cueGiverId);
  const turn = nameOf(game.turnId);
  switch (game.stage) {
    case 'dica1': return `${giver} está escolhendo uma cor da carta e pensando na dica…`;
    case 'cones1': return `Vez de ${turn} pôr o 1º cone`;
    case 'dica2': return `${giver} vai dar a 2ª dica (até 2 palavras) ou passar`;
    case 'cones2': return `Vez de ${turn} pôr o 2º cone`;
    case 'revelacao': return `A cor era ${cellName(game.result.target)}. ${nameOf(game.nextCueGiverId)} começa a próxima rodada pelo celular.`;
    case 'fim': return 'Fim de jogo!';
    default: return '';
  }
}

function setPhase(text) {
  $('phase').textContent = text;
}

// Bolinhas reaproveitadas entre uma atualização e outra (não piscam).
const avatar = sameImage(key => {
  const [color, name] = key.split(':');
  return makeAvatar(color, name);
});

// Quem põe o cone agora, pelo que a TV já mostrou: 1ª volta em sentido horário depois
// de quem dá a dica, 2ª ao contrário (a TV aberta descansada usa o do servidor).
function turnOf(v) {
  if (v.stage !== 'cones1' && v.stage !== 'cones2') return null;
  const ids = latest.game.players.map(p => p.id);
  const giver = ids.indexOf(v.cueGiverId);
  const order = [...ids.slice(giver + 1), ...ids.slice(0, giver)];
  if (v.stage === 'cones2') order.reverse();
  const n = v.stage === 'cones1' ? 1 : 2;
  return order.find(id => !v.pieces.some(p => p.playerId === id && p.n === n)) ?? null;
}

// A lista de jogadores ao lado do tabuleiro (de `view`). `gains` = pontos que acabaram de ganhar.
function drawPlayers(gains = null) {
  const leaderId = latest?.lobby?.leaderId;
  const giving = id => id === view.cueGiverId && view.stage !== 'fim';
  $('players').replaceChildren(...latest.game.players.map(stats => {
    const info = byId[stats.id] ?? {};
    const li = el('li', 'hc-player');
    li.dataset.color = info.color ?? '';
    li.classList.toggle('offline', info.online === false);
    li.classList.toggle('giver', giving(stats.id));
    li.classList.toggle('turn', stats.id === view.turnId);
    const who = el('span', 'hc-player-who');
    who.append(el('span', 'hc-player-name', stats.id === leaderId ? `${info.name ?? '?'} 👑` : info.name ?? '?'));
    let note = '';
    if (info.online === false) note = 'reconectando…';
    else if (giving(stats.id)) note = 'dá a dica';
    else if (stats.id === view.turnId) note = 'pondo o cone…';
    who.append(el('span', 'hc-player-note', note));
    const dots = el('span', 'hc-player-cones');
    if (stats.id !== view.cueGiverId) {
      for (const n of [1, 2]) {
        const dot = el('i', 'hc-dot');
        dot.classList.toggle('on', view.pieces.some(p => p.playerId === stats.id && p.n === n));
        dots.append(dot);
      }
    }
    const score = el('span', 'hc-score', String(view.scores[stats.id] ?? 0));
    li.append(avatar(`${info.color}:${info.name}`), who, dots, score);
    if (gains?.[stats.id]) {
      const gain = el('span', 'hc-gain', `+${gains[stats.id]}`);
      li.append(gain);
    }
    return li;
  }));
}

function drawTop(round, totalRounds, playerCount) {
  $('round-label').textContent = `Rodada ${round} de ${totalRounds}`;
  $('legend-giver').textContent = `Quem dá a dica ganha ${playerCount === 3 ? 2 : 1} por cone dentro do quadro.`;
}

// Desenha a mesa inteira, sem animação, a partir do retrato mais novo.
function drawAll() {
  if (!latest?.game) return;
  const { game } = latest;
  view = {
    round: game.round,
    cueGiverId: game.cueGiverId,
    stage: game.stage,
    turnId: game.turnId,
    pieces: [...game.pieces],
    scores: Object.fromEntries(game.players.map(p => [p.id, p.score])),
  };
  drawTop(game.round, game.totalRounds, game.players.length);
  setCue(game);
  setPhase(phaseText(game));
  syncCones(game.pieces);
  const showing = game.result && (game.stage === 'revelacao' || game.stage === 'fim') ? game.result.round : null;
  if (showing !== scoredRound) {
    clearScoring();
    if (showing !== null) {
      showFrame(game.result.target, false);
      for (const piece of game.result.pieces) markCone(piece, false);
      scoredRound = showing;
    }
  }
  drawPlayers();
  if (game.stage !== 'fim') $('reveal').querySelector('.hc-final')?.remove();
  else if (!$('reveal').querySelector('.hc-final')) showRanking(game.ranking, false);
  drawGhost();
}

// ---------------------------------------------------------------- revelações

const fila = createQueue({ onIdle: drawAll });

// Um carimbo grande por cima da mesa: entra batendo, fica e sai.
async function stamp(gen, title, sub, hold = 1600) {
  const banner = el('div', 'banner');
  banner.append(el('span', 'banner-title', title));
  if (sub) banner.append(el('span', 'banner-sub', sub));
  $('reveal').append(banner);
  await fila.wait(hold);
  if (fila.stale(gen)) return banner.remove(); // a partida mudou no meio
  banner.classList.add('out');
  await fila.wait(450);
  banner.remove();
}

// A carta de quem deu a dica, com as 4 cores; a escolhida se destaca.
function showCard(result) {
  const card = el('div', 'hc-card');
  card.append(el('span', 'hc-card-title', `A carta de ${nameOf(result.cueGiverId)}`));
  const row = el('div', 'hc-card-colors');
  for (const cell of result.card) {
    const swatch = el('div', `hc-swatch${cell === result.target ? ' chosen' : ''}`);
    const color = el('span', 'hc-swatch-color');
    color.style.background = BOARD[cell];
    swatch.append(color, el('span', 'hc-swatch-name', cellName(cell)));
    row.append(swatch);
  }
  card.append(row);
  $('reveal').append(card);
  return card;
}

// O placar final, do último para o primeiro.
function showRanking(ranking, animate) {
  $('reveal').querySelector('.hc-final')?.remove();
  const panel = el('div', `hc-final${animate ? '' : ' still'}`);
  const winner = ranking[0];
  panel.append(el('span', 'hc-final-title', 'Fim de jogo!'), el('span', 'hc-final-sub', `${nameOf(winner.id)} venceu com ${winner.score} pontos!`));
  const list = el('ol', 'hc-final-list');
  ranking.forEach((row, i) => {
    const info = byId[row.id] ?? {};
    const li = el('li', `hc-final-row${row.place === 1 ? ' first' : ''}`);
    // bolinha nova (a reaproveitada já está na lista ao lado do tabuleiro)
    li.append(el('span', 'hc-final-place', `${row.place}º`), makeAvatar(info.color, info.name ?? '?'), el('span', 'hc-final-name', info.name ?? '?'), el('span', 'hc-final-score', String(row.score)));
    if (animate) {
      li.classList.add('later');
      li.style.animationDelay = `${(ranking.length - 1 - i) * 280}ms`;
    }
    list.append(li);
  });
  panel.append(list);
  $('reveal').append(panel);
}

async function revealRound(gen, result) {
  view.stage = 'revelacao';
  view.turnId = null;
  drawPlayers();
  setPhase('A cor era…');
  const card = showCard(result);
  if (fila.speed === 1) play('card'); // clima (o rufo): não toca com a fila acumulada
  await fila.wait(TEMPOS.cardShow);
  if (fila.stale(gen)) return card.remove();
  card.classList.add('picked');
  await fila.wait(TEMPOS.cardPick);
  card.classList.add('out');
  setTimeout(() => card.remove(), 500);
  if (fila.stale(gen)) return;

  showFrame(result.target, true);
  scoredRound = result.round;
  burstAround(result.target);
  play('burst');
  setPhase(`A cor era ${cellName(result.target)}!`);
  await fila.wait(TEMPOS.frameDrop);
  const scoring = result.pieces.filter(p => p.points > 0).sort((a, b) => b.points - a.points);
  if (!scoring.length) play('miss');
  // os cones que pontuaram pulam sem som (um som por cone cansa); só a cor exata
  // (+3, o 1º da lista) ganha os sininhos, uma vez por rodada
  if (scoring[0]?.points === 3) play('bullseye');
  for (const piece of scoring) {
    if (fila.stale(gen)) return;
    markCone(piece, true);
    await fila.wait(TEMPOS.conePoint);
  }
  for (const piece of result.pieces) if (piece.points === 0) markCone(piece, true);
  if (result.giverPoints > 0) {
    drawPlayers({ [result.cueGiverId]: result.giverPoints });
    await fila.wait(TEMPOS.giverPoint);
  }
  if (fila.stale(gen)) return;
  for (const [id, points] of Object.entries(result.points)) view.scores[id] = (view.scores[id] ?? 0) + points;
  drawPlayers(result.points);
  await fila.wait(TEMPOS.scores);
}

const REVEAL = {
  start: async (gen, event) => {
    play('start');
    const game = latest.game;
    const times = game.totalRounds / game.players.length;
    await stamp(gen, 'A partida começou!', `Cada um dá a dica ${times === 1 ? '1 vez' : `${times} vezes`} · ${game.totalRounds} rodadas`);
  },
  round: async (gen, event) => {
    if (event.round > 1) {
      clearScoring();
      if (fila.speed === 1) play('round'); // clima: não toca com a fila acumulada
      for (const cone of cones.values()) cone.classList.add('leaving');
      await fila.wait(450);
      syncCones([]);
    }
    view = { ...view, round: event.round, cueGiverId: event.cueGiverId, stage: 'dica1', turnId: null, pieces: [] };
    drawTop(event.round, latest.game.totalRounds, latest.game.players.length);
    drawPlayers();
    setCue({ cueGiverId: event.cueGiverId });
    setPhase(`Vez de ${nameOf(event.cueGiverId)} dar a dica`);
    if (event.round === 1) return; // o carimbo "A partida começou!" já anunciou
    await stamp(gen, `Rodada ${event.round}`, `Vez de ${nameOf(event.cueGiverId)} dar a dica`, 1200);
  },
  lastRound: async gen => {
    play('lastRound');
    await stamp(gen, 'Última rodada!', '', 1400);
  },
  cue: async (gen, event) => {
    const game = latest.game;
    const cue = { text: event.cue ?? null, spoken: Boolean(event.spoken), passed: Boolean(event.passed) };
    if (event.n === 1) setCue({ cueGiverId: event.cueGiverId }, cue, null);
    else setCue({ cueGiverId: event.cueGiverId }, game.cue1, cue);
    restartAnimation($('cue-box'), 'pop');
    if (!event.passed) play('cue'); // passar a 2ª dica: o som é o da revelação, logo depois
    view.stage = event.n === 1 ? 'cones1' : event.passed ? 'revelacao' : 'cones2';
    view.turnId = turnOf(view);
    drawPlayers();
    setPhase(event.passed ? `${nameOf(event.cueGiverId)} passou a 2ª dica: vamos ver a cor!` : event.n === 1 ? 'Ponham o 1º cone na cor que combina com a dica' : 'Agora o 2º cone, na ordem contrária');
    await fila.wait(900);
  },
  cone: async (gen, event) => {
    hover = null;
    drawGhost();
    const cone = cones.get(`${event.playerId}:${event.n}`) ?? makeCone(event);
    restartAnimation(cone, 'drop');
    view.pieces.push({ playerId: event.playerId, cell: event.cell, n: event.n });
    view.turnId = turnOf(view);
    drawPlayers();
    setPhase(`${nameOf(event.playerId)} pôs o cone em ${cellName(event.cell)}`);
    await fila.wait(650);
  },
  skip: async (gen, event) => {
    await stamp(gen, 'Pulou!', event.text, 1300);
  },
  reveal: async (gen, event) => {
    await revealRound(gen, event.result);
  },
  finish: async (gen, event) => {
    await fila.wait(1200);
    if (fila.stale(gen)) return;
    play('fanfare');
    showRanking(event.ranking, true);
    await fila.wait(event.ranking.length * 280 + 1200);
  },
};

// ---------------------------------------------------------------- conexão

const socket = connect({
  onOpen: () => socket.send({ type: 'hello', role: 'tv' }),
  onStatus: status => $('conn-banner').classList.toggle('hidden', status === 'online'),
  onMessage: message => {
    if (message.type === 'state') render(message);
    if (message.type === 'hover') {
      hover = message;
      drawGhost();
    }
  },
});

function render(state) {
  const { lobby, game } = state;
  tvSoundOn = lobby.tvSound !== false;
  sound.enabled = tvSoundOn;
  updateSoundBanner();
  byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));

  const playing = lobby.phase === 'playing' && game;
  $('lobby-view').classList.toggle('hidden', playing);
  $('game-view').classList.toggle('hidden', !playing);
  latest = state;
  if (playing) {
    onGameState(game);
    if (!fila.running) drawAll();
  } else {
    renderLobby(lobby);
  }
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
  // Som: alguém entrou na sala.
  const before = prev?.lobby?.phase === 'lobby' ? prev.lobby.players : null;
  if (before && lobby.players.some(p => !before.find(b => b.id === p.id))) play('join');
  lastEventId = null;

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
  // lugares livres mostram, apagadas, as cores que ainda ninguém escolheu
  const freeColors = Object.keys(CHARACTERS).filter(c => !lobby.players.some(p => p.color === c));
  $('seats').replaceChildren(...Array.from({ length: lobby.maxPlayers }, (_, i) => {
    const player = lobby.players[i];
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    if (!player) {
      li.className = 'seat free';
      name.textContent = i < lobby.minPlayers ? 'Lugar livre' : 'Lugar livre (opcional)';
      li.append(makeAvatar(freeColors.shift() ?? 'azul', '?'), name);
      return li;
    }
    li.className = `seat${player.online ? '' : ' offline'}`;
    name.textContent = player.id === lobby.leaderId ? `${player.name} 👑` : player.name;
    const status = document.createElement('span');
    status.className = `status ${!player.online ? 'offline' : player.ready ? 'ready' : 'waiting'}`;
    status.textContent = !player.online ? 'reconectando…' : player.ready ? 'pronto' : 'se preparando';
    li.append(avatar(`${player.color}:${player.name}`), name, status);
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

// ---------------------------------------------------------------- lances novos

// Retrato novo: o que aconteceu de novo vira revelação na fila.
// (acabou de sair da sala ou começou outra partida: começa do zero; TV aberta no
// meio da partida: nada do passado anima nem toca)
function onGameState(game) {
  const newestId = Math.max(0, ...game.events.map(e => e.id));
  const justStarted = prev?.lobby?.phase === 'lobby' || (lastEventId !== null && newestId < lastEventId);
  if (justStarted) {
    fila.reset();
    $('reveal').replaceChildren();
    syncCones([]);
    clearScoring();
    const first = game.players[0].id;
    view = { round: 1, cueGiverId: first, stage: 'dica1', turnId: null, pieces: [], scores: {} };
    drawTop(1, game.totalRounds, game.players.length);
    drawPlayers();
    setCue({ cueGiverId: first });
    setPhase('');
  }
  const fresh = justStarted ? game.events : lastEventId === null ? [] : game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(justStarted ? 0 : lastEventId ?? 0, newestId);
  for (const event of fresh) {
    const reveal = REVEAL[event.kind];
    if (reveal) fila.add(gen => reveal(gen, event));
  }
}
