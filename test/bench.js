var Tree = require("../critbit").Tree;

var obj = {},
    max = 1e6,
    len = 20,
    start;

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
  d = d.toString(16);
  while (d.length < len) {
    d += d.substr(0, len - d.length);
  }
  return d;
}
