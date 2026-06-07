// === Lists surface · shared atoms ===
// Builds on v2/shell (V2, Phone, NavBar, Pill, Card, FAB, PhaseChip) and
// v3/shell (PlanningBottomNav, CatGlyph, CatTint). Planning context → moss
// accent. The auto "Booking" smart list leans on GOLD (the reserved
// unplanned/suggestions/auto accent), never clay.

// ──────────────────────────────────────────────────────────────
// Trip members (Spain '25) — each owns a muted, harmonious hue
// ──────────────────────────────────────────────────────────────
const MEMBERS = {
  S: { name: 'Scott', color: V2.moss },
  A: { name: 'Ana',   color: V2.clay },
  J: { name: 'Jake',  color: V2.sky },
  M: { name: 'Mary',  color: '#8A6A1E' },  // gold-deep — AA on white
  L: { name: 'Lena',  color: V2.inkSoft },
};

// ──────────────────────────────────────────────────────────────
// Avatar — initialled circle, white hairline ring so stacks separate
// ──────────────────────────────────────────────────────────────
const Avatar = ({ initial, size = 24, color, ring = true, style = {} }) => {
  const c = color || (MEMBERS[initial] && MEMBERS[initial].color) || V2.ink;
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: c, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, letterSpacing: 0.2,
      fontFamily: 'var(--ui)', flexShrink: 0,
      boxShadow: ring ? `0 0 0 1.5px ${V2.surface}` : 'none',
      ...style,
    }}>{initial}</span>
  );
};

const AvatarStack = ({ who = [], size = 22, max = 4 }) => {
  const shown = who.slice(0, max);
  const extra = who.length - shown.length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32, zIndex: max - i }}>
          <Avatar initial={m} size={size}/>
        </span>
      ))}
      {extra > 0 && (
        <span style={{
          marginLeft: -size * 0.32, zIndex: 0,
          width: size, height: size, borderRadius: '50%',
          background: V2.surface2, color: V2.inkMuted,
          border: `1px solid ${V2.line}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.38, fontWeight: 700,
          boxShadow: `0 0 0 1.5px ${V2.surface}`,
        }}>+{extra}</span>
      )}
    </span>
  );
};

// ──────────────────────────────────────────────────────────────
// SubTabs — Overview · Phases · Lists (sticky, moss underline)
// ──────────────────────────────────────────────────────────────
const SubTabs = ({ active = 'lists' }) => {
  const tabs = [['overview', 'Overview'], ['phases', 'Phases'], ['lists', 'Lists']];
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 12,
      display: 'flex', gap: 4, padding: '0 14px',
      background: 'rgba(246,242,234,0.95)', backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${V2.line}`,
    }}>
      {tabs.map(([k, label]) => {
        const on = k === active;
        return (
          <div key={k} style={{
            position: 'relative', padding: '11px 10px 12px',
            fontSize: 13.5, fontWeight: on ? 700 : 500,
            color: on ? V2.moss : V2.inkMuted, letterSpacing: 0.1,
          }}>
            {label}
            {on && <div style={{
              position: 'absolute', left: 4, right: 4, bottom: -1, height: 2.5,
              borderRadius: 2, background: V2.moss,
            }}/>}
          </div>
        );
      })}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// Scope chips — whole-trip vs phase-scoped
// ──────────────────────────────────────────────────────────────
const TripScopeChip = ({ style = {} }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 9px 2px 6px', borderRadius: 999,
    background: V2.surface2, border: `1px solid ${V2.line}`,
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2, color: V2.inkSoft,
    ...style,
  }}>
    <StarMark size={11} color={V2.inkSoft} fill/>
    Whole trip
  </span>
);

// PhaseChip already exists (color, letter, label). Helper to render a scope:
const ScopeChip = ({ scope, style }) =>
  scope === 'trip'
    ? <TripScopeChip style={style}/>
    : <PhaseChip color={scope.color} letter={scope.letter} label={scope.label} style={style}/>;

