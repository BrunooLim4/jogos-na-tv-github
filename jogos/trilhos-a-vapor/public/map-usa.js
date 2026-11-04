// Mapa dos EUA do Trilhos a Vapor: cidades e rotas.
// Usado pelo servidor (regras) e pela TV/celular (desenho). O desenho é nosso,
// mas a disposição segue o tabuleiro original: posições das cidades (num quadro
// de 1248 x 800) e o formato de cada rota.
// label = onde fica o nome da cidade em relação ao ponto (n, s, e, w, ne, nw, se, sw),
// ou uma posição exata [dx, dy, alinhamento].

// "Zoom out": as posições do tabuleiro (num quadro de 1248 x 800) são
// esticadas por SPREAD. Trens, pontos e nomes continuam do mesmo tamanho,
// então sobra mais espaço entre as rotas, os nomes e as cidades.
export const SPREAD = 1.12;
// (+24 na largura: folga à direita para caber o nome de Washington)
export const MAP_SIZE = { width: Math.round(1248 * SPREAD) + 24, height: Math.round(800 * SPREAD) };

// Rotas que fazem curva (as outras são retas, como no tabuleiro).
// Valor = quanto o meio da rota se afasta da reta, em pixels. O sinal diz o
// lado: positivo = à direita de quem vai da cidade A para a B; negativo = à esquerda.
// Chave = 'cidadeA-cidadeB' como em ROUTE_DATA.
const BENDS = {
  'sea-cal': 17.3,
  'sea-hel': 17,
  'por-sfo': 18, // pela costa
  'por-slc': -40,
  'sfo-lax': 22, // pela costa
  'lax-lvg': -5.4,
  'lax-phx': -12,
  'lax-elp': 45, // arco por baixo de Phoenix
  'lvg-slc': 28,
  'phx-den': -16.1,
  'cal-win': -42, // arco por cima, perto da fronteira
  'hel-win': -2.7,
  'hel-dul': -17,
  'hel-oma': -5.4,
  'den-oma': -19.7,
  'den-kcy': 2.7,
  'den-okc': 10.8,
  'saf-okc': 2.7,
  'saf-elp': -11.6,
  'elp-okc': 2.6,
  'elp-dal': 8,
  'elp-hou': 44, // arco pelo sul
  'win-ssm': -18.8,
  'dul-ssm': -13.4,
  'dul-tor': 3.5,
  'dul-chi': -2.7,
  'oma-chi': -8.4,
  'kcy-okc': -2.7,
  'nor-atl': -0.7,
  'nor-mia': -17.1, // pela costa do golfo
  'stl-chi': -6.2,
  'stl-pit': 8.9,
  'chi-tor': -2.7,
  'chi-pit': -2.7,
  'ssm-tor': -5.4,
  'ssm-mon': -53.4, // arco por cima dos lagos
  'tor-mon': -22.3,
  'mon-bos': -3.6,
  'mon-nyc': 8.9,
  'nas-ral': -13.1,
  'atl-cha': 5.4,
  'atl-mia': 8.9,
  'ral-cha': 14.1,
  'cha-mia': 8,
};
export const ROUTE_SHAPES = Object.fromEntries(Object.entries(BENDS).map(([key, bend]) => [key, bend * SPREAD]));

