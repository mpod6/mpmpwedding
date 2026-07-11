// Local smoke test for the RSVP Netlify Functions (run: node test-rsvp.mjs)
// Uses the __RSVP_TEST_STORE__ hook so no Netlify runtime is needed.

const mem = new Map()
globalThis.__RSVP_TEST_STORE__ = {
  async get(key, _opts) { return mem.has(key) ? JSON.parse(JSON.stringify(mem.get(key))) : null },
  async setJSON(key, val) { mem.set(key, JSON.parse(JSON.stringify(val))) },
  async delete(key) { mem.delete(key) },
}

const lookup = (await import("./netlify/functions/rsvp-lookup.mjs")).default
const submit = (await import("./netlify/functions/rsvp-submit.mjs")).default
const admin = (await import("./netlify/functions/rsvp-admin.mjs")).default

let passed = 0, failed = 0
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log("  ✓", name) }
  else { failed++; console.log("  ✗", name, extra) }
}
const post = (url, body, headers = {}) =>
  new Request("https://x.test" + url, { method: "POST", body: JSON.stringify(body), headers })
const req = (method, url, body, token) =>
  new Request("https://x.test" + url + (token ? `?token=${token}` : ""), {
    method, body: body ? JSON.stringify(body) : undefined,
  })

const GUESTS = [
  { party: "smith", members: ["Jane Smith", "John Smith"], plusOnes: 0 },
  { party: "garcia", members: ["Sofía García"], plusOnes: 1 },
  { party: "lee", members: ["Amy Lee"] }, // plusOnes omitted → 0
]

console.log("— admin: guest list upload —")
process.env.RSVP_ADMIN_TOKEN = "secret123"
let r = await admin(req("PUT", "/api/rsvp-admin/guestlist", GUESTS, "wrong"), { params: { action: "guestlist" } })
check("rejects bad token", r.status === 401)
r = await admin(req("PUT", "/api/rsvp-admin/guestlist", [{ members: [] }], "secret123"), { params: { action: "guestlist" } })
check("rejects invalid guest list", r.status === 400)
r = await admin(req("PUT", "/api/rsvp-admin/guestlist", GUESTS, "secret123"), { params: { action: "guestlist" } })
let out = await r.json()
check("accepts valid guest list", r.status === 200 && out.parties === 3 && out.namedGuests === 4 && out.openPlusOnes === 1, JSON.stringify(out))

console.log("— lookup —")
r = await lookup(post("/api/rsvp-lookup", { name: "  jane   SMITH " }))
out = await r.json()
check("finds by messy-cased name", r.status === 200 && out.party === "smith" && out.members.length === 2)
check("no existing response yet", out.existing === null)
r = await lookup(post("/api/rsvp-lookup", { name: "Sofia Garcia" })) // no accents typed
out = await r.json()
check("accent-insensitive match", r.status === 200 && out.party === "garcia" && out.plusOnes === 1)
r = await lookup(post("/api/rsvp-lookup", { name: "Nobody Here" }))
check("unknown name → 404", r.status === 404)
r = await lookup(post("/api/rsvp-lookup", { name: "Jane Smith", website: "spam" }))
check("honeypot rejected", r.status === 400)

console.log("— submit —")
r = await submit(post("/api/rsvp-submit", {
  party: "smith",
  responses: [{ attending: true, meal: "Pan-Seared Salmon" }, { attending: false }],
  plusOne: null, allergies: "tree nuts", song: "September — EWF",
}))
out = await r.json()
check("valid submit accepted", r.status === 200 && out.ok === true && out.updated === false, JSON.stringify(out))
r = await submit(post("/api/rsvp-submit", {
  party: "smith",
  responses: [{ attending: true }, { attending: false }],
}))
check("attending without meal → 400", r.status === 400)
r = await submit(post("/api/rsvp-submit", {
  party: "smith",
  responses: [{ attending: true, meal: "Vegetarian" }, { attending: true, meal: "Vegetarian" }],
  plusOne: { bringing: true, name: "Extra Person", meal: "Vegetarian" },
}))
check("plus-one on 0-allowance invitation → 400", r.status === 400)
r = await submit(post("/api/rsvp-submit", {
  party: "garcia",
  responses: [{ attending: false }],
  plusOne: { bringing: true, name: "Guest Name", meal: "Vegetarian" },
}))
check("plus-one while declining → 400", r.status === 400)
r = await submit(post("/api/rsvp-submit", {
  party: "garcia",
  responses: [{ attending: true, meal: "Herb-Roasted Chicken" }],
  plusOne: { bringing: true, name: "Dana Rivera", meal: "Pan-Seared Salmon" },
  allergies: "", song: "Dancing Queen — ABBA",
}))
check("valid plus-one submit accepted", r.status === 200)
r = await submit(post("/api/rsvp-submit", {
  party: "smith",
  responses: [{ attending: true, meal: "Vegetarian" }, { attending: true, meal: "Vegetarian" }],
  allergies: "tree nuts", song: "September — EWF",
}))
out = await r.json()
check("resubmit marks updated", r.status === 200 && out.updated === true)
r = await lookup(post("/api/rsvp-lookup", { name: "John Smith" }))
out = await r.json()
check("lookup prefills existing", out.existing && out.existing.responses[1].attending === true)

console.log("— admin: export & status —")
r = await admin(req("GET", "/api/rsvp-admin/export", null, "secret123"), { params: { action: "export" } })
const csv = await r.text()
check("CSV has header + rows", r.status === 200 && csv.startsWith("party,guest") && csv.includes("Dana Rivera") && csv.includes("Amy Lee"))
check("CSV marks plus-one", csv.split("\r\n").some((l) => l.includes("Dana Rivera") && l.includes("yes")))
r = await admin(req("GET", "/api/rsvp-admin/status", null, "secret123"), { params: { action: "status" } })
out = await r.json()
check("status counts correct",
  out.parties.total === 3 && out.parties.responded === 2 && out.parties.awaiting === 1 &&
  out.headcount.attending === 4 && out.headcount.plusOnesBrought === 1,
  JSON.stringify(out))

console.log("— admin: delete response —")
r = await admin(req("DELETE", "/api/rsvp-admin/response/garcia", null, "secret123"), { params: { action: "response", id: "garcia" } })
check("delete works", r.status === 200)
r = await lookup(post("/api/rsvp-lookup", { name: "Sofía García" }))
out = await r.json()
check("deleted response gone", out.existing === null)

console.log("— closed gate (env backstop) —")
process.env.RSVP_OPEN = "false"
r = await lookup(post("/api/rsvp-lookup", { name: "Jane Smith" }))
check("lookup blocked when closed", r.status === 403)
r = await submit(post("/api/rsvp-submit", { party: "smith", responses: [] }))
check("submit blocked when closed", r.status === 403)
delete process.env.RSVP_OPEN

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
