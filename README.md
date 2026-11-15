# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/DavidQlla06/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/DavidQlla06/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, ranks the 198 that record no token by an implied value calibrated from the live tokens that already trade, and gives every ranked protocol a six-step farm plan with costs and times, in a sortable, filterable dashboard that runs with no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. `main.ts` (Node 22, standard library only) writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's dataset), `out/dashboard/` and `out/screenshots/`, and `out/dossier.json` for the judge.

## The model

`implied = TVL × category multiple × growth × maturity × breadth`, where the category multiple is the median market-cap / TVL of that category's protocols that already trade (global median where a category has too few live samples), growth is the seven-day TVL change clamped to −80%…+200% and weighted 0.6, maturity rises from 0.5 to 1.0 over 1,460 days with no token, and breadth adds 4% per extra chain. No name is ever special-cased. The dashboard recomputes each row's number from the snapshot figures, so page and board agree.

## Screenshots

The four screenshots in `screenshots/` are taken with headless Chromium (Puppeteer) from the built dashboard — see `tools/shots.mjs`: the board, a protocol's detail view, a filtered view, and the methodology with its calibration table.

---

<sub>Entered on [make.fun](https://make.fun/?ref=56285tn4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
