// Tela da TV: só escuta (não manda comandos). A vila à noite atrás de tudo; na mesa,
// as 3 cartas do meio, as cartas desta partida e, embaixo, a carta de cada jogador.
//
// REVELAÇÕES (padrão Resistência, ../conhecimento/padrao-resistencia.md): cada lance
// novo vira uma animação na FILA (fila.js), uma de cada vez, com o som dentro dela:
// distribuir as cartas, a noite caindo, amanhecer, a votação, e o resultado (as setas
// dos votos, quem morreu, as cartas virando e quem venceu). Enquanto a fila anda, a
// mesa não é redesenhada; quando ela esvazia, drawAll() acerta tudo pelo retrato mais
// novo (é também o que uma TV aberta no meio da partida faz: nada do passado anima).
//
// PRIVACIDADE: antes do fim, a TV só sabe QUEM já terminou a noite e QUEM já votou.
import { connect } from './net.js';
import { makeAvatar, makeCard, setCardFace, sameImage } from './ui.js';
import { CHARACTERS } from './characters.js';
import { createSound } from './sound.js';
import { createQueue, restartAnimation } from './fila.js';
import { TEAMS } from './papeis.js';
import { TEMPOS } from './tempos.js';
import { buildScene, setSky } from './cenario.js';

const $ = id => document.getElementById(id);
const scene = $('scene');
buildScene(scene);
setSky(scene, 'noite');

// ---------------------------------------------------------------- palco

// O palco tem sempre 1920 × 1080 e é escalado para caber na tela (1536×864 e
// 1280×720 ficam iguais, só menores).
let scale = 1;
function fitStage() {
  scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  const left = (innerWidth - 1920 * scale) / 2;
  const top = (innerHeight - 1080 * scale) / 2;
  $('stage').style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}
addEventListener('resize', fitStage);
fitStage();

// Posição de um elemento no palco (em px do palco, não da tela).
function stageRect(el) {
  const stage = $('stage').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - stage.left) / scale, y: (r.top - stage.top) / scale, w: r.width / scale, h: r.height / scale };
}

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

// ---------------------------------------------------------------- estado

let currentCode = null;
let lastEventId = null; // null = ainda não viu nenhum evento (não anima nem toca nada do passado)
let prev = null;
let latest = null;
let byId = {}; // jogadores da sala (nome, cor, online)
let clockOffset = 0; // relógio do servidor − relógio daqui
// O que a TV JÁ mostrou (padrão Resistência): o lugar de cada um e as frases desenham
// isto, não o retrato mais novo — senão o resultado aparece antes da animação.
let view = { match: null, stage: 'noite', done: new Set(), voted: new Set(), dealt: false };

const nameOf = id => byId[id]?.name ?? '?';
const colorOf = id => CHARACTERS[byId[id]?.color]?.hex ?? '#ccc';
const wait = ms => fila.wait(ms);

// ---------------------------------------------------------------- sala

const avatar = sameImage(key => {
  const [color, name] = key.split(':');
  return makeAvatar(color, name);
});

// As cartas em leque na sala (as do Bruno), montadas uma vez.
(function buildFan() {
  const fan = ['lobisomem-1', 'vidente', 'ladrao', 'sosia', 'encrenqueira', 'cacador', 'lobisomem-2'];
  $('lobby-fan').replaceChildren(...fan.map((card, i) => {
    const img = document.createElement('img');
    img.src = `/cartas/${card}.webp`;
    img.alt = '';
    img.style.transform = `rotate(${(i - (fan.length - 1) / 2) * 13}deg)`;
    img.style.animationDelay = `${-i * 0.9}s`;
    return img;
  }));
}());

