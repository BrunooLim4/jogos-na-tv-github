// Jogadores de mentira para testar sozinho: entram na sala depois de alguém, ficam
// prontos e jogam (a noite com uma escolha válida qualquer; votam em alguém).
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ROBOS_SOZINHOS=1 → os robôs jogam entre eles (o 1º robô vira o líder; ele manda
//   votar depois de alguns segundos de "conversa" e começa outra partida no fim).
//   JOGO_URL=http://localhost:3081 → servidor de teste.
import { actOf, roleOf } from '../public/papeis.js';

const base = process.env.JOGO_URL ?? 'http://localhost:3080';
const howMany = Math.min(Number(process.argv[2] ?? 3), 9);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const alone = process.env.ROBOS_SOZINHOS === '1';
const { code } = await (await fetch(`${base}/api/info`)).json();

const COLORS = ['azul', 'verde', 'vermelho', 'roxo', 'amarelo', 'laranja', 'rosa', 'turquesa', 'branco', 'marrom'];
// Cada robô prefere uma cor; se já foi escolhida, pega a próxima livre.
const BOTS = ['Ana', 'Caio', 'Duda', 'Leo', 'Fê', 'Gabi', 'Hugo', 'Iara', 'Juca'].map((name, i) => ({
  name: `${name} (robô)`,
  colors: [...COLORS.slice(i + 1), ...COLORS.slice(0, i + 1)],
}));
const pickOne = list => list[Math.floor(Math.random() * list.length)];

// Uma escolha válida qualquer para a noite.
function nightPick(role, me, ids) {
  const option = pickOne(actOf(role).options);
  const others = ids.filter(id => id !== me).sort(() => Math.random() - 0.5);
  const center = [0, 1, 2].sort(() => Math.random() - 0.5);
  return { players: others.slice(0, option.players), center: center.slice(0, option.center) };
}

// O que o robô faz agora (ou null se não é com ele).
function chooseMove(game, you, lobby) {
  const ids = game.players.map(p => p.id);
  if (game.stage === 'noite' && you.step !== 'feito') {
    const role = you.step === 'sosia-2' ? you.copied : roleOf(you.card);
    return { type: 'night', pick: nightPick(role, you.id, ids) };
  }
  if (game.stage === 'votacao' && !you.vote) {
    // quem descobriu um lobisomem à noite vota nele; senão, em alguém qualquer
    const named = (you.info ?? []).map(i => i.text).join(' ');
    const suspect = lobby.players.find(p => p.id !== you.id && new RegExp(`${p.name.replace(/[()]/g, '.')}: (Lobisomem|Sósia \\(que virou Lobisomem\\))`).test(named));
    return { type: 'vote', target: suspect?.id ?? pickOne(ids.filter(id => id !== you.id)) };
  }
  if (alone && lobby.leaderId === you.id) {
    if (game.stage === 'dia') return { type: 'voteNow', wait: 6000 };
    if (game.stage === 'fim') return { type: 'playAgain', wait: 30000 };
  }
  return null;
}

function startBot(bot) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  const send = message => ws.send(JSON.stringify(message));
  let busy = false;
  let startScheduled = false;
  let lastState = null;

  ws.addEventListener('open', () => send({ type: 'hello', role: 'phone', code }));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'error') {
      console.log(`${bot.name}: ${msg.message}`);
      return;
    }
    if (msg.type !== 'state') return;
    lastState = msg;
    const { lobby, game, you } = msg;
    if (!you) {
      // Espera uma pessoa entrar primeiro: assim o líder é sempre alguém de verdade.
      const someoneIn = lobby.players.length > 0 || alone;
      const taken = new Set(lobby.players.map(p => p.color));
      const color = bot.colors.find(c => !taken.has(c));
      const alreadyIn = lobby.players.some(p => p.name === bot.name);
      if (lobby.phase === 'lobby' && someoneIn && color && !alreadyIn && lobby.players.length < lobby.maxPlayers) {
        send({ type: 'join', name: bot.name, color });
      }
      return;
    }
    if (lobby.phase === 'lobby' && !you.ready) send({ type: 'ready', ready: true });
    if (lobby.phase === 'lobby' && lobby.canStart && lobby.leaderId === you.id && !startScheduled) {
      startScheduled = true;
      setTimeout(() => {
        startScheduled = false;
        send({ type: 'start' });
      }, 2000);
    }
    const first = game && lobby.phase === 'playing' ? chooseMove(game, you, lobby) : null;
    if (!first || busy) return;
    // Espera um pouco (para dar para ver na TV) e joga com o estado mais novo.
    busy = true;
    setTimeout(() => {
      busy = false;
      const { game: g, you: y, lobby: l } = lastState;
      const move = g && y && l.phase === 'playing' ? chooseMove(g, y, l) : null;
      if (move && move.type === first.type) {
        delete move.wait;
        send(move);
      }
    }, (first.wait ?? thinkMs) * (0.6 + Math.random()));
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
