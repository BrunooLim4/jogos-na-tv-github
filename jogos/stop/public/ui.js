// Pedacinhos de interface usados pela TV e pelo celular.

// Bolinha do jogador: a cor dele e a inicial do nome (no Stop não há personagem:
// cada um entra com uma cor, como um participante do programa).
export function makeAvatar(color, name = '') {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.dataset.color = color;
  node.textContent = (name.trim()[0] ?? '?').toUpperCase();
  return node;
}

// Para listas que são refeitas a cada jogada: devolve sempre o MESMO elemento
// de cada chave, assim imagem não recarrega nem pisca (lição do Trilhos a Vapor).
// Ex.: const seatAvatar = sameImage(key => makeAvatar(...)); seatAvatar('azul:Ana')
export function sameImage(make) {
  const cache = new Map();
  return key => {
    if (!cache.has(key)) cache.set(key, make(key));
    return cache.get(key);
  };
}

// Lâmpadas de letreiro em volta de uma caixa (a letra, a roleta, o letreiro da sala):
// `count` lâmpadas num retângulo de cantos redondos, `offset` px para fora da borda
// (negativo = para dentro). As medidas são as da caixa no palco de 1920 × 1080; viram %
// e acompanham a escala. Piscam correndo em volta (CSS .bulbs); com `count` múltiplo
// de 3 a corrida não emenda torta.
export function addBulbs(node, { width, height, radius, offset = 0, count }) {
  const w = width + offset * 2;
  const h = height + offset * 2;
  const r = radius + offset;
  const arc = (Math.PI * r) / 2;
  const corner = (cx, cy, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  // o contorno, no sentido do relógio a partir do canto de cima à esquerda
  const parts = [
    [w - 2 * r, d => [r + d, 0]],
    [arc, d => corner(w - r, r, -90 + (d / arc) * 90)],
    [h - 2 * r, d => [w, r + d]],
    [arc, d => corner(w - r, h - r, (d / arc) * 90)],
    [w - 2 * r, d => [w - r - d, h]],
    [arc, d => corner(r, h - r, 90 + (d / arc) * 90)],
    [h - 2 * r, d => [0, h - r - d]],
    [arc, d => corner(r, r, 180 + (d / arc) * 90)],
  ];
  const total = parts.reduce((sum, [length]) => sum + length, 0);
  const ring = document.createElement('span');
  ring.className = 'bulbs';
  ring.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < count; k++) {
    let d = (k / count) * total;
    let i = 0;
    while (i < parts.length - 1 && d >= parts[i][0]) d -= parts[i++][0];
    const [x, y] = parts[i][1](Math.min(d, parts[i][0]));
    const bulb = document.createElement('i');
    bulb.style.left = `${((x - offset) / width) * 100}%`;
    bulb.style.top = `${((y - offset) / height) * 100}%`;
    bulb.style.setProperty('--k', k % 3);
    ring.append(bulb);
  }
  node.append(ring);
  return ring;
}
