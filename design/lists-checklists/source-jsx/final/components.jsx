// === Lists surface · FINAL PASS components (Direction B + C's strikethrough/hide-done) ===
// Reuses atoms/data from lists/components.jsx and the v2/v3 shells.
// Ledger aesthetic: square checkboxes, ruled rows, monogram dots, mono numerals.
// Checked rows get strikethrough + dim IN PLACE; a Hide-done toggle and an
// "In order / Done last" sort toggle demonstrate both arrangements.

// ──────────────────────────────────────────────────────────────
// Small segmented control + toggle pill
// ──────────────────────────────────────────────────────────────
const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'inline-flex', padding: 2, borderRadius: 999, background: V2.surface2, border: `1px solid ${V2.line}` }}>
    {options.map(([k, label]) => {
      const on = k === value;
      return (
        <button key={k} onClick={() => onChange(k)} style={{
          border: 'none', cursor: 'pointer', padding: '5px 11px', borderRadius: 999,
          background: on ? V2.surface : 'transparent',
          boxShadow: on ? '0 1px 2px rgba(28,27,24,0.08)' : 'none',
          color: on ? V2.ink : V2.inkMuted, fontSize: 11.5, fontWeight: 600,
          fontFamily: 'var(--ui)', letterSpacing: 0.1, transition: 'background .15s, color .15s',
        }}>{label}</button>
      );
    })}
  </div>
);

const TogglePill = ({ on, onClick, children }) => (
  <button onClick={onClick} style={{
    display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    padding: '5px 11px 5px 9px', borderRadius: 999,
    border: `1px solid ${on ? V2.moss : V2.line}`,
    background: on ? V2.mossTint : V2.surface,
    color: on ? V2.moss : V2.inkSoft, fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--ui)',
    transition: 'background .15s, border-color .15s, color .15s',
  }}>
    <span style={{
      width: 13, height: 13, borderRadius: 4, flexShrink: 0,
      background: on ? V2.moss : V2.surface, border: `1.5px solid ${on ? V2.moss : V2.line}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{on && <CheckMark size={8}/>}</span>
    {children}
  </button>
);

// ──────────────────────────────────────────────────────────────
// One ledger task row (controlled). Strikethrough + dim when done.
// ──────────────────────────────────────────────────────────────
const TaskLedgerRow = ({ task, checked, onToggle, onOverflow, divider = true, assignable = true }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0',
    borderBottom: divider ? `1px solid ${V2.line}` : 'none',
    userSelect: 'none',
  }}>
    <span onClick={onToggle} style={{ cursor: 'pointer', display: 'inline-flex', flexShrink: 0 }}>
      <SquareBox checked={checked} size={21}/>
    </span>
    <span onClick={onToggle} style={{
      flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, cursor: 'pointer',
      color: checked ? V2.inkMuted : V2.ink,
      textDecoration: checked ? 'line-through' : 'none',
      textDecorationColor: 'rgba(107,102,92,0.5)',
    }}>{task.t}</span>
    {assignable && (
      <button onClick={onOverflow} style={{
        border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px', color: V2.inkMuted, flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4.5" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="10" cy="15.5" r="1.4"/>
        </svg>
      </button>
    )}
    {assignable && (task.who
      ? <Avatar initial={task.who} size={24} style={{ opacity: checked ? 0.4 : 1, flexShrink: 0 }}/>
      : <span style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px dashed ${V2.line}`, flexShrink: 0 }}/>)}
  </div>
);