function renderLobby(lobby) {
  setSky(scene, 'sala');
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
  view.match = null;

  $('player-count').textContent = `${lobby.players.length}/${lobby.maxPlayers}`;
  const freeColors = Object.keys(CHARACTERS).filter(c => !lobby.players.some(p => p.color === c));
  $('seats').replaceChildren(...Array.from({ length: lobby.maxPlayers }, (_, i) => {
    const player = lobby.players[i];
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    if (!player) {
      li.className = 'seat free';
      const color = freeColors.shift() ?? 'azul';
      li.dataset.color = color;
      name.textContent = i < lobby.minPlayers ? 'Lugar livre' : 'Lugar livre (opcional)';
      li.append(makeAvatar(color, '?'), name);
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

// ---------------------------------------------------------------- a mesa

// Os lugares (montados uma vez por partida e só mudando de classe).
const seats = new Map(); // id → { li, card, badge, count, tag, name, wins, x }
let middle = []; // as 3 cartas do meio
let layout = { cardW: 150, cardTop: 816 };

function buildTable(game) {
  const n = game.players.length;
  const seatW = Math.min(196, 1840 / n);
  const cardW = Math.min(150, seatW - 30);
  const cardTop = 1014 - (cardW * 4) / 3;
  const left0 = (1920 - seatW * n) / 2;
  layout = { cardW, cardTop };
  seats.clear();
  $('seats-row').replaceChildren(...game.players.map((p, i) => {
    const info = byId[p.id] ?? {};
    const li = document.createElement('li');
    li.className = 'tseat undealt';
    li.dataset.color = info.color ?? '';
    li.style.left = `${left0 + i * seatW}px`;
    li.style.top = `${cardTop}px`;
    li.style.width = `${seatW}px`;
    li.style.setProperty('--card-w', `${cardW}px`);
    const card = makeCard();
    const badge = document.createElement('span');
    badge.className = 'tseat-badge';
    const count = document.createElement('span');
    count.className = 'tseat-count';
    const tag = document.createElement('span');
    tag.className = 'tseat-tag';
    const who = document.createElement('div');
    who.className = 'tseat-who';
    const name = document.createElement('span');
    name.className = 'tseat-name';
    const wins = document.createElement('span');
    wins.className = 'tseat-wins';
    who.append(makeAvatar(info.color, info.name ?? '?'), name, wins);
    li.append(card, badge, count, tag, who);
    seats.set(p.id, { li, card, badge, count, tag, name, wins, x: left0 + (i + 0.5) * seatW });
    return li;
  }));
  middle = [0, 1, 2].map(() => makeCard());
  middle.forEach(card => card.classList.add('undealt-mid'));
  $('middle-cards').replaceChildren(...middle);
  $('inplay-cards').replaceChildren(...game.inPlay.map(card => {
    const img = document.createElement('img');
    img.src = `/cartas/${card}.webp`;
    img.alt = '';
    return img;
  }));
  $('inplay-label').textContent = `As ${game.inPlay.length} cartas desta partida (${game.players.length} com vocês e 3 no meio)`;
  $('match-label').textContent = game.match > 1 ? `Partida ${game.match}` : '';
  $('arcs').replaceChildren();
}

function skyFor(stage, result) {
  if (stage === 'dia') return 'dia';
  if (stage === 'votacao') return 'votacao';
  if (stage === 'fim') return result?.villageWins ? 'amanhecer' : 'noite';
  return 'noite';
}

function drawPhase(stage, game) {
  const n = game.players.length;
  const texts = {
    noite: ['A noite caiu', 'Cada um faz a sua parte no celular, em segredo. Ninguém fala!'],
    dia: ['Amanheceu!', 'Conversem: quem é o lobisomem? Não vale mostrar o celular.'],
    votacao: ['Hora de votar', 'Cada um vota pelo celular em quem deve morrer.'],
    fim: [game.result?.headline ?? 'Fim!', game.result?.reason ?? ''],
  };
  const [title, sub] = texts[stage];
  $('phase-title').textContent = title;
  $('phase-sub').textContent = sub;
  $('clock').dataset.stage = stage;
  $('clock').dataset.total = String(n);
  updateClock();
}

// O relógio da direita: a noite (quantos terminaram), o dia (tempo para conversar),
// a votação (quantos votaram).
function updateClock() {
  const clock = $('clock');
  const game = latest?.game;
  if (!game || latest.lobby.phase !== 'playing') return;
  const stage = view.stage;
  const n = game.players.length;
  clock.classList.remove('late');
  if (stage === 'noite') {
    clock.innerHTML = `${view.done.size}/${n}<small>já terminaram</small>`;
  } else if (stage === 'votacao') {
    clock.innerHTML = `${view.voted.size}/${n}<small>já votaram</small>`;
  } else if (stage === 'dia' && game.dayEndsAt) {
    const left = Math.max(0, Math.ceil((game.dayEndsAt - (Date.now() + clockOffset)) / 1000));
    clock.innerHTML = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}<small>para a votação</small>`;
    clock.classList.toggle('late', left <= 10);
  } else {
    clock.textContent = '';
  }
}
setInterval(updateClock, 250);

// Os painéis dos lados: ajuda para quem nunca jogou; no fim, as vitórias e a história.
function drawSides(stage, game) {
  const left = $('side-left');
  const right = $('side-right');
  right.classList.toggle('story', stage === 'fim');
  left.classList.toggle('tall', stage === 'fim');
  if (stage !== 'fim') {
    left.innerHTML = `<h3>Como se joga</h3><ol>
      <li><strong>Segure a sua carta</strong> no celular para ver quem você é.</li>
      <li>À noite, faça o que a carta manda. Quem não tem nada a fazer toca numa carta qualquer.</li>
      <li>De dia, conversem e desconfiem de todo mundo.</li>
      <li>Na votação, o mais votado morre.</li></ol>`;
    const who = { vila: 'A vila', lobos: 'Os lobisomens', curtidor: 'O Curtidor' };
    right.innerHTML = `<h3>Quem vence?</h3>
      ${Object.entries(TEAMS).map(([key, team]) => `<div class="team ${key}"><strong>${who[key]}</strong><span>${team.goal}</span></div>`).join('')}
      <p class="side-note">Vale a carta que você tiver no FIM: ela pode ter sido trocada à noite!</p>`;
    return;
  }
  const winsList = [...game.players].sort((a, b) => b.wins - a.wins);
  left.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = 'Vitórias';
  const ul = document.createElement('ul');
  ul.className = 'wins';
  ul.replaceChildren(...winsList.map(p => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = nameOf(p.id);
    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = p.wins ? '★'.repeat(Math.min(p.wins, 8)) + (p.wins > 8 ? ` ${p.wins}` : '') : '—';
    li.append(makeAvatar(byId[p.id]?.color, nameOf(p.id)), name, stars);
    return li;
  }));
  left.append(h, ul);
  const story = game.result?.story ?? [];
  right.innerHTML = '<h3>O que aconteceu à noite</h3>';
  const ol = document.createElement('ol');
  ol.replaceChildren(...(story.length ? story : [{ text: 'Ninguém fez nada.' }]).map(item => {
    const li = document.createElement('li');
    li.textContent = item.text;
    return li;
  }));
  right.append(ol);
}

function drawSeat(id, game) {
  const seat = seats.get(id);
  if (!seat) return;
  const info = byId[id] ?? {};
  const stats = game.players.find(p => p.id === id);
  seat.li.classList.toggle('undealt', !view.dealt);
  seat.li.classList.toggle('offline', info.online === false);
  seat.name.textContent = id === latest.lobby.leaderId ? `${info.name ?? '?'} 👑` : info.name ?? '?';
  seat.wins.textContent = stats?.wins ? `★${stats.wins}` : '';
  const badge = view.stage === 'noite' ? (view.done.has(id) ? '💤' : '') : view.stage === 'votacao' ? (view.voted.has(id) ? '✔' : '') : '';
  if (seat.badge.textContent !== badge) seat.badge.textContent = badge;
}

// Desenha a mesa inteira, sem animação, pelo retrato mais novo.
function drawAll() {
  const game = latest?.game;
  if (!game || latest.lobby.phase !== 'playing') return;
  view.stage = game.stage;
  view.done = new Set(game.players.filter(p => p.nightDone).map(p => p.id));
  view.voted = new Set(game.players.filter(p => p.voted).map(p => p.id));
  view.dealt = true;
  setSky(scene, skyFor(game.stage, game.result));
  drawPhase(game.stage, game);
  drawSides(game.stage, game);
  for (const p of game.players) drawSeat(p.id, game);
  for (const card of middle) card.classList.remove('undealt-mid');
  $('deck').classList.add('hidden');
  $('inplay').classList.toggle('hidden', game.stage === 'fim');
  $('inplay').classList.remove('dim');
  if (game.stage === 'fim') showFinal(game.result, game);
  else clearFinal();
}

function clearFinal() {
  for (const seat of seats.values()) {
    seat.card.classList.remove('flipped');
    seat.li.classList.remove('dead', 'won', 'lost');
    seat.tag.textContent = '';
    seat.count.textContent = '';
  }
  for (const card of middle) card.classList.remove('flipped');
  $('arcs').replaceChildren();
}

// O fim já mostrado (sem animar): tudo virado, setas, mortos e quem venceu.
function showFinal(result, game) {
  for (const p of game.players) {
    const seat = seats.get(p.id);
    if (!seat) continue;
    setCardFace(seat.card, result.cards[p.id]);
    seat.card.classList.add('still', 'flipped');
    seat.li.classList.toggle('dead', result.dead.includes(p.id));
    seat.li.classList.toggle('won', result.winners.includes(p.id));
    seat.li.classList.toggle('lost', !result.winners.includes(p.id) && !result.dead.includes(p.id));
    seat.tag.className = `tseat-tag${result.dead.includes(p.id) ? ' dead' : ''}`;
    seat.tag.textContent = result.dead.includes(p.id) ? 'Morreu' : '';
    seat.count.textContent = result.counts[p.id] ? `${result.counts[p.id]} voto${result.counts[p.id] > 1 ? 's' : ''}` : '';
  }
  middle.forEach((card, i) => {
    setCardFace(card, result.cards[`meio-${i + 1}`]);
    card.classList.add('still', 'flipped');
  });
  if (!$('arcs').childElementCount) drawArcs(result, false);
  $('arcs').style.opacity = '0.35';
  requestAnimationFrame(() => {
    for (const seat of seats.values()) seat.card.classList.remove('still');
    for (const card of middle) card.classList.remove('still');
  });
}

// ---------------------------------------------------------------- as setas dos votos

function drawArcs(result, animate) {
  const svg = $('arcs');
  svg.replaceChildren();
  svg.style.opacity = '1';
  const top = layout.cardTop - 6;
  const byTarget = {};
  for (const [voter, target] of Object.entries(result.votes)) (byTarget[target] ??= []).push(voter);
  for (const [target, voters] of Object.entries(byTarget)) {
    voters.forEach((voter, k) => {
      const from = seats.get(voter);
      const to = seats.get(target);
      if (!from || !to) return;
      const x1 = from.x + 18;
      const x2 = to.x + (k - (voters.length - 1) / 2) * 22;
      const dx = Math.abs(x2 - x1);
      const cx = (x1 + x2) / 2;
      const cy = top - Math.min(380, 80 + dx * 0.3);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${top} Q ${cx} ${cy} ${x2} ${top - 8}`);
      path.setAttribute('class', `arc${animate ? ' draw' : ''}`);
      path.dataset.voter = voter;
      path.dataset.target = target;
      path.style.stroke = colorOf(voter);
      svg.append(path);
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      path.style.setProperty('--len', `${len}`);
      // a ponta da seta, na direção em que a curva chega
      const ang = Math.atan2(top - 8 - cy, x2 - cx);
      const s = 18;
      const tip = [x2, top - 4];
      const p1 = [tip[0] - s * Math.cos(ang - 0.45), tip[1] - s * Math.sin(ang - 0.45)];
      const p2 = [tip[0] - s * Math.cos(ang + 0.45), tip[1] - s * Math.sin(ang + 0.45)];
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      head.setAttribute('points', [tip, p1, p2].map(p => p.map(v => v.toFixed(1)).join(',')).join(' '));
      head.setAttribute('class', `head${animate ? ' draw' : ''}`);
      head.style.fill = colorOf(voter);
      svg.append(head);
    });
  }
}

// ---------------------------------------------------------------- revelações

const fila = createQueue({ onIdle: drawAll });

// Um carimbo grande por cima da mesa: entra batendo, fica e sai.
async function stamp(gen, title, sub = '', hold = 1600, variant = '') {
  const banner = document.createElement('div');
  banner.className = `banner ${variant}`.trim();
  const big = document.createElement('span');
  big.className = 'banner-title';
  big.textContent = title;
  banner.append(big);
  if (sub) {
    const small = document.createElement('span');
    small.className = 'banner-sub';
    small.textContent = sub;
    banner.append(small);
  }
  $('reveal').append(banner);
  await wait(hold);
  if (fila.stale(gen)) return banner.remove(); // a partida mudou no meio
  banner.classList.add('out');
  await wait(450);
  banner.remove();
}

// Distribuir: o baralho embaralha no meio e cada carta voa até o seu lugar.
async function deal(gen, game) {
  view.stage = 'noite';
  view.dealt = false;
  setSky(scene, 'noite');
  drawPhase('noite', game);
  $('phase-title').textContent = 'Distribuindo as cartas…';
  $('phase-sub').textContent = 'Cada um recebe um personagem secreto. Três ficam no meio.';
  drawSides('noite', game);
  for (const p of game.players) drawSeat(p.id, game);
  $('inplay').classList.remove('hidden', 'dim');
  const deck = $('deck');
  deck.replaceChildren(...[0, 1, 2, 3].map(() => {
    const img = document.createElement('img');
    img.src = '/cartas/verso.webp';
    img.alt = '';
    return img;
  }));
  deck.classList.remove('hidden');
  restartAnimation(deck, 'shuffle');
  if (fila.speed === 1) play('shuffle'); // clima: não toca com a fila acumulada
  await wait(1100);
  if (fila.stale(gen)) return;
  const from = stageRect(deck);
  const targets = [
    ...game.players.map(p => ({ el: seats.get(p.id).card, done: () => seats.get(p.id).li.classList.remove('undealt') })),
    ...middle.map(card => ({ el: card, done: () => card.classList.remove('undealt-mid') })),
  ];
  if (fila.speed === 1) play('deal');
  targets.forEach((target, i) => {
    setTimeout(() => {
      const to = stageRect(target.el);
      const img = document.createElement('img');
      img.className = 'flying';
      img.src = '/cartas/verso.webp';
      img.style.transform = `translate(${from.x}px, ${from.y}px) scale(${from.w / 150})`;
      $('game-view').append(img);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.transform = `translate(${to.x}px, ${to.y}px) scale(${to.w / 150}) rotate(${(Math.random() - 0.5) * 6}deg)`;
      }));
      setTimeout(() => {
        target.done();
        img.remove();
      }, 520);
    }, i * 110 * fila.speed);
  });
  await wait(targets.length * 110 + 600);
  deck.classList.add('hidden');
  view.dealt = true;
  if (fila.stale(gen)) return;
  drawPhase('noite', game);
  play('howl');
  await stamp(gen, 'A noite caiu', 'Segurem a carta no celular para ver quem vocês são.', 2300);
}

