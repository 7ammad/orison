// All the page's sound, made in the browser: a drone, a choir whose chord follows the journey, the beat, a clock that
// quickens near the heart, glass bells under the cursor. Starts on the first click, because browsers require that.

const NOTE = {C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2};
const hz = (name) => {
  let rest = name.slice(1);
  let shift = 0;
  while (rest[0] === '#' || rest[0] === 'b') {
    shift += rest[0] === '#' ? 1 : -1;
    rest = rest.slice(1);
  }
  return 440 * 2 ** ((NOTE[name[0]] + shift + 12 * (Number(rest) - 4)) / 12);
};

// one chord per stretch of the journey, the same harmony as the film's score
const CHORDS = [
  ['D2', 'A2', 'F#3', 'A3', 'E4'],
  ['D3', 'A3', 'E4', 'F4', 'A4'],
  ['Bb2', 'F3', 'D4', 'A4', 'D5'],
  ['G2', 'D3', 'Bb3', 'F4', 'G4'],
  ['A2', 'E3', 'C#4', 'G4', 'A4'],
];

export function createAudio() {
  let ctx = null;
  let master;
  let wet;
  let voices = [];
  let on = true;
  let nextTick = 0;
  let side = -1;
  let chordIdx = -1;

  const impulse = (dur, decay) => {
    const n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  };

  const start = () => {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.9);
    master.connect(comp).connect(ctx.destination);
    const conv = ctx.createConvolver();
    conv.buffer = impulse(4.2, 2.6);
    wet = ctx.createGain();
    wet.gain.value = 0.55;
    conv.connect(wet).connect(master);
    const send = ctx.createGain();
    send.gain.value = 1;
    send.connect(conv);
    ctx.__send = send;

    // the drone
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 170;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.2;
    lowpass.connect(droneGain).connect(master);
    for (const f of [hz('D1'), hz('A1') * 1.002, hz('D2') * 0.998]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lowpass);
      o.start();
    }

    // the choir: two detuned saws per note, a vowel on top
    const choirIn = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1500;
    const ah = ctx.createBiquadFilter();
    ah.type = 'bandpass';
    ah.frequency.value = 700;
    ah.Q.value = 2.4;
    const choirGain = ctx.createGain();
    choirGain.gain.value = 0.05;
    choirIn.connect(low).connect(choirGain);
    choirIn.connect(ah).connect(choirGain);
    choirGain.connect(master);
    choirGain.connect(send);
    voices = [];
    for (let i = 0; i < 5; i++) {
      for (const d of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d + Math.random() * 3;
        o.frequency.value = hz(CHORDS[0][i]);
        const g = ctx.createGain();
        g.gain.value = 0.22 / (1 + i * 0.15);
        o.connect(g).connect(choirIn);
        o.start();
        voices.push({o, i});
      }
    }
    chordIdx = 0;
  };

  const boom = (level = 1) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(31, t + 0.28);
    const o2 = ctx.createOscillator();
    o2.frequency.setValueAtTime(190, t);
    o2.frequency.exponentialRampToValueAtTime(62, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95 * level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(master);
    g.connect(ctx.__send);
    o.start(t);
    o2.start(t);
    o.stop(t + 2.7);
    o2.stop(t + 2.7);
    // the dark air it pushes
    const n = Math.floor(ctx.sampleRate * 0.5);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.1));
    const src = ctx.createBufferSource();
    src.buffer = b;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const ng = ctx.createGain();
    ng.gain.value = 0.4 * level;
    src.connect(lp).connect(ng);
    ng.connect(master);
    ng.connect(ctx.__send);
    src.start(t);
  };

  const bell = (f, level = 0.05) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [ratio, g0, tau] of [[1, 1, 0.8], [2.01, 0.45, 0.46], [3.02, 0.22, 0.26]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * g0, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + tau * 3);
      o.connect(g);
      g.connect(master);
      g.connect(ctx.__send);
      o.start(t);
      o.stop(t + tau * 3 + 0.05);
    }
  };

  const tick = (level) => {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 1500 + Math.random() * 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const p = ctx.createStereoPanner();
    side = -side;
    p.pan.value = side * 0.45;
    o.connect(g).connect(p);
    p.connect(master);
    p.connect(ctx.__send);
    o.start(t);
    o.stop(t + 0.06);
  };

  /** Called each frame with the journey position: picks the chord, and the clock near the heart. */
  const update = (s, now) => {
    if (!ctx) return;
    const want = s < 0.16 ? 0 : s < 0.5 ? 1 : s < 0.74 ? 2 : s < 0.9 ? 3 : 4;
    if (want !== chordIdx) {
      chordIdx = want;
      for (const {o, i} of voices) o.frequency.setTargetAtTime(hz(CHORDS[want][i]), ctx.currentTime, 0.5);
    }
    const near = Math.max(0, (s - 0.78) / 0.22);
    if (near > 0 && on && now > nextTick) {
      tick(0.03 + near * 0.05);
      nextTick = now + 1 / (1.4 + near * near * 11);
    }
  };

  const toggle = () => {
    on = !on;
    if (ctx) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.12);
    return on;
  };

  return {start, boom, bell, update, toggle, isOn: () => on};
}
