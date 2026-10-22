// Compares Tree with Set, a plain object and a sorted array.
// Usage: node --expose-gc test/bench.js [n] [datasets,...] [structures,...]
// n defaults to 100,000 keys; use 1e6 to see how each structure behaves when
// it is much larger than the CPU cache.
// Without --expose-gc, memory, prefix queries and sorted iteration are skipped.
import {Tree} from "../critbit.js";

const N = +(process.argv[2] || 1e5);
const only = process.argv[3] ? process.argv[3].split(",") : null;
const onlyS = process.argv[4] ? process.argv[4].split(",") : null;
const REPS = 5;

let seed = 1;
const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
// Copy through a Buffer so every key is a plain sequential string, like one
// read from I/O, rather than a flattened cons string with an extra indirection.
const flat = s => Buffer.from(s, "latin1").toString("latin1");

// Each generator returns a fresh string instance for id i (no cached hash).
// Prefix query length per dataset, chosen to match roughly 100-1000 keys.
const prefixLength = {bench: 10, short: 2, urls: 37, long: 186};
const datasets = {
  bench: i => { let d = "http://" + i.toString(16); while (d.length < 50) d += d.substr(0, 50 - d.length); return d; },
  short: (() => { const t = []; return i => t[i] ??= (seed = i + 1, Array.from({length: 6 + (random() * 7 | 0)}, () => (random() * 36 | 0).toString(36)).join("")); })(),
  urls: i => "https://example.com/api/v1/users/" + i + "/profile",
  long: i => "x".repeat(180) + i.toString(36).padStart(8, "0"),
};

const structures = {
  tree: {
    build(keys) { const t = new Tree; for (const k of keys) t.add(k); return t; },
    has: (t, k) => t.has(k),
    del: (t, k) => t.delete(k),
    prefix(t, p) { let n = 0; t.prefixed(p, () => ++n); return n; },
    sorted(t) { const a = []; t.prefixed("", k => a.push(k)); return a; },
  },
  "tree-optimized": {
    build(keys) { const t = new Tree; for (const k of keys) t.add(k); return t.optimize(); },
    has: (t, k) => t.has(k),
    del: (t, k) => t.delete(k),
    prefix(t, p) { let n = 0; t.prefixed(p, () => ++n); return n; },
    sorted(t) { const a = []; t.prefixed("", k => a.push(k)); return a; },
  },
  // Builds the tree in a single pass from keys that are already sorted, as
  // when reading from a sorted file or index. Sorting isn't timed.
  "tree-from-sorted": {
    input: keys => keys.slice().sort(),
    build: keys => new Tree(keys),
    has: (t, k) => t.has(k),
    del: (t, k) => t.delete(k),
    prefix(t, p) { let n = 0; t.prefixed(p, () => { n++; }); return n; },
    sorted(t) { const a = []; t.prefixed("", k => { a.push(k); }); return a; },
  },
  set: {
    build(keys) { const s = new Set; for (const k of keys) s.add(k); return s; },
    has: (s, k) => s.has(k),
    del: (s, k) => s.delete(k),
    prefix(s, p) { let n = 0; for (const k of s) if (k.startsWith(p)) n++; return n; },
    sorted: s => Array.from(s).sort(),
  },
  object: {
    build(keys) { const o = Object.create(null); for (const k of keys) o[k] = true; return o; },
    has: (o, k) => o[k] === true,
    del: (o, k) => delete o[k],
  },
  sorted: {
    build: keys => keys.slice().sort(),
    has(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = lo + hi >>> 1; if (a[m] < x) lo = m + 1; else hi = m; } return a[lo] === x; },
    prefix(a, p) { let lo = 0, hi = a.length; while (lo < hi) { const m = lo + hi >>> 1; if (a[m] < p) lo = m + 1; else hi = m; } let n = 0; while (lo < a.length && a[lo++].startsWith(p)) n++; return n; },
    sorted: a => a,
  },
};

