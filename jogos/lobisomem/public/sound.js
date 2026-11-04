// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// CLIMA DO LOBISOMEM: a vila à noite — batida na porta, baralho, o uivo do lobo, os
// sinos da igreja e os passarinhos do amanhecer, tambores da votação, o gongo de quem
// morre, o tiro do Caçador. Feitos para este jogo (nada copiado de outro).
// Padrão Resistência (a referência): na TV, o som toca DENTRO da animação (tv.js, na
// hora em que a carta vira / o carimbo bate), não quando o lance chega do servidor.
// Com a fila acumulada, os sons de clima (embaralhar, distribuir, cartas virando) não tocam.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os momentos que
// todos precisam perceber; nada por ação repetida (cada um terminando a noite, cada voto).
//
// PRIVACIDADE: o CELULAR NÃO TOCA NADA neste jogo — à noite todos mexem juntos e um
// som num celular entregaria quem tem ação. Na TV só há som para o que é público.

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'Alguém entrou na sala', 'toc-toc na porta'],
  ['shuffle', 'A partida começou: embaralhar', 'baralho sendo embaralhado'],
  ['deal', 'As cartas voando para cada um', 'cartas deslizando'],
  ['howl', 'A noite caiu', 'o uivo do lobo'],
  ['dawn', 'Amanheceu', 'sinos da igreja e passarinhos'],
  ['vote', 'Hora de votar', 'tambores'],
  ['point', 'Apontem! (as setas dos votos)', 'um sopro rápido'],
  ['nobody', 'Ninguém morreu', 'três notas de alívio'],
  ['death', 'Alguém morreu', 'gongo grave'],
  ['hunter', 'O Caçador leva alguém junto', 'tiro com eco'],
  ['flip', 'As outras cartas virando', 'cartas virando'],
  ['winVillage', 'A vila venceu', 'sinos de festa'],
  ['winWolves', 'Os lobisomens venceram', 'uivo e acorde sombrio'],
  ['winTanner', 'O Curtidor venceu', 'musiquinha zombeteira'],
  ['nobodyWins', 'Ninguém venceu', 'nota caindo'],
];

