
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
};

function response(body, status = 200, extra = {}) {
  const headers = new Headers(SECURITY_HEADERS);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(body, { status, headers });
}

function json(data, status = 200) {
  return response(JSON.stringify(data), status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAllowedVideo(file) {
  const allowed = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
    "video/ogg"
  ]);
  return allowed.has((file.type || "").toLowerCase());
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (origin && origin !== url.origin) {
      return json({ error: "Origin not allowed." }, 403);
    }

    if (url.pathname === "/api/videos" && request.method === "GET") {
      const listed = await env.VIDEOS.list({ limit: 500 });
      const videos = listed.objects.map(obj => {
        const meta = obj.customMetadata || {};
        return {
          id: obj.key,
          title: meta.title || "Untitled",
          category: meta.category === "Movie" ? "Movie" : "Cartoon",
          description: meta.description || "",
          size: obj.size,
          url: "/media/" + encodeURIComponent(obj.key)
        };
      });
      return json(videos);
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice(7));

      if (!/^[a-zA-Z0-9._-]{1,240}$/.test(key)) {
        return response("Bad request", 400);
      }

      const object = await env.VIDEOS.get(key);
      if (!object) return response("Not found", 404);

      const headers = new Headers(SECURITY_HEADERS);
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", object.httpMetadata?.contentType || "video/mp4");
      headers.set("Content-Disposition", "inline");
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("Accept-Ranges", "bytes");

      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      if (!env.ADMIN_TOKEN) {
        return json({ error: "Admin security is not configured." }, 503);
      }

      const supplied = request.headers.get("X-Admin-Token") || "";
      if (!safeEqual(supplied, env.ADMIN_TOKEN)) {
        return json({ error: "Admin password galat hai." }, 401);
      }

      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 100 * 1024 * 1024) {
        return json({ error: "Request bahut badi hai." }, 413);
      }

      let form;
      try {
        form = await request.formData();
      } catch {
        return json({ error: "Invalid upload form." }, 400);
      }

      const file = form.get("file");
      const title = cleanText(form.get("title"), 100);
      const category = form.get("category") === "Movie" ? "Movie" : "Cartoon";
      const description = cleanText(form.get("description"), 300);

      if (!(file instanceof File) || !file.size || !title) {
        return json({ error: "Video file aur title zaroori hain." }, 400);
      }

      if (file.size > 90 * 1024 * 1024) {
        return json({ error: "File limit 90 MB hai." }, 413);
      }

      if (!isAllowedVideo(file)) {
        return json({ error: "Unsupported video format." }, 415);
      }

      const key = Date.now() + "-" + crypto.randomUUID() +
        (category === "Movie" ? ".movie" : ".cartoon");

      await env.VIDEOS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { title, category, description }
      });

      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/videos/") && request.method === "DELETE") {
      if (!env.ADMIN_TOKEN ||
          !safeEqual(request.headers.get("X-Admin-Token") || "", env.ADMIN_TOKEN)) {
        return json({ error: "Admin password galat hai." }, 401);
      }

      const key = decodeURIComponent(url.pathname.slice("/api/videos/".length));

      if (!/^[a-zA-Z0-9._-]{1,240}$/.test(key)) {
        return json({ error: "Invalid video ID." }, 400);
      }

      await env.VIDEOS.delete(key);
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return response(HTML, 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }
};

