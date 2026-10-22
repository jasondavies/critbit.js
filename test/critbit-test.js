import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {Tree, TreeMap} from "../critbit.js";

const max = 1e3,
    len = 10;

describe("critbit tree", () => {
  const tree = new Tree();

  test("add", () => {
    for (let i = 0; i < max; i++) {
      const alreadyExists = tree.has(key(i)),
          size = tree.size;
      assert.equal(tree.add(key(i)), tree);
      assert.equal(tree.size, size + !alreadyExists);
    }
  });

  test("has", () => {
    for (let i = 0; i < max; i++) {
      assert.equal(tree.has(key(i)), true);
    }
  });

  test("prefixed", () => {
    const prefix = (0x12).toString(16),
        found = [],
        expected = new Set();
    for (let i = 0; i < max; i++) {
      if (key(i).startsWith(prefix)) expected.add(key(i));
    }
    tree.prefixed(prefix, k => {
      found.push(k);
    });
    assert.deepEqual(found, [...expected].sort());
  });

  test("delete", () => {
    for (let i = 0; i < max; i++) {
      const alreadyExists = tree.has(key(i));
      assert.equal(tree.delete(key(i)), alreadyExists);
    }
    assert.equal(tree.size, 0);
  });
});

test("keys with code units above 0xff", () => {
  const tree = new Tree(),
      keys = ["a", "\u0101", "\u0161", "b", "\u4e2d\u6587", "\u4e2d", "\ud83d\ude00", "\uffff"];
  for (const k of keys) tree.add(k);
  for (const k of keys) {
    assert.equal(tree.has(k), true, JSON.stringify(k));
  }
  for (const k of ["\u0100", "\u4e2e", "\ud83d", "\ud83d\ude01", "c"]) {
    assert.equal(tree.has(k), false, JSON.stringify(k));
  }
});

test("delete reuses freed slots", () => {
  const tree = new Tree();
  tree.add("x");
  for (let i = 0; i < max; i++) {
    tree.add(key(i));
    assert.equal(tree.delete(key(i)), true);
  }
  assert.equal(tree.has("x"), true);
  assert.equal(tree.size, 1);
  assert.equal(tree._keys.length, 2);
  assert.equal(tree._next, 4);
});

test("size and clear", () => {
  const tree = new Tree(["b", "a", "b"]);
  assert.equal(tree.size, 2);
  tree.add("a").add("c");
  assert.equal(tree.size, 3);
  tree.delete("x");
  assert.equal(tree.size, 3);
  tree.clear();
  assert.equal(tree.size, 0);
  assert.equal(tree.has("a"), false);
  assert.deepEqual([...tree], []);
  tree.add("d");
  assert.deepEqual([...tree], ["d"]);
  const map = new TreeMap([["a", 1]]);
  map.clear();
  map.set("b", 2);
  assert.deepEqual([...map], [["b", 2]]);
});

test("constructors build from sorted, unsorted and repeated keys", () => {
  for (const keys of [
    [],
    ["a"],
    ["a", "b", "c"],
    ["", "a", "aa", "ab", "b", "ba", "\u4e2d", "\uffff"],
    ["a", "a", "b", "b", "b", "c"],
    ["c", "b", "a"],
    ["a", "c", "b", "d"],
    ["ab", "a"],
    ["a", "b", "a"],
    Array.from({length: 5000}, (_, i) => i.toString(36).padStart(4, "0")),
    Array.from({length: 5000}, (_, i) => (i * 7919 % 5000).toString(36))
  ]) {
    const sorted = [...new Set(keys)].sort(),
        tree = new Tree(keys);
    assert.equal(tree.size, sorted.length);
    assert.deepEqual([...tree], sorted);
    for (const k of sorted) assert.equal(tree.has(k), true, JSON.stringify(k));
    const last = "\uffff\uffff\uffff";
    assert.equal(tree.has(last), false);
    tree.add(last);
    assert.equal(tree.max(), last);
    assert.deepEqual([...new Tree(new Set(keys))], sorted);
  }
  const map = new TreeMap([["a", 1], ["b", 2], ["b", 3], ["c", 4], ["a", 5]]);
  assert.deepEqual([...map], [["a", 5], ["b", 3], ["c", 4]]);
  assert.deepEqual([...new TreeMap(new Map([["y", 1], ["x", 2]]))], [["x", 2], ["y", 1]]);
});

