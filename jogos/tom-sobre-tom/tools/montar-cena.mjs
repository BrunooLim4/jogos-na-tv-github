// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala
// e param na fase pedida. Imprime o token de cada um — com ele no localStorage
// (chave tom-sobre-tom-token-<SALA>), o celular abre direto como aquele jogador.
// Ao lado do nome: "dica" = quem dá a dica; "vez" = quem está na vez do cone.
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs <fase> [quantos]
//   fases: sala, dica, cones, dica2, cones2, revelacao, fim
//   JOGO_URL=http://localhost:3071 (padrão)
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
import { ROWS, COLS, cellAt, rowOf, colOf } from '../public/cores.js';

const base = process.env.JOGO_URL ?? 'http://localhost:3071';
const stage = process.argv[2] ?? 'sala';
const howMany = Math.max(3, Math.min(Number(process.argv[3] ?? 4), 10));
const { code } = await (await fetch(`${base}/api/info`)).json();
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const PEOPLE = [
  { name: 'Bruno', color: 'azul' },
  { name: 'Ana', color: 'vermelho' },
  { name: 'Caio', color: 'verde' },
  { name: 'Duda', color: 'roxo' },
  { name: 'Leo', color: 'amarelo' },
  { name: 'Gabi', color: 'laranja' },
  { name: 'Igor', color: 'rosa' },
  { name: 'Júlia', color: 'turquesa' },
  { name: 'Nico', color: 'branco' },
  { name: 'Rita', color: 'preto' },
].slice(0, howMany);

// Chutes "de gente" em volta da cor certa (linha, coluna a partir dela).
const NEAR = [[0, 1], [1, -1], [-2, 0], [1, 2], [0, 0], [-1, -3], [3, 1], [0, -2], [-3, 2], [2, -3], [4, 0], [-1, 1], [2, 0], [-2, -1], [1, 4], [0, 5], [-4, -2], [3, -1], [-2, 3]];
const near = (target, i) => {
  const [dr, dc] = NEAR[i % NEAR.length];
  const r = Math.max(0, Math.min(ROWS - 1, rowOf(target) + dr));
  const c = Math.max(0, Math.min(COLS - 1, colOf(target) + dc));
  return cellAt(r, c);
};

const people = [];
for (const [i, person] of PEOPLE.entries()) {
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  person.ws = ws;
  person.send = msg => ws.send(JSON.stringify(msg));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'welcome') person.token = msg.token;
    if (msg.type === 'state') person.state = msg;
    if (msg.type === 'error') console.log(`${person.name}: ${msg.message}`);
  });
  person.send({ type: 'hello', role: 'phone', code });
  await wait(120);
  person.send({ type: 'join', name: person.name, color: person.color });
  await wait(120);
  // Na sala, o 2º fica "se preparando" (para a foto mostrar os dois jeitos).
  if (stage !== 'sala' || i !== 1) person.send({ type: 'ready', ready: true });
  people.push(person);
}
await wait(300);

const game = () => people[0].state.game;
const byId = id => people.find(p => p.state.you?.id === id);
// Quem dá a dica: a cor da carta mais longe das beiradas (a foto mostra o quadro inteiro).
function giveCue(giver, text) {
  const card = giver.state.you.card;
  const edge = c => Math.min(rowOf(c), ROWS - 1 - rowOf(c), colOf(c), COLS - 1 - colOf(c));
  const target = card.reduce((best, c) => (edge(c) > edge(best) ? c : best));
  giver.send({ type: 'cue1', target, text });
  return target;
}
// Põe os cones da volta (todos, ou deixa `leave` pessoas faltando).
async function placeRound(target, offset, leave = 0) {
  let i = 0;
  while (game().turnId && game().order.length - game().order.indexOf(game().turnId) > leave) {
    const taken = new Set(game().pieces.map(p => p.cell));
    let cell = near(target, offset + i);
    while (taken.has(cell)) cell = near(target, offset + ++i);
    byId(game().turnId).send({ type: 'cone', cell });
    i += 1;
    await wait(160);
  }
}

if (stage !== 'sala') {
  people[0].send({ type: 'start' }); // o 1º é o líder
  await wait(400);
  if (stage === 'fim') {
    // Partida inteira, depressa.
    for (let guard = 0; game().stage !== 'fim' && guard < 400; guard++) {
      const g = game();
      const giver = byId(g.cueGiverId);
      if (g.stage === 'dica1') giveCue(giver, 'oceano');
      else if (g.stage === 'dica2') giver.send({ type: 'cue2', text: 'mar profundo' });
      else if (g.stage === 'revelacao') byId(g.nextCueGiverId).send({ type: 'nextRound' });
      else {
        const target = giver.state.you.target ?? 0;
        const taken = new Set(g.pieces.map(p => p.cell));
        let k = guard;
        let cell = near(target, k);
        while (taken.has(cell)) cell = near(target, ++k);
        byId(g.turnId).send({ type: 'cone', cell });
      }
      await wait(90);
    }
  } else if (stage !== 'dica') {
    const giver = people[0];
    const target = giveCue(giver, 'oceano');
    await wait(300);
    if (stage === 'cones') {
      await placeRound(target, 0, Math.min(2, howMany - 2));
    } else {
      await placeRound(target, 0);
      await wait(200);
      if (stage !== 'dica2') {
        giver.send({ type: 'cue2', text: 'mar profundo' });
        await wait(300);
        await placeRound(target, 7, stage === 'cones2' ? Math.min(2, howMany - 2) : 0);
      }
    }
  }
}
await wait(400);

const g = people[0].state.game;
for (const person of people) {
  const id = person.state.you?.id;
  const words = [g?.cueGiverId === id && g?.stage !== 'fim' ? 'dica' : '', g?.turnId === id ? 'vez' : ''].filter(Boolean).join(' ');
  console.log(`${person.name.padEnd(6)} ${words.padEnd(5)} tom-sobre-tom-token-${code} = ${person.token}`);
}
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
