// Teste automático da sala e de uma rodada inteira, conversando com o servidor de verdade.
// Uso (com o servidor de teste ligado e a sala vazia): node tools/teste-sala.mjs http://localhost:3091
const base = process.argv[2] ?? 'http://localhost:3091';
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const { code } = await (await fetch(`${base}/api/info`)).json();

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FALHOU'}  ${label}`);
  if (!ok) failures++;
};

// Um cliente que guarda as mensagens e deixa esperar por uma específica.
function client() {
  const ws = new WebSocket(wsUrl);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') lastState.set(ws, msg);
    const waiter = waiters.find(w => w.pred(msg));
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(msg);
    } else {
      inbox.push(msg);
    }
  });
  return {
    ws,
    opened: new Promise(resolve => ws.addEventListener('open', resolve)),
    send: msg => ws.send(JSON.stringify(msg)),
    last: () => lastState.get(ws),
    clear: () => inbox.splice(0),
    wait(pred, ms = 2000) {
      const found = inbox.find(pred);
      if (found) {
        inbox.splice(inbox.indexOf(found), 1);
        return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        const waiter = { pred, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(new Error('tempo esgotado esperando mensagem'));
          }
        }, ms);
      });
    },
  };
}
const lastState = new Map();
const state = (c, pred = () => true, ms) => c.wait(m => m.type === 'state' && pred(m), ms);
const error = c => c.wait(m => m.type === 'error');

async function phone(name, color) {
  const c = client();
  await c.opened;
  c.send({ type: 'hello', role: 'phone', code });
  c.send({ type: 'join', name, color });
  const welcome = await c.wait(m => m.type === 'welcome');
  await state(c, m => m.you?.name === name);
  c.token = welcome.token;
  return c;
}

// ---------------------------------------------------------------- sala

const tv = client();
await tv.opened;
tv.send({ type: 'hello', role: 'tv' });
const initial = await state(tv);
if (initial.lobby.players.length || initial.lobby.phase !== 'lobby') {
  console.log('A sala precisa estar vazia (reinicie o servidor e rode de novo).');
  process.exit(1);
}
check(initial.you === null, 'TV conecta e não é jogador');

const wrong = client();
await wrong.opened;
wrong.send({ type: 'hello', role: 'phone', code: 'XXXX' });
check((await error(wrong)).code === 'sala_inexistente', 'código errado → "sala não encontrada"');
wrong.ws.close();

const a = await phone('Teste A', 'vermelho');
check(a.last().lobby.leaderId === a.last().you.id, 'o primeiro a entrar vira o líder');

const b = client();
await b.opened;
b.send({ type: 'hello', role: 'phone', code });
b.send({ type: 'join', name: 'Teste B', color: 'vermelho' });
check((await error(b)).code === 'cor_ocupada', 'cor repetida é recusada');
b.send({ type: 'join', name: 'teste a', color: 'azul' });
check((await error(b)).code === 'nome_repetido', 'nome repetido é recusado');
b.send({ type: 'join', name: 'Teste B', color: 'azul' });
b.token = (await b.wait(m => m.type === 'welcome')).token;
await state(b, m => m.you?.name === 'Teste B');

const tvLobby = await state(tv, m => m.lobby.players.length === 2);
check(!JSON.stringify(tvLobby).includes(a.token), 'TV não recebe o token de ninguém');
const c = await phone('Teste C', 'verde');

b.send({ type: 'start' });
check((await error(b)).code === 'so_lider', 'quem não é líder não consegue começar');
a.send({ type: 'start' });
check((await error(a)).code === 'nao_pode_comecar', 'líder não começa sem todos prontos');
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
c.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.canStart);
check(true, 'com todos prontos, o líder pode começar');

// ---------------------------------------------------------------- partida

tv.clear();
a.send({ type: 'start' });
const tvGame = await state(tv, m => m.lobby.phase === 'playing');
const { letter, categories, round } = tvGame.game;
check(tvGame.you === null && tvGame.game.stage === 'escrevendo' && letter && categories.length === 8, 'a partida começa: letra e 8 categorias');
const word = (i, j) => `${letter}teste${i}${j}`;
const full = i => Object.fromEntries(categories.map((c, j) => [c, j === 0 ? `${letter}igual` : word(i, j)]));
b.send({ type: 'answers', round, answers: { [categories[0]]: `${letter}segredo` } });
const tvFilled = await state(tv, m => m.game?.players.some(p => p.filled === 1));
check(!JSON.stringify(tvFilled).includes('segredo'), 'enquanto escrevem, a TV vê quantas cada um preencheu, não as respostas');
a.send({ type: 'stop', round, answers: { [categories[0]]: `${letter}x` } });
check((await error(a)).code === 'faltam', 'STOP sem preencher tudo é recusado');
await new Promise(resolve => setTimeout(resolve, Math.max(0, tvGame.game.writingStartsAt - tvGame.game.now) + 100));
b.send({ type: 'answers', round, answers: full(1) });
a.send({ type: 'stop', round, answers: full(0) });
await state(tv, m => m.game?.stage === 'parando');
check(true, 'STOP! os outros têm 3 segundos');
const review = await state(tv, m => m.game?.stage === 'correcao', 6000);
check(review.game.review.answers.length === 3 && review.game.review.answers.every(x => x.status !== undefined), 'na correção a TV recebe as respostas da categoria');
const mine = review.game.review.answers.find(x => x.text === `${letter}igual`);
a.send({ type: 'reject', round, index: 0, key: mine.key, on: true });
check((await error(a)).code === 'propria', 'ninguém vota contra a própria resposta');
for (let k = 0; k < categories.length; k++) {
  for (const p of [a, b, c]) p.send({ type: 'reviewed', round });
  await state(tv, m => m.game?.stage === 'placar' || m.game?.review?.index === k + 1);
}
const board = tv.last(); // (o placar já chegou na última volta acima)
const first = board.game.results[0].answers;
check(first.filter(x => x.points === 5).length === 2 && first.find(x => !x.text)?.points === 0, 'a mesma resposta de dois vale 5 para cada; em branco vale 0');
b.send({ type: 'nextRound', round });
check((await error(b)).code === 'so_lider', 'só o líder começa a próxima rodada');
a.send({ type: 'nextRound', round });
a.send({ type: 'nextRound', round });
const round2 = await state(tv, m => m.game?.round === 2);
check(round2.game.stage === 'escrevendo' && round2.game.letter !== letter, 'próxima rodada com letra nova (toque repetido ignorado)');

// Reconexão no meio da partida: volta para o mesmo lugar
b.ws.close();
await state(tv, m => m.lobby.players.some(p => !p.online));
const back = client();
await back.opened;
back.send({ type: 'hello', role: 'phone', code, token: b.token });
const restored = await state(back, m => m.you);
check(restored.you.name === 'Teste B' && restored.lobby.phase === 'playing', 'quem cai e volta continua na partida');

back.send({ type: 'endGame' });
check((await error(back)).code === 'so_lider', 'só o líder encerra a partida');
tv.clear();
a.send({ type: 'endGame' });
const ended = await state(tv, m => m.lobby.phase === 'lobby');
check(ended.game === null && ended.lobby.players.every(p => !p.ready), 'encerrar volta todos para a sala');

a.send({ type: 'kick', id: restored.you.id });
await back.wait(m => m.type === 'kicked');
check(true, 'líder remove um jogador pelo celular');
a.send({ type: 'leave' });
c.send({ type: 'leave' });
await state(tv, m => m.lobby.players.length === 0);
check(true, 'sala volta a ficar vazia');

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
