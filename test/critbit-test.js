var Tree = require("../critbit").Tree;

var vows = require("vows"),
    assert = require("assert");

var suite = vows.describe("critbit");

var max = 1e3,
    len = 10;

suite.addBatch({
  "critbit tree": {
    topic: function() {
      return new Tree;
    },
    "insert": function(tree) {
      for (var i = 0; i < max; i++) {
        var alreadyExists = tree.contains(key(i));
        assert.equal(tree.insert(key(i)), alreadyExists ? void 0 : key(i));
      }
    },
    "contains": function(tree) {
      for (var i = 0; i < max; i++) {
        assert.isTrue(tree.contains(key(i)));
      }
    },
    "prefixed": function(tree) {
      var i = 0x12,
          prefix = i.toString(16),
          n = prefix.length;
      tree.prefixed(prefix, function(k) {
        assert.equal(k.substr(0, n), prefix);
      });
    },
    "remove": function(tree) {
      for (var i = 0; i < max; i++) {
        var alreadyExists = tree.contains(key(i));
        assert.equal(tree.remove(key(i)), alreadyExists ? key(i) : void 0);
      }
    }
  }
});

suite.export(module);

function key(d) {
  d = d.toString(16);
  while (d.length < len) {
    d += d.substr(0, len - d.length);
  }
  return d;
}
