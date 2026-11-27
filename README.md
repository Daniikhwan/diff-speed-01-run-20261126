# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/Daniikhwan/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/Daniikhwan/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A fast drop-in for makefun-diff 1.0.0: it diffs two texts line by line and returns exactly the same patch makefun-diff returns, several times faster. The engine is the same greedy Myers search with the same tie-breaks (furthest into the old text, deletion winning a tie, no edge-diagonal pruning), but lines are interned to small integer ids so every comparison in the search is an int `===`, the search state lives in one flat `Int32Array` of V snapshots instead of a path object per diagonal, and the edit script is rebuilt by walking the snapshots back. Only the one diagonal that can finish (`k = n - m`) is ever checked for completion.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` (Node 22) reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each with `run()` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vnsny7za&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
