import { jsx, jsxs } from "preact/jsx-runtime"

// Relative path back to site root from the current slug, so links work
// from nested pages (e.g. /tags/...) as well as root-level pages.
function pathToRoot(slug) {
  let rootPath = String(slug || "")
    .split("/")
    .filter((x) => x !== "")
    .slice(0, -1)
    .map(() => "..")
    .join("/")
  if (rootPath.length === 0) rootPath = "."
  return rootPath
}

const LINKS = [
  { text: "Our Story", slug: "ourstory" },
  { text: "Schedule", slug: "schedule" },
  { text: "Travel", slug: "travel" },
  { text: "Stay", slug: "lodging" },
  { text: "Things to Do", slug: "thingstodo" },
  { text: "Dress Code", slug: "dresscode" },
  { text: "Registry", slug: "registry" },
  { text: "RSVP", slug: "rsvp", cta: true },
]

const WeddingNav = ({ fileData, displayClass }) => {
  const base = pathToRoot(fileData?.slug)
  const current = String(fileData?.slug || "")
  return jsxs("header", {
    class: ["wedding-masthead", displayClass].filter(Boolean).join(" "),
    children: [
      jsxs("a", {
        class: "masthead-wordmark",
        href: base,
        "aria-label": "Home",
        children: [
          jsx("span", { class: "wordmark-names", children: "Marisa & Max" }),
          jsx("span", { class: "wordmark-date", children: "August 28, 2027 · Stony Brook, NY" }),
        ],
      }),
      jsx("nav", {
        class: "masthead-nav",
        "aria-label": "Site",
        children: jsx("ul", {
          children: LINKS.map((l) =>
            jsx("li", {
              children: jsx("a", {
                href: `${base}/${l.slug}`,
                class: [l.cta ? "nav-cta" : "", current === l.slug ? "active" : ""]
                  .filter(Boolean)
                  .join(" "),
                children: l.text,
              }),
            }),
          ),
        }),
      }),
    ],
  })
}

WeddingNav.css = `
.wedding-masthead {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  padding: 2.4rem 0 1.4rem 0;
  margin-bottom: 1.2rem;
  border-bottom: 1px solid var(--lightgray);
}
.wedding-masthead .masthead-wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  text-decoration: none;
  background-image: none;
}
.wedding-masthead .wordmark-names {
  font-family: var(--headerFont);
  font-style: italic;
  font-weight: 500;
  font-size: 2rem;
  line-height: 1;
  color: var(--dark);
  letter-spacing: 0.02em;
}
.wedding-masthead .wordmark-date {
  font-family: var(--headerFont);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: var(--gray);
}
.wedding-masthead .masthead-nav ul {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 1.5rem;
  margin: 0;
  padding: 0;
}
.wedding-masthead .masthead-nav li {
  margin: 0;
}
.wedding-masthead .masthead-nav a {
  font-family: var(--headerFont);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--darkgray);
  text-decoration: none;
  background-image: none;
  padding: 0.3rem 0.1rem;
  border-bottom: 1px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.wedding-masthead .masthead-nav a:hover {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}
.wedding-masthead .masthead-nav a.active {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}
.wedding-masthead .masthead-nav a.nav-cta {
  color: var(--light);
  background-color: var(--secondary);
  padding: 0.42rem 1.1rem;
  border-radius: 2rem;
  border-bottom: none;
}
.wedding-masthead .masthead-nav a.nav-cta:hover {
  background-color: var(--tertiary);
  color: var(--light);
}
@media all and (max-width: 800px) {
  .wedding-masthead {
    padding-top: 1.6rem;
  }
  .wedding-masthead .wordmark-names {
    font-size: 1.6rem;
  }
  .wedding-masthead .masthead-nav ul {
    gap: 0.35rem 1.05rem;
  }
  .wedding-masthead .masthead-nav a {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
  }
}
`

// Quartz expects a component *constructor*: a function that, given options,
// returns the component. Export under the manifest key "WeddingNav".
const WeddingNavConstructor = () => WeddingNav
export { WeddingNavConstructor as WeddingNav }
export default WeddingNavConstructor
