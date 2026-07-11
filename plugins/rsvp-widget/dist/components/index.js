import { jsx, jsxs } from "preact/jsx-runtime"

// ─────────────────────────────────────────────────────────────────────────────
// RSVP widget. Renders ONLY on the /rsvp page.
//
// Options (set in quartz.config.yaml under this plugin's `options:`):
//   rsvpOpen: false → shows the "RSVPs will open at a later date" notice
//   rsvpOpen: true  → shows the interactive form
//   meals: [ ... ]  → the meal choices offered in the form
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  rsvpOpen: false,
  meals: ["Herb-Roasted Chicken", "Pan-Seared Salmon", "Vegetarian"],
}

const RsvpWidgetConstructor = (userOpts) => {
  const opts = { ...DEFAULTS, ...(userOpts || {}) }

  const RsvpWidget = ({ fileData, displayClass }) => {
    if (String(fileData?.slug || "") !== "rsvp") return null

    // ── Closed gate ──────────────────────────────────────────────────────────
    if (!opts.rsvpOpen) {
      return jsxs("div", {
        class: ["rsvp-widget rsvp-closed", displayClass].filter(Boolean).join(" "),
        children: [
          jsx("p", { class: "rsvp-closed-title", children: "RSVPs will open at a later date" }),
          jsx("p", {
            class: "rsvp-closed-sub",
            children:
              "Keep an eye on your mailbox — once invitations arrive, you'll be able to respond right here.",
          }),
        ],
      })
    }

    // ── Open: server-rendered skeleton; the script below brings it to life ───
    const mealsJson = JSON.stringify(opts.meals)
    return jsxs("div", {
      class: ["rsvp-widget", displayClass].filter(Boolean).join(" "),
      id: "rsvp-app",
      "data-meals": mealsJson,
      children: [
        // Step 1: lookup
        jsxs("section", {
          class: "rsvp-step",
          id: "rsvp-lookup",
          children: [
            jsx("h2", { class: "rsvp-heading", children: "Find your invitation" }),
            jsx("p", {
              class: "rsvp-hint",
              children: "Enter your name as it appears on your invitation envelope.",
            }),
            jsxs("form", {
              id: "rsvp-lookup-form",
              autocomplete: "off",
              children: [
                jsx("input", {
                  type: "text",
                  id: "rsvp-name",
                  name: "name",
                  placeholder: "First and last name",
                  "aria-label": "Your name",
                  maxlength: "120",
                  required: true,
                }),
                // honeypot — hidden from humans
                jsx("input", {
                  type: "text",
                  name: "website",
                  id: "rsvp-website",
                  tabindex: "-1",
                  autocomplete: "off",
                  "aria-hidden": "true",
                }),
                jsx("button", { type: "submit", class: "rsvp-button", children: "Find Me" }),
              ],
            }),
            jsx("p", { class: "rsvp-message", id: "rsvp-lookup-message", role: "status" }),
          ],
        }),
        // Step 2: the party form (filled in by JS after a successful lookup)
        jsx("section", { class: "rsvp-step", id: "rsvp-form-slot", hidden: true }),
        // Step 3: confirmation
        jsxs("section", {
          class: "rsvp-step rsvp-confirm",
          id: "rsvp-confirm",
          hidden: true,
          children: [
            jsx("p", { class: "rsvp-confirm-title", children: "Thank you!" }),
            jsx("p", {
              id: "rsvp-confirm-text",
              children: "Your response has been recorded. You can return here any time to update it.",
            }),
          ],
        }),
      ],
    })
  }

  RsvpWidget.css = WIDGET_CSS
  RsvpWidget.afterDOMLoaded = WIDGET_SCRIPT
  return RsvpWidget
}

