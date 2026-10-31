# REGRET CHESS 3D

A playable 3D chess game in the browser where your opponent bot thinks out loud, reveals what it almost played, laments its regrets in hindsight, and calls out the tactical gifts you leave behind.

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (runs on port 3000):
   ```bash
   npm run dev
   ```
3. Run the engine, self-play, and narrator audit test suite:
   ```bash
   npx --yes tsx --test src/engine/engine.test.ts
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## How to Play

- **Start the Match**: Click **Enter the Arena (Start Game)** on the title screen (or press `Enter` / `Space`, or visit `?autostart=1`).
- **Make a Move**:
  - Click any of your pieces on the 3D board to illuminate legal destination squares (custom GLSL rings), then click a target square.
  - Or use the **Accessible Move Bar** at the bottom-left to type any algebraic move (`e4`, `Nf3`, `O-O`) or click one of the **Quick Legal Move** buttons.
- **Inspect the Regret Journal**:
  - After every bot turn, a new **Regret Card** is added to the journal (right dock on desktop, collapsible bottom sheet on mobile):
    1. **THE MOVE**: What the bot played and its factual geometric/tactical reason.
    2. **I EXPECTED**: The bot's predicted principal variation (PV), evaluation in pawns from the bot's perspective, and expandable 5-part evaluation breakdown (`Material`, `Position`, `Mobility`, `King Safety`, `Pawns`).
    3. **ALMOST PLAYED**: The 3 runner-up candidate moves rendered as translucent holographic **Ghost Pieces** with glowing color-coded 3D trajectory arrows (`Green = Playable`, `Amber = Risky`, `Red = Blunder`) and factual rejection reasons.
    4. **HINDSIGHT**: After your next reply, the bot re-searches 2 plies deeper and updates its previous card with `REGRET`, `GIFT`, `VINDICATED`, or `SHRUG`.
    5. **MOOD METER**: Confidence (`0–100`) and mood state (`CONFIDENT`, `COMPOSED`, `SWEATING`, `PANICKING`) that dynamically shift the 3D studio lighting and trigger the **Regret Moment** (dimmed scene, trembling king, crimson regret arrow).
- **Interactive "What If?" Rewind & "Why?" Replay**:
  - Click **Why?** on any past Regret Card to replay its holographic ghosts and mood on the 3D board.
  - Click **What if?** on any runner-up move to jump the board into that alternate principal variation and step through the moves one by one.

## Known Limitations

- **Search Horizon**: The pure TypeScript Web Worker negamax engine searches depths 2–5 (default 4) with quiescence search and a 30,000-entry transposition table; deep fortress endgames or 10+ ply sacrifices are beyond its tactical horizon.
- **Opening Book**: The engine evaluates all moves from first principles (piece-square tables, mobility, king safety, pawn structure) rather than querying an external opening database, so early opening play is deterministic per depth unless varied by your moves.
- **Synthesized Audio**: All sound effects are synthesized in real time via the Web Audio API and require an initial user gesture in the browser before audio playback begins.
