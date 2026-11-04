// Jogadores de mentira para testar sozinho: entram na sala depois de alguém,
// ficam prontos e jogam a partida (escolhem bilhetes, conquistam rotas e
// compram cartas).
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ex.: node tools/robos.mjs 2 30
import { rankRoutes } from '../public/rules.js';

const base = process.env.TTR_URL ?? 'http://localhost:3000';
const howMany = Math.min(Number(process.argv[2] ?? 2), 4);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const { code } = await (await fetch(`${base}/api/info`)).json();

const BOTS = [
  { name: 'Ana (robô)', color: 'azul' },
  { name: 'Caio (robô)', color: 'verde' },
  { name: 'Duda (robô)', color: 'amarelo' },
  { name: 'Leo (robô)', color: 'roxo' },
];

// Escolhe o que fazer na vez: a melhor rota segundo rankRoutes (a mesma conta
// do celular) se ajudar um bilhete; às vezes uma rota grande; senão, cartas.
function chooseMove(game, you) {
  const stats = game.players.find(p => p.id === you.id);
  const ranked = game.cardsDrawn > 0 ? [] : rankRoutes({
    hand: you.hand,
    tickets: you.tickets,
    claimed: game.claimed,
    playerId: you.id,
    playerCount: game.players.length,
    trains: stats.trains,
  });
  const helpful = ranked.filter(x => x.helps.length);
  const pick = helpful[0] ?? (Math.random() < 0.35 ? [...ranked].sort((a, b) => b.route.length - a.route.length)[0] : null);
  if (pick) {
    return {
      type: 'claimRoute',
      routeId: pick.route.id,
      color: pick.payment.color === 'locomotiva' ? null : pick.payment.color,
      locomotives: pick.payment.locomotives,
    };
  }
  const secondCard = game.cardsDrawn > 0;
  const faceUp = game.faceUp
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && !(card === 'locomotiva' && secondCard));
  if (faceUp.length && Math.random() < 0.5) {
    return { type: 'drawFaceUp', index: faceUp[Math.floor(Math.random() * faceUp.length)].index };
  }
  return { type: 'drawDeck' };
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
      // Jogada recusada na própria vez: tenta comprar da pilha para não travar.
      const g = lastState?.game;
      if (g?.stage === 'turns' && g.turnPlayerId === lastState.you?.id) {
        setTimeout(() => send({ type: 'drawDeck' }), thinkMs);
      }
      return;
    }
    if (msg.type !== 'state') return;
    lastState = msg;

    const { lobby, game, you } = msg;
    if (!you) {
      // Espera uma pessoa entrar primeiro: assim o líder é sempre alguém de verdade.
      // (ROBOS_SOZINHOS=1: os robôs jogam entre eles, para testar a partida inteira.)
      const someoneIn = lobby.players.length > 0 || process.env.ROBOS_SOZINHOS === '1';
      if (lobby.phase === 'lobby' && someoneIn && !lobby.players.some(p => p.color === bot.color)) {
        send({ type: 'join', name: bot.name, color: bot.color });
      }
      return;
    }
    if (lobby.phase === 'lobby' && !you.ready) send({ type: 'ready', ready: true });
    // Se um robô acabou virando líder, ele começa quando todos estiverem prontos.
    if (lobby.phase === 'lobby' && lobby.canStart && lobby.leaderId === you.id && !startScheduled) {
      startScheduled = true;
      setTimeout(() => {
        startScheduled = false;
        send({ type: 'start' });
      }, 2000);
    }
    if (!game || busy) return;

    const myTurn = game.stage === 'turns' && game.turnPlayerId === you.id;
    if (!you.pending && !myTurn) return;

    // Espera um pouco (para dar para ver na TV) e joga com o estado mais novo.
    busy = true;
    setTimeout(() => {
      busy = false;
      const { game: g, you: y } = lastState;
      if (!g || !y) return;
      if (y.pending) {
        send({ type: 'chooseTickets', keep: y.pending.offered.map(t => t.id) });
      } else if (g.stage === 'turns' && g.turnPlayerId === y.id) {
        send(chooseMove(g, y));
      }
    }, thinkMs);
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
