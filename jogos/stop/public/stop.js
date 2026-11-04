// O que o servidor, a TV e o celular do Stop precisam saber juntos (sempre concordam):
// as letras, as categorias, e como comparar respostas.

// Letras sorteadas (sem K, Q, W, X e Y: quase nenhuma palavra em português começa com elas).
export const LETTERS = 'ABCDEFGHIJLMNOPRSTUVZ'.split('');

// A lista grande de categorias (pedido do Bruno: o jogo sorteia algumas a cada rodada).
export const CATEGORIES = [
  'Nome', 'Cidade', 'País', 'Animal', 'Fruta', 'Cor', 'Objeto', 'Profissão', 'Comida', 'Marca',
  'Filme ou série', 'Cantor ou banda', 'Parte do corpo', 'Esporte', 'Meio de transporte',
  'Flor ou planta', 'Time de futebol', 'Personagem', 'Bebida', 'Doce ou sobremesa',
  'Instrumento musical', 'Roupa ou acessório', 'Coisa da casa', 'Brinquedo ou jogo', 'Verbo',
  'Jeito de ser', 'Palavra em inglês', 'Pessoa famosa', 'Inseto', 'Bicho do mar',
  'Legume ou verdura', 'Material escolar', 'Coisa da praia', 'Coisa que voa', 'Coisa da cozinha',
  'Nome de pet', 'Programa de TV', 'App ou site', 'Sentimento', 'Lugar para passear', 'Ferramenta',
  'Sobrenome',
];

export const CATEGORIES_PER_ROUND = 8;
export const TOTAL_ROUNDS = 6;
// Os relógios (ms): roleta da letra, tempo para escrever, os 3 s depois do STOP, tempo
// máximo de cada categoria na correção, e uma folguinha para as últimas respostas
// chegarem pela rede. A TV e o celular usam os mesmos números.
export const TIMES = { roulette: 3600, write: 90_000, stop: 3000, review: 20_000, grace: 700 };
// O ritmo da roleta da TV (ms entre uma letra e a próxima, desacelerando): a TV troca a
// letra e o som dá um clique em cada uma (cabe nos 3,6 s da roleta).
export const ROULETTE_STEPS = Array.from({ length: 22 }, (_, i) => Math.round(50 + (i / 22) ** 2.4 * 260));
export const MAX_ANSWER = 30;

// Para comparar: sem acento, sem maiúscula, sem pontuação e sem espaço sobrando
// ("Maçã", "maca" e " MAÇÃ!" são a mesma resposta).
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A resposta começa com a letra da rodada? (Á, Â, À contam como A; Ç como C.)
export function startsWithLetter(text, letter) {
  return normalize(text).startsWith(letter.toLowerCase());
}

export function cleanAnswer(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
}

// Pontos de uma resposta que vale: sozinha 10; igual à de outra pessoa 5.
export const POINTS_ALONE = 10;
export const POINTS_SHARED = 5;
