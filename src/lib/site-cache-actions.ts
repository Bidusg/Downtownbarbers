import { updateTag } from "next/cache";
import { SITE_TAG } from "@/lib/site-cache";

/** Kalles fra admin-handlinger som endrer nettsidens oppsett. */
export function refreshSiteConfig() {
  try {
    updateTag(SITE_TAG);
  } catch {
    /* utenfor server action – revalidate-tiden tar det */
  }
}
