# Chess Lab

A static web app (PC and phone) to analyze your chess.com games, train on your own mistakes, and play: against an owl mascot, a friend on the same device, or online (peer-to-peer rooms and tournaments). No server and no account. Everything runs in the browser.

## Features

- **Analyze**: enter a chess.com username. Public games are fetched from the [chess.com published-data API](https://www.chess.com/news/view/published-data-api) and cached in IndexedDB.
  - Instant stats: results by colour, time control and rating gap, rating history, how games end, activity by hour and weekday, best wins, streaks.
  - Engine analysis with Stockfish 17.1 (WASM, several workers in parallel): accuracy, move classification (brilliant, great, best… mistake, miss, blunder), accuracy per phase, blunders in time trouble, worst and best moves.
  - Openings: results per opening and an explorer of your own repertoire.
  - Hoot the owl turns the numbers into plain-language insights.
- **Review**: replay any game with an eval bar, an eval graph, live engine lines and per-move comments. Play other moves on the board to explore variations ("what if"), retry your mistakes, and promote or delete variations.
- **Train**: exercises built from your analyzed games (fix your mistakes, punish the blunder, find the mate, which move is better, evaluate the position) plus skill drills (hanging pieces, coordinates, an opening trainer for your lines or the opening library, and endgames against the engine).
- **Play the mascot**: seven owls from ~400 to ~3000 Elo. They react to your moves, and hints and takebacks are optional.
- **Two players**: on the same device (with an optional auto-flip), or online with a room code or invite link (WebRTC through PeerJS, with an optional password, spectators, chat, rematches, draw and takeback offers). If the host leaves, another player takes over automatically.
- **Tournaments**: round robin, double round robin, Swiss or knockout, peer-to-peer, with standings and tiebreaks (Buchholz / Sonneborn-Berger).
- **Editable rules for every match**: time control (with time odds), increment, variant (standard, King of the Hill, Three-check), start position (standard, shuffle, or any FEN), takebacks, hints.
- **Free board**: set up any position (drag, a palette, presets, a FEN), then analyze it or play it out.
- About 60 UI themes, 6 board themes, and light/dark that follows the system.

## Develop

```bash
npm install        # also copies the Stockfish build to public/engine (postinstall)
npm run dev        # http://localhost:5173
npm test           # unit tests (engine rules, room/tournament logic)
npm run build      # typecheck + static build in dist/
```

Stack: Vite, React 18, TypeScript (strict), Tailwind 3 with the token theme system in `src/themes`, zustand, chess.js, stockfish.js (lite single-threaded build, so no COOP/COEP headers are needed), and PeerJS.

```
src/core/      pure logic (chess rules & game state, analysis, stats, exercises, rooms, tournaments)
src/net/       PeerJS session: host-authoritative snapshots, heartbeat, host migration
src/features/  one folder per screen
src/ui/        board, charts, mascot, shared game UI
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (tests, build, GitHub Pages). In the repository, go to Settings → Pages → Source and choose **GitHub Actions**. The app uses `HashRouter` and relative paths, so it works under any repository name.

## Credits

- Stockfish 17.1 (GPLv3), via [stockfish.js](https://github.com/nmrugg/stockfish.js)
- Pieces: cburnett by Colin M.L. Burnett (via lichess)
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
- Game data: chess.com public API
