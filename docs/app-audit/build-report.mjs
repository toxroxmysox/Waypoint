// #116 audit — generate index.html FROM the persisted state files (charter rule §8).
// Usage: node docs/app-audit/build-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url).pathname;
const findings = JSON.parse(readFileSync(dir + 'findings.json', 'utf8')).findings;
const taskpaths = JSON.parse(readFileSync(dir + 'taskpaths.json', 'utf8'));

const sevCount = (s) => findings.filter((f) => f.severity === s).length;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- Mermaid diagrams (hand-curated from edges.json for legibility) ----
const DIAGRAMS = {
  app: {
    title: 'App shell — entry points & trip split',
    def: `flowchart LR
  classDef pub fill:#ddebdd,stroke:#4a7c59,color:#1f2d23
  classDef warn fill:#f6d9cf,stroke:#b4552d,color:#5a2a14
  classDef mode fill:#fdf6ec,stroke:#b08d3e,color:#4a3a14
  login["/login (OTP)"]:::pub --> claim["/claim<br/>placeholder claim"] --> trips["/trips<br/>dashboard"]
  invite["/invite/[code]<br/>email-bound"]:::pub --> tripHome
  join["/join/[token]<br/>shared link"]:::pub --> tripHome
  archive["/archive/[token]<br/>public, read-only"]:::pub
  trips --> account["/account<br/>(only door: trips-list avatar) ⚠"]:::warn
  trips --> new["/trips/new"] --> tripHome["trip home<br/>/trips/[slug]"]
  trips --> import["/trips/import"] --> tripHome
  tripHome <-->|"mode pill (active only)"| tripmode("TRIP MODE<br/>Now / Today / Add / Docs"):::mode
  tripHome --- planning("PLANNING<br/>Itinerary / Money / Members / Docs / More"):::mode
  err["404 / errors → unstyled dead end ⚠"]:::warn`
  },
  planning: {
    title: 'Planning mode — 5-tab nav + sub-tabs',
    def: `flowchart LR
  classDef tab fill:#e7efe7,stroke:#4a7c59,color:#1f2d23
  classDef warn fill:#f6d9cf,stroke:#b4552d,color:#5a2a14
  subgraph bottomnav ["bottom nav (every planning page)"]
    IT["Itinerary"]:::tab
    MO["Money"]:::tab
    ME["Members"]:::tab
    DO["Docs"]:::tab
    MR["More"]:::tab
  end
  IT --> ov["Overview /trips/[slug]"] & ph["/phases"] & li["/lists"] & go["/goals"]
  ov --> day["/days/[dayId]<br/>timeline + parking divider"] --> itemNew["/items/new"] & item["/items/[id]"]
  ph --> phd["/phases/[phaseId]<br/>parking reorder"] --> day
  ph -->|"unrated card"| swipe["/swipe/[phaseId]<br/>IMMERSIVE deck"]
  go --> cap["/goals/capture<br/>IMMERSIVE wizard"] & goal["/goals/[goalId]"]
  li --> booking["/lists/booking<br/>smart list"] & list["/lists/[listId]"]
  MO --> exp["/expenses"] & bud["/budget"]
  ME --> members["/members<br/>invite + join links"]
  DO --> docs["/documents<br/>back → /trips ⚠"]:::warn
  MR --> more["/more"] --> inbox["/inbox (owner)<br/>traveler submit → 403 ⚠"]:::warn & close["/closeout"] & set["/settings"] & clone["/clone"] & exportE["GET /export"]
  item --> edit["/items/[id]/edit"] & goal
  itemNew -.->|"traveler, auto-approve off"| inbox`
  },
  trip: {
    title: 'Trip mode — 4-tab nav (active trips)',
    def: `flowchart LR
  classDef tab fill:#f6e3d9,stroke:#b4552d,color:#5a2a14
  classDef warn fill:#f6d9cf,stroke:#b4552d,color:#5a2a14
  classDef miss fill:#fff,stroke:#b4552d,stroke-dasharray:5 4,color:#b4552d
  subgraph nav ["clay bottom nav"]
    NO["Now"]:::tab
    TO["Today"]:::tab
    AD["Add ⊕"]:::tab
    DC["Docs"]:::tab
  end
  NO --> focus["Focus: ongoing / free time /<br/>wrapped / nothing planned"] --> item["/items/[id]"]
  TO --> tl["today timeline + tomorrow preview<br/>+ checklists"] --> item
  TO --> up["/today/upcoming<br/>Next 3 Days"]
  AD --> as["AddSheet"] --> qa["items/new?day=today ✓"] & ae["expenses?action=add ✓"] & ad2["documents?action=add ✓"]
  DC --> docs["/documents (precached ✓)<br/>back → /trips ⚠"]:::warn
  focus -.->|"NO door ⚠"| park["parking lot ideas"]:::miss
  tl -.->|"no skip→replace ⚠"| park
  nav -.->|"no path ⚠"| money["budget / balances"]:::miss
  nav -.->|"no path ⚠"| offline["offline toggle (in More) "]:::miss`
  },
  post: {
    title: 'Post-trip — the silent seam',
    def: `flowchart LR
  classDef warn fill:#f6d9cf,stroke:#b4552d,color:#5a2a14
  classDef miss fill:#fff,stroke:#b4552d,stroke-dasharray:5 4,color:#b4552d
  classDef ok fill:#e7efe7,stroke:#4a7c59,color:#1f2d23
  endDate["end_date + 1"] -->|"silent revert ⚠"| planUI["planning UI<br/>(nothing to plan)"]:::warn
  endDate -.->|"MISSING: wrap-up state (D5)"| wrap["settle → closeout → share"]:::miss
  planUI --> more["/more (owner card)"] --> closeout["/closeout wizard ✓<br/>(no status gate ⚠, no goals step ⚠)"]:::warn
  closeout -->|"finish → trip home<br/>(no share moment ⚠)"| planUI
  more --> settings["/settings →<br/>archive link as raw code ⚠"]:::warn
  settings -.-> pub["/archive/[token] ✓<br/>404 before publish ⚠"]:::warn
  more --> clone["/clone ✓ (owner)"]:::ok & exp["GET /export ✓"]:::ok
  money["/expenses settle-up ✓<br/>(uninvited)"]:::ok`
  }
};

