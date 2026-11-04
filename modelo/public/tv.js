// Tela da TV: só escuta (não manda comandos). Sala pronta; a mesa do jogo
// entra em renderGame (TROCAR).
//
// REVELAÇÕES (padrão Resistência, ../conhecimento/padrao-resistencia.md): os
// momentos importantes viram animações na FILA (fila.js), uma de cada vez, com o
// som tocando dentro da animação. Aqui, de exemplo: o carimbo "A partida começou!"
// e o carimbo do fim. TROCAR/ACRESCENTAR as revelações do jogo (distribuir cartas,
// revelar votos, revelar resultado...) e desenhar a mesa a partir de `view`.
import { connect } from './net.js';
import { makeAvatar, sameImage } from './ui.js';
import { CHARACTERS } from './characters.js';
import { createSound } from './sound.js';
import { createQueue } from './fila.js';

const $ = id => document.getElementById(id);

let currentCode = null;
let lastEventId = null; // null = ainda não viu nenhum evento (não anima nem toca nada do passado)
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

// ---------------------------------------------------------------- revelações

const fila = createQueue({ onIdle: () => latest?.game && renderGame(latest.lobby, latest.game) });
let latest = null; // retrato mais novo (para redesenhar quando a fila esvaziar)

// Um carimbo grande por cima da mesa: entra batendo, fica e sai.
async function stamp(gen, title, sub, hold = 1600) {
  const banner = document.createElement('div');
  banner.className = 'banner';
  const big = document.createElement('span');
  big.className = 'banner-title';
  big.textContent = title;
  const small = document.createElement('span');
  small.className = 'banner-sub';
  small.textContent = sub;
  banner.append(big, small);
  $('reveal').append(banner);
  await fila.wait(hold);
  if (fila.stale(gen)) return banner.remove(); // a partida mudou no meio
  banner.classList.add('out');
  await fila.wait(450);
  banner.remove();
}

// TROCAR: as revelações do jogo. O som toca junto com a animação.
const REVEAL = {
  start: async (gen, event) => {
    play('start');
    await stamp(gen, 'A partida começou!', event.text);
  },
  finish: async (gen, event) => {
    play('fanfare');
    await stamp(gen, 'Fim de jogo!', event.text, 2400);
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

  const playing = lobby.phase === 'playing' && game;
  $('lobby-view').classList.toggle('hidden', playing);
  $('game-view').classList.toggle('hidden', !playing);
  latest = state;
  if (playing) {
    onGameState(game);
    renderGame(lobby, game);
  } else {
    renderLobby(lobby);
  }
  prev = state;
}

// ---------------------------------------------------------------- sala

// Bolinhas reaproveitadas entre uma atualização e outra (não piscam).
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

// ---------------------------------------------------------------- partida

function renderGame(lobby, game) {
  const byId = Object.fromEntries(lobby.players.map(p => [p.id, p]));
  $('round-chip').textContent = `Rodada ${game.round}`;
  $('players-row').replaceChildren(...game.players.map(stats => {
    const info = byId[stats.id] ?? {};
    const li = document.createElement('li');
    li.className = `player-chip${info.online === false ? ' offline' : ''}`;
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = stats.id === lobby.leaderId ? `${info.name} 👑` : info.name ?? '?';
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = stats.score;
    li.append(avatar(`${info.color}:${info.name}`), name, score);
    return li;
  }));
  $('events').replaceChildren(...game.events.map(e => {
    const li = document.createElement('li');
    li.textContent = e.text;
    return li;
  }));
}

// Retrato novo: o que aconteceu de novo vira revelação na fila.
// (acabou de sair da sala: começa do zero; TV aberta no meio da partida: nada do
// passado anima nem toca)
function onGameState(game) {
  const justStarted = prev?.lobby?.phase === 'lobby';
  if (justStarted) {
    fila.reset();
    $('reveal').replaceChildren();
  }
  const fresh = justStarted ? game.events : lastEventId === null ? [] : game.events.filter(e => e.id > lastEventId);
  lastEventId = Math.max(justStarted ? 0 : lastEventId ?? 0, ...game.events.map(e => e.id));
  for (const event of fresh) {
    const reveal = REVEAL[event.kind];
    if (reveal) fila.add(gen => reveal(gen, event));
  }
}
