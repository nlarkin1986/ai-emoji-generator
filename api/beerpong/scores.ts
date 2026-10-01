// 1519 MADISON TAILGATE leaderboard — Vercel Function. See ./_lib.ts for the API, storage and anti-cheat rules.
import { scoresDelete, scoresGet, scoresPost, soften } from "./_lib"

export const GET = soften(scoresGet)
export const POST = soften(scoresPost)
export const DELETE = scoresDelete
