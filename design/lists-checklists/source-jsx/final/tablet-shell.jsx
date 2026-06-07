// === Lists surface · FINAL PASS · Tablet shell (SideRail + content) ===
// DS reflow: at tablet width the BottomNav becomes a left SideRail; content
// sits in a centered max-width column; overlays are centered modals (not sheets).

const RailItem = ({ icon, label, active }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
    position: 'relative', cursor: 'pointer',
    background: active ? V2.mossTint : 'transparent',
    color: active ? V2.moss : V2.inkSoft, fontWeight: active ? 700 : 500,
  }}>
    {active && <span style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderRadius: 3, background: V2.moss }}/>}
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>{NavIconsV3[icon]}</svg>
    <span style={{ fontSize: 14 }}>{label}</span>
  </div>
);

const SideRail = ({ active = 'itinerary' }) => (
  <div style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${V2.line}`, background: V2.paper, padding: '22px 14px', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px', marginBottom: 22 }}>
      <StarMark size={22} color={V2.ink} fill/>
      <span style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 19, letterSpacing: '-0.02em', color: V2.ink }}>Waypoint</span>
    </div>

    <div style={{ background: V2.surface, border: `1px solid ${V2.line}`, borderRadius: 12, padding: '11px 12px', marginBottom: 18, boxShadow: Elev.card }}>
      <div style={{ fontSize: 9.5, letterSpacing: 1.2, color: V2.inkMuted, fontWeight: 600, textTransform: 'uppercase' }}>Current trip</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: V2.ink, marginTop: 3 }}>Spain '25</div>
      <div style={{ fontSize: 11, color: V2.inkMuted, marginTop: 1, fontFamily: 'var(--mono)' }}>Jun 12 – 26 · 5 travelers</div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <RailItem icon="itinerary" label="Itinerary" active={active === 'itinerary'}/>
      <RailItem icon="money" label="Money" active={active === 'money'}/>
      <RailItem icon="activity" label="Activity" active={active === 'activity'}/>
      <RailItem icon="vault" label="Vault" active={active === 'vault'}/>
      <RailItem icon="more" label="More" active={active === 'more'}/>
    </div>

    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
      <Avatar initial="S" size={30}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: V2.ink }}>Scott</div>
        <div style={{ fontSize: 10.5, color: V2.inkMuted }}>Organizer</div>
      </div>
    </div>
  </div>
);

// Wide sub-tabs for tablet — left-aligned row
const SubTabsWide = ({ active = 'lists' }) => {
  const tabs = [['overview', 'Overview'], ['phases', 'Phases'], ['lists', 'Lists']];
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${V2.line}`, padding: '0 4px' }}>
      {tabs.map(([k, label]) => {
        const on = k === active;
        return (
          <div key={k} style={{ position: 'relative', padding: '12px 14px 14px', fontSize: 14.5, fontWeight: on ? 700 : 500, color: on ? V2.moss : V2.inkMuted, cursor: 'pointer' }}>
            {label}
            {on && <div style={{ position: 'absolute', left: 6, right: 6, bottom: -1, height: 2.5, borderRadius: 2, background: V2.moss }}/>}
          </div>
        );
      })}
    </div>
  );
};

const BackChip = ({ label }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: V2.inkSoft, cursor: 'pointer' }}>
    <span style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${V2.line}`, background: V2.surface, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
  </div>
);

// Tablet device frame (no notch) with a label below
const TabletFrame = ({ children, w = 900, h = 1060, label, sub }) => (
  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
    <div style={{ width: w, height: h, borderRadius: 30, background: '#0a0a08', padding: 11, boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 60px rgba(28,27,24,0.22)' }}>
      <div style={{ width: '100%', height: '100%', background: V2.paper, borderRadius: 20, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
    {label && (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 500, color: V2.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: V2.inkMuted, marginTop: 2, fontFamily: 'var(--mono)' }}>{sub}</div>}
      </div>
    )}
  </div>
);

// Tablet shell: SideRail + main column. `header` is the top bar content;
// `subtab` (optional) renders SubTabsWide; content centers at contentMax.
const TabletShell = ({ active = 'itinerary', subtab, header, right, children, contentMax = 600, overlay }) => (
  <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
    <SideRail active={active}/>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ padding: '20px 28px 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, borderBottom: subtab ? 'none' : `1px solid ${V2.line}`, background: 'rgba(246,242,234,0.95)' }}>
        <div style={{ flexShrink: 0 }}>{header}</div>
        {right}
      </div>
      {subtab && <div style={{ padding: '0 24px' }}><SubTabsWide active={subtab}/></div>}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: contentMax, margin: '0 auto', padding: '24px 24px 40px' }}>{children}</div>
      </div>
      {overlay}
    </div>
  </div>
);

const TripTitleHeader = () => (
  <>
    <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 600, color: V2.ink, letterSpacing: -0.4, lineHeight: 1.05, whiteSpace: 'nowrap' }}>Spain '25</div>
    <div style={{ fontSize: 12.5, color: V2.inkMuted, marginTop: 2 }}>Itinerary</div>
  </>
);

const PageTitleHeader = ({ back, title, subtitle }) => (
  <div>
    {back && <div style={{ marginBottom: 10 }}><BackChip label={back}/></div>}
    <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 600, color: V2.ink, letterSpacing: -0.4, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12.5, color: V2.inkMuted, marginTop: 2 }}>{subtitle}</div>}
  </div>
);

const NewListBtn = () => (
  <Btn variant="moss" size="md" icon={<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 2.5v9M2.5 7h9" stroke="#fff" strokeWidth="1.9" strokeLinecap="round"/></svg>}>New list</Btn>
);

Object.assign(window, {
  RailItem, SideRail, SubTabsWide, BackChip, TabletFrame, TabletShell,
  TripTitleHeader, PageTitleHeader, NewListBtn,
});
