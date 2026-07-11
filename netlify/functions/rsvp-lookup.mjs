// POST /api/rsvp-lookup   body: { "name": "Jane Smith" }
// → 200 { party, members, plusOnes, existing } | 404 not found | 403 closed

import { weddingStore, loadGuestList, findPartyByName, rsvpClosed, json } from "./lib/shared.mjs"

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)
  if (rsvpClosed()) return json({ error: "RSVPs are not open yet." }, 403)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid request." }, 400)
  }

  // Honeypot: real guests never fill this hidden field.
  if (body?.website) return json({ error: "Invalid request." }, 400)

  const name = String(body?.name || "").slice(0, 120)
  if (!name.trim()) return json({ error: "Please enter a name." }, 400)

  const store = weddingStore()
  const list = await loadGuestList(store)
  if (!list) return json({ error: "The guest list isn't loaded yet — please check back soon." }, 503)

  const party = findPartyByName(list, name)
  if (!party) {
    return json(
      {
        error:
          "We couldn't find that name. Try the full name exactly as it appears on your invitation envelope — or reach out to us and we'll sort it out!",
      },
      404,
    )
  }

  const existing = await store.get(`rsvp/${party.party}`, { type: "json" }).catch(() => null)

  return json({
    party: party.party,
    members: party.members,
    plusOnes: Number.isInteger(party.plusOnes) ? party.plusOnes : 0,
    existing: existing
      ? {
          responses: existing.responses,
          plusOne: existing.plusOne,
          allergies: existing.allergies,
          song: existing.song,
          submittedAt: existing.submittedAt,
        }
      : null,
  })
}

export const config = { path: "/api/rsvp-lookup" }