test("random operations match a Set", () => {
  const tree = new Tree(),
      set = new Set(),
      alphabet = ["\0", "a", "b", "\u00ff", "\u0100", "\u4e2d", "\uffff"];
  let seed = 1;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647,
      letter = () => alphabet[random() * alphabet.length | 0];
  for (let i = 0; i < 2e4; i++) {
    let k = "";
    for (let n = random() * 4 | 0; n >= 0; n--) k += letter();
    const has = set.has(k);
    assert.equal(tree.has(k), has);
    if (random() < .5) {
      tree.add(k);
      set.add(k);
    } else {
      assert.equal(tree.delete(k), set.delete(k));
    }
    assert.equal(tree.size, set.size);
  }
  for (const prefix of alphabet) {
    const found = [];
    tree.prefixed(prefix, k => {
      found.push(k);
    });
    assert.deepEqual(found, [...set].filter(k => k.startsWith(prefix)).sort());
  }
  const other = new Tree(),
      otherSet = new Set();
  for (let i = 0; i < 500; i++) {
    const k = letter() + letter();
    other.add(k);
    otherSet.add(k);
  }
  const union = [...new Set([...set, ...otherSet])].sort(),
      intersection = [...set].filter(k => otherSet.has(k)).sort();
  assert.deepEqual([...tree.union(other)], union);
  assert.equal(tree.union(other).size, union.length);
  assert.deepEqual([...tree.intersection(other)], intersection);
  assert.equal(tree.intersection(other).size, intersection.length);

  const sorted = [...set].sort();
  checkOrdered(tree, sorted, letter);
  tree.optimize();
  assert.equal(tree._free, 0);
  assert.equal(tree._keys.length, sorted.length);
  assert.equal(tree.size, sorted.length);
  checkOrdered(tree, sorted, letter);
  for (const k of sorted) assert.equal(tree.has(k), true);
  checkOrdered(new Tree(sorted), sorted, letter);
});

// Checks min, max, successor, predecessor and iteration against sorted, an
// array of the tree's keys in order, using queries built from letter().
function checkOrdered(tree, sorted, letter) {
  assert.equal(tree.min(), sorted[0]);
  assert.equal(tree.max(), sorted[sorted.length - 1]);
  assert.deepEqual([...tree], sorted);
  for (let i = 0; i < 500; i++) {
    let q = "";
    for (let n = i % 5; n > 0; n--) q += letter();
    if (i % 7 === 0 && sorted.length) q = sorted[i % sorted.length];
    assert.equal(tree.successor(q), sorted.find(k => k > q), JSON.stringify(q));
    assert.equal(tree.predecessor(q), sorted.findLast(k => k < q), JSON.stringify(q));
    if (i % 50 === 0) assert.deepEqual([...tree.keys(q)], sorted.filter(k => k >= q), JSON.stringify(q));
  }
}

test("prefixed visits keys in order and stops when f returns false", () => {
  const tree = new Tree(["b", "a", "ab", "\u4e2d", "aa", ""]);
  assert.deepEqual(keys(tree), ["", "a", "aa", "ab", "b", "\u4e2d"]);
  const found = [];
  tree.prefixed("a", k => {
    found.push(k);
    return found.length < 2;
  });
  assert.deepEqual(found, ["a", "aa"]);
  const all = [];
  tree.prefixed("a", k => {
    all.push(k);
    return 0;
  });
  assert.deepEqual(all, ["a", "aa", "ab"]);
});

test("prefixed handles deep trees", () => {
  // Each key differs from all later keys at a later bit, so the tree is a
  // chain as deep as the number of keys.
  const tree = new Tree(),
      n = 2e4,
      all = [];
  for (let j = 0; j < n; j++) {
    const k = "\uffff".repeat(j >> 4) + String.fromCharCode((0xffff << (16 - (j & 15))) & 0xffff);
    tree.add(k);
    all.push(k);
  }
  assert.deepEqual(keys(tree), all.sort());
});

