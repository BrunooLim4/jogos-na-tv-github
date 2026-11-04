// Baixa as fontes do jogo (Google Fonts, licença livre) para public/fonts/, só a
// parte "latin" (tem os acentos do português). Roda uma vez; o jogo usa os arquivos
// locais e funciona sem internet.
// Uso: node tools/baixar-fontes.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
// [família no Google Fonts, pesos, nome do arquivo]
const FONTS = [
  ['Gelasio', [400, 700], 'gelasio'], // a letra das cartas (desenhada para casar com a Georgia)
  ['Alegreya Sans', [500, 700, 800], 'alegreya-sans'], // texto: legível do sofá
  ['Grenze Gotisch', [700], 'grenze-gotisch'], // o logo: gótica de vila antiga
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

mkdirSync(OUT, { recursive: true });
for (const [family, weights, file] of FONTS) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weights.join(';')}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  // cada bloco: /* latin */ @font-face { ... font-weight: N; src: url(...) }
  for (const block of css.split('/* ').filter(b => b.startsWith('latin */'))) {
    const weight = block.match(/font-weight:\s*(\d+)/)[1];
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
    const data = Buffer.from(await (await fetch(src)).arrayBuffer());
    const name = `${file}-${weight}.woff2`;
    writeFileSync(path.join(OUT, name), data);
    console.log(`${name}  ${(data.length / 1024).toFixed(0)} KB`);
  }
}