// ──────────────────────────────────────────────────────────────
// Checklist body — manual lists + item-embedded lists.
// Holds done/hideDone/sort state. showControls toggles the controls row.
// ──────────────────────────────────────────────────────────────
const ChecklistBody = ({ tasks, showControls = true, assignable = true, onAssign, label }) => {
  const [done, setDone] = React.useState(() => tasks.map(t => !!t.done));
  const [hideDone, setHideDone] = React.useState(false);
  const [doneLast, setDoneLast] = React.useState(false);
  const total = tasks.length;
  const doneCount = done.filter(Boolean).length;

  let idxs = tasks.map((_, i) => i);
  if (doneLast) idxs = [...idxs.filter(i => !done[i]), ...idxs.filter(i => done[i])];
  const visible = hideDone ? idxs.filter(i => !done[i]) : idxs;

  return (
    <>
      {showControls && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <Segmented options={[['order', 'In order'], ['last', 'Done last']]} value={doneLast ? 'last' : 'order'} onChange={k => setDoneLast(k === 'last')}/>
          <TogglePill on={hideDone} onClick={() => setHideDone(h => !h)}>Hide done</TogglePill>
        </div>
      )}
      <Card radius={14} padding={0} elev="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '2px 15px' }}>
          {visible.map((i, k) => (
            <TaskLedgerRow key={tasks[i].t} task={tasks[i]} checked={done[i]} assignable={assignable}
              onToggle={() => setDone(d => d.map((v, j) => j === i ? !v : v))}
              onOverflow={() => onAssign && onAssign(tasks[i])}
              divider={k < visible.length - 1}/>
          ))}
        </div>
        <div style={{ padding: '4px 15px', borderTop: `1px solid ${V2.line}` }}>
          <AddTaskRow box="square" label={label || 'Add task'}/>
        </div>
      </Card>
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// Lists index — ledger rows (refined)
// ──────────────────────────────────────────────────────────────
const IndexMono = ({ scope, size = 28 }) => {
  if (scope === 'trip') return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: V2.surface2, border: `1px solid ${V2.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <StarMark size={size * 0.5} color={V2.inkSoft} fill/>
    </span>
  );
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: scope.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{scope.letter}</span>
  );
};

const IndexRow = ({ cl, last, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', borderBottom: last ? 'none' : `1px solid ${V2.line}`, cursor: 'pointer' }}>
    <IndexMono scope={cl.scope}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: V2.ink, lineHeight: 1.2 }}>{cl.title}</div>
      <div style={{ fontSize: 11, color: V2.inkMuted, marginTop: 2, letterSpacing: 0.2 }}>{cl.scope === 'trip' ? 'Whole trip' : cl.scope.label}</div>
    </div>
    <AvatarStack who={cl.who} size={19} max={3}/>
    <ProgressDonut done={cl.done} total={cl.total} size={33} stroke={3.5}/>
  </div>
);

const IndexSmartRow = ({ onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', background: 'rgba(200,155,60,0.07)', borderBottom: `1px solid ${V2.line}`, borderLeft: `3px solid ${V2.gold}`, cursor: 'pointer' }}>
    <span style={{ width: 28, height: 28, borderRadius: '50%', background: V2.goldTint, border: `1px solid ${V2.gold}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Sparkle size={13} color={V2.gold}/>
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: V2.ink }}>{SMART.title}</span>
        <AutoChip/>
      </div>
      <div style={{ fontSize: 11, color: '#8A6A1E', marginTop: 2 }}>Auto · from your itinerary</div>
    </div>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#8A6A1E', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{SMART.left} left</span>
  </div>
);