// ---- findings cards ----
const sevColor = { P1: '#b4552d', P2: '#b08d3e', P3: '#7a8a7a' };
const findingCard = (f) => `
<article class="card" data-phase="${f.phase}" data-axis="${f.axis}" data-sev="${f.severity}" data-lens="${f.lens}" id="${f.id}">
  <header>
    <span class="sev" style="background:${sevColor[f.severity]}">${f.severity}</span>
    <span class="fid">${f.id}</span>
    <span class="chip">${f.phase}</span><span class="chip">${f.axis}</span><span class="chip">${f.lens} lens</span><span class="chip ctx">${esc(f.context)}</span>
  </header>
  <h3>${esc(f.what.split('.')[0])}.</h3>
  <p class="what">${esc(f.what)}</p>
  <p class="why"><strong>Why it's a gap:</strong> ${esc(f.why)}</p>
  <p class="fix"><strong>Proposed fix:</strong> ${esc(f.fix)}</p>
  <p class="where"><code>${esc(f.where)}</code></p>
  ${f.screenshot ? `<img class="shot" src="screenshots/${f.screenshot}" alt="${f.id} evidence">` : ''}
</article>`;

// attach evidence screenshots to specific findings
const shots = {
  'WP-A-001': null, 'WP-A-002': '10-error-bad-slug.png', 'WP-A-003': '05-documents.png',
  'WP-A-004': '06-more.png', 'WP-A-005': '03-now.png', 'WP-A-006': '08-overview-upcoming-chip.png',
  'WP-A-019': '07-settings-archive.png'
};
findings.forEach((f) => { if (shots[f.id]) f.screenshot = shots[f.id]; });

const verdictColor = { clean: '#4a7c59', findable: '#7a8a7a', slow: '#b08d3e', lost: '#b4552d', gap: '#8a3a5a', unbuilt: '#888' };
const tpRow = (s) => {
  const v = s.verdict.startsWith('unbuilt') ? 'unbuilt' : s.verdict;
  return `<tr data-verdict="${v}" data-tphase="${s.phase}">
  <td class="num">${s.n}</td><td class="persona">${s.persona}</td>
  <td>${esc(s.intent)}</td><td class="phasecell">${s.phase}</td>
  <td><span class="verdict" style="background:${verdictColor[v]}">${esc(s.verdict)}</span></td>
  <td class="taps">${esc(String(s.taps))}</td>
  <td class="notes">${esc(s.path)}${s.notes ? ` — <em>${esc(s.notes)}</em>` : ''}</td></tr>`;
};