// O resultado: as setas, quem morreu, as cartas virando e quem venceu.
async function revealResult(gen, result, game) {
  view.stage = 'revelacao'; // sem os ✔ e sem o "5/5 votaram": a mesa fica limpa para as setas
  for (const p of game.players) drawSeat(p.id, game);
  updateClock();
  $('inplay').classList.add('dim');
  $('phase-title').textContent = 'Apontem!';
  $('phase-sub').textContent = 'Em quem cada um votou…';
  play('point');
  await stamp(gen, 'Apontem!', '', TEMPOS.point - 450);
  if (fila.stale(gen)) return;
  drawArcs(result, true);
  await wait(TEMPOS.arcs);
  for (const [id, n] of Object.entries(result.counts)) {
    const seat = seats.get(id);
    if (!seat) continue;
    seat.count.textContent = `${n} voto${n > 1 ? 's' : ''}`;
    restartAnimation(seat.count, 'pop');
  }
  await wait(TEMPOS.counts);
  if (fila.stale(gen)) return;

  const flip = id => {
    const seat = seats.get(id);
    setCardFace(seat.card, result.cards[id]);
    seat.card.classList.add('flipped');
  };
  const kill = (id, text = 'Morreu') => {
    const seat = seats.get(id);
    seat.li.classList.add('dead');
    seat.tag.className = 'tseat-tag dead';
    seat.tag.textContent = text;
    restartAnimation(seat.tag, 'stamp');
    const flash = document.createElement('div');
    flash.className = 'flash';
    $('reveal').append(flash);
    setTimeout(() => flash.remove(), 900);
  };
  const hunted = new Set(result.hunterKills.map(k => k.target));
  if (!result.dead.length) {
    play('nobody');
    $('phase-title').textContent = 'Ninguém morreu';
    await stamp(gen, 'Ninguém morreu', result.reason.startsWith('Ninguém teve') ? 'Ninguém teve mais de 1 voto.' : '', TEMPOS.nobody - 450);
  }
  for (const id of result.dead.filter(d => !hunted.has(d))) {
    if (fila.stale(gen)) return;
    $('phase-title').textContent = `${nameOf(id)} morreu…`;
    flip(id);
    play('death');
    await wait(450);
    kill(id);
    await wait(TEMPOS.death - 450);
  }
  for (const { hunter, target } of result.hunterKills) {
    if (fila.stale(gen)) return;
    $('phase-title').textContent = `Caçador! ${nameOf(target)} morre junto`;
    for (const path of $('arcs').querySelectorAll(`path[data-voter="${hunter}"]`)) path.classList.add('hunter');
    play('hunter');
    await wait(600);
    flip(target);
    kill(target);
    await wait(TEMPOS.hunter - 600);
  }
  // as outras cartas viram, uma por uma, e depois as do meio
  if (fila.stale(gen)) return;
  $('phase-title').textContent = 'Quem era quem?';
  $('phase-sub').textContent = 'As cartas como ficaram no fim da noite.';
  if (fila.speed === 1) play('flip');
  for (const p of game.players.filter(p => !result.dead.includes(p.id))) {
    flip(p.id);
    await wait(TEMPOS.flipEach);
  }
  middle.forEach((card, i) => {
    setCardFace(card, result.cards[`meio-${i + 1}`]);
    setTimeout(() => card.classList.add('flipped'), i * 160);
  });
  await wait(TEMPOS.center);
  if (fila.stale(gen)) return;

  // quem venceu
  for (const p of game.players) {
    const seat = seats.get(p.id);
    seat.li.classList.toggle('won', result.winners.includes(p.id));
    seat.li.classList.toggle('lost', !result.winners.includes(p.id) && !result.dead.includes(p.id));
  }
  setSky(scene, skyFor('fim', result));
  view.stage = 'fim';
  drawPhase('fim', game);
  play(result.wolfTeamWins && !result.villageWins ? 'winWolves' : result.villageWins ? 'winVillage' : result.tannerDead ? 'winTanner' : 'nobodyWins');
  const variant = result.villageWins ? 'gold' : result.wolfTeamWins ? 'blood' : '';
  await stamp(gen, result.headline, result.reason, TEMPOS.banner - 450, variant);
}

