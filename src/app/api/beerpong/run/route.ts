// SUPER BEER PONG run token — POST at the start of every run; see ../_lib.ts.
import { runPost, soften } from "../_lib"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const POST = soften(runPost)
