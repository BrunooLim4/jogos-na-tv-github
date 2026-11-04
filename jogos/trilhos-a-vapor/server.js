// Servidor do protótipo: serve as páginas (TV e celular), guarda a sala e o
// jogo, e conversa com todos por WebSocket.
//
// Regra de ouro: o servidor é o único que conhece tudo. A TV recebe só o
// que é público e cada celular recebe só o que é dele (a própria mão).

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { CARD_LABELS } from './public/cards.js';
import {
  GameError, createGame, drawDeck, drawFaceUp, claimRoute, drawTickets, chooseTickets,
  skipOfflinePlayers, publicState, privateState,
} from './game/ttr.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;
const MAX_NAME_LENGTH = 14;
// As 5 cores de trem dos jogadores (cada cor é um personagem — veja public/characters.js).
const COLORS = ['vermelho', 'verde', 'amarelo', 'azul', 'roxo'];

const HOST_IP = process.env.HOST_IP || findLanAddress();
const room = createRoom();
const joinUrl = `http://${HOST_IP}:${PORT}/c/${room.code}`;

// ---------------------------------------------------------------- rede local

// Escolhe o IP do PC na rede de casa (o que os celulares conseguem acessar),
// ignorando VPNs e adaptadores virtuais.
function findLanAddress() {
  const ignored = /warp|vpn|vethernet|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier|wsl/i;
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (ignored.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)) continue;
      candidates.push({ name, ip: address.address });
    }
  }
  const preferred = candidates.find(c => /wi-?fi|wlan|ethernet|eth/i.test(c.name)) ?? candidates[0];
  return preferred?.ip ?? 'localhost';
}

// ---------------------------------------------------------------- sala

function createRoom() {
  // Código de 4 letras sem letras fáceis de confundir (I, O).
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[randomInt(letters.length)];
  return { code, phase: 'lobby', players: [], game: null, tvSound: true };
}

// Líder = o primeiro a entrar que está online (se ele cair, o próximo assume).
function leaderId() {
  return (room.players.find(p => p.online) ?? room.players[0])?.id ?? null;
}

function canStart() {
  const { players } = room;
  return room.phase === 'lobby'
    && players.length >= MIN_PLAYERS
    && players.every(p => p.ready && p.online);
}

function publicLobby() {
  return {
    code: room.code,
    joinUrl,
    phase: room.phase,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    colors: COLORS,
    canStart: canStart(),
    leaderId: leaderId(),
    tvSound: room.tvSound,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      online: p.online,
    })),
  };
}

// O retrato que cada tela recebe. `player` = dono do celular (ou null para a TV).
function stateFor(player) {
  return {
    type: 'state',
    lobby: publicLobby(),
    game: room.game ? publicState(room.game) : null,
    you: player
      ? {
        id: player.id,
        name: player.name,
        color: player.color,
        ready: player.ready,
        // mão, bilhetes e escolha de bilhetes: só o dono vê
        ...(room.game ? privateState(room.game, player.id) : {}),
      }
      : null,
  };
}

// ---------------------------------------------------------------- conexões

const tvSockets = new Set();
const phoneSockets = new Set();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast() {
  const tvState = stateFor(null);
  for (const ws of tvSockets) send(ws, tvState);
  for (const ws of phoneSockets) send(ws, stateFor(ws.player ?? null));
}

function sendError(ws, code, message) {
  send(ws, { type: 'error', code, message });
}

function cleanName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

function backToLobby() {
  room.phase = 'lobby';
  room.game = null;
  for (const p of room.players) p.ready = false;
}