const r = taskpaths.rollup;
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waypoint — App Audit #116</title>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: 'neutral', flowchart: { curve: 'basis' } });
window.addEventListener('load', () => setTimeout(panzoom, 1200));
function panzoom() {
  document.querySelectorAll('.diagram').forEach((box) => {
    const svg = box.querySelector('svg'); if (!svg) return;
    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0;
    const apply = () => (svg.style.transform = \`translate(\${tx}px,\${ty}px) scale(\${scale})\`);
    svg.style.transformOrigin = '0 0'; svg.style.cursor = 'grab';
    box.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.min(4, Math.max(0.4, scale * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); }, { passive: false });
    box.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; svg.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', (e) => { if (dragging) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
    window.addEventListener('pointerup', () => { dragging = false; svg.style.cursor = 'grab'; });
    box.querySelector('.reset')?.addEventListener('click', () => { scale = 1; tx = ty = 0; apply(); });
  });
}
</script>
<style>
  :root { --paper:#f4efe7; --surface:#fbf8f2; --ink:#2b2926; --soft:#5a564f; --muted:#8a857c; --line:#e2dccf; --moss:#4a7c59; --clay:#b4552d; --gold:#b08d3e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font-size: 30px; margin: 8px 0 4px; } h2 { font-size: 21px; margin: 44px 0 10px; border-bottom: 2px solid var(--line); padding-bottom: 6px; }
  h3 { font-size: 16px; margin: 6px 0; }
  .sub { color: var(--muted); font-size: 13px; }
  .scorebar { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0; }
  .score { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 16px; text-align:center; min-width:86px; }
  .score b { display:block; font-size:22px; } .score span { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
  .charter { background:var(--surface); border:1px solid var(--line); border-left:4px solid var(--moss); border-radius:10px; padding:16px 20px; }
  .charter h3 { margin-top:14px; color:var(--moss); font-size:13px; text-transform:uppercase; letter-spacing:.1em; }
  .charter p, .charter li { font-size:14px; color:var(--soft); }
  .twocol { columns: 2 340px; column-gap: 28px; }
  .diagram-box { background:var(--surface); border:1px solid var(--line); border-radius:10px; margin:14px 0; overflow:hidden; }
  .diagram-box header { display:flex; justify-content:space-between; align-items:center; padding:8px 14px; border-bottom:1px solid var(--line); font-weight:600; font-size:14px; }
  .diagram { overflow:hidden; height: 430px; position:relative; touch-action:none; }
  .diagram pre.mermaid { margin:0; display:flex; justify-content:center; }
  .reset { font-size:12px; border:1px solid var(--line); background:var(--paper); border-radius:6px; padding:3px 10px; cursor:pointer; }
  .hint { font-size:11px; color:var(--muted); font-weight:400; }
  .filters { display:flex; gap:6px; flex-wrap:wrap; margin:12px 0; align-items:center; }
  .filters button { border:1px solid var(--line); background:var(--surface); border-radius:999px; padding:4px 12px; font-size:12.5px; cursor:pointer; color:var(--soft); }
  .filters button.on { background:var(--ink); color:var(--paper); border-color:var(--ink); }
  .filters input { border:1px solid var(--line); border-radius:8px; padding:5px 10px; font-size:13px; background:var(--surface); min-width:180px; }
  .filters .grp { font-size:11px; color:var(--muted); margin-left:8px; text-transform:uppercase; letter-spacing:.06em; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:10px 0; }
  .card header { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:4px; }
  .sev { color:#fff; font-weight:700; font-size:12px; border-radius:6px; padding:2px 8px; }
  .fid { font-family: ui-monospace, monospace; font-size:12px; color:var(--muted); }
  .chip { font-size:11px; background:var(--paper); border:1px solid var(--line); border-radius:999px; padding:1px 9px; color:var(--soft); }
  .chip.ctx { border-style:dashed; }
  .card .what { font-size:14px; } .card .why, .card .fix { font-size:13.5px; color:var(--soft); }
  .card .where code { font-size:11.5px; color:var(--muted); word-break:break-all; }
  .card img.shot { max-width:230px; border:1px solid var(--line); border-radius:10px; margin-top:8px; display:block; }
  table { border-collapse:collapse; width:100%; font-size:13px; background:var(--surface); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); padding:8px 10px; border-bottom:2px solid var(--line); }
  td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  td.num { color:var(--muted); font-family:ui-monospace,monospace; } td.taps { white-space:nowrap; font-family:ui-monospace,monospace; font-size:12px; }
  td.notes { color:var(--soft); font-size:12.5px; } td.phasecell, td.persona { white-space:nowrap; }
  .verdict { color:#fff; font-size:11px; font-weight:700; border-radius:6px; padding:2px 8px; white-space:nowrap; }
  .doc-table td:first-child { font-weight:600; white-space:nowrap; }
  .pill-live { color:var(--moss); font-weight:700; } .pill-rec { color:var(--muted); font-weight:700; }
  footer { margin-top:60px; color:var(--muted); font-size:12px; border-top:1px solid var(--line); padding-top:14px; }
  a { color: var(--moss); }
</style></head><body><div class="wrap">

<p class="sub">Waypoint · Issue #116 · research · generated ${new Date().toISOString().slice(0, 10)} from <code>docs/app-audit/*</code> (code-derived, branch claude/crazy-matsumoto-d2d390)</p>
<h1>App-wide UX &amp; Navigation Audit</h1>
<p class="sub">Dual lens: mechanical reachability (M1–M4) + vision fit (V1–V3) · panel: novice / power / code / designer · 44 task-path scenarios</p>

<div class="scorebar">
  <div class="score" style="border-color:#b4552d"><b>${sevCount('P1')}</b><span>P1 findings</span></div>
  <div class="score" style="border-color:#b08d3e"><b>${sevCount('P2')}</b><span>P2 findings</span></div>
  <div class="score"><b>${sevCount('P3')}</b><span>P3 findings</span></div>
  <div class="score" style="border-color:#4a7c59"><b>${r.clean.length}</b><span>clean paths</span></div>
  <div class="score" style="border-color:#b4552d"><b>${r.lost.length + r.gap.length}</b><span>lost / gap</span></div>
  <div class="score"><b>37</b><span>pages mapped</span></div>
</div>

<h2>The Charter (what this audit judges against)</h2>
<div class="charter">
  <p><strong>Waypoint is the one home for a group trip.</strong> It replaces the Doc/Sheet/Splitwise/group-text stack with a single place where a small circle of friends and family <strong>plans</strong>, <strong>decides</strong>, <strong>executes</strong>, and <strong>keeps the record</strong>. The one job: <em>nothing about the trip should ever force anyone back to the old stack.</em> Quality bar: a non-technical friend contributes without being taught; nothing is lost at the seams (planning→trip day, trip day→record).</p>
  <h3>A finding is real only if it fails a test</h3>
  <ul>
    <li><strong>Mechanical:</strong> M1 orphan route · M2 one-way street · M3 shipped-but-unreachable · M4 expected-but-missing link</li>
    <li><strong>Vision:</strong> V1 forces the old stack · V2 silences a contributor · V3 drops something at a seam</li>
    <li><strong>Not a finding:</strong> anything documented as deferred (SPEC_BACKLOG, PRD deferred lists, ADRs, off-the-table, NOT-list) — cited instead.</li>
  </ul>
  <h3>Grill decisions that bound the findings (D1–D6)</h3>
  <ul>
    <li><strong>D1</strong> No collaboration home — intentional (solo↔12+); scattering is design, discoverability ceiling is P2/P3.</li>
    <li><strong>D2</strong> First five minutes is a real, known gap — first-class flow.</li>
    <li><strong>D3</strong> Light Replanning boundary is temporal: <em>today</em> is Trip Mode's to edit; any other day is Planning's. Now a CONTEXT.md term.</li>
    <li><strong>D4</strong> Replanning doors open proactively (free-time Focus, skipped item) — promoted from backlog-nicety to requirement.</li>
    <li><strong>D5</strong> Wrap-up is a missing third derived state (auto-flip, quiet, group-facing) — pre-agreed P1, PRD-route.</li>
    <li><strong>D6</strong> Docs are live (must track code) or records (point-in-time) — mismatches captured below.</li>
  </ul>
  <p class="sub">Full charter: <code>docs/app-audit/charter.md</code></p>
</div>

<h2>Navigation graph (code-derived)</h2>
<p class="sub">Every edge from <code>href</code>/<code>goto()</code>/<code>redirect()</code>/form actions + nav chrome (<code>nav-tabs.ts</code>, BottomNav, SideRail, ContextRail, SubTabs). Drag to pan, scroll to zoom. ⚠ = finding. Raw data: <code>edges.json</code>.</p>
${Object.values(DIAGRAMS).map((d) => `
<div class="diagram-box"><header>${d.title}<span><span class="hint">drag · scroll&nbsp;&nbsp;</span><button class="reset">reset</button></span></header>
<div class="diagram"><pre class="mermaid">${d.def}</pre></div></div>`).join('')}

<h2>Task-path walkthroughs — 44 scenarios</h2>
<p class="sub">"I want to…" intents walked through the real graph. Personas: N = novice (no hidden gestures, nothing learned-by-exploring), P = power.</p>
<div class="filters" id="tpf">
  <span class="grp">verdict</span>
  ${['all', 'clean', 'findable', 'slow', 'lost', 'gap', 'unbuilt'].map((v) => `<button data-v="${v}" class="${v === 'all' ? 'on' : ''}">${v}</button>`).join('')}
</div>
<table id="tptable"><thead><tr><th>#</th><th></th><th>Intent</th><th>Phase</th><th>Verdict</th><th>Taps</th><th>Path & notes</th></tr></thead>
<tbody>${taskpaths.scenarios.map(tpRow).join('')}</tbody></table>

<h2>Findings — ${findings.length} total</h2>
<div class="filters" id="ff">
  <span class="grp">severity</span>${['P1', 'P2', 'P3'].map((s) => `<button data-k="sev" data-val="${s}">${s}</button>`).join('')}
  <span class="grp">phase</span>${['planning', 'trip', 'post-trip', 'cross-phase'].map((p) => `<button data-k="phase" data-val="${p}">${p}</button>`).join('')}
  <span class="grp">axis</span>${['mechanical', 'vision'].map((a) => `<button data-k="axis" data-val="${a}">${a}</button>`).join('')}
  <span class="grp">lens</span>${['novice', 'power', 'code', 'designer'].map((l) => `<button data-k="lens" data-val="${l}">${l}</button>`).join('')}
  <input id="fsearch" placeholder="search findings…">
  <button id="fclear">clear</button>
</div>
<div id="cards">${findings.map(findingCard).join('')}</div>

<h2>Doc hygiene — live docs vs code</h2>
<p class="sub">Per D6: <span class="pill-live">LIVE</span> docs must track code and were fixed where verified; <span class="pill-rec">RECORD</span> docs are point-in-time history, left alone.</p>
<table class="doc-table"><thead><tr><th>Doc</th><th>Class</th><th>State</th></tr></thead><tbody>
<tr><td>CONTEXT.md</td><td class="pill-live">LIVE</td><td>FIXED in this audit: nav roster (Activity tab → Members/Docs per nav-tabs.ts); "not yet built" annotations for Trip Goal, Swipe-Quiz, Document, Join Link, Departed Member (all shipped); added [[Light Replanning]]. Remaining mismatch kept visible: "Trip Goals reviewed in closeout wizard" is design intent — wizard has no goals step (finding in walk, scenario 33).</td></tr>
<tr><td>docs/SPEC.md</td><td class="pill-live">LIVE</td><td>STALE, not yet patched (needs its own pass): §1 nav says "Activity, Vault" tabs in both modes; §4 permission table still has Vault rows (Vault retired, ADR-0005). Trust CONTEXT.md + code instead.</td></tr>
<tr><td>docs/SPEC_BACKLOG.md</td><td class="pill-live">LIVE</td><td>STALE on shipped-status: lists Trip Goal, Swipe-Quiz, Item Voting UI (#30), Documents S5 offline precache, and linked-goals-in-item-detail as backlog — all shipped in code. Needs a shipped-sweep.</td></tr>
<tr><td>docs/design-system.md</td><td class="pill-live">LIVE</td><td>Not audited this pass (no nav claims).</td></tr>
<tr><td>.wolf/anatomy.md</td><td class="pill-live">LIVE (auto)</td><td>Predates v4 routes (no goals/, documents/, lists/, swipe/, join/, account/; still lists vault/). OpenWolf will rescan; flagged so nobody trusts it for routes meanwhile.</td></tr>
<tr><td>PRDs (V3, V4_*, AVATARS, MEMBERSHIP_LIFECYCLE, PHASE_REDESIGN, TASKS, TRIP_MEMORY)</td><td class="pill-rec">RECORD</td><td>Point-in-time intent; consulted for "why" + deferral citations. V3_PRD's Vault references are historical, fine.</td></tr>
<tr><td>docs/adr/0001–0008</td><td class="pill-rec">RECORD</td><td>Locked decisions; no finding proposes reversing one.</td></tr>
</tbody></table>

<h2>What's genuinely good (so the gaps have contrast)</h2>
<ul style="font-size:14px; color:var(--soft)">
  <li><strong>The front doors are strong.</strong> /join and /invite: pre-auth context card, inline OTP, placeholder claim with role clamping, every error state has copy and an exit. The gap is only what happens <em>after</em> accept (WP-A-014).</li>
  <li><strong>Day view is the app's best surface</strong> — timeline, parking dividers per phase, cross-phase pull rejection, FAB, DayNav swipe. Scenario 9 is the experience the vision describes.</li>
  <li><strong>Documents shipped right:</strong> auto-precache on active trips, ?action=add deep link from the AddSheet, role-aware delete, lightbox. One wrong back-link (WP-A-003) mars it.</li>
  <li><strong>Trips dashboard orients instantly</strong> (On trip / Upcoming / Past) — scenario 44 clean.</li>
  <li><strong>Members page is a complete collaboration console</strong> — invite, join links (create/copy/rotate/revoke per role), placeholders, tombstones.</li>
</ul>

<h2>Machine-readable findings (Phase 3 files issues from this)</h2>
<p class="sub">Same data as <code>findings.json</code> / <code>taskpaths.json</code> — embedded so the report is self-contained.</p>
<script type="application/json" id="findings-data">${JSON.stringify({ findings, taskpaths: taskpaths.scenarios }, null, 1)}</script>
<details><summary style="cursor:pointer">view raw JSON</summary><pre style="font-size:11px; overflow:auto; max-height:300px; background:var(--surface); padding:10px; border:1px solid var(--line); border-radius:8px;">${esc(JSON.stringify({ findings }, null, 2))}</pre></details>

<footer>Charter: docs/app-audit/charter.md · State: routes.json, edges.json, taskpaths.json, findings.json · Screenshots: docs/app-audit/screenshots/ (375px, dev data) · No PR — research issue #116.</footer>
</div>

<script>
// taskpath verdict filter
document.querySelectorAll('#tpf button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tpf button').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  const v = b.dataset.v;
  document.querySelectorAll('#tptable tbody tr').forEach((tr) => {
    tr.style.display = v === 'all' || tr.dataset.verdict === v ? '' : 'none';
  });
}));
// findings multi-facet filter
const active = { sev: new Set(), phase: new Set(), axis: new Set(), lens: new Set() };
const applyF = () => {
  const q = document.getElementById('fsearch').value.toLowerCase();
  document.querySelectorAll('#cards .card').forEach((c) => {
    const ok = (!active.sev.size || active.sev.has(c.dataset.sev)) &&
      (!active.phase.size || active.phase.has(c.dataset.phase)) &&
      (!active.axis.size || active.axis.has(c.dataset.axis)) &&
      (!active.lens.size || active.lens.has(c.dataset.lens)) &&
      (!q || c.textContent.toLowerCase().includes(q));
    c.style.display = ok ? '' : 'none';
  });
};
document.querySelectorAll('#ff button[data-k]').forEach((b) => b.addEventListener('click', () => {
  const s = active[b.dataset.k];
  s.has(b.dataset.val) ? s.delete(b.dataset.val) : s.add(b.dataset.val);
  b.classList.toggle('on');
  applyF();
}));
document.getElementById('fsearch').addEventListener('input', applyF);
document.getElementById('fclear').addEventListener('click', () => {
  Object.values(active).forEach((s) => s.clear());
  document.querySelectorAll('#ff .on').forEach((b) => b.classList.remove('on'));
  document.getElementById('fsearch').value = '';
  applyF();
});
</script>
</body></html>`;

writeFileSync(dir + 'index.html', html);
console.log(`wrote index.html (${(html.length / 1024).toFixed(0)} KB, ${findings.length} findings, ${taskpaths.scenarios.length} scenarios)`);
