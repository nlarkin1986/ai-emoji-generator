// SUPER BEER PONG run checkpoint — POST after every stage clear; see ../../_lib.ts.
import { checkpointPost, soften } from "../../_lib"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const POST = soften(checkpointPost)
