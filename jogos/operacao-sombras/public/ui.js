// Pedacinhos de interface usados pela TV e pelo celular.
import { CHARACTERS } from './characters.js';

// Retrato do agente (foto 3×4 com o aro na cor do jogador). Sem cor = vaga.
export function makeAvatar(color, name = '') {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.dataset.color = color;
  const character = CHARACTERS[color];
  if (character) {
    const img = document.createElement('img');
    img.src = character.img;
    img.alt = '';
    img.draggable = false;
    node.append(img);
    node.title = name ? `${name} · ${character.title}` : character.title;
  } else {
    node.classList.add('empty');
    node.textContent = '?';
  }
  return node;
}

// Faixa preta com o nome (como nas cartas dos agentes).
export function makeNameBar(text, className = '') {
  const node = document.createElement('span');
  node.className = `name-bar ${className}`.trim();
  node.textContent = text;
  return node;
}

// Para listas que são refeitas a cada jogada: devolve sempre o MESMO elemento
// de cada chave, assim imagem não recarrega nem pisca (lição do Trilhos a Vapor).
// Ex.: const seatAvatar = sameImage(key => makeAvatar(...)); seatAvatar('verde:Ana')
export function sameImage(make) {
  const cache = new Map();
  return key => {
    if (!cache.has(key)) cache.set(key, make(key));
    return cache.get(key);
  };
}
