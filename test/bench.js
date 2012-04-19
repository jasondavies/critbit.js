var Tree = require("../critbit").Tree;

var obj = {},
    max = 1e6,
    len = 50,
    keys = [],
    start;

for (var i = 0; i < max; i++) {
  keys[i] = key(i);
}
keys.sort();

start = +new Date;
var result = 1;
for (var i = 0; i < max; i++) {
  result &= bisect(keys, key(i));
}
console.log("bisect.contains", +new Date - start, result);

start = +new Date;
for (var i = 0; i < max; i++) {
  obj[key(i)] = true;
}
console.log("obj.insert", +new Date - start);

var tree = new Tree;

start = +new Date;
for (var i = 0; i < max; i++) {
  tree.insert(key(i));
}
console.log("tree.insert", +new Date - start);

start = +new Date;
var result = 1;
for (var i = 0; i < max; i++) {
  result &= tree.contains(key(i));
}
console.log("tree.contains", +new Date - start, result);

start = +new Date;
var result = 1;
for (var i = 0; i < max; i++) {
  result &= obj[key(i)];
}
console.log("obj.contains", +new Date - start, result);

start = +new Date;
var result = 0;
tree.prefixed("999", function(k) {
  result++;
  return 1;
});
console.log("tree.prefixed", +new Date - start, result);

start = +new Date;
var result = 1;
for (var i = 0; i < max; i++) {
  if (tree.contains(key(i))) result &= (tree.remove(key(i)) != null);
}
console.log("tree.remove", +new Date - start, result);

start = +new Date;
var result = 1;
for (var i = 0; i < max; i++) {
  if (obj[key(i)]) result &= delete obj[key(i)];
}
console.log("obj.remove", +new Date - start, result);

function key(d) {
  d = "http://" + d.toString(16);
  while (d.length < len) {
    d += d.substr(0, len - d.length);
  }
  return d;
}

function bisect(a, x) {
  var i = bisectLeft(a, x, 0, a.length);
  return a[i] === x;
}

function bisectRight(a, x, lo, hi) {
  while (lo < hi) {
    var mid = lo + hi >> 1;
    if (x < a[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function bisectLeft(a, x, lo, hi) {
  while (lo < hi) {
    var mid = lo + hi >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