test("union and intersection return new trees", () => {
  const a = new Tree(["a", "b", "c", "d"]),
      b = new Tree(["b", "c", "e"]);
  a.delete("d");
  const union = a.union(b),
      intersection = a.intersection(b);
  assert.deepEqual([...union], ["a", "b", "c", "e"]);
  assert.deepEqual([...intersection], ["b", "c"]);
  union.add("f");
  assert.deepEqual([...a], ["a", "b", "c"]);
  assert.deepEqual([...b], ["b", "c", "e"]);
  assert.deepEqual([...new Tree().union(b)], ["b", "c", "e"]);
  assert.deepEqual([...b.union(new Tree())], ["b", "c", "e"]);
  assert.deepEqual([...new Tree().intersection(b)], []);
  assert.deepEqual([...b.intersection(new Tree())], []);
});

test("ordered operations on small trees", () => {
  const tree = new Tree();
  assert.equal(tree.min(), undefined);
  assert.equal(tree.max(), undefined);
  assert.equal(tree.successor("a"), undefined);
  assert.equal(tree.predecessor("a"), undefined);
  assert.deepEqual([...tree], []);
  assert.deepEqual([...tree.keys("a")], []);
  tree.add("b");
  assert.equal(tree.min(), "b");
  assert.equal(tree.max(), "b");
  assert.equal(tree.successor("a"), "b");
  assert.equal(tree.successor("b"), undefined);
  assert.equal(tree.successor(""), "b");
  assert.equal(tree.predecessor("c"), "b");
  assert.equal(tree.predecessor("b"), undefined);
  assert.equal(tree.predecessor("ba"), "b");
  for (const k of ["d", "ba", "c", "bb"]) tree.add(k);
  assert.deepEqual([...tree], ["b", "ba", "bb", "c", "d"]);
  assert.equal(tree.successor("b"), "ba");
  assert.equal(tree.successor("bab"), "bb");
  assert.equal(tree.successor("bc"), "c");
  assert.equal(tree.successor("d"), undefined);
  assert.equal(tree.successor("\uffff"), undefined);
  assert.equal(tree.predecessor("bab"), "ba");
  assert.equal(tree.predecessor("bc"), "bb");
  assert.equal(tree.predecessor("d"), "c");
  assert.equal(tree.predecessor("\uffff"), "d");
  assert.equal(tree.predecessor(""), undefined);
  assert.deepEqual([...tree.keys("bb")], ["bb", "c", "d"]);
  assert.deepEqual([...tree.keys("bba")], ["c", "d"]);
  assert.deepEqual([...tree.keys("")], ["b", "ba", "bb", "c", "d"]);
});

test("optimize keeps keys and reuses no freed slots", () => {
  const tree = new Tree();
  for (let i = 0; i < max; i++) tree.add("k" + i);
  for (let i = 0; i < max; i += 2) tree.delete("k" + i);
  assert.equal(tree.optimize(), tree);
  assert.equal(tree._free, 0);
  assert.equal(tree._keys.length, max / 2);
  assert.equal(tree.size, max / 2);
  for (let i = 0; i < max; i++) assert.equal(tree.has("k" + i), i % 2 === 1);
  tree.add("k0");
  assert.equal(tree.has("k0"), true);
  assert.equal(new Tree().optimize().min(), undefined);
});

