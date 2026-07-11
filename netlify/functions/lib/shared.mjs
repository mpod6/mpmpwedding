// Shared helpers for the RSVP Netlify Functions.
// Storage layout (Netlify Blobs, store "wedding"):
//   guestlist        → JSON array of parties (uploaded via the admin endpoint)
//   rsvp/<partyId>   → JSON response record for that invitation

import { getStore } from "@netlify/blobs"

// ── Store access ──────────────────────────────────────────────────────────────
export function weddingStore() {
  // Test hook: lets local smoke tests inject an in-memory store.
  if (globalThis.__RSVP_TEST_STORE__) return globalThis.__RSVP_TEST_STORE__
  return getStore("wedding")
}

// ── Gate: server-side backstop for the "RSVPs open later" toggle ─────────────
// The website gate lives in quartz.config.yaml (rsvpOpen option). Setting the
// Netlify env var RSVP_OPEN=false ALSO hard-blocks these endpoints, so the API
// can't be used before opening day. Unset (or any other value) = open.
export function rsvpClosed() {
  return process.env.RSVP_OPEN === "false"
}

// ── Name normalization for lookup ────────────────────────────────────────────
// lowercase, strip accents, drop punctuation, collapse whitespace.
export function normalizeName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ── Guest list ────────────────────────────────────────────────────────────────
// Party shape (as uploaded):
//   { "party": "unique-id", "members": ["Jane Smith", "John Smith"], "plusOnes": 0 }
// members: everyone printed on the invitation. plusOnes: count of unnamed
// additional guests this invitation may bring (0 or 1 typically).
export async function loadGuestList(store) {
  const raw = await store.get("guestlist", { type: "json" })
  return Array.isArray(raw) ? raw : null
}

export function validateGuestList(list) {
  const errors = []
  if (!Array.isArray(list)) return ["Guest list must be a JSON array of parties."]
  const seen = new Set()
  list.forEach((p, i) => {
    if (!p || typeof p !== "object") return errors.push(`Entry ${i}: not an object.`)
    if (!p.party || typeof p.party !== "string") errors.push(`Entry ${i}: missing "party" id.`)
    if (seen.has(p.party)) errors.push(`Entry ${i}: duplicate party id "${p.party}".`)
    seen.add(p.party)
    if (!Array.isArray(p.members) || p.members.length === 0)
      errors.push(`Entry ${i} (${p.party}): "members" must be a non-empty array of names.`)
    else if (p.members.some((m) => typeof m !== "string" || !m.trim()))
      errors.push(`Entry ${i} (${p.party}): every member must be a non-empty string.`)
    if (p.plusOnes != null && (!Number.isInteger(p.plusOnes) || p.plusOnes < 0 || p.plusOnes > 4))
      errors.push(`Entry ${i} (${p.party}): "plusOnes" must be an integer 0–4.`)
  })
  return errors
}

export function findPartyByName(list, name) {
  const needle = normalizeName(name)
  if (!needle) return null
  for (const p of list) {
    for (const member of p.members) {
      if (normalizeName(member) === needle) return p
    }
  }
  return null
}

// ── Submission validation ─────────────────────────────────────────────────────
const MAX = { meal: 60, name: 80, allergies: 1000, song: 200 }

export function validateSubmission(body, party) {
  const errors = []
  const clean = {}

  const responses = Array.isArray(body?.responses) ? body.responses : []
  if (responses.length !== party.members.length)
    errors.push("Please respond for every guest on the invitation.")

  clean.responses = party.members.map((memberName, idx) => {
    const r = responses[idx] || {}
    const attending = r.attending === true
    let meal = null
    if (attending) {
      meal = String(r.meal || "")
        .slice(0, MAX.meal)
        .trim()
      if (!meal) errors.push(`Please choose a meal for ${memberName}.`)
    }
    return { name: memberName, attending, meal }
  })

  const allowedPlusOnes = Number.isInteger(party.plusOnes) ? party.plusOnes : 0
  clean.plusOne = null
  if (body?.plusOne?.bringing === true) {
    if (allowedPlusOnes < 1) {
      errors.push("This invitation does not include an additional guest.")
    } else {
      const gname = String(body.plusOne.name || "")
        .slice(0, MAX.name)
        .trim()
      const gmeal = String(body.plusOne.meal || "")
        .slice(0, MAX.meal)
        .trim()
      if (!gname) errors.push("Please tell us your guest's name.")
      if (!gmeal) errors.push("Please choose a meal for your guest.")
      clean.plusOne = { bringing: true, name: gname, meal: gmeal }
    }
  }

  // If nobody on the invitation is attending, a plus-one alone makes no sense.
  const anyAttending = clean.responses.some((r) => r.attending)
  if (!anyAttending && clean.plusOne) {
    errors.push("A guest can only join if someone on the invitation is attending.")
  }

  clean.allergies = String(body?.allergies || "")
    .slice(0, MAX.allergies)
    .trim()
  clean.song = String(body?.song || "")
    .slice(0, MAX.song)
    .trim()

  return { errors, clean }
}

// ── Admin auth ────────────────────────────────────────────────────────────────
export function checkAdminToken(req) {
  const configured = process.env.RSVP_ADMIN_TOKEN
  if (!configured) return { ok: false, reason: "RSVP_ADMIN_TOKEN env var is not set on Netlify." }
  const header = req.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null
  const supplied = bearer || new URL(req.url).searchParams.get("token")
  if (!supplied || supplied !== configured)
    return { ok: false, reason: "Invalid or missing token." }
  return { ok: true }
}

// ── Response helpers ──────────────────────────────────────────────────────────
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

export function csvEscape(v) {
  const s = String(v ?? "")
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
