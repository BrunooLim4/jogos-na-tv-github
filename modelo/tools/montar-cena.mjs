// Monta uma cena para tirar fotos das telas: jogadores de mentira entram na sala
// e param na fase pedida. Imprime o token de cada um — com ele no localStorage
// (chave modelo-token-<SALA>), o celular abre direto como aquele jogador.
// Uso (servidor de teste ligado e sala vazia):
//   node tools/montar-cena.mjs [sala|partida] [quantos]
//   JOGO_URL=http://localhost:3021 (padrão)
// Fica ligado (senão os jogadores aparecem "reconectando"); Ctrl+C para tirar.
// TROCAR: no jogo novo, acrescentar fases (ex.: "votacao") jogando até lá.
const base = process.env.JOGO_URL ?? 'http://localhost:3021';
const stage = process.argv[2] ?? 'sala';
const howMany = Math.min(Number(process.argv[3] ?? 3), 6);
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
].slice(0, howMany);

const sockets = [];
for (const [i, person] of PEOPLE.entries()) {
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'welcome') console.log(`${person.name.padEnd(6)} modelo-token-${code} = ${msg.token}`); // TROCAR "modelo"
    if (msg.type === 'error') console.log(`${person.name}: ${msg.message}`);
  });
  ws.send(JSON.stringify({ type: 'hello', role: 'phone', code }));
  await wait(150);
  ws.send(JSON.stringify({ type: 'join', name: person.name, color: person.color }));
  await wait(150);
  // Na sala, o 2º fica "se preparando" (para a foto mostrar os dois jeitos).
  if (stage !== 'sala' || i !== 1) ws.send(JSON.stringify({ type: 'ready', ready: true }));
  sockets.push(ws);
}

await wait(300);
if (stage !== 'sala') sockets[0].send(JSON.stringify({ type: 'start' })); // o 1º é o líder
console.log(`\nCena "${stage}" pronta na sala ${code}. TV: ${base}/tv  Celular: ${base}/c/${code}`);
