// The page's CSS: system fonts, colour tokens for light and dark, one column at phone width (the wide columns hide).

export const STYLE = `
:root{--bg:#f3f3f5;--card:#fff;--line:#e4e4e7;--text:#1d1d1f;--muted:#6e6e73;--accent:#fa2d48;--soft:#ececf0;--hover:#f6f6f8;
 --play:#fde7ea;--danger:#d70015;--ok:#1f9d55;--warn:#c27c0e}
@media (prefers-color-scheme:dark){:root{--bg:#1c1c1e;--card:#2c2c2e;--line:#3a3a3e;--text:#f5f5f7;--muted:#a1a1a6;--soft:#3a3a3e;
 --hover:#333336;--play:#4a2329;--danger:#ff453a;--ok:#32d74b;--warn:#ffd60a}}
*{box-sizing:border-box}[hidden]{display:none!important}
html{accent-color:var(--accent);color-scheme:light dark}
body{font:14px -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;margin:0;background:var(--bg);color:var(--text);padding-bottom:96px}
a{color:var(--accent)}
button,input{font:inherit;color:inherit}
button{background:var(--card);border:1px solid var(--line);border-radius:7px;padding:6px 12px;cursor:pointer}
button:hover:not(:disabled){background:var(--hover)}
button:disabled{opacity:.45;cursor:default}
button.danger{color:var(--danger);border-color:var(--danger)}
input[type=text],input[type=search],input[type=password]{background:var(--card);border:1px solid var(--line);border-radius:7px;padding:6px 10px;min-width:0}
.muted{color:var(--muted)}.err{color:var(--danger);margin:6px 0 0}
.top,main{max-width:1100px;margin:0 auto;padding:0 16px}
.top{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding-top:20px;padding-bottom:12px}
.who{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
h1{font-size:24px;margin:0;overflow-wrap:anywhere}h2{font-size:16px;margin:0 0 10px}
.state{display:flex;gap:8px;align-items:center;justify-self:end}
.badge{font-size:12px;border-radius:99px;padding:2px 9px;background:var(--soft)}
.badge.on{background:var(--play);color:var(--accent)}
.conn{display:flex;align-items:center;gap:6px;font-size:12px}.conn i{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.conn.ok i{background:var(--ok)}.conn.warn i{background:var(--warn)}.conn.bad i{background:var(--danger)}
.lib{grid-column:1/-1;margin:0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.storage{grid-column:1/-1;display:flex;align-items:center;gap:4px 10px;flex-wrap:wrap}.storage .bar{min-width:200px}
.bar{flex:1;height:8px;background:var(--soft);border-radius:4px;overflow:hidden}.bar div{height:100%;background:var(--accent)}
.counts{grid-column:1/-1;display:flex;gap:16px;flex-wrap:wrap}.counts b{font-size:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:16px 0}
.token{max-width:460px;margin:16px auto}.token label{display:block;margin-bottom:8px}
.row{display:flex;gap:8px;margin-top:8px}.row input{flex:1}
.tabs{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
.tab{border-radius:99px}.tab.on{background:var(--text);color:var(--bg);border-color:var(--text)}
#search{flex:1;min-width:160px;margin-left:auto}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--play);border-radius:99px;padding:2px 4px 2px 12px;margin-bottom:8px}
.chip button{border:0;background:none;padding:0 8px;font-size:16px}
.tools{display:flex;justify-content:space-between;align-items:center;min-height:34px}
.confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--play);border-radius:8px;padding:8px 12px;margin:6px 0}
.confirm span{flex:1;min-width:180px}
.scroll{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%}
.songs th{text-align:left;font-weight:500;color:var(--muted);padding:8px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:pointer;user-select:none}
.songs th.sel,.songs th.act{cursor:default}
.songs th[aria-sort=ascending]::after{content:" ▲";font-size:10px}.songs th[aria-sort=descending]::after{content:" ▼";font-size:10px}
.songs td{padding:7px 8px;border-bottom:1px solid var(--line);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.songs tbody tr{cursor:pointer}.songs tbody tr:hover{background:var(--hover)}
.songs tr.playing{background:var(--play)}.songs tr.playing td:nth-child(2){color:var(--accent);font-weight:600}
.songs tbody tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums}.songs th.num{text-align:right}
.sel{width:28px}.act{width:32px;text-align:center}.act a{text-decoration:none}
.empty{padding:24px;text-align:center;color:var(--muted)}
.pager{display:flex;gap:10px;align-items:center;justify-content:center;margin:10px 0}
.albums{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.album{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;text-align:left;display:block;width:100%}
.album img,.album .art{width:100%;aspect-ratio:1;border-radius:6px;background:var(--soft);display:block;object-fit:cover}
.album .art{display:flex;align-items:center;justify-content:center;font-size:40px;color:var(--muted)}
.album b,.album span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:6px}
.album span{margin-top:2px;color:var(--muted);font-size:12px}
.lists{list-style:none;margin:0;padding:0;background:var(--card);border:1px solid var(--line);border-radius:10px}
.lists li{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer}
.lists li:last-child{border-bottom:0}.lists li:hover{background:var(--hover)}
.drop{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px dashed var(--line);border-radius:10px;padding:22px;cursor:pointer;text-align:center}
.drop.over{border-color:var(--accent);background:var(--play)}.drop input{display:none}
.uploads{list-style:none;padding:0;margin:8px 0 0}.uploads li{display:grid;grid-template-columns:1fr 120px;gap:4px 10px;align-items:center;padding:4px 0}
.uploads progress{width:120px}.uploads .res{grid-column:1/-1;font-size:12px}
.kv th{text-align:left;font-weight:500;color:var(--muted);padding:4px 16px 4px 0;white-space:nowrap;vertical-align:top}
.kv td{padding:4px 0;word-break:break-word}.kv tr.group th{color:var(--text);padding-top:12px}
details summary{cursor:pointer;font-weight:600}details[open] summary{margin-bottom:10px}
.pod{margin-bottom:12px}.pod h2{font-size:15px}
.player{position:fixed;left:0;right:0;bottom:0;display:flex;gap:12px;align-items:center;padding:10px 16px;background:var(--card);border-top:1px solid var(--line)}
.player .now{flex:0 1 260px;min-width:0;display:flex;flex-direction:column}
.player .now b,.player .now span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.player .ctl{display:flex;gap:4px}.player .ctl button{width:38px;padding:6px 0}
.player audio{flex:1;min-width:0;height:36px}
@media (max-width:700px){
 .wide{display:none}.songs td{max-width:140px}
 .player{flex-wrap:wrap;gap:6px 10px}.player .now{flex:1 1 60%}.player audio{flex-basis:100%}
 body{padding-bottom:130px}.top{grid-template-columns:1fr}.state{justify-self:start}
}
`;
