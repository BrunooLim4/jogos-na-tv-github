// Jogadores de mentira para testar sozinho: entram na sala depois de alguém,
// ficam prontos e jogam. O robô chefe dá dicas aleatórias; o robô que adivinha
// aponta uma palavra qualquer, revela e às vezes passa (ele não vê o mapa).
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ROBOS_SOZINHOS=1 → os robôs jogam entre eles (o 1º robô vira o líder).
//   ROBO_LIDER_REPETE=1 → robô líder começa outra partida quando uma acaba.
//   JOGO_URL=http://localhost:3031 → servidor de teste.
const base = process.env.JOGO_URL ?? 'http://localhost:3030';
const howMany = Math.min(Number(process.argv[2] ?? 3), 7);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const { code } = await (await fetch(`${base}/api/info`)).json();

const COLORS = ['verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano', 'marrom', 'cinza'];
// Cada robô prefere uma cor; se já foi escolhida, pega a próxima livre.
const BOTS = ['Ana', 'Caio', 'Duda', 'Leo', 'Fê', 'Gabi', 'Rui'].map((name, i) => ({
  name: `${name} (robô)`,
  colors: [...COLORS.slice(i + 1), ...COLORS.slice(0, i + 1)],
}));
const CLUES = ['ANIMAL', 'COMIDA', 'VIAGEM', 'ESPORTE', 'NATUREZA', 'BRINQUEDO', 'TRABALHO', 'FESTA',
  'METAL', 'ROUPA', 'BARULHO', 'FRIO', 'QUENTE', 'ANTIGO', 'GRANDE', 'PEQUENO', 'REDONDO', 'NOITE'];
const pickOne = list => list[Math.floor(Math.random() * list.length)];

// O que o robô faz agora (ou null se não é com ele).
function chooseMove(game, you, lobby) {
  if (game.stage === 'over') {
    const again = process.env.ROBO_LIDER_REPETE === '1' && lobby.leaderId === you.id;
    return again ? { type: 'rematch' } : null;
  }
  if (game.turn !== you.team) return null;
  if (you.chief && game.stage === 'clue') {
    const onBoard = new Set(game.cards.map(c => c.word));
    return { type: 'clue', word: pickOne(CLUES.filter(w => !onBoard.has(w))), number: 1 + Math.floor(Math.random() * 2) };
  }
  if (you.chief || game.stage !== 'guess') return null;
  if (game.guessesMade > 0 && Math.random() < 0.3) return { type: 'pass' };
  const pointing = game.pointers[you.id];
  if (pointing !== undefined) return { type: 'reveal', index: pointing };
  const hidden = game.cards.map((c, i) => (c.revealed ? null : i)).filter(i => i !== null);
  return { type: 'point', index: pickOne(hidden) };
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
    }, thinkMs * (0.6 + Math.random()) * (game.stage === 'over' ? 3 : 1));
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
