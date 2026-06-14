// #116 v2 — generate v2/index.html FROM findings-v2.json (charter §8 rule).
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url).pathname;
const data = JSON.parse(readFileSync(dir + 'findings-v2.json', 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sevColor = { P1: '#b4552d', P2: '#b08d3e', P3: '#7a8a7a' };
const verdictColor = { confirmed: '#4a7c59', amended: '#b08d3e', refuted: '#b4552d', unverified: '#8a857c' };

const counts = { confirmed: 0, amended: 0, refuted: 0 };
data.v1_verdicts.forEach((v) => counts[v.verdict] !== undefined && counts[v.verdict]++);
const newP1 = data.new_findings.filter((f) => f.severity === 'P1');

// Current combined P1 walk-list: v1 P1s that survived + new P1s
const v1P1 = data.v1_verdicts.filter((v) => v.new_severity === 'P1' && v.verdict !== 'refuted');

const v1Row = (v) => `<tr data-verdict="${v.verdict}">
  <td class="num">${v.id.replace('WP-A-0', 'A')}</td>
  <td><span class="verdict" style="background:${verdictColor[v.verdict]}">${v.verdict}</span></td>
  <td class="sevchange">${v.old_severity === v.new_severity ? v.new_severity : `<s>${v.old_severity}</s>→<b>${v.new_severity}</b>`}</td>
  <td class="title">${esc(v.title)}${v.charter_seeded ? ' <span class="chip" title="named in the charter — rediscoveries discounted">charter-seeded</span>' : ''}${v.independent_confirmations.length ? ` <span class="chip ok">+${v.independent_confirmations.length} blind confirm</span>` : ''}${v.disposition ? ` <span class="chip prd">${esc(v.disposition.split(' ')[0])}</span>` : ''}</td>
  <td class="notes">${esc(v.amendment || v.summary).slice(0, 360)}</td></tr>`;

const newCard = (f) => `
<article class="card" data-sev="${f.severity}" data-phase="${f.phase}" data-ver="${f.verified ? 'verified' : 'unverified'}" id="${f.id}">
  <header>
    <span class="sev" style="background:${sevColor[f.severity]}">${f.severity}</span>
    <span class="fid">${f.id}</span>
    <span class="chip">${f.phase}</span><span class="chip">${f.axis}</span>
    ${f.witnesses.map((w) => `<span class="chip w">${w}</span>`).join('')}
    ${f.verified ? `<span class="chip ok">✓ fleet-verified (${f.verified.verdict})</span>` : '<span class="chip">unverified</span>'}
    ${f.rel !== 'new' ? `<span class="chip prd">${f.rel}</span>` : ''}
  </header>
  <h3>${esc(f.title)}</h3>
  <p class="what">${esc(f.what)}</p>
  <p class="why"><strong>Why:</strong> ${esc(f.why)}</p>
  <p class="fix"><strong>Fix:</strong> ${esc(f.fix)}</p>
  ${f.verified ? `<details><summary>Verifier's evidence</summary><p class="why">${esc(f.verified.summary)}</p><p class="where"><code>${esc(f.verified.evidence)}</code></p>${f.verified.amendment ? `<p class="why"><strong>Amendment:</strong> ${esc(f.verified.amendment)}</p>` : ''}</details>` : ''}
  ${f.note ? `<p class="why"><strong>Lead note:</strong> ${esc(f.note)}</p>` : ''}
  <p class="where"><code>${esc(f.where).slice(0, 500)}</code></p>
</article>`;

const exploreBlock = (e) => `
<section class="explore">
  <h3>${esc(e.key)} <a class="mdlink" href="explorations/${e.key}.md">full analysis →</a></h3>
  <p class="headline">${esc(e.headline)}</p>
  <ul>${(e.key_points ?? []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
  ${(e.proposals ?? []).length ? `<div class="proposals">${e.proposals.map((p) => `<div class="prop"><b>${esc(p.title)}</b><p>${esc(p.what)}</p><p class="why">${esc(p.why)}</p></div>`).join('')}</div>` : ''}
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waypoint — Audit v2 (deep review)</title>
<style>
  :root { --paper:#f4efe7; --surface:#fbf8f2; --ink:#2b2926; --soft:#5a564f; --muted:#8a857c; --line:#e2dccf; --moss:#4a7c59; --clay:#b4552d; --gold:#b08d3e; }
  * { box-sizing:border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:24px 20px 80px; }
  h1 { font-size:28px; margin:8px 0 4px; } h2 { font-size:20px; margin:42px 0 10px; border-bottom:2px solid var(--line); padding-bottom:6px; }
  h3 { font-size:15.5px; margin:6px 0; } .sub { color:var(--muted); font-size:13px; }
  .scorebar { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0; }
  .score { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 16px; text-align:center; min-width:86px; }
  .score b { display:block; font-size:22px; } .score span { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
  .method { background:var(--surface); border:1px solid var(--line); border-left:4px solid var(--gold); border-radius:10px; padding:12px 18px; font-size:13.5px; color:var(--soft); }
  table { border-collapse:collapse; width:100%; font-size:13px; background:var(--surface); border:1px solid var(--line); }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); padding:8px 10px; border-bottom:2px solid var(--line); }
  td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  td.num { font-family:ui-monospace,monospace; color:var(--muted); white-space:nowrap; }
  td.sevchange { white-space:nowrap; font-family:ui-monospace,monospace; } td.sevchange s { color:var(--muted); } td.sevchange b { color:var(--clay); }
  td.title { font-weight:600; } td.notes { color:var(--soft); font-size:12.5px; }
  .verdict { color:#fff; font-size:11px; font-weight:700; border-radius:6px; padding:2px 8px; white-space:nowrap; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:10px 0; }
  .card header { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:4px; }
  .sev { color:#fff; font-weight:700; font-size:12px; border-radius:6px; padding:2px 8px; }
  .fid { font-family:ui-monospace,monospace; font-size:12px; color:var(--muted); }
  .chip { font-size:11px; background:var(--paper); border:1px solid var(--line); border-radius:999px; padding:1px 9px; color:var(--soft); }
  .chip.ok { border-color:var(--moss); color:var(--moss); } .chip.w { border-style:dashed; } .chip.prd { border-color:var(--gold); color:var(--gold); }
  .card .what { font-size:14px; } .card .why, .card .fix { font-size:13.5px; color:var(--soft); }
  .card .where code { font-size:11.5px; color:var(--muted); word-break:break-all; }
  .card details summary { cursor:pointer; font-size:12.5px; color:var(--moss); }
  .filters { display:flex; gap:6px; flex-wrap:wrap; margin:12px 0; align-items:center; }
  .filters button { border:1px solid var(--line); background:var(--surface); border-radius:999px; padding:4px 12px; font-size:12.5px; cursor:pointer; color:var(--soft); }
  .filters button.on { background:var(--ink); color:var(--paper); border-color:var(--ink); }
  .filters .grp { font-size:11px; color:var(--muted); margin-left:8px; text-transform:uppercase; letter-spacing:.06em; }
  .explore { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:12px 0; }
  .explore .headline { font-weight:600; font-size:14px; } .explore ul { font-size:13px; color:var(--soft); margin:8px 0; }
  .mdlink { font-size:12px; font-weight:400; color:var(--moss); margin-left:8px; }
  .proposals { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:8px; margin-top:8px; }
  .prop { border:1px dashed var(--line); border-radius:8px; padding:8px 12px; font-size:12.5px; } .prop p { margin:4px 0; } .prop .why { color:var(--muted); }
  .walklist li { margin:4px 0; } footer { margin-top:60px; color:var(--muted); font-size:12px; border-top:1px solid var(--line); padding-top:14px; }
  a { color:var(--moss); }
</style></head><body><div class="wrap">

<p class="sub">Waypoint · Issue #116 · deep review v2 · generated ${new Date().toISOString().slice(0, 10)} · companion to <a href="../index.html">the v1 report</a></p>
<h1>Audit v2 — the fleet's verdict</h1>
<p class="sub">${esc(data._meta.method)}</p>

<div class="scorebar">
  <div class="score" style="border-color:#4a7c59"><b>${counts.confirmed}</b><span>v1 confirmed</span></div>
  <div class="score" style="border-color:#b08d3e"><b>${counts.amended}</b><span>v1 amended</span></div>
  <div class="score" style="border-color:#b4552d"><b>${counts.refuted}</b><span>v1 refuted</span></div>
  <div class="score"><b>${data.new_findings.length}</b><span>new findings</span></div>
  <div class="score" style="border-color:#b4552d"><b>${newP1.length}</b><span>new P1s</span></div>
  <div class="score"><b>${data.new_findings.filter((f) => f.verified).length}</b><span>fleet-verified</span></div>
</div>

<div class="method"><b>Methodology + an honest accounting:</b> run 1 launched 64 agents and hit the session usage limit — its 6 surviving blind finders produced 50 raw findings; every verifier and exploration died. Run 2 re-ran trimmed (13 agents): 5 batched adversarial verifiers covering all 25 v1 findings + 15 unconverged fresh claims, the 2 missing blind slices, all 6 explorations. Blind finders never saw v1 findings (charter only) — overlap below is independent confirmation, except where marked charter-seeded (the charter itself names those gaps). Raw data: <code>fresh-findings.json</code>, <code>verdicts.json</code>, <code>findings-v2.json</code>.</div>

<h2>The walk-list after v2 — every currently-standing P1</h2>
<ul class="walklist">
${v1P1.map((v) => `<li><b>${v.id}</b> — ${esc(v.title)} <span class="chip" style="background:${verdictColor[v.verdict]};color:#fff;border:none">${v.verdict}</span>${v.disposition ? ' <span class="chip prd">PRD #166 ✓</span>' : ''}</li>`).join('')}
${newP1.map((f) => `<li><b>${f.id}</b> — ${esc(f.title)} <span class="chip ok">${f.verified ? 'fleet-verified' : 'lead-verified'}</span>${f.rel.startsWith('extends') ? ` <span class="chip prd">${f.rel}</span>` : ''}</li>`).join('')}
</ul>
<p class="sub">Dropped from the P1 walk: WP-A-008 (refuted — the 403-redirect claim was misattributed; its real substance lives in WP-B-001 / the amended WP-A-009).</p>

<h2>Verdicts on the 25 v1 findings</h2>
<div class="filters" id="vf"><span class="grp">verdict</span>${['all', 'confirmed', 'amended', 'refuted'].map((v) => `<button data-v="${v}" class="${v === 'all' ? 'on' : ''}">${v}</button>`).join('')}</div>
<table id="vtable"><thead><tr><th>id</th><th>verdict</th><th>sev</th><th>finding</th><th>verifier's reasoning (excerpt)</th></tr></thead>
<tbody>${data.v1_verdicts.map(v1Row).join('')}</tbody></table>

<h2>New findings — ${data.new_findings.length}</h2>
<div class="filters" id="nf">
  <span class="grp">severity</span>${['P1', 'P2', 'P3'].map((s) => `<button data-k="sev" data-val="${s}">${s}</button>`).join('')}
  <span class="grp">phase</span>${['planning', 'trip', 'post-trip', 'cross-phase'].map((p) => `<button data-k="phase" data-val="${p}">${p}</button>`).join('')}
  <span class="grp">status</span>${['verified', 'unverified'].map((s) => `<button data-k="ver" data-val="${s}">${s}</button>`).join('')}
  <button id="nclear">clear</button>
</div>
<div id="ncards">${data.new_findings.map(newCard).join('')}</div>

<h2>Design explorations</h2>
<p class="sub">Six standalone analyses; full write-ups in <code>explorations/</code>. Proposals below are candidates for the Phase-3 walk, not commitments.</p>
${data.explorations.map(exploreBlock).join('')}

<h2>Machine-readable</h2>
<script type="application/json" id="findings-v2-data">${JSON.stringify(data, null, 1)}</script>
<details><summary style="cursor:pointer">view raw JSON</summary><pre style="font-size:11px;overflow:auto;max-height:300px;background:var(--surface);padding:10px;border:1px solid var(--line);border-radius:8px;">${esc(JSON.stringify({ v1_verdicts: data.v1_verdicts, new_findings: data.new_findings }, null, 2))}</pre></details>

<footer>Runs wf_c928fb55-5d2 + wf_d479e7cb-aaf · charter: ../charter.md · v1 report: ../index.html · No PR — research issue #116.</footer>
</div>
<script>
document.querySelectorAll('#vf button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#vf button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
  const v = b.dataset.v;
  document.querySelectorAll('#vtable tbody tr').forEach((tr) => { tr.style.display = v === 'all' || tr.dataset.verdict === v ? '' : 'none'; });
}));
const active = { sev: new Set(), phase: new Set(), ver: new Set() };
const apply = () => document.querySelectorAll('#ncards .card').forEach((c) => {
  const ok = (!active.sev.size || active.sev.has(c.dataset.sev)) && (!active.phase.size || active.phase.has(c.dataset.phase)) && (!active.ver.size || active.ver.has(c.dataset.ver));
  c.style.display = ok ? '' : 'none';
});
document.querySelectorAll('#nf button[data-k]').forEach((b) => b.addEventListener('click', () => {
  const s = active[b.dataset.k]; s.has(b.dataset.val) ? s.delete(b.dataset.val) : s.add(b.dataset.val);
  b.classList.toggle('on'); apply();
}));
document.getElementById('nclear').addEventListener('click', () => { Object.values(active).forEach((s) => s.clear()); document.querySelectorAll('#nf .on').forEach((b) => b.classList.remove('on')); apply(); });
</script>
</body></html>`;

writeFileSync(dir + 'index.html', html);
console.log(`wrote v2/index.html (${(html.length / 1024).toFixed(0)} KB): ${data.v1_verdicts.length} verdicts, ${data.new_findings.length} new findings, ${data.explorations.length} explorations`);
