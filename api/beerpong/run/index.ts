// Run token — POST at the start of every run; see ../_lib.ts.
import { runPost, soften } from "../_lib"

export const POST = soften(runPost)
