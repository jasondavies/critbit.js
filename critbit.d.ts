/**
 * A set of strings, kept in sorted order by UTF-16 code units. Any strings
 * can be keys, except that two keys can't be identical for their first 2^26
 * (about 67 million) characters.
 */
export class Tree implements Iterable<string> {
  /**
   * Creates a tree containing the given keys, if any. Keys in ascending order
   * are added in a single fast pass.
   */
  constructor(keys?: Iterable<string> | null);
  readonly size: number;
  readonly [Symbol.toStringTag]: string;
  /** Returns whether key is in the tree. Returns false if key isn't a string. */
  has(key: unknown): boolean;
  /**
   * Adds key, returning this tree. Throws a RangeError if key is identical to
   * an existing key for its first 2^26 characters.
   */
  add(key: string): this;
  /** Removes key, returning whether it was present. */
  delete(key: unknown): boolean;
  clear(): void;
  /** Returns the smallest key, or undefined if the tree is empty. */
  min(): string | undefined;
  /** Returns the largest key, or undefined if the tree is empty. */
  max(): string | undefined;
  /** Returns the smallest key greater than key, or undefined if there is none. */
  successor(key: string): string | undefined;
  /** Returns the largest key less than key, or undefined if there is none. */
  predecessor(key: string): string | undefined;
  /**
   * Calls f for each key starting with prefix, in order, stopping early if f
   * returns false.
   */
  prefixed(prefix: string, f: (key: string, value: undefined) => unknown): void;
  /** Calls f for each key in order, like Set.prototype.forEach. */
  forEach(f: (value: string, key: string, tree: this) => void, thisArg?: unknown): void;
  /**
   * Returns an iterator over the keys in order, starting from the smallest key
   * greater than or equal to start if given.
   */
  keys(start?: string): IteratorObject<string, undefined>;
  /** The same as keys, like Set.prototype.values. */
  values(start?: string): IteratorObject<string, undefined>;
  /** Returns an iterator over [key, key] pairs, like Set.prototype.entries. */
  entries(start?: string): IteratorObject<[string, string], undefined>;
  [Symbol.iterator](): IteratorObject<string, undefined>;
  /** Returns a new tree containing the keys in this tree or the given tree. */
  union(tree: Tree | TreeMap<unknown>): Tree;
  /** Returns a new tree containing the keys in both this tree and the given tree. */
  intersection(tree: Tree | TreeMap<unknown>): Tree;
  /**
   * Rearranges the tree's memory so that it is faster to search, and frees
   * slots left by deleted keys. Returns this tree.
   */
  optimize(): this;
}

/**
 * A map from strings to values, kept in sorted order by key. Any strings can
 * be keys, except that two keys can't be identical for their first 2^26
 * (about 67 million) characters.
 */
export class TreeMap<V = unknown> implements Iterable<[string, V]> {
  /**
   * Creates a map containing the given [key, value] entries, if any. Entries
   * in ascending key order are added in a single fast pass.
   */
  constructor(entries?: Iterable<readonly [string, V]> | null);
  readonly size: number;
  readonly [Symbol.toStringTag]: string;
  /** Returns whether key is in the map. Returns false if key isn't a string. */
  has(key: unknown): boolean;
  /** Returns the value for key, or undefined if key is not present. */
  get(key: unknown): V | undefined;
  /**
   * Sets the value for key, adding key if it is not present. Returns this map.
   * Throws a RangeError if key is identical to an existing key for its first
   * 2^26 characters.
   */
  set(key: string, value: V): this;
  /** Removes key, returning whether it was present. */
  delete(key: unknown): boolean;
  clear(): void;
  /** Returns the smallest key, or undefined if the map is empty. */
  min(): string | undefined;
  /** Returns the largest key, or undefined if the map is empty. */
  max(): string | undefined;
  /** Returns the smallest key greater than key, or undefined if there is none. */
  successor(key: string): string | undefined;
  /** Returns the largest key less than key, or undefined if there is none. */
  predecessor(key: string): string | undefined;
  /**
   * Calls f for each key starting with prefix and its value, in key order,
   * stopping early if f returns false.
   */
  prefixed(prefix: string, f: (key: string, value: V) => unknown): void;
  /** Calls f for each entry in key order, like Map.prototype.forEach. */
  forEach(f: (value: V, key: string, map: this) => void, thisArg?: unknown): void;
  /**
   * The following return iterators in key order, starting from the smallest
   * key greater than or equal to start if given.
   */
  keys(start?: string): IteratorObject<string, undefined>;
  values(start?: string): IteratorObject<V, undefined>;
  entries(start?: string): IteratorObject<[string, V], undefined>;
  [Symbol.iterator](): IteratorObject<[string, V], undefined>;
  /**
   * Returns a new map containing the keys in this map or the given tree,
   * taking values from this map where both contain a key. Keys only in a given
   * Tree have undefined values.
   */
  union<W>(tree: TreeMap<W>): TreeMap<V | W>;
  union(tree: Tree): TreeMap<V | undefined>;
  /**
   * Returns a new map containing the keys in both this map and the given tree,
   * with values from this map.
   */
  intersection(tree: Tree | TreeMap<unknown>): TreeMap<V>;
  /**
   * Rearranges the map's memory so that it is faster to search, and frees
   * slots left by deleted keys. Returns this map.
   */
  optimize(): this;
}
