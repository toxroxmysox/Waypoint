// #502 — MCP Apps view (text/html;profile=mcp-app). Hand-rolled
// postMessage JSON-RPC (ui/initialize → tool-result) instead of inlining the
// 400 KB ext-apps bundle. Renders structuredContent { heading, cards[] }.
// #503 — a write preview adds per-card changes (old struck → new highlighted),
// the user's words, the outcome line, a before/after calendar for trip dates,
// and a Confirm button that calls commit_changes — only when the host says the
// view may call server tools (hostCapabilities.serverTools).
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
.r{font-size:13px;margin-top:2px}.r .f{color:var(--muted)}.r s{color:var(--muted)}.r mark{background:var(--tint);color:var(--ink);border-radius:4px;padding:0 3px}
.q{margin:4px 4px 6px;font-style:italic}.out{margin:0 4px 8px;font-weight:600;color:var(--moss)}
.cal{display:flex;gap:10px;flex-wrap:wrap;margin:0 4px 8px}.m{font-size:11px}.m b{display:block;margin-bottom:2px}.m table{border-collapse:collapse}
.m td{width:20px;height:18px;text-align:center;color:var(--muted)}.m td.b{background:var(--line)}.m td.a{background:var(--moss);color:var(--surface);border-radius:3px}
.btn{display:block;width:100%;margin:4px 0 8px;padding:10px;border:0;border-radius:10px;background:var(--moss);color:var(--surface);font:600 15px system-ui}.btn[disabled]{opacity:.5}
</style></head><body><div id="root" class="empty">Loading…</div>
<script>
(function(){
  var id=0, waiting={};
  function send(msg){ window.parent.postMessage(Object.assign({jsonrpc:'2.0'},msg),'*'); }
  function request(method,params){ var i=++id; send({id:i,method:method,params:params}); return new Promise(function(r){waiting[i]=r;}); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function size(){ send({method:'ui/notifications/size-changed',params:{height:document.documentElement.scrollHeight}}); }
  function theme(ctx){ if(ctx&&ctx.theme) document.documentElement.dataset.theme=ctx.theme; }
  var canCall=false;
  function rows(c){
    if(!c.changes) return (c.lines||[]).map(function(l){return '<div class="l">'+esc(l)+'</div>';}).join('');
    return c.changes.map(function(x){
      return '<div class="r"><span class="f">'+esc(x.field)+':</span> '+(x.from?'<s>'+esc(x.from)+'</s> → ':'')+'<mark>'+esc(x.to)+'</mark></div>';
    }).join('')+'<div class="l">'+esc((c.lines||[])[c.lines.length-1])+'</div>';
  }
  function utc(s){ var p=s.split('-'); return Date.UTC(+p[0],+p[1]-1,+p[2]); }
  function iso(t){ return new Date(t).toISOString().slice(0,10); }
  function cal(k){
    var b=k.before,a=k.after,lo=b[0]<a[0]?b[0]:a[0],hi=b[1]>a[1]?b[1]:a[1],out='',d=new Date(utc(lo.slice(0,7)+'-01')),n=0;
    while(iso(d.getTime()).slice(0,7)<=hi.slice(0,7) && n<3){
      var y=d.getUTCFullYear(),mo=d.getUTCMonth(),first=(new Date(Date.UTC(y,mo,1)).getUTCDay()+6)%7,len=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
      var h='<div class="m"><b>'+new Date(Date.UTC(y,mo,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})+'</b><table><tr>';
      for(var i=0;i<first;i++) h+='<td></td>';
      for(var day=1;day<=len;day++){
        var s=iso(Date.UTC(y,mo,day)),cls=(s>=a[0]&&s<=a[1])?'a':(s>=b[0]&&s<=b[1])?'b':'';
        h+='<td class="'+cls+'">'+day+'</td>'; if((first+day)%7===0) h+='</tr><tr>';
      }
      out+=h+'</tr></table></div>'; d=new Date(Date.UTC(y,mo+1,1)); n++;
    }
    return '<div class="cal">'+out+'</div>';
  }
  function render(r){
    var d=(r&&r.structuredContent)||{}; var cards=d.cards||[]; var p=d.proposal; var root=document.getElementById('root');
    root.className='';
    root.innerHTML=(d.heading?'<h2>'+esc(d.heading)+'</h2>':'')+(p&&p.calendar?cal(p.calendar):'')+(cards.length?cards.map(function(c){
      return '<div class="c"><div class="e">'+esc(c.emoji)+'</div><div><div class="t">'+esc(c.title)+(c.tag?'<span class="tag">'+esc(c.tag)+'</span>':'')+'</div>'+
        rows(c)+'</div></div>';
    }).join(''):'<div class="empty">'+esc(d.note||'Nothing here.')+'</div>')+
      (p?'<div class="q">“'+esc(p.quote)+'”</div><div class="out">'+esc(p.outcome)+'</div>'+(canCall?'<button class="btn" id="ok">Confirm</button>':''):'');
    var ok=document.getElementById('ok');
    if(ok) ok.onclick=function(){
      ok.disabled=true; ok.textContent='Saving…';
      request('tools/call',{name:'commit_changes',arguments:{proposal_id:p.id}}).then(function(res){
        if(res&&res.structuredContent) render(res); else { ok.textContent=(res&&res.content&&res.content[0]&&res.content[0].text)||'Could not save'; }
      });
    };
    size();
  }
  window.addEventListener('message',function(ev){
    var m=ev.data; if(!m||m.jsonrpc!=='2.0') return;
    if(m.id!=null && waiting[m.id]){ waiting[m.id](m.result); delete waiting[m.id]; return; }
    if(m.method==='ui/notifications/tool-result') render(m.params);
    else if(m.method==='ui/notifications/host-context-changed') theme(m.params);
    else if(m.method==='ui/resource-teardown' && m.id!=null) send({id:m.id,result:{}});
  });
  request('ui/initialize',{appInfo:{name:'waypoint-cards',version:'3.2.0'},appCapabilities:{},protocolVersion:'2026-01-26'})
    .then(function(res){ canCall=!!(res&&res.hostCapabilities&&res.hostCapabilities.serverTools); theme(res&&res.hostContext); send({method:'ui/notifications/initialized',params:{}}); size(); });
})();
</script></body></html>`;
