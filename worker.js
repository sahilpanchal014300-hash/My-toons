
        
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(data)));
}

function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function awsEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function s3Request(env, method, key = "", body = null, contentType = "") {
  const endpoint = env.B2_ENDPOINT.replace(/\/+$/, "");
  const url = new URL(endpoint);
  const bucket = env.B2_BUCKET;
  const path = "/" + awsEncode(bucket) +
    (key ? "/" + key.split("/").map(awsEncode).join("/") : "");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = hex(await sha256(body || new Uint8Array()));
  const headers = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash
  };

  let canonicalHeaders =
    "host:" + url.host + "\n" +
    "x-amz-content-sha256:" + payloadHash + "\n" +
    "x-amz-date:" + amzDate + "\n";

  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  if (contentType) {
    headers["Content-Type"] = contentType;
    canonicalHeaders =
      "content-type:" + contentType.trim() + "\n" + canonicalHeaders;
  }

  const signed = contentType
    ? "content-type;host;x-amz-content-sha256;x-amz-date"
    : signedHeaders;

  const canonicalRequest = [
    method, path, "", canonicalHeaders.trimEnd(), signed, payloadHash
  ].join("\n");

  const scope = `${dateStamp}/${env.B2_REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hex(await sha256(encoder.encode(canonicalRequest)))
  ].join("\n");

  const kDate = await hmac(encoder.encode("AWS4" + env.B2_APPLICATION_KEY), dateStamp);
  const kRegion = await hmac(kDate, env.B2_REGION);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;

  return fetch(endpoint + path, {
    method,
    headers,
    body: body || undefined
  });
}

async function adminToken(password, secret) {
  const payload = b64(encoder.encode(JSON.stringify({
    exp: Date.now() + 86400000
  })));
  const sig = b64(await hmac(encoder.encode(secret), payload));
  return payload + "." + sig;
}

async function isAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/mytoons_session=([^;]+)/);
  if (!match || !env.ADMIN_PASSWORD) return false;

  const parts = match[1].split(".");
  if (parts.length !== 2) return false;

  const expected = b64(await hmac(encoder.encode(env.ADMIN_PASSWORD), parts[0]));
  if (expected !== parts[1]) return false;

  try {
    return JSON.parse(new TextDecoder().decode(fromB64(parts[0]))).exp > Date.now();
  } catch {
    return false;
  }
}

function xmlDecode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function listVideos(env) {
  const res = await s3Request(env, "GET");
  if (!res.ok) throw new Error("Backblaze list error: " + res.status);

  const xml = await res.text();
  const videos = [];
  const blocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];

  for (const block of blocks) {
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
    const sizeMatch = block.match(/<Size>(\d+)<\/Size>/);
    if (!keyMatch) continue;

    const key = xmlDecode(keyMatch[1]);
    const name = key.split("/").pop();
    const category = key.split("/")[0] || "Movies";

    videos.push({
      key,
      name,
      category,
      size: sizeMatch ? Number(sizeMatch[1]) : 0,
      url: "/media/" + key.split("/").map(encodeURIComponent).join("/")
    });
  }
  return videos.reverse();
}

function page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My toons</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#10111b;color:#fff;font-family:Arial,sans-serif}
header{padding:20px;background:#191b2b;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
h1{margin:0;color:#ffb52e}
button{border:0;border-radius:8px;padding:11px 16px;background:#ffb52e;color:#171717;font-weight:bold;cursor:pointer}
main{padding:20px;max-width:1100px;margin:auto}
input,select{padding:12px;border-radius:8px;border:1px solid #444;background:#202235;color:white;width:100%;margin:7px 0}
.tabs{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
.tabs button{background:#292c40;color:white}
.tabs button.active{background:#ffb52e;color:#111}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:#202235;padding:14px;border-radius:12px;overflow:hidden}
.card video{width:100%;max-height:180px;background:#000;border-radius:8px}
.card h3{overflow-wrap:anywhere}
.small{color:#bbb;font-size:13px}
#adminPanel{display:none;background:#202235;padding:16px;border-radius:12px;margin:15px 0}
#status{color:#ffcf70;margin:10px 0}
</style>
</head>
<body>
<header>
<h1>🎬 My toons</h1>
<button id="adminBtn">Admin Login</button>
</header>
<main>
<input id="search" placeholder="Search movies and cartoons...">
<div class="tabs">
<button class="active" data-cat="All">All</button>
<button data-cat="Movies">Movies</button>
<button data-cat="Cartoons">Cartoons</button>
</div>
<div id="adminPanel">
<h2>Admin Panel</h2>
<form id="uploadForm">
<label>Choose video</label>
<input type="file" name="video" accept="video/*" required>
<label>Category</label>
<select name="category">
<option value="Movies">Movies</option>
<option value="Cartoons">Cartoons</option>
</select>
<button type="submit">Upload Video</button>
</form>
<p id="status"></p>
<button id="logoutBtn">Logout</button>
</div>
<h2>Videos</h2>
<div id="videos" class="grid">Loading videos...</div>
</main>
<script>
let allVideos=[];
let category="All";
let admin=false;

async function loadStatus(){
  const r=await fetch("/api/admin/status");
  const d=await r.json();
  admin=d.admin;
  document.getElementById("adminPanel").style.display=admin?"block":"none";
  document.getElementById("adminBtn").textContent=admin?"Admin Active":"Admin Login";
}

async function loadVideos(){
  const box=document.getElementById("videos");
  try{
    const r=await fetch("/api/videos");
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||"Could not load videos");
    allVideos=d.videos||[];
    render();
  }catch(e){box.textContent=e.message}
}

function render(){
  const q=document.getElementById("search").value.toLowerCase();
  const box=document.getElementById("videos");
  box.innerHTML="";
  const filtered=allVideos.filter(v=>
    (category==="All"||v.category.toLowerCase()===category.toLowerCase()) &&
    v.name.toLowerCase().includes(q)
  );
  if(!filtered.length){box.textContent="No videos found.";return}
  filtered.forEach(v=>{
    const card=document.createElement("div");
    card.className="card";
    const video=document.createElement("video");
    video.controls=true;
    video.preload="metadata";
    video.src=v.url;
    const title=document.createElement("h3");
    title.textContent=v.name;
    const info=document.createElement("p");
    info.className="small";
    info.textContent=v.category+" • "+(v.size/1048576).toFixed(1)+" MB";
    card.append(video,title,info);
    if(admin){
      const del=document.createElement("button");
      del.textContent="Delete";
      del.onclick=async()=>{
        if(!confirm("Delete this video?"))return;
        const r=await fetch("/api/videos?key="+encodeURIComponent(v.key),{method:"DELETE"});
        const d=await r.json();
        if(!r.ok){alert(d.error||"Delete failed");return}
        loadVideos();
      };
      card.append(del);
    }
    box.append(card);
  });
}

document.getElementById("search").addEventListener("input",render);
document.querySelectorAll(".tabs button").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    category=b.dataset.cat;
    render();
  };
});

document.getElementById("adminBtn").onclick=async()=>{
  if(admin)return;
  const password=prompt("Enter admin password");
  if(!password)return;
  const r=await fetch("/api/admin/login",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({password})
  });
  const d=await r.json();
  if(!r.ok){alert(d.error||"Login failed");return}
  await loadStatus();
  loadVideos();
};

document.getElementById("logoutBtn").onclick=async()=>{
  await fetch("/api/admin/logout",{method:"POST"});
  await loadStatus();
  render();
};

document.getElementById("uploadForm").onsubmit=async e=>{
  e.preventDefault();
  const status=document.getElementById("status");
  status.textContent="Uploading... Please wait.";
  const r=await fetch("/api/upload",{method:"POST",body:new FormData(e.target)});
  const d=await r.json();
  if(!r.ok){status.textContent=d.error||"Upload failed";return}
  status.textContent="Video uploaded successfully!";
  e.target.reset();
  loadVideos();
};

loadStatus();
loadVideos();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (!env.B2_KEY_ID || !env.B2_APPLICATION_KEY ||
          !env.B2_ENDPOINT || !env.B2_BUCKET || !env.B2_REGION) {
        return json({ error: "Backblaze settings are missing." }, 500);
      }

      if (path === "/" && request.method === "GET") {
        return new Response(page(), {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      if (path === "/api/admin/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD) {
          return json({ error: "Admin password is not configured." }, 500);
        }
        const data = await request.json();
        if (data.password !== env.ADMIN_PASSWORD) {
          return json({ error: "Wrong password." }, 401);
        }
        const token = await adminToken(data.password, env.ADMIN_PASSWORD);
        return json({ success: true }, 200, {
          "Set-Cookie": `mytoons_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
        });
      }

      if (path === "/api/admin/logout" && request.method === "POST") {
        return json({ success: true }, 200, {
          "Set-Cookie": "mytoons_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
        });
      }

      if (path === "/api/admin/status" && request.method === "GET") {
        return json({ admin: await isAdmin(request, env) });
      }

      if (path === "/api/videos" && request.method === "GET") {
        const videos = await listVideos(env);
        return json({ videos });
      }

      if (path === "/api/upload" && request.method === "POST") {
        if (!(await isAdmin(request, env))) return json({ error: "Admin login required." }, 401);

        const form = await request.formData();
        const file = form.get("video");
        const category = form.get("category");

        if (!file || typeof file.arrayBuffer !== "function") {
          return json({ error: "Please select a video." }, 400);
        }
        if (!["Movies", "Cartoons"].includes(category)) {
          return json({ error: "Invalid category." }, 400);
        }
        if (!file.type.startsWith("video/")) {
          return json({ error: "Only video files are allowed." }, 400);
        }
        if (file.size > 500 * 1024 * 1024) {
          return json({ error: "Video is too large. Maximum size is 500 MB." }, 413);
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${category}/${Date.now()}-${safeName}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await s3Request(env, "PUT", key, bytes, file.type || "video/mp4");

        if (!result.ok) {
          const detail = await result.text();
          return json({ error: "Backblaze upload failed: " + result.status + " " + detail.slice(0, 300) }, 502);
        }
        return json({ success: true, key });
      }

      if (path === "/api/videos" && request.method === "DELETE") {
        if (!(await isAdmin(request, env))) return json({ error: "Admin login required." }, 401);

        const key = url.searchParams.get("key");
        if (!key || !/^(Movies|Cartoons)\//.test(key)) {
          return json({ error: "Invalid video key." }, 400);
        }
        const result = await s3Request(env, "DELETE", key);
        if (!result.ok) {
          return json({ error: "Backblaze delete failed: " + result.status }, 502);
        }
        return json({ success: true });
      }

      if (path.startsWith("/media/") && request.method === "GET") {
        const key = path.slice("/media/".length).split("/").map(decodeURIComponent).join("/");
        if (!/^(Movies|Cartoons)\//.test(key)) {
          return new Response("Not found", { status: 404 });
        }
        const result = await s3Request(env, "GET", key);
        if (!result.ok) return new Response("Video not found", { status: result.status });
        return new Response(result.body, {
          headers: {
            "Content-Type": result.headers.get("Content-Type") || "video/mp4",
            "Cache-Control": "public, max-age=3600",
            "Accept-Ranges": "bytes"
          }
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ error: err.message || "Server error." }, 500);
    }
  }
};
