// #446 — state the Now page shares with the desktop context rail (which lives outside
// the page, in AppShell). Only the Door-2 "just skipped" flag: it flips the rail's
// ideas heading to "Replace it". Reset by the page when it unmounts.
export const nowRail = $state({ skipped: false });
