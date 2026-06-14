// #116 v2 — merge run-1 + run-2 fleet output into findings-v2.json.
// Inputs: fresh-findings.json (8 finders), verdicts.json (41), explorations-summary.json,
//         ../findings.json (v1). Cluster map authored by the lead session.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url).pathname;
const fresh = JSON.parse(readFileSync(dir + 'fresh-findings.json', 'utf8')).fresh;
const verdicts = JSON.parse(readFileSync(dir + 'verdicts.json', 'utf8'));
const v1 = JSON.parse(readFileSync(dir + '../findings.json', 'utf8')).findings;

const all = fresh.flatMap((f) => f.findings.map((x) => ({ ...x, witness: `${f.slice}/${f.lens}` })));
const byPrefix = (p) => all.filter((x) => x.title.startsWith(p));
const vByPrefix = (p) => verdicts.find((v) => v.id.startsWith(p) || p.startsWith(v.id));

// ---- cluster map: prefix(es) → one merged WP-B finding (or a v1 relation) ----
// rel: 'new' | 'extends:WP-A-0xx' | 'confirms:WP-A-0xx' (confirms ⇒ not a new card, witness credit only)
const CLUSTERS = [
  { id: 'WP-B-001', rel: 'extends:WP-A-009', titles: ['Suggestion flow is fire-and-forget', 'Traveler suggestion enters a void'], note: 'Replaces refuted WP-A-008. Verified severity carried by the WP-A-009 amendment (→P1): silent overview redirect with no toast; traveler-scoped suggestions list API shipped-but-unreachable (M3); no approve/reject notification type; created_by attribution lands on the reviewer, not the author.' },
  { id: 'WP-B-002', rel: 'new', titles: ['Phase-less unplanned items land in an invisible black hole', 'Phase-less items violate the documented invariant'], vkey: 'Phase-less unplanned items' },
  { id: 'WP-B-003', rel: 'new', titles: ['Edit & Approve silently discards'], vkey: 'Edit & Approve silently discards' },
  { id: 'WP-B-004', rel: 'new', titles: ['Idea capture is buried two levels deep', 'Phase parking-lot capture closes after every idea'], note: 'Unverified (2 finders, planning slice). Relates charter scenarios 2 + 11.' },
  { id: 'WP-B-005', rel: 'new', titles: ['Viewer role gets full write UI'], vkey: 'Viewer role gets full write UI' },
  { id: 'WP-B-006', rel: 'new', titles: ['Suggestion review gate covers only item creation'], vkey: 'Suggestion review gate covers only item creation' },
  { id: 'WP-B-007', rel: 'new', titles: ['moveItem action desyncs status from day'], vkey: 'moveItem action desyncs' },
  { id: 'WP-B-008', rel: 'new', titles: ['Trip-Mode quick-add ejects to Planning on save', 'Trip Mode quick-add exits into Planning surfaces', 'Trip-Mode quick-add ends by dumping the user into the Planning day view'], vkey: 'Trip-Mode quick-add ejects to Planning on save' },
  { id: 'WP-B-009', rel: 'new', titles: ["AddSheet 'Add expense' hands off to a param", "AddSheet 'Add expense' passes ?action=add", "AddSheet's 'Add expense' deep link"], vkey: "AddSheet 'Add expense' hands off to a param" },
  { id: 'WP-B-010', rel: 'extends:WP-A-004', titles: ['Offline surface is document-bytes-only', 'Offline mid-trip is a dead end'], vkey: 'Offline surface is document-bytes-only' },
  { id: 'WP-B-011', rel: 'new', titles: ['Opening an active trip lands on the planning overview', 'Mode chrome is in-memory + date-derived'], note: 'Unverified (2 finders). The mode chimera: chrome is derived in memory, never from the route.' },
  { id: 'WP-B-012', rel: 'extends:WP-A-003', titles: ['Every visible back affordance in Trip Mode', 'Every back chevron reachable in Trip Mode'], note: 'Unverified (2 finders) but consistent with the verified WP-A-003 amendment: back-chevron policy, not a one-file bug.' },
  { id: 'WP-B-013', rel: 'new', titles: ['Done-counters everywhere in Trip Mode', "Trip Mode renders 'done' counters"], note: 'Unverified (2 finders).' },
  { id: 'WP-B-014', rel: 'new', titles: ['Trip Mode activation ignores trip timezone', 'isTripActive uses UTC'], vkey: 'isTripActive uses UTC' },
  { id: 'WP-B-015', rel: 'new', titles: ['Clone is unusable', 'Clone silently drops every flight'], vkey: 'Clone is unusable' },
  { id: 'WP-B-016', rel: 'new', titles: ['Export→Import round-trip is broken', "Export 'JSON backup' omits", 'Export omits the money record'], vkey: 'Export→Import round-trip is broken' },
  { id: 'WP-B-017', rel: 'extends:WP-A-019', titles: ['Share-with-grandma dead-ends', 'Publishing has no share moment'], note: 'Verified via WP-A-019 (confirmed P2); adds the finishCloseout-mints-token-silently half.' },
  { id: 'WP-B-018', rel: 'new', titles: ['Archiving is an unguarded one-way door', 'Archived state is invisible and irreversible', 'Dead action: settings ?/archiveTrip'], vkey: 'Archiving is an unguarded one-way door' },
  { id: 'WP-B-019', rel: 'new', titles: ['Archive publish gate contradicts settings copy'], vkey: 'Archive publish gate contradicts settings copy' },
  { id: 'WP-B-020', rel: 'new', titles: ['Closeout never reviews parking-lot ideas'], vkey: 'Closeout never reviews parking-lot ideas' },
  { id: 'WP-B-021', rel: 'new', titles: ['Budget page never compares'], vkey: 'Budget page never compares' },
  { id: 'WP-B-022', rel: 'new', titles: ['No trip-wide way to find a specific item'], note: 'Unverified (1 finder). Relates scenario 1.' },
  { id: 'WP-B-023', rel: 'extends:WP-A-021', titles: ['Item detail back-link and delete redirect eject day-less'], note: 'Unverified (1 finder).' },
  { id: 'WP-B-028', rel: 'new', titles: ['Mode toggle does not exist between 900–1279px'], note: 'Verified by lead from v1 chrome reads: AppShell mobile pill wrapper is md-desktop:hidden (AppShell.svelte:75-80); SideRail pill block is hidden lg-desktop:flex (SideRail.svelte:67-79). In the md-desktop window no ModePill renders anywhere; active trips default mode=trip ⇒ locked in.' },
  { id: 'WP-B-029', rel: 'new', titles: ['Auth gate drops the destination', 'Deep links are destroyed at the login wall'], note: 'Unverified (2 finders, cross slice).' },
  { id: 'WP-B-030', rel: 'new', titles: ["'Skip for now' on /claim is one-way"], note: 'Unverified (1 finder).' },
  { id: 'WP-B-031', rel: 'new', titles: ["/login has no 'Resend code'"], note: 'Unverified (1 finder).' },
  // pure confirmations of v1 (witness credit, no new card)
  { id: null, rel: 'confirms:WP-A-006', titles: ["'Trip Mode' CTA on trip home is status-blind", "Overview 'Trip Mode' chip neither switches mode nor guards", "Pre-trip 'Trip Mode' button leads"] },
  { id: null, rel: 'confirms:WP-A-001', titles: ['Morning after end_date'] },
  { id: null, rel: 'confirms:WP-A-010', titles: ['Dead component: TripTabs.svelte'] },
  { id: null, rel: 'confirms:WP-A-020', titles: ['Public archive is a cul-de-sac'] },
  { id: null, rel: 'confirms:WP-A-002', titles: ['No +error.svelte anywhere'] },
  { id: null, rel: 'confirms:WP-A-011', titles: ['Profile (/account) is reachable only from the trips-list avatar', '/account is unreachable from inside a trip'] },
  { id: null, rel: 'confirms:WP-A-012', titles: ['Notification bell appears on 6 pages', 'Notification bell renders on only 6'] },
  { id: null, rel: 'confirms:WP-A-023', titles: ['Settings page renders the full owner UI', 'Trip Settings shows members the full owner console'] },
  { id: null, rel: 'confirms:WP-A-022', titles: ['View-transition route classifier is stale', "Chrome doesn't know where you are"] },
  { id: null, rel: 'confirms:WP-A-003', titles: ['Back-arrow targets contradict the tab IA'] }
];

