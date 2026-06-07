// === Lists surface · FINAL PASS · app root ===
// Chosen direction: B (Ledger) + C's in-place strikethrough & Hide-done.
// All five screens at 375px and tablet, grouped by screen for easy compare.

const FinalHero = () => (
  <div style={{ padding: '32px 36px 28px', background: V2.paper, borderBottom: `1px solid ${V2.line}` }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 36, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <StarMark size={32} color={V2.ink} fill/>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, color: V2.ink }}>Waypoint</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: V2.inkMuted, letterSpacing: 0.4, marginTop: 4 }}>ITINERARY › LISTS · FINAL PASS · DIRECTION B</div>
          </div>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 1.05, margin: '0 0 14px', color: V2.ink }}>
          Checklists &amp; tasks — the ledger, end to end.
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: V2.inkSoft, maxWidth: 680, margin: 0 }}>
          Direction <strong>B (ledger)</strong> carried through all five screens, with <strong>C's in-place strikethrough</strong> and{' '}
          the <strong>Hide-done</strong> toggle folded into the manual checklist. Each screen at <strong>375px</strong> and{' '}
          <strong>tablet</strong> (SideRail + centered modals). Try it: check rows, flip <em>In order / Done last</em>, hide done,
          and on the Booking list check a row to watch it leave.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <Pill variant="booked" size="md">Planning · moss</Pill>
          <Pill variant="gold" size="md">Booking · auto lens</Pill>
          <Pill variant="default" style={{ background: V2.surface }}>5 screens × 2 widths</Pill>
          <Pill variant="default" style={{ background: V2.surface }}>Strikethrough + hide-done</Pill>
          <Pill variant="default" style={{ background: V2.surface }}>Assign sheet / modal</Pill>
        </div>
      </div>

      <div style={{ flex: '0 0 320px', background: V2.surface, border: `1px solid ${V2.line}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.6, color: V2.inkMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>The five screens</div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: V2.inkSoft, lineHeight: 1.6 }}>
          {[
            ['Lists index', 'Ledger w/ pinned auto Booking row'],
            ['Checklist detail', 'Manual · strikethrough, hide-done, sort'],
            ['Booking smart list', 'Read-only lens · check = mark booked'],
            ['Overview preview', 'Quiet list mini-cards under each phase'],
            ['Inline item checklist', 'Task rows hosted on the grocery item'],
          ].map(([t, sub], i) => (
            <li key={i} style={{ display: 'flex', gap: 10, padding: '3px 0' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: V2.inkMuted, width: 16, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span><strong style={{ color: V2.ink, fontWeight: 600 }}>{t}.</strong> <span style={{ color: V2.inkMuted }}>{sub}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  </div>
);

const MB = ({ children }) => <div style={{ padding: 20, background: V2.paper }}>{children}</div>;
const TB = ({ children }) => <div style={{ padding: 20, background: V2.paper }}>{children}</div>;

const FinalApp = () => (
  <>
    <FinalHero/>
    <DesignCanvas>
      <DCSection id="s1" title="1 · Lists index" subtitle="The new sub-tab. Unified ledger: auto Booking list pinned at top (gold band + Auto glyph), then trip- and phase-scoped lists with avatar stacks and progress donuts. New-list row at the bottom.">
        <DCArtboard id="m1" label="Mobile · 375px" width={415} height={800}><MB><M_Index/></MB></DCArtboard>
        <DCArtboard id="t1" label="Tablet · SideRail" width={920} height={1160}><TB><T_Index/></TB></DCArtboard>
      </DCSection>

      <DCSection id="s2" title="2 · Checklist detail (manual)" subtitle="Square checkboxes, ruled rows; checked rows strike through & dim in place. The controls row drives both behaviors you liked: 'In order / Done last' sort and a Hide-done toggle. The ⋯ opens Assign — a bottom sheet on mobile, a centered modal on tablet.">
        <DCArtboard id="m2" label="Mobile · assign sheet" width={415} height={800}><MB><M_Detail/></MB></DCArtboard>
        <DCArtboard id="t2" label="Tablet · assign modal" width={920} height={1160}><TB><T_Detail/></TB></DCArtboard>
      </DCSection>

      <DCSection id="s3" title="3 · Booking smart list (read-only)" subtitle="Projected from planned items that still need a reservation. A lens banner makes the relationship legible; each row carries a type glyph + the item's plan context and an 'Open' link. No assignee, no add-row, no rename — checking a row marks the item booked and it leaves the list (try it).">
        <DCArtboard id="m3" label="Mobile · 375px" width={415} height={800}><MB><M_Smart/></MB></DCArtboard>
        <DCArtboard id="t3" label="Tablet · the lens" width={920} height={1160}><TB><T_Smart/></TB></DCArtboard>
      </DCSection>

      <DCSection id="s4" title="4 · Overview preview (modified)" subtitle="The day-centric Overview stays the hero. Whole-trip lists sit once at the top; each phase's day list ends with a quiet one-line 'Lists' preview (donut + title + 3/12) that taps through to the detail. Lightweight by design — it never crowds the days.">
        <DCArtboard id="m4" label="Mobile · 375px" width={415} height={800}><MB><M_Overview/></MB></DCArtboard>
        <DCArtboard id="t4" label="Tablet · SideRail" width={920} height={1160}><TB><T_Overview/></TB></DCArtboard>
      </DCSection>

      <DCSection id="s5" title="5 · Inline item checklist (grocery)" subtitle="The same Task-row component hosted inside an Item, not the Lists surface. A 3 PM Grocery run carries a Shopping list with assignees — execution context (time, place) belongs to the item, the tasks just ride along.">
        <DCArtboard id="m5" label="Mobile · 375px" width={415} height={800}><MB><M_Item/></MB></DCArtboard>
        <DCArtboard id="t5" label="Tablet · item view" width={920} height={1160}><TB><T_Item/></TB></DCArtboard>
      </DCSection>
    </DesignCanvas>
  </>
);

const finalRoot = ReactDOM.createRoot(document.getElementById('root'));
finalRoot.render(<FinalApp/>);
