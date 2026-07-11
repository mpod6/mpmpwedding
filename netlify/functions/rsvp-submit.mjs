// POST /api/rsvp-submit
// body: {
//   party: "id",
//   responses: [{ attending: true, meal: "..." }, ...]   // same order as members
//   plusOne: { bringing: true, name: "...", meal: "..." } | null,
//   allergies: "...", song: "..."
// }
// → 200 { ok, updated } | 400 validation | 403 closed | 404 unknown party

import {
  weddingStore,
  loadGuestList,
  validateSubmission,
  rsvpClosed,
  json,
} from "./lib/shared.mjs"

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)
  if (rsvpClosed()) return json({ error: "RSVPs are not open yet." }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid request." }, 400)
  }

  if (body?.website) return json({ error: "Invalid request." }, 400) // honeypot

  const store = weddingStore()
  const list = await loadGuestList(store)
  if (!list) return json({ error: "The guest list isn't loaded yet — please check back soon." }, 503)

  const party = list.find((p) => p.party === String(body?.party || ""))
  if (!party) return json({ error: "We couldn't find that invitation." }, 404)

  const { errors, clean } = validateSubmission(body, party)
  if (errors.length) return json({ error: errors.join(" ") }, 400)

  const key = `rsvp/${party.party}`
  const previous = await store.get(key, { type: "json" }).catch(() => null)

  const record = {
    partyId: party.party,
    responses: clean.responses,
    plusOne: clean.plusOne,
    allergies: clean.allergies,
    song: clean.song,
    submittedAt: new Date().toISOString(),
    firstSubmittedAt: previous?.firstSubmittedAt ?? new Date().toISOString(),
    updateCount: (previous?.updateCount ?? 0) + (previous ? 1 : 0),
  }

  await store.setJSON(key, record)

  return json({ ok: true, updated: Boolean(previous) })
}

export const config = { path: "/api/rsvp-submit" }
