// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// CLIMA DO TOM SOBRE TOM: "tudo em cores" — gotas de tinta (bolhas que sobem), uma
// marimba (madeira colorida, alegre) e o "arco-íris de notas" (9 notas subindo, uma por
// cor do arco-íris). São os sons deste jogo; nada copiado de outro.
// Padrão Resistência (a referência): na TV, o som das revelações toca DENTRO da
// animação (tv.js, na hora em que a carta aparece / o quadro cai), não quando o
// lance chega do servidor. Com a fila acumulada, os sons de clima (a carta, a
// pincelada da rodada) não tocam.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os
// momentos que todos precisam perceber; nada por ação repetida (cada cone caindo,
// cada cone pontuando, o placar subindo). Celular só toca quando é a vez daquela pessoa.
//
// PRIVACIDADE: só existe som para o que é público. A cor escolhida por quem dá a
// dica não tem som nenhum (nem no celular dela).

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'TV: alguém entrou na sala', 'duas gotas de tinta'],
  ['start', 'TV: a partida começou', 'o arco-íris de notas (9 notas subindo) e um brilho'],
  ['round', 'TV: nova rodada (os cones saem do tabuleiro)', 'uma pincelada e uma gota'],
  ['lastRound', 'TV: última rodada!', 'três notas de marimba chamando'],
  ['cue', 'TV: a dica aparece', 'plim-plim'],
  ['card', 'TV: a carta com as 4 cores aparece', 'marimba rufando, cada vez mais forte (suspense)'],
  ['burst', 'TV: o quadro cai na cor certa', 'pancada, acorde e confete de notas (a explosão de cores)'],
  ['bullseye', 'TV: alguém acertou a cor exata (+3)', 'sininhos subindo'],
  ['miss', 'TV: ninguém pontuou na rodada', 'fom-fom (duas notas caindo)'],
  ['fanfare', 'TV: fim de jogo', 'o arco-íris de notas e acorde de festa'],
  ['yourTurn', 'Celular: sua vez (dar a dica ou pôr o cone)', 'duas gotas e um plim'],
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
      // 1 segundo de ruído branco, para a pincelada, a carta e o brilho do confete
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

  // Peças para montar sons: tom (com `lowpass` para abafar), ruído filtrado
  // (pincelada, carta, brilho), sino, pancada grave, marimba e gota de tinta.
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

  // `sweepTo`: o filtro desliza até essa altura (a pincelada).
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

  function bell(freq, at, { gain = 0.1, length = 1.4 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 2.76, at, length * 0.45, { gain: gain * 0.32, attack: 0.002 });
  }
  function thump(at, { freq = 70, gain = 0.35, length = 0.22 } = {}) {
    tone(freq * 2, at, length, { gain, attack: 0.003, slideTo: freq });
  }
  // Marimba: o som de madeira (a nota e um brilho de ~4×, que some depressa).
  function marimba(freq, at, { gain = 0.14, length = 0.55 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 3.93, at, length * 0.2, { gain: gain * 0.28, attack: 0.002 });
  }
  // Gota de tinta: uma bolha curta que sobe.
  function drop(freq, at, { gain = 0.17 } = {}) {
    tone(freq, at, 0.14, { gain, attack: 0.004, slideTo: freq * 2.3 });
  }
  // As notas do arco-íris (escala pentatônica de dó: sempre bonita, nunca desafina).
  const RAINBOW = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
  function rainbow(at, { step = 0.065, gain = 0.12 } = {}) {
    RAINBOW.forEach((f, i) => marimba(f, at + i * step, { gain, length: 0.45 }));
  }

  const sounds = {
    join() {
      drop(420, 0);
      drop(640, 0.1, { gain: 0.14 });
    },
    start() {
      rainbow(0);
      [1047, 1319, 1568].forEach(f => marimba(f, 0.68, { gain: 0.09, length: 0.9 }));
      bell(2093, 0.7, { gain: 0.05, length: 1.2 });
    },
    round() {
      noise(0, 0.38, { gain: 0.09, freq: 500, sweepTo: 3600, q: 1.4 });
      drop(520, 0.3, { gain: 0.15 });
    },
    lastRound() {
      marimba(659, 0, { gain: 0.15 });
      marimba(784, 0.14, { gain: 0.15 });
      marimba(988, 0.28, { gain: 0.16, length: 0.8 });
      bell(1976, 0.3, { gain: 0.05, length: 0.9 });
    },
    cue() {
      bell(1319, 0, { gain: 0.12, length: 0.9 });
      bell(1760, 0.1, { gain: 0.11, length: 1.1 });
    },
    // Rufo de marimba que acelera e cresce por ~1,9 s (a carta fica 2,2 s até o quadro cair).
    card() {
      noise(0, 0.08, { gain: 0.06, freq: 3500, q: 0.8 }); // a carta aparecendo
      const notes = [392, 440, 523, 587, 659, 587, 659, 784, 659, 784, 880, 784, 880, 1047, 880, 1047, 1175, 1047, 1175, 1319];
      let at = 0.04;
      notes.forEach((f, i) => {
        const k = i / (notes.length - 1);
        marimba(f, at, { gain: 0.035 + k * 0.075, length: 0.3 });
        at += 0.13 - k * 0.075;
      });
    },
    burst() {
      thump(0, { freq: 80, gain: 0.28 });
      [523, 659, 784, 1047].forEach(f => marimba(f, 0.01, { gain: 0.08, length: 0.9 }));
      noise(0.02, 0.35, { gain: 0.04, freq: 6000, filter: 'highpass' });
      // confete: notas altas espalhadas (fixas, para soar igual toda vez)
      [2093, 2637, 3136, 2349, 3520, 2637, 4186, 3136, 2349, 3520].forEach((f, i) => bell(f, 0.06 + i * 0.045, { gain: 0.03, length: 0.5 }));
    },
    bullseye() {
      [1568, 2093, 2637, 3136].forEach((f, i) => bell(f, i * 0.07, { gain: 0.08, length: 0.8 }));
    },
    miss() {
      tone(392, 0, 0.32, { type: 'triangle', gain: 0.19, slideTo: 349, lowpass: 1400 });
      tone(330, 0.3, 0.6, { type: 'triangle', gain: 0.19, slideTo: 247, lowpass: 1200 });
    },
    fanfare() {
      rainbow(0, { step: 0.055 });
      // acorde de festa: dó-mi-sol-dó rufando e depois soando
      for (let k = 0; k < 7; k++) [523, 659, 784, 1047].forEach(f => marimba(f, 0.55 + k * 0.085, { gain: 0.035 + k * 0.006, length: 0.4 }));
      [523, 659, 784, 1047].forEach(f => marimba(f, 1.15, { gain: 0.08, length: 1.3 }));
      [2093, 2637, 3136].forEach((f, i) => bell(f, 1.17 + i * 0.08, { gain: 0.045, length: 1.3 }));
      thump(1.15, { freq: 75, gain: 0.22 });
    },
    yourTurn() {
      drop(520, 0);
      drop(780, 0.13, { gain: 0.15 });
      bell(1568, 0.28, { gain: 0.07, length: 0.7 });
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
