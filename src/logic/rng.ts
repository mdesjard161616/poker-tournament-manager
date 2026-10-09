// The single source of randomness. Tests swap it for a seeded generator.
export type RandomInt = (maxExclusive: number) => number;

const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 1) return 0;
  // Rejection sampling keeps the result unbiased.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
};

let current: RandomInt = cryptoRandomInt;

export function randomInt(maxExclusive: number): number {
  return current(maxExclusive);
}

export function setRandomInt(fn: RandomInt | null): void {
  current = fn ?? cryptoRandomInt;
}

export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const f = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return Math.floor(f * max);
  };
}

// Fisher-Yates
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newId(prefix: string): string {
  let id = prefix;
  for (let i = 0; i < 10; i++) id += randomInt(36).toString(36);
  return id;
}
