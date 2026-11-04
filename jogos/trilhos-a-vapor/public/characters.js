// Os 5 personagens do jogo: cada cor de trem é um personagem com identidade
// própria (artes do Bruno, recortadas em public/img).

export const CHARACTERS = {
  vermelho: {
    name: 'Jeremiah',
    title: 'o Aviador',
    trains: 'trens vermelhos',
    tagline: 'Sonha em ligar as cidades pelo céu e pelos trilhos.',
  },
  verde: {
    name: 'Martha',
    title: 'a Botânica',
    trains: 'trens verdes',
    tagline: 'Coleciona plantas raras em cada estação.',
  },
  amarelo: {
    name: 'Clive',
    title: 'o Minerador',
    trains: 'trens amarelos',
    tagline: 'Leva o ouro das minas até as grandes cidades.',
  },
  azul: {
    name: 'Jacqueline',
    title: 'a Capitã',
    trains: 'trens azuis',
    tagline: 'Comanda sua frota de costa a costa.',
  },
  roxo: {
    name: 'Brewster',
    title: 'o Apostador',
    trains: 'trens roxos',
    tagline: 'Aposta alto e viaja com todo o luxo.',
  },
};

export const portraitUrl = color => `/img/p-${color}.webp`;
export const vehicleUrl = color => `/img/v-${color}.webp`;
export const trainUrl = color => `/img/t-${color}.webp`;

export function characterLabel(color) {
  const c = CHARACTERS[color];
  return c ? `${c.name}, ${c.title}` : '';
}
