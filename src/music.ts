let AC: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!AC) AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  } catch { return null; }
}
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 132;
const STEP = 60 / BPM / 4; // sixteenths
const BAR_ROOTS = [33, 33, 29, 28];                    // A1 A1 F1 E1 (tension climb)
const BAR_CHORDS = [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]];
const MELODY: Record<number, number> = { 8: 76, 14: 75, 40: 73, 46: 72, 56: 71, 62: 75 };
let step = 0;
let nextTime = 0;
let timer: any = null;

function note(freq: number, t0: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const c = ctx(); if (!c) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  const c = ctx(); if (!c) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(c.destination); s.start(t0);
}
function playStep(s: number, t0: number) {
  const bar = Math.floor(s / 16) % 4;
  const b = s % 16;
  const root = BAR_ROOTS[bar];
  const ch = BAR_CHORDS[bar];
  if (s === 0) { note(50, t0, 0.5, 'sine', 0.1); noise(t0, 0.45, 0.05, 'lowpass', 900); }   // impact boom + crash
  if (b % 2 === 0) note(hz(root), t0, 0.14, 'sawtooth', b === 0 || b === 8 ? 0.055 : 0.04);  // driving bass
  if (b === 14) note(hz(root + 12), t0, 0.1, 'sawtooth', 0.035);                              // pickup push
  note(hz(ch[s % 3] + 12), t0, 0.09, 'square', 0.013);                                       // tremolo arp
  noise(t0, 0.03, b % 4 === 2 ? 0.012 : 0.006, 'highpass', 6500);                            // tight hats
  if (b === 4 || b === 12) noise(t0, 0.12, 0.05, 'bandpass', 1800);                          // snare crack
  if (b === 0 || b === 8 || (bar >= 2 && b === 10)) note(120, t0, 0.12, 'sine', 0.09, 45);   // kick
  if ((bar === 1 && b === 0) || (bar === 3 && (b === 0 || b === 6)))                          // stabs
    ch.forEach((m) => note(hz(m + 12), t0, 0.13, 'sawtooth', 0.035));
  if (s === 48) note(180, t0, 16 * STEP * 0.95, 'sawtooth', 0.018, 760);                     // riser into the loop
  const mel = MELODY[s];
  if (mel) note(hz(mel), t0, 0.24, 'square', 0.02);                                          // sparse tension motif
}
function schedule() {
  const c = ctx(); if (!c) return;
  while (nextTime < c.currentTime + 0.25) {
    playStep(step, t0safe(nextTime));
    nextTime += STEP;
    step = (step + 1) % 64;
  }
}
function t0safe(t: number) { const c = ctx(); return c && t < c.currentTime ? c.currentTime : t; }
function start() {
  const c = ctx(); if (!c || timer) return;
  nextTime = c.currentTime + 0.1;
  timer = setInterval(schedule, 110);
}
if (typeof document !== 'undefined') {
  const unlock = () => { const c = ctx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); start(); };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}
