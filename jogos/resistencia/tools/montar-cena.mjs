// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala,
// jogam até a fase pedida e param. Imprime o papel e o token de cada um — com o
// token no localStorage (chave resistencia-token-<SALA>), o celular abre direto
// como aquele jogador.
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs [sala|papel|escolha|votacao|missao|fim] [quantos]
//   JOGO_URL=http://localhost:3041 (padrão)
// Fases: papel = 2 já viram; escolha = 1º time recusado e o novo comandante
// escolhendo; votacao = 3 já votaram; missao = Missão 1 deu certo, Missão 2 com
// 1 escolha; fim = partida inteira (a Resistência vence por 3 a 2).
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
const base = process.env.JOGO_URL ?? 'http://localhost:3041';
const stage = process.argv[2] ?? 'sala';
const howMany = Math.max(5, Math.min(Number(process.argv[3] ?? 5), 10));
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
  { name: 'Hugo', color: 'rosa' },
  { name: 'Iara', color: 'ciano' },
  { name: 'Juca', color: 'marrom' },
  { name: 'Lia', color: 'cinza' },
].slice(0, howMany);

for (const [i, person] of PEOPLE.entries()) {
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'welcome') person.token = msg.token;
    if (msg.type === 'state') person.state = msg;
    if (msg.type === 'error') console.log(`${person.name}: ${msg.message}`);
  });
  person.send = message => ws.send(JSON.stringify(message));
  person.send({ type: 'hello', role: 'phone', code });
  await wait(150);
  person.send({ type: 'join', name: person.name, color: person.color });
  await wait(150);
  // Na sala, o 2º fica "se preparando" (para a foto mostrar os dois jeitos).
  if (stage !== 'sala' || i !== 1) person.send({ type: 'ready', ready: true });
}

const game = () => PEOPLE[0].state?.game;
async function until(pred) {
  for (let i = 0; i < 100; i++) {
    if (game() && pred(game())) return;
    await wait(50);
  }
  throw new Error(`a cena "${stage}" travou`);
}
async function act(person, message) {
  person.send(message);
  await wait(120);
}
const byId = id => PEOPLE.find(p => p.state.you.id === id);
const idOf = person => person.state.you.id;

if (stage !== 'sala') {
  await wait(300);
  PEOPLE[0].send({ type: 'start' }); // o 1º é o líder
  await until(g => g.stage === 'roles');
  const spies = PEOPLE.filter(p => p.state.you.role === 'espiao');
  const resist = PEOPLE.filter(p => p.state.you.role === 'resistencia');
  const size = () => game().missions[game().mission].size;
  const clean = () => resist.slice(0, size());
  const dirty = () => [spies[0], ...resist].slice(0, size());

  async function propose(team, { full = true } = {}) {
    const boss = byId(game().commanderId);
    for (const p of team.slice(0, full ? team.length : 1)) await act(boss, { type: 'pick', id: idOf(p) });
    if (!full) return;
    await act(boss, { type: 'propose' });
    await until(g => g.stage === 'vote');
  }
  async function voteAll(yes = PEOPLE.length) {
    for (const [i, p] of PEOPLE.entries()) await act(p, { type: 'vote', approve: i < yes });
  }
  async function mission(team, sabotage) {
    const current = game().mission;
    await propose(team);
    await voteAll(PEOPLE.length - 1);
    for (const p of team) await act(p, { type: 'mission', choice: sabotage && p === spies[0] ? 'sabotar' : 'sucesso' });
    await until(g => g.mission !== current || g.stage === 'over');
  }

  if (stage === 'papel') {
    for (const p of PEOPLE.slice(0, 2)) await act(p, { type: 'seeRole' });
  } else {
    for (const p of PEOPLE) await act(p, { type: 'seeRole' });
    await until(g => g.stage === 'pick');
    if (stage === 'escolha') {
      await propose(PEOPLE.slice(0, size()));
      await voteAll(2); // 2 aprovam, o resto recusa
      await until(g => g.stage === 'pick' && g.rejections === 1);
      await propose(clean(), { full: false });
    } else if (stage === 'votacao') {
      await propose(clean());
      for (const p of PEOPLE.slice(0, 3)) await act(p, { type: 'vote', approve: p !== PEOPLE[2] });
    } else if (stage === 'missao') {
      await mission(clean(), false);
      const team = dirty();
      await propose(team);
      await voteAll(PEOPLE.length - 1);
      await act(team.find(p => p.state.you.role === 'resistencia'), { type: 'mission', choice: 'sucesso' });
    } else if (stage === 'fim') {
      for (const [i, sabotage] of [false, true, false, true, false].entries()) {
        if (game().stage === 'over') break;
        await mission(sabotage ? dirty() : clean(), sabotage);
        void i;
      }
    }
  }
}

await wait(300);
console.log('');
// Papel e o que a pessoa está fazendo (comanda, está no time, já escolheu).
const g = game();
for (const p of PEOPLE) {
  const you = p.state?.you ?? {};
  const flags = [g?.commanderId === you.id && 'comanda', g?.team.includes(you.id) && 'time', you.choice && 'escolheu']
    .filter(Boolean).join(',');
  console.log(`${p.name.padEnd(6)} ${(you.role ?? '').padEnd(12)} ${flags.padEnd(20)} resistencia-token-${code} = ${p.token}`);
}
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
