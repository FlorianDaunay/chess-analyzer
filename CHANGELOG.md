# Changelog

All notable changes to this project are documented here. Versions follow [Semantic Versioning](https://semver.org/); the version shown in the app comes from `package.json`.

## [0.1.3] - 2026-10-17

### Fixes
- Phone: playing a move no longer scrolls the page down to the move list; the board stays in place.
- Analyze: profile header fixed on small screens (ratings on one even row, letter avatar when the account has none, real username spelling) and tab labels no longer wrap.

## [0.1.2] - 2026-10-17

### Fixes
- An error inside a page no longer blanks the app: a message with Try again / Reload / Home is shown and the menu stays usable. Technical details can be copied for bug reports.
- After a new deploy, a tab still running the old version reloads itself instead of failing to open pages.
- Engine analysis failures are reported (in Analyze and in the review board) instead of hanging silently; a crashed engine is restarted.
- The guide bubble closes when changing page so it does not cover the content.

## [0.1.1] - 2026-10-17

### Fixes
- App crashed when changing page on recent Chromium/Edge browsers (`window.scrollTo` now returns a Promise, which React took for an effect cleanup).

## [0.1.0] - 2026-10-17

First release.

### Features
- chess.com account analysis: results, rating history, openings and repertoire explorer, how games end, activity, insights from Hoot the owl.
- In-browser Stockfish 17.1 analysis: accuracy, move classification, best/worst moves, accuracy per phase, blunders in time trouble.
- Review board: eval bar and graph, live engine lines, variations ("what if"), retry your mistakes.
- Training: fix your mistakes, punish the blunder, find the mate, which move is better, evaluate the position, hanging pieces, coordinates, opening trainer, endgame drills.
- Play the mascot: 7 owl opponents from ~400 to ~3000 Elo, hints and takebacks.
- Two players on one device, or online peer-to-peer rooms (password, spectators, chat, rematch, draw/takeback offers, automatic host migration).
- Peer-to-peer tournaments: round robin, double round robin, Swiss, knockout.
- Editable rules for every match: clocks (time odds, increment), King of the Hill, Three-check, shuffle or FEN start, takebacks, hints.
- Free board editor with palette, presets and FEN.
- ~60 UI themes, 6 board themes, light/dark following the system; PC and phone layouts.

[0.1.3]: https://github.com/FlorianDaunay/chess-analyzer/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/FlorianDaunay/chess-analyzer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/FlorianDaunay/chess-analyzer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/FlorianDaunay/chess-analyzer/releases/tag/v0.1.0
