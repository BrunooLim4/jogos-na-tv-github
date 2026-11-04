// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala
// e param na fase pedida. Imprime o token de cada um — com ele no localStorage
// (chave codinomes-token-<SALA>), o celular abre direto como aquele jogador.
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs [sala|dica|palpite|fim|assassino] [quantos]
//     sala    → os dois times se formando (um ainda se preparando)
//     dica    → partida começou: o chefe da vez vai dar a dica
//     palpite → dica dada, uma palavra certa revelada, duas apontadas
//     fim     → o time da vez achou todas as palavras e venceu
//     assassino → uma palavra certa e depois o assassino (o outro time vence)
//   JOGO_URL=http://localhost:3031 (padrão)
// Bruno é o chefe do Vermelho e Ana a chefe do Azul (pediram na sala).
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
const base = process.env.JOGO_URL ?? 'http://localhost:3031';
const stage = process.argv[2] ?? 'sala';
const howMany = Math.min(Number(process.argv[3] ?? 6), 8);
const { code } = await (await fetch(`${base}/api/info`)).json();
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Entram alternando: Vermelho, Azul, Vermelho, Azul...
const PEOPLE = [
  { name: 'Bruno', color: 'verde', chief: true },
  { name: 'Ana', color: 'amarelo', chief: true },
  { name: 'Caio', color: 'laranja' },
  { name: 'Duda', color: 'roxo' },
  { name: 'Leo', color: 'rosa' },
  { name: 'Gabi', color: 'ciano' },
  { name: 'Rui', color: 'marrom' },
  { name: 'Bia', color: 'cinza' },
].slice(0, howMany);

const people = [];
for (const [i, person] of PEOPLE.entries()) {
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  const entry = { ...person, ws, last: null };
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') entry.last = msg;
    if (msg.type === 'welcome') entry.token = msg.token;
    if (msg.type === 'error') console.log(`${person.name}: ${msg.message}`);
  });
  const send = message => ws.send(JSON.stringify(message));
  entry.send = send;
  send({ type: 'hello', role: 'phone', code });
  await wait(150);
  send({ type: 'join', name: person.name, color: person.color });
  await wait(150);
  if (person.chief) send({ type: 'wantChief', on: true });
  // Na sala, o 4º fica "se preparando" (para a foto mostrar os dois jeitos).
  if (stage !== 'sala' || i !== 3) send({ type: 'ready', ready: true });
  people.push(entry);
}

await wait(300);
const leader = people[0];
if (stage !== 'sala') {
  leader.send({ type: 'start' }); // o 1º é o líder
  await wait(400);
}
const game = () => leader.last.game;
const you = p => p.last.you;
const turnTeam = () => game().turn;
const chief = () => people.find(p => you(p).team === turnTeam() && you(p).chief);
const guessers = () => people.filter(p => you(p).team === turnTeam() && !you(p).chief);

if (stage === 'palpite' || stage === 'fim' || stage === 'assassino') {
  chief().send({ type: 'clue', word: stage === 'fim' ? 'TUDO' : 'VIAGEM', number: stage === 'fim' ? 9 : 2 });
  await wait(300);
  const key = you(chief()).key;
  const mine = key.map((c, i) => (c === turnTeam() ? i : null)).filter(i => i !== null);
  if (stage === 'palpite') {
    guessers()[0].send({ type: 'reveal', index: mine[0] });
    await wait(300);
    guessers()[0].send({ type: 'point', index: mine[1] });
    const neutral = key.findIndex(c => c === 'neutro');
    if (guessers()[1]) guessers()[1].send({ type: 'point', index: neutral });
  } else if (stage === 'assassino') {
    guessers()[0].send({ type: 'reveal', index: mine[0] });
    await wait(300);
    guessers()[0].send({ type: 'reveal', index: key.indexOf('assassino') });
  } else {
    for (const index of mine) {
      guessers()[0].send({ type: 'reveal', index });
      await wait(120);
    }
  }
  await wait(300);
}

console.log('');
for (const p of people) {
  const y = you(p);
  const role = y.chief ? `chefe do ${y.team}` : `time ${y.team}`;
  console.log(`${p.name.padEnd(6)} ${role.padEnd(18)} codinomes-token-${code} = ${p.token}`);
}
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