test("TreeMap stores values", () => {
  const map = new TreeMap();
  assert.equal(map.get("a"), undefined);
  assert.equal(map.set("b", 2), map);
  map.set("a", 1).set("c", 3).set("b", 20);
  assert.equal(map.size, 3);
  assert.equal(map.get("a"), 1);
  assert.equal(map.get("b"), 20);
  assert.equal(map.get("d"), undefined);
  assert.equal(map.has("c"), true);
  assert.deepEqual([...map], [["a", 1], ["b", 20], ["c", 3]]);
  assert.deepEqual([...map.keys()], ["a", "b", "c"]);
  assert.deepEqual([...map.values("b")], [20, 3]);
  assert.deepEqual([...map.entries("bb")], [["c", 3]]);
  const found = [];
  map.prefixed("", (k, v) => {
    found.push([k, v]);
  });
  assert.deepEqual(found, [["a", 1], ["b", 20], ["c", 3]]);
  assert.equal(map.delete("b"), true);
  assert.equal(map.delete("b"), false);
  assert.equal(map.get("b"), undefined);
  map.set("d", 4);
  assert.equal(map.get("d"), 4);
  assert.deepEqual([...map], [["a", 1], ["c", 3], ["d", 4]]);

  const other = new TreeMap([["c", 30], ["e", 50]]);
  assert.deepEqual([...map.union(other)], [["a", 1], ["c", 3], ["d", 4], ["e", 50]]);
  assert.deepEqual([...map.intersection(other)], [["c", 3]]);
  assert.ok(map.union(other) instanceof TreeMap);
  assert.deepEqual([...map.union(new Tree())], [["a", 1], ["c", 3], ["d", 4]]);

  for (const k of ["a", "c", "d"]) map.delete(k);
  assert.deepEqual([...map], []);
  map.set("x", 1);
  assert.deepEqual([...map], [["x", 1]]);
  map.optimize();
  assert.equal(map.get("x"), 1);
});

test("TreeMap matches a Map after random operations and growth", () => {
  const map = new TreeMap(),
      reference = new Map();
  let seed = 3;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 2e4; i++) {
    const k = (random() * 5e3 | 0).toString(36);
    if (random() < .7) {
      map.set(k, i);
      reference.set(k, i);
    } else {
      assert.equal(map.delete(k), reference.delete(k));
    }
    assert.equal(map.size, reference.size);
    if (i % 5e3 === 0) map.optimize();
  }
  const sorted = [...reference].sort((a, b) => a[0] < b[0] ? -1 : 1);
  assert.deepEqual([...map], sorted);
  assert.deepEqual([...new TreeMap(sorted)], sorted);
  for (const [k, v] of reference) assert.equal(map.get(k), v);
});

function keys(tree) {
  const result = [];
  tree.prefixed("", k => {
    result.push(k);
  });
  return result;
}

function key(d) {
  d = d.toString(16);
  while (d.length < len) {
    d += d.substr(0, len - d.length);
  }
  return d;
}

test("non-string keys", () => {
  const tree = new Tree(["a"]),
      map = new TreeMap([["a", 1]]);
  for (const key of [undefined, null, 1, {}, ["a"]]) {
    assert.equal(tree.has(key), false);
    assert.equal(new Tree().has(key), false);
    assert.equal(tree.delete(key), false);
    assert.equal(map.get(key), undefined);
    assert.throws(() => tree.add(key), TypeError);
    assert.throws(() => map.set(key, 1), TypeError);
    assert.throws(() => new Tree([key]), TypeError);
    assert.throws(() => new Tree(["a", key]), TypeError);
    assert.throws(() => new TreeMap([[key, 1]]), TypeError);
    assert.throws(() => tree.successor(key), TypeError);
    assert.throws(() => tree.predecessor(key), TypeError);
    if (key !== undefined) assert.throws(() => tree.keys(key), TypeError);
    assert.throws(() => tree.prefixed(key, () => {}), TypeError);
  }
  assert.deepEqual([...tree], ["a"]);
  assert.throws(() => new TreeMap(["ab"]), TypeError);
  assert.throws(() => new TreeMap([1]), TypeError);
  assert.throws(() => tree.union(new Set(["b"])), TypeError);
  assert.throws(() => tree.intersection(null), TypeError);
});

