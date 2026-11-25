let AC: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!AC) AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  } catch { return null; }
}
if (typeof document !== 'undefined') {
  const unlock = () => { const c = ctx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}
function tone(freq: number, dur = 0.1, type: OscillatorType = 'sine', gain = 0.08, when = 0, slideTo?: number) {
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur = 0.15, gain = 0.12, filterFreq = 900, when = 0) {
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t0);
}
function coin(when = 0) { tone(1900 + Math.random() * 700, 0.07, 'sine', 0.06, when); tone(3200 + Math.random() * 500, 0.05, 'sine', 0.03, when + 0.01); }
export const sfx = {
  click: () => { tone(700, 0.04, 'square', 0.04); tone(1400, 0.03, 'sine', 0.03, 0.01); },
  bang: () => { noise(0.22, 0.16, 700); tone(110, 0.2, 'sawtooth', 0.1, 0, 55); },
  squeak: () => { tone(900, 0.07, 'sine', 0.06, 0, 1700); tone(2400, 0.05, 'sine', 0.03, 0.06); },
  cash: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.08));
    for (let i = 0; i < 10; i++) coin(0.15 + i * 0.06);
    tone(2093, 0.3, 'sine', 0.04, 0.35);
  },
  bust: () => { tone(320, 0.35, 'sawtooth', 0.1, 0, 70); noise(0.3, 0.14, 400, 0.05); },
  laugh: () => { [950, 1150, 1000, 1250, 1100].forEach((f, i) => tone(f, 0.06, 'sine', 0.05, i * 0.09)); },
};
