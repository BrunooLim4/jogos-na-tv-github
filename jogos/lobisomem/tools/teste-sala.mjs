// Teste automático da sala e de uma partida inteira, conversando com o servidor de verdade.
// Uso (com o servidor de teste ligado e a sala vazia): node tools/teste-sala.mjs http://localhost:3081
import { actOf, roleOf } from '../public/papeis.js';

const base = process.argv[2] ?? 'http://localhost:3081';
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
const c = await phone('Teste C', 'verde');

b.send({ type: 'start' });
check((await error(b)).code === 'so_lider', 'quem não é líder não consegue começar');
a.send({ type: 'start' });
check((await error(a)).code === 'nao_pode_comecar', 'líder não começa sem todos prontos');
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.players.filter(p => p.ready).length === 2);
check(!a.last().lobby.canStart, 'com 2 jogadores ainda não dá para começar (mínimo 3)');
c.send({ type: 'ready', ready: true });
await state(a, m => m.lobby.canStart);
check(true, 'com todos prontos, o líder pode começar');

// ---------------------------------------------------------------- partida

tv.clear();
a.send({ type: 'start' });
const tvGame = await state(tv, m => m.lobby.phase === 'playing');
check(tvGame.you === null && tvGame.game.stage === 'noite', 'a partida começa de noite e a TV recebe só o público');
const players = [a, b, c];
const mine = await Promise.all(players.map(p => state(p, m => m.you?.card)));
check(mine.every(m => m.you.card) && !('card' in (tvGame.game.players[0] ?? {})), 'cada celular recebe a SUA carta; a TV não recebe a de ninguém');
const ids = mine.map(m => m.you.id);
check(JSON.stringify(tvGame.game).split('"card"').length === 1, 'o retrato da TV não tem carta de jogador');

// a noite: cada um faz uma escolha válida para o seu personagem
async function night(p, m) {
  const role = m.you.step === 'sosia-2' ? m.you.copied : roleOf(m.you.card);
  const option = actOf(role).options[0];
  const others = ids.filter(id => id !== m.you.id);
  p.clear();
  p.send({ type: 'night', pick: { players: others.slice(0, option.players), center: [0, 1, 2].slice(0, option.center) } });
  const next = await state(p, s => s.game && (s.game.stage !== 'noite' || (s.you?.step && s.you.step !== m.you.step)));
  if (next.you.step === 'sosia-2') await night(p, next);
}
a.send({ type: 'night', pick: { players: [], center: [0, 1, 2] } });
check((await error(a)).code === 'escolha_invalida', 'escolha da noite que não vale é recusada');
for (const [i, p] of players.entries()) await night(p, mine[i]);
const dawn = await state(tv, m => m.game?.stage === 'dia');
check(dawn.game.dayEndsAt > Date.now() && dawn.game.events.some(e => e.kind === 'dawn'), 'quando o último termina, amanhece e o relógio do dia começa');
await new Promise(resolve => setTimeout(resolve, 200));
const infos = players.map(p => p.last());
check(infos.every(m => m.game.stage === 'dia' && m.you.info.length >= 1), 'de dia, cada celular recebe o que descobriu à noite');

// a votação: só o líder adianta; todos votam no Teste B (e B vota no A)
b.send({ type: 'voteNow' });
check((await error(b)).code === 'so_lider', 'só o líder manda votar antes do tempo');
a.send({ type: 'addMinute' });
await state(tv, m => m.game?.dayEndsAt > dawn.game.dayEndsAt + 50_000);
check(true, 'o líder dá mais 1 minuto de conversa');
a.send({ type: 'voteNow' });
await state(tv, m => m.game?.stage === 'votacao');
a.send({ type: 'vote', target: ids[1] });
b.send({ type: 'vote', target: ids[1] });
check((await error(b)).code === 'voto_em_si', 'ninguém vota em si mesmo');
b.send({ type: 'vote', target: ids[0] });
const halfway = await state(tv, m => m.game?.players.filter(p => p.voted).length === 2);
check(!JSON.stringify(halfway.game).includes('"votes"'), 'antes do último voto a TV não sabe em quem cada um votou');
c.send({ type: 'vote', target: ids[1] });
const end = await state(tv, m => m.game?.stage === 'fim');
check(end.game.result.dead[0] === ids[1] && Object.keys(end.game.result.cards).length === 6, 'no fim a TV recebe o resultado: quem morreu e todas as cartas');
const mineEnd = await state(a, m => m.game?.stage === 'fim');
check(typeof mineEnd.you.won === 'boolean' && mineEnd.you.finalCard, 'o celular recebe a carta final e se venceu');

// jogar de novo: partida 2 com as mesmas pessoas
b.send({ type: 'playAgain' });
check((await error(b)).code === 'so_lider', 'só o líder começa outra partida');
a.send({ type: 'playAgain' });
const again = await state(tv, m => m.game?.match === 2);
check(again.game.stage === 'noite' && again.game.players.length === 3, '"Jogar de novo" distribui de novo para os mesmos jogadores');

// Reconexão no meio da partida: volta para o mesmo lugar
b.ws.close();
await state(tv, m => m.lobby.players.some(p => !p.online));
const back = client();
await back.opened;
back.send({ type: 'hello', role: 'phone', code, token: b.token });
const restored = await state(back, m => m.you);
check(restored.you.name === 'Teste B' && restored.lobby.phase === 'playing' && restored.you.card, 'quem cai e volta continua na partida, com a mesma carta');

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
