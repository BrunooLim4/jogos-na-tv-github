// Jogadores no ESTILO PADRÃO: só uma cor e a inicial do nome (sem personagem).
// Na etapa de personalidade, cada cor vira um personagem com arte própria do
// jogo (ver jogos/dixit/public/characters.js) — nunca o de outro jogo.

export const CHARACTERS = {
  azul: { title: 'Azul' },
  verde: { title: 'Verde' },
  vermelho: { title: 'Vermelho' },
  roxo: { title: 'Roxo' },
  amarelo: { title: 'Amarelo' },
  laranja: { title: 'Laranja' },
  rosa: { title: 'Rosa' },
  turquesa: { title: 'Turquesa' },
  branco: { title: 'Branco' },
  marrom: { title: 'Marrom' },
};

export function characterLabel(color) {
  return CHARACTERS[color]?.title ?? '';
}