function handleJoin(ws, msg) {
  if (ws.player) return send(ws, stateFor(ws.player));
  if (room.phase !== 'lobby') return sendError(ws, 'partida_em_andamento', 'A partida já começou.');
  if (room.players.length >= MAX_PLAYERS) return sendError(ws, 'sala_cheia', `A sala está cheia (${MAX_PLAYERS} jogadores).`);
  const name = cleanName(msg.name);
  if (!name) return sendError(ws, 'nome_vazio', 'Digite seu nome.');
  if (!COLORS.includes(msg.color)) return sendError(ws, 'cor_invalida', 'Escolha uma cor.');
  if (room.players.some(p => p.color === msg.color)) return sendError(ws, 'cor_ocupada', 'Essa cor já foi escolhida.');
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return sendError(ws, 'nome_repetido', 'Já tem alguém com esse nome.');

  const player = {
    id: randomUUID().slice(0, 8),
    token: randomUUID(),
    name,
    color: msg.color,
    ready: false,
    online: true,
    ws,
  };
  room.players.push(player);
  ws.player = player;
  send(ws, { type: 'welcome', token: player.token });
  broadcast();
}

function handlePhoneMessage(ws, msg) {
  if (msg.type === 'join') return handleJoin(ws, msg);

  const player = ws.player;
  if (!player) return;
  const isLeader = player.id === leaderId();

  switch (msg.type) {
    case 'ready':
      if (room.phase !== 'lobby') return;
      player.ready = Boolean(msg.ready);
      break;

    case 'leave':
      if (room.phase !== 'lobby') return sendError(ws, 'partida_em_andamento', 'Não dá para sair no meio da partida.');
      room.players = room.players.filter(p => p !== player);
      ws.player = null;
      send(ws, { type: 'left' });
      break;

    case 'kick': {
      if (!isLeader) return sendError(ws, 'so_lider', 'Só o líder pode remover jogadores.');
      if (room.phase !== 'lobby') return sendError(ws, 'partida_em_andamento', 'Só dá para remover jogadores na sala.');
      const target = room.players.find(p => p.id === msg.id && p !== player);
      if (!target) return;
      room.players = room.players.filter(p => p !== target);
      if (target.ws) {
        send(target.ws, { type: 'kicked' });
        target.ws.player = null;
      }
      break;
    }

    case 'start':
      if (!isLeader) return sendError(ws, 'so_lider', 'Só o líder pode começar a partida.');
      if (!canStart()) return sendError(ws, 'nao_pode_comecar', 'Ainda faltam jogadores prontos.');
      room.game = createGame(room.players);
      room.phase = 'playing';
      break;

    case 'endGame':
      if (!isLeader) return sendError(ws, 'so_lider', 'Só o líder pode encerrar a partida.');
      if (room.phase !== 'playing') return;
      backToLobby();
      break;

    case 'setTvSound':
      if (!isLeader) return sendError(ws, 'so_lider', 'Só o líder liga ou desliga o som da TV.');
      room.tvSound = Boolean(msg.on);
      break;

    case 'skipOffline': {
      if (!isLeader) return sendError(ws, 'so_lider', 'Só o líder pode pular a vez.');
      if (!room.game) return;
      const offline = room.players.filter(p => !p.online).map(p => p.id);
      if (!skipOfflinePlayers(room.game, offline)) return sendError(ws, 'nada_a_pular', 'Ninguém desconectado está travando a partida.');
      break;
    }

    case 'drawFaceUp':
    case 'drawDeck':
    case 'claimRoute':
    case 'drawTickets':
    case 'chooseTickets': {
      if (!room.game) return;
      try {
        if (msg.type === 'drawDeck' || msg.type === 'drawFaceUp') {
          const { card } = msg.type === 'drawDeck'
            ? drawDeck(room.game, player.id)
            : drawFaceUp(room.game, player.id, Number(msg.index));
          // Só quem comprou fica sabendo qual carta veio da pilha.
          send(ws, { type: 'note', text: `Você pegou: ${CARD_LABELS[card]}`, card });
        } else if (msg.type === 'claimRoute') {
          const { points } = claimRoute(room.game, player.id, String(msg.routeId), {
            color: msg.color,
            locomotives: msg.locomotives,
          });
          send(ws, { type: 'note', text: `Trens colocados! +${points} ${points === 1 ? 'ponto' : 'pontos'}` });
        } else if (msg.type === 'drawTickets') {
          drawTickets(room.game, player.id);
        } else {
          chooseTickets(room.game, player.id, Array.isArray(msg.keep) ? msg.keep.map(String) : []);
        }
      } catch (error) {
        if (error instanceof GameError) return sendError(ws, error.code, error.message);
        throw error;
      }
      break;
    }

    default:
      return;
  }
  broadcast();
}