// `context` (opcional): um contexto de áudio pronto — usado para conferir os
// sons sem caixa de som (tools/conferir-sons.mjs grava num OfflineAudioContext).
export function createSound({ context = null } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!context && !AudioCtx) return null;
      ctx = context ?? new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      // 1 segundo de ruído branco, para cartas, sopro, tiro, respiração do uivo...
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  // O navegador só deixa tocar som depois de um toque/tecla na página.
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended' && !context) ctx.resume();
  }

  const ready = () => enabled && ensure() && (context || ctx.state === 'running');

  // Peças para montar sons: tom (com `lowpass` para abafar), ruído filtrado (com
  // `sweepTo`: o filtro desliza), pancada grave, corda dedilhada e sino.
  function tone(freq, at, duration, { type = 'sine', gain = 0.2, attack = 0.01, slideTo = null, lowpass = null } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration * 0.8);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let out = osc;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      out = osc.connect(filter);
    }
    out.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function noise(at, duration, { gain = 0.15, freq = 2000, q = 1, filter = 'bandpass', attack = 0.005, sweepTo = null } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true; // ruído mais longo que 1 s não corta
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t);
    if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    biquad.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(biquad).connect(env).connect(master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + duration + 0.05);
  }

  function pluck(freq, at, { gain = 0.1, length = 0.7 } = {}) {
    tone(freq, at, length, { type: 'triangle', gain, attack: 0.004 });
    tone(freq * 2, at, length * 0.45, { gain: gain * 0.35, attack: 0.003 });
  }
  // sino de igreja: a nota, a "quinta" de cima e o zumbido grave que fica
  function bell(freq, at, { gain = 0.1, length = 1.4 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 2.76, at, length * 0.45, { gain: gain * 0.32, attack: 0.002 });
    tone(freq * 0.5, at, length * 1.3, { gain: gain * 0.35, attack: 0.01 });
  }
  function thump(at, { freq = 70, gain = 0.35, length = 0.22 } = {}) {
    tone(freq * 2, at, length, { gain, attack: 0.003, slideTo: freq });
  }

  // O uivo: a voz sobe, segura tremendo (vibrato) e cai; com um pouco de "ar".
  function howl(at, { base = 300, peak = 560, length = 2.6, gain = 0.13 } = {}) {
    const t = ctx.currentTime + at;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.35);
    env.gain.setValueAtTime(gain, t + length * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    env.connect(filter).connect(master);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(14, t + length * 0.4);
    lfo.connect(depth);
    // [desafinar (Hz), forma, volume, oitava]: a voz, uma 2ª voz quase igual e o brilho de cima
    for (const [detune, type, g, mult] of [[0, 'triangle', 1, 1], [5, 'sine', 0.6, 1], [0, 'sine', 0.18, 2]]) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(base * mult, t);
      osc.frequency.exponentialRampToValueAtTime(peak * mult + detune, t + length * 0.32);
      osc.frequency.setValueAtTime(peak * mult + detune, t + length * 0.62);
      osc.frequency.exponentialRampToValueAtTime(peak * 0.74 * mult, t + length);
      depth.connect(osc.frequency);
      og.gain.value = g;
      osc.connect(og).connect(env);
      osc.start(t);
      osc.stop(t + length + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + length + 0.05);
    noise(at + 0.05, length * 0.9, { gain: gain * 0.25, freq: 900, q: 0.7, attack: 0.3 });
  }

  // passarinho: piadas curtas e agudas
  function chirp(at, { freq = 3200, gain = 0.05 } = {}) {
    tone(freq, at, 0.07, { gain, attack: 0.005, slideTo: freq * 1.35 });
    tone(freq * 1.1, at + 0.09, 0.06, { gain: gain * 0.8, attack: 0.005, slideTo: freq * 0.9 });
  }

  const sounds = {
    join() {
      // toc-toc: duas batidas de madeira
      for (const at of [0, 0.16]) {
        thump(at, { freq: 140, gain: 0.3, length: 0.12 });
        noise(at, 0.05, { gain: 0.12, freq: 1800, q: 2 });
      }
    },
    shuffle() {
      // o baralho folheando duas vezes
      for (let i = 0; i < 26; i++) noise((i % 13) * 0.028 + (i >= 13 ? 0.5 : 0), 0.035, { gain: 0.32, freq: 3500 + (i % 3) * 600, q: 1.4 });
      noise(0.42, 0.08, { gain: 0.3, freq: 1500, q: 0.8 });
      noise(0.9, 0.08, { gain: 0.3, freq: 1500, q: 0.8 });
    },
    deal() {
      // cartas deslizando na mesa
      for (let i = 0; i < 8; i++) noise(i * 0.16, 0.12, { gain: 0.28, freq: 2400, sweepTo: 5200, q: 0.9, attack: 0.02 });
    },
    howl() {
      howl(0);
    },
    dawn() {
      // sinos da igreja ao longe e passarinhos
      [392, 330, 294].forEach((f, i) => bell(f, i * 0.55, { gain: 0.08, length: 2.2 }));
      [0.3, 0.42, 1.1, 1.24, 1.9].forEach((at, i) => chirp(at, { freq: 2900 + (i % 3) * 400 }));
    },
    vote() {
      // tambores que crescem e um acorde menor
      [0, 0.32, 0.56, 0.72, 0.84].forEach((at, i) => thump(at, { freq: 60, gain: 0.18 + i * 0.04, length: 0.3 }));
      [147, 175, 220].forEach(f => tone(f, 0.96, 1.3, { type: 'sawtooth', gain: 0.045, attack: 0.02, lowpass: 900 }));
    },
    point() {
      noise(0, 0.45, { gain: 0.5, freq: 400, sweepTo: 4000, q: 0.8, attack: 0.08 });
    },
    nobody() {
      [392, 494, 587].forEach((f, i) => pluck(f, i * 0.14, { gain: 0.12, length: 0.9 }));
    },
    death() {
      // gongo grave e um acorde sombrio
      bell(98, 0, { gain: 0.16, length: 3 });
      thump(0, { freq: 55, gain: 0.32, length: 0.5 });
      [110, 131, 165].forEach(f => tone(f, 0.05, 1.8, { type: 'sawtooth', gain: 0.03, attack: 0.08, lowpass: 600 }));
    },
    hunter() {
      // o tiro e o eco no vale
      noise(0, 0.25, { gain: 0.35, freq: 1200, q: 0.5, filter: 'lowpass', attack: 0.002 });
      thump(0, { freq: 60, gain: 0.4, length: 0.35 });
      noise(0.28, 0.4, { gain: 0.08, freq: 900, q: 0.6, filter: 'lowpass', attack: 0.01 });
      noise(0.62, 0.5, { gain: 0.035, freq: 700, q: 0.6, filter: 'lowpass', attack: 0.01 });
    },
    flip() {
      for (let i = 0; i < 6; i++) noise(i * 0.12, 0.06, { gain: 0.3, freq: 2800, q: 1.2 });
    },
    winVillage() {
      // sinos de festa: subindo e todos juntos
      [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.16, { gain: 0.07, length: 1.6 }));
      [523, 659, 784].forEach(f => bell(f, 0.8, { gain: 0.05, length: 2.4 }));
      [0.3, 0.5, 1.2].forEach(at => chirp(at, { freq: 3400 }));
    },
    winWolves() {
      howl(0, { base: 280, peak: 520, length: 2.4, gain: 0.12 });
      [98, 117, 147].forEach(f => tone(f, 0.6, 2.2, { type: 'sawtooth', gain: 0.04, attack: 0.3, lowpass: 700 }));
      thump(0.6, { freq: 50, gain: 0.3, length: 0.6 });
    },
    winTanner() {
      // musiquinha zombeteira (o Curtidor queria morrer!)
      [[294, 0], [262, 0.18], [294, 0.36], [220, 0.54], [196, 0.9]].forEach(([f, at], i) => tone(f, at, i === 4 ? 0.7 : 0.18, { type: 'square', gain: 0.05, attack: 0.01, lowpass: 1200 }));
      thump(0.9, { freq: 70, gain: 0.2 });
    },
    nobodyWins() {
      tone(330, 0, 1.4, { type: 'triangle', gain: 0.18, slideTo: 196, lowpass: 1200 });
    },
  };

  return {
    unlock,
    get locked() {
      return !ctx || (!context && ctx.state !== 'running');
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
      // Marcação invisível para os testes saberem que o som tocou.
      if (typeof document !== 'undefined' && !context) {
        const root = document.documentElement.dataset;
        root.lastSound = name;
        root.soundCount = String(Number(root.soundCount ?? 0) + 1);
      }
    },
  };
}
