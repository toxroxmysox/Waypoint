// === Lists surface · FINAL PASS · Overview preview + Item-embedded checklist ===

// ──────────────────────────────────────────────────────────────
// Overview preview — day-centric phases with a quiet checklist footer
// ──────────────────────────────────────────────────────────────
const PHASES = [
  {
    chip: BCN, range: 'Jun 12 – 16', dayCount: 5,
    days: [
      { d: 'Day 1', date: 'Thu Jun 12', label: 'Arrival · settle in', n: 3, glyphs: ['flight', 'lodging', 'meal'] },
      { d: 'Day 2', date: 'Fri Jun 13', label: 'Gaudí day', n: 4, glyphs: ['walk', 'activity', 'meal'] },
      { d: 'Day 3', date: 'Sat Jun 14', label: 'Gothic Quarter', n: 3, glyphs: ['walk', 'activity', 'meal'] },
      { d: 'Day 4', date: 'Sun Jun 15', label: 'Montjuïc + beach', n: 2, glyphs: ['activity', 'meal'] },
      { d: 'Day 5', date: 'Mon Jun 16', label: 'Park Güell', n: 3, glyphs: ['activity', 'meal', 'show'] },
    ],
    lists: [{ title: 'Barcelona musts', done: 0, total: 5, color: BCN.color }],
  },
  {
    chip: SEV, range: 'Jun 17 – 21', dayCount: 5,
    days: [
      { d: 'Day 6', date: 'Tue Jun 17', label: 'Train in · check in', n: 2, glyphs: ['transport', 'lodging'] },
      { d: 'Day 7', date: 'Wed Jun 18', label: 'Cathedral + Giralda', n: 4, glyphs: ['activity', 'meal', 'walk'] },
      { d: 'Day 8', date: 'Thu Jun 19', label: 'Alcázar + flamenco', n: 5, glyphs: ['meal', 'activity', 'show'] },
      { d: 'Day 9', date: 'Fri Jun 20', label: 'Itálica day-trip', n: 3, glyphs: ['walk', 'meal'] },
      { d: 'Day 10', date: 'Sat Jun 21', label: 'Travel to Madrid', n: 2, glyphs: ['transport', 'lodging'] },
    ],
    lists: [{ title: 'Seville to-dos', done: 2, total: 6, color: SEV.color }],
  },
  {
    chip: MAD, range: 'Jun 22 – 26', dayCount: 5,
    days: [
      { d: 'Day 11', date: 'Sun Jun 22', label: 'Prado + Retiro', n: 3, glyphs: ['activity', 'walk', 'meal'] },
      { d: 'Day 12', date: 'Mon Jun 23', label: 'Reina Sofía', n: 3, glyphs: ['activity', 'meal'] },
      { d: 'Day 13', date: 'Tue Jun 24', label: 'Toledo day-trip', n: 2, glyphs: ['transport', 'activity'] },
      { d: 'Day 14', date: 'Wed Jun 25', label: 'Markets + tapas', n: 3, glyphs: ['walk', 'meal'] },
      { d: 'Day 15', date: 'Thu Jun 26', label: 'Departure', n: 2, glyphs: ['meal', 'flight'] },
    ],
    lists: [{ title: 'Madrid musts', done: 1, total: 4, color: MAD.color }],
  },
];

const TRIP_LISTS = [
  { title: 'Packing', done: 3, total: 12 },
  { title: 'Before we fly', done: 7, total: 9 },
];

// Lightweight one-line list preview — "Packing · 3/12"
const MiniListCard = ({ title, done, total, color = V2.moss }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
    borderRadius: 10, background: V2.surface2, border: `1px solid ${V2.line}`, cursor: 'pointer',
  }}>
    <ProgressDonut done={done} total={total} size={20} stroke={3} color={color}/>
    <span style={{ fontSize: 12.5, fontWeight: 600, color: V2.ink }}>{title}</span>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: V2.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{done}/{total}</span>
    <span style={{ marginLeft: 'auto', color: V2.inkMuted, display: 'inline-flex' }}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
  </div>
);

