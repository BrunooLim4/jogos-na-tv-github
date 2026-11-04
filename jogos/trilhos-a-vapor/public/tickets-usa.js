// Os 30 bilhetes de destino do mapa dos EUA: ligar a cidade A à cidade B.
// Quem completa ganha os pontos; quem não completa perde os mesmos pontos.

export const TICKETS = [
  ['lax', 'nyc', 21],
  ['dul', 'hou', 8],
  ['ssm', 'nas', 8],
  ['nyc', 'atl', 6],
  ['por', 'nas', 17],
  ['van', 'mon', 20],
  ['dul', 'elp', 10],
  ['tor', 'mia', 10],
  ['por', 'phx', 11],
  ['dal', 'nyc', 11],
  ['cal', 'slc', 7],
  ['cal', 'phx', 13],
  ['lax', 'mia', 20],
  ['win', 'lro', 11],
  ['sfo', 'atl', 17],
  ['kcy', 'hou', 5],
  ['lax', 'chi', 16],
  ['den', 'pit', 11],
  ['chi', 'saf', 9],
  ['van', 'saf', 13],
  ['bos', 'mia', 12],
  ['chi', 'nor', 7],
  ['mon', 'atl', 9],
  ['sea', 'nyc', 22],
  ['den', 'elp', 4],
  ['hel', 'lax', 8],
  ['win', 'hou', 12],
  ['mon', 'nor', 13],
  ['ssm', 'okc', 9],
  ['sea', 'lax', 9],
].map(([a, b, points]) => ({ id: `${a}-${b}`, a, b, points }));

export const TICKETS_BY_ID = Object.fromEntries(TICKETS.map(t => [t.id, t]));

// Pontos por tamanho de rota (regra oficial).
export const ROUTE_POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };
export const LONGEST_ROUTE_BONUS = 10;