const claimed = new Set();
const newFindings = [];
const confirmations = {}; // v1 id -> [witnesses]

for (const c of CLUSTERS) {
  const members = c.titles.flatMap((t) => byPrefix(t));
  members.forEach((m) => claimed.add(m.title));
  if (members.length === 0) { console.error(`EMPTY CLUSTER: ${c.id ?? c.rel} (${c.titles[0]})`); continue; }
  if (!c.id) {
    const vid = c.rel.split(':')[1];
    (confirmations[vid] ??= []).push(...members.map((m) => m.witness));
    continue;
  }
  const rep = members[0];
  const verdict = c.vkey ? vByPrefix(c.vkey) : null;
  newFindings.push({
    id: c.id,
    rel: c.rel,
    title: rep.title,
    phase: rep.phase, context: rep.context ?? '', axis: rep.axis,
    severity: verdict?.severity ?? rep.severity,
    finder_severity: rep.severity,
    witnesses: members.map((m) => m.witness),
    verified: verdict ? { verdict: verdict.verdict, summary: verdict.summary, evidence: verdict.evidence, amendment: verdict.amendment ?? '' } : null,
    note: c.note ?? '',
    where: rep.where, what: rep.what, why: rep.why, fix: rep.fix,
    disposition: ''
  });
}