const GlyphDots = ({ glyphs, size = 20 }) => (
  <span style={{ display: 'inline-flex', flexShrink: 0 }}>
    {glyphs.map((g, i) => (
      <span key={i} style={{
        width: size, height: size, borderRadius: '50%', background: CatTint({ type: g }), border: `1.5px solid ${V2.surface}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: 5 - i,
      }}><CatGlyph type={g} size={size * 0.55}/></span>
    ))}
  </span>
);

// Condensed single-line day row — every day shown, nothing collapsed
const DayRow = ({ day, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: last ? 'none' : `1px solid ${V2.line}`, cursor: 'pointer' }}>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: V2.inkMuted, width: 26, flexShrink: 0 }}>{day.d.replace('Day ', 'D')}</span>
    <span style={{ fontSize: 12.5, fontWeight: 600, color: V2.ink, width: 76, flexShrink: 0 }}>{day.date}</span>
    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: V2.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.label}</span>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: V2.inkMuted, flexShrink: 0 }}>{day.n}</span>
    <GlyphDots glyphs={day.glyphs} size={18}/>
  </div>
);

const PhaseBlock = ({ phase }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
      <PhaseChip color={phase.chip.color} letter={phase.chip.letter} label={phase.chip.label}/>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: V2.inkMuted, letterSpacing: 0.2 }}>{phase.range} · {phase.dayCount} days</span>
    </div>
    <Card radius={14} padding={0} elev="card" style={{ overflow: 'hidden' }}>
      {phase.days.map((d, i) => <DayRow key={d.d} day={d} last={i === phase.days.length - 1}/>)}
    </Card>
    {phase.lists.length > 0 && (
      <div style={{ marginTop: 8, paddingLeft: 2 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 1.4, color: V2.inkMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Sparkle size={8} color={V2.inkMuted}/> Lists
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {phase.lists.map(l => <MiniListCard key={l.title} {...l}/>)}
        </div>
      </div>
    )}
  </div>
);

const OverviewBody = () => (
  <>
    {/* Whole-trip lists — shown once at the top */}
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 1.4, color: V2.inkMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, padding: '0 2px', display: 'flex', alignItems: 'center', gap: 5 }}>
        <StarMark size={9} color={V2.inkMuted} fill/> Whole-trip lists
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {TRIP_LISTS.map(l => <MiniListCard key={l.title} {...l}/>)}
      </div>
    </div>
    {PHASES.map(p => <PhaseBlock key={p.chip.label} phase={p}/>)}
  </>
);

// ──────────────────────────────────────────────────────────────
// Item detail with an embedded checklist (the grocery case)
// ──────────────────────────────────────────────────────────────
const GROCERY = [
  { t: 'Jamón ibérico (250g)', who: 'S', done: true },
  { t: 'Manchego, aged', who: 'A', done: true },
  { t: 'Pan de cristal', who: null, done: false },
  { t: 'Tomatoes + olive oil', who: 'J', done: false },
  { t: 'Gordal olives', who: null, done: false },
  { t: 'Albariño (2 bottles)', who: 'M', done: false },
  { t: 'Marcona almonds', who: 'S', done: false },
];

const ItemDetailRow = ({ icon, label, value, mono }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: `1px solid ${V2.line}` }}>
    <span style={{ color: V2.inkMuted, flexShrink: 0 }}>{icon}</span>
    <span style={{ fontSize: 12, color: V2.inkMuted, width: 58, flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, fontSize: mono ? 12 : 13, fontWeight: 500, color: V2.ink, fontFamily: mono ? 'var(--mono)' : 'var(--ui)', textAlign: 'right' }}>{value}</span>
  </div>
);

const ItemHero = () => (
  <Card radius={14} padding={0} elev="card" accent={V2.moss} style={{ marginBottom: 16 }}>
    <div style={{ padding: '15px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <CatIconCircleV3 type="meal" size={46}/>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <PhaseChip color={SEV.color} letter={SEV.letter} label="Seville"/>
            <Pill variant="planned" size="sm">Activity</Pill>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 21, fontWeight: 600, color: V2.ink, letterSpacing: -0.3, lineHeight: 1.1 }}>Grocery run</div>
          <div style={{ fontSize: 12, color: V2.inkSoft, marginTop: 3, fontFamily: 'var(--mono)' }}>3:00 – 3:45 PM · Day 8</div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <ItemDetailRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2C6.7 2 4 4.7 4 8c0 4 6 10 6 10s6-6 6-10c0-3.3-2.7-6-6-6zM10 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>}
          label="Where" value="Mercado de Triana"/>
        <ItemDetailRow icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
          label="When" value="Before dinner prep at the flat"/>
      </div>
    </div>
  </Card>
);

const ItemBody = ({ onAssign }) => (
  <>
    <ItemHero/>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: V2.ink }}>Shopping list</div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: V2.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: V2.ink, fontWeight: 600 }}>2</span>/7
      </span>
    </div>
    <ChecklistBody tasks={GROCERY} showControls={false} assignable onAssign={onAssign} label="Add an item"/>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '0 4px', color: V2.inkMuted }}>
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
      <span style={{ fontSize: 11, fontStyle: 'italic', fontFamily: 'var(--display)' }}>This list lives on the item — it travels with the grocery run.</span>
    </div>
  </>
);

Object.assign(window, {
  PHASES, TRIP_LISTS, MiniListCard, GlyphDots, DayRow, PhaseBlock, OverviewBody,
  GROCERY, ItemDetailRow, ItemHero, ItemBody,
});
