/**
 * Seeded pseudo-random number generator (sfc32). The simulation must only
 * draw randomness from here so runs are reproducible and saves resume the
 * same random stream.
 */
export type RngState = [number, number, number, number];

/** Hash a string or number into a 32-bit seed (cyrb53-style mix). */
export function hashSeed(seed: string | number): number {
  const s = typeof seed === 'number' ? `n:${seed}` : `s:${seed}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number = 1) {
    const mix = splitmix32(hashSeed(seed));
    this.a = mix();
    this.b = mix();
    this.c = mix();
    this.d = mix();
    // Warm up so nearby seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  static fromState(state: RngState): Rng {
    const rng = new Rng(0);
    rng.setState(state);
    return rng;
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) >>> 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: RngState): void {
    [this.a, this.b, this.c, this.d] = state.map((n) => n >>> 0) as RngState;
  }
}
