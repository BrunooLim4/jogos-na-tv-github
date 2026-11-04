// Confere os sons sem caixa de som: abre /sons?conferir=1 num Chrome sem janela,
// que grava cada som e mede o volume (pico), a força média (rms) e a duração.
// Falha se algum som estiver mudo, estourando (pico perto de 1) ou com erro.
// Uso (servidor de teste ligado): node tools/conferir-sons.mjs http://localhost:3031
//
// (Conversa com o Chrome pelo protocolo de depuração e espera o resultado de
// verdade: o "--virtual-time-budget" do Chrome sem janela trava a gravação de áudio.)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3031';
const PORT = 9337;
const profile = mkdtempSync(path.join(tmpdir(), 'sons-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await pause(200);
    page = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()).then(l => l.find(t => t.type === 'page')).catch(() => null);
  }
  if (!page) throw new Error('o Chrome não respondeu');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });
  const call = (method, params = {}) => new Promise(resolve => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await call('Page.navigate', { url: `${base}/sons?conferir=1` });
  for (let i = 0; i < 100; i++) {
    await pause(200);
    const { result } = await call('Runtime.evaluate', {
      expression: "document.getElementById('resultado')?.dataset.pronto ? document.getElementById('resultado').textContent : ''",
    });
    if (result?.value) return JSON.parse(result.value);
  }
  throw new Error('a página /sons não terminou a gravação');
}

let report;
try {
  report = await run();
} catch (error) {
  console.log(`Não consegui conferir os sons: ${error.message}`);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await pause(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}

if (report) {
  let failures = 0;
  for (const [name, r] of Object.entries(report)) {
    const problems = [];
    if (r.erro) problems.push('erro no áudio');
    if (r.pico < 0.03) problems.push('quase mudo');
    if (r.pico > 0.95) problems.push('estourando');
    if (r.duracao < 0.05) problems.push('curto demais');
    if (problems.length) failures++;
    console.log(`${problems.length ? 'FALHOU' : 'OK    '}  ${name.padEnd(10)} pico ${r.pico.toFixed(2)}  rms ${r.rms.toFixed(3)}  ${r.duracao.toFixed(2)} s${problems.length ? '  ← ' + problems.join(', ') : ''}`);
  }
  console.log(failures ? `\n${failures} som(ns) com problema.` : '\nTodos os sons tocam, sem estourar.');
  process.exitCode = failures ? 1 : 0;
}