// ═════════════════════════════════════════════════════════════════════════════
// Client script — runs on initial load and on every SPA navigation ("nav").
// ═════════════════════════════════════════════════════════════════════════════
const WIDGET_SCRIPT = `
function rsvpInit() {
  const app = document.getElementById("rsvp-app")
  if (!app || app.dataset.wired === "1") return
  app.dataset.wired = "1"

  const MEALS = JSON.parse(app.dataset.meals || "[]")
  const lookupForm = document.getElementById("rsvp-lookup-form")
  const lookupMsg = document.getElementById("rsvp-lookup-message")
  const lookupSection = document.getElementById("rsvp-lookup")
  const slot = document.getElementById("rsvp-form-slot")
  const confirm = document.getElementById("rsvp-confirm")
  const confirmText = document.getElementById("rsvp-confirm-text")

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

  function mealSelect(id, selected) {
    const options = MEALS.map((m) =>
      '<option value="' + esc(m) + '"' + (m === selected ? " selected" : "") + ">" + esc(m) + "</option>"
    ).join("")
    return '<select id="' + id + '" class="rsvp-meal"><option value="">Choose a meal…</option>' + options + "</select>"
  }

  function renderParty(data) {
    const ex = data.existing
    let html = '<h2 class="rsvp-heading">We found you!</h2>'
    if (ex) {
      html += '<p class="rsvp-hint rsvp-existing">You responded on ' + esc(new Date(ex.submittedAt).toLocaleDateString()) + " — feel free to update below.</p>"
    }
    html += '<form id="rsvp-party-form">'

    data.members.forEach((name, i) => {
      const prev = ex && ex.responses && ex.responses[i]
      const attending = prev ? prev.attending : null
      html +=
        '<fieldset class="rsvp-guest" data-index="' + i + '">' +
        "<legend>" + esc(name) + "</legend>" +
        '<div class="rsvp-radios">' +
        '<label><input type="radio" name="attend-' + i + '" value="yes"' + (attending === true ? " checked" : "") + " required> Joyfully accepts</label>" +
        '<label><input type="radio" name="attend-' + i + '" value="no"' + (attending === false ? " checked" : "") + "> Regretfully declines</label>" +
        "</div>" +
        '<div class="rsvp-meal-wrap" data-meal-for="' + i + '"' + (attending === true ? "" : " hidden") + ">" +
        mealSelect("meal-" + i, prev && prev.meal) +
        "</div>" +
        "</fieldset>"
    })

    if (data.plusOnes > 0) {
      const pex = ex && ex.plusOne
      html +=
        '<fieldset class="rsvp-guest rsvp-plusone">' +
        "<legend>Your guest</legend>" +
        '<label class="rsvp-check"><input type="checkbox" id="plusone-bringing"' + (pex && pex.bringing ? " checked" : "") + "> I will be bringing a guest</label>" +
        '<div id="plusone-fields"' + (pex && pex.bringing ? "" : " hidden") + ">" +
        '<input type="text" id="plusone-name" placeholder="Guest\\'s full name" maxlength="80" value="' + esc((pex && pex.name) || "") + '">' +
        '<div class="rsvp-meal-wrap">' + mealSelect("plusone-meal", pex && pex.meal) + "</div>" +
        "</div>" +
        "</fieldset>"
    }

    html +=
      '<fieldset class="rsvp-guest">' +
      "<legend>A few more things</legend>" +
      '<label class="rsvp-label" for="rsvp-allergies">Any food allergies we should know about?</label>' +
      '<textarea id="rsvp-allergies" maxlength="1000" rows="2" placeholder="e.g. shellfish, tree nuts…">' + esc((ex && ex.allergies) || "") + "</textarea>" +
      '<label class="rsvp-label" for="rsvp-song">What song would get you on the dance floor?</label>' +
      '<input type="text" id="rsvp-song" maxlength="200" placeholder="Song title — artist" value="' + esc((ex && ex.song) || "") + '">' +
      "</fieldset>" +
      '<button type="submit" class="rsvp-button rsvp-submit">' + (ex ? "Update RSVP" : "Send RSVP") + "</button>" +
      '<p class="rsvp-message" id="rsvp-submit-message" role="status"></p>' +
      "</form>"

    slot.innerHTML = html
    slot.hidden = false
    lookupSection.hidden = true

    // show/hide meal select with attendance
    slot.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const i = radio.name.split("-")[1]
        const wrap = slot.querySelector('[data-meal-for="' + i + '"]')
        if (wrap) wrap.hidden = radio.value !== "yes" || !radio.checked
        if (radio.value === "no" && radio.checked && wrap) wrap.hidden = true
      })
    })
    const bringing = document.getElementById("plusone-bringing")
    if (bringing) {
      bringing.addEventListener("change", () => {
        document.getElementById("plusone-fields").hidden = !bringing.checked
      })
    }

    document.getElementById("rsvp-party-form").addEventListener("submit", (e) => {
      e.preventDefault()
      submitParty(data)
    })
  }

  async function submitParty(data) {
    const msg = document.getElementById("rsvp-submit-message")
    msg.textContent = ""
    const responses = data.members.map((_, i) => {
      const yes = slot.querySelector('input[name="attend-' + i + '"][value="yes"]')
      const attending = yes && yes.checked
      const meal = document.getElementById("meal-" + i)
      return { attending: Boolean(attending), meal: attending && meal ? meal.value : null }
    })
    // client-side check: attending guests need a meal
    for (let i = 0; i < responses.length; i++) {
      const anyChecked = slot.querySelector('input[name="attend-' + i + '"]:checked')
      if (!anyChecked) { msg.textContent = "Please respond for " + data.members[i] + "."; return }
      if (responses[i].attending && !responses[i].meal) { msg.textContent = "Please choose a meal for " + data.members[i] + "."; return }
    }
    let plusOne = null
    const bringing = document.getElementById("plusone-bringing")
    if (bringing && bringing.checked) {
      plusOne = {
        bringing: true,
        name: document.getElementById("plusone-name").value,
        meal: document.getElementById("plusone-meal").value,
      }
      if (!plusOne.name.trim()) { msg.textContent = "Please tell us your guest's name."; return }
      if (!plusOne.meal) { msg.textContent = "Please choose a meal for your guest."; return }
    }

    const btn = slot.querySelector(".rsvp-submit")
    btn.disabled = true
    btn.textContent = "Sending…"
    try {
      const res = await fetch("/api/rsvp-submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party: data.party,
          responses,
          plusOne,
          allergies: document.getElementById("rsvp-allergies").value,
          song: document.getElementById("rsvp-song").value,
        }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || "Something went wrong.")
      slot.hidden = true
      confirm.hidden = false
      confirmText.textContent = out.updated
        ? "Your updated response has been recorded. You can return here any time to change it again."
        : "Your response has been recorded. You can return here any time to update it."
      confirm.scrollIntoView({ behavior: "smooth", block: "center" })
    } catch (err) {
      msg.textContent = err.message
      btn.disabled = false
      btn.textContent = "Send RSVP"
    }
  }

  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    lookupMsg.textContent = ""
    const name = document.getElementById("rsvp-name").value
    const website = document.getElementById("rsvp-website").value
    const btn = lookupForm.querySelector("button")
    btn.disabled = true
    btn.textContent = "Searching…"
    try {
      const res = await fetch("/api/rsvp-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, website }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || "Something went wrong.")
      renderParty(out)
    } catch (err) {
      lookupMsg.textContent = err.message
    } finally {
      btn.disabled = false
      btn.textContent = "Find Me"
    }
  })
}

rsvpInit()
document.addEventListener("nav", rsvpInit)
`

