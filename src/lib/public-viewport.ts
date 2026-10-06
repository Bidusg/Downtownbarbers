import type { Viewport } from "next";

/**
 * Viewport for kundesidene (de som bruker site-Header).
 * cover: siden tegnes helt opp under statuslinja på iPhone, og headeren har
 * padding-top = safe-area – så headerens frostede glass dekker statuslinja
 * og innhold aldri scroller synlig forbi over navbaren.
 */
export const PUBLIC_VIEWPORT: Viewport = {
  themeColor: "#F8F5EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
