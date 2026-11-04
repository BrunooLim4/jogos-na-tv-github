// Jogadores de mentira para testar sozinho: entram na sala depois de alguém,
// ficam prontos e jogam (a decisão de cada jogada fica em chooseMove — TROCAR).
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ROBOS_SOZINHOS=1 → os robôs jogam entre eles (o 1º robô vira o líder).
//   JOGO_URL=http://localhost:3021 → servidor de teste.
const base = process.env.JOGO_URL ?? 'http://localhost:3020';
const howMany = Math.min(Number(process.argv[2] ?? 2), 6);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const { code } = await (await fetch(`${base}/api/info`)).json();

const COLORS = ['azul', 'verde', 'vermelho', 'roxo', 'amarelo', 'laranja'];
// Cada robô prefere uma cor; se já foi escolhida, pega a próxima livre.
const BOTS = ['Ana', 'Caio', 'Duda', 'Leo', 'Fê', 'Gabi'].map((name, i) => ({
  name: `${name} (robô)`,
  colors: [...COLORS.slice(i), ...COLORS.slice(0, i)],
}));

// O que o robô faz agora (ou null se não é com ele). TROCAR pelas jogadas do jogo.
function chooseMove(game, you, lobby) {
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
      const someoneIn = lobby.players.length > 0 || process.env.ROBOS_SOZINHOS === '1';
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
    if (!game || busy || !chooseMove(game, you, lobby)) return;
    // Espera um pouco (para dar para ver na TV) e joga com o estado mais novo.
    busy = true;
    setTimeout(() => {
      busy = false;
      const { game: g, you: y, lobby: l } = lastState;
      const move = g && y ? chooseMove(g, y, l) : null;
      if (move) send(move);
    }, thinkMs * (0.6 + Math.random()));
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
