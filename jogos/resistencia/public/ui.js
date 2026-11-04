// Pedacinhos de interface usados pela TV e pelo celular.

// Bolinha do jogador no estilo padrão: a cor dele e a inicial do nome.
// (Na personalidade do jogo, troca por retrato do personagem.)
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

// "Ana", "Ana e Caio", "Ana, Caio e Duda"
export function joinNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
