import { Filter, GlProgram } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import { OUTLINE, STAR, stroke } from '../render/palette';

/**
 * Photo filters (game design doc, section 14): one small shader with a
 * mode per look. Warm and cool tint, night vision goes green with
 * scanlines, old photo is sepia with grain, comic posterizes and inks the
 * edges, and bug eye is a hex mosaic (unlocked by `secret_scope_wubbo`).
 */
export interface FilterDef {
  id: string;
  /** The shader's mode. 0 is no filter. */
  mode: number;
  unlock?: string;
  /** The strip's icon, centered on (0, 0), about `s` across. */
  icon(g: Graphics, s: number): void;
}

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uMode;
uniform float uGrain;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The nearest center of a hex lattice with circumradius r (pixels).
vec2 hexCenter(vec2 p, float r) {
  float w = 1.5 * r;
  float h = 1.7320508 * r;
  float c = floor(p.x / w + 0.5);
  float off = mod(c, 2.0) * h * 0.5;
  vec2 a = vec2(c * w, floor((p.y - off) / h + 0.5) * h + off);
  float c2 = c + sign(p.x - c * w);
  if (c2 == c) c2 = c + 1.0;
  float off2 = mod(c2, 2.0) * h * 0.5;
  vec2 b = vec2(c2 * w, floor((p.y - off2) / h + 0.5) * h + off2);
  return distance(p, a) < distance(p, b) ? a : b;
}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 px = uv * uInputSize.xy;
  vec4 src = texture(uTexture, uv);
  vec3 c = src.rgb;
  int mode = int(uMode + 0.5);
  if (mode == 1) {
    // Warm: golden, a touch more contrast.
    c = (c - 0.5) * 1.06 + 0.5;
    c *= vec3(1.1, 1.0, 0.86);
    c += vec3(0.04, 0.02, 0.0);
  } else if (mode == 2) {
    // Cool: blue shadows, a little paler.
    c *= vec3(0.9, 0.98, 1.12);
    c = mix(c, vec3(0.75, 0.85, 1.0), 0.08);
  } else if (mode == 3) {
    // Night vision: green on black with scanlines and a round vignette.
    float l = luma(c) * 1.5 + 0.08;
    c = vec3(0.1, 1.0, 0.3) * l;
    float line = 0.82 + 0.18 * sin(px.y * 1.6);
    c *= line;
    vec2 d = (uv - 0.5) * vec2(uInputSize.x / uInputSize.y, 1.0);
    c *= smoothstep(1.05, 0.55, length(d));
  } else if (mode == 4) {
    // Old photo: sepia, grain, faded corners.
    float l = luma(c);
    c = vec3(l * 1.08 + 0.06, l * 0.9 + 0.03, l * 0.68);
    float g = (hash(floor(px * 0.5) + uGrain) - 0.5) * 0.14;
    c += g;
    vec2 d = (uv - 0.5) * vec2(uInputSize.x / uInputSize.y, 1.0);
    c *= 1.0 - 0.45 * smoothstep(0.45, 1.0, length(d));
    c = mix(c, vec3(0.93, 0.86, 0.72), 0.12);
  } else if (mode == 5) {
    // Comic: five tones per channel and inked edges.
    vec3 q = floor(c * 5.0 + 0.5) / 5.0;
    vec2 o = uInputSize.zw;
    float lx = luma(texture(uTexture, uv + vec2(o.x, 0.0)).rgb) - luma(texture(uTexture, uv - vec2(o.x, 0.0)).rgb);
    float ly = luma(texture(uTexture, uv + vec2(0.0, o.y)).rgb) - luma(texture(uTexture, uv - vec2(0.0, o.y)).rgb);
    float edge = smoothstep(0.08, 0.3, length(vec2(lx, ly)));
    c = mix(q * 1.05, vec3(0.1, 0.07, 0.11), edge);
  } else if (mode == 6) {
    // Bug eye: a honeycomb of little lenses.
    float r = 22.0;
    vec2 center = hexCenter(px, r);
    vec3 s = texture(uTexture, center * uInputSize.zw).rgb;
    float d = distance(px, center) / r;
    float rim = smoothstep(0.78, 0.92, d);
    float shine = smoothstep(0.5, 0.0, distance(px, center - vec2(r * 0.3, r * 0.3)) / r) * 0.18;
    c = mix(s + shine, s * 0.45, rim);
  }
  finalColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`;

/** Build the look filter at `mode`. One per photo mode; `setMode` swaps looks. */
export class LookFilter extends Filter {
  constructor(mode: number) {
    super({
      glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT, name: 'bb-photo-look' }),
      resources: {
        lookUniforms: {
          uMode: { value: mode, type: 'f32' },
          uGrain: { value: 0.37, type: 'f32' },
        },
      },
    });
  }

  setMode(mode: number): void {
    (this.resources.lookUniforms as { uniforms: { uMode: number } }).uniforms.uMode = mode;
  }
}

const sun = (g: Graphics, s: number): void => {
  g.circle(0, 0, s * 0.26)
    .fill(STAR)
    .stroke(stroke(4));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.moveTo(Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.34)
      .lineTo(Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.46)
      .stroke({ width: 5, color: OUTLINE, cap: 'round' });
  }
};

export const FILTERS: readonly FilterDef[] = [
  {
    id: 'filter_none',
    mode: 0,
    icon: (g, s) => {
      g.roundRect(-s * 0.36, -s * 0.28, s * 0.72, s * 0.56, 8)
        .fill(0xffffff)
        .stroke(stroke(4));
      g.circle(-s * 0.14, -s * 0.06, s * 0.1).fill(STAR);
      g.moveTo(-s * 0.3, s * 0.22)
        .lineTo(-s * 0.08, s * 0.0)
        .lineTo(s * 0.06, s * 0.12)
        .lineTo(s * 0.18, s * 0.02)
        .lineTo(s * 0.3, s * 0.22)
        .fill(0x7bd84a);
    },
  },
  { id: 'filter_warm', mode: 1, icon: sun },
  {
    id: 'filter_cool',
    mode: 2,
    icon: (g, s) => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        g.moveTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42)
          .lineTo(-Math.cos(a) * s * 0.42, -Math.sin(a) * s * 0.42)
          .stroke({ width: 6, color: 0x4d9bff, cap: 'round' });
      }
      g.circle(0, 0, s * 0.1)
        .fill(0xffffff)
        .stroke({ width: 4, color: 0x4d9bff });
    },
  },
  {
    id: 'filter_night_vision',
    mode: 3,
    icon: (g, s) => {
      g.circle(0, 0, s * 0.4)
        .fill(0x113a1a)
        .stroke(stroke(4));
      g.ellipse(0, 0, s * 0.3, s * 0.18).fill(0x33ff66);
      g.circle(0, 0, s * 0.1).fill(0x113a1a);
      for (const y of [-s * 0.2, 0, s * 0.2])
        g.moveTo(-s * 0.3, y)
          .lineTo(s * 0.3, y)
          .stroke({ width: 2, color: 0x113a1a, alpha: 0.7 });
    },
  },
  {
    id: 'filter_old_photo',
    mode: 4,
    icon: (g, s) => {
      g.roundRect(-s * 0.36, -s * 0.3, s * 0.72, s * 0.6, 6)
        .fill(0xe6d2a6)
        .stroke(stroke(4));
      g.roundRect(-s * 0.28, -s * 0.22, s * 0.56, s * 0.34, 3).fill(0x8a6a44);
      g.circle(s * 0.1, -s * 0.1, s * 0.06).fill(0xe6d2a6);
      g.moveTo(-s * 0.25, s * 0.1)
        .lineTo(-s * 0.05, -s * 0.05)
        .lineTo(s * 0.12, s * 0.1)
        .fill(0xb59a6a);
    },
  },
  {
    id: 'filter_comic',
    mode: 5,
    icon: (g, s) => {
      g.star(0, 0, 10, s * 0.46, s * 0.3)
        .fill(STAR)
        .stroke(stroke(5));
      g.roundRect(-s * 0.05, -s * 0.24, s * 0.1, s * 0.3, 4).fill(OUTLINE);
      g.circle(0, s * 0.16, s * 0.06).fill(OUTLINE);
    },
  },
  {
    id: 'filter_bug_eye',
    mode: 6,
    unlock: 'secret_scope_wubbo',
    icon: (g, s) => {
      const r = s * 0.14;
      for (const [x, y] of [
        [0, 0],
        [1.5, 0.87],
        [1.5, -0.87],
        [-1.5, 0.87],
        [-1.5, -0.87],
        [0, 1.73],
        [0, -1.73],
      ] as const)
        g.regularPoly(x * r, y * r, r * 0.95, 6, Math.PI / 6)
          .fill(0x9bd0ff)
          .stroke({ width: 3, color: OUTLINE });
    },
  },
];

export const filterById = (id: string): FilterDef => FILTERS.find((f) => f.id === id) ?? FILTERS[0]!;
