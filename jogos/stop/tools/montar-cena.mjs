// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala e
// param na fase pedida. Imprime uma linha por pessoa com o token (com ele no
// localStorage, chave stop-token-<SALA>, o celular abre como ela):
//   "Bruno  stop  stop-token-ABCD = <token>"   (stop = foi quem deu STOP)
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs <sala|escrevendo|correcao|placar|fim> [quantos]
//   JOGO_URL=http://localhost:3091 (padrão). Para "fim" rápido: servidor com RODADAS=2.
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
import { WORDS } from './palavras-robos.mjs';

const base = process.env.JOGO_URL ?? 'http://localhost:3091';
const stage = process.argv[2] ?? 'sala';
const howMany = Math.min(Number(process.argv[3] ?? 5), 10);
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
  { name: 'Iara', color: 'rosa' },
  { name: 'Juca', color: 'turquesa' },
  { name: 'Lia', color: 'branco' },
  { name: 'Theo', color: 'marrom' },
].slice(0, howMany);

const people = [];
for (const [i, person] of PEOPLE.entries()) {
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  const entry = { ...person, ws, token: null, state: null };
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'welcome') entry.token = msg.token;
    if (msg.type === 'state') entry.state = msg;
    if (msg.type === 'error') console.log(`${person.name}: ${msg.message}`);
  });
  ws.send(JSON.stringify({ type: 'hello', role: 'phone', code }));
  await wait(150);
  ws.send(JSON.stringify({ type: 'join', name: person.name, color: person.color }));
  await wait(150);
  // Na sala, o 2º fica "se preparando" (para a foto mostrar os dois jeitos).
  if (stage !== 'sala' || i !== 1) ws.send(JSON.stringify({ type: 'ready', ready: true }));
  people.push(entry);
}
const send = (entry, msg) => entry.ws.send(JSON.stringify(msg));
const game = () => people[0].state.game;

// Respostas de cada um: palavras da lista com a letra; o 2º repete a do 1º na 1ª
// categoria (vale 5), o 3º deixa uma em branco e o 4º escreve uma com a letra errada.
function answersFor(i, partial = false) {
  const { letter, categories } = game();
  const words = WORDS[letter];
  const answers = {};
  categories.forEach((category, j) => {
    if (partial && j > i + 1) return;
    answers[category] = words[(i * 3 + j) % words.length];
  });
  if (i === 1) answers[categories[0]] = words[0];
  if (i === 2) answers[categories[1]] = '';
  if (i === 3) answers[categories[2]] = letter === 'B' ? 'Abacate' : 'Banana';
  return answers;
}

async function playRound(last) {
  await wait(Math.max(0, game().writingStartsAt - game().now) + 300); // a roleta
  if (stage === 'escrevendo' && last) {
    people.forEach((p, i) => send(p, { type: 'answers', round: game().round, answers: answersFor(i, true) }));
    return;
  }
  people.forEach((p, i) => i > 0 && send(p, { type: 'answers', round: game().round, answers: answersFor(i) }));
  await wait(200);
  send(people[0], { type: 'stop', round: game().round, answers: answersFor(0) });
  await wait(3000 + 900);
  if (stage === 'correcao' && last) {
    // um voto contra a palavra do 3º (e o 1º já tocou em "Tudo certo")
    const target = game().review.answers.find(a => a.playerId === people[2].state.you.id);
    if (target?.key) send(people[1], { type: 'reject', round: game().round, index: 0, key: target.key, on: true });
    send(people[0], { type: 'reviewed', round: game().round });
    return;
  }
  for (let k = 0; k < game().categories.length; k++) {
    for (const p of people) send(p, { type: 'reviewed', round: game().round });
    await wait(250);
  }
}

await wait(300);
if (stage !== 'sala') {
  send(people[0], { type: 'start' }); // o 1º é o líder
  await wait(500);
  for (;;) {
    const last = stage !== 'fim' || game().round >= game().totalRounds;
    await playRound(last);
    await wait(300);
    if (last || stage !== 'fim') break;
    send(people[0], { type: 'nextRound', round: game().round });
    await wait(400);
  }
  await wait(400);
}

for (const entry of people) {
  const words = entry.state?.game?.stopperId === entry.state?.you?.id ? ['stop'] : [];
  console.log(`${entry.name.padEnd(6)} ${words.join(' ').padEnd(6)} stop-token-${code} = ${entry.token}`);
}
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
