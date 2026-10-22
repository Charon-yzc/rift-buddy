import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerprint, canonicalJSON} from '../src/core/content-fingerprint.mjs';

// The previous implementations. Both outputs are observable: digests are
// persisted in catalog review baselines, and canonical JSON is compared by
// review tooling, so the fast paths must reproduce them exactly.
const legacyCanonical = (value) => Array.isArray(value)
  ? value.map(legacyCanonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, legacyCanonical(value[k])]))
    : value;
const legacyCanonicalJSON = (value) => JSON.stringify(legacyCanonical(value ?? null));

function legacyFingerprint(value) {
  let hash = 14695981039346656037n;
  for (const c of legacyCanonicalJSON(value ?? null)) {
    hash ^= BigInt(c.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

const fixed = [
  null, 0, -0, 1, -1, 1.5, 1e21, -1e-7, true, false, '', 'a', '英雄联盟', '\u0000\uFFFF', '\uD83D\uDE00',
  // Lone surrogates and astral pairs must hash exactly like the old code point loop.
  '\uD83D', '\uDE00', '\uD83D\uDE00\uD83D', 'a\uD83D\uDE00b', '\uD83D\uD83D\uDE00',
  [], {}, [[]], {b: 1, a: 2}, {a: {d: 4, c: 3}, b: [1, {y: 2, x: 1}]},
  {stats: {kills: 8, deaths: 2, assists: 10}, mechanics: [{id: 'Q', name: 'Q'}]},
  {a: [undefined, null, false]}, {a: {b: undefined, c: 1}}, {'2': 'two', '10': 'ten', '1': 'one'},
  {nested: [{deep: {deeper: {deepest: [1, 2, {z: null}]}}}]},
];

test('canonical JSON stays byte-identical to the previous implementation', () => {
  for (const sample of fixed) assert.equal(canonicalJSON(sample), legacyCanonicalJSON(sample), JSON.stringify(sample));

  let seed = 987654321;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const randomValue = (depth = 0) => {
    const pick = Math.floor(random() * (depth > 2 ? 4 : 7));
    if (pick === 0) return null;
    if (pick === 1) return random() < 0.5;
    if (pick === 2) return Math.floor(random() * 1e6) - 5e5;
    if (pick === 3) return random() * 1e-3;
    if (pick === 4) return String.fromCharCode(32 + Math.floor(random() * 90)).repeat(1 + Math.floor(random() * 12));
    if (pick === 5) return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, (_, i) => ['k' + Math.floor(random() * 5) + i, randomValue(depth + 1)]));
  };
  for (let n = 0; n < 400; n++) {
    const value = randomValue();
    assert.equal(canonicalJSON(value), legacyCanonicalJSON(value), JSON.stringify(value));
    assert.equal(fingerprint(value), legacyFingerprint(value), JSON.stringify(value));
  }
});

test('the two-lane digest matches the bigint reference exactly', () => {
  for (const sample of fixed) assert.equal(fingerprint(sample), legacyFingerprint(sample), JSON.stringify(sample));
});

test('undefined members are dropped before hashing, as before', () => {
  assert.equal(fingerprint({ a: 1, b: undefined }), fingerprint({ a: 1 }));
  assert.equal(fingerprint(undefined), legacyFingerprint(undefined));
  assert.equal(canonicalJSON({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(canonicalJSON([undefined, 1]), '[null,1]');
});
