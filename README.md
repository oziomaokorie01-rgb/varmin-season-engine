# Coinflip — example casino game

Reference guest UI for `CoinflipGame.sol`, showing how to build a Chain.wtf casino
game: the host loads it inside an iframe and drives it entirely over the
`@chain-protocol/casino-sdk` bridge — no wallet code in the game. The UI mirrors the
production coinflip: the chain.wtf design tokens and card recipes live in
`src/styles/` (plain CSS, no framework), the sidebar carries the bet controls and
the gradient BET CTA, and the canvas renders the backdrop art, the CSS-3D coin
grid, the recent-results rail, the profit/win-chance stats strip and the WIN
celebration overlay.

## Run

```sh
npm install
npm run dev          # serves the frontend on http://localhost:3100
```

In a second terminal, start the SDK simulator:

```sh
npm run simulator
```

With Bun, run `bun install`, `bun run dev` and `bun run simulator`. Open the URL
`npm run simulator` prints. It shows this game in the SDK simulator, on a dev chain with a VRF
node and 1,000,000 test chUSD. Saving the contract or `deployment.ts` redeploys the game.

| Command               | Does                                          |
| --------------------- | --------------------------------------------- |
| `npm test`            | Runs the payout math tests.                   |
| `npm run build`       | Writes the static bundle to `dist/`.          |
| `npm run check-types` | Type-checks the frontend and `deployment.ts`. |

With Bun, run `bun run test`, `bun run build` and `bun run check-types`. `bun test` would start
Bun's own test runner instead of the example's.

## Where the pieces live

| Path                             | What it holds                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `contracts/src/CoinflipGame.sol` | The game contract, built on `@chain-protocol/casino-sdk/contracts/ICasinoGameV2.sol`. |
| `deployment.ts`                  | Names the contract `chain dev casino` compiles and deploys.                           |
| `src/`                           | The frontend.                                                                         |
| `public/game.manifest.json`      | The manifest the host fetches from this origin (CORS open).                           |

To ship, host `dist/` at a stable HTTPS URL; the host fetches `game.manifest.json` from that origin
and embeds the page. The casino SDK's Getting Started guide walks through replacing this game with
your own.

In the Chain repository this directory is the source of the template and has no `simulator`
script; `bun start` at the casino SDK's root runs it with the simulator.

## How a round works

1. Player picks heads/tails, coin count (1–10) and required hits; the bet is
   ABI-encoded as `(bool pickHeads, uint8 coinCount, uint8 minWins)` and sent via
   `hostApi.openSession` (instant game — no `submitAction`).
2. The coins tumble while the snapshot pushes catch up; once the session row for
   our `sessionKey` turns terminal, the settled `gameState` is decoded and each
   coin toss-lands on randomness bit `i` (`1` = heads), exactly like
   `_countHeads` on-chain.
3. After the landing animation, `hostApi.revealOutcome` releases the withheld
   payout into the host's balance displays, the result badges + WIN overlay show,
   and the round lands in the history rail. The Fast Mode toggle skips the
   animation and reveals the instant the outcome is known.

`src/lib/coinflip.ts` mirrors the contract's combinatorics (win ways, 98% RTP payout
floor math) for the multiplier/probability preview. The maximum wager is not computed
here: `src/lib/useMaxWager.ts` asks the host with `hostApi.getMaxWager({ gameData })`
for the pick the player selected — the chain stays authoritative.
