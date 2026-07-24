// Menu icons — the flat modern indigo glyphs the pygame menu draws
// (`_render_icon` in gui.py), ported to inline SVG so the two front-ends show
// the same picture for the same row. Every icon is drawn in a 0..100 box (the
// pygame code's `d`), so the coordinate expressions below match gui.py
// one-for-one; pygame stroke widths are given in its 352-unit supersampled
// space and scaled here by `sw`.

const D = 100;
const C = D / 2;

// The palette from gui.py: a mid indigo, a lighter and a darker shade, and a
// soft same-hue hairline outline.
const BLUE = "#6366f1";
const LIGHT = "#9fa6fc";
const DARK = "#4338ca";
const OUTLINE = "#4f52c2";

/** Corner radius the flat glyphs round their corners by (gui.py _ICON_CORNER). */
const CORNER = D * 0.03;

type P = [number, number];

/** A pygame stroke width (in its 352-unit render space) in icon units. */
function sw(width: number): number {
  return (width * D) / 352;
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function ngon(cx: number, cy: number, r: number, sides: number, rotation = 0): P[] {
  const pts: P[] = [];
  for (let k = 0; k < sides; k++) {
    const a = ((360 / sides) * k + rotation) * (Math.PI / 180);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function hexagon(cx: number, cy: number, r: number, rotation = 30): P[] {
  return ngon(cx, cy, r, 6, rotation);
}

function lerp(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** A Catmull-Rom spline through `control` (endpoints duplicated) — gui.py
 * _smooth_curve, so a few hand-placed points read as one smooth curve. */
function smoothCurve(control: P[], steps = 8): P[] {
  const pts = [control[0]!, ...control, control[control.length - 1]!];
  const out: P[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1]!, pts[i]!, pts[i + 1]!, pts[i + 2]!];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (j: 0 | 1): number =>
        0.5 *
        (2 * p1[j] +
          (-p0[j] + p2[j]) * t +
          (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
          (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  out.push(control[control.length - 1]!);
  return out;
}

/** A filled band of half-width `radius` along `centerline` (gui.py
 * _tube_polygon): offset every point left and right, then join the sides. */
function tubePolygon(centerline: P[], radius: number): P[] {
  const left: P[] = [];
  const right: P[] = [];
  const len = centerline.length;
  for (let i = 0; i < len; i++) {
    const [x, y] = centerline[i]!;
    const [ax, ay] = centerline[Math.max(0, i - 1)]!;
    const [bx, by] = centerline[Math.min(len - 1, i + 1)]!;
    const [tx, ty] = [bx - ax, by - ay];
    const l = Math.hypot(tx, ty) || 1;
    const [nx, ny] = [-ty / l, tx / l];
    left.push([x + nx * radius, y + ny * radius]);
    right.push([x - nx * radius, y - ny * radius]);
  }
  return [...left, ...right.reverse()];
}

/** A closed polygon with every corner tucked back into a short quadratic arc
 * (gui.py _round_corners), as an SVG path. */
function roundedPath(points: P[], radius = CORNER): string {
  const len = points.length;
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    const prev = points[(i - 1 + len) % len]!;
    const cur = points[i]!;
    const next = points[(i + 1) % len]!;
    const toward = (nb: P): P => {
      const [vx, vy] = [nb[0] - cur[0], nb[1] - cur[1]];
      const dist = Math.hypot(vx, vy) || 1;
      const r = Math.min(radius, dist / 2);
      return [cur[0] + (vx / dist) * r, cur[1] + (vy / dist) * r];
    };
    const a = toward(prev);
    const b = toward(next);
    parts.push(`${i === 0 ? "M" : "L"}${n(a[0])} ${n(a[1])}`);
    parts.push(`Q${n(cur[0])} ${n(cur[1])} ${n(b[0])} ${n(b[1])}`);
  }
  return `${parts.join("")}Z`;
}

/** A filled, hairline-outlined glyph shape (gui.py _icon_shape); `width` 0
 * fills without an outline. */
function shape(points: P[], fill = BLUE, width = 4): string {
  const stroke =
    width > 0
      ? ` stroke="${OUTLINE}" stroke-width="${n(sw(Math.max(2, width - 1)))}" stroke-linejoin="round"`
      : "";
  return `<path d="${roundedPath(points)}" fill="${fill}"${stroke}/>`;
}

/** A polygon with an inner polygon punched out of it (pygame erases the hole
 * with a transparent fill); even-odd makes the hole show the background. */
function holed(outer: P[], inner: P[], fill = BLUE, width = 4): string {
  return `<path d="${roundedPath(outer)}${roundedPath(
    inner,
  )}" fill="${fill}" fill-rule="evenodd" stroke="${OUTLINE}" stroke-width="${n(
    sw(Math.max(2, width - 1)),
  )}" stroke-linejoin="round"/>`;
}

function line(a: P, b: P, color = DARK, width = 3): string {
  return `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}" stroke="${color}" stroke-width="${n(
    sw(width),
  )}" stroke-linecap="round" fill="none"/>`;
}

function circle(cx: number, cy: number, r: number, fill = BLUE, width = 4): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${DARK}" stroke-width="${n(
    sw(width),
  )}"/>`;
}

function ellipseArc(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(
    ry,
  )} 0 1 0 ${n(-2 * rx)} 0Z`;
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill = BLUE,
  width = 4,
): string {
  const stroke = width > 0 ? ` stroke="${DARK}" stroke-width="${n(sw(width))}"` : "";
  return `<path d="${ellipseArc(cx, cy, rx, ry)}" fill="${fill}"${stroke}/>`;
}

/** The lower half of an ellipse's outline (the visible rim of a cylinder's
 * base — pygame draws it with an arc so no line crosses the body). */
function ellipseLowerArc(cx: number, cy: number, rx: number, ry: number, width = 4): string {
  return `<path d="M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 1 ${n(
    2 * rx,
  )} 0" fill="none" stroke="${DARK}" stroke-width="${n(sw(width))}"/>`;
}

/** A ring: an ellipse with a smaller one punched through it. */
function ellipseRing(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  hx: number,
  hy: number,
  fill = BLUE,
  width = 4,
): string {
  return `<path d="${ellipseArc(cx, cy, rx, ry)}${ellipseArc(
    cx,
    cy,
    hx,
    hy,
  )}" fill="${fill}" fill-rule="evenodd" stroke="${DARK}" stroke-width="${n(sw(width))}"/>`;
}

/** A small light shape marking which tiling a surface uses (gui.py _icon_badge). */
function badge(cx: number, cy: number, r: number, kind: "tri" | "hex" | "square"): string {
  const pts: P[] =
    kind === "tri"
      ? [
          [cx, cy - r],
          [cx - r * 0.95, cy + r * 0.8],
          [cx + r * 0.95, cy + r * 0.8],
        ]
      : kind === "hex"
        ? hexagon(cx, cy, r)
        : [
            [cx - r, cy - r],
            [cx + r, cy - r],
            [cx + r, cy + r],
            [cx - r, cy + r],
          ];
  return shape(pts, LIGHT, 4);
}

/** Menu keys that reuse another key's drawing (gui.py _ICON_ALIASES). */
const ALIASES: Record<string, string> = {
  tri: "trigrid",
  aperiodic: "penrose",
  polyhedra: "cube",
  classic: "square", // the "Classic" home entry: flat squares
  manifolds: "torus", // the "Flat manifolds" home entry
  other: "cube", // the "Other" home entry
  random: "start", // the "Random tiling" picker entry
};

const SPHERES = ["sphere", "c80", "c180", "spheretri", "snubdodec"];

function draw(rawKey: string): string[] {
  const key = ALIASES[rawKey] ?? rawKey;
  const d = D;
  const parts: string[] = [];

  if (key === "start") {
    // a question mark: a hooked stroke over a dot (the random-tiling entry)
    const control: P[] = [
      [d * 0.34, d * 0.3],
      [d * 0.38, d * 0.16],
      [d * 0.54, d * 0.11],
      [d * 0.7, d * 0.18],
      [d * 0.72, d * 0.35],
      [d * 0.58, d * 0.46],
      [d * 0.5, d * 0.55],
      [d * 0.5, d * 0.64],
    ];
    parts.push(shape(tubePolygon(smoothCurve(control), d * 0.055)));
    parts.push(circle(d * 0.5, d * 0.8, d * 0.075));
  } else if (key === "uniform") {
    // one shape of each kind: the group of uniform tilings
    parts.push(
      shape([
        [d * 0.08, d * 0.08],
        [d * 0.48, d * 0.08],
        [d * 0.48, d * 0.48],
        [d * 0.08, d * 0.48],
      ]),
      shape(hexagon(d * 0.72, d * 0.28, d * 0.22)),
      shape(
        [
          [d * 0.28, d * 0.9],
          [d * 0.08, d * 0.55],
          [d * 0.48, d * 0.55],
        ],
        LIGHT,
      ),
      shape([
        [d * 0.52, d * 0.55],
        [d * 0.92, d * 0.55],
        [d * 0.92, d * 0.9],
        [d * 0.52, d * 0.9],
      ]),
    );
  } else if (key === "dual") {
    // the Laves (dual) tilings: the Cairo pentagon and rhombille rhombi
    parts.push(
      shape(ngon(d * 0.34, d * 0.36, d * 0.28, 5, -90)),
      shape(
        [
          [d * 0.72, d * 0.34],
          [d * 0.92, d * 0.62],
          [d * 0.72, d * 0.9],
          [d * 0.52, d * 0.62],
        ],
        LIGHT,
      ),
      shape(
        [
          [d * 0.12, d * 0.66],
          [d * 0.44, d * 0.66],
          [d * 0.3, d * 0.94],
          [d * -0.02, d * 0.94],
        ],
        LIGHT,
      ),
    );
  } else if (key === "flat" || key === "square" || key === "torus_tile") {
    const gap = d * 0.04;
    const tile = d * 0.42;
    for (const ix of [0, 1]) {
      for (const iy of [0, 1]) {
        const x = C - tile - gap / 2 + ix * (tile + gap);
        const y = C - tile - gap / 2 + iy * (tile + gap);
        parts.push(
          shape([
            [x, y],
            [x + tile, y],
            [x + tile, y + tile],
            [x, y + tile],
          ]),
        );
      }
    }
  } else if (key === "triangle") {
    parts.push(
      holed(
        [
          [C, d * 0.08],
          [d * 0.05, d * 0.9],
          [d * 0.95, d * 0.9],
        ],
        [
          [C - d * 0.22, d * 0.49],
          [C + d * 0.22, d * 0.49],
          [C, d * 0.9],
        ],
      ),
    );
  } else if (key === "trigrid") {
    const w = d * 0.46;
    for (let i = 0; i < 3; i++) {
      const x = d * 0.04 + i * w * 0.5;
      parts.push(
        shape(
          i % 2 === 0
            ? [
                [x, d * 0.85],
                [x + w, d * 0.85],
                [x + w / 2, d * 0.18],
              ]
            : [
                [x, d * 0.18],
                [x + w, d * 0.18],
                [x + w / 2, d * 0.85],
              ],
        ),
      );
    }
  } else if (key === "hex") {
    parts.push(shape(hexagon(C, C, d * 0.44)));
  } else if (key === "hexhex") {
    const r = d * 0.155;
    const centers: P[] = [[C, C]];
    for (let k = 0; k < 6; k++) {
      const a = (60 * k * Math.PI) / 180;
      centers.push([C + 2 * r * 0.95 * Math.cos(a), C + 2 * r * 0.95 * Math.sin(a)]);
    }
    for (const [hx, hy] of centers) parts.push(shape(hexagon(hx, hy, r)));
  } else if (key === "penrose") {
    // a sun of five thick rhombi
    const side = d * 0.3;
    const diag = d * 0.3 * 1.618;
    for (let k = 0; k < 5; k++) {
      const a = ((72 * k - 90) * Math.PI) / 180;
      const s36 = Math.PI / 5;
      parts.push(
        shape([
          [C, C],
          [C + side * Math.cos(a - s36), C + side * Math.sin(a - s36)],
          [C + diag * Math.cos(a), C + diag * Math.sin(a)],
          [C + side * Math.cos(a + s36), C + side * Math.sin(a + s36)],
        ]),
      );
    }
  } else if (key === "hat") {
    // a single hat monotile silhouette (the aperiodic tridecagon)
    const hr3 = Math.sqrt(3) / 2;
    const ab: P[] = [
      [0, 0],
      [-1, -1],
      [0, -2],
      [2, -2],
      [2, -1],
      [4, -2],
      [5, -1],
      [4, 0],
      [3, 0],
      [2, 2],
      [0, 3],
      [0, 2],
      [-1, 2],
    ];
    const raw: P[] = ab.map(([a, b]) => [a + 0.5 * b, hr3 * b]);
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const span = Math.max(maxX - minX, maxY - minY);
    const sc = (d * 0.82) / span;
    const ox = (d - (maxX - minX) * sc) / 2;
    const oy = (d - (maxY - minY) * sc) / 2;
    parts.push(shape(raw.map(([x, y]) => [ox + (x - minX) * sc, oy + (maxY - y) * sc])));
  } else if (key === "elongated") {
    // a square row under a triangle row
    parts.push(
      shape([
        [d * 0.12, d * 0.5],
        [d * 0.5, d * 0.5],
        [d * 0.5, d * 0.88],
        [d * 0.12, d * 0.88],
      ]),
      shape([
        [d * 0.5, d * 0.5],
        [d * 0.88, d * 0.5],
        [d * 0.88, d * 0.88],
        [d * 0.5, d * 0.88],
      ]),
      shape(
        [
          [d * 0.12, d * 0.5],
          [d * 0.5, d * 0.5],
          [d * 0.31, d * 0.12],
        ],
        LIGHT,
      ),
      shape([
        [d * 0.5, d * 0.5],
        [d * 0.31, d * 0.12],
        [d * 0.69, d * 0.12],
      ]),
      shape(
        [
          [d * 0.5, d * 0.5],
          [d * 0.88, d * 0.5],
          [d * 0.69, d * 0.12],
        ],
        LIGHT,
      ),
    );
  } else if (key === "snubsquare") {
    // an upright and a tilted square joined by triangles
    parts.push(
      shape(ngon(d * 0.32, d * 0.62, d * 0.26, 4, 45)),
      shape(ngon(d * 0.68, d * 0.36, d * 0.26, 4, 15)),
      shape(
        [
          [d * 0.32, d * 0.25],
          [d * 0.5, d * 0.44],
          [d * 0.58, d * 0.14],
        ],
        LIGHT,
      ),
      shape(
        [
          [d * 0.5, d * 0.6],
          [d * 0.72, d * 0.82],
          [d * 0.86, d * 0.6],
        ],
        LIGHT,
      ),
    );
  } else if (key === "kagome") {
    parts.push(shape(hexagon(C, C, d * 0.3, 0)));
    for (let k = 0; k < 3; k++) {
      const a = ((120 * k - 90) * Math.PI) / 180;
      parts.push(
        shape(
          ngon(C + d * 0.42 * Math.cos(a), C + d * 0.42 * Math.sin(a), d * 0.15, 3, 120 * k - 90),
          LIGHT,
        ),
      );
    }
  } else if (key === "snubhex") {
    parts.push(shape(hexagon(C, C, d * 0.28)));
    for (let k = 0; k < 6; k++) {
      const a = (60 * k * Math.PI) / 180;
      parts.push(
        shape(
          ngon(C + d * 0.4 * Math.cos(a), C + d * 0.4 * Math.sin(a), d * 0.12, 3, 60 * k + 30),
          LIGHT,
          3,
        ),
      );
    }
  } else if (key === "truncsquare") {
    parts.push(
      shape(ngon(C, C, d * 0.42, 8, 22.5)),
      shape(ngon(d * 0.85, d * 0.85, d * 0.13, 4, 45), LIGHT),
    );
  } else if (key === "trunchex") {
    parts.push(
      shape(ngon(C, C, d * 0.42, 12, 15)),
      shape(ngon(d * 0.86, d * 0.82, d * 0.13, 3, -90), LIGHT),
    );
  } else if (key === "rhombitrihex") {
    // a hexagon with a square on top and a triangle in a corner
    parts.push(
      shape(hexagon(C, C + d * 0.06, d * 0.28, 0)),
      shape(ngon(C, d * 0.2, d * 0.13, 4, 45), LIGHT),
      shape(ngon(d * 0.84, d * 0.8, d * 0.12, 3, 30), LIGHT),
    );
  } else if (key === "trunctrihex") {
    // a dodecagon flanked by a hexagon and a square badge
    parts.push(
      shape(ngon(C, C, d * 0.42, 12, 15)),
      shape(hexagon(d * 0.83, d * 0.83, d * 0.13, 0), LIGHT),
      shape(ngon(d * 0.17, d * 0.83, d * 0.11, 4, 45), LIGHT, 3),
    );
  } else if (key === "prismaticpent") {
    // rows of pentagons: two stacked (the dual of elongated triangular)
    parts.push(
      shape(ngon(C, d * 0.32, d * 0.26, 5, -90)),
      shape(ngon(C, d * 0.68, d * 0.26, 5, 90), LIGHT),
    );
  } else if (key === "cairo") {
    // two pentagons in the Cairo basketweave (dual of snub square)
    parts.push(
      shape(ngon(d * 0.37, d * 0.4, d * 0.28, 5, -108)),
      shape(ngon(d * 0.63, d * 0.6, d * 0.28, 5, 72), LIGHT),
    );
  } else if (key === "rhombille") {
    // three rhombi meeting as an isometric cube (dual of kagome)
    const h = hexagon(C, C, d * 0.42, -90);
    parts.push(
      shape([h[0]!, h[1]!, [C, C], h[5]!], LIGHT),
      shape([h[1]!, h[2]!, h[3]!, [C, C]], BLUE),
      shape([h[5]!, [C, C], h[3]!, h[4]!], DARK),
    );
  } else if (key === "floret") {
    // six pentagons pinwheeling round a centre (dual of snub hexagonal)
    for (let k = 0; k < 6; k++) {
      const a = (60 * k * Math.PI) / 180;
      parts.push(
        shape(
          ngon(C + d * 0.24 * Math.cos(a), C + d * 0.24 * Math.sin(a), d * 0.17, 5, 60 * k + 20),
          k % 2 ? LIGHT : BLUE,
          3,
        ),
      );
    }
  } else if (key === "tetrakis") {
    // a square cut by both diagonals into four triangles
    const sq: P[] = [
      [d * 0.12, d * 0.12],
      [d * 0.88, d * 0.12],
      [d * 0.88, d * 0.88],
      [d * 0.12, d * 0.88],
    ];
    parts.push(shape(sq));
    for (const corner of sq) parts.push(line([C, C], corner, DARK, 4));
  } else if (key === "triakis") {
    // a triangle split from its centre into three (dual of trunc. hex.)
    const outer = ngon(C, C + d * 0.04, d * 0.46, 3, -90);
    parts.push(shape(outer));
    for (const v of outer) parts.push(line([C, C + d * 0.04], v, DARK, 4));
  } else if (key === "deltoidal" || key === "kisrhombille") {
    const h = hexagon(C, C, d * 0.44, 0);
    const mids: P[] = h.map((p, k) => [
      (p[0] + h[(k + 1) % 6]![0]) / 2,
      (p[1] + h[(k + 1) % 6]![1]) / 2,
    ]);
    if (key === "deltoidal") {
      // a ring of kites round a centre (dual of rhombitrihexagonal)
      for (let k = 0; k < 6; k++) {
        parts.push(
          shape([[C, C], mids[(k + 5) % 6]!, h[k]!, mids[k]!], k % 2 ? LIGHT : BLUE, 3),
        );
      }
    } else {
      // a hexagon barycentrically cut into twelve right triangles
      parts.push(shape(h));
      for (const pt of [...h, ...mids]) parts.push(line([C, C], pt, DARK, 3));
    }
  } else if (SPHERES.includes(key)) {
    parts.push(circle(C, C, d * 0.44));
    if (key === "spheretri") {
      parts.push(badge(C, C, d * 0.2, "tri"));
    } else if (key === "snubdodec") {
      parts.push(shape(ngon(C, C - d * 0.06, d * 0.17, 5, -90), LIGHT));
      for (let k = 0; k < 5; k++) {
        const a = ((72 * k - 90) * Math.PI) / 180;
        parts.push(
          badge(
            C + d * 0.3 * Math.cos(a) * 1.05,
            C - d * 0.06 + d * 0.3 * Math.sin(a) * 1.05,
            d * 0.08,
            "tri",
          ),
        );
      }
    } else {
      // pentagon centre for the pentagonal solids, hexagon for C180
      const sides = key === "c180" ? 6 : 5;
      const inner: P[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (((360 / sides) * k - 90) * Math.PI) / 180;
        inner.push([C + d * 0.2 * Math.cos(a), C + d * 0.2 * Math.sin(a)]);
      }
      parts.push(shape(inner, LIGHT));
      if (key === "c80" || key === "c180") {
        // bond lines, fullerene style
        for (let k = 0; k < sides; k++) {
          const a = (((360 / sides) * k - 90) * Math.PI) / 180;
          parts.push(
            line(
              [C + d * 0.2 * Math.cos(a), C + d * 0.2 * Math.sin(a)],
              [C + d * 0.41 * Math.cos(a), C + d * 0.41 * Math.sin(a)],
              DARK,
              4,
            ),
          );
        }
      }
    }
  } else if (key === "cube" || key === "cubeframe") {
    // an isometric cube: three visible rhombic faces, grid-lined (cube) or
    // bored through (the Menger frame)
    const h = hexagon(C, C, d * 0.4, -90); // h0 top, then clockwise
    const faces: [P[], string][] = [
      [[h[0]!, h[1]!, [C, C], h[5]!], LIGHT], // top
      [[h[1]!, h[2]!, h[3]!, [C, C]], BLUE], // right
      [[h[5]!, [C, C], h[3]!, h[4]!], DARK], // left
    ];
    for (const [quad, fill] of faces) {
      if (key === "cube") {
        parts.push(shape(quad, fill));
        const [a, b, cc, dd] = quad as [P, P, P, P];
        for (const k of [1, 2]) {
          const t = k / 3;
          parts.push(line(lerp(a, b, t), lerp(dd, cc, t)));
          parts.push(line(lerp(a, dd, t), lerp(b, cc, t)));
        }
      } else {
        const fx = quad.reduce((s, p) => s + p[0], 0) / 4;
        const fy = quad.reduce((s, p) => s + p[1], 0) / 4;
        const hole: P[] = quad.map((p) => [fx + (p[0] - fx) * 0.44, fy + (p[1] - fy) * 0.44]);
        parts.push(holed(quad, hole, fill));
      }
    }
  } else if (key === "steppedbipyramid") {
    // a terraced diamond: square slabs widest at the equator
    const widths = [0.34, 0.58, 0.82, 0.58, 0.34];
    const shades = [LIGHT, LIGHT, BLUE, DARK, DARK];
    const slab = d * 0.135;
    const topY = C - (slab * widths.length) / 2;
    widths.forEach((w, idx) => {
      const ww = d * w;
      const y = topY + idx * slab;
      parts.push(
        shape(
          [
            [C - ww / 2, y],
            [C + ww / 2, y],
            [C + ww / 2, y + slab],
            [C - ww / 2, y + slab],
          ],
          shades[idx],
        ),
      );
    });
  } else if (key === "tetrahedron" || key === "tetraframe") {
    const outer = ngon(C, C + d * 0.04, d * 0.46, 3, -90);
    const shades = [LIGHT, BLUE, DARK];
    if (key === "tetrahedron") {
      // seen down a vertex: outer triangle with edges to the centre
      for (let k = 0; k < 3; k++) {
        const [a, b] = [outer[k]!, outer[(k + 1) % 3]!];
        parts.push(shape([a, b, [C, C]], shades[k]));
        parts.push(line(lerp(a, b, 0.5), [C, C]));
        parts.push(line(lerp(a, [C, C], 0.5), lerp(b, [C, C], 0.5)));
      }
    } else {
      // a level-1 Sierpiński tetrahedron: corner sub-triangles only
      const mids = outer.map((p, k) => lerp(p, outer[(k + 1) % 3]!, 0.5));
      for (let k = 0; k < 3; k++) {
        parts.push(shape([outer[k]!, mids[k]!, mids[(k + 2) % 3]!], shades[k]));
      }
    }
  } else if (key === "torus") {
    parts.push(ellipseRing(C, C, d * 0.46, d * 0.28, d * 0.17, d * 0.09));
  } else if (key === "mobius") {
    parts.push(ellipseRing(C, C, d * 0.45, d * 0.34, d * 0.21, d * 0.13));
    // the twist at the front
    parts.push(line([C - d * 0.09, d * 0.84], [C + d * 0.09, d * 0.63], DARK, 6));
    parts.push(line([C - d * 0.09, d * 0.63], [C + d * 0.09, d * 0.84], LIGHT, 6));
  } else if (key === "cylinder") {
    parts.push(
      shape(
        [
          [d * 0.18, d * 0.2],
          [d * 0.82, d * 0.2],
          [d * 0.82, d * 0.8],
          [d * 0.18, d * 0.8],
        ],
        BLUE,
        0,
      ),
      ellipse(C, d * 0.8, d * 0.32, d * 0.12, BLUE, 0),
      ellipseLowerArc(C, d * 0.8, d * 0.32, d * 0.12),
      line([d * 0.18, d * 0.2], [d * 0.18, d * 0.8], DARK, 4),
      line([d * 0.82, d * 0.2], [d * 0.82, d * 0.8], DARK, 4),
      ellipse(C, d * 0.2, d * 0.32, d * 0.12, LIGHT),
    );
  } else if (key === "klein") {
    // the classic Klein bottle: a bulb whose neck arcs over the top and dives
    // back in through the shoulder, opening into the interior
    const control: P[] = [
      [d * 0.5, d * 0.64], // the mouth, deep inside the bulb
      [d * 0.5, d * 0.4],
      [d * 0.52, d * 0.24],
      [d * 0.62, d * 0.15],
      [d * 0.75, d * 0.16],
      [d * 0.84, d * 0.28],
      [d * 0.82, d * 0.45],
      [d * 0.7, d * 0.57], // plunging back toward the bulb
      [d * 0.58, d * 0.62],
    ];
    // The hole where the neck passes through the bulb's shoulder into the
    // interior is a true hole: pygame erases it, so mask it out of both the
    // neck and the bulb rather than punching the bulb alone (which would show
    // the neck through it), then draw its rim.
    const [hx, hy, hrx, hry] = [d * 0.5, d * 0.6, d * 0.1, d * 0.07];
    parts.push(
      `<mask id="ms-klein-hole"><rect width="${d}" height="${d}" fill="#fff"/>` +
        `<path d="${ellipseArc(hx, hy, hrx, hry)}" fill="#000"/></mask>`,
      `<g mask="url(#ms-klein-hole)">`,
      shape(tubePolygon(smoothCurve(control), d * 0.085)),
      // the bulb, over the neck's lower end so the neck dives behind it
      ellipse(d * 0.39, d * 0.67, d * 0.27, d * 0.25),
      `</g>`,
      `<path d="${ellipseArc(hx, hy, hrx, hry)}" fill="none" stroke="${DARK}" stroke-width="${n(
        sw(4),
      )}"/>`,
    );
  } else {
    parts.push(circle(C, C, d * 0.4, BLUE, 2));
  }
  return parts;
}

const cache = new Map<string, string>();

/** The inline SVG for a menu row's icon key (a tiling key, a family key, a
 * mode name or one of the home-page group keys). */
export function menuIcon(key: string): string {
  let svg = cache.get(key);
  if (svg === undefined) {
    svg = `<svg viewBox="0 0 ${D} ${D}" aria-hidden="true" focusable="false">${draw(key).join(
      "",
    )}</svg>`;
    cache.set(key, svg);
  }
  return svg;
}
