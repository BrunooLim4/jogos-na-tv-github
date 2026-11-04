// Acompanha a partida como se fosse a TV e resume o que aconteceu.
// Uso (servidor de teste ligado): node tools/acompanhar-partida.mjs http://localhost:3001 [segundos-max] [parar-com-N-rotas]
const base = process.argv[2] ?? 'http://localhost:3001';
const maxSeconds = Number(process.argv[3] ?? 300);
const stopAtRoutes = Number(process.argv[4] ?? Infinity);
const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
let lastStage = null;
let lastRound = false;
const started = Date.now();

ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'tv' })));
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.type !== 'state' || !msg.game) return;
  const { game, lobby } = msg;
  const names = Object.fromEntries(lobby.players.map(p => [p.id, p.name]));
  if (game.stage !== lastStage) {
    lastStage = game.stage;
    console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] etapa: ${game.stage}`);
  }
  if (game.lastRound && !lastRound) {
    lastRound = true;
    console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] última rodada disparada por ${names[game.lastRound.by]}`);
  }
  const claimed = Object.keys(game.claimed).length;
  if (claimed >= stopAtRoutes) {
    console.log(`rotas conquistadas: ${claimed} (parando aqui)`);
    process.exit(0);
  }
  if (game.stage === 'finished') {
    console.log(`rotas conquistadas: ${claimed}`);
    for (const r of game.results) {
      console.log(`  ${names[r.id]}: ${r.total} pts (rotas ${r.routePoints}, bilhetes ${r.ticketPoints} [${r.ticketsDone}/${r.tickets.length}], maior caminho ${r.longest}${r.longestBonus ? ' +10' : ''})${r.winner ? '  VENCEU' : ''}`);
    }
    console.log('trens restantes:', game.players.map(p => `${names[p.id]} ${p.trains}`).join(', '));
    process.exit(0);
  }
});
setTimeout(() => { console.log('tempo esgotado; etapa', lastStage); process.exit(1); }, maxSeconds * 1000);
