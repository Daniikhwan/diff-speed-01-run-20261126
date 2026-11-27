// Fast drop-in for makefun-diff 1.0.0 (make.fun's own line diff).
//
// Returns, for { old, new }, exactly the patch makefun-diff 1.0.0 returns,
// as one string. Same rule, faster engine:
//
// - Lines are cut after every "\n"; a last line with no "\n" is a line too.
// - Common prefix, then common suffix of what is left.
// - Between them, Myers's greedy search: on each diagonal the path reaching
//   furthest into the old text, deletion winning a tie, no move past either
//   text's end, no edge-diagonal pruning, every equal run followed fully.
// - The patch: "makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I",
//   hunks "@ os ol ns nl", lines "=/-/+", deletions before insertions in a
//   change run, 3 kept lines of context, runs at most 6 kept lines apart
//   sharing a hunk, "%" after a line with no trailing newline.
//
// Speed comes from: lines interned to small integer ids (one Map pass, then
// every comparison in the search is an int ===), the search kept in one flat
// Int32Array of V snapshots (no path object per diagonal, no linked lists),
// the edit script rebuilt by walking the snapshots back, and only the one
// diagonal that can finish (k = n - m) ever checked for completion. The
// search itself is the same greedy Myers, same order, same tie-break, so
// the script it finds is the same one.

/** The patch's first word. */
export const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
export const CONTEXT = 3;

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/** No path on a diagonal. V values are old positions, always >= -1. */
const NONE = -2;

/**
 * Flat V snapshots, pre-sized so the search never grows it on a case this
 * size (the generator caps a case's edits near 4,000; the buffer holds
 * d <= 8192). Reused across calls; cells read are always written first.
 */
const V_CAP = 8192;
const V = new Int32Array((V_CAP + 1) * (V_CAP + 1));

/**
 * The edit runs of the trimmed region (ids A into ids B), in order:
 * [{ kind, count }] with kind KEEP/DELETE/INSERT. Same script as
 * makefun-diff's greedy search, same tie-breaks.
 */
