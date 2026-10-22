critbit.js
==========

A JavaScript implementation of [crit-bit trees](https://cr.yp.to/critbit.html):
sorted sets and maps of strings with fast lookups, adds and deletes, plus
ordered operations such as prefix queries, minimum, maximum, successor and
predecessor. The API follows `Set` and `Map`, and TypeScript types are
included.

```js
import {Tree, TreeMap} from "critbit";

const tree = new Tree(["apple", "banana", "apricot"]);
tree.has("apple"); // true
tree.successor("apple"); // "apricot"
[...tree.keys("b")]; // ["banana"]
tree.prefixed("ap", key => console.log(key)); // apple, apricot

const map = new TreeMap([["apple", 1]]);
map.set("banana", 2);
map.get("banana"); // 2
[...map]; // [["apple", 1], ["banana", 2]]
```

Any strings can be keys, and they are ordered by UTF-16 code units, like
JavaScript's default string sort. The only exception is a key that is
identical to an existing key for its first 2<sup>26</sup> (about 67 million)
characters: adding one throws a `RangeError`.

## API

### `new Tree([keys])`

A sorted set of strings, optionally containing the given iterable of keys. If
the keys are in ascending order, the tree is built in a single pass, which is
much faster than adding them one at a time.

* `tree.size` is the number of keys.
* `tree.has(key)` returns whether `key` is in the tree.
* `tree.add(key)` adds `key` and returns the tree. It throws a `TypeError` if
  `key` isn't a string.
* `tree.delete(key)` removes `key`, returning whether it was present.
* `tree.clear()` removes all keys.
* `tree.min()` and `tree.max()` return the smallest and largest keys, or
  `undefined` if the tree is empty.
* `tree.successor(key)` and `tree.predecessor(key)` return the smallest key
  greater than `key` and the largest key less than `key`, or `undefined` if
  there is none. `key` need not be in the tree.
* `tree.keys([start])` returns an iterator over the keys in order, starting
  from the smallest key greater than or equal to `start` if given. Trees are
  also iterable, yielding all keys in order. As with `Set`, `tree.values()` is
  the same as `tree.keys()`, and `tree.entries()` yields `[key, key]` pairs.
* `tree.forEach(f[, thisArg])` calls `f(key, key, tree)` for each key in order,
  like `Set.prototype.forEach`.
* `tree.prefixed(prefix, f)` calls `f(key, value)` for each key starting with
  `prefix`, in order, stopping early if `f` returns `false`.
* `tree.union(other)` and `tree.intersection(other)` return new trees.
* `tree.optimize()` rearranges the tree's memory so that it is faster to
  search, and returns the tree. This happens automatically as the tree grows,
  but calling it after adding or deleting many keys makes iteration and prefix
  queries faster, and reuses the slots left by deleted keys.

As with `Set` and `Map`, a tree may be changed while iterating over it or
inside a `forEach` or `prefixed` callback: keys deleted before they are
reached are skipped, and keys added after the current key are visited.
Iterators support the iterator helpers, such as `tree.keys().map(f)`.

### `new TreeMap([entries])`

A sorted map from strings to values, optionally containing the given iterable
of `[key, value]` entries, with the same methods as `Tree` except `add`, plus:

* `map.get(key)` returns the value for `key`, or `undefined` if it is not
  present.
* `map.set(key, value)` sets the value for `key`, adding it if needed, and
  returns the map.
* `map.values([start])` and `map.entries([start])` return iterators over the
  values and `[key, value]` pairs in key order. Maps are also iterable,
  yielding entries.
* `map.forEach(f[, thisArg])` calls `f(value, key, map)` for each entry in key
  order, like `Map.prototype.forEach`.

`map.union(other)` takes values from `map` for keys in both, and gives keys
only in `other` their values from `other`, or `undefined` if `other` is a
`Tree`.

## When to use it

Use a crit-bit tree when you need ordered operations, which hash tables like
`Set` and `Map` can't do efficiently: prefix queries, iterating in sorted order,
or finding the minimum, maximum, next or previous key. Crit-bit trees are also
fast for long keys, since a lookup only examines the bits where keys differ,
plus one final comparison, while hashing reads the whole key.

Unlike a hash table, a crit-bit tree has no slow cases for unusual or
malicious keys: each operation visits at most one node per bit of the longest
key, however the keys are distributed. (V8 randomizes its string hashes, which
makes such slow cases unlikely for `Set` and `Map` too.)

A built-in `Set` or `Map` is faster to build from unsorted keys, and faster for
repeated lookups of the same string objects, since V8 caches each string's
hash. Run `npm run bench` to compare on your own machine.

## Development

* `npm test` runs the tests.
* `npm run bench` compares `Tree` with `Set`, a plain object and a sorted array,
  using 100,000 keys. Use `npm run bench -- 1e6 urls,long tree,set` to choose
  the number of keys, datasets and structures.