const HTML = String.raw`<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My toons — Movies & Cartoons</title>
<style>
:root{color-scheme:dark;--bg:#0b0c12;--panel:#151824;--muted:#9ba3b7;--pink:#ff4f91;--purple:#8b72ff}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 15% 0%,#252044 0,transparent 38%),var(--bg);color:#fff;font:15px system-ui,Arial}
header{padding:20px clamp(16px,5vw,64px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff16;position:sticky;top:0;background:#0b0c12ef;backdrop-filter:blur(12px);z-index:5}
.brand{font-size:25px;font-weight:900;letter-spacing:-1px}
.brand span{color:var(--pink)}
button{border:0;border-radius:12px;padding:11px 16px;font-weight:750;cursor:pointer;background:linear-gradient(110deg,var(--pink),var(--purple));color:white}
main{max-width:1200px;margin:auto;padding:28px 20px 60px}
.hero{padding:30px 0 24px}
.hero h1{font-size:clamp(32px,6vw,58px);line-height:1.02;margin:0 0 12px;letter-spacing:-2px}
.hero p{color:var(--muted);margin:0}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}
.toolbar input,.toolbar select,.field{background:var(--panel);border:1px solid #ffffff20;color:white;border-radius:11px;padding:12px 14px;min-width:0}
.toolbar input{flex:1;min-width:190px}
.tabs{display:flex;gap:8px;margin:14px 0 22px}
.tab{background:#ffffff12;color:#ddd}
.tab.active{background:#fff;color:#171522}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:17px}
.card{background:var(--panel);border:1px solid #ffffff12;border-radius:16px;overflow:hidden;cursor:pointer;transition:.2s}
.card:hover{transform:translateY(-3px);border-color:#ffffff45}
.thumb{height:135px;background:linear-gradient(135deg,#31244f,#18263a);display:grid;place-items:center;font-size:48px}
.info{padding:13px}
.info strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{font-size:12px;color:var(--muted);margin-top:5px}
.empty{padding:50px 15px;text-align:center;color:var(--muted);background:#ffffff08;border:1px dashed #ffffff25;border-radius:16px}
dialog{background:#151824;color:white;border:1px solid #ffffff30;border-radius:18px;width:min(620px,calc(100% - 24px));padding:22px}
dialog::backdrop{background:#000b;backdrop-filter:blur(5px)}
.modal-head{display:flex;justify-content:space-between;align-items:center}
.close{background:#ffffff18}
.field{width:100%;margin:7px 0 13px}
.field-label{color:#c6cadd;font-size:13px}
.note{color:var(--muted);font-size:12px;line-height:1.5}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
video{width:100%;max-height:65vh;background:#000;border-radius:12px;margin-top:14px}
.status{min-height:20px;color:#ffb3d0;font-size:13px}
footer{text-align:center;color:#788097;padding:25px;font-size:12px}
@media(max-width:550px){header{padding:15px}.brand{font-size:21px}.hero{padding-top:25px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.thumb{height:105px}.info{padding:10px}}
</style>
</head>
<body>
<header>
<div class="brand">My <span>toons</span> 🍿</div>
<button id="adminBtn">＋ Upload video</button>
</header>
<main>
<section class="hero">
<h1>Movies & Cartoons,<br><span style="color:#ff78aa">all in one place.</span></h1>
<p>Apni pasand ke cartoons aur movies dekho.</p>
</section>
<div class="toolbar">
<input id="search" placeholder="Search movies or cartoons…">
<select id="sort"><option value="new">Newest first</option><option value="az">A to Z</option></select>
</div>
<div class="tabs">
<button class="tab active" data-cat="All">All videos</button>
<button class="tab" data-cat="Movie">Movies</button>
<button class="tab" data-cat="Cartoon">Cartoons</button>
</div>
<div id="grid" class="grid"></div>
<div id="empty" class="empty" hidden>Abhi koi video upload nahi hui.</div>
</main>
<footer>My toons · Sirf wahi content upload karein jise share karne ka haq aapke paas hai.</footer>

<dialog id="adminDialog">
<div class="modal-head"><h2>Admin upload</h2><button class="close" id="closeAdmin">✕</button></div>
<p class="note">Upload ke liye Admin Password zaroori hai. Password kisi ke saath share na karein.</p>
<label class="field-label">Admin password</label>
<input class="field" id="token" type="password" autocomplete="current-password" placeholder="Admin password">
<label class="field-label">Video title</label>
<input class="field" id="title" maxlength="100" placeholder="Video ka naam">
<label class="field-label">Category</label>
<select class="field" id="category"><option>Cartoon</option><option>Movie</option></select>
<label class="field-label">Description</label>
<input class="field" id="description" maxlength="300" placeholder="Video ke baare mein">
<label class="field-label">Video file</label>
<input class="field" id="file" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/ogg">
<p class="note">Maximum file size 90 MB in this starter.</p>
<div class="status" id="uploadStatus"></div>
<div class="actions"><button class="close" id="cancelUpload">Cancel</button><button id="uploadBtn">Upload</button></div>
</dialog>

<dialog id="playerDialog">
<div class="modal-head">
<div><h2 id="playTitle">Video</h2><div class="meta" id="playMeta"></div></div>
<button class="close" id="closePlayer">✕</button>
</div>
<video id="player" controls playsinline></video>
<p id="playDescription" class="note"></p>
</dialog>

<script>
const $=id=>document.getElementById(id);
let videos=[],active="All";

async function load(){
  try{
    const r=await fetch("/api/videos");
    if(!r.ok)throw new Error("Load failed");
    videos=await r.json();
    render();
  }catch(e){
    $("empty").hidden=false;
    $("empty").textContent="Videos load nahi ho paaye. Server setup check karein.";
  }
}

function esc(s){
  return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function render(){
  let q=$("search").value.toLowerCase();

  let list=videos.filter(v=>
    (active==="All"||v.category===active) &&
    (v.title+" "+v.description).toLowerCase().includes(q)
  );

  if($("sort").value==="az"){
    list.sort((a,b)=>a.title.localeCompare(b.title));
  }else{
    list.reverse();
  }

  $("grid").innerHTML=list.map(v=>
    '<article class="card" data-id="'+encodeURIComponent(v.id)+'">'+
    '<div class="thumb">'+(v.category==="Movie"?"🎬":"🧸")+'</div>'+
    '<div class="info"><strong>'+esc(v.title)+'</strong>'+
    '<div class="meta">'+esc(v.category)+' · '+
    (v.size/1048576).toFixed(1)+' MB</div></div></article>'
  ).join("");

  $("empty").hidden=list.length!==0;

  document.querySelectorAll(".card").forEach(c=>{
    c.onclick=()=>play(decodeURIComponent(c.dataset.id));
  });
}

function play(id){
  let v=videos.find(x=>x.id===id);
  if(!v)return;
  $("playTitle").textContent=v.title;
  $("playMeta").textContent=v.category;
  $("playDescription").textContent=v.description;
  $("player").src=v.url;
  $("playerDialog").showModal();
}

$("adminBtn").onclick=()=>$("adminDialog").showModal();
$("closeAdmin").onclick=$("cancelUpload").onclick=()=>$("adminDialog").close();

$("closePlayer").onclick=()=>{
  $("player").pause();
  $("player").removeAttribute("src");
  $("player").load();
  $("playerDialog").close();
};

$("search").oninput=render;
$("sort").onchange=render;

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  active=b.dataset.cat;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  render();
});

$("uploadBtn").onclick=async()=>{
  let f=$("file").files[0];
  let title=$("title").value.trim();

  if(!f||!title){
    $("uploadStatus").textContent="Video file aur title dono bharein.";
    return;
  }

  let d=new FormData();
  d.append("file",f);
  d.append("title",title);
  d.append("category",$("category").value);
  d.append("description",$("description").value);

  $("uploadBtn").disabled=true;
  $("uploadStatus").textContent="Uploading…";

  try{
    let r=await fetch("/api/upload",{
      method:"POST",
      headers:{"X-Admin-Token":$("token").value},
      body:d
    });

    let out=await r.json();
    if(!r.ok)throw new Error(out.error||"Upload failed");

    $("uploadStatus").textContent="Upload complete!";
    $("file").value="";
    $("title").value="";
    $("token").value="";
    await load();
    setTimeout(()=>$("adminDialog").close(),900);
  }catch(e){
    $("uploadStatus").textContent=e.message;
  }finally{
    $("uploadBtn").disabled=false;
  }
};

load();
</script>
</body>
</html>`;
