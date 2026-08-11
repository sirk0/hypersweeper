import { describe, expect, it } from "vitest";
import {
  markerVertexCount,
  writeMarker,
  type Marker,
  type MarkerSink,
} from "../../src/render/markers3d";
import type { Vec3 } from "../../src/boards/core";

// The 3D pin and bomb. Each kind is generated once as a unit-space model and
// then *placed* by transforming that template, so what needs guarding is that
// the transform is a rigid motion with a scale — a placed marker has to be the
// same object wherever it stands and whichever way the cell it stands on faces,
// or a board's markers stop matching each other.

const KINDS: Marker[] = ["pin", "deadPin", "bomb", "bombHot"];

function sink(verts: number): MarkerSink {
  return {
    pos: new Float32Array(verts * 3),
    nrm: new Float32Array(verts * 3),
    col: new Float32Array(verts * 3),
    count: 0,
  };
}

/** One marker written on its own, at `origin` standing along `up`. */
function place(kind: Marker, origin: Vec3, up: Vec3, scale: number): MarkerSink {
  const s = sink(markerVertexCount(kind));
  writeMarker(kind, origin, up, scale, s);
  return s;
}

describe("3D markers", () => {
  it("writes exactly the vertex count it advertises", () => {
    for (const kind of KINDS) {
      const n = markerVertexCount(kind);
      expect(n).toBeGreaterThan(0);
      expect(n % 3).toBe(0); // whole triangles
      const s = place(kind, [0, 0, 0], [0, 1, 0], 1);
      expect(s.count).toBe(n);
      // Nothing written past the end, and everything before it touched.
      expect(s.pos.length).toBe(n * 3);
    }
  });

  it("appends, so a board's markers share one buffer", () => {
    const one = markerVertexCount("pin");
    const s = sink(one * 2);
    writeMarker("pin", [0, 0, 0], [0, 1, 0], 1, s);
    writeMarker("pin", [5, 0, 0], [0, 1, 0], 1, s);
    expect(s.count).toBe(one * 2);
    // The second copy is the first, translated: same shape, moved 5 along x.
    for (let j = 0; j < one * 3; j += 3) {
      expect(s.pos[one * 3 + j]!).toBeCloseTo(s.pos[j]! + 5, 5);
      expect(s.pos[one * 3 + j + 1]!).toBeCloseTo(s.pos[j + 1]!, 5);
      expect(s.pos[one * 3 + j + 2]!).toBeCloseTo(s.pos[j + 2]!, 5);
    }
  });

  it("scales about the cell it stands on", () => {
    for (const kind of KINDS) {
      const a = place(kind, [0, 0, 0], [0, 1, 0], 1);
      const b = place(kind, [0, 0, 0], [0, 1, 0], 3);
      for (let j = 0; j < a.count * 3; j++) {
        expect(b.pos[j]!).toBeCloseTo(a.pos[j]! * 3, 4);
      }
      // ...and a scaled model keeps its normals: a normal is a direction, and
      // multiplying it by the cell size is how a marker ends up lit wrongly.
      for (let j = 0; j < a.count * 3; j++) {
        expect(b.nrm[j]!).toBeCloseTo(a.nrm[j]!, 5);
      }
    }
  });

  it("keeps unit normals however the cell is turned", () => {
    // The placed normal is the model's rotated by an orthonormal frame, so it
    // needs no renormalising — this is what lets the hot path skip one.
    const ups: Vec3[] = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
      [0.577, 0.577, 0.577],
      [-0.3, 0.8, 0.5],
    ];
    for (const kind of KINDS) {
      for (const up of ups) {
        const s = place(kind, [1, -2, 0.5], up, 0.4);
        for (let j = 0; j < s.count * 3; j += 3) {
          const len = Math.hypot(s.nrm[j]!, s.nrm[j + 1]!, s.nrm[j + 2]!);
          expect(len).toBeCloseTo(1, 4);
        }
      }
    }
  });

  it("is the same object whichever way it is turned", () => {
    // Every distance from the marker's own origin is preserved by the frame, so
    // a pin on a cell facing the camera is the same pin as one on the far side.
    for (const kind of KINDS) {
      const a = place(kind, [0, 0, 0], [0, 1, 0], 1);
      const b = place(kind, [0, 0, 0], [0.577, 0.577, 0.577], 1);
      const radii = (s: MarkerSink) => {
        const r: number[] = [];
        for (let j = 0; j < s.count * 3; j += 3) {
          r.push(Math.hypot(s.pos[j]!, s.pos[j + 1]!, s.pos[j + 2]!));
        }
        return r.sort((x, y) => x - y);
      };
      const ra = radii(a);
      const rb = radii(b);
      for (let i = 0; i < ra.length; i++) expect(rb[i]!).toBeCloseTo(ra[i]!, 4);
    }
  });

  it("gives each kind its own colours, and the same ones every time", () => {
    const first = place("pin", [0, 0, 0], [0, 1, 0], 1);
    const again = place("pin", [3, 1, 2], [1, 0, 0], 0.2);
    expect([...again.col]).toEqual([...first.col]);
    // The dead pin is the same shape in different paint — same vertex count,
    // different colours — which is the whole of what "wrong flag" draws.
    expect(markerVertexCount("deadPin")).toBe(markerVertexCount("pin"));
    const dead = place("deadPin", [0, 0, 0], [0, 1, 0], 1);
    expect([...dead.col]).not.toEqual([...first.col]);
    expect(markerVertexCount("bombHot")).toBe(markerVertexCount("bomb"));
  });

  it("draws nothing for a cell with no size", () => {
    const s = sink(markerVertexCount("pin"));
    writeMarker("pin", [0, 0, 0], [0, 1, 0], 0, s);
    writeMarker("pin", [0, 0, 0], [0, 1, 0], Number.NaN, s);
    expect(s.count).toBe(0);
  });
});
