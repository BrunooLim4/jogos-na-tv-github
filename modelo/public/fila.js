// Fila das animações grandes da TV — o padrão do Resistência (a referência; ver
// ../conhecimento/padrao-resistencia.md).
//
// A TV compara o retrato novo com o anterior e ENFILEIRA as revelações (distribuir
// cartas, revelar votos, revelar o resultado, o fim): uma de cada vez, sem
// atropelar. Se a fila acumular (robôs jogando rápido), as próximas andam mais
// depressa (`speed` = 0.35). Cada animação recebe `gen`: se a partida mudou no
// meio (jogar de novo, voltar para a sala), `stale(gen)` avisa para parar.
//
// Junto com a fila, guarde num objeto `view` o que a TV JÁ revelou e desenhe a mesa
// a partir dele (não do estado mais novo) — senão o resultado aparece antes da
// animação. Os sons das revelações tocam DENTRO da animação, na hora certa.
//
// Uso:
//   const fila = createQueue({ onIdle: () => redesenhar() });
//   fila.add(async gen => { ...; await fila.wait(800); if (fila.stale(gen)) return; ... });
//   fila.reset(); // partida nova: esquece o que estava na fila

export function createQueue({ onIdle = null } = {}) {
  const steps = [];
  let running = false;
  let generation = 0;
  let speed = 1;

  async function run() {
    running = true;
    while (steps.length) {
      const step = steps.shift();
      speed = steps.length ? 0.35 : 1;
      try {
        await step(generation);
      } catch (error) {
        console.error(error);
      }
    }
    running = false;
    speed = 1;
    onIdle?.(); // fila vazia: agora dá para mover fichas, redesenhar etc.
  }

  return {
    get running() {
      return running;
    },
    get speed() {
      return speed;
    },
    // espera "ms" (mais rápido se a fila acumulou)
    wait: ms => new Promise(resolve => setTimeout(resolve, ms * speed)),
    add(step) {
      steps.push(step);
      if (!running) run();
    },
    reset() {
      generation += 1;
      steps.length = 0;
    },
    stale: gen => gen !== generation,
  };
}

// Reinicia uma animação CSS (tira a classe, força o navegador a notar, põe de volta).
export function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}
