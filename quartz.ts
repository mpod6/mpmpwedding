import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import * as ExternalPlugin from "./.quartz/plugins"

// Define your exact desired order by slug (filename without .md)
const pageOrder = [
  "index",
  "our-story",
  "schedule",
  "travel",
  "lodging",
  "rsvp",
  "registry",
  "dress-code",
  "things-to-do"
]

ExternalPlugin.Explorer({
  sortFn: (a, b) => {
    const aSlug = a.data?.slug ?? a.displayName
    const bSlug = b.data?.slug ?? b.displayName
    const aIndex = pageOrder.indexOf(aSlug)
    const bIndex = pageOrder.indexOf(bSlug)
    // known pages sort by the order array; unknown pages fall to the end
    if (aIndex === -1 && bIndex === -1) return a.displayName.localeCompare(b.displayName)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  },
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()