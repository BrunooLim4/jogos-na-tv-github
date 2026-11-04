// Sons gerados na hora pelo navegador (Web Audio), sem arquivos.
//
// CLIMA "OPERAÇÃO SOMBRAS" (espionagem): clique de câmera, máquina de
// escrever, carimbo, tiro com silenciador, rádio em código Morse e o baixo de
// filme de espião. Feitos só para este jogo — nunca copiar os de outro jogo.
//
// POUCOS SONS (o Bruno: "muitos sons sem necessidade, fica chato"): só os
// momentos que todos precisam perceber. Acertar uma palavra e apontar não têm
// som (acontecem muitas vezes por partida); errar tem, porque a vez passa para
// o outro time. Celular só toca para o chefe, na hora de dar a dica.
//
// PRIVACIDADE: só existe som para o que é público. Nada pode depender de
// segredo (o mapa de cores dos chefes).

// Os sons, quando tocam e o que são (a página /sons usa esta lista).
export const SOUND_LIST = [
  ['join', 'Um agente entrou na sala', 'clique de câmera (a foto da ficha)'],
  ['start', 'A missão começou', 'baixo de filme de espião'],
  ['clue', 'O chefe deu a dica', 'máquina de escrever e o "plim" do fim da linha'],
  ['miss', 'Errou: a vez passa para o outro time', 'carimbo e duas notas graves'],
  ['assassin', 'Revelaram o assassino', 'tiro com silenciador e um acorde de susto'],
  ['victory', 'Um time venceu', 'guitarra de espião e o acorde de "missão cumprida"'],
  ['yourTurn', 'Celular do chefe: sua vez de dar a dica', 'rádio em código Morse'],
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
      // 1 segundo de ruído branco (repete), para estalos, papel, prato, estática...
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

  // Bipe reto (liga, segura, desliga), para o código Morse do rádio.
  function beep(freq, at, length, { gain = 0.12 } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.006);
    env.gain.setValueAtTime(gain, t + length - 0.012);
    env.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(filter).connect(env).connect(master);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  // Pancada grave (carimbo, mesa): tom que cai rápido.
  function thump(at, { freq = 90, gain = 0.3, length = 0.2 } = {}) {
    tone(freq * 1.8, at, length, { gain, attack: 0.002, slideTo: freq });
  }

  // Tecla da máquina de escrever: o tipo estala no papel.
  function key(at, gain = 0.3) {
    noise(at, 0.035, { freq: 2800 + Math.random() * 900, q: 1.4, gain, attack: 0.001 });
    thump(at, { freq: 160, gain: gain * 0.5, length: 0.06 });
  }

  function bell(freq, at, { gain = 0.1, length = 1.4 } = {}) {
    tone(freq, at, length, { gain, attack: 0.003 });
    tone(freq * 2.76, at, length * 0.45, { gain: gain * 0.32, attack: 0.002 });
  }

  // Contrabaixo dedilhado.
  function bass(freq, at, { gain = 0.2, length = 0.4 } = {}) {
    tone(freq, at, length, { type: 'triangle', gain, attack: 0.006, lowpass: 900 });
    tone(freq * 2, at, length * 0.5, { type: 'sawtooth', gain: gain * 0.25, attack: 0.004, lowpass: 1200 });
  }

  // Metais abafados (acordes de suspense).
  function brass(freq, at, length, { gain = 0.06, attack = 0.03, lowpass = 1400 } = {}) {
    tone(freq, at, length, { type: 'sawtooth', gain, attack, lowpass });
  }

  // Guitarra elétrica de filme de espião (corda metálica).
  function guitar(freq, at, { gain = 0.07, length = 0.5 } = {}) {
    tone(freq, at, length, { type: 'sawtooth', gain, attack: 0.004, lowpass: 2400 });
  }

  const hat = at => noise(at, 0.06, { filter: 'highpass', freq: 7000, gain: 0.05, attack: 0.002 });

  // ------------------------------------------------ os sons do jogo

  const sounds = {
    // Clique de câmera: o espelho sobe e desce, e o filme avança.
    join() {
      noise(0, 0.02, { freq: 4500, q: 0.8, gain: 0.5, attack: 0.001 });
      thump(0, { freq: 220, gain: 0.18, length: 0.05 });
      noise(0.08, 0.025, { freq: 3200, q: 0.8, gain: 0.42, attack: 0.001 });
      noise(0.16, 0.22, { freq: 1400, q: 5, gain: 0.1, attack: 0.03 });
    },
    // O baixo anda na ponta dos pés (mi, si, mi, sol, lá) e fecha num acorde abafado.
    start() {
      [[82.4, 0], [61.7, 0.2], [82.4, 0.4], [98, 0.6], [110, 0.8]].forEach(([f, at]) => bass(f, at));
      [0.1, 0.3, 0.5, 0.7].forEach(hat);
      bass(82.4, 1.0, { length: 0.8 });
      [164.8, 196, 246.9, 293.7].forEach(f => brass(f, 1.0, 0.7, { gain: 0.05, attack: 0.015 }));
    },
    // A máquina de escrever bate a dica e dá o "plim" do fim da linha.
    clue() {
      [0, 0.09, 0.16, 0.27, 0.35, 0.46].forEach(at => key(at));
      bell(2093, 0.62, { gain: 0.08, length: 1.1 });
    },
    // Carimbo na ficha e duas notas graves descendo.
    miss() {
      thump(0, { freq: 70, gain: 0.35, length: 0.22 });
      noise(0, 0.08, { filter: 'lowpass', freq: 600, gain: 0.2, attack: 0.002 });
      brass(146.8, 0.22, 0.4, { gain: 0.09, lowpass: 700 });
      brass(103.8, 0.58, 0.8, { gain: 0.09, lowpass: 600 });
    },
    // "Pft" do silenciador e um acorde de susto que fica no ar.
    assassin() {
      noise(0, 0.1, { filter: 'lowpass', freq: 1800, gain: 0.4, attack: 0.001 });
      noise(0, 0.015, { freq: 5000, q: 1, gain: 0.2, attack: 0.001 });
      thump(0, { freq: 55, gain: 0.3, length: 0.18 });
      [82.4, 87.3, 116.5, 174.6].forEach(f => brass(f, 0.3, 2.0, { gain: 0.07, attack: 0.04, lowpass: 900 }));
      tone(1244, 0.3, 1.6, { gain: 0.03, attack: 0.05, slideTo: 1174 });
    },
    // A guitarra sobe e o acorde de "missão cumprida" (mi menor com sétima
    // maior e nona) fica soando com o prato.
    victory() {
      [329.6, 392, 493.9, 622.3].forEach((f, i) => guitar(f, i * 0.1));
      bass(82.4, 0.45, { length: 1.4, gain: 0.22 });
      [164.8, 196, 246.9, 311.1, 370].forEach(f => brass(f, 0.45, 2.2, { gain: 0.045, attack: 0.06, lowpass: 1800 }));
      noise(0.45, 1.6, { filter: 'highpass', freq: 5000, gain: 0.05, attack: 0.01 });
    },
    // Rádio em código Morse ("· · —") com um chiado de estática.
    yourTurn() {
      noise(0, 0.6, { freq: 1500, q: 0.5, gain: 0.025, attack: 0.02 });
      beep(1000, 0.04, 0.07);
      beep(1000, 0.18, 0.07);
      beep(1000, 0.32, 0.24);
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
