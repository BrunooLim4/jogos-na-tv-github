// Pedacinhos de interface usados pela TV e pelo celular.
import { CARD_LABELS } from './cards.js';
import { characterLabel, portraitUrl, trainUrl } from './characters.js';

// Uma carta de vagão. tag = 'div' (só mostrar) ou 'button' (tocar para pegar).
// A arte, a moldura e a faixa com o nome vêm do style.css (a faixa some
// sozinha quando a carta é pequena demais).
export function makeCard(card, { tag = 'div', label = true } = {}) {
  const node = document.createElement(tag);
  node.className = 'card';
  if (tag === 'button') node.type = 'button';
  if (!card) {
    node.classList.add('empty');
    return node;
  }
  node.dataset.card = card;
  node.setAttribute('aria-label', CARD_LABELS[card]);
  if (label) {
    const text = document.createElement('span');
    text.className = 'card-label';
    text.textContent = CARD_LABELS[card];
    node.append(text);
  }
  return node;
}

// O verso da pilha de compra, com quantas cartas restam.
export function makeDeck(count, { tag = 'div' } = {}) {
  const node = document.createElement(tag);
  node.className = 'card back';
  if (tag === 'button') node.type = 'button';
  node.setAttribute('aria-label', `Pilha: ${count} cartas`);
  const number = document.createElement('span');
  number.className = 'deck-count';
  number.textContent = count;
  const text = document.createElement('span');
  text.className = 'card-label';
  text.textContent = 'Pilha';
  node.append(number, text);
  return node;
}

export function makeWagon(color) {
  const wagon = document.createElement('span');
  wagon.className = 'wagon';
  if (color) wagon.dataset.color = color;
  return wagon;
}

// Retrato do personagem daquela cor (na escotilha de latão).
export function makePortrait(color) {
  const img = document.createElement('img');
  img.className = 'portrait';
  img.src = portraitUrl(color);
  img.alt = characterLabel(color);
  return img;
}

// Para listas que são refeitas a cada jogada: devolve sempre a MESMA imagem
// de cada cor (só muda de lugar), assim ela não recarrega nem pisca.
// Ex.: const seatPortrait = sameImage(makePortrait); seatPortrait('azul')
export function sameImage(make) {
  const cache = new Map();
  return color => {
    if (!cache.has(color)) cache.set(color, make(color));
    return cache.get(color);
  };
}

// O trem do personagem (só enfeite).
export function makeTrain(color) {
  const img = document.createElement('img');
  img.className = 'train-art';
  img.src = trainUrl(color);
  img.alt = '';
  return img;
}

// Contagem final na TV (padrão Resistência): os bilhetes de todos viram um por
// um, depois a medalha do maior caminho voa e o vencedor ganha a coroa. O celular
// usa o mesmo tempo para segurar o resultado ("Olhem a TV!").
export const FINAL_REVEAL = { intro: 900, longest: 2100 };
export const ticketStepMs = total => (total > 12 ? 520 : 800);
export function finalRevealMs(results) {
  const total = results.reduce((n, r) => n + r.tickets.length, 0);
  return FINAL_REVEAL.intro + total * ticketStepMs(total) + FINAL_REVEAL.longest + 400;
}
