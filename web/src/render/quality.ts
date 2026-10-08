// How much the renderer may spend on effects that are only looks: the particles
// a flag, a blast and a win throw, the soft shadow a solid stands on, the
// reflections and the rim light a solid's tiles catch.
//
// `auto` turns them off on a **software** renderer — SwiftShader, llvmpipe,
// Microsoft's Basic Render Driver — where every one of them is paid for on the
// CPU, and on a device that reports two cores or fewer. Everywhere else they
// are on. The player can say otherwise in Settings › Appearance.
//
// It is also what keeps the visual suite steady: CI draws with SwiftShader, so
// `auto` resolves to `low` there, and a baseline shows the board rather than
// where a particle happened to be. The motion of the tiles themselves is not
// gated here — that is `prefers-reduced-motion`'s business, not a cost.

export type QualityPref = "auto" | "high" | "low";

export const QUALITY_PREFS: readonly QualityPref[] = ["auto", "high", "low"];

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** The GPU's own name for itself, where the browser will say. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
}

/** Whether `auto` should mean high on this device. */
export function capableDevice(renderer: string, cores: number | undefined): boolean {
  if (SOFTWARE.test(renderer)) return false;
  if (cores !== undefined && cores > 0 && cores <= 2) return false;
  return true;
}

/** The effects switch for a stored preference on this device. */
export function effectsOn(pref: QualityPref, capable: boolean): boolean {
  if (pref === "high") return true;
  if (pref === "low") return false;
  return capable;
}

export function resolveQuality(value: unknown): QualityPref {
  return typeof value === "string" && (QUALITY_PREFS as readonly string[]).includes(value)
    ? (value as QualityPref)
    : "auto";
}
