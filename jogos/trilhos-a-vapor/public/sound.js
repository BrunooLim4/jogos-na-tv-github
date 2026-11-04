// Sons do jogo, gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// PRIVACIDADE: só existe som para o que é público (o que todos veem na mesa).
// Nada aqui pode depender de informação secreta: qual carta saiu da pilha,
// quais bilhetes alguém tem, ou se alguém completou um bilhete. Por isso não
// existe som de "bilhete completo", e comprar da pilha soa sempre igual.

export function createSound() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      // 1 segundo de ruído branco, reaproveitado por vários sons.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  // O navegador só deixa tocar som depois de um toque/tecla na página.
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  const ready = () => enabled && ctx && ctx.state === 'running';

  function tone(freq, at, duration, { type = 'sine', gain = 0.25, attack = 0.01, slideTo = null } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function noise(at, duration, { gain = 0.2, freq = 2000, q = 1, filter = 'bandpass', attack = 0.005 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = freq;
    biquad.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(biquad).connect(env).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  const sounds = {
    // alguém entrou na sala
    join() {
      tone(784, 0, 0.18, { gain: 0.18 });
      tone(1175, 0.09, 0.28, { gain: 0.16 });
    },
    // alguém ficou pronto
    ready() {
      tone(520, 0, 0.09, { gain: 0.16, slideTo: 880 });
    },
    // carta tirada (da mesa ou da pilha: sempre o mesmo som)
    card() {
      noise(0, 0.09, { gain: 0.22, freq: 3200, q: 0.8 });
      tone(1400, 0, 0.04, { gain: 0.04, type: 'triangle' });
    },
    // cartas embaralhadas / mesa trocada
    shuffle() {
      for (let i = 0; i < 7; i++) noise(i * 0.045, 0.06, { gain: 0.14, freq: 2600 + i * 120, q: 0.9 });
    },
    // bilhetes (papel)
    paper() {
      noise(0, 0.28, { gain: 0.16, freq: 1400, q: 0.6, filter: 'lowpass', attack: 0.03 });
      noise(0.12, 0.2, { gain: 0.1, freq: 2400, q: 0.7 });
    },
    // um vagão encaixando na rota (toca um por vagão)
    clack(at = 0) {
      noise(at, 0.05, { gain: 0.26, freq: 1800, q: 2.5 });
      tone(190, at, 0.07, { gain: 0.14, type: 'triangle', slideTo: 120 });
    },
    // apito de trem (rota conquistada, começo da partida)
    whistle(at = 0, length = 0.55) {
      for (const [f, g] of [[523, 0.1], [659, 0.085], [784, 0.07]]) {
        tone(f, at, length, { type: 'triangle', gain: g, attack: 0.05 });
        tone(f * 1.005, at, length, { type: 'sine', gain: g * 0.6, attack: 0.05 });
      }
      noise(at, length * 0.9, { gain: 0.05, freq: 3000, q: 0.5, attack: 0.04 });
    },
    // passou a vez
    turn() {
      tone(660, 0, 0.16, { gain: 0.12 });
      tone(990, 0.1, 0.3, { gain: 0.1 });
    },
    // última rodada (buzina grave, duas vezes)
    lastRound() {
      for (const at of [0, 0.45]) {
        tone(220, at, 0.38, { type: 'sawtooth', gain: 0.09, attack: 0.03 });
        tone(277, at, 0.38, { type: 'sawtooth', gain: 0.07, attack: 0.03 });
      }
    },
    // pequeno "tic" (revelando o placar)
    tick() {
      tone(1200, 0, 0.05, { gain: 0.1, type: 'triangle' });
    },
    // fim de jogo
    fanfare() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, i * 0.13, 0.3, { type: 'triangle', gain: 0.14 }));
      for (const f of [523, 659, 784, 1047]) tone(f, 0.6, 1.1, { type: 'triangle', gain: 0.08, attack: 0.02 });
    },
    // celular: chegou a sua vez (público — todos veem de quem é a vez)
    yourTurn() {
      tone(880, 0, 0.14, { gain: 0.16 });
      tone(1320, 0.12, 0.22, { gain: 0.14 });
    },
  };

  return {
    unlock,
    get locked() {
      return !ctx || ctx.state !== 'running';
    },
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = Boolean(value);
    },
    play(name, ...args) {
      if (!ready() || !sounds[name]) return;
      sounds[name](...args);
      // Marcação invisível para os testes automáticos saberem que o som tocou.
      const root = document.documentElement.dataset;
      root.lastSound = name;
      root.soundCount = String(Number(root.soundCount ?? 0) + 1);
    },
  };
}
