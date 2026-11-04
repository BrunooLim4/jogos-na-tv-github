// Os agentes do Operação Sombras, um por cor de jogador. Artes do Bruno
// (artes/identidade-codinomes/personagens-cartas.jpg), recortadas por
// tools/recortar-personagens.py. O Assassino da mesma folha é a carta do assassino.
// Sem vermelho e azul: essas são as cores dos times.

export const CHARACTERS = {
  rosa: { title: 'A Mestra', img: '/img/agente-rosa.webp' },
  verde: { title: 'O Decifrador', img: '/img/agente-verde.webp' },
  laranja: { title: 'A Arrombadora', img: '/img/agente-laranja.webp' },
  roxo: { title: 'O Fantasma', img: '/img/agente-roxo.webp' },
  ciano: { title: 'O Analista', img: '/img/agente-ciano.webp' },
  marrom: { title: 'O Informante', img: '/img/agente-marrom.webp' },
  cinza: { title: 'A Sombra', img: '/img/agente-cinza.webp' },
  amarelo: { title: 'O Agente Duplo', img: '/img/agente-amarelo.webp' },
};

export function characterLabel(color) {
  return CHARACTERS[color]?.title ?? '';
}
