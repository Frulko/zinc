// The page's HTML: the header, the token form, the library views, the manage panel, the specs and the player. `summary` and
// `pods` come escaped from page.ts; every other value is put in by script.ts with textContent.

export function shell(summary: string, pods: string): string {
  return `<header class="top">
 <div class="who"><h1 id="pod-name">iPod</h1><span id="pod-model" class="muted"></span></div>
 <div class="state"><span id="changes" class="badge">Read only</span><span id="conn" class="conn"><i></i><b>Connecting</b></span></div>
 <p id="summary" class="lib">${summary}</p>
 <div id="storage" class="storage" hidden><div class="bar"><div id="storage-used"></div></div><span id="storage-text" class="muted"></span></div>
 <div id="counts" class="counts"></div>
</header>
<form id="token-form" class="card token" hidden>
 <label for="token">This daemon needs its token (printed when it starts, or given with --token).</label>
 <div class="row"><input id="token" type="password" autocomplete="current-password" placeholder="Token" required><button type="submit">Connect</button></div>
 <p id="token-error" class="err"></p>
</form>
<main id="app">
 <nav class="tabs" role="tablist">
  <button id="tab-songs" class="tab on" data-view="songs">Songs</button><button id="tab-albums" class="tab" data-view="albums">Albums</button><button id="tab-playlists" class="tab" data-view="playlists">Playlists</button>
  <input id="search" type="search" placeholder="Search songs, artists, albums" autocomplete="off">
 </nav>
 <div id="filter" class="chip" hidden><span id="filter-text"></span><button id="filter-clear" type="button" aria-label="Show all songs">×</button></div>
 <section id="view-songs" class="view">
  <div class="tools"><span id="song-count" class="muted"></span><span id="select-tools" hidden><button id="delete" type="button" class="danger" disabled>Delete</button></span></div>
  <div id="confirm" class="confirm" hidden><span id="confirm-text"></span><button id="confirm-yes" type="button" class="danger">Delete</button><button id="confirm-no" type="button">Cancel</button></div>
  <div class="scroll"><table id="songs" class="songs"><thead><tr>
   <th class="sel"><input id="select-all" type="checkbox" aria-label="Select the songs of this page"></th>
   <th data-key="title">Title</th><th data-key="artist">Artist</th><th class="wide" data-key="album">Album</th>
   <th class="num" data-key="durationMs">Time</th><th class="wide" data-key="format">Format</th><th class="wide num" data-key="size">Size</th>
   <th class="wide num" data-key="playCount">Plays</th><th class="act"></th></tr></thead><tbody id="song-rows"></tbody></table></div>
  <div id="pager" class="pager"><button id="page-prev" type="button">Previous</button><span id="page-text" class="muted"></span><button id="page-next" type="button">Next</button></div>
 </section>
 <section id="view-albums" class="view" hidden><div id="albums" class="albums"></div></section>
 <section id="view-playlists" class="view" hidden><ul id="playlists" class="lists"></ul></section>
 <section id="manage" class="card">
  <h2>Manage</h2>
  <p id="manage-off" class="muted">This daemon is read only: start it with --allow-changes to add, delete or eject.</p>
  <div id="manage-on" hidden>
   <label id="drop" class="drop" for="picker"><b>Drop music files here</b><span class="muted">or click to choose (MP3, AAC, M4A, WAV, AIFF)</span>
    <input id="picker" type="file" multiple accept="audio/*,.mp3,.m4a,.m4b,.aac,.wav,.aif,.aiff"></label>
   <div class="row"><input id="add-playlist" type="text" placeholder="Also add to the playlist (optional)"></div>
   <ul id="uploads" class="uploads"></ul>
   <div class="row"><button id="eject" type="button">Eject the iPod</button></div>
   <div id="eject-confirm" class="confirm" hidden><span>Eject the iPod? The library closes until it is plugged in again.</span><button id="eject-yes" type="button" class="danger">Eject</button><button id="eject-no" type="button">Cancel</button></div>
   <p id="manage-msg" class="muted"></p>
  </div>
 </section>
 <details id="specs" class="card"><summary>Specs</summary><table id="spec-rows" class="kv"></table></details>
 <details id="devices" class="card"><summary>iPods plugged in</summary>${pods}<p class="muted"><a href="/pod.json">JSON</a></p></details>
</main>
<footer id="player" class="player">
 <div class="now"><b id="now-title">Nothing playing</b><span id="now-artist" class="muted"></span></div>
 <div class="ctl"><button id="prev" type="button" aria-label="Previous">⏮</button><button id="play" type="button" aria-label="Play">▶</button><button id="next" type="button" aria-label="Next">⏭</button></div>
 <audio id="audio" controls preload="none"></audio>
</footer>`;
}