export const CITIES = {
  van: { name: 'Vancouver', x: 92, y: 85, label: [0, -22, 'middle'] },
  sea: { name: 'Seattle', x: 89, y: 156, label: [-50, -1.5, 'middle'] },
  por: { name: 'Portland', x: 60, y: 220, label: [67, 56.5, 'middle'] },
  sfo: { name: 'San Francisco', x: 42, y: 478, label: [86, 28, 'middle'] },
  lax: { name: 'Los Angeles', x: 142, y: 617, label: [-67.5, 23, 'middle'] },
  cal: { name: 'Calgary', x: 264, y: 62, label: [-49.5, -15.5, 'middle'] },
  hel: { name: 'Helena', x: 395, y: 234, label: [-68.5, 33.5, 'middle'] },
  slc: { name: 'Salt Lake City', x: 300, y: 395, label: [-89, -19, 'middle'] },
  lvg: { name: 'Las Vegas', x: 228, y: 540, label: [57, 28.5, 'middle'] },
  phx: { name: 'Phoenix', x: 302, y: 625, label: [-51.5, 26.5, 'middle'] },
  elp: { name: 'El Paso', x: 456, y: 675, label: [-15, 41.5, 'middle'] },
  saf: { name: 'Santa Fe', x: 462, y: 555, label: [-55.5, -10, 'middle'] },
  den: { name: 'Denver', x: 470, y: 436, label: [40, -64.5, 'middle'] },
  win: { name: 'Winnipeg', x: 559, y: 75, label: [57, -18.5, 'middle'] },
  dul: { name: 'Duluth', x: 706, y: 226, label: [-60.5, 21, 'middle'] },
  oma: { name: 'Omaha', x: 665, y: 347, label: [-45.5, 40, 'middle'] },
  kcy: { name: 'Kansas City', x: 692, y: 415, label: [49.5, 43, 'middle', 2] },
  okc: { name: 'Oklahoma City', x: 665, y: 527, label: [-70.5, -65.5, 'middle', 2] },
  dal: { name: 'Dallas', x: 692, y: 640, label: [-28.5, 42, 'middle'] },
  hou: { name: 'Houston', x: 746, y: 695, label: [43.5, 38.5, 'middle'] },
  ssm: { name: 'Sault St. Marie', x: 871, y: 140, label: [-48.5, -58.5, 'middle'] },
  chi: { name: 'Chicago', x: 866, y: 307, label: [47, 32, 'middle'] },
  stl: { name: 'Saint Louis', x: 809, y: 415, label: [-45.5, -30, 'middle', 2] },
  lro: { name: 'Little Rock', x: 786, y: 532, label: [-55.5, -27, 'middle'] },
  nor: { name: 'New Orleans', x: 872, y: 682, label: [0, 32, 'middle'] },
  tor: { name: 'Toronto', x: 1014, y: 165, label: [54.5, 5, 'middle'] },
  pit: { name: 'Pittsburgh', x: 1038, y: 287, label: [-66, -22.5, 'middle'] },
  nas: { name: 'Nashville', x: 930, y: 466, label: [-31.5, -49.5, 'middle'] },
  atl: { name: 'Atlanta', x: 995, y: 511, label: [-74, 14.5, 'middle'] },
  mia: { name: 'Miami', x: 1160, y: 726, label: [42.5, 29.5, 'middle'] },
  mon: { name: 'Montreal', x: 1122, y: 52, label: [55, -18, 'middle'] },
  bos: { name: 'Boston', x: 1216, y: 132, label: [25, -38, 'middle'] },
  nyc: { name: 'New York', x: 1148, y: 230, label: [63, 22, 'middle'] },
  was: { name: 'Washington', x: 1157, y: 345, label: [68.5, 23.5, 'middle'] },
  ral: { name: 'Raleigh', x: 1081, y: 436, label: [52, 19, 'middle'] },
  cha: { name: 'Charleston', x: 1118, y: 522, label: [65.5, 5, 'middle'] },
};
for (const city of Object.values(CITIES)) {
  city.x = Math.round(city.x * SPREAD);
  city.y = Math.round(city.y * SPREAD);
}