test("Set and Map compatibility", () => {
  const tree = new Tree(["b", "a"]),
      map = new TreeMap([["b", 2], ["a", 1]]);
  assert.equal(Object.prototype.toString.call(tree), "[object Tree]");
  assert.equal(Object.prototype.toString.call(map), "[object TreeMap]");
  assert.deepEqual([...tree.values()], ["a", "b"]);
  assert.deepEqual([...tree.entries()], [["a", "a"], ["b", "b"]]);
  assert.deepEqual([...tree.entries("b")], [["b", "b"]]);
  const calls = [],
      self = {};
  tree.forEach(function(value, key, t) {
    calls.push([value, key, t === tree, this === self]);
    return false;
  }, self);
  assert.deepEqual(calls, [["a", "a", true, true], ["b", "b", true, true]]);
  calls.length = 0;
  map.forEach(function(value, key, m) {
    calls.push([value, key, m === map, this === self]);
  }, self);
  assert.deepEqual(calls, [[1, "a", true, true], [2, "b", true, true]]);
  assert.deepEqual(tree.keys().toArray(), ["a", "b"]);
  assert.deepEqual(map.entries().map(([k, v]) => k + v).toArray(), ["a1", "b2"]);
  assert.deepEqual(map.values().filter(v => v > 1).toArray(), [2]);
  const it = tree.keys();
  assert.equal(it[Symbol.iterator](), it);
});

test("changing a tree during iteration", () => {
  // Deleting keys not yet visited skips them.
  let tree = new Tree(["a", "b", "c", "d"]),
      seen = [];
  for (const k of tree) {
    seen.push(k);
    if (k === "a") tree.delete("b");
  }
  assert.deepEqual(seen, ["a", "c", "d"]);

  // Deleting the current key, and every key, works.
  tree = new Tree(["a", "b", "c", "d"]);
  seen = [];
  for (const k of tree) {
    seen.push(k);
    tree.delete(k);
  }
  assert.deepEqual(seen, ["a", "b", "c", "d"]);
  assert.equal(tree.size, 0);

  // Keys added after the current key are visited; earlier ones aren't.
  tree = new Tree(["b", "d"]);
  seen = [];
  for (const k of tree) {
    seen.push(k);
    if (k === "b") tree.add("a").add("c").add("e");
  }
  assert.deepEqual(seen, ["b", "c", "d", "e"]);

  // Growth, optimize and clear during iteration.
  tree = new Tree(Array.from({length: 100}, (_, i) => "k" + String(i).padStart(3, "0")));
  seen = [];
  for (const k of tree) {
    seen.push(k);
    if (k === "k010") for (let i = 100; i < 2000; i++) tree.add("k" + i);
    if (k === "k020") tree.optimize();
    if (k === "k030") tree.clear();
  }
  assert.equal(seen.length, 31);
  assert.equal(seen[30], "k030");

  // An exhausted iterator stays exhausted.
  tree = new Tree(["a"]);
  const it = tree.keys();
  assert.deepEqual(it.next(), {value: "a", done: false});
  assert.equal(it.next().done, true);
  tree.add("b");
  assert.equal(it.next().done, true);

  // An iterator started before clear() stops.
  const map = new TreeMap([["a", 1], ["b", 2]]),
      entries = map.entries();
  entries.next();
  map.clear();
  assert.equal(entries.next().done, true);

  // Callbacks of prefixed and forEach may change the tree too.
  tree = new Tree(["a", "ab", "abc", "abd", "b", "ba"]);
  seen = [];
  tree.prefixed("a", k => {
    seen.push(k);
    if (k === "ab") tree.delete("abc");
    if (k === "abd") tree.add("abe").add("b0");
  });
  assert.deepEqual(seen, ["a", "ab", "abd", "abe"]);
  seen = [];
  tree.forEach(k => {
    seen.push(k);
    tree.delete(k);
  });
  assert.deepEqual(seen, ["a", "ab", "abd", "abe", "b", "b0", "ba"]);
  assert.equal(tree.size, 0);
});

test("prefixed with prefixes that match nothing", () => {
  const tree = new Tree(["a", "ab", "b"]),
      found = [];
  for (const prefix of ["c", "abc", "aa", "\u4e2d", "ab\u4e2d", "bbbbbbbbbbbbbbbb"]) {
    tree.prefixed(prefix, k => {
      found.push(k);
    });
  }
  assert.deepEqual(found, []);
  new Tree().prefixed("", k => {
    found.push(k);
  });
  assert.deepEqual(found, []);
});

