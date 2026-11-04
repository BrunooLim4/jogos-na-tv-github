// Teste automático da sala e da partida, conversando com o servidor de verdade.
// Uso (com o servidor de teste ligado e a sala vazia):
//   PORT=3031 node server.js   e   node tools/teste-sala.mjs http://localhost:3031
const base = process.argv[2] ?? 'http://localhost:3031';
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
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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

const a = await phone('Teste A', 'verde');
check(a.last().lobby.leaderId === a.last().you.id, 'o primeiro a entrar vira o líder');

const b = client();
await b.opened;
b.send({ type: 'hello', role: 'phone', code });
b.send({ type: 'join', name: 'Teste B', color: 'verde' });
check((await error(b)).code === 'cor_ocupada', 'cor repetida é recusada');
b.send({ type: 'join', name: 'teste a', color: 'amarelo' });
check((await error(b)).code === 'nome_repetido', 'nome repetido é recusado');
b.send({ type: 'join', name: 'Teste B', color: 'vermelho' });
check((await error(b)).code === 'cor_invalida', 'vermelho e azul não são cor de jogador (são dos times)');
b.send({ type: 'join', name: 'Teste B', color: 'amarelo' });
b.token = (await b.wait(m => m.type === 'welcome')).token;
await state(b, m => m.you?.name === 'Teste B');

const tvLobby = await state(tv, m => m.lobby.players.length === 2);
check(!JSON.stringify(tvLobby).includes(a.token), 'TV não recebe o token de ninguém');
check(a.last().you.team === 'vermelho' && b.last().you.team === 'azul', 'quem entra vai para o time com menos gente');

b.send({ type: 'start' });
check((await error(b)).code === 'so_lider', 'quem não é líder não consegue começar');
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.players.every(p => p.ready));
a.send({ type: 'start' });
check((await error(a)).code === 'nao_pode_comecar', 'com 1 pessoa por time não dá para começar');

const c = await phone('Teste C', 'laranja');
const d = await phone('Teste D', 'roxo');
check(c.last().you.team === 'vermelho' && d.last().you.team === 'azul', 'os times continuam equilibrados (2 × 2)');

d.send({ type: 'setTeam', team: 'vermelho' });
await state(tv, m => m.lobby.players.filter(p => p.team === 'vermelho').length === 3);
check(true, 'dá para trocar de time na sala');
c.send({ type: 'ready', ready: true });
d.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.players.length === 4 && m.lobby.players.every(p => p.ready));
check(!a.last().lobby.canStart, 'time com 1 pessoa só: ainda não pode começar');
d.send({ type: 'setTeam', team: 'azul' });
await state(a, m => m.lobby.canStart);
check(true, 'dois times de 2 e todos prontos: o líder pode começar');

c.send({ type: 'wantChief', on: true });
await state(tv, m => m.lobby.players.some(p => p.name === 'Teste C' && p.wantsChief));
a.send({ type: 'wantChief', on: true });
check((await error(a)).code === 'chefe_ocupado', 'só uma pessoa por time pede para ser chefe');

// ---------------------------------------------------------------- partida

tv.clear();
a.send({ type: 'start' });
const tvGame = await state(tv, m => m.lobby.phase === 'playing');
check(tvGame.you === null && tvGame.game.cards.length === 25, 'a partida começa com 25 palavras na TV');
check(!/"key"|assassino|neutro|"token"/.test(JSON.stringify(tvGame)), 'a TV não recebe o mapa de cores');
await wait(200);
const phones = { a, b, c, d };
check(c.last().you.chief && c.last().you.key?.length === 25, 'quem pediu vira chefe e recebe o mapa');
check(a.last().you.key === null, 'quem adivinha não recebe o mapa');
const blueChief = [b, d].filter(p => p.last().you.chief);
check(blueChief.length === 1 && blueChief[0].last().you.key?.length === 25, 'o outro time também tem um chefe (escolhido pelo jogo)');

// Joga uma vez: o chefe da vez dá a dica e alguém do time revela uma palavra certa.
const turn = tvGame.game.turn;
const chief = Object.values(phones).find(p => p.last().you.team === turn && p.last().you.chief);
const guesser = Object.values(phones).find(p => p.last().you.team === turn && !p.last().you.chief);
guesser.send({ type: 'reveal', index: 0 });
check((await error(guesser)).code === 'espere_a_dica', 'ninguém revela antes da dica');
tv.clear();
chief.send({ type: 'clue', word: 'zzteste', number: 1 });
const afterClue = await state(tv, m => m.game?.stage === 'guess');
check(afterClue.game.clue.word === 'ZZTESTE' && afterClue.game.clue.number === 1, 'a dica aparece na TV');
const right = chief.last().you.key.findIndex((color, i) => color === turn && !afterClue.game.cards[i].revealed);
guesser.send({ type: 'point', index: right });
await state(tv, m => m.game?.pointers && Object.values(m.game.pointers).includes(right));
check(true, 'a palavra apontada aparece na TV');
guesser.send({ type: 'reveal', index: right });
const afterReveal = await state(tv, m => m.game?.cards[right].revealed);
check(afterReveal.game.cards[right].color === turn, 'palavra revelada mostra a cor do time na TV');
check(!/"key"/.test(JSON.stringify(afterReveal)), 'a TV continua sem o mapa');

// Reconexão no meio da partida: volta para o mesmo lugar (e o chefe, com o mapa)
c.ws.close();
await state(tv, m => m.lobby.players.some(p => !p.online));
const back = client();
await back.opened;
back.send({ type: 'hello', role: 'phone', code, token: c.token });
const restored = await state(back, m => m.you);
check(restored.you.name === 'Teste C' && restored.lobby.phase === 'playing' && restored.you.key?.length === 25,
  'quem cai e volta continua na partida (o chefe, com o mapa)');

back.send({ type: 'endGame' });
check((await error(back)).code === 'so_lider', 'só o líder encerra a partida');
tv.clear();
a.send({ type: 'endGame' });
const ended = await state(tv, m => m.lobby.phase === 'lobby');
check(ended.game === null && ended.lobby.players.every(p => !p.ready && !p.wantsChief), 'encerrar volta todos para a sala');
check(ended.lobby.players.filter(p => p.team === 'vermelho').length === 2, 'os times continuam os mesmos');

a.send({ type: 'kick', id: restored.you.id });
await back.wait(m => m.type === 'kicked');
check(true, 'líder remove um jogador pelo celular');
for (const p of [d, b, a]) p.send({ type: 'leave' });
await state(tv, m => m.lobby.players.length === 0);
check(true, 'sala volta a ficar vazia');

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