const now = () => performance.now();
const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const fresh = (gen, from, n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = flat(gen(from + i)); return a; };
function shuffle(a, s) { seed = s; for (let i = a.length - 1; i > 0; i--) { const j = random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Keys are inserted in one random order and looked up in another, so lookups
// don't benefit from walking memory in allocation order.
const order = shuffle(Array.from({length: N}, (_, i) => i), 42);
const lookupOrder = shuffle(Array.from({length: N}, (_, i) => i), 43);

for (const [dname, gen] of Object.entries(datasets)) {
  if (only && !only.includes(dname)) continue;
  const sample = gen(0);
  console.log(`\n## ${dname} (n=${N}, e.g. ${JSON.stringify(sample.length > 40 ? sample.slice(0, 20) + "…" + sample.slice(-12) : sample)}, ${sample.length} chars)`);
  // Keys use even ids and misses use odd ids, so misses come from the same
  // distribution as keys and are spread evenly between them.
  const ids = order.map(i => 2 * i),
        lookupIds = lookupOrder.map(i => 2 * i);
  const rows = [];
  for (const [sname, S] of Object.entries(structures)) {
    if (onlyS && !onlyS.includes(sname)) continue;
    const r = {name: sname};
    const t = {build: [], hitFresh: [], hitWarm: [], miss: [], del: []};
    let ok = true;
    for (let rep = 0; rep < REPS; rep++) {
      let keys = ids.map(i => flat(gen(i)));
      if (S.input) keys = S.input(keys);
      let s0 = now(); const s = S.build(keys); t.build.push(now() - s0);
      const probes = lookupIds.map(i => flat(gen(i)));
      s0 = now(); for (const k of probes) ok &&= S.has(s, k); t.hitFresh.push(now() - s0);
      s0 = now(); for (const k of probes) ok &&= S.has(s, k); t.hitWarm.push(now() - s0);
      const misses = lookupIds.map(i => flat(gen(i + 1)));
      s0 = now(); for (const k of misses) ok &&= !S.has(s, k); t.miss.push(now() - s0);
      if (S.del) { const dp = lookupIds.map(i => flat(gen(i))); s0 = now(); for (const k of dp) S.del(s, k); t.del.push(now() - s0); }
    }
    for (const k in t) r[k] = t[k].length ? median(t[k]) : NaN;
    r.ok = ok;
    // Memory: structure only (keys array allocated beforehand and shared).
    if (globalThis.gc) {
      let keys = ids.map(i => flat(gen(i)));
      if (S.input) keys = S.input(keys);
      gc(); gc(); const m0 = process.memoryUsage();
      let s = S.build(keys);
      gc(); gc(); const m1 = process.memoryUsage();
      r.mem = (m1.heapUsed - m0.heapUsed + m1.arrayBuffers - m0.arrayBuffers) / N;
      if (S.prefix) {
        const prefixes = Array.from({length: 1000}, (_, i) => { const k = gen(ids[i * 997 % N]); return flat(k.slice(0, prefixLength[dname])); });
        // Scanning a Set is slow, so it runs only the first 10 queries, and
        // its average hit count is over those.
        const q = sname === "set" ? 10 : prefixes.length;
        let total = 0, s0 = now();
        for (let i = 0; i < q; i++) total += S.prefix(s, prefixes[i]);
        r.prefixUs = (now() - s0) / q * 1e3; r.prefixHits = total / q;
        s0 = now(); const sorted = S.sorted(s); r.sorted = now() - s0;
      }
      s = null;
    }
    rows.push(r);
  }
  const f = (v, d = 0) => Number.isNaN(v) || v === undefined ? "–" : v.toFixed(d);
  console.log("| | build | has (fresh) | has (repeat) | miss | delete | prefix query | sorted iteration | bytes/key |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.name}${r.ok ? "" : " (WRONG)"} | ${f(r.build)}ms | ${f(r.hitFresh)}ms | ${f(r.hitWarm)}ms | ${f(r.miss)}ms | ${f(r.del)}ms | ${f(r.prefixUs, 1)}µs (${f(r.prefixHits, 1)} hits) | ${f(r.sorted)}ms | ${f(r.mem)} |`);
}