const unclaimed = all.filter((x) => !claimed.has(x.title));
if (unclaimed.length) {
  console.error(`UNCLAIMED (${unclaimed.length}):`);
  unclaimed.forEach((u) => console.error(`  [${u.witness}] ${u.title.slice(0, 90)}`));
}

// v1 verdict join
const v1Verdicts = v1.map((f) => {
  const v = verdicts.find((x) => x.id === f.id);
  return {
    id: f.id, title: f.what.split('.')[0] + '.', old_severity: f.severity,
    verdict: v?.verdict ?? 'unverified', new_severity: v?.severity ?? f.severity,
    summary: v?.summary ?? '', amendment: v?.amendment ?? '', evidence: v?.evidence ?? '',
    independent_confirmations: confirmations[f.id] ?? [],
    charter_seeded: ['WP-A-001', 'WP-A-005', 'WP-A-014'].includes(f.id),
    disposition: f.disposition ?? ''
  };
});

// #116 fix (2026-06-13): preserve dispositions across regeneration. This script previously hardcoded
// disposition:'' on every new finding (see the push above) and overwrote findings-v2.json wholesale,
// silently wiping every WP-B disposition recorded during the Phase-3 walk. Re-merge the prior file's
// new_findings dispositions so re-running aggregate is non-destructive. (v1_verdicts dispositions are
// already preserved — they read from ../findings.json.)
try {
  const prior = JSON.parse(readFileSync(dir + 'findings-v2.json', 'utf8'));
  const priorDisp = Object.fromEntries(
    (prior.new_findings || []).filter((f) => f.disposition).map((f) => [f.id, f.disposition])
  );
  newFindings.forEach((f) => { if (priorDisp[f.id]) f.disposition = priorDisp[f.id]; });
} catch { /* first run: no prior findings-v2.json to preserve from */ }

const out = {
  _meta: {
    generated: 'from runs wf_c928fb55-5d2 (64 agents, partial — session limit) + wf_d479e7cb-aaf (13 agents, complete)',
    method: 'blind-then-merge re-discovery (8 finders) + adversarial verification (5 batched skeptics over 25 v1 findings + 15 fresh claims) + 6 design explorations. Charter binding.',
    note: 'WP-B-024..027 ids unassigned — those clusters resolved to confirmations of v1 findings instead.'
  },
  v1_verdicts: v1Verdicts,
  new_findings: newFindings,
  explorations: JSON.parse(readFileSync(dir + 'explorations-summary.json', 'utf8'))
};
writeFileSync(dir + 'findings-v2.json', JSON.stringify(out, null, 1));

const counts = { confirmed: 0, amended: 0, refuted: 0 };
v1Verdicts.forEach((v) => counts[v.verdict] !== undefined && counts[v.verdict]++);
console.log(`v1: ${counts.confirmed} confirmed / ${counts.amended} amended / ${counts.refuted} refuted`);
console.log(`new findings: ${newFindings.length} (${newFindings.filter((f) => f.verified).length} fleet-verified)`);
console.log(`P1 new: ${newFindings.filter((f) => f.severity === 'P1').map((f) => f.id).join(', ')}`);
