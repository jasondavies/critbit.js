// Crit-bit trees for JavaScript by Jason Davies, https://www.jasondavies.com/
// See LICENSE for licensing details.
// Based on Adam Langley's public domain https://github.com/agl/critbit
// In turn, based on Dan Bernstein's public domain qhasm.

const initialSize = 1023;

// Number of levels of nodes stored together by relayout, so that lookups
// touch fewer cache lines.
const blockDepth = 4;

// The parts of a crit-bit tree shared by Tree and TreeMap.
class CritBitTree {
  constructor() {
    // Word 0 is the root pointer. An internal node is three 32-bit words at
    // offset p > 0:
    // 0: left pointer
    // 1: right pointer
    // 2: crit, the critical bit, as (code unit index << 5) | shift. Each
    //    code unit has 17 bits: first whether the code unit exists, which
    //    tells "a" from "a\0", then its 16 bits from most to least
    //    significant. The bit is (x | 0x10000) >>> shift & 1 for code unit x,
    //    or 0 past the end of a key, so shift is 16 for the first bit and 0
    //    for the last, and crit ^ 31 orders crits from first bit to last.
    //    So that crit fits in 31 bits, keys can't first differ at code unit
    //    2^26 or later.
    // An external pointer is ~(key index), which is negative.
    this._nodes = new Int32Array(initialSize);
    this._next = 0;
    this._keys = [];
    // Values by key index, for TreeMap.
    this._values = undefined;
    // Head of a list of nodes freed by delete, or 0 if empty. Each delete
    // frees one node and one key slot, so a free node stores the next free
    // node in word 0 and its freed key index in word 1.
    this._free = 0;
    this._size = 0;
    // Incremented whenever keys are added or removed or nodes are rearranged,
    // so that iterators can find their place again.
    this._version = 0;
  }

  get size() {
    return this._size;
  }

  // Returns whether key is in the tree. Returns false if key isn't a string.
  has(key) {
    return findKey(this, key) >= 0;
  }

  // Removes key, returning whether it was present.
  delete(key) {
    return deleteKey(this, key) >= 0;
  }

  clear() {
    this._nodes = new Int32Array(initialSize);
    this._next = 0;
    this._keys = [];
    if (this._values) this._values = [];
    this._free = 0;
    this._size = 0;
    this._version++;
  }

  // Returns the smallest key, or undefined if the tree is empty.
  min() {
    return this._next ? this._keys[~edge(this._nodes, this._nodes[0], 0)] : undefined;
  }

  // Returns the largest key, or undefined if the tree is empty.
  max() {
    return this._next ? this._keys[~edge(this._nodes, this._nodes[0], 1)] : undefined;
  }

  // Returns the smallest key greater than key, or undefined if there is none.
  successor(key) {
    const p = neighbor(this, checkKey(key), 0);
    return p ? this._keys[~edge(this._nodes, p, 0)] : undefined;
  }

  // Returns the largest key less than key, or undefined if there is none.
  predecessor(key) {
    const p = neighbor(this, checkKey(key), 1);
    return p ? this._keys[~edge(this._nodes, p, 1)] : undefined;
  }

  // Calls f(key, value) for each key starting with prefix, in order, stopping
  // early if f returns false.
  prefixed(prefix, f) {
    visit(this, checkKey(prefix), f, true);
  }

  // Returns an iterator over keys in order, starting from the smallest key
  // greater than or equal to start if given.
  keys(start) {
    return new TreeIterator(this, start, 0);
  }

  // Returns a new tree containing the keys in this tree or the given tree.
  // For a TreeMap, values come from this tree where both contain a key, and
  // are undefined for keys only in a given Tree.
  union(tree) {
    return merge(this, checkTree(tree), true);
  }

  // Returns a new tree containing the keys in both this tree and the given
  // tree. For a TreeMap, values come from this tree.
  intersection(tree) {
    return merge(this, checkTree(tree), false);
  }

  // Rearranges nodes so that searches touch fewer cache lines, and drops
  // slots freed by delete. Nodes are also rearranged whenever the tree grows,
  // but calling this after many adds or deletes makes iteration and prefix
  // queries faster. Returns this tree.
  optimize() {
    if (!this._next) return this;
    let freed = 0;
    for (let p = this._free; p; p = this._nodes[p]) freed++;
    const needed = this._next - 3 * freed;
    relayout(this, Math.max(initialSize, Math.min(this._nodes.length, needed << 1 | 1)), true);
    this._version++;
    return this;
  }
}

