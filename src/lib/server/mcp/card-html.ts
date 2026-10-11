// #502 — MCP Apps view (text/html;profile=mcp-app). Hand-rolled
// postMessage JSON-RPC (ui/initialize → tool-result) instead of inlining the
// 400 KB ext-apps bundle. Renders structuredContent { heading, cards[] }.
export const CARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--paper:#f6f2ea;--surface:#fff;--ink:#1c1b18;--muted:#67625a;--line:#e2dcd0;--moss:#3e5a3a;--tint:#e8efe3}
:root[data-theme=dark]{--paper:#1c1b18;--surface:#26251f;--ink:#f1ece2;--muted:#a9a397;--line:#3a382f;--moss:#9cb894;--tint:#2d3a2a}
*{box-sizing:border-box}body{margin:0;padding:8px;background:transparent;color:var(--ink);font:15px/1.35 -apple-system,system-ui,sans-serif}
h2{font:600 13px/1.2 system-ui;letter-spacing:.04em;text-transform:uppercase;color:var(--moss);margin:4px 4px 8px}
.c{display:flex;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.e{font-size:20px;line-height:1.2}.t{font-weight:600}.tag{font-size:11px;font-weight:600;color:var(--moss);background:var(--tint);border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:2px}
.l{color:var(--muted);font-size:13px;margin-top:2px;white-space:pre-wrap}.empty{color:var(--muted);padding:8px}
</style></head><body><div id="root" class="empty">Loading…</div>
<script>
(function(){
  var id=0, waiting={};
  function send(msg){ window.parent.postMessage(Object.assign({jsonrpc:'2.0'},msg),'*'); }
  function request(method,params){ var i=++id; send({id:i,method:method,params:params}); return new Promise(function(r){waiting[i]=r;}); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function size(){ send({method:'ui/notifications/size-changed',params:{height:document.documentElement.scrollHeight}}); }
  function theme(ctx){ if(ctx&&ctx.theme) document.documentElement.dataset.theme=ctx.theme; }
  function render(r){
    var d=(r&&r.structuredContent)||{}; var cards=d.cards||[]; var root=document.getElementById('root');
    root.className='';
    root.innerHTML=(d.heading?'<h2>'+esc(d.heading)+'</h2>':'')+(cards.length?cards.map(function(c){
      return '<div class="c"><div class="e">'+esc(c.emoji)+'</div><div><div class="t">'+esc(c.title)+(c.tag?'<span class="tag">'+esc(c.tag)+'</span>':'')+'</div>'+
        (c.lines||[]).map(function(l){return '<div class="l">'+esc(l)+'</div>';}).join('')+'</div></div>';
    }).join(''):'<div class="empty">'+esc(d.note||'Nothing here.')+'</div>');
    size();
  }
  window.addEventListener('message',function(ev){
    var m=ev.data; if(!m||m.jsonrpc!=='2.0') return;
    if(m.id!=null && waiting[m.id]){ waiting[m.id](m.result); delete waiting[m.id]; return; }
    if(m.method==='ui/notifications/tool-result') render(m.params);
    else if(m.method==='ui/notifications/host-context-changed') theme(m.params);
    else if(m.method==='ui/resource-teardown' && m.id!=null) send({id:m.id,result:{}});
  });
  request('ui/initialize',{appInfo:{name:'waypoint-cards',version:'3.1.0'},appCapabilities:{},protocolVersion:'2026-01-26'})
    .then(function(res){ theme(res&&res.hostContext); send({method:'ui/notifications/initialized',params:{}}); size(); });
})();
</script></body></html>`;