function editRuns(A, B, n, m) {
  const n1 = n - 1;
  const m1 = m - 1;
  const kEnd = n - m; // only this diagonal can reach both ends
  // d = 0: the snake from (-1, -1) on diagonal 0.
  let x = -1;
  let y = -1;
  while (x < n1 && y < m1 && A[x + 1] === B[y + 1]) { x++; y++; }
  V[0] = x;
  if (x === n1 && y === m1) {
    return x + 1 > 0 ? [{ kind: KEEP, count: x + 1 }] : [];
  }

  let finalD = -1;
  let finalK = 0;
  for (let d = 1; d <= n + m; d++) {
    const basePrev = (d - 1) * (d - 1);
    const baseCur = d * d;
    // Diagonal k = -d: no deletion candidate (k - 1 is out of range).
    {
      const k = -d;
      const add = V[basePrev];
      if (add !== NONE && add - k < m) {
        let xx = add;
        let yy = xx - k;
        while (xx < n1 && yy < m1 && A[xx + 1] === B[yy + 1]) { xx++; yy++; }
        V[baseCur + k + d] = xx;
        if (k === kEnd && xx === n1) { finalD = d; finalK = k; break; }
      } else {
        V[baseCur + k + d] = NONE;
      }
    }
    // Middle diagonals: both candidates in range.
    let ri = basePrev;
    let ai = basePrev + 2;
    let si = baseCur + 2;
    for (let k = -d + 2; k <= d - 2; k += 2, ri += 2, ai += 2, si += 2) {
      const rem = V[ri];
      const add = V[ai];
      const canRemove = rem !== NONE && rem + 1 < n;
      const canAdd = add !== NONE && add - k < m;
      if (!canRemove && !canAdd) {
        V[si] = NONE;
        continue;
      }
      // Furthest into the old text; the deletion when both reach one point.
      const byDel = canRemove ? rem + 1 : NONE;
      const byIns = canAdd ? add : NONE;
      let xx = byDel >= byIns ? byDel : byIns;
      let yy = xx - k;
      while (xx < n1 && yy < m1 && A[xx + 1] === B[yy + 1]) { xx++; yy++; }
      V[si] = xx;
      if (k === kEnd && xx === n1) { finalD = d; finalK = k; break; }
    }
    if (finalD >= 0) break;
    // Diagonal k = d: no insertion candidate (k + 1 is out of range).
    {
      const k = d;
      const rem = V[basePrev + 2 * d - 2];
      if (rem !== NONE && rem + 1 < n) {
        let xx = rem + 1;
        let yy = xx - k;
        while (xx < n1 && yy < m1 && A[xx + 1] === B[yy + 1]) { xx++; yy++; }
        V[baseCur + k + d] = xx;
        if (k === kEnd && xx === n1) { finalD = d; finalK = k; break; }
      } else {
        V[baseCur + k + d] = NONE;
      }
    }
  }
  if (finalD < 0) throw new Error('makefun-diff: the search ended without reaching both ends');

  // Walk the snapshots back: at each level the snake, then the edit step.
  const runs = [];
  let d = finalD;
  let k = finalK;
  x = V[d * d + k + d];
  for (let i = d; i >= 1; i--) {
    const basePrev = (i - 1) * (i - 1);
    const rem = k > -i ? V[basePrev + k + i - 2] : NONE;
    const add = k < i ? V[basePrev + k + i] : NONE;
    const canRemove = rem !== NONE && rem + 1 < n;
    const canAdd = add !== NONE && add - k < m;
    const byDel = canRemove ? rem + 1 : NONE;
    const byIns = canAdd ? add : NONE;
    const isDel = byDel >= byIns;
    const xPre = isDel ? byDel : byIns;
    const snake = x - xPre;
    if (snake > 0) runs.push({ kind: KEEP, count: snake });
    runs.push({ kind: isDel ? DELETE : INSERT, count: 1 });
    if (isDel) { k -= 1; x = rem; } else { k += 1; x = add; }
  }
  if (x + 1 > 0) runs.push({ kind: KEEP, count: x + 1 });
  runs.reverse();
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.kind === r.kind) last.count += r.count;
    else merged.push({ kind: r.kind, count: r.count });
  }
  return merged;
}

/** make.fun's own patch of input.old into input.new. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const aParts = input.old.split('\n');
  const bParts = input.new.split('\n');
  const aLast = aParts.length - 1;
  const bLast = bParts.length - 1;
  const n = aParts[aLast] === '' ? aLast : aParts.length;
  const m = bParts[bLast] === '' ? bLast : bParts.length;

  // Intern every line to a small id: the part's id shifted, with its
  // newline-ness in the low bit, so equal lines share one id and only one.
  const map = new Map();
  let nextId = 0;
  const A = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const p = aParts[i];
    let id = map.get(p);
    if (id === undefined) { id = nextId++; map.set(p, id); }
    A[i] = (id << 1) | (i < aLast ? 1 : 0);
  }
  const B = new Uint32Array(m);
  for (let j = 0; j < m; j++) {
    const p = bParts[j];
    let id = map.get(p);
    if (id === undefined) { id = nextId++; map.set(p, id); }
    B[j] = (id << 1) | (j < bLast ? 1 : 0);
  }

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...editRuns(A.subarray(prefix, n - suffix), B.subarray(prefix, m - suffix), n - prefix - suffix, m - prefix - suffix));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two
  // kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) {
        out.push('=', aParts[at], at < aLast ? '\n' : '\n%\n');
      }
      for (let i = 0; i < c.dels; i++) {
        const idx = c.o + i;
        out.push('-', aParts[idx], idx < aLast ? '\n' : '\n%\n');
      }
      for (let i = 0; i < c.ins; i++) {
        const idx = c.p + i;
        out.push('+', bParts[idx], idx < bLast ? '\n' : '\n%\n');
      }
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) {
      out.push('=', aParts[at], at < aLast ? '\n' : '\n%\n');
    }
  }
  return out.join('');
}