// ──────────────────────────────────────────────────────────────
// Progress expressions
// ──────────────────────────────────────────────────────────────
const ProgressFraction = ({ done, total, size = 13 }) => (
  <span style={{
    fontFamily: 'var(--mono)', fontSize: size, fontWeight: 600,
    color: done === total && total > 0 ? V2.moss : V2.ink,
    fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
  }}>
    {done}<span style={{ color: V2.inkMuted }}>/{total}</span>
  </span>
);

const ProgressBar = ({ done, total, height = 4, color = V2.moss }) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ height, borderRadius: height, background: V2.surface2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: height }}/>
    </div>
  );
};

// Segmented bar — one tick per task; reads as "objects to complete"
const ProgressSegments = ({ done, total, color = V2.moss, gap = 3, h = 6 }) => (
  <div style={{ display: 'flex', gap, width: '100%' }}>
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} style={{
        flex: 1, height: h, borderRadius: 2,
        background: i < done ? color : V2.surface2,
        border: i < done ? 'none' : `1px solid ${V2.line}`,
      }}/>
    ))}
  </div>
);

const ProgressDonut = ({ done, total, size = 34, stroke = 4, color = V2.moss }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={V2.surface2} strokeWidth={stroke}/>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"/>
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: size * 0.26, fontWeight: 600, color: V2.inkSoft,
        fontVariantNumeric: 'tabular-nums',
      }}>{done}</span>
    </span>
  );
};

// ──────────────────────────────────────────────────────────────
// "Auto" glyph + chip — signals system-maintained smart list
// ──────────────────────────────────────────────────────────────
const AutoChip = ({ style = {} }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px 2px 6px', borderRadius: 999,
    background: V2.goldTint, border: `1px solid ${V2.gold}`,
    color: '#8A6A1E', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
    ...style,
  }}>
    <Sparkle size={9} color={V2.gold}/>
    Auto
  </span>
);

// ──────────────────────────────────────────────────────────────
// Checkbox — circular (moss) and square (ledger) variants
// ──────────────────────────────────────────────────────────────
const CheckMark = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CircleBox = ({ checked, size = 22 }) => (
  <span style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: checked ? V2.moss : V2.surface,
    border: `1.5px solid ${checked ? V2.moss : V2.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .15s, border-color .15s',
  }}>{checked && <CheckMark size={size * 0.52}/>}</span>
);

const SquareBox = ({ checked, size = 20 }) => (
  <span style={{
    width: size, height: size, borderRadius: 5, flexShrink: 0,
    background: checked ? V2.moss : V2.surface,
    border: `1.5px solid ${checked ? V2.moss : V2.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .15s, border-color .15s',
  }}>{checked && <CheckMark size={size * 0.55}/>}</span>
);

// ──────────────────────────────────────────────────────────────
// Task row — checkbox + title + optional single assignee.
// Tapping toggles. `box` picks the checkbox style. `overflow` shows the
// ⋯ assign affordance. Checked → strikethrough + dimmed.
// ──────────────────────────────────────────────────────────────
const TaskRow = ({ task, box = 'circle', overflow = false, divider = true, pad = '11px 4px' }) => {
  const [done, setDone] = React.useState(!!task.done);
  const Box = box === 'square' ? SquareBox : CircleBox;
  return (
    <div onClick={() => setDone(d => !d)} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: pad,
      borderBottom: divider ? `1px solid ${V2.line}` : 'none',
      cursor: 'pointer', userSelect: 'none',
    }}>
      <Box checked={done}/>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.3,
        color: done ? V2.inkMuted : V2.ink,
        textDecoration: done ? 'line-through' : 'none',
        textDecorationColor: 'rgba(107,102,92,0.5)',
      }}>{task.t}</span>
      {overflow && (
        <span style={{ color: V2.inkMuted, padding: '0 2px', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="4.5" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="10" cy="15.5" r="1.4"/>
          </svg>
        </span>
      )}
      {task.who
        ? <Avatar initial={task.who} size={24} style={{ opacity: done ? 0.45 : 1 }}/>
        : <span style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            border: `1.5px dashed ${V2.line}`,
          }}/>}
    </div>
  );
};