const REVEAL = {
  start: async gen => {
    await deal(gen, latest.game);
  },
  sleep: async (gen, event) => {
    if (view.stage !== 'noite') return;
    view.done.add(event.playerId);
    drawSeat(event.playerId, latest.game);
    restartAnimation(seats.get(event.playerId)?.badge ?? document.body, 'pop');
    updateClock();
    await wait(140);
  },
  dawn: async gen => {
    view.stage = 'dia';
    view.done = new Set();
    for (const p of latest.game.players) drawSeat(p.id, latest.game);
    setSky(scene, 'amanhecer');
    play('dawn');
    $('phase-title').textContent = 'Amanheceu!';
    $('phase-sub').textContent = 'Cada um já pode ver no celular o que descobriu à noite.';
    $('clock').textContent = '';
    await stamp(gen, 'Amanheceu!', 'Segurem a carta no celular para ver o que descobriram.', 2600);
    if (fila.stale(gen)) return;
    setSky(scene, 'dia');
    drawPhase('dia', latest.game);
  },
  vote: async gen => {
    view.stage = 'votacao';
    view.voted = new Set();
    for (const p of latest.game.players) drawSeat(p.id, latest.game);
    setSky(scene, 'votacao');
    drawPhase('votacao', latest.game);
    play('vote');
    await stamp(gen, 'Hora de votar!', 'Cada um vota pelo celular em quem deve morrer.', 2000, 'blood');
  },
  voted: async (gen, event) => {
    if (view.stage !== 'votacao') return;
    view.voted.add(event.playerId);
    drawSeat(event.playerId, latest.game);
    restartAnimation(seats.get(event.playerId)?.badge ?? document.body, 'pop');
    updateClock();
    await wait(120);
  },
  reveal: async (gen, event) => {
    await revealResult(gen, event.result, latest.game);
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
  } else {
    fila.reset();
    $('reveal').replaceChildren();
    renderLobby(lobby);
  }
  prev = state;
}

// Retrato novo: o que aconteceu de novo vira revelação na fila. Partida nova (da sala
// ou "Jogar de novo"): monta a mesa e anima desde a distribuição. TV aberta no meio
// da partida: monta a mesa já como está, sem animar nada do passado.
function onGameState(game) {
  const newestId = Math.max(0, ...game.events.map(e => e.id));
  if (game.match !== view.match) {
    const watching = prev?.lobby?.phase === 'lobby' || lastEventId !== null;
    fila.reset();
    $('reveal').replaceChildren();
    buildTable(game);
    view = { match: game.match, stage: 'noite', done: new Set(), voted: new Set(), dealt: !watching };
    lastEventId = watching ? 0 : newestId;
  }
  const fresh = game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(lastEventId, newestId);
  for (const event of fresh) {
    const reveal = REVEAL[event.kind];
    if (reveal) fila.add(gen => reveal(gen, event));
  }
}
