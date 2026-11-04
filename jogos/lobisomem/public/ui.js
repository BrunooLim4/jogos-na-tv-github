// Pedacinhos de interface usados pela TV e pelo celular.

// A ficha de cor do jogador (como uma moeda/selo de cera): a cor e a inicial.
export function makeAvatar(color, name = '') {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.dataset.color = color;
  node.textContent = (name.trim()[0] ?? '?').toUpperCase();
  return node;
}

// Carta que vira: o verso (igual para todas) e a frente (a arte do Bruno).
// `card` = 'vidente', 'lobisomem-2'... (null = só o verso).
export function makeCard(card = null, className = '') {
  const node = document.createElement('div');
  node.className = `card3d ${className}`.trim();
  const inner = document.createElement('div');
  inner.className = 'card3d-inner';
  const back = document.createElement('img');
  back.className = 'card3d-back';
  back.src = '/cartas/verso.webp';
  back.alt = '';
  back.draggable = false;
  const front = document.createElement('img');
  front.className = 'card3d-front';
  front.alt = '';
  front.draggable = false;
  inner.append(back, front);
  node.append(inner);
  setCardFace(node, card);
  return node;
}

// Troca a frente da carta (sem virar).
export function setCardFace(node, card) {
  const front = node.querySelector('.card3d-front');
  if (card) {
    if (node.dataset.card !== card) front.src = `/cartas/${card}.webp`;
    node.dataset.card = card;
  } else {
    delete node.dataset.card;
    front.removeAttribute('src');
  }
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
