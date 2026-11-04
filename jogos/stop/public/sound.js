// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// O CLIMA: programa de auditório — campainha, a roleta clicando, metais da banda
// ("tcharam!"), o apito do apresentador, a buzina do tempo, rufar de tambor, o placar
// de LED e a plateia aplaudindo no fim.
// Padrão Resistência (a referência): na TV, o som das revelações toca DENTRO da
// animação (tv.js, na hora em que a letra para / o carimbo bate), não quando o lance
// chega do servidor.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os momentos
// que todos precisam perceber; nada por ação repetida (cada letra digitada, cada voto
// contra). O celular do Stop não toca som.
//
// PRIVACIDADE: só existe som para o que é público (ninguém ouve o que o outro escreveu).
import { ROULETTE_STEPS } from './stop.js';

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'Alguém entrou na sala', 'campainha "plim-plim"'],
  ['roulette', 'A roleta sorteando a letra', 'cliques desacelerando'],
  ['letter', 'A letra parou', '"tcharam!" da banda e o prato'],
  ['stop', 'Alguém deu STOP!', 'apito do apresentador e a banda'],
  ['tick', 'A contagem 3, 2, 1 depois do STOP', 'bloco de madeira'],
  ['timeUp', 'Acabou o tempo (ninguém deu STOP)', 'buzina'],
  ['review', 'Começa a correção', 'rufar de tambor e o prato'],
  ['points', 'Os pontos de uma categoria', '"plim" subindo (e "é-é" se alguma não valeu)'],
  ['scores', 'O placar da rodada', 'placar de LED contando'],
  ['fanfare', 'Fim de jogo', 'fanfarra e a plateia aplaudindo'],
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
      // 1 segundo de ruído branco, para prato, tambor, palmas, cliques...
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

  // Peças para montar sons: tom (`lowpass` abafa; `hold` = parte do tempo em que fica
  // no volume cheio antes de sumir), ruído filtrado, pancada grave, sino.
  function tone(freq, at, duration, { type = 'sine', gain = 0.2, attack = 0.01, slideTo = null, lowpass = null, hold = 0 } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration * 0.8);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (hold) env.gain.setValueAtTime(gain, t + duration * hold);
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

  function bell(freq, at, { gain = 0.1, length = 1.4 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 2.76, at, length * 0.45, { gain: gain * 0.32, attack: 0.002 });
  }
  function thump(at, { freq = 70, gain = 0.35, length = 0.22 } = {}) {
    tone(freq * 2, at, length, { gain, attack: 0.003, slideTo: freq });
  }

  // Metais da banda do programa: duas serras um pouco desafinadas, com o filtro abrindo
  // no ataque (o "bláu" do trompete).
  function brass(freq, at, duration, { gain = 0.06 } = {}) {
    const t = ctx.currentTime + at;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 5, t + 0.06);
    filter.frequency.exponentialRampToValueAtTime(freq * 2.5, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    env.gain.exponentialRampToValueAtTime(gain * 0.7, t + duration * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(env).connect(master);
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  // Prato de bateria.
  function crash(at, { gain = 0.1, length = 1.6 } = {}) {
    noise(at, length, { gain, freq: 6500, q: 0.5, filter: 'highpass', attack: 0.002 });
    noise(at, 0.25, { gain: gain * 0.8, freq: 3500, q: 0.8, attack: 0.002 });
  }

  // Apito do apresentador: assobio agudo tremido + o sopro.
  function whistle(at, duration, { gain = 0.09 } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const trill = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.frequency.value = 2650;
    trill.frequency.value = 26;
    depth.gain.value = 150;
    trill.connect(depth).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    env.gain.setValueAtTime(gain, t + duration * 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(master);
    for (const node of [osc, trill]) {
      node.start(t);
      node.stop(t + duration + 0.05);
    }
    noise(at, duration, { gain: gain * 0.3, freq: 2600, q: 4, attack: 0.02 });
  }

  // Rufar de caixa, crescendo.
  function drumroll(at, length, { gain = 0.14 } = {}) {
    const hits = Math.round(length * 28);
    for (let i = 0; i < hits; i++) {
      const loud = 0.25 + 0.75 * (i / hits);
      noise(at + i / 28, 0.07, { gain: gain * loud, freq: 2400, q: 0.7, attack: 0.002 });
    }
  }

  // A plateia aplaudindo: muitas palmas soltas em cima de um "chiado" de gente.
  function applause(at, length, { gain = 0.08 } = {}) {
    noise(at, length, { gain: gain * 0.45, freq: 1800, q: 0.4, attack: 0.3 });
    const claps = Math.round(length * 45);
    for (let i = 0; i < claps; i++) {
      const when = Math.random() * length * 0.9;
      const fade = 1 - when / length;
      noise(at + when, 0.04, { gain: gain * (0.4 + Math.random() * 0.6) * (0.3 + 0.7 * fade), freq: 1200 + Math.random() * 1600, q: 1.5, attack: 0.002 });
    }
  }

  const sounds = {
    join() {
      bell(1319, 0, { gain: 0.12, length: 0.9 });
      bell(1760, 0.13, { gain: 0.12, length: 1.1 });
    },
    // `steps` = ms entre uma letra e a próxima (a TV manda os mesmos da animação)
    roulette(steps = ROULETTE_STEPS) {
      let at = 0;
      for (const ms of steps.slice(0, -1).concat(0)) {
        noise(at, 0.03, { gain: 0.22, freq: 3600, q: 3, attack: 0.001 });
        tone(2200, at, 0.025, { type: 'square', gain: 0.03, attack: 0.001 });
        at += ms / 1000;
      }
    },
    letter() {
      [392, 494, 587].forEach(f => brass(f, 0, 0.16, { gain: 0.05 }));
      [523, 659, 784, 1047].forEach(f => brass(f, 0.17, 0.9, { gain: 0.05 }));
      crash(0.17, { gain: 0.09 });
      thump(0.17, { freq: 60, gain: 0.3 });
    },
    stop() {
      whistle(0, 0.45);
      [466, 587, 698].forEach(f => brass(f, 0.42, 0.5, { gain: 0.06 }));
      crash(0.42, { gain: 0.11 });
      thump(0.42, { freq: 55, gain: 0.35 });
    },
    // `n` = o número da contagem (o 1 é mais agudo)
    tick(n = 2) {
      const freq = n === 1 ? 1400 : 1000;
      tone(freq, 0, 0.18, { type: 'triangle', gain: 0.26, attack: 0.002 });
      tone(freq / 2, 0, 0.14, { gain: 0.14, attack: 0.002 }); // o corpo do bloco de madeira
      noise(0, 0.03, { gain: 0.12, freq: freq * 2, q: 3, attack: 0.001 });
    },
    timeUp() {
      tone(92, 0, 0.95, { type: 'square', gain: 0.1, lowpass: 1500, hold: 0.8 });
      tone(97, 0, 0.95, { type: 'sawtooth', gain: 0.08, lowpass: 1500, hold: 0.8 });
    },
    review() {
      drumroll(0, 1.0);
      crash(1.0, { gain: 0.09 });
      thump(1.0, { freq: 60, gain: 0.3 });
      [523, 659, 784].forEach(f => brass(f, 1.0, 0.6, { gain: 0.045 }));
    },
    // `excluded` = alguma resposta da categoria não valeu (vem o "é-é" depois)
    points(excluded = false) {
      [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.09, { gain: 0.1, length: 0.7 }));
      if (excluded) {
        tone(150, 0.55, 0.16, { type: 'square', gain: 0.07, lowpass: 900, hold: 0.7 });
        tone(150, 0.76, 0.26, { type: 'square', gain: 0.07, lowpass: 900, hold: 0.7 });
      }
    },
    scores() {
      for (let i = 0; i < 12; i++) tone(600 + i * 70, i * 0.05, 0.05, { type: 'square', gain: 0.035, lowpass: 3000, attack: 0.002 });
      bell(1568, 0.62, { gain: 0.1, length: 1.0 });
      bell(2093, 0.62, { gain: 0.06, length: 1.0 });
    },
    fanfare() {
      const melody = [[392, 0, 0.14], [523, 0.15, 0.14], [659, 0.3, 0.14], [784, 0.45, 0.4], [659, 0.88, 0.14], [784, 1.03, 1.3]];
      for (const [freq, at, length] of melody) {
        brass(freq, at, length, { gain: 0.06 });
        brass(freq / 2, at, length, { gain: 0.03 });
      }
      [523, 659].forEach(f => brass(f, 1.03, 1.3, { gain: 0.035 }));
      crash(1.03, { gain: 0.11, length: 2 });
      thump(1.03, { freq: 55, gain: 0.35 });
      applause(0.9, 3.2);
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
