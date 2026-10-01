// Lets Node (>= 22.18, native TS type stripping) import the Next route files, which use
// extensionless relative imports ("../_lib") like the Next/TS bundler resolution does.
import { registerHooks } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (e) {
      if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]s$/.test(specifier)) throw e
      return next(specifier + ".ts", context)
    }
  },
})
process.removeAllListeners("warning")
process.on("warning", (w) => { if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w.message) })

const root = join(fileURLToPath(import.meta.url), "..", "..", "..")
/** Import the route modules -> { scores, run, checkpoint } */
export async function loadRoutes() {
  return {
    scores: await import(join(root, "api/beerpong/scores.ts")),
    run: await import(join(root, "api/beerpong/run/index.ts")),
    checkpoint: await import(join(root, "api/beerpong/run/checkpoint.ts")),
  }
}