// Inline "Add task" row
const AddTaskRow = ({ label = 'Add task', box = 'circle' }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px',
    color: V2.inkMuted, cursor: 'pointer',
  }}>
    <span style={{
      width: box === 'square' ? 20 : 22, height: box === 'square' ? 20 : 22,
      borderRadius: box === 'square' ? 5 : '50%',
      border: `1.5px dashed ${V2.moss}`, color: V2.moss,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
    </span>
    <span style={{ fontSize: 14, fontWeight: 600, color: V2.moss }}>{label}</span>
  </div>
);

// Type glyph in a small tinted tile — for smart-list rows
const TypeTile = ({ type, size = 30 }) => (
  <span style={{
    width: size, height: size, borderRadius: 8, flexShrink: 0,
    background: CatTint({ type }),
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <CatGlyph type={type} size={size * 0.54}/>
  </span>
);

// ──────────────────────────────────────────────────────────────
// Sample data
// ──────────────────────────────────────────────────────────────
const SEV = { letter: 'S', label: 'Seville', color: V2.clay };
const BCN = { letter: 'B', label: 'Barcelona', color: V2.gold };
const MAD = { letter: 'M', label: 'Madrid', color: V2.moss };

const CHECKLISTS = [
  { id: 'pack', title: 'Packing',        scope: 'trip', done: 3, total: 12, who: ['S', 'A', 'J', 'M'] },
  { id: 'fly',  title: 'Before we fly',  scope: 'trip', done: 7, total: 9,  who: ['S', 'A'] },
  { id: 'sev',  title: 'Seville to-dos', scope: SEV,    done: 2, total: 6,  who: ['A', 'J'] },
  { id: 'bcn',  title: 'Barcelona musts',scope: BCN,    done: 0, total: 5,  who: ['S', 'M'] },
];

const SMART = {
  title: 'Booking',
  left: 5,
  preview: ['lodging', 'flight', 'transport'],
};

const SMART_ROWS = [
  { type: 'lodging',   title: 'Hotel Alfonso XIII', meta: 'Seville · Jun 18–22 · 4 nights' },
  { type: 'flight',    title: 'Madrid → home (return)', meta: 'Jun 26 · 2 seats unbooked' },
  { type: 'lodging',   title: 'Casa Lola', meta: 'Madrid · Jun 21–26 · held, not paid' },
  { type: 'transport', title: 'AVE Seville → Madrid', meta: 'Jun 21 · 4 seats' },
  { type: 'activity',  title: 'Alhambra timed entry', meta: 'Granada day-trip · sells out' },
];

// Packing — 12 tasks, 3 done
const PACKING = [
  { t: 'Passports + visas',        who: 'S', done: true },
  { t: 'Travel insurance cards',   who: 'A', done: true },
  { t: 'EU power adapters',        who: 'J', done: true },
  { t: 'Sunscreen SPF 50',         who: null, done: false },
  { t: 'Comfortable walking shoes',who: 'S', done: false },
  { t: 'Swimsuits',                who: null, done: false },
  { t: 'Refillable water bottles', who: 'M', done: false },
  { t: 'Meds + small first-aid',   who: 'A', done: false },
  { t: 'Light rain layer',         who: null, done: false },
  { t: 'Portable charger',         who: 'J', done: false },
  { t: 'Euros for cash-only bars', who: 'S', done: false },
  { t: 'Downloaded offline maps',  who: null, done: false },
];

Object.assign(window, {
  MEMBERS, Avatar, AvatarStack, SubTabs, TripScopeChip, ScopeChip,
  ProgressFraction, ProgressBar, ProgressSegments, ProgressDonut,
  AutoChip, CircleBox, SquareBox, TaskRow, AddTaskRow, TypeTile, CheckMark,
  SEV, BCN, MAD, CHECKLISTS, SMART, SMART_ROWS, PACKING,
});
