// Fichas de cor: para entrar na sala, cada um pega uma ficha (como no Resistência,
// pedido do Bruno). O personagem de verdade é a carta sorteada a cada partida.

// `hex` = a mesma cor do style.css (para as setas dos votos na TV).
export const CHARACTERS = {
  azul: { title: 'Ficha azul', hex: '#3d7be0' },
  verde: { title: 'Ficha verde', hex: '#3fa64a' },
  vermelho: { title: 'Ficha vermelha', hex: '#d23a2e' },
  roxo: { title: 'Ficha roxa', hex: '#8e4cc4' },
  amarelo: { title: 'Ficha amarela', hex: '#e8b923' },
  laranja: { title: 'Ficha laranja', hex: '#ea7a1f' },
  rosa: { title: 'Ficha rosa', hex: '#e0569a' },
  turquesa: { title: 'Ficha turquesa', hex: '#1fb3a5' },
  branco: { title: 'Ficha branca', hex: '#ece6d6' },
  marrom: { title: 'Ficha marrom', hex: '#8a5a32' },
};

export function characterLabel(color) {
  return CHARACTERS[color]?.title ?? '';
}