const NewListRow = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', marginTop: 10, borderRadius: 14, border: `1.5px dashed ${V2.line}`, color: V2.moss, cursor: 'pointer' }}>
    <span style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px dashed ${V2.moss}`, color: V2.moss, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2.5v9M2.5 7h9" stroke={V2.moss} strokeWidth="1.8" strokeLinecap="round"/></svg>
    </span>
    <span style={{ fontSize: 13.5, fontWeight: 600 }}>New list</span>
  </div>
);

const ListsIndexBody = ({ onOpen, onSmart }) => (
  <>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 2px 12px' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: V2.ink, letterSpacing: -0.3 }}>Lists</div>
      <span style={{ fontSize: 11.5, color: V2.inkMuted, fontWeight: 500 }}>5 lists</span>
    </div>
    <Card radius={14} padding={0} elev="card" style={{ overflow: 'hidden' }}>
      <IndexSmartRow onClick={onSmart}/>
      {CHECKLISTS.map((cl, i) => <IndexRow key={cl.id} cl={cl} last={i === CHECKLISTS.length - 1} onClick={onOpen}/>)}
    </Card>
    <NewListRow/>
  </>
);

// ──────────────────────────────────────────────────────────────
// Booking Smart List — read-only lens over the itinerary.
// Each row links to its planned item; checking marks the item booked and
// the row leaves the list. No assignee, no add-row, no rename.
// ──────────────────────────────────────────────────────────────
const SmartLensBanner = () => (
  <div style={{ display: 'flex', gap: 11, padding: '12px 14px', borderRadius: 12, background: 'rgba(200,155,60,0.09)', border: `1px solid ${V2.gold}`, marginBottom: 14 }}>
    <span style={{ flexShrink: 0, marginTop: 1 }}><Sparkle size={15} color="#8A6A1E"/></span>
    <div style={{ fontSize: 12, color: V2.inkSoft, lineHeight: 1.45 }}>
      <strong style={{ color: '#8A6A1E', fontWeight: 700 }}>A lens over your itinerary.</strong> These rows are planned items
      that still need a reservation. Check one to mark it <strong style={{ color: V2.ink }}>booked</strong> — it then leaves this list.
    </div>
  </div>
);

const SmartRow = ({ row, booked, onBook, leaving, divider }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0',
    borderBottom: divider ? `1px solid ${V2.line}` : 'none',
    opacity: leaving ? 0.4 : 1, transition: 'opacity .3s',
  }}>
    <span onClick={onBook} style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex' }}>
      <SquareBox checked={booked} size={21}/>
    </span>
    <TypeTile type={row.type} size={34}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: booked ? V2.inkMuted : V2.ink, lineHeight: 1.25, textDecoration: booked ? 'line-through' : 'none' }}>{row.title}</div>
      <div style={{ fontSize: 11, color: V2.inkMuted, marginTop: 2, fontFamily: 'var(--mono)', letterSpacing: 0.1 }}>{row.meta}</div>
    </div>
    {booked
      ? <Pill variant="booked" size="sm">Booked</Pill>
      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: V2.sky, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
          Open <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 5l5 5-5 5" stroke={V2.sky} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>}
  </div>
);

const SmartListBody = () => {
  const [booked, setBooked] = React.useState(() => SMART_ROWS.map(() => false));
  const [leaving, setLeaving] = React.useState(() => SMART_ROWS.map(() => false));
  const [gone, setGone] = React.useState(() => SMART_ROWS.map(() => false));
  const book = (i) => {
    setBooked(b => b.map((v, j) => j === i ? true : v));
    setLeaving(l => l.map((v, j) => j === i ? true : v));
    setTimeout(() => setGone(g => g.map((v, j) => j === i ? true : v)), 650);
  };
  const live = SMART_ROWS.map((_, i) => i).filter(i => !gone[i]);
  return (
    <>
      <SmartLensBanner/>
      <Card radius={14} padding={0} elev="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '2px 15px' }}>
          {live.map((i, k) => (
            <SmartRow key={SMART_ROWS[i].title} row={SMART_ROWS[i]} booked={booked[i]} leaving={leaving[i]}
              onBook={() => book(i)} divider={k < live.length - 1}/>
          ))}
        </div>
      </Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '0 4px', color: V2.inkMuted }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3a7 7 0 1 0 7 7M10 3v0a7 7 0 0 1 7 7M14 3v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span style={{ fontSize: 11.5, fontStyle: 'italic', fontFamily: 'var(--display)' }}>Updates automatically as you plan. Nothing to add by hand.</span>
      </div>
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// Assign-member picker — bottom sheet (mobile) / centered modal (tablet)
// ──────────────────────────────────────────────────────────────
const AssignContent = ({ task, current, onPick, onClose }) => {
  const [sel, setSel] = React.useState(current || (task && task.who) || null);
  const keys = Object.keys(MEMBERS);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 600, color: V2.ink }}>Assign a member</div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: V2.inkMuted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
      </div>
      <div style={{ fontSize: 12.5, color: V2.inkMuted, marginBottom: 14 }}>{task ? task.t : 'Task'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {keys.map(k => {
          const on = sel === k;
          return (
            <button key={k} onClick={() => setSel(k)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 10,
              border: 'none', cursor: 'pointer', textAlign: 'left',
              background: on ? V2.mossTint : 'transparent', fontFamily: 'var(--ui)',
            }}>
              <Avatar initial={k} size={32}/>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: V2.ink }}>{MEMBERS[k].name}</span>
              <span style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${on ? V2.moss : V2.line}`, background: on ? V2.moss : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <CheckMark size={10}/>}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <div onClick={onClose} style={{ flex: 1 }}><Btn variant="soft" block>Unassign</Btn></div>
        <div onClick={() => { onPick && onPick(sel); onClose && onClose(); }} style={{ flex: 1 }}><Btn variant="moss" block>Done</Btn></div>
      </div>
    </>
  );
};

const BottomSheet = ({ children, onClose }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(28,27,24,0.32)', backdropFilter: 'blur(2px)' }}/>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: V2.surface, borderRadius: '18px 18px 0 0', boxShadow: Elev.overlay, padding: '14px 18px 28px' }}>
      <div style={{ width: 38, height: 4, borderRadius: 3, background: V2.line, margin: '0 auto 14px' }}/>
      {children}
    </div>
  </div>
);

const CenteredModal = ({ children, onClose }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(28,27,24,0.32)', backdropFilter: 'blur(3px)' }}/>
    <div style={{ position: 'relative', width: 380, maxWidth: '90%', background: V2.surface, borderRadius: 16, boxShadow: Elev.modal, padding: '20px 22px 22px' }}>
      {children}
    </div>
  </div>
);

Object.assign(window, {
  Segmented, TogglePill, TaskLedgerRow, ChecklistBody,
  IndexMono, IndexRow, IndexSmartRow, NewListRow, ListsIndexBody,
  SmartLensBanner, SmartRow, SmartListBody,
  AssignContent, BottomSheet, CenteredModal,
});
