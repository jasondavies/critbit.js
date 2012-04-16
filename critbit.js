// Crit-bit trees for JavaScript by Jason Davies, http://www.jasondavies.com/
// See LICENSE for licensing details.
// Based on Adam Langley's public domain https://github.com/agl/critbit
// In turn, based on Dan Bernstein's public domain qhasm.
(function(exports) {

function Tree() {
  // A node has the following 32-bit words:
  // 0: left pointer
  // 1: right pointer
  // 2: "byte"
  // 3: otherbits
  this.nodes = alloc();
  this.next = 0;
  this.keys = [];
}

Tree.prototype.contains = function(u) {
  var nodes = this.nodes,
      keys = this.keys,
      ulen = u.length;
  if (!this.next) return false;
  var p = nodes[0],
      c;
  while (1 & p) {
    c = (c = nodes[p + 2]) < ulen ? u.charCodeAt(c) : 0;
    p = nodes[p + (1 + (nodes[p + 3] | c) >> 8)];
  }
  return u === keys[p >> 1];
};

Tree.prototype.insert = function(u) {
  var ulen = u.length,
      nodes = this.nodes,
      keys = this.keys,
      c;
  if (!this.next) {
    keys.push(u);
    nodes[this.next++] = 0;
    return u;
  }
  var p = nodes[0];
  while (1 & p) {
    c = (c = nodes[p + 2]) < ulen ? u.charCodeAt(c) : 0;
    p = nodes[p + (1 + (nodes[p + 3] | c) >> 8)];
  }
  var newotherbits,
      differing = false,
      k = keys[p >> 1],
      klen = k.length,
      x,
      y;
  for (var newbyte = 0; newbyte < ulen; ++newbyte) {
    x = newbyte < klen ? k.charCodeAt(newbyte) : 0;
    y = u.charCodeAt(newbyte);
    if (x !== y) {
      newotherbits = x ^ y;
      differing = true;
      break;
    }
  }
  if (!differing) {
    c = newbyte < klen ? k.charCodeAt(newbyte) : 0;
    if (c !== 0) {
      newotherbits = c;
      differing = true;
    }
    if (!differing) return;
  }
  // Fast round down to nearest power of two.
  newotherbits |= newotherbits >> 1;
  newotherbits |= newotherbits >> 2;
  newotherbits |= newotherbits >> 4;
  newotherbits = (~newotherbits | (newotherbits >> 1)) & 255
  c = newbyte < klen ? k.charCodeAt(newbyte) : 0;
  var newdirection = 1 + (newotherbits | c) >> 8;

  // new node
  var x = (keys.push(u) - 1) << 1;
  var newnode = this.next;
  this.next += 4;
  nodes[newnode] = nodes[newnode + 1] = 0; // not needed for typed arrays
  nodes[newnode + 1 - newdirection] = x;
  nodes[newnode + 2] = newbyte;
  nodes[newnode + 3] = newotherbits;

  var wherep = 0;
  for (;;) {
    p = nodes[wherep];
    if (!(1 & p)) break;
    c = nodes[p + 2];
    if (c > newbyte) break;
    if (c === newbyte && nodes[p + 3] > newotherbits) break;
    c = c < ulen ? u.charCodeAt(c) : 0;
    wherep = p + (1 + (nodes[p + 3] | c) >> 8);
  }
  nodes[newnode + newdirection] = nodes[wherep];
  nodes[wherep] = newnode;
  return u;
};

Tree.prototype.remove = function(u) {
  var ulen = u.length;
  if (!this.next) return;
  var nodes = this.nodes,
      keys = this.keys,
      wherep = 0,
      whereq = -1,
      p = nodes[0],
      q,
      c,
      direction = 0;
  while (1 & p) {
    whereq = wherep;
    q = p;
    c = (c = nodes[q + 2]) < ulen ? u.charCodeAt(c) : 0;
    direction = 1 + (nodes[q + 3] | c) >> 8;
    p = nodes[wherep = q + direction];
  }
  if (keys[p >> 1] !== u) return;
  if (whereq < 0) {
    keys.length = 0;
    this.next = 0;
    return u;
  }
  nodes[whereq] = nodes[q + 1 - direction];
  return u;
};

Tree.prototype.prefixed = function(prefix, f) {
  if (!this.next) return;
  var ulen = prefix.length,
      nodes = this.nodes,
      keys = this.keys,
      p = nodes[0],
      top = p,
      c,
      qbyte;
  while (1 & p) {
    c = (qbyte = nodes[p + 2]) < ulen ? prefix.charCodeAt(qbyte) : 0;
    p = nodes[p + (1 + (nodes[p + 3] | c) >> 8)];
    if (qbyte < ulen) top = p;
  }
  if (keys[p >> 1].substr(0, ulen) !== prefix) return;
  traverse(top);
  function traverse(top) {
    if (1 & top) {
      return traverse(nodes[top]) ? traverse(nodes[top + 1]) : false;
    }
    return f(keys[top >> 1]);
  }
};

function alloc() {
  return new Int32Array(4 * 1e6);
}

exports.Tree = Tree;

})(this);
