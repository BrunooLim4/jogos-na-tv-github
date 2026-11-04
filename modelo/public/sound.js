// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// ESTILO PADRÃO: só 4 bipes neutros (alguém entrou, começou, sua vez, fim).
// Padrão Resistência (a referência): na TV, o som das revelações toca DENTRO da
// animação (tv.js, na hora em que a carta vira / o carimbo bate), não quando o
// lance chega do servidor.
// Os sons de verdade nascem na personalidade de cada jogo, no clima dele
// (Trilhos a Vapor: trem; Dixit: harpa e caixinha de música) — nunca copiar
// os de outro jogo.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os
// momentos que todos precisam perceber; nada por ação repetida (cada carta,
// cada voto, cada peça andando). Celular só toca quando é a vez daquela pessoa.
//
// PRIVACIDADE: só existe som para o que é público. Nada pode depender de
// segredo (carta comprada, objetivo cumprido, voto...).

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'Alguém entrou na sala', 'dois bipes'],
  ['start', 'A partida começou', 'três notas subindo'],
  ['yourTurn', 'Celular: sua vez', 'duas notas'],
  ['fanfare', 'Fim de jogo', 'acorde'],
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
      // 1 segundo de ruído branco, para sons de carta, papel, vento...
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

  // Peças para montar sons: tom (com `lowpass` para abafar: metais, baixo),
  // ruído filtrado (spray, cartas, prato, estática), pancada grave (carimbo,
  // coração, bumbo), corda dedilhada e sino.
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

  function noise(at, duration, { gain = 0.15, freq = 2000, q = 1, filter = 'bandpass', attack = 0.005 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true; // ruído mais longo que 1 s não corta
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

  function pluck(freq, at, { gain = 0.1, length = 0.7 } = {}) {
    tone(freq, at, length, { type: 'triangle', gain, attack: 0.004 });
    tone(freq * 2, at, length * 0.45, { gain: gain * 0.35, attack: 0.003 });
  }

  function bell(freq, at, { gain = 0.1, length = 1.4 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 2.76, at, length * 0.45, { gain: gain * 0.32, attack: 0.002 });
  }
  function thump(at, { freq = 70, gain = 0.35, length = 0.22 } = {}) {
    tone(freq * 2, at, length, { gain, attack: 0.003, slideTo: freq });
  }
  void noise; void pluck; void bell; void thump; // peças prontas para os sons do jogo

  const sounds = {
    join() {
      tone(784, 0, 0.18, { gain: 0.16 });
      tone(1175, 0.1, 0.25, { gain: 0.14 });
    },
    start() {
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.35, { gain: 0.14 }));
    },
    yourTurn() {
      tone(880, 0, 0.14, { gain: 0.16 });
      tone(1320, 0.12, 0.22, { gain: 0.14 });
    },
    fanfare() {
      [523, 659, 784, 1047].forEach(f => tone(f, 0, 1.2, { type: 'triangle', gain: 0.08, attack: 0.02 }));
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