test("TreeMap has no add, like Map", () => {
  const map = new TreeMap([["a", 1]]);
  assert.equal(map.add, undefined);
  assert.equal("add" in map, false);
  assert.throws(() => map.add("b"), TypeError);
  assert.deepEqual([...map], [["a", 1]]);
  assert.equal(map instanceof Tree, false);
  assert.equal(new Tree() instanceof TreeMap, false);
});

test("TreeMap.union with a Tree", () => {
  const map = new TreeMap([["a", 1], ["c", 3]]),
      union = map.union(new Tree(["b", "c"]));
  assert.deepEqual([...union], [["a", 1], ["b", undefined], ["c", 3]]);
  assert.deepEqual([...new Tree(["b"]).union(map)], ["a", "b", "c"]);
  assert.deepEqual([...map.intersection(new Tree(["c", "d"]))], [["c", 3]]);
});

test("growth keeps keys, values and iterators", () => {
  const map = new TreeMap(),
      reference = new Map(),
      seen = [];
  for (let i = 0; i < 20000; i++) {
    map.set("a" + i, i);
    reference.set("a" + i, i);
  }
  const it = map.keys();
  for (let i = 0; i < 10; i++) seen.push(it.next().value);
  // Grow the tree, deleting some keys and reusing their slots.
  for (let i = 0; i < 20000; i++) {
    map.set("b" + i, i);
    reference.set("b" + i, i);
    if (i % 3 === 0) {
      map.delete("a" + i);
      reference.delete("a" + i);
    }
  }
  checkTree(map, reference, true);
  for (let x = it.next(); !x.done; x = it.next()) seen.push(x.value);
  // The iterator carries on after the tenth key, visiting the keys after it.
  const tenth = seen[9];
  assert.deepEqual(seen.slice(10), [...reference.keys()].sort().filter(k => k > tenth));
});

// Randomly changes trees and maps, checking them against Map and their
// internal structure after each step.
test("random operations keep the tree consistent", () => {
  const alphabet = ["\0", "a", "b", "\u0001", "\u007f", "\u0080", "\u00ff", "\u0100", "\u7fff", "\u8000", "\u4e2d", "\ud83d", "\ude00", "\uffff"];
  let seed = 7;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647,
      randomKey = () => {
        let k = "";
        for (let n = random() * 5 | 0; n > 0; n--) k += alphabet[random() * alphabet.length | 0];
        return k;
      };
  for (let round = 0; round < 40; round++) {
    const isMap = random() < .5,
        n = random() * (random() < .2 ? 2000 : 60) | 0,
        input = Array.from({length: n}, randomKey),
        reference = new Map();
    if (random() < .5) input.sort();
    let tree;
    if (isMap) {
      tree = new TreeMap(input.map((k, i) => [k, i]));
      input.forEach((k, i) => reference.set(k, i));
    } else {
      tree = new Tree(input);
      for (const k of input) reference.set(k, undefined);
    }
    checkTree(tree, reference, isMap);
    for (let step = 0; step < 300; step++) {
      const r = random(),
          k = random() < .5 && input.length ? input[random() * input.length | 0] : randomKey();
      if (r < .45) {
        if (isMap) tree.set(k, step), reference.set(k, step);
        else tree.add(k), reference.set(k, undefined);
      } else if (r < .9) {
        assert.equal(tree.delete(k), reference.delete(k));
      } else if (r < .95) {
        tree.optimize();
      } else if (r < .96) {
        tree.clear();
        reference.clear();
      } else {
        const keys = Array.from({length: random() * 40 | 0}, randomKey),
            other = random() < .5 ? new Tree(keys) : new TreeMap(keys.map(k => [k, "o" + k])),
            union = new Map(reference),
            intersection = new Map([...reference].filter(([k]) => other.has(k)));
        for (const k of other.keys()) {
          if (!union.has(k)) union.set(k, isMap && other instanceof TreeMap ? other.get(k) : undefined);
        }
        checkTree(tree.union(other), union, isMap);
        checkTree(tree.intersection(other), intersection, isMap);
      }
      if (step % 50 === 0) checkTree(tree, reference, isMap);
    }
    checkTree(tree, reference, isMap);
  }
});

