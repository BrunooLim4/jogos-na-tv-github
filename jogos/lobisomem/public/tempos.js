// Quanto dura cada parte da revelação na TV (em ms). A TV anima com estes tempos e o
// celular espera o total ("Olhem a TV!") antes de mostrar o resultado — senão quem
// olha o celular descobre antes (padrão Resistência).

export const TEMPOS = {
  point: 1100, // "Apontem!"
  arcs: 1300, // as setas dos votos aparecem todas juntas
  counts: 900, // os números de votos
  death: 1700, // a carta de quem morreu vira
  hunter: 1900, // o Caçador leva alguém junto
  nobody: 1500, // "Ninguém morreu"
  flipEach: 240, // as outras cartas virando, uma por uma
  center: 1000, // as 3 do meio
  banner: 3200, // quem venceu
};

// O tempo total da revelação para esta partida.
export function revealMs(result, playerCount) {
  const dead = result.dead.length;
  return TEMPOS.point + TEMPOS.arcs + TEMPOS.counts
    + (dead ? (dead - result.hunterKills.length) * TEMPOS.death + result.hunterKills.length * TEMPOS.hunter : TEMPOS.nobody)
    + (playerCount - dead) * TEMPOS.flipEach + TEMPOS.center + TEMPOS.banner;
}
