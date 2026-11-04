// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// CLIMA "CIDADE EM REVOLTA": lata de spray da pichação, baralho embaralhando,
// carimbo, coração batendo, choque elétrico, sirene, tambores e rádio
// comunicador. Feitos só para este jogo — nunca copiar os de outro jogo.
//
// Na TV, os sons acompanham as ANIMAÇÕES (tv.js toca cada um na hora certa da
// revelação), não o momento em que o lance chega do servidor.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os
// momentos que todos precisam perceber. Nada por ação repetida: votar, montar o
// time, a ficha de comanda passando e as cartas de Sucesso virando não têm som.
// Celular só toca para quem passa a comandar.
//
// PRIVACIDADE: só existe som para o que é público (o que a TV já mostra). A
// escolha da missão no celular não tem som nenhum.

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'Um recruta entrou na sala', 'lata de spray chacoalhando e o "psssh"'],
  ['deal', 'A partida começou: as cartas são distribuídas', 'baralho embaralhando e um baque grave'],
  ['approved', 'Time aprovado', 'carimbo e duas notas de metal subindo'],
  ['rejected', 'Time recusado', 'carimbo e um zumbido grave de "negado"'],
  ['tension', 'As cartas da missão vão para o meio da mesa', 'coração batendo'],
  ['sabotage', 'Virou uma carta de sabotagem', 'choque elétrico'],
  ['missionOk', 'Missão cumprida', 'acorde de vitória com prato'],
  ['missionFail', 'Missão sabotada', 'sirene descendo'],
  ['resistanceWins', 'A Resistência venceu', 'tambores e o hino da Resistência'],
  ['spiesWin', 'Os espiões venceram', 'acorde sombrio com interferência de rádio'],
  ['yourTurn', 'Celular de quem passa a comandar', 'bipe de rádio comunicador'],
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
      // 1 segundo de ruído branco (repete), para spray, cartas, estática, prato...
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

  // ------------------------------------------------ peças para montar os sons

  // Tom que some aos poucos; `lowpass` abafa (metais, baixo).
  function tone(freq, at, duration, { type = 'sine', gain = 0.2, attack = 0.01, slideTo = null, lowpass = null } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration * 0.85);
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

  function noise(at, duration, { gain = 0.15, freq = 2000, q = 1, filter = 'bandpass', attack = 0.005 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = freq;
    biquad.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(biquad).connect(env).connect(master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + duration + 0.05);
  }

  // Pancada grave (carimbo, coração, bumbo): tom que cai rápido.
  function thump(at, { freq = 70, gain = 0.35, length = 0.22 } = {}) {
    tone(freq * 2, at, length, { gain, attack: 0.003, slideTo: freq });
  }

  // Caixa do tambor: estalo de ruído com um corpo curto.
  function snare(at, gain = 0.16) {
    noise(at, 0.16, { filter: 'highpass', freq: 1800, gain, attack: 0.002 });
    tone(190, at, 0.09, { type: 'triangle', gain: gain * 0.7, attack: 0.002 });
  }

  // Metais (hino, carimbo aprovado).
  function brass(freq, at, length, { gain = 0.07, attack = 0.03, lowpass = 1800 } = {}) {
    tone(freq, at, length, { type: 'sawtooth', gain, attack, lowpass });
    tone(freq * 1.005, at, length, { type: 'sawtooth', gain: gain * 0.6, attack, lowpass });
  }

  const cymbal = (at, length = 1.2, gain = 0.06) => noise(at, length, { filter: 'highpass', freq: 6000, gain, attack: 0.004 });

  // ------------------------------------------------ os sons do jogo

  const sounds = {
    // A lata de spray chacoalha (a bolinha batendo) e pichou: "psssh".
    join() {
      [0, 0.075, 0.15, 0.225].forEach(at => {
        noise(at, 0.03, { freq: 3800, q: 6, gain: 0.35, attack: 0.001 });
        tone(2400, at, 0.04, { type: 'triangle', gain: 0.05, attack: 0.001 });
      });
      noise(0.36, 0.55, { filter: 'highpass', freq: 4500, gain: 0.16, attack: 0.04 });
    },
    // Baralho embaralhando (estalos cada vez mais rápidos) e um baque grave.
    deal() {
      let at = 0;
      for (let k = 0; k < 22; k++) {
        noise(at, 0.022, { freq: 2600 + Math.random() * 1400, q: 1.6, gain: 0.22, attack: 0.001 });
        at += 0.045 - k * 0.0013;
      }
      thump(0.78, { freq: 48, gain: 0.45, length: 0.5 });
      [110, 164.8, 220].forEach(f => brass(f, 0.78, 1.1, { gain: 0.045, attack: 0.02, lowpass: 900 }));
    },
    // Carimbo na mesa e duas notas de metal subindo.
    approved() {
      thump(0, { freq: 80, gain: 0.32, length: 0.18 });
      noise(0, 0.06, { filter: 'lowpass', freq: 700, gain: 0.2, attack: 0.002 });
      brass(392, 0.16, 0.3, { gain: 0.07 });
      brass(587.3, 0.34, 0.55, { gain: 0.07 });
    },
    // Carimbo e um zumbido grave ("negado").
    rejected() {
      thump(0, { freq: 70, gain: 0.35, length: 0.2 });
      noise(0, 0.06, { filter: 'lowpass', freq: 600, gain: 0.2, attack: 0.002 });
      tone(98, 0.16, 0.55, { type: 'square', gain: 0.08, attack: 0.01, lowpass: 650 });
      tone(103, 0.16, 0.55, { type: 'square', gain: 0.06, attack: 0.01, lowpass: 650 });
    },
    // Coração batendo (tum-tum) quatro vezes, enquanto as cartas embaralham.
    tension() {
      for (let beat = 0; beat < 4; beat++) {
        const at = beat * 0.78;
        thump(at, { freq: 52, gain: 0.42, length: 0.2 });
        thump(at + 0.19, { freq: 46, gain: 0.3, length: 0.22 });
      }
    },
    // Choque elétrico: estalos picotados e um zap descendo.
    sabotage() {
      for (let k = 0; k < 6; k++) noise(k * 0.035, 0.03, { freq: 1300 + k * 300, q: 2, gain: 0.3, attack: 0.001 });
      tone(1400, 0, 0.45, { type: 'square', gain: 0.12, attack: 0.002, slideTo: 140, lowpass: 2500 });
      thump(0.02, { freq: 55, gain: 0.4, length: 0.3 });
    },
    // Acorde de vitória com prato.
    missionOk() {
      [261.6, 329.6, 392, 523.3].forEach(f => brass(f, 0, 1.3, { gain: 0.045, attack: 0.02, lowpass: 2400 }));
      thump(0, { freq: 60, gain: 0.3, length: 0.3 });
      cymbal(0, 1.2);
    },
    // Sirene descendo (duas vezes) sobre um baque.
    missionFail() {
      thump(0, { freq: 50, gain: 0.38, length: 0.4 });
      tone(880, 0.05, 0.6, { type: 'sawtooth', gain: 0.06, attack: 0.02, slideTo: 330, lowpass: 1600 });
      tone(880, 0.62, 0.7, { type: 'sawtooth', gain: 0.05, attack: 0.02, slideTo: 260, lowpass: 1400 });
    },
    // Tambores marchando e o hino subindo até um acorde aberto.
    resistanceWins() {
      [0, 0.22, 0.44].forEach(at => snare(at));
      thump(0, { freq: 55, gain: 0.32, length: 0.25 });
      thump(0.44, { freq: 55, gain: 0.32, length: 0.25 });
      [[196, 0.66], [261.6, 0.88], [329.6, 1.1]].forEach(([f, at]) => brass(f, at, 0.3, { gain: 0.06 }));
      [261.6, 329.6, 392, 523.3].forEach(f => brass(f, 1.32, 1.6, { gain: 0.045, attack: 0.04, lowpass: 2600 }));
      thump(1.32, { freq: 50, gain: 0.4, length: 0.5 });
      cymbal(1.32, 1.5, 0.07);
    },
    // Acorde sombrio, interferência de rádio e uma descida em menor.
    spiesWin() {
      [82.4, 87.3, 116.5].forEach(f => brass(f, 0, 2.2, { gain: 0.06, attack: 0.25, lowpass: 800 }));
      for (let k = 0; k < 5; k++) noise(0.2 + k * 0.17, 0.08, { freq: 900 + Math.random() * 1800, q: 3, gain: 0.12, attack: 0.002 });
      [[659.3, 0.3], [523.3, 0.6], [440, 0.9], [349.2, 1.2]].forEach(([f, at]) => tone(f, at, 0.5, { type: 'triangle', gain: 0.07, attack: 0.01 }));
      thump(0, { freq: 45, gain: 0.4, length: 0.6 });
    },
    // Rádio comunicador: um chiado e o bipe duplo subindo.
    yourTurn() {
      noise(0, 0.12, { freq: 2500, q: 0.6, gain: 0.2, attack: 0.005 });
      tone(1800, 0.06, 0.08, { type: 'square', gain: 0.18, attack: 0.003, lowpass: 3000 });
      tone(2400, 0.15, 0.1, { type: 'square', gain: 0.18, attack: 0.003, lowpass: 3000 });
      noise(0.27, 0.2, { freq: 2200, q: 0.6, gain: 0.12, attack: 0.01 });
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