// Primeira mensagem de cada conexão: diz se é a TV ou um celular.
function handleHello(ws, msg) {
  if (msg.role === 'tv') {
    ws.role = 'tv';
    tvSockets.add(ws);
    send(ws, stateFor(null));
    return;
  }
  if (msg.role === 'phone') {
    if (msg.code !== room.code) {
      return sendError(ws, 'sala_inexistente', 'Essa sala não existe mais. Escaneie o QR code da TV de novo.');
    }
    ws.role = 'phone';
    phoneSockets.add(ws);
    // Reconexão: o celular guarda um token e volta para o mesmo lugar (e a mesma mão).
    const existing = msg.token && room.players.find(p => p.token === msg.token);
    if (existing) {
      if (existing.ws && existing.ws !== ws) existing.ws.player = null;
      existing.ws = ws;
      existing.online = true;
      ws.player = existing;
      broadcast();
    } else {
      send(ws, stateFor(null));
    }
  }
}

function handleClose(ws) {
  tvSockets.delete(ws);
  phoneSockets.delete(ws);
  const player = ws.player;
  if (player && player.ws === ws) {
    player.online = false;
    player.ws = null;
    broadcast();
  }
}

// ---------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function sendFile(res, fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    // Imagens e fontes quase nunca mudam: o celular guarda por um dia.
    const isAsset = /[\\/](img|fonts)[\\/]/.test(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': isAsset ? 'max-age=86400' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/') {
    res.writeHead(302, { Location: '/tv' }).end();
  } else if (pathname === '/tv') {
    await sendFile(res, 'tv.html');
  } else if (pathname === '/mapa') {
    await sendFile(res, 'mapa.html');
  } else if (/^\/c\/[A-Za-z]{4}$/.test(pathname)) {
    await sendFile(res, 'phone.html');
  } else if (pathname === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#14202b', light: '#ffffff' },
    });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' }).end(svg);
  } else if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ code: room.code, joinUrl }));
  } else if (/^\/(?:(?:img|fonts)\/)?[\w-]+\.(css|js|svg|png|jpg|webp|woff2|ico)$/.test(pathname)) {
    await sendFile(res, pathname.slice(1));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
});

// ---------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') return handleHello(ws, msg);
    if (ws.role === 'phone') return handlePhoneMessage(ws, msg);
    // A TV só mostra: não manda comandos.
  });

  ws.on('close', () => handleClose(ws));
});

// Celular com a tela apagada costuma "sumir" sem avisar: verificamos a cada 10 s.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10_000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  const tvUrl = `http://localhost:${PORT}/tv`;
  console.log('');
  console.log('  Trilhos a Vapor na TV — protótipo');
  console.log('  ---------------------------------');
  console.log(`  Tela da TV:        ${tvUrl}`);
  console.log(`  Link do celular:   ${joinUrl}`);
  console.log(`  Código da sala:    ${room.code}`);
  console.log(`  Só o mapa:         http://localhost:${PORT}/mapa`);
  console.log('');
  console.log('  Deixe esta janela aberta enquanto jogam. Para parar: Ctrl+C.');
  console.log('');
  if (process.env.OPEN_BROWSER === '1') openTvWindow(tvUrl);
});

// Abre a tela da TV numa janela própria do Chrome (ou Edge), sem abas e já com
// permissão para tocar som (o navegador normalmente exige um clique antes).
// O perfil separado garante que essa permissão vale mesmo com o Chrome já aberto.
function openTvWindow(url) {
  const candidates = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const browser = candidates.find(file => existsSync(file));
  if (!browser) {
    exec(`start "" "${url}"`);
    return;
  }
  spawn(browser, [
    `--app=${url}`,
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${path.join(os.tmpdir(), 'trilhos-a-vapor-tv-tela')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
  ], { detached: true, stdio: 'ignore' }).unref();
}
