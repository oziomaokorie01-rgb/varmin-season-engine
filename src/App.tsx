import { useEffect, useMemo, useRef, useState } from 'react';
import { connectGameToHost } from '@chain-protocol/casino-sdk/guest';
import { compileGraphGame, encodePlainGameData } from '@chain-protocol/casino-sdk/graph-engine';
import { encodeAbiParameters, parseUnits, formatUnits } from 'viem';
import title from './title';
import './music';

const GUNS = [
  { name: 'OLD SINGLE-SHOT', farmers: 1, rats: 5, ladder: [1.15, 1.44, 1.92, 2.88, 5.76], tag: 'One farmer in the barn. Steady money.' },
  { name: 'DOUBLE-BARREL', farmers: 2, rats: 4, ladder: [1.44, 2.4, 4.8, 14.4], tag: 'Two farmers. Real greed territory.' },
  { name: 'THE JUDGE', farmers: 3, rats: 3, ladder: [1.92, 4.8, 19.2], tag: 'Three farmers. Nineteen times or nothing.' },
];
const KILL_LINES = ['Rat down. The barn approves.', 'Clean shot. Feathers everywhere.', 'That one owed money.', 'Squeak. Silence. Profit.'];
const CASH_LINES = ['You walk away jingling. Smart.', 'Pocketed. The rats whisper about you.', 'Cash out clean. Season continues.'];
const BUST_LINES = ["THUD. That wasn't a rat.", 'The farmer stands up slowly.', 'You just shot the man who signs your checks.'];

