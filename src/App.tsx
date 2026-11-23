import { useEffect, useRef, useState } from 'react';
import { connectGameToHost } from '@chain-protocol/casino-sdk/guest';
import { compileGraphGame, encodePlainGameData } from '@chain-protocol/casino-sdk/graph-engine';
import { encodeAbiParameters, parseUnits, formatUnits } from 'viem';
import title from './title';

const compiled = compileGraphGame(title);
const manifest: any = (compiled as any).manifest || (compiled as any).graph?.manifest || new Map();

function readState(gs: string | undefined) {
  if (!gs || gs.length < 10) return null;
  const nodeId = parseInt(gs.slice(2, 10), 16);
  if (manifest instanceof Map) return manifest.get(nodeId) || null;
  return manifest[nodeId] || null;
}

const GUNS = [
  { name: 'OLD SINGLE-SHOT', rats: 5, farmers: 1, ladder: [1.15, 1.44, 1.92, 2.88, 5.76] },
  { name: 'DOUBLE-BARREL', rats: 4, farmers: 2, ladder: [1.44, 2.4, 4.8, 14.4] },
  { name: 'THE JUDGE', rats: 3, farmers: 3, ladder: [1.92, 4.8, 19.2] },
];

export function App() {
  const [hostApi, setHostApi] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [gun, setGun] = useState(0);
  const [wagerInput, setWagerInput] = useState('1');
  const [phase, setPhase] = useState<'idle' | 'playing' | 'settled'>('idle');
  const [kills, setKills] = useState(0);
  const [ratsLeft, setRatsLeft] = useState(0);
  const [farmersLeft, setFarmersLeft] = useState(0);
  const [payout, setPayout] = useState(0);
  const [outcome, setOutcome] = useState<'win' | 'bust' | null>(null);
  const [msg, setMsg] = useState('Pick a gun and enter the barn.');

  const activeKey = useRef<string | null>(null);

  useEffect(() => {
    const conn = connectGameToHost({ setState: async (s) => setSnapshot(s) });
    conn.promise.then((api) => setHostApi(api));
    return () => conn.destroy();
  }, []);

  const decimals = typeof (snapshot as any)?.token?.decimals === 'number' ? (snapshot as any).token.decimals : 18;
  const symbol = (snapshot as any)?.token?.symbol ?? 'chUSD';
  const items: any[] = (snapshot as any)?.sessions?.items ?? [];
  const row = activeKey.current ? items.find((x: any) => x.sessionKey === activeKey.current) : items.find((x: any) => !x.isSettled);
  const gs: string | undefined = row?.raw?.gameState ?? row?.gameState;
  const st: any = readState(gs);
  const settled = !!row && (row.isSettled || ['SETTLED', 'FORFEITED', 'CANCELLED'].includes(row.phaseName));
  const G = GUNS[gun];

  useEffect(() => {
    if (!row) return;
    if (st && st.at === 'shooting') {
      setPhase('playing');
      setKills(st.kills ?? 0);
      setRatsLeft(st.ratsLeft ?? 0);
      setFarmersLeft(st.farmersLeft ?? 0);
    }
    if (settled) {
      setPhase('settled');
      const pay = row.payout != null ? Number(formatUnits(BigInt(row.payout), decimals)) : 0;
      setPayout(pay);
      setOutcome(pay > 0 ? 'win' : 'bust');
      setMsg(pay > 0 ? 'You walked away jingling.' : 'The farmer saw you.');
      if (row.sessionId && hostApi?.revealOutcome) hostApi.revealOutcome({ sessionId: row.sessionId }).catch(() => {});
    }
  }, [gs, settled]);

  const bet = async () => {
    if (!hostApi) return;
    setMsg('Opening the barn door...');
    try {
      const gameData = encodePlainGameData(gun);
      let cap: bigint | null = null;
      try {
        if (typeof (hostApi as any).getMaxWager === 'function') {
          const mw: any = await (hostApi as any).getMaxWager({ gameData });
          const raw = mw == null ? null : (typeof mw === 'object' ? (mw.limit ?? mw.maxWager ?? mw.wager ?? mw.value ?? null) : mw);
          if (raw != null && raw !== 'unknown') {
            const s = String(raw);
            if (/^[0-9]+$/.test(s)) cap = BigInt(s);
          }
        }
      } catch { /* no cap, fine */ }
      const typed = parseUnits(wagerInput || '1', decimals);
      const wager = (cap != null && typed > cap ? cap : typed).toString();
      const res = await hostApi.openSession({ wager, gameData });
      activeKey.current = res.sessionKey;
      setPhase('playing');
      setKills(0);
      setRatsLeft(G.rats);
      setFarmersLeft(G.farmers);
      setOutcome(null);
      setMsg('In the barn. Eyes in the dark.');
    } catch (e: any) {
      setPhase('idle');
      setMsg('Bet rejected: ' + (e?.shortMessage ?? e?.message ?? e));
    }
  };

  const shoot = async () => {
    if (phase !== 'playing' || !hostApi || !row?.sessionId) return;
    setMsg('BANG!');
    const actionData = encodeAbiParameters([{ type: 'uint256' }], [1n]);
    try { await hostApi.submitAction({ sessionId: row.sessionId, actionData }); }
    catch (e: any) { setMsg('Shot refused: ' + (e?.message ?? e)); }
  };

  const cash = async () => {
    if (phase !== 'playing' || kills === 0 || !hostApi || !row?.sessionId) return;
    setMsg('Cashing out...');
    const actionData = encodeAbiParameters([{ type: 'uint256' }], [0n]);
    try { await hostApi.submitAction({ sessionId: row.sessionId, actionData }); }
    catch (e: any) { setMsg('Cash refused: ' + (e?.message ?? e)); }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', background: '#241710', color: '#f0e4c8', minHeight: '100vh' }}>
      <h1 style={{ color: '#e8b64c' }}>VARMIN' SEASON (ENGINE)</h1>
      <p>{msg}</p>
      {phase === 'idle' && (
        <div>
          {GUNS.map((g, i) => (
            <button key={i} onClick={() => setGun(i)} style={{ display: 'block', marginBottom: 10, padding: 10, background: gun === i ? '#c9a25f' : '#3a2a18', color: '#f0e4c8', border: '2px solid #1a0f08', cursor: 'pointer' }}>
              {g.name} ({g.rats} Rats, {g.farmers} Farmers)
            </button>
          ))}
          <input value={wagerInput} onChange={(e) => setWagerInput(e.target.value)} placeholder="Wager" style={{ padding: 10, marginRight: 10 }} />
          <button onClick={bet} style={{ padding: 10, background: '#7a1f1f', color: '#f0e4c8', border: 'none', cursor: 'pointer' }}>ENTER BARN</button>
        </div>
      )}
      {phase === 'playing' && (
        <div>
          <h2>Kills: {kills} | Rats Left: {ratsLeft} | Farmers Left: {farmersLeft}</h2>
          <button onClick={shoot} style={{ padding: 15, marginRight: 10, background: '#2f6b3a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18 }}>SHOOT</button>
          <button onClick={cash} disabled={kills === 0} style={{ padding: 15, background: kills > 0 ? '#e8b64c' : '#4a4038', color: '#1a0f08', border: 'none', cursor: kills > 0 ? 'pointer' : 'not-allowed', fontSize: 18 }}>
            CASH OUT {kills > 0 ? G.ladder[kills - 1] + 'x' : ''}
          </button>
        </div>
      )}
      {phase === 'settled' && (
        <div>
          <h2 style={{ color: outcome === 'win' ? '#9fe3a9' : '#ff8a8a' }}>{outcome === 'win' ? 'CASHED OUT!' : 'BUSTED!'}</h2>
          <p>Payout: {payout.toFixed(2)} {symbol}</p>
          <button onClick={() => { setPhase('idle'); activeKey.current = null; }} style={{ padding: 15, background: '#7a1f1f', color: '#f0e4c8', border: 'none', cursor: 'pointer' }}>PLAY AGAIN</button>
        </div>
      )}
    </div>
  );
}