// Checks a tree's contents against reference, a Map, and checks its internal
// structure: crits increase down each path, every key is on the correct side
// of each crit, and the free list accounts for every unused slot.
function checkTree(tree, reference, isMap) {
  const sorted = [...reference.keys()].sort();
  assert.equal(tree.size, sorted.length);
  assert.deepEqual([...tree.keys()], sorted);
  if (isMap) assert.deepEqual([...tree], sorted.map(k => [k, reference.get(k)]));
  assert.equal(tree.min(), sorted[0]);
  assert.equal(tree.max(), sorted[sorted.length - 1]);
  if (!tree._next) return;
  const nodes = tree._nodes,
      bit = (key, c) => (c >>> 5) < key.length ? (key.charCodeAt(c >>> 5) | 0x10000) >>> (c & 31) & 1 : 0,
      seen = new Set();
  (function walk(p, minCrit) {
    if (p < 0) {
      assert.equal(seen.has(~p), false);
      seen.add(~p);
      return [tree._keys[~p]];
    }
    assert.ok(p > 0 && p < tree._next);
    const c = nodes[p + 2],
        left = walk(nodes[p], c),
        right = walk(nodes[p + 1], c);
    assert.ok((c ^ 31) > (minCrit ^ 31));
    for (const k of left) assert.equal(bit(k, c), 0);
    for (const k of right) assert.equal(bit(k, c), 1);
    return left.concat(right);
  })(nodes[0], -1);
  let freed = 0;
  for (let p = tree._free; p; p = nodes[p]) {
    freed++;
    assert.equal(tree._keys[nodes[p + 1]], undefined);
  }
  assert.equal(tree._keys.length, tree.size + freed);
  assert.equal(tree._next, 1 + 3 * (tree.size - 1 + freed));
}

test("keys containing \\0", () => {
  const all = ["", "\0", "\0\0", "\0a", "a", "a\0", "a\0\0", "a\0b", "a\u0001", "ab", "b\0"],
      tree = new Tree(all.slice().reverse());
  assert.equal(tree.size, all.length);
  assert.deepEqual([...tree], all.slice().sort());
  assert.deepEqual([...new Tree(all.slice().sort())], all.slice().sort());
  for (const k of all) assert.equal(tree.has(k), true, JSON.stringify(k));
  for (const k of ["\0\0\0", "a\0\0\0", "b", "\0b"]) assert.equal(tree.has(k), false, JSON.stringify(k));
  assert.equal(tree.successor("a"), "a\0");
  assert.equal(tree.predecessor("a\0"), "a");
  assert.equal(tree.successor("a\0\0"), "a\0b");
  assert.deepEqual([...tree.keys("a\0")], ["a\0", "a\0\0", "a\0b", "a\u0001", "ab", "b\0"]);
  const found = [];
  tree.prefixed("a\0", k => {
    found.push(k);
  });
  assert.deepEqual(found, ["a\0", "a\0\0", "a\0b"]);
  assert.equal(tree.delete("a\0"), true);
  assert.equal(tree.has("a"), true);
  assert.equal(tree.has("a\0\0"), true);
  assert.deepEqual([...tree.union(new Tree(["a\0", "\0\0\0"]))], [...all, "\0\0\0"].sort());
});

test("keys that first differ at code unit 2^26 or later throw", () => {
  const long = "x".repeat(2 ** 26),
      tree = new Tree([long + "a"]);
  assert.throws(() => tree.add(long + "b"), RangeError);
  assert.throws(() => new Tree([long + "a", long + "b"]), RangeError);
  assert.equal(tree.size, 1);
  assert.equal(tree.has(long + "a"), true);
  tree.add("x");
  assert.deepEqual([...tree], ["x", long + "a"]);
});
