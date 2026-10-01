// SUPER BEER PONG leaderboard — see ../_lib.ts for the API, storage schema and anti-cheat rules.
import { scoresDelete, scoresGet, scoresPost, soften } from "../_lib"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const GET = soften(scoresGet)
export const POST = soften(scoresPost)
export const DELETE = scoresDelete
