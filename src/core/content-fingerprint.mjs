// Change detection, not authentication or evidence that a strategy works.

// Keys are emitted in the order the previous canonical object produced them:
// integer-index keys ascend numerically (the language enumerates them that way
// whatever the insertion order), every other key follows in sorted order.
// Building that object first and stringifying it afterwards allocated a second
// graph per fingerprint call, which dominated catalog review in the CPU profile.
const isIndexKey = (key) => { const n = Number(key); return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === key; };
function orderedKeys(value) {
  const keys = Object.keys(value);
  const index = [], rest = [];
  for (const key of keys) (isIndexKey(key) ? index : rest).push(key);
  index.sort((a, b) => a - b);
  rest.sort();
  return index.length ? index.concat(rest) : rest;
}
function canonicalText(value) {
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) { if (i) out += ','; const part = canonicalText(value[i]); out += part === undefined ? 'null' : part; }
    return out + ']';
  }
  if (value && typeof value === 'object') {
    let out = '';
    for (const key of orderedKeys(value)) {
      const member = value[key];
      if (member === undefined) continue;
      const part = canonicalText(member);
      if (part === undefined) continue;
      out += (out ? ',' : '') + JSON.stringify(key) + ':' + part;
    }
    return '{' + out + '}';
  }
  return JSON.stringify(value);
}
export const canonicalJSON = (value) => canonicalText(value ?? null);

// FNV-1a 64-bit over the canonical JSON, computed in two 32-bit lanes.
// The previous loop used `for...of`, so it consumed code points and a surrogate
// pair contributed only its high unit; the lane loop skips the paired low unit
// to stay byte-identical. Review baselines are persisted, so the digest must not
// drift; tests/content-fingerprint.test.mjs pins it against the old loop.
const PRIME_LOW = 0x1b3, SHIFT_LANE = 256, MASK24 = 0xffffff, TWO32 = 0x100000000;
export function fingerprint(value) {
  const text = canonicalJSON(value);
  let high = 0xcbf29ce4, low = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) { const prior = i ? text.charCodeAt(i - 1) : 0; if (prior >= 0xd800 && prior <= 0xdbff) continue; }
    low = (low ^ code) >>> 0;
    // low * prime, then high * prime shifted into the high lane. Both products
    // stay below 2^53, so ToUint32 is an exact mod 2^32.
    const product = low * PRIME_LOW;
    const carry = (product / TWO32) | 0;
    high = ((((low & MASK24) * SHIFT_LANE) + ((high * PRIME_LOW + carry) >>> 0)) >>> 0);
    low = product >>> 0;
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
