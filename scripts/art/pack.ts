// A small MaxRects packer (best short side fit). Inputs are sorted first, so
// the same boxes always land in the same places.

export interface PackIn {
  name: string;
  w: number;
  h: number;
}

export interface Placed extends PackIn {
  x: number;
  y: number;
  page: number;
}

export interface PackResult {
  placed: Placed[];
  /** Each page's size, the smallest power of two that holds what is on it. */
  pages: { w: number; h: number }[];
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

const contains = (a: Free, b: Free): boolean =>
  b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

function split(free: Free[], used: Free): Free[] {
  const out: Free[] = [];
  for (const f of free) {
    if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
      out.push(f);
      continue;
    }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w)
      out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h)
      out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // Drop rectangles inside others.
  return out.filter((a, i) => !out.some((b, j) => j !== i && contains(b, a) && (!contains(a, b) || j < i)));
}

const pow2 = (v: number): number => {
  let p = 1;
  while (p < v) p *= 2;
  return p;
};

/**
 * Pack boxes onto pages of at most `max` x `max`, with `padding` pixels
 * between boxes and around the edge. A box bigger than a page throws.
 */
export function pack(items: readonly PackIn[], max: number, padding = 2): PackResult {
  const sorted = [...items].sort(
    (a, b) => b.h - a.h || b.w - a.w || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const placed: Placed[] = [];
  const pages: Free[][] = [];
  for (const item of sorted) {
    const w = item.w + padding;
    const h = item.h + padding;
    if (w + padding > max || h + padding > max)
      throw new Error(`"${item.name}" is ${item.w} x ${item.h}, too big for a ${max} x ${max} atlas page`);
    let spot: { page: number; x: number; y: number } | null = null;
    for (let p = 0; p <= pages.length && !spot; p++) {
      if (p === pages.length) pages.push([{ x: padding, y: padding, w: max - padding, h: max - padding }]);
      let best = Infinity;
      let bestLong = Infinity;
      for (const f of pages[p]!) {
        if (f.w < w || f.h < h) continue;
        const short = Math.min(f.w - w, f.h - h);
        const long = Math.max(f.w - w, f.h - h);
        if (short < best || (short === best && long < bestLong)) {
          best = short;
          bestLong = long;
          spot = { page: p, x: f.x, y: f.y };
        }
      }
    }
    const s = spot!;
    pages[s.page] = split(pages[s.page]!, { x: s.x, y: s.y, w, h });
    placed.push({ ...item, x: s.x, y: s.y, page: s.page });
  }
  const sizes = pages.map((_, p) => {
    const on = placed.filter((q) => q.page === p);
    return {
      w: pow2(Math.max(1, ...on.map((q) => q.x + q.w + padding))),
      h: pow2(Math.max(1, ...on.map((q) => q.y + q.h + padding))),
    };
  });
  placed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { placed, pages: sizes };
}
