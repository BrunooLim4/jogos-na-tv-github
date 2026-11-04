// Cenário vivo atrás da TV (padrão Resistência, aprovado no esboço de out/2026):
// estação a vapor ao entardecer — engrenagens de latão girando, vapor subindo,
// lampiões piscando e o dirigível do Jeremiah passando (o resto vem do style.css).

const SVG = 'http://www.w3.org/2000/svg';

function gearPath(radius, teeth, depth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [da, r] of [[0, radius], [0.12, radius + depth], [0.38, radius + depth], [0.5, radius]]) {
      pts.push([Math.cos(a + da * step) * r, Math.sin(a + da * step) * r]);
    }
  }
  const hole = radius * 0.35;
  return `M${pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L')}Z M${hole} 0A${hole} ${hole} 0 1 0 ${-hole} 0A${hole} ${hole} 0 1 0 ${hole} 0Z`;
}

// Posições em % da tela (cabem em qualquer tamanho de TV).
const GEARS = [
  { x: 86, y: -8, r: 150, teeth: 18, rev: false },
  { x: 96, y: 14, r: 80, teeth: 10, rev: true },
  { x: -3, y: 72, r: 170, teeth: 20, rev: true },
  { x: 78, y: 92, r: 110, teeth: 14, rev: false },
];

export function drawBackdrop(gearsEl, steamEl) {
  gearsEl.replaceChildren(...GEARS.map(g => {
    const size = (g.r + 30) * 2;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
    svg.setAttribute('class', `bd-gear${g.rev ? ' rev' : ''}`);
    svg.style.cssText = `left:calc(${g.x}% - ${size / 2}px);top:calc(${g.y}% - ${size / 2}px);width:${size}px;height:${size}px;animation-duration:${(g.r / 2.2).toFixed(0)}s`;
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', gearPath(g.r, g.teeth, 22));
    path.setAttribute('fill-rule', 'evenodd');
    svg.append(path);
    return svg;
  }));
  steamEl.replaceChildren(...Array.from({ length: 12 }, (_, i) => {
    const puff = document.createElement('div');
    puff.className = 'bd-puff';
    puff.style.left = `${4 + i * 8.3}%`;
    puff.style.animationDelay = `${-((i * 1.9) % 14)}s`;
    puff.style.animationDuration = `${11 + (i % 4) * 2}s`;
    puff.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (40 + i * 6)}px`);
    return puff;
  }));
}