// A set of strings, kept in sorted order.
export class Tree extends CritBitTree {
  // Creates a tree containing the given keys, if any. Keys in ascending order
  // are added in a single fast pass.
  constructor(keys) {
    super();
    if (keys != null) {
      keys = Array.isArray(keys) ? keys : [...keys];
      for (let i = build(this, keys); i < keys.length; i++) addKey(this, keys[i]);
    }
  }

  get [Symbol.toStringTag]() {
    return "Tree";
  }

  // Adds key, returning this tree.
  add(key) {
    addKey(this, key);
    return this;
  }

  // Calls f.call(thisArg, key, key, tree) for each key in order, like
  // Set.prototype.forEach.
  forEach(f, thisArg) {
    visit(this, "", key => {
      f.call(thisArg, key, key, this);
    }, false);
  }

  // The same as keys, like Set.prototype.values.
  values(start) {
    return new TreeIterator(this, start, 0);
  }

  // Returns an iterator over [key, key] pairs in key order, like
  // Set.prototype.entries.
  entries(start) {
    return new TreeIterator(this, start, 3);
  }

  [Symbol.iterator]() {
    return this.keys();
  }
}

// A map from strings to values, kept in sorted order by key.
export class TreeMap extends CritBitTree {
  // Creates a map containing the given [key, value] entries, if any. Entries
  // in ascending key order are added in a single fast pass.
  constructor(entries) {
    super();
    this._values = [];
    if (entries != null) {
      const keys = [],
          values = [];
      for (const entry of entries) {
        if (entry === null || typeof entry !== "object") throw new TypeError("critbit: entries must be [key, value] pairs");
        keys.push(entry[0]);
        values.push(entry[1]);
      }
      for (let i = build(this, keys, values); i < keys.length; i++) this.set(keys[i], values[i]);
    }
  }

  get [Symbol.toStringTag]() {
    return "TreeMap";
  }

  // Returns the value for key, or undefined if key is not present.
  get(key) {
    const i = findKey(this, key);
    return i < 0 ? undefined : this._values[i];
  }

  // Sets the value for key, adding key if it is not present. Returns this map.
  set(key, value) {
    const i = addKey(this, key);
    this._values[i < 0 ? ~i : i] = value;
    return this;
  }

  // Calls f.call(thisArg, value, key, map) for each key in order, like
  // Map.prototype.forEach.
  forEach(f, thisArg) {
    visit(this, "", (key, value) => {
      f.call(thisArg, value, key, this);
    }, false);
  }

  // Returns an iterator over values in key order, starting from the smallest
  // key greater than or equal to start if given.
  values(start) {
    return new TreeIterator(this, start, 1);
  }

  // Returns an iterator over [key, value] pairs in key order, starting from
  // the smallest key greater than or equal to start if given.
  entries(start) {
    return new TreeIterator(this, start, 2);
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}

// Iterates over keys (kind 0), values (1), [key, value] pairs (2) or [key,
// key] pairs (3) in key order. If the tree changes, it carries on from the key
// after the last one returned, so like Set and Map iterators it skips deleted
// keys and visits added keys that sort later.
class TreeIterator extends Iterator {
  constructor(tree, start, kind) {
    super();
    this._tree = tree;
    this._start = start === undefined ? start : checkKey(start);
    this._kind = kind;
    this._last = undefined;
    this._seek();
  }

  _seek() {
    const tree = this._tree;
    this._version = tree._version;
    this._nodes = tree._nodes;
    this._keys = tree._keys;
    this._values = tree._values;
    this._stack = this._last !== undefined ? cursor(tree, this._last, false)
        : this._start !== undefined ? cursor(tree, this._start, true)
        : tree._next ? [tree._nodes[0]] : [];
  }

