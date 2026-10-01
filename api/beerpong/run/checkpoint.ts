// Run checkpoint — POST after every stage clear; see ../_lib.ts.
import { checkpointPost, soften } from "../_lib"

export const POST = soften(checkpointPost)