// [cidade A, cidade B, tamanho, cor] — rotas duplas têm duas cores.
// 'cinza' = qualquer cor serve.
const ROUTE_DATA = [
  ['van', 'sea', 1, 'cinza', 'cinza'],
  ['van', 'cal', 3, 'cinza'],
  ['sea', 'por', 1, 'cinza', 'cinza'],
  ['sea', 'cal', 4, 'cinza'],
  ['sea', 'hel', 6, 'amarelo'],
  ['por', 'sfo', 5, 'verde', 'roxo'],
  ['por', 'slc', 6, 'azul'],
  ['sfo', 'slc', 5, 'laranja', 'branco'],
  ['sfo', 'lax', 3, 'amarelo', 'roxo'],
  ['lax', 'lvg', 2, 'cinza'],
  ['lax', 'phx', 3, 'cinza'],
  ['lax', 'elp', 6, 'preto'],
  ['lvg', 'slc', 3, 'laranja'],
  ['phx', 'elp', 3, 'cinza'],
  ['phx', 'saf', 3, 'cinza'],
  ['phx', 'den', 5, 'branco'],
  ['cal', 'hel', 4, 'cinza'],
  ['cal', 'win', 6, 'branco'],
  ['hel', 'win', 4, 'azul'],
  ['hel', 'dul', 6, 'laranja'],
  ['hel', 'oma', 5, 'vermelho'],
  ['hel', 'den', 4, 'verde'],
  ['hel', 'slc', 3, 'roxo'],
  ['slc', 'den', 3, 'vermelho', 'amarelo'],
  ['den', 'oma', 4, 'roxo'],
  ['den', 'kcy', 4, 'preto', 'laranja'],
  ['den', 'okc', 4, 'vermelho'],
  ['den', 'saf', 2, 'cinza'],
  ['saf', 'okc', 3, 'azul'],
  ['saf', 'elp', 2, 'cinza'],
  ['elp', 'okc', 5, 'amarelo'],
  ['elp', 'dal', 4, 'vermelho'],
  ['elp', 'hou', 6, 'verde'],
  ['win', 'dul', 4, 'preto'],
  ['win', 'ssm', 6, 'cinza'],
  ['dul', 'ssm', 3, 'cinza'],
  ['dul', 'tor', 6, 'roxo'],
  ['dul', 'chi', 3, 'vermelho'],
  ['dul', 'oma', 2, 'cinza', 'cinza'],
  ['oma', 'chi', 4, 'azul'],
  ['oma', 'kcy', 1, 'cinza', 'cinza'],
  ['kcy', 'stl', 2, 'azul', 'roxo'],
  ['kcy', 'okc', 2, 'cinza', 'cinza'],
  ['okc', 'dal', 2, 'cinza', 'cinza'],
  ['okc', 'lro', 2, 'cinza'],
  ['dal', 'lro', 2, 'cinza'],
  ['dal', 'hou', 1, 'cinza', 'cinza'],
  ['hou', 'nor', 2, 'cinza'],
  ['lro', 'stl', 2, 'cinza'],
  ['lro', 'nas', 3, 'branco'],
  ['lro', 'nor', 3, 'verde'],
  ['nor', 'atl', 4, 'amarelo', 'laranja'],
  ['nor', 'mia', 6, 'vermelho'],
  ['stl', 'chi', 2, 'verde', 'branco'],
  ['stl', 'pit', 5, 'verde'],
  ['stl', 'nas', 2, 'cinza'],
  ['chi', 'tor', 4, 'branco'],
  ['chi', 'pit', 3, 'laranja', 'preto'],
  ['ssm', 'tor', 2, 'cinza'],
  ['ssm', 'mon', 5, 'preto'],
  ['tor', 'mon', 3, 'cinza'],
  ['tor', 'pit', 2, 'cinza'],
  ['mon', 'bos', 2, 'cinza', 'cinza'],
  ['mon', 'nyc', 3, 'azul'],
  ['bos', 'nyc', 2, 'amarelo', 'vermelho'],
  ['nyc', 'pit', 2, 'branco', 'verde'],
  ['nyc', 'was', 2, 'laranja', 'preto'],
  ['pit', 'was', 2, 'cinza'],
  ['pit', 'ral', 2, 'cinza'],
  ['pit', 'nas', 4, 'amarelo'],
  ['was', 'ral', 2, 'cinza', 'cinza'],
  ['nas', 'ral', 3, 'preto'],
  ['nas', 'atl', 1, 'cinza'],
  ['atl', 'ral', 2, 'cinza', 'cinza'],
  ['atl', 'cha', 2, 'cinza'],
  ['atl', 'mia', 5, 'azul'],
  ['ral', 'cha', 2, 'cinza'],
  ['cha', 'mia', 4, 'roxo'],
];

// Uma entrada por rota. Rotas duplas viram duas rotas com o mesmo par de cidades
// (lane 0 e lane 1), para desenhar lado a lado.
export const ROUTES = ROUTE_DATA.flatMap(([a, b, length, ...colors]) =>
  colors.map((color, lane) => ({
    id: `${a}-${b}${colors.length > 1 ? `-${lane + 1}` : ''}`,
    a,
    b,
    length,
    color,
    lane,
    lanes: colors.length,
  })),
);
