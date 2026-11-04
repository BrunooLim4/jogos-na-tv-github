// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala e
// param na fase pedida. Imprime uma linha por pessoa com o personagem dela e o token
// (com ele no localStorage, chave lobisomem-token-<SALA>, o celular abre como ela):
//   "Bruno  vidente  lobisomem-token-ABCD = <token>"
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs <sala|noite|noite-meio|dia|votacao|fim> [quantos]
//   JOGO_URL=http://localhost:3081 (padrão)
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
import { actOf, roleOf } from '../public/papeis.js';

const base = process.env.JOGO_URL ?? 'http://localhost:3081';
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

// Uma escolha válida qualquer para a noite (a 1ª opção do personagem).
function nightPick(role, me, ids) {
  const option = actOf(role).options[0];
  const others = ids.filter(id => id !== me);
  return { players: others.slice(0, option.players), center: [0, 1, 2].slice(0, option.center) };
}

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

await wait(300);
if (stage !== 'sala') {
  send(people[0], { type: 'start' }); // o 1º é o líder
  await wait(600);
  const ids = people[0].state.game.players.map(p => p.id);
  const acting = stage === 'noite' ? [] : stage === 'noite-meio' ? people.slice(0, Math.ceil(people.length / 2)) : people;
  for (const entry of acting) {
    const you = entry.state.you;
    send(entry, { type: 'night', pick: nightPick(roleOf(you.card), you.id, ids) });
    await wait(120);
    if (entry.state.you.step === 'sosia-2') {
      send(entry, { type: 'night', pick: nightPick(entry.state.you.copied, you.id, ids) });
      await wait(120);
    }
  }
  if (stage === 'votacao' || stage === 'fim') {
    await wait(300);
    send(people[0], { type: 'voteNow' });
    await wait(300);
    // todos votam no 2º (Ana), e ela vota no 1º; na "votacao" só metade votou
    const voters = stage === 'fim' ? people : people.slice(0, Math.floor(people.length / 2));
    for (const entry of voters) {
      const target = entry === people[1] ? people[0] : people[1];
      send(entry, { type: 'vote', target: target.state.you.id });
      await wait(120);
    }
  }
  await wait(500);
}

for (const entry of people) {
  const you = entry.state?.you;
  const words = you?.card ? [roleOf(you.card)] : [];
  if (you?.step === 'feito' && stage.startsWith('noite')) words.push('fez');
  console.log(`${entry.name.padEnd(6)} ${words.join(' ').padEnd(14)} lobisomem-token-${code} = ${entry.token}`);
}
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
