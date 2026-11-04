// Os personagens do Lobisomem (as 16 cartas do Bruno, em public/cartas/<carta>.webp).
// Usado pelo servidor (regras), pela TV e pelo celular — os três sempre concordam.

// As 16 cartas da caixa. A carta é o arquivo; o personagem é o nome sem o número.
export const DECK = [
  'lobisomem-1', 'lobisomem-2', 'vidente', 'ladrao', 'encrenqueira',
  'lacaio', 'macom-1', 'macom-2', 'bebado', 'insone', 'sosia', 'cacador', 'curtidor',
  'aldeao-1', 'aldeao-2', 'aldeao-3',
];
// Sempre na partida (regra pedida pelo Bruno: "com as cartas obrigatórias, como o
// lobisomem"): os 2 Lobisomens e o trio do jogo básico da caixa (Vidente, Ladrão e
// Encrenqueira — as trocas são o que deixa a manhã divertida).
export const FIXED = ['lobisomem-1', 'lobisomem-2', 'vidente', 'ladrao', 'encrenqueira'];

export const roleOf = card => card.replace(/-\d$/, '');

// Ordem em que os personagens agem à noite (a oficial). No celular todos tocam ao
// mesmo tempo; o servidor resolve nesta ordem quando o último termina.
export const NIGHT_ORDER = ['sosia', 'lobisomem', 'lacaio', 'macom', 'vidente', 'ladrao', 'encrenqueira', 'bebado', 'insone'];

export const TEAMS = {
  vila: { name: 'Time da vila', goal: 'Vence se um lobisomem morrer na votação.' },
  lobos: { name: 'Time dos lobisomens', goal: 'Vence se nenhum lobisomem morrer.' },
  curtidor: { name: 'Sozinho', goal: 'Só vence se ele mesmo morrer.' },
};

// `night`: o que fazer à noite (frase curta, com verbo). `act`: que cartas tocar.
export const ROLES = {
  lobisomem: {
    name: 'Lobisomem', team: 'lobos',
    night: 'Descubra quem é o outro lobisomem. Escolha 1 carta do meio: se você for o único lobisomem, vai ver qual é.',
    day: 'De dia, finja que é da vila e não deixe ninguém votar em você.',
  },
  lacaio: {
    name: 'Lacaio', team: 'lobos',
    night: 'Você vai saber quem são os lobisomens (eles não sabem de você).',
    day: 'Proteja os lobisomens. Você vence se nenhum deles morrer, mesmo que você morra.',
  },
  vidente: {
    name: 'Vidente', team: 'vila',
    night: 'Espie a carta de 1 jogador OU 2 cartas do meio.',
    day: 'Conte o que viu (ou guarde para a hora certa).',
  },
  ladrao: {
    name: 'Ladrão', team: 'vila',
    night: 'Troque a sua carta com a de 1 jogador e veja o que pegou. Você vira esse personagem.',
    day: 'Você agora é do time da carta que pegou.',
  },
  encrenqueira: {
    name: 'Encrenqueira', team: 'vila',
    night: 'Troque as cartas de 2 outros jogadores, sem ver.',
    day: 'Eles nem sabem que viraram outra coisa…',
  },
  bebado: {
    name: 'Bêbado', team: 'vila',
    night: 'Troque a sua carta com 1 carta do meio, sem ver. Nem você vai saber o que virou.',
    day: 'Você é do time da carta que pegou no meio.',
  },
  insone: {
    name: 'Insone', team: 'vila',
    night: 'No fim da noite, você vai ver a sua própria carta (para saber se trocaram).',
    day: 'Conte se a sua carta mudou.',
  },
  macom: {
    name: 'Maçom', team: 'vila',
    night: 'Você vai saber quem é o outro maçom.',
    day: 'Vocês dois podem confiar um no outro.',
  },
  cacador: {
    name: 'Caçador', team: 'vila',
    night: 'Você não acorda à noite.',
    day: 'Se você morrer na votação, quem você votou morre junto.',
  },
  curtidor: {
    name: 'Curtidor', team: 'curtidor',
    night: 'Você não acorda à noite.',
    day: 'Você odeia a vida: só vence se você mesmo morrer. Faça todo mundo desconfiar de você!',
  },
  aldeao: {
    name: 'Aldeão', team: 'vila',
    night: 'Você não acorda à noite.',
    day: 'Ajude a vila a achar um lobisomem.',
  },
  sosia: {
    name: 'Sósia', team: 'vila',
    night: 'Olhe a carta de 1 jogador: você vira aquele personagem (e faz o que ele faz).',
    day: 'Você é do time do personagem que copiou.',
  },
};

// Quem já sabe o resultado da carta copiada pela Sósia age NA HORA (antes de todos).
export const IMMEDIATE = ['vidente', 'ladrao', 'encrenqueira', 'bebado'];

// O que tocar à noite: quantos jogadores (`players`) e quantas cartas do meio (`center`).
// Quem não tem ação toca em 1 carta qualquer, só para disfarçar (todos mexem no celular
// do mesmo jeito: quem está do lado não descobre quem é quem).
export const ACTS = {
  nenhuma: { options: [{ players: 1, center: 0 }, { players: 0, center: 1 }], fake: true,
    hint: 'Toque em 1 carta qualquer (é só para disfarçar: nada acontece).' },
  lobisomem: { options: [{ players: 0, center: 1 }], hint: 'Toque em 1 carta do meio.' },
  vidente: { options: [{ players: 1, center: 0 }, { players: 0, center: 2 }], hint: 'Toque em 1 jogador OU em 2 cartas do meio.' },
  ladrao: { options: [{ players: 1, center: 0 }], hint: 'Toque no jogador que você vai roubar.' },
  encrenqueira: { options: [{ players: 2, center: 0 }], hint: 'Toque nos 2 jogadores que vão trocar de carta.' },
  bebado: { options: [{ players: 0, center: 1 }], hint: 'Toque na carta do meio que vai ser a sua.' },
  sosia: { options: [{ players: 1, center: 0 }], hint: 'Toque no jogador que você vai copiar.' },
};

export function actOf(role) {
  return ACTS[role] ?? ACTS.nenhuma;
}

// A escolha vale para esse personagem? `pick` = { players: [ids], center: [0..2] }.
export function validPick(role, pick, selfId, playerIds) {
  const players = pick?.players ?? [];
  const center = pick?.center ?? [];
  if (!Array.isArray(players) || !Array.isArray(center)) return false;
  if (new Set(players).size !== players.length || new Set(center).size !== center.length) return false;
  if (players.some(id => id === selfId || !playerIds.includes(id))) return false;
  if (center.some(i => !Number.isInteger(i) || i < 0 || i > 2)) return false;
  return actOf(role).options.some(o => o.players === players.length && o.center === center.length);
}
