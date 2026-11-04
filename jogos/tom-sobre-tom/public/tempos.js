// Quanto dura cada animação da TV. A TV anima com estes tempos e o celular usa os
// mesmos para esperar ("Olhem a TV!") antes de mostrar os pontos da rodada —
// senão o celular estraga a surpresa.

export const TEMPOS = {
  cardShow: 1300, // a carta de quem deu a dica aparece com as 4 cores
  cardPick: 900, // a cor escolhida se destaca
  frameDrop: 900, // o quadro de pontos cai em volta da cor certa
  conePoint: 380, // cada cone que fez ponto pula, um de cada vez
  giverPoint: 600, // os pontos de quem deu a dica
  scores: 1100, // o placar ao lado sobe
};

// A revelação inteira (a TV espera isto antes da próxima animação).
export function revealMs(result) {
  const scoring = result.pieces.filter(p => p.points > 0).length;
  return TEMPOS.cardShow + TEMPOS.cardPick + TEMPOS.frameDrop
    + scoring * TEMPOS.conePoint + (result.giverPoints > 0 ? TEMPOS.giverPoint : 0) + TEMPOS.scores;
}
