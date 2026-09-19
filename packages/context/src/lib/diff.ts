/** Patience diff (unique-line anchors + recursion, DP LCS for small gaps). Good quality, bounded memory. */
export type DiffOp = { type: "eq"; a: number; b: number } | { type: "del"; a: number } | { type: "add"; b: number };

function lcsDp(a: string[], b: string[], aOff: number, bOff: number, ops: DiffOp[]): void {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", a: aOff + i, b: bOff + j });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      ops.push({ type: "del", a: aOff + i });
      i++;
    } else {
      ops.push({ type: "add", b: bOff + j });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", a: aOff + i++ });
  while (j < m) ops.push({ type: "add", b: bOff + j++ });
}

function patience(a: string[], b: string[], aOff: number, bOff: number, ops: DiffOp[], depth: number): void {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) {
    ops.push({ type: "eq", a: aOff + pre, b: bOff + pre });
    pre++;
  }
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const aBase = aOff + pre;
  const bBase = bOff + pre;

  if (am.length === 0) {
    for (let j = 0; j < bm.length; j++) ops.push({ type: "add", b: bBase + j });
  } else if (bm.length === 0) {
    for (let i = 0; i < am.length; i++) ops.push({ type: "del", a: aBase + i });
  } else if (am.length * bm.length <= 2_000_000) {
    lcsDp(am, bm, aBase, bBase, ops);
  } else if (depth > 40) {
    for (let i = 0; i < am.length; i++) ops.push({ type: "del", a: aBase + i });
    for (let j = 0; j < bm.length; j++) ops.push({ type: "add", b: bBase + j });
  } else {
    const countA = new Map<string, number>();
    const countB = new Map<string, number>();
    for (const l of am) countA.set(l, (countA.get(l) ?? 0) + 1);
    for (const l of bm) countB.set(l, (countB.get(l) ?? 0) + 1);
    const posB = new Map<string, number>();
    bm.forEach((l, j) => {
      if (countA.get(l) === 1 && countB.get(l) === 1) posB.set(l, j);
    });
    const pairs: Array<[number, number]> = [];
    am.forEach((l, i) => {
      const j = posB.get(l);
      if (j !== undefined) pairs.push([i, j]);
    });
    if (pairs.length === 0) {
      for (let i = 0; i < am.length; i++) ops.push({ type: "del", a: aBase + i });
      for (let j = 0; j < bm.length; j++) ops.push({ type: "add", b: bBase + j });
    } else {
      const tails: number[] = [];
      const tailIdx: number[] = [];
      const prev = new Array<number>(pairs.length).fill(-1);
      for (let k = 0; k < pairs.length; k++) {
        const j = pairs[k]![1];
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (tails[mid]! < j) lo = mid + 1;
          else hi = mid;
        }
        tails[lo] = j;
        tailIdx[lo] = k;
        prev[k] = lo > 0 ? tailIdx[lo - 1]! : -1;
      }
      const anchors: Array<[number, number]> = [];
      for (let k = tailIdx[tails.length - 1]!; k !== -1; k = prev[k]!) anchors.push(pairs[k]!);
      anchors.reverse();
      let ai = 0;
      let bj = 0;
      for (const [i, j] of anchors) {
        patience(am.slice(ai, i), bm.slice(bj, j), aBase + ai, bBase + bj, ops, depth + 1);
        ops.push({ type: "eq", a: aBase + i, b: bBase + j });
        ai = i + 1;
        bj = j + 1;
      }
      patience(am.slice(ai), bm.slice(bj), aBase + ai, bBase + bj, ops, depth + 1);
    }
  }
  for (let k = suf - 1; k >= 0; k--) ops.push({ type: "eq", a: aOff + a.length - 1 - k, b: bOff + b.length - 1 - k });
}

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  patience(a, b, 0, 0, ops, 0);
  return ops;
}

export interface Hunk {
  /** 0-based inclusive op index range */
  from: number;
  to: number;
  /** 0-based line index in `a` of the first/last non-add op in the hunk, or -1 */
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
  added: number;
  removed: number;
}

/** Group changed ops into hunks; changes separated by ≤ `join` equal lines merge. */
export function hunksOf(ops: DiffOp[], join = 3): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.type === "eq") {
      i++;
      continue;
    }
    const from = i;
    let to = i;
    let k = i;
    while (k < ops.length) {
      if (ops[k]!.type !== "eq") {
        to = k;
        k++;
        continue;
      }
      let run = 0;
      let kk = k;
      while (kk < ops.length && ops[kk]!.type === "eq") {
        run++;
        kk++;
      }
      if (run <= join && kk < ops.length) {
        k = kk;
        continue;
      }
      break;
    }
    let added = 0;
    let removed = 0;
    let aStart = -1;
    let aEnd = -1;
    let bStart = -1;
    let bEnd = -1;
    for (let x = from; x <= to; x++) {
      const op = ops[x]!;
      if (op.type === "add") added++;
      if (op.type === "del") removed++;
      if (op.type !== "add") {
        if (aStart === -1) aStart = op.a;
        aEnd = op.a;
      }
      if (op.type !== "del") {
        if (bStart === -1) bStart = op.b;
        bEnd = op.b;
      }
    }
    hunks.push({ from, to, aStart, aEnd, bStart, bEnd, added, removed });
    i = to + 1;
  }
  return hunks;
}