  next() {
    if (!this._stack) return {value: undefined, done: true};
    if (this._version !== this._tree._version) this._seek();
    const stack = this._stack,
        nodes = this._nodes;
    if (!stack.length) {
      this._stack = null;
      return {value: undefined, done: true};
    }
    let p = stack.pop();
    while (p > 0) {
      stack.push(nodes[p + 1]);
      p = nodes[p];
    }
    const x = ~p,
        key = this._last = this._keys[x],
        kind = this._kind;
    return {value: kind === 0 ? key : kind === 1 ? this._values[x] : kind === 2 ? [key, this._values[x]] : [key, key], done: false};
  }
}

function checkKey(key) {
  if (typeof key !== "string") throw new TypeError("critbit: keys must be strings");
  return key;
}

function checkTree(tree) {
  if (!(tree instanceof CritBitTree)) throw new TypeError("critbit: expected a Tree or TreeMap");
  return tree;
}

// Returns the key index of u, or -1 if u is not present.
function findKey(tree, u) {
  if (!tree._next || typeof u !== "string") return -1;
  const nodes = tree._nodes,
      ulen = u.length;
  let p = nodes[0];
  while (p > 0) {
    const c = nodes[p + 2],
        i = c >>> 5;
    p = nodes[p + (i < ulen ? (u.charCodeAt(i) | 0x10000) >>> (c & 31) & 1 : 0)];
  }
  return u === tree._keys[~p] ? ~p : -1;
}

// Slots on the path from the root to a key, recorded by walk: path[0] is 0,
// the root slot, and path[j] is the slot taken at the (j - 1)th node.
let path = new Int32Array(64);

// Walks from the root to the key whose bits best match u, recording the path.
// Returns the number of slots recorded; the last points to the key reached.
function walk(nodes, u) {
  const ulen = u.length;
  let slot = 0,
      p = nodes[0],
      depth = 0;
  for (;;) {
    if (depth === path.length) {
      const grown = new Int32Array(depth << 1);
      grown.set(path);
      path = grown;
    }
    path[depth++] = slot;
    if (p < 0) return depth;
    const c = nodes[p + 2],
        i = c >>> 5;
    slot = p + (i < ulen ? (u.charCodeAt(i) | 0x10000) >>> (c & 31) & 1 : 0);
    p = nodes[slot];
  }
}

// Adds u, returning its new key index, or ~(its key index) if it was already
// present.
function addKey(tree, u) {
  checkKey(u);
  const ulen = u.length,
      keys = tree._keys;
  let nodes = tree._nodes;
  if (!tree._next) {
    keys.push(u);
    nodes[0] = -1;
    tree._next = 1;
    tree._size = 1;
    tree._version++;
    return 0;
  }
  // Grow before walking, so that the path recorded below stays valid.
  if (!tree._free && tree._next + 3 > nodes.length) {
    relayout(tree, nodes.length << 1 | 1, false);
    nodes = tree._nodes;
  }
  // walk may replace path, so call it before reading path.
  const depth = walk(nodes, u);
  let p = nodes[path[depth - 1]];
  const k = keys[~p],
      newcrit = critBit(k, u);
  if (newcrit < 0) return p;
  const newdirection = bit(k, newcrit);

  // new node and key, reusing slots freed by delete if possible
  let newnode = tree._free,
      x;
  if (newnode) {
    tree._free = nodes[newnode];
    x = nodes[newnode + 1];
    keys[x] = u;
  } else {
    x = keys.push(u) - 1;
    newnode = tree._next;
    tree._next += 3;
  }
  tree._size++;
  tree._version++;
  nodes[newnode + 1 - newdirection] = ~x;
  nodes[newnode + 2] = newcrit;

  // The new node goes above the first node on the path with a later crit.
  let wherep;
  for (let j = 0; ; j++) {
    p = nodes[wherep = path[j]];
    if (p < 0 || (nodes[p + 2] ^ 31) > (newcrit ^ 31)) break;
  }
  nodes[newnode + newdirection] = nodes[wherep];
  nodes[wherep] = newnode;
  return x;
}

// Removes u, returning its key index, or -1 if it was not present.
function deleteKey(tree, u) {
  if (!tree._next || typeof u !== "string") return -1;
  const ulen = u.length,
      nodes = tree._nodes,
      keys = tree._keys,
      values = tree._values;
  let wherep = 0,
      whereq = -1,
      p = nodes[0],
      q,
      direction = 0;
  while (p > 0) {
    whereq = wherep;
    q = p;
    const c = nodes[q + 2],
        i = c >>> 5;
    direction = i < ulen ? (u.charCodeAt(i) | 0x10000) >>> (c & 31) & 1 : 0;
    p = nodes[wherep = q + direction];
  }
  const x = ~p;
  if (keys[x] !== u) return -1;
  if (whereq < 0) {
    tree.clear();
    return x;
  }
  nodes[whereq] = nodes[q + 1 - direction];
  keys[x] = undefined;
  if (values) values[x] = undefined;
  nodes[q] = tree._free;
  nodes[q + 1] = x;
  tree._free = q;
  tree._size--;
  tree._version++;
  return x;
}

// Builds an empty tree from keys, and values if given, in a single pass while
// the keys are in ascending order. Returns the index of the first key not
// added, if a key is out of order, so the caller can add the rest one at a
// time. Repeated keys are added once, taking the last value. If crits is
// given, crits[i] is the crit of keys[i - 1] and keys[i], which must be in
// ascending order without repeats.
function build(tree, keys, values, crits) {
  const n = keys.length;
  if (!n) return 0;
  // In key order, each new node's crit is the first bit where its key differs
  // from the previous key. The tree is then the Cartesian tree of those crits,
  // which is built using a stack holding the rightmost path.
  const nodes = new Int32Array(Math.max(initialSize, 3 * n - 2)),
      stack = new Int32Array(n),
      out = tree._keys,
      outValues = tree._values;
  let prev = checkKey(keys[0]),
      next = 1,
      sp = 0,
      i = 1;
  out.push(prev);
  if (outValues) outValues.push(values[0]);
  nodes[0] = -1;
  for (; i < n; i++) {
    const u = keys[i];
    let crit;
    if (crits) crit = crits[i];
    else {
      crit = critBit(prev, checkKey(u));
      if (crit < 0) {
        if (outValues) outValues[outValues.length - 1] = values[i];
        continue;
      }
      // u sorts after prev if it has a 1 at the first differing bit.
      if (!bit(u, crit)) break;
      prev = u;
    }
    const x = out.push(u) - 1,
        q = next;
    if (outValues) outValues.push(values[i]);
    next += 3;
    let left = ~(x - 1);
    while (sp && (nodes[stack[sp - 1] + 2] ^ 31) > (crit ^ 31)) left = stack[--sp];
    nodes[q] = left;
    nodes[q + 1] = ~x;
    nodes[q + 2] = crit;
    nodes[sp ? stack[sp - 1] + 1 : 0] = q;
    stack[sp++] = q;
  }
  tree._nodes = nodes;
  tree._next = next;
  tree._size = out.length;
  tree._version++;
  relayout(tree, nodes.length, false);
  return i;
}

// Returns the crit of the first bit where k and u differ, or -1 if they are
// equal. If start is given, the first start code units must be equal.
function critBit(k, u, start = 0) {
  const klen = k.length,
      ulen = u.length,
      n = klen < ulen ? klen : ulen;
  let i = start,
      diff = 0;
  while (i < n && !(diff = k.charCodeAt(i) ^ u.charCodeAt(i))) i++;
  if (i >= 0x4000000) throw new RangeError("critbit: keys can't first differ at code unit 2^26 or later");
  // If one key is a prefix of the other, they differ at the bit that says
  // whether code unit i exists.
  if (!diff) return klen === ulen ? -1 : i << 5 | 16;
  return i << 5 | 31 - Math.clz32(diff);
}

// Returns the bit of u at crit c.
function bit(u, c) {
  const i = c >>> 5;
  return i < u.length ? (u.charCodeAt(i) | 0x10000) >>> (c & 31) & 1 : 0;
}

// Returns the subtree whose smallest key (or largest if reverse is 1) is the
// smallest key greater than u (or the largest key less than u), or 0 if there
// is none. This is the top of the stack that cursor would return.
function neighbor(tree, u, reverse) {
  if (!tree._next) return 0;
  const nodes = tree._nodes,
      depth = walk(nodes, u);
  let crit = critBit(tree._keys[~nodes[path[depth - 1]]], u),
      wanted = false;
  if (crit < 0) crit = 0x7fffffff;
  else wanted = bit(u, crit) === reverse;
  // Replay the path down to the first node with a later crit, remembering the
  // last subtree passed on the side away from reverse.
  const order = crit ^ 31;
  let result = 0,
      p = nodes[0];
  for (let j = 1; j < depth && (nodes[p + 2] ^ 31) < order; j++) {
    const dir = path[j] - p;
    if (dir === reverse) result = nodes[p + 1 - dir];
    p = nodes[path[j]];
  }
  return wanted ? p : result;
}

// Returns the pointer to the leftmost (dir 0) or rightmost (dir 1) leaf of the
// subtree at p.
function edge(nodes, p, dir) {
  while (p > 0) p = nodes[p + dir];
  return p;
}

// Returns a stack of subtrees whose keys, taken from the top of the stack
// down, are in order and are the keys greater than u, or greater than or
// equal to u if inclusive.
function cursor(tree, u, inclusive) {
  const stack = [];
  if (!tree._next) return stack;
  const nodes = tree._nodes,
      depth = walk(nodes, u);
  // Find the subtree whose keys share a prefix with u up to the first bit
  // where u differs from them, and whether its keys are wanted: u's bit there
  // is 0 if u sorts before them.
  let crit = critBit(tree._keys[~nodes[path[depth - 1]]], u),
      wanted = inclusive;
  if (crit < 0) crit = 0x7fffffff;
  else wanted = !bit(u, crit);
  // Going left from a node leaves its right subtree's keys still to come.
  const order = crit ^ 31;
  let p = nodes[0];
  for (let j = 1; j < depth && (nodes[p + 2] ^ 31) < order; j++) {
    if (path[j] === p) stack.push(nodes[p + 1]);
    p = nodes[path[j]];
  }
  if (wanted) stack.push(p);
  return stack;
}

// Calls f(key, value) for each key starting with prefix, in order. If stoppable,
// stops when f returns false. If f changes the tree, carries on from the key
// after the one just visited.
function visit(tree, prefix, f, stoppable) {
  if (!tree._next) return;
  const ulen = prefix.length;
  let nodes = tree._nodes,
      keys = tree._keys,
      values = tree._values,
      p = nodes[0],
      top = p;
  while (p > 0) {
    const c = nodes[p + 2],
        i = c >>> 5;
    p = nodes[p + (i < ulen ? (prefix.charCodeAt(i) | 0x10000) >>> (c & 31) & 1 : 0)];
    if (i < ulen) top = p;
  }
  if (!keys[~p].startsWith(prefix)) return;
  let stack = [top],
      version = tree._version,
      moved = false;
  while (stack.length) {
    p = stack.pop();
    while (p > 0) {
      stack.push(nodes[p + 1]);
      p = nodes[p];
    }
    const key = keys[~p];
    // After the tree changes, the stack covers all later keys, not only those
    // starting with prefix.
    if (moved && !key.startsWith(prefix)) return;
    if (f(key, values && values[~p]) === false && stoppable) return;
    if (tree._version !== version) {
      version = tree._version;
      nodes = tree._nodes;
      keys = tree._keys;
      values = tree._values;
      stack = cursor(tree, key, false);
      moved = true;
    }
  }
}

// Returns the key indices of tree in key order, and for each key the crit
// where it differs from the previous key, which is the crit of the node whose
// right subtree it begins.
function inorder(tree) {
  const n = tree._size,
      indices = new Int32Array(n),
      crits = new Int32Array(n);
  if (!n) return [indices, crits];
  const nodes = tree._nodes,
      stack = [nodes[0], 0];
  let t = 0;
  while (stack.length) {
    const crit = stack.pop();
    let p = stack.pop();
    while (p > 0) {
      stack.push(nodes[p + 1], nodes[p + 2]);
      p = nodes[p];
    }
    indices[t] = ~p;
    crits[t++] = crit;
  }
  return [indices, crits];
}

// Returns a new tree, of the same class as a, holding the keys in a or b (or
// in both if not union), with their values from a, or from b for keys only in
// b. Both trees are read in order and merged, and the result built in one
// pass.
//
// Merging needs few key comparisons. If w is the last key passed and the next
// keys of a and b differ from w first at crits ca and cb, then whichever
// differs later is the smaller, and their own crit is the earlier of the two.
// Only if ca and cb are equal must the keys be compared, starting at ca.
function merge(a, b, union) {
  const ka = a._keys,
      kb = b._keys,
      va = a._values,
      vb = b._values,
      [ia, da] = inorder(a),
      [ib, db] = inorder(b),
      na = ia.length,
      nb = ib.length,
      keys = [],
      values = va && [],
      crits = [];
  let i = 0,
      j = 0,
      ca = 0,
      cb = 0,
      started = false,
      // The crit of the last key output and w, or more than any crit if w was
      // output.
      run = 0x7fffffff;
  while (i < na && j < nb) {
    const x = ia[i],
        y = ib[j];
    // order is negative if a's next key is smaller, positive if b's is, or 0
    // if they are equal; c is their crit.
    let c,
        order;
    if (started && ca !== cb) {
      if ((ca ^ 31) < (cb ^ 31)) c = ca, order = 1;
      else c = cb, order = -1;
    } else {
      c = critBit(ka[x], kb[y], started ? ca >>> 5 : 0);
      order = c < 0 ? 0 : bit(kb[y], c) ? -1 : 1;
    }
    if (order <= 0) {
      const link = ca;
      if (union || !order) {
        keys.push(ka[x]);
        if (values) values.push(va[x]);
        crits.push((run ^ 31) < (link ^ 31) ? run : link);
        run = 0x7fffffff;
      } else if ((link ^ 31) < (run ^ 31)) run = link;
      i++;
      ca = i < na ? da[i] : 0;
      if (order) cb = c;
      else {
        j++;
        cb = j < nb ? db[j] : 0;
      }
    } else {
      const link = cb;
      if (union) {
        keys.push(kb[y]);
        if (values) values.push(vb && vb[y]);
        crits.push((run ^ 31) < (link ^ 31) ? run : link);
        run = 0x7fffffff;
      } else if ((link ^ 31) < (run ^ 31)) run = link;
      j++;
      cb = j < nb ? db[j] : 0;
      ca = c;
    }
    started = true;
  }
  if (union) {
    for (let link = ca; i < na; link = da[++i]) {
      keys.push(ka[ia[i]]);
      if (values) values.push(va[ia[i]]);
      crits.push((run ^ 31) < (link ^ 31) ? run : link);
      run = 0x7fffffff;
    }
    for (let link = cb; j < nb; link = db[++j]) {
      keys.push(kb[ib[j]]);
      if (values) values.push(vb && vb[ib[j]]);
      crits.push((run ^ 31) < (link ^ 31) ? run : link);
      run = 0x7fffffff;
    }
  }
  const result = new a.constructor();
  build(result, keys, values, crits);
  return result;
}

// Copies the nodes into a new array with the given capacity, storing blocks of
// blockDepth levels together, breadth-first within each block and depth-first
// between blocks. If compact is true, key slots are renumbered in the same
// order, dropping slots freed by delete; otherwise there must be none.
function relayout(tree, capacity, compact) {
  const old = tree._nodes,
      out = new Int32Array(capacity),
      oldKeys = tree._keys,
      oldValues = tree._values,
      keys = compact ? [] : oldKeys,
      values = compact && oldValues ? [] : oldValues,
      // Renumbers the key at external pointer c, when compacting.
      leaf = c => {
        if (values) values.push(oldValues[~c]);
        return -keys.push(oldKeys[~c]);
      };
  let next = 1;
  const root = old[0];
  if (root < 0) out[0] = compact ? leaf(root) : root;
  else {
    const stack = [root, 0],
        queue = [];
    while (stack.length) {
      const slot = stack.pop(),
          p = stack.pop();
      queue.length = 0;
      queue.push(p, slot);
      let head = 0,
          levelEnd = 2,
          depth = 0;
      while (head < queue.length) {
        if (head === levelEnd) {
          if (++depth === blockDepth) break;
          levelEnd = queue.length;
        }
        const op = queue[head++],
            q = next;
        out[queue[head++]] = q;
        out[q + 2] = old[op + 2];
        next += 3;
        for (let dir = 0; dir < 2; dir++) {
          const c = old[op + dir];
          if (c > 0) queue.push(c, q + dir);
          else out[q + dir] = compact ? leaf(c) : c;
        }
      }
      // The rest of the queue holds the roots of the blocks below this one.
      for (let j = queue.length - 2; j >= head; j -= 2) stack.push(queue[j], queue[j + 1]);
    }
  }
  tree._nodes = out;
  tree._next = next;
  tree._free = 0;
  if (compact) {
    tree._keys = keys;
    tree._values = values;
  }
}
