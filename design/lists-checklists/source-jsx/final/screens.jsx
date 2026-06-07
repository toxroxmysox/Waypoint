// === Lists surface · FINAL PASS · screens (5 mobile @375 + 5 tablet) ===

const MobileShell = ({ nav, subtabs, children, bottom, overlay, bodyPad = '14px 14px 104px' }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', background: V2.paper }}>
    {nav}{subtabs}
    <div style={{ flex: 1, overflow: 'auto' }}><div style={{ padding: bodyPad }}>{children}</div></div>
    {bottom}{overlay}
  </div>
);

// Shared stat strip for the Packing detail
const PackingStat = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, padding: '0 2px' }}>
    <ProgressDonut done={3} total={12} size={46} stroke={5}/>
    <div style={{ flex: 1 }}>
      <ScopeChip scope="trip"/>
      <div style={{ fontSize: 12.5, color: V2.inkMuted, marginTop: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: V2.ink }}>9</span> left to pack
      </div>
    </div>
  </div>
);

// ══════════════════════════ MOBILE @375 ══════════════════════════
const M_Index = () => (
  <Phone w={375} h={760} label="1 · Lists index" sub="375px">
    <MobileShell nav={<NavBar title="Spain '25" subtitle="Jun 12 – 26 · 5 travelers" back/>} subtabs={<SubTabs active="lists"/>} bottom={<PlanningBottomNav active="itinerary"/>}>
      <ListsIndexBody/>
    </MobileShell>
  </Phone>
);

const M_Detail = () => {
  const [assign, setAssign] = React.useState(null);
  return (
    <Phone w={375} h={760} label="2 · Checklist detail" sub="manual · strikethrough + hide-done">
      <MobileShell
        nav={<NavBar title="Packing" subtitle="Whole trip" back/>}
        bottom={<PlanningBottomNav active="itinerary"/>}
        overlay={assign && <BottomSheet onClose={() => setAssign(null)}><AssignContent task={assign} onClose={() => setAssign(null)}/></BottomSheet>}>
        <PackingStat/>
        <ChecklistBody tasks={PACKING} showControls assignable onAssign={setAssign}/>
      </MobileShell>
    </Phone>
  );
};

const M_Smart = () => (
  <Phone w={375} h={760} label="3 · Booking smart list" sub="projected · read-only">
    <MobileShell nav={<NavBar title="Booking" subtitle="Auto · read-only" back/>} bottom={<PlanningBottomNav active="itinerary"/>}>
      <SmartListBody/>
    </MobileShell>
  </Phone>
);

const M_Overview = () => (
  <Phone w={375} h={760} label="4 · Overview preview" sub="lists under each phase">
    <MobileShell nav={<NavBar title="Spain '25" subtitle="Jun 12 – 26 · 5 travelers" back/>} subtabs={<SubTabs active="overview"/>} bottom={<PlanningBottomNav active="itinerary"/>}>
      <OverviewBody/>
    </MobileShell>
  </Phone>
);

const M_Item = () => {
  const [assign, setAssign] = React.useState(null);
  return (
    <Phone w={375} h={760} label="5 · Inline item checklist" sub="the grocery case">
      <MobileShell
        nav={<NavBar title="Grocery run" subtitle="Day 8 · 3:00 PM" back/>}
        bottom={<PlanningBottomNav active="itinerary"/>}
        overlay={assign && <BottomSheet onClose={() => setAssign(null)}><AssignContent task={assign} onClose={() => setAssign(null)}/></BottomSheet>}>
        <ItemBody onAssign={setAssign}/>
      </MobileShell>
    </Phone>
  );
};

// ══════════════════════════ TABLET ══════════════════════════
const T_Index = () => (
  <TabletFrame w={880} h={1060} label="1 · Lists index" sub="tablet · SideRail">
    <TabletShell active="itinerary" subtab="lists" header={<TripTitleHeader/>} right={<NewListBtn/>} contentMax={620}>
      <ListsIndexBody/>
    </TabletShell>
  </TabletFrame>
);

const T_Detail = () => (
  <TabletFrame w={880} h={1060} label="2 · Checklist detail" sub="tablet · assign = centered modal">
    <TabletShell active="itinerary" header={<PageTitleHeader back="Lists" title="Packing" subtitle="Whole trip"/>} contentMax={600}
      overlay={<CenteredModal onClose={() => {}}><AssignContent task={PACKING[4]} onClose={() => {}}/></CenteredModal>}>
      <PackingStat/>
      <ChecklistBody tasks={PACKING} showControls assignable onAssign={() => {}}/>
    </TabletShell>
  </TabletFrame>
);

const T_Smart = () => (
  <TabletFrame w={880} h={1060} label="3 · Booking smart list" sub="tablet · the lens">
    <TabletShell active="itinerary" header={<PageTitleHeader back="Lists" title="Booking" subtitle="Auto · read-only"/>} contentMax={600}>
      <SmartListBody/>
    </TabletShell>
  </TabletFrame>
);

const T_Overview = () => (
  <TabletFrame w={880} h={1060} label="4 · Overview preview" sub="tablet">
    <TabletShell active="itinerary" subtab="overview" header={<TripTitleHeader/>} contentMax={640}>
      <OverviewBody/>
    </TabletShell>
  </TabletFrame>
);

const T_Item = () => (
  <TabletFrame w={880} h={1060} label="5 · Inline item checklist" sub="tablet">
    <TabletShell active="itinerary" header={<PageTitleHeader back="Day 8 · Thu Jun 19" title="Grocery run" subtitle="3:00 – 3:45 PM"/>} contentMax={600}>
      <ItemBody onAssign={() => {}}/>
    </TabletShell>
  </TabletFrame>
);

Object.assign(window, {
  MobileShell, PackingStat,
  M_Index, M_Detail, M_Smart, M_Overview, M_Item,
  T_Index, T_Detail, T_Smart, T_Overview, T_Item,
});
