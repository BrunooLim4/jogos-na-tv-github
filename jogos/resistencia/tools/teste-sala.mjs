// Teste automático da sala e da partida, conversando com o servidor de verdade.
// Uso (com o servidor ligado e a sala vazia): node tools/teste-sala.mjs
const base = process.argv[2] ?? 'http://localhost:3041';
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
const state = (c, pred = () => true) => c.wait(m => m.type === 'state' && pred(m));
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

b.send({ type: 'start' });
check((await error(b)).code === 'so_lider', 'quem não é líder não consegue começar');
const c = await phone('Teste C', 'verde');
const d = await phone('Teste D', 'roxo');
const e = await phone('Teste E', 'amarelo');
const phones = [a, b, c, d, e];
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.players.length === 5);
a.send({ type: 'start' });
check((await error(a)).code === 'nao_pode_comecar', 'líder não começa sem todos prontos');
for (const p of [c, d, e]) p.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.canStart);
check(true, 'com 5 pessoas prontas, o líder pode começar');

// ---------------------------------------------------------------- partida

// Guarda tudo que a TV recebe, para conferir que nenhum segredo passou por ela.
const tvSeen = [];
tv.ws.addEventListener('message', event => tvSeen.push(String(event.data)));

tv.clear();
a.send({ type: 'start' });
const tvGame = await state(tv, m => m.lobby.phase === 'playing');
check(tvGame.you === null && tvGame.game.stage === 'roles', 'a partida começa e a TV recebe só o público');

const mine = await Promise.all(phones.map(p => state(p, m => m.game?.stage === 'roles')));
const roles = mine.map(m => m.you.role);
const spyPhones = phones.filter((_, i) => roles[i] === 'espiao');
const resistPhones = phones.filter((_, i) => roles[i] === 'resistencia');
check(spyPhones.length === 2 && resistPhones.length === 3, 'cada celular recebe o seu papel (2 espiões em 5)');
check(mine.every(m => m.you.role !== 'espiao' || m.you.otherSpies.length === 1), 'cada espião vê o outro espião');

for (const p of phones) p.send({ type: 'seeRole' });
const pickState = await state(tv, m => m.game?.stage === 'pick');
const idOf = new Map(phones.map((p, i) => [p, mine[i].you.id]));
const boss = phones.find(p => idOf.get(p) === pickState.game.commanderId);
const notBoss = phones.find(p => p !== boss);
check(Boolean(boss), 'todos viram o papel → alguém comanda');

notBoss.send({ type: 'pick', id: idOf.get(notBoss) });
check((await error(notBoss)).code === 'nao_comanda', 'quem não comanda não escolhe o time');

// Time da Missão 1 (2 pessoas): uma da Resistência e um espião.
const team = [resistPhones[0], spyPhones[0]];
for (const p of team) boss.send({ type: 'pick', id: idOf.get(p) });
await state(tv, m => m.game?.draft.length === 2);
check(true, 'a TV vê na hora quem o comandante escolheu');
boss.send({ type: 'propose' });
await state(tv, m => m.game?.stage === 'vote');
for (const p of phones) p.send({ type: 'vote', approve: true });
await state(tv, m => m.game?.stage === 'mission');
check(true, 'todos aprovam → missão');

resistPhones[0].send({ type: 'mission', choice: 'sabotar' });
check((await error(resistPhones[0])).code === 'so_sucesso', 'quem é da Resistência não consegue sabotar');
resistPhones[0].send({ type: 'mission', choice: 'sucesso' });
spyPhones[0].send({ type: 'mission', choice: 'sabotar' });
const after = await state(tv, m => m.game?.missions[0].result);
check(after.game.missions[0].result === 'fracasso' && after.game.missions[0].sabotages === 1, 'missão com 1 sabotagem fracassa');
check(tvSeen.every(text => !/"role"|espiao"|"otherSpies"|"choice"|sabotar/.test(text)), 'a TV nunca recebeu papel, escolha da missão nem nada secreto');

// Reconexão no meio da partida: volta para o mesmo lugar (e o mesmo papel)
const bRole = roles[1];
b.ws.close();
await state(tv, m => m.lobby.players.some(p => !p.online));
const back = client();
await back.opened;
back.send({ type: 'hello', role: 'phone', code, token: b.token });
const restored = await state(back, m => m.you);
check(restored.you.name === 'Teste B' && restored.lobby.phase === 'playing' && restored.you.role === bRole, 'quem cai e volta continua na partida, com o mesmo papel');
phones[1] = back;
idOf.set(back, restored.you.id);

// 5 times recusados seguidos → espiões vencem; o líder começa outra partida.
// (tv.clear() antes de cada jogada: só conta o retrato que veio depois dela)
let now = after.game;
for (let i = 0; i < 5 && now.stage !== 'over'; i++) {
  const commander = phones.find(p => idOf.get(p) === now.commanderId);
  const size = now.missions[now.mission].size;
  tv.clear();
  for (const p of phones.slice(0, size)) commander.send({ type: 'pick', id: idOf.get(p) });
  commander.send({ type: 'propose' });
  await state(tv, m => m.game?.stage === 'vote');
  tv.clear();
  for (const p of phones) p.send({ type: 'vote', approve: false });
  now = (await state(tv, m => m.game?.stage !== 'vote')).game;
}
check(now.stage === 'over' && now.winner === 'espioes' && now.spies.length === 2, '5 times recusados → espiões vencem, e a TV mostra quem eram');
back.send({ type: 'rematch' });
check((await error(back)).code === 'so_lider', 'só o líder começa outra partida');
tv.clear();
a.send({ type: 'rematch' });
const again = await state(tv, m => m.game?.stage === 'roles');
check(again.game.missions.every(m => !m.result) && again.game.spies === null, '"Jogar de novo": partida nova com as mesmas pessoas');

back.send({ type: 'endGame' });
check((await error(back)).code === 'so_lider', 'só o líder encerra a partida');
tv.clear();
a.send({ type: 'endGame' });
const ended = await state(tv, m => m.lobby.phase === 'lobby');
check(ended.game === null && ended.lobby.players.every(p => !p.ready), 'encerrar volta todos para a sala');

a.send({ type: 'kick', id: restored.you.id });
await back.wait(m => m.type === 'kicked');
check(true, 'líder remove um jogador pelo celular');
for (const p of [c, d, e]) p.send({ type: 'leave' });
a.send({ type: 'leave' });
await state(tv, m => m.lobby.players.length === 0);
check(true, 'sala volta a ficar vazia');

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