// ═════════════════════════════════════════════════════════════════════════════
// Styles — matches the Vinery theme via the palette variables.
// ═════════════════════════════════════════════════════════════════════════════
const WIDGET_CSS = `
.rsvp-widget {
  max-width: 34rem;
  margin: 1.5rem auto 3rem auto;
}
.rsvp-widget .rsvp-heading {
  text-align: center;
  font-family: var(--headerFont);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 1.1rem;
  color: var(--secondary);
  margin: 0 0 0.4rem 0;
}
.rsvp-widget .rsvp-hint {
  text-align: center;
  font-style: italic;
  color: var(--darkgray);
  margin: 0 0 1.2rem 0;
}
.rsvp-widget .rsvp-existing {
  color: var(--secondary);
}
#rsvp-lookup-form {
  display: flex;
  gap: 0.6rem;
  justify-content: center;
  flex-wrap: wrap;
}
#rsvp-website {
  position: absolute !important;
  left: -9999px !important;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.rsvp-widget input[type="text"],
.rsvp-widget textarea,
.rsvp-widget select {
  font-family: var(--bodyFont);
  font-size: 1.02rem;
  color: var(--dark);
  background: #fff;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
  box-sizing: border-box;
}
#rsvp-name { flex: 1 1 240px; }
.rsvp-widget input[type="text"]:focus,
.rsvp-widget textarea:focus,
.rsvp-widget select:focus {
  outline: none;
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px var(--highlight);
}
.rsvp-button {
  font-family: var(--headerFont);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--light);
  background: var(--secondary);
  border: none;
  border-radius: 2rem;
  padding: 0.72rem 1.8rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.rsvp-button:hover { background: var(--tertiary); }
.rsvp-button:disabled { opacity: 0.6; cursor: wait; }
.rsvp-submit {
  display: block;
  margin: 1.6rem auto 0 auto;
  padding: 0.85rem 2.6rem;
}
.rsvp-message {
  text-align: center;
  color: #9a5b3c;
  font-style: italic;
  min-height: 1.4em;
  margin-top: 0.8rem;
}
.rsvp-guest {
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  padding: 1rem 1.2rem 1.2rem 1.2rem;
  margin: 1.2rem 0;
  background: color-mix(in srgb, var(--light) 60%, #ffffff);
}
.rsvp-guest legend {
  font-family: var(--headerFont);
  font-style: italic;
  font-size: 1.25rem;
  color: var(--dark);
  padding: 0 0.5rem;
}
.rsvp-radios {
  display: flex;
  gap: 1.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.7rem;
}
.rsvp-radios label,
.rsvp-check {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
  color: var(--darkgray);
}
.rsvp-widget input[type="radio"],
.rsvp-widget input[type="checkbox"] {
  accent-color: var(--secondary);
  width: 1.05rem;
  height: 1.05rem;
}
.rsvp-meal-wrap { margin-top: 0.4rem; }
.rsvp-meal { width: 100%; max-width: 20rem; }
#plusone-fields { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 0.8rem; }
#plusone-name { max-width: 20rem; }
.rsvp-label {
  display: block;
  font-family: var(--headerFont);
  font-size: 0.98rem;
  color: var(--dark);
  margin: 0.9rem 0 0.35rem 0;
}
.rsvp-widget textarea, #rsvp-song { width: 100%; }
.rsvp-confirm { text-align: center; padding: 2rem 0; }
.rsvp-confirm-title {
  font-family: var(--headerFont);
  font-style: italic;
  font-size: 2rem;
  color: var(--dark);
  margin-bottom: 0.4rem;
}
.rsvp-closed {
  text-align: center;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--highlight);
  padding: 2.2rem 1.6rem;
}
.rsvp-closed-title {
  font-family: var(--headerFont);
  font-style: italic;
  font-size: 1.6rem;
  color: var(--dark);
  margin: 0 0 0.5rem 0;
}
.rsvp-closed-sub {
  color: var(--darkgray);
  font-style: italic;
  margin: 0;
}
@media all and (max-width: 800px) {
  .rsvp-radios { gap: 0.8rem; flex-direction: column; }
}
`

export { RsvpWidgetConstructor as RsvpWidget }
export default RsvpWidgetConstructor
