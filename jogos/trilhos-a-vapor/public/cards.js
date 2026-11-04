// Cartas de vagão do Trilhos a Vapor. Compartilhado por servidor, TV e celular.

export const LOCOMOTIVE = 'locomotiva';

// As 8 cores de vagão (12 cartas de cada) + 14 locomotivas (coringa) = 110 cartas.
export const CARD_COLORS = ['roxo', 'branco', 'azul', 'amarelo', 'laranja', 'preto', 'vermelho', 'verde'];
export const CARD_TYPES = [...CARD_COLORS, LOCOMOTIVE];
export const CARDS_PER_COLOR = 12;
export const LOCOMOTIVE_COUNT = 14;

export const CARD_LABELS = {
  roxo: 'Roxo',
  branco: 'Branco',
  azul: 'Azul',
  amarelo: 'Amarelo',
  laranja: 'Laranja',
  preto: 'Preto',
  vermelho: 'Vermelho',
  verde: 'Verde',
  locomotiva: 'Coringa', // a locomotiva: vale qualquer cor
  cinza: 'Qualquer cor',
};

// A frase de cada carta (das artes do Bruno).
export const CARD_MOTTOS = {
  vermelho: 'Determinação nos trilhos. Sempre em frente.',
  azul: 'Lealdade e confiança. Juntos mais longe.',
  verde: 'Equilíbrio é o caminho. Natureza e progresso.',
  amarelo: 'O sol guia os trilhos. Sempre há um novo destino.',
  preto: 'Elegância na jornada. Força em cada quilômetro.',
  branco: 'Pureza de propósito. Conexões que unem.',
  laranja: 'Aventura nos trilhos. Novos horizontes.',
  roxo: 'Sonhe mais longe. O mundo é maior.',
  locomotiva: 'Vale qualquer cor. Abre qualquer caminho.',
};

// Cores de desenho das cartas e das rotas no mapa.
export const CARD_PAINT = {
  roxo: '#b65fc0',
  branco: '#eeeae0',
  azul: '#2f78d0',
  amarelo: '#f1c62e',
  laranja: '#ee8a2c',
  preto: '#2a2a2f',
  vermelho: '#d63f2e',
  verde: '#3f9e4b',
  cinza: '#8d969e',
};