let AC: AudioContext | null = null;
function beep(freq: number, dur = 0.08, type: OscillatorType = 'triangle', gain = 0.07) {
  try {
    AC = AC || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = AC.createOscillator(); const g = AC.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(AC.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.stop(AC.currentTime + dur);
  } catch { /* optional */ }
}
const sfx = {
  click: () => beep(500, 0.05, 'square'),
  bang: () => { beep(120, 0.18, 'sawtooth', 0.12); setTimeout(() => beep(60, 0.22, 'sawtooth', 0.1), 30); },
  squeak: () => beep(1400, 0.09, 'sine', 0.05),
  cash: () => { beep(784, 0.09); setTimeout(() => beep(988, 0.09), 80); setTimeout(() => beep(1319, 0.16), 160); },
  bust: () => { beep(200, 0.3, 'sawtooth', 0.1); setTimeout(() => beep(140, 0.4, 'sawtooth', 0.1), 120); },
  laugh: () => { [950, 1150, 1000, 1250].forEach((f, i) => setTimeout(() => beep(f, 0.06, 'sine', 0.05), i * 90)); },
};

type Reveal = 'rat' | 'farmer' | 'search';
type Phase = 'idle' | 'rolling' | 'live' | 'settled';

export function App() {
  const [hostApi, setHostApi] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [gun, setGun] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reveals, setReveals] = useState<Record<number, Reveal>>({});
  const [lastShot, setLastShot] = useState<number | null>(null);
  const [kills, setKills] = useState(0);
  const [outcome, setOutcome] = useState<'cash' | 'bust' | 'clear' | null>(null);
  const [payout, setPayout] = useState(0);
  const [shown, setShown] = useState(0);
  const [line, setLine] = useState('Pick your gun. The barn opens at dusk.');
  const [history, setHistory] = useState<{ k: number; m: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem('vs-best') ?? 0); } catch { return 0; } });
  const [shake, setShake] = useState(0);

  const activeKey = useRef<string | null>(null);
  const pendingHole = useRef<number | null>(null);
  const preShotGs = useRef('');
  const killsRef = useRef(0);
  const handledSet = useRef<Set<string>>(new Set());
  const graceTimer = useRef<any>(null);
  const settledRef = useRef(false);
  const nodeMapRef = useRef<any>(null);

  useEffect(() => {
    const conn = connectGameToHost({ setState: async (s) => setSnapshot(s) });
    conn.promise.then((api) => setHostApi(api));
    return () => conn.destroy();
  }, []);

  useEffect(() => {
    try {
      const compiled: any = compileGraphGame(title);
      nodeMapRef.current = compiled.manifest ?? compiled.graph?.manifest ?? null;
    } catch { nodeMapRef.current = null; }
  }, []);

  const decimals = typeof snapshot?.token?.decimals === 'number' ? snapshot.token.decimals : 18;
  const symbol = snapshot?.token?.symbol ?? 'chUSD';
  const bals: any = (snapshot as any)?.balances ?? {};
  const hostBalanceRaw = bals.playerBalance ?? bals.smartVaultBalance ?? bals.walletBalance ?? bals.balance;
  const items: any[] = snapshot?.sessions?.items ?? [];
  const row = activeKey.current ? items.find((x: any) => x.sessionKey === activeKey.current) : items.find((x: any) => !x.isSettled);
  const gs: string = row?.raw?.gameState ?? row?.gameState ?? '';
  const settled = !!row && (row.isSettled || ['SETTLED', 'FORFEITED', 'CANCELLED'].includes(row.phaseName));
  settledRef.current = settled;
  let st: any = null;
  if (nodeMapRef.current && gs && gs.length >= 10) {
    try {
      const id = parseInt(gs.slice(2, 10), 16);
      st = nodeMapRef.current instanceof Map ? (nodeMapRef.current.get(id) ?? null) : (nodeMapRef.current[id] ?? null);
    } catch { st = null; }
  }
  const G = GUNS[gun];

  useEffect(() => {
    if (phase === 'settled') {
      let v = 0; const step = payout / 24 || 1;
      const t = setInterval(() => { v += step; if (v >= payout) { v = payout; clearInterval(t); } setShown(v); }, 35);
      return () => clearInterval(t);
    }
    setShown(0);
  }, [phase, payout]);

  const revealFarmer = (h: number) => {
    setReveals((r) => ({ ...r, [h]: 'farmer' }));
    sfx.bust(); setTimeout(() => sfx.laugh(), 250); setShake((s) => s + 1);
    setLine(BUST_LINES[h % BUST_LINES.length]);
  };
  const revealRat = (h: number, nk: number) => {
    setReveals((r) => ({ ...r, [h]: 'rat' }));
    sfx.squeak();
    setLine(nk === G.rats ? 'BARN CLEARED! Cash out now.' : KILL_LINES[(h + nk) % KILL_LINES.length] + ' Cash ' + G.ladder[nk - 1].toFixed(2) + 'x or pull again.');
  };

  useEffect(() => {
    if (!row) return;
    if (phase === 'rolling' && gs) { setPhase('live'); setLine('Eyes in the dark. Pick a hole.'); }

    if (pendingHole.current != null && gs && gs !== preShotGs.current) {
      const h = pendingHole.current;
      if (st && st.at === 'bust') {
        pendingHole.current = null; setLastShot(null);
        if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
        revealFarmer(h);
      } else if (st && st.at === 'shooting') {
        pendingHole.current = null; setLastShot(null);
        if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
        const nk = typeof st.kills === 'number' ? st.kills : killsRef.current + 1;
        killsRef.current = nk; setKills(nk);
        revealRat(h, nk);
      } else if (!st && !graceTimer.current) {
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          if (pendingHole.current == null || settledRef.current) return;
          pendingHole.current = null; setLastShot(null);
          killsRef.current += 1; setKills(killsRef.current);
          revealRat(h, killsRef.current);
        }, 800);
      }
    }

    const sid = row.sessionId ?? 'unknown';
    if (settled && !handledSet.current.has(sid)) {
      handledSet.current.add(sid);
      if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
      if (pendingHole.current != null) {
        const h = pendingHole.current;
        pendingHole.current = null; setLastShot(null);
        revealFarmer(h);
      }
      const payRaw = row.payout ?? row.settledPayout ?? row.payoutAmount ?? row.raw?.payout ?? row.raw?.settledPayout;
      const pay = payRaw != null ? Number(formatUnits(BigInt(payRaw), decimals)) : 0;
      setPayout(pay); setPhase('settled');
      setOutcome(pay <= 0 ? 'bust' : killsRef.current >= G.rats ? 'clear' : 'cash');
      if (pay > 0) { sfx.cash(); setStreak((s) => s + 1); setLine(CASH_LINES[killsRef.current % CASH_LINES.length]); } else { setStreak(0); }
      setHistory((h2) => [{ k: killsRef.current, m: pay }, ...h2].slice(0, 8));
      const nb = Math.max(best, pay); setBest(nb); try { localStorage.setItem('vs-best', String(nb)); } catch { /* ignore */ }
      if (row.sessionId && hostApi && hostApi.revealOutcome) hostApi.revealOutcome({ sessionId: row.sessionId }).catch(() => {});
    }
  }, [gs, settled, row]);

  const resetRound = () => {
    activeKey.current = null;
    pendingHole.current = null;
    preShotGs.current = '';
    if (graceTimer.current) { clearTimeout(graceTimer.current); graceTimer.current = null; }
    killsRef.current = 0;
    setKills(0); setReveals({}); setLastShot(null);
    setPayout(0); setOutcome(null);
  };

  const bet = async () => {
    if (!hostApi) return;
    sfx.click();
    resetRound();
    setPhase('rolling'); setLine('The barn door creaks...');
    try {
      const gameData = encodePlainGameData(gun);
      let cap: bigint | null = null;
      try {
        if (typeof hostApi.getMaxWager === 'function') {
          const mw: any = await hostApi.getMaxWager({ gameData });
          const raw = mw == null ? null : (typeof mw === 'object' ? (mw.limit ?? mw.maxWager ?? mw.wager ?? mw.value ?? null) : mw);
          if (raw != null && raw !== 'unknown') { const s = String(raw); if (/^[0-9]+$/.test(s)) cap = BigInt(s); }
        }
      } catch { /* no cap */ }
      const typed = parseUnits('1', decimals);
      const wager = (cap != null && typed > cap ? cap : typed).toString();
      const res = await hostApi.openSession({ wager, gameData });
      activeKey.current = res.sessionKey;
    } catch (e: any) {
      setPhase('idle');
      setLine('Bet rejected: ' + (e?.shortMessage ?? e?.message ?? e));
    }
  };

  const shoot = async (i: number, retry = false) => {
    if (phase !== 'live' || lastShot != null || reveals[i] || kills >= G.rats) return;
    if (!hostApi || !row || !row.sessionId) return;
    if (!retry) {
      sfx.bang(); setLastShot(i); pendingHole.current = i;
      preShotGs.current = gs;
      setReveals((r) => ({ ...r, [i]: 'search' }));
    }
    const actionData = encodeAbiParameters([{ type: 'uint256' }], [1n]);
    try {
      await hostApi.submitAction({ sessionId: row.sessionId, actionData });
    } catch (e: any) {
      if (!retry) { setTimeout(() => { shoot(i, true); }, 900); return; }
      pendingHole.current = null; setLastShot(null);
      setReveals((r) => { const c = { ...r }; delete c[i]; return c; });
      setLine('Shot refused: ' + (e?.message ?? e));
    }
  };

  const cashout = async () => {
    if (phase !== 'live' || kills === 0 || !hostApi || !row || !row.sessionId) return;
    sfx.cash();
    const actionData = encodeAbiParameters([{ type: 'uint256' }], [0n]);
    try { await hostApi.submitAction({ sessionId: row.sessionId, actionData }); }
    catch (e: any) { setLine('Cash refused: ' + (e?.message ?? e)); }
  };

  const feathers = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    left: (i * 83) % 100, delay: (i % 10) * 0.07, rot: (i * 47) % 360,
  })), [shake, phase]);

  const shownBalance = hostBalanceRaw !== undefined ? formatUnits(BigInt(hostBalanceRaw), decimals) : '--';

  return (
    <div className="vs-root">
      <style>{CSS}</style>
      <div key={shake} className={shake ? 'vs-shake-wrap' : 'vs-plain-wrap'}>
        <header className="vs-head">
          <h1 className="vs-title">VARMIN' SEASON</h1>
          <div className="vs-strip">ENGINE BUILD // RTP 96.00% // STREAK {streak} // BEST {best.toFixed(2)}x // {shownBalance} {symbol}</div>
        </header>

        {phase === 'idle' && (
          <div className="vs-guns">
            {GUNS.map((g, i) => (
              <button key={i} className={gun === i ? 'vs-gun vs-gun--sel' : 'vs-gun'} onClick={() => { setGun(i); sfx.click(); }}>
                <div className="vs-gun__name">{g.name}</div>
                <div className="vs-gun__farm">{g.farmers} FARMER{g.farmers > 1 ? 'S' : ''} - {g.rats} RATS</div>
                <div className="vs-gun__top">UP TO {g.ladder[g.ladder.length - 1]}x</div>
                <div className="vs-gun__tag">{g.tag}</div>
              </button>
            ))}
            <button className="vs-cta" onClick={bet}>ENTER THE BARN // 1.00 {symbol}</button>
          </div>
        )}

        {phase === 'rolling' && <div className="vs-roll">shuffling the barn...</div>}

        {(phase === 'live' || phase === 'settled') && (
          <div className="vs-mid">
            <div className="vs-belt">
              {Array.from({ length: G.rats }, (_, i) => (
                <span key={i} className={i < kills ? 'vs-shell vs-shell--spent' : 'vs-shell'}></span>
              ))}
              <span className="vs-belt__label">{G.name}</span>
            </div>
            <div className="vs-holes">
              {Array.from({ length: 6 }, (_, i) => (
                <button key={i} className={'vs-hole vs-hole--' + (reveals[i] ? reveals[i] : (phase === 'settled' ? 'closed' : 'hidden'))} onClick={() => shoot(i)} disabled={phase !== 'live' || !!reveals[i] || lastShot != null || kills >= G.rats}>
                  {reveals[i] === 'rat' && <span className="vs-glyph">🐀<em className="vs-tag vs-tag--w">DOWN</em></span>}
                  {reveals[i] === 'farmer' && <span className="vs-glyph">👨‍🌾<em className="vs-tag vs-tag--l">BUSTED</em></span>}
                  {reveals[i] === 'search' && <span className="vs-glyph vs-glyph--search">…</span>}
                  {!reveals[i] && phase === 'live' && <span className="vs-eyes"><i></i><i></i></span>}
                  {!reveals[i] && phase !== 'live' && <span className="vs-glyph vs-glyph--dim">.</span>}
                </button>
              ))}
            </div>
            <div className="vs-actions">
              {phase === 'live' && (
                <div className="vs-livebox">
                  <div className="vs-ladder">
                    {G.ladder.map((m, i) => (
                      <span key={i} className={kills === i + 1 ? 'vs-rung vs-rung--here' : kills > i + 1 ? 'vs-rung vs-rung--past' : 'vs-rung'}>{m}x</span>
                    ))}
                  </div>
                  <button className="vs-cash" disabled={kills === 0} onClick={cashout}>
                    {kills === 0 ? 'KILL A RAT FIRST' : 'CASH OUT ' + G.ladder[kills - 1].toFixed(2) + 'x'}
                  </button>
                </div>
              )}
              {phase === 'settled' && (
                <div className="vs-settle">
                  <div className={outcome === 'bust' ? 'vs-stamp vs-stamp--l' : 'vs-stamp vs-stamp--w'}>
                    {outcome === 'bust' ? 'THE FARMER SEES YOU' : outcome === 'clear' ? 'BARN CLEARED' : 'CASHED ' + G.ladder[Math.max(0, kills - 1)].toFixed(2) + 'x'}
                  </div>
                  <div className="vs-pay">+{shown.toFixed(2)}</div>
                  <button className="vs-cta" onClick={() => { resetRound(); setPhase('idle'); }}>BACK TO THE GUN RACK</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="vs-line">{line}</div>
        {history.length > 0 && (
          <div className="vs-hist">
            {history.map((h, i) => (
              <span key={i} className={h.m > 0 ? 'vs-hchip vs-hchip--w' : 'vs-hchip'}>{h.k} rats - {h.m.toFixed(2)}</span>
            ))}
          </div>
        )}
        {phase === 'settled' && outcome !== 'bust' && feathers.map((f, i) => (
          <span key={shake + '-' + i} className="vs-feather" style={{ left: f.left + '%', animationDelay: f.delay + 's', transform: 'rotate(' + f.rot + 'deg)' }}></span>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.vs-root{min-height:100vh;position:relative;overflow:hidden;background:#241710;color:#f0e4c8;font-family:'Special Elite',monospace;display:flex;flex-direction:column;align-items:center;padding:20px 16px 34px;box-sizing:border-box}
.vs-root::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,#2b1b10 0 44px,#22150c 44px 47px),repeating-linear-gradient(90deg,transparent 0 130px,rgba(0,0,0,.18) 130px 133px);pointer-events:none}
.vs-root::after{content:'';position:fixed;inset:0;background:radial-gradient(900px 500px at 50% 0%,transparent 40%,rgba(0,0,0,.55));pointer-events:none}
.vs-root>*{position:relative;z-index:1}
.vs-plain-wrap,.vs-shake-wrap{display:flex;flex-direction:column;align-items:center;width:100%}
.vs-shake-wrap{animation:vsshake .45s ease}
@keyframes vsshake{0%,100%{transform:translate(0)}20%{transform:translate(-7px,3px)}40%{transform:translate(7px,-3px)}60%{transform:translate(-5px,-2px)}80%{transform:translate(5px,2px)}}
.vs-head{text-align:center;margin-bottom:6px}
.vs-title{font-family:'Rye',serif;font-size:40px;margin:0;color:#f0e4c8;text-shadow:3px 3px 0 #7a1f1f,6px 6px 0 rgba(0,0,0,.5);letter-spacing:2px}
.vs-strip{font-size:12px;letter-spacing:2px;color:#c9a25f;margin-top:8px}
.vs-guns{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:26px}
.vs-gun{width:210px;background:#f0e4c8;color:#3a2a18;border:3px solid #1a0f08;border-radius:6px;box-shadow:6px 6px 0 rgba(0,0,0,.55);padding:14px;text-align:left;cursor:pointer;font-family:'Special Elite',monospace;transition:transform .12s}
.vs-gun:hover{transform:translateY(-4px)}
.vs-gun--sel{outline:4px solid #c9a25f;transform:translateY(-6px)}
.vs-gun__name{font-family:'Rye',serif;font-size:17px}
.vs-gun__farm{font-size:12px;margin:6px 0;color:#7a1f1f;letter-spacing:1px}
.vs-gun__top{font-size:20px;color:#2f6b3a}
.vs-gun__tag{font-size:11px;margin-top:6px;color:#6b5638}
.vs-cta{font-family:'Rye',serif;background:#7a1f1f;color:#f0e4c8;border:3px solid #1a0f08;border-radius:8px;padding:14px 30px;font-size:17px;letter-spacing:1px;cursor:pointer;box-shadow:6px 6px 0 rgba(0,0,0,.55);margin-top:22px;transition:transform .1s}
.vs-cta:hover{transform:translateY(-3px)}
.vs-roll{font-size:20px;margin:60px 0;color:#c9a25f;animation:vspulse 1s infinite}
@keyframes vspulse{50%{opacity:.4}}
.vs-mid{display:flex;flex-direction:column;align-items:center}
.vs-belt{display:flex;gap:8px;align-items:center;margin:14px 0 10px}
.vs-shell{width:15px;height:36px;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#e8b64c,#8a5a17 70%,#6b4410);border:2px solid #1a0f08;box-shadow:2px 2px 0 rgba(0,0,0,.5)}
.vs-shell--spent{background:#4a4038;opacity:.45;transform:rotate(18deg) translateY(4px)}
.vs-belt__label{font-size:12px;letter-spacing:2px;color:#c9a25f;margin-left:10px}
.vs-holes{display:grid;grid-template-columns:repeat(3,min(120px,27vw));gap:16px;margin:6px 0;justify-content:center}
.vs-hole{width:100%;aspect-ratio:6/7;border-radius:70px 70px 10px 10px;border:4px solid #1a0f08;background:radial-gradient(60% 55% at 50% 42%,#1c120a 0%,#0c0704 75%);box-shadow:inset 0 10px 26px rgba(0,0,0,.9),4px 5px 0 rgba(0,0,0,.5);position:relative;cursor:crosshair;transition:transform .1s}
.vs-hole:disabled{cursor:default}
.vs-hole--hidden:hover{transform:scale(1.05);box-shadow:inset 0 10px 26px rgba(0,0,0,.9),0 0 0 3px #c9a25f}
.vs-hole--rat{background:radial-gradient(60% 55% at 50% 42%,#2f4a26 0%,#0c0704 78%)}
.vs-hole--farmer{background:radial-gradient(60% 55% at 50% 42%,#5a1d1d 0%,#0c0704 78%)}
.vs-hole--search{background:radial-gradient(60% 55% at 50% 42%,#2a2018 0%,#0c0704 78%)}
.vs-hole--closed{opacity:.55}
.vs-eyes{position:absolute;inset:0;display:flex;gap:16px;align-items:center;justify-content:center}
.vs-eyes i{width:9px;height:9px;border-radius:50%;background:#ffb347;box-shadow:0 0 10px #ffb347;animation:vsblink 3.4s infinite}
.vs-eyes i+i{animation-delay:.2s}
@keyframes vsblink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.vs-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:46px}
.vs-glyph--dim{opacity:.4}
.vs-glyph--search{font-size:34px;color:#c9a25f;animation:vspulse .8s infinite}
.vs-tag{position:absolute;bottom:10px;left:50%;transform:translateX(-50%) rotate(-8deg);font-family:'Rye',serif;font-size:12px;letter-spacing:2px;padding:2px 8px;border:2px solid;border-radius:4px;background:#f0e4c8}
.vs-tag--w{color:#2f6b3a;border-color:#2f6b3a}
.vs-tag--l{color:#a32020;border-color:#a32020}
.vs-actions{min-height:120px;display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:6px}
.vs-livebox{display:flex;flex-direction:column;align-items:center;gap:12px}
.vs-ladder{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.vs-rung{font-size:13px;padding:5px 10px;border:2px solid #6b5638;border-radius:6px;color:#c9a25f;background:rgba(0,0,0,.3)}
.vs-rung--here{border-color:#2f6b3a;color:#9fe3a9;box-shadow:0 0 12px #2f6b3a88;transform:translateY(-3px)}
.vs-rung--past{opacity:.4;text-decoration:line-through}
.vs-cash{font-family:'Rye',serif;background:linear-gradient(180deg,#e8b64c,#a8741f);color:#1a0f08;border:3px solid #1a0f08;border-radius:10px;padding:14px 34px;font-size:18px;cursor:pointer;box-shadow:5px 5px 0 rgba(0,0,0,.55)}
.vs-cash:disabled{background:#4a4038;color:#8a7a68;cursor:not-allowed;box-shadow:none}
.vs-cash:not(:disabled):hover{transform:translateY(-3px)}
.vs-settle{text-align:center}
.vs-stamp{font-family:'Rye',serif;font-size:26px;letter-spacing:2px;padding:10px 22px;border:4px solid;border-radius:8px;transform:rotate(-5deg);display:inline-block;animation:vspop .35s cubic-bezier(.2,1.6,.4,1)}
.vs-stamp--w{color:#9fe3a9;border-color:#2f6b3a;text-shadow:0 0 18px #2f6b3a88}
.vs-stamp--l{color:#ff8a8a;border-color:#a32020}
@keyframes vspop{0%{transform:scale(1.8) rotate(-14deg);opacity:0}100%{transform:scale(1) rotate(-5deg);opacity:1}}
.vs-pay{font-size:30px;color:#e8b64c;margin:10px 0}
.vs-line{min-height:26px;margin-top:14px;font-size:15px;color:#d8c69a;text-align:center;max-width:560px}
.vs-hist{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;justify-content:center}
.vs-hchip{font-size:11px;border:2px solid #6b5638;border-radius:999px;padding:3px 10px;color:#c9a25f}
.vs-hchip--w{border-color:#2f6b3a;color:#9fe3a9}
.vs-feather{position:fixed;top:-12px;width:10px;height:16px;border-radius:50% 50% 50% 0;background:#f5efdf;opacity:.9;animation:vsfall 1.9s ease-in forwards;pointer-events:none;z-index:40}
@keyframes vsfall{to{transform:translateY(110vh) rotate(420deg);opacity:.6}}
`;
