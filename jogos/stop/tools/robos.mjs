// Jogadores de mentira para testar sozinho: entram na sala depois de alguém, ficam
// prontos e jogam: escrevem uma palavra com a letra em cada categoria (às vezes deixam
// em branco), dão STOP quando terminam, às vezes votam contra uma resposta e tocam em
// "Tudo certo" na correção.
// Uso (com o servidor ligado): node tools/robos.mjs [quantos] [minutos] [velocidade-ms]
//   ROBOS_SOZINHOS=1 → os robôs jogam entre eles (o 1º robô vira o líder e começa as
//   próximas rodadas e outra partida no fim).
//   JOGO_URL=http://localhost:3091 → servidor de teste.
import { WORDS } from './palavras-robos.mjs';

const base = process.env.JOGO_URL ?? 'http://localhost:3090';
const howMany = Math.min(Number(process.argv[2] ?? 3), 9);
const minutes = Number(process.argv[3] ?? 30);
const thinkMs = Number(process.argv[4] ?? 1500);
const alone = process.env.ROBOS_SOZINHOS === '1';
const { code } = await (await fetch(`${base}/api/info`)).json();

const COLORS = ['azul', 'verde', 'vermelho', 'roxo', 'amarelo', 'laranja', 'rosa', 'turquesa', 'branco', 'marrom'];
const BOTS = ['Ana', 'Caio', 'Duda', 'Leo', 'Fê', 'Gabi', 'Hugo', 'Iara', 'Juca'].map((name, i) => ({
  name: `${name} (robô)`,
  colors: [...COLORS.slice(i + 1), ...COLORS.slice(0, i + 1)],
}));
const pickOne = list => list[Math.floor(Math.random() * list.length)];

function startBot(bot) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  const send = message => ws.send(JSON.stringify(message));
  let startScheduled = false;
  let state = null;
  let writing = null; // { round, answers, timer }
  let reviewed = null; // "round:index" já conferida
  let leaderTimer = null;
  let offset = 0; // relógio do servidor − relógio daqui

  // Escreve uma resposta a cada "pensada"; quando termina, dá STOP.
  function writeStep() {
    const { game } = state;
    if (!game || game.stage !== 'escrevendo' || writing.round !== game.round) return;
    const now = Date.now() + offset; // relógio do servidor
    if (now < game.writingStartsAt) return void (writing.timer = setTimeout(writeStep, game.writingStartsAt - now + 200));
    const empty = game.categories.filter(c => !(c in writing.answers));
    if (!empty.length) {
      if (Object.values(writing.answers).every(Boolean)) send({ type: 'stop', round: game.round, answers: writing.answers });
      return;
    }
    const category = empty[0];
    writing.answers[category] = Math.random() < 0.12 ? '' : pickOne(WORDS[game.letter] ?? ['?']);
    send({ type: 'answers', round: game.round, answers: writing.answers });
    writing.timer = setTimeout(writeStep, thinkMs * (0.4 + Math.random()));
  }

  ws.addEventListener('open', () => send({ type: 'hello', role: 'phone', code }));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'error') {
      if (msg.code !== 'faltam' && msg.code !== 'nao_escrevendo') console.log(`${bot.name}: ${msg.message}`);
      return;
    }
    if (msg.type !== 'state') return;
    state = msg;
    if (msg.game) offset = msg.game.now - Date.now();
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
    if (lobby.phase === 'lobby') {
      writing = null;
      if (!you.ready) send({ type: 'ready', ready: true });
      if (lobby.canStart && lobby.leaderId === you.id && !startScheduled) {
        startScheduled = true;
        setTimeout(() => {
          startScheduled = false;
          send({ type: 'start' });
        }, 2000);
      }
      return;
    }
    if (!game) return;
    if (game.stage === 'escrevendo' && writing?.round !== game.round) {
      clearTimeout(writing?.timer);
      writing = { round: game.round, answers: {}, timer: null };
      writing.timer = setTimeout(writeStep, 400);
    }
    if (game.stage === 'correcao' && reviewed !== `${game.round}:${game.review.index}`) {
      reviewed = `${game.round}:${game.review.index}`;
      const key = reviewed;
      // às vezes vota contra uma resposta de outro; depois toca em "Tudo certo"
      const others = game.review.answers.filter(a => a.status === 'ok' && a.playerId !== you.id
        && !game.review.answers.some(m => m.playerId === you.id && m.key === a.key));
      if (others.length && Math.random() < 0.25) {
        setTimeout(() => send({ type: 'reject', round: game.round, index: game.review.index, key: pickOne(others).key, on: true }), thinkMs * Math.random());
      }
      setTimeout(() => {
        if (state.game?.stage === 'correcao' && `${state.game.round}:${state.game.review.index}` === key) send({ type: 'reviewed', round: game.round });
      }, thinkMs * (1 + Math.random() * 1.5));
    }
    if (alone && lobby.leaderId === you.id && (game.stage === 'placar' || game.stage === 'fim') && !leaderTimer) {
      leaderTimer = setTimeout(() => {
        leaderTimer = null;
        const g = state.game;
        if (g?.stage === 'placar') send({ type: 'nextRound', round: g.round });
        if (g?.stage === 'fim') send({ type: 'playAgain' });
      }, game.stage === 'fim' ? 20_000 : 5000);
    }
  });
  ws.addEventListener('close', () => console.log(`${bot.name}: desconectado`));
}

BOTS.slice(0, howMany).forEach((bot, i) => setTimeout(() => startBot(bot), i * 300));
console.log(`${howMany} robô(s) esperando alguém entrar na sala ${code} pelo celular (por ${minutes} min). Ctrl+C para tirar.`);
setTimeout(() => process.exit(0), minutes * 60_000);
