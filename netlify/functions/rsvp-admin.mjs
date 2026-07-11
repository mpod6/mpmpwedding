// Token-protected admin endpoint. All calls require either
//   Authorization: Bearer $RSVP_ADMIN_TOKEN   or   ?token=$RSVP_ADMIN_TOKEN
//
//   PUT  /api/rsvp-admin/guestlist   body = guest list JSON → validate & store
//   GET  /api/rsvp-admin/guestlist   → current guest list
//   GET  /api/rsvp-admin/export      → all responses as CSV (one row per person)
//   GET  /api/rsvp-admin/status      → counts: parties responded, headcount, meals
//   DELETE /api/rsvp-admin/response/<partyId> → remove one response

import {
  weddingStore,
  loadGuestList,
  validateGuestList,
  checkAdminToken,
  json,
  csvEscape,
} from "./lib/shared.mjs"

async function allResponses(store, list) {
  const out = []
  for (const p of list) {
    const r = await store.get(`rsvp/${p.party}`, { type: "json" }).catch(() => null)
    out.push({ party: p, response: r })
  }
  return out
}

export default async (req, context) => {
  const auth = checkAdminToken(req)
  if (!auth.ok) return json({ error: auth.reason }, 401)

  const action = context.params?.action || ""
  const store = weddingStore()

  // ── Guest list upload / view ────────────────────────────────────────────────
  if (action === "guestlist" && req.method === "PUT") {
    let list
    try {
      list = await req.json()
    } catch {
      return json({ error: "Body must be valid JSON." }, 400)
    }
    const errors = validateGuestList(list)
    if (errors.length) return json({ error: "Guest list rejected.", details: errors }, 400)
    await store.setJSON("guestlist", list)
    const people = list.reduce((n, p) => n + p.members.length, 0)
    const plusOnes = list.reduce((n, p) => n + (p.plusOnes || 0), 0)
    return json({ ok: true, parties: list.length, namedGuests: people, openPlusOnes: plusOnes })
  }

  if (action === "guestlist" && req.method === "GET") {
    const list = await loadGuestList(store)
    return list ? json(list) : json({ error: "No guest list uploaded yet." }, 404)
  }

  // ── CSV export ──────────────────────────────────────────────────────────────
  if (action === "export" && req.method === "GET") {
    const list = await loadGuestList(store)
    if (!list) return json({ error: "No guest list uploaded yet." }, 404)
    const rows = [
      ["party", "guest", "is_plus_one", "responded", "attending", "meal", "allergies", "song", "last_updated"],
    ]
    for (const { party, response } of await allResponses(store, list)) {
      if (!response) {
        for (const m of party.members)
          rows.push([party.party, m, "no", "no", "", "", "", "", ""])
        continue
      }
      for (const r of response.responses) {
        rows.push([
          party.party, r.name, "no", "yes",
          r.attending ? "yes" : "no",
          r.meal || "",
          response.allergies || "",
          response.song || "",
          response.submittedAt,
        ])
      }
      if (response.plusOne?.bringing) {
        rows.push([
          party.party, response.plusOne.name, "yes", "yes", "yes",
          response.plusOne.meal || "",
          response.allergies || "",
          response.song || "",
          response.submittedAt,
        ])
      }
    }
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="rsvps.csv"',
      },
    })
  }

  // ── Status summary ──────────────────────────────────────────────────────────
  if (action === "status" && req.method === "GET") {
    const list = await loadGuestList(store)
    if (!list) return json({ error: "No guest list uploaded yet." }, 404)
    let responded = 0, attending = 0, declined = 0, plusOnes = 0
    const meals = {}
    for (const { response } of await allResponses(store, list)) {
      if (!response) continue
      responded++
      for (const r of response.responses) {
        if (r.attending) {
          attending++
          if (r.meal) meals[r.meal] = (meals[r.meal] || 0) + 1
        } else declined++
      }
      if (response.plusOne?.bringing) {
        attending++
        plusOnes++
        if (response.plusOne.meal) meals[response.plusOne.meal] = (meals[response.plusOne.meal] || 0) + 1
      }
    }
    return json({
      parties: { total: list.length, responded, awaiting: list.length - responded },
      headcount: { attending, declined, plusOnesBrought: plusOnes },
      meals,
    })
  }

  // ── Delete a single response (e.g. to let a party redo from scratch) ───────
  if (req.method === "DELETE" && action === "response") {
    const id = context.params?.id
    if (!id) return json({ error: "Specify the party id: DELETE /api/rsvp-admin/response/<partyId>" }, 400)
    await store.delete(`rsvp/${id}`)
    return json({ ok: true, deleted: id })
  }

  return json({ error: `Unknown action "${action}" for method ${req.method}.` }, 404)
}

export const config = { path: ["/api/rsvp-admin/:action", "/api/rsvp-admin/:action/:id"] }
