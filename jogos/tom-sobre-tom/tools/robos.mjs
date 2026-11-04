// Jogadores de mentira para testar sozinho: entram na sala depois de alguém,
// ficam prontos e jogam. Dão dicas de verdade ("tomate", "oceano"...) e, para pôr
// o cone, procuram a cor que combina com a dica (se a dica for de um humano e eles
// não conhecerem a palavra, chutam).
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ROBOS_SOZINHOS=1 → os robôs jogam entre eles (o 1º robô vira o líder).
//   JOGO_URL=http://localhost:3071 → servidor de teste.
import { BOARD, CELLS } from '../public/cores.js';
import { revealMs } from '../public/tempos.js';

const base = process.env.JOGO_URL ?? 'http://localhost:3070';
const howMany = Math.min(Number(process.argv[2] ?? 3), 9);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const { code } = await (await fetch(`${base}/api/info`)).json();

const COLORS = ['azul', 'verde', 'vermelho', 'roxo', 'amarelo', 'laranja', 'rosa', 'turquesa', 'branco', 'preto'];
// Cada robô prefere uma cor; se já foi escolhida, pega a próxima livre.
const BOTS = ['Ana', 'Caio', 'Duda', 'Leo', 'Fê', 'Gabi', 'Igor', 'Júlia', 'Nico'].map((name, i) => ({
  name: `${name} (robô)`,
  colors: [...COLORS.slice(i + 1), ...COLORS.slice(0, i + 1)],
}));

// As palavras que os robôs conhecem, com a cor que cada uma lembra.
const WORDS = {
  tomate: '#e53935', cereja: '#a51c30', vinho: '#7b1e3a', tijolo: '#b5452b', coral: '#f2685a',
  framboesa: '#d6336c', cenoura: '#f57c20', abóbora: '#f08a24', tangerina: '#f99a2c', pêssego: '#f8b38a',
  salmão: '#f58b78', damasco: '#f9b46a', mel: '#e9a520', gema: '#ffc107', sol: '#fcd116',
  banana: '#f3dc3a', manteiga: '#f6e7a1', areia: '#e8d8a8', baunilha: '#f1e7b8', limão: '#d4e157',
  alface: '#a5d65a', grama: '#56b947', folha: '#4caf50', floresta: '#1d7a3a', abacate: '#7ca741',
  oliva: '#8a9a3b', menta: '#9fdfc0', esmeralda: '#1aa260', piscina: '#3ec8e6', céu: '#8ccff3',
  mar: '#1e88c8', oceano: '#1565a8', jeans: '#3a5fa8', noite: '#2c2f7a', lavanda: '#b8a2d4',
  uva: '#6b3a8c', ametista: '#9b59b6', berinjela: '#4a2350', chiclete: '#f28ab8', flamingo: '#f37aa0',
  chocolate: '#5d3418', café: '#6f3f1e', canela: '#a0522d', caramelo: '#c47a2c', ferrugem: '#a94a22',
  nuvem: '#e6eef4', gelo: '#cfe9f1',
};

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const light = hex => rgb(hex).reduce((sum, v, i) => sum + v * [0.3, 0.59, 0.11][i], 0);
// Distância entre duas cores (fórmula "redmean": simples e boa o bastante).
function colorDistance(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}
const closestWord = hex => Object.entries(WORDS).sort(([, a], [, b]) => colorDistance(hex, a) - colorDistance(hex, b))[0];
const pickAny = list => list[Math.floor(Math.random() * list.length)];

// Uma casa livre com a cor mais parecida com `hex` (com um pouco de erro, como gente).
function guessCell(game, hex) {
  const taken = new Set(game.pieces.map(p => p.cell));
  const free = [...Array(CELLS).keys()].filter(c => !taken.has(c));
  if (!hex) return pickAny(free);
  const ranked = free.map(c => [c, colorDistance(BOARD[c], hex) + Math.random() * 60]).sort((a, b) => a[1] - b[1]);
  return ranked[Math.floor(Math.random() * 3)][0];
}

// O que o robô faz agora: { msg, delay } ou null se não é com ele.
function chooseMove(game, you) {
  const giver = game.cueGiverId === you.id;
  if (game.stage === 'dica1' && giver && you.card) {
    const target = pickAny(you.card);
    return { msg: { type: 'cue1', target, text: closestWord(BOARD[target])[0] } };
  }
  if (game.stage === 'dica2' && giver && you.target !== undefined) {
    if (Math.random() < 0.2) return { msg: { type: 'cue2', pass: true } };
    const [word, ref] = closestWord(BOARD[you.target]);
    const diff = light(BOARD[you.target]) - light(ref);
    return { msg: { type: 'cue2', text: `${word} ${diff > 25 ? 'claro' : diff < -25 ? 'escuro' : 'mesmo'}` } };
  }
  if ((game.stage === 'cones1' || game.stage === 'cones2') && game.turnId === you.id) {
    const cue = game.stage === 'cones2' && game.cue2?.text ? game.cue2.text : game.cue1?.text ?? '';
    const known = cue.toLowerCase().split(' ').map(w => WORDS[w]).find(Boolean);
    return { msg: { type: 'cone', cell: guessCell(game, known) } };
  }
  // Depois da revelação, quem dá a próxima dica espera a TV mostrar os pontos.
  if (game.stage === 'revelacao' && game.nextCueGiverId === you.id) {
    return { msg: { type: 'nextRound', round: game.round }, delay: revealMs(game.result) + 2500 };
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
    const plan = game && !busy ? chooseMove(game, you) : null;
    if (!plan) return;
    // Espera um pouco (para dar para ver na TV) e joga com o estado mais novo.
    busy = true;
    setTimeout(() => {
      busy = false;
      const { game: g, you: y } = lastState;
      const move = g && y ? chooseMove(g, y) : null;
      if (move) send(move.msg);
    }, plan.delay ?? thinkMs * (0.6 + Math.random()));
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
