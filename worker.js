
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
};

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My toons</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#10131b;color:#f4f5f8;font:16px Arial,sans-serif}
header{padding:22px 5%;background:#191e2b;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
h1{margin:0;color:#ffbd59;font-size:28px}
.sub{color:#aeb6c8;font-size:13px;margin-top:5px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
button{border:0;border-radius:9px;padding:11px 15px;background:#ffbd59;color:#171717;font-weight:bold;cursor:pointer}
button.secondary{background:#30394c;color:#fff}
main{max-width:1100px;margin:auto;padding:22px 5%}
.tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
input,select{background:#202737;color:#fff;border:1px solid #3a465d;border-radius:9px;padding:12px;font-size:15px}
#search{flex:1;min-width:180px}
.tabs{display:flex;gap:8px;margin:18px 0}
.tabs button{background:#30394c;color:white}
.tabs button.active{background:#ffbd59;color:#171717}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.video{background:#1b2230;border:1px solid #2d374a;border-radius:12px;overflow:hidden}
.video video{display:block;width:100%;aspect-ratio:16/9;background:#000}
.info{padding:12px}
.name{font-weight:bold;overflow-wrap:anywhere}
.tag{color:#ffbd59;font-size:12px;margin-top:6px}
.empty{color:#aeb6c8;padding:30px 0}
.panel{display:none;background:#1b2230;border:1px solid #344057;border-radius:12px;padding:16px;margin:18px 0}
.panel.show{display:block}
.panel input,.panel select{width:100%;margin:7px 0 12px}
.status{color:#ffcf83;min-height:20px;font-size:14px}
.delete{background:#a83e4a;color:white;margin-top:10px}
.foot{text-align:center;color:#7f899d;padding:30px;font-size:13px}
</style>
</head>
<body>
<header>
<div>
<h1>My toons</h1>
<div class="sub">Movies • Cartoons • Entertainment</div>
</div>
<div class="actions">
<button class="secondary" id="adminBtn">Admin Login</button>
<button class="secondary" id="logoutBtn" hidden>Logout</button>
</div>
</header>

<main>
<div class="tools">
<input id="search" placeholder="Search videos...">
<select id="category">
<option value="All">All categories</option>
<option value="Movies">Movies</option>
<option value="Cartoons">Cartoons</option>
</select>
</div>

<div class="tabs">
<button class="active" data-cat="All">All</button>
<button data-cat="Movies">Movies</button>
<button data-cat="Cartoons">Cartoons</button>
</div>

<section id="adminPanel" class="panel">
<h2>Admin panel</h2>
<form id="uploadForm">
<label>Video title</label>
<input name="title" required maxlength="100" placeholder="Video title">
<label>Category</label>
<select name="category">
<option>Movies</option>
<option>Cartoons</option>
</select>
<label>Choose video (max 80 MB)</label>
<input name="file" type="file" accept="video/*" required>
<button id="uploadBtn" type="submit">Upload video</button>
</form>
<div id="status" class="status"></div>
</section>

<div id="videos" class="grid"></div>
<div id="empty" class="empty" hidden>No videos found yet.</div>
</main>

<div class="foot">My toons</div>

<script>
const $=id=>document.getElementById(id);
let allVideos=[];
let isAdmin=false;
let activeCat='All';

async function api(path,options={}){
  const r=await fetch(path,options);
  let data={};
  try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||'Request failed');
  return data;
}

function mediaUrl(key){
  return '/media?key='+encodeURIComponent(key);
}

function render(){
  const q=$('search').value.trim().toLowerCase();
  const cat=$('category').value;

  const list=allVideos.filter(v=>
    (cat==='All'||v.category===cat)&&
    (activeCat==='All'||v.category===activeCat)&&
    v.title.toLowerCase().includes(q)
  );

  $('videos').innerHTML='';
  $('empty').hidden=list.length>0;

  for(const v of list){
    const card=document.createElement('article');
    card.className='video';

    const video=document.createElement('video');
    video.controls=true;
    video.preload='metadata';
    video.src=mediaUrl(v.key);

    const info=document.createElement('div');
    info.className='info';

    const name=document.createElement('div');
    name.className='name';
    name.textContent=v.title;

    const tag=document.createElement('div');
    tag.className='tag';
    tag.textContent=v.category;

    info.append(name,tag);

    if(isAdmin){
      const del=document.createElement('button');
      del.className='delete';
      del.textContent='Delete';
      del.onclick=()=>deleteVideo(v.key);
      info.append(del);
    }

    card.append(video,info);
    $('videos').append(card);
  }
}

async function load(){
  try{
    const d=await api('/api/videos');
    allVideos=d.videos||[];
    render();
  }catch(e){
    $('empty').hidden=false;
    $('empty').textContent=e.message;
  }
}

async function checkAdmin(){
  try{
    const d=await api('/api/me');
    isAdmin=!!d.admin;
  }catch{
    isAdmin=false;
  }

  $('adminBtn').hidden=isAdmin;
  $('logoutBtn').hidden=!isAdmin;
  $('adminPanel').classList.toggle('show',isAdmin);
  render();
}

$('adminBtn').onclick=async()=>{
  const password=prompt('Admin password enter karein');
  if(password===null)return;

  try{
    await api('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });
    await checkAdmin();
    $('status').textContent='Login successful';
  }catch(e){
    alert(e.message);
  }
};

$('logoutBtn').onclick=async()=>{
  try{
    await api('/api/logout',{method:'POST'});
  }catch{}
  isAdmin=false;
  await checkAdmin();
};

$('search').addEventListener('input',render);
$('category').onchange=render;

document.querySelectorAll('.tabs button').forEach(b=>{
  b.onclick=()=>{
    activeCat=b.dataset.cat;
    document.querySelectorAll('.tabs button').forEach(x=>
      x.classList.toggle('active',x===b)
    );
    render();
  };
});

$('uploadForm').onsubmit=async e=>{
  e.preventDefault();
  const btn=$('uploadBtn');
  btn.disabled=true;
  $('status').textContent='Uploading...';

  try{
    const fd=new FormData(e.target);
    await api('/api/upload',{method:'POST',body:fd});
    $('status').textContent='Upload successful';
    e.target.reset();
    await load();
  }catch(err){
    $('status').textContent=err.message;
  }finally{
    btn.disabled=false;
  }
};

async function deleteVideo(key){
  if(!confirm('Is video ko delete karna hai?'))return;

  try{
    await api('/api/videos',{
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key})
    });
    await load();
  }catch(e){
    alert(e.message);
  }
}

checkAdmin();
load();
</script>
</body>
</html>`;

function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      ...HEADERS,
      "Content-Type":"application/json; charset=utf-8",
      ...extra
    }
  });
}

function page(){
  return new Response(HTML,{
    headers:{
      ...HEADERS,
      "Content-Type":"text/html; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}

function hex(buffer){
  return [...new Uint8Array(buffer)]
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("");
}

const enc=new TextEncoder();

async function sha256(data){
  return hex(await crypto.subtle.digest("SHA-256",data));
}

async function hmac(key,data){
  const k=await crypto.subtle.importKey(
    "raw",
    key,
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      k,
      typeof data==="string"?enc.encode(data):data
    )
  );
}

function awsEncode(s){
  return encodeURIComponent(s).replace(/[!'()*]/g,c=>
    "%"+c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function s3(env,method,key="",query="",body=null,contentType="",range=""){
  const endpoint=new URL(env.B2_ENDPOINT);

  const path="/"+awsEncode(env.B2_BUCKET)+
    (key?"/"+key.split("/").map(awsEncode).join("/"):"");

  const url=endpoint.origin+path+(query?"?"+query:"");

  const now=new Date();
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,"");
  const day=stamp.slice(0,8);

  const payloadHash=body
    ?await sha256(body)
    :await sha256(new Uint8Array());

  const headers={
    "x-amz-content-sha256":payloadHash,
    "x-amz-date":stamp
  };

  if(contentType)headers["content-type"]=contentType;
  if(range)headers.range=range;

  const canonicalHeaders={
    host:endpoint.host,
    ...headers
  };

  const signedHeaders=Object.keys(canonicalHeaders).sort().join(";");

  const canonicalHeaderString=Object.keys(canonicalHeaders)
    .sort()
    .map(k=>k+":"+String(canonicalHeaders[k]).trim()+"\n")
    .join("");

  const canonicalRequest=[
    method,
    path,
    query,
    canonicalHeaderString,
    signedHeaders,
    payloadHash
  ].join("\n");

  const scope=`${day}/${env.B2_REGION}/s3/aws4_request`;

  const stringToSign=
    `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n`+
    await sha256(enc.encode(canonicalRequest));

  const kDate=await hmac(
    enc.encode("AWS4"+env.B2_APPLICATION_KEY),
    day
  );

  const kRegion=await hmac(kDate,env.B2_REGION);
  const kService=await hmac(kRegion,"s3");
  const kSigning=await hmac(kService,"aws4_request");

  const signature=hex(await hmac(kSigning,stringToSign));

  headers.Authorization=
    `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url,{
    method,
    headers,
    body:body||undefined
  });
}

function xmlDecode(s){
  return s
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'");
}

function safeTitle(key){
  const base=key.split("/").pop()||"Video";

  return base
    .replace(/^[0-9a-f-]{30,}_/i,"")
    .replace(/\.[^.]+$/,"")
    .replace(/[_-]+/g," ");
}

function getCategory(key){
  return key.startsWith("Movies/")?"Movies":"Cartoons";
}

async function listVideos(env){
  const query="list-type=2&max-keys=1000";
  const r=await s3(env,"GET","",query);

  if(!r.ok){
    throw new Error("Backblaze list error: "+await r.text());
  }

  const xml=await r.text();
  const videos=[];

  for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
    const keyMatch=match[1].match(/<Key>([\s\S]*?)<\/Key>/);
    const sizeMatch=match[1].match(/<Size>(\d+)<\/Size>/);

    if(!keyMatch)continue;

    const key=xmlDecode(keyMatch[1]);

    if(!key.startsWith("Movies/")&&!key.startsWith("Cartoons/")){
      continue;
    }

    videos.push({
      key,
      title:safeTitle(key),
      category:getCategory(key),
      size:Number(sizeMatch?.[1]||0)
    });
  }

  videos.sort((a,b)=>a.title.localeCompare(b.title));
  return videos;
}

async function sessionToken(password,expiry){
  return hex(await hmac(
    enc.encode(password),
    `my-toons-session:${expiry}`
  ));
}

async function isAdmin(request,env){
  const cookieValue=(request.headers.get("Cookie")||"")
    .split(";")
    .map(x=>x.trim())
    .find(x=>x.startsWith("mt_admin="));

  if(!cookieValue)return false;

  const value=cookieValue.slice("mt_admin=".length).split(".");
  if(value.length!==2)return false;

  const expiry=Number(value[0]);

  if(
    !Number.isFinite(expiry)||
    expiry<Date.now()||
    expiry>Date.now()+86400000
  ){
    return false;
  }

  const expected=await sessionToken(env.ADMIN_PASSWORD,value[0]);
  return value[1]===expected;
}

function cookie(value,maxAge){
  return `mt_admin=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function safeKey(key){
  return typeof key==="string"&&
    key.length<900&&
    (key.startsWith("Movies/")||key.startsWith("Cartoons/"))&&
    !key.includes("..")&&
    !key.includes("\\");
}

export default {
  async fetch(request,env){
    try{
      if(
        !env.B2_ENDPOINT||
        !env.B2_BUCKET||
        !env.B2_REGION||
        !env.B2_KEY_ID||
        !env.B2_APPLICATION_KEY||
        !env.ADMIN_PASSWORD
      ){
        return json({error:"Server configuration is incomplete."},500);
      }

      const url=new URL(request.url);
      const path=url.pathname;

      if(request.method==="GET"&&path==="/"){
        return page();
      }

      if(request.method==="GET"&&path==="/api/videos"){
        return json({videos:await listVideos(env)});
      }

      if(request.method==="GET"&&path==="/api/me"){
        return json({admin:await isAdmin(request,env)});
      }

      if(request.method==="POST"&&path==="/api/login"){
        const data=await request.json();

        if(
          typeof data.password!=="string"||
          data.password!==env.ADMIN_PASSWORD
        ){
          return json({error:"Wrong admin password."},401);
        }

        const expiry=String(Date.now()+86400000);
        const value=expiry+"."+await sessionToken(env.ADMIN_PASSWORD,expiry);

        return json({ok:true},200,{
          "Set-Cookie":cookie(value,86400)
        });
      }

      if(request.method==="POST"&&path==="/api/logout"){
        return json({ok:true},200,{
          "Set-Cookie":cookie("",0)
        });
      }

      if(request.method==="POST"&&path==="/api/upload"){
        if(!await isAdmin(request,env)){
          return json({error:"Admin login required."},401);
        }

        const form=await request.formData();
        const file=form.get("file");
        const title=String(form.get("title")||"").trim();
        const category=String(form.get("category")||"");

        if(!(file instanceof File)||!file.size){
          return json({error:"Choose a video file."},400);
        }

        if(file.size>80*1024*1024){
          return json({error:"Maximum upload size is 80 MB."},413);
        }

        if(!["Movies","Cartoons"].includes(category)){
          return json({error:"Invalid category."},400);
        }

        if(!file.type.startsWith("video/")){
          return json({error:"Only video files are allowed."},400);
        }

        const ext=(file.name.match(/\.[a-z0-9]{1,8}$/i)||[""])[0].toLowerCase();

        const clean=(title||file.name.replace(/\.[^.]+$/,""))
          .replace(/[^\p{L}\p{N} _-]/gu,"")
          .trim()
          .slice(0,80)||"Video";

        const key=
          `${category}/${crypto.randomUUID()}_${clean.replace(/\s+/g,"_")}${ext}`;

        const bytes=await file.arrayBuffer();
        const r=await s3(env,"PUT",key,"",bytes,file.type);

        if(!r.ok){
          return json({
            error:"Backblaze upload error: "+(await r.text()).slice(0,400)
          },502);
        }

        return json({ok:true});
      }

      if(request.method==="DELETE"&&path==="/api/videos"){
        if(!await isAdmin(request,env)){
          return json({error:"Admin login required."},401);
        }

        const data=await request.json();

        if(!safeKey(data.key)){
          return json({error:"Invalid video key."},400);
        }

        const r=await s3(env,"DELETE",data.key);

        if(!r.ok){
          return json({
            error:"Backblaze delete error: "+(await r.text()).slice(0,400)
          },502);
        }

        return json({ok:true});
      }

      if(request.method==="GET"&&path==="/media"){
        const key=url.searchParams.get("key");

        if(!safeKey(key)){
          return new Response("Not found",{status:404,headers:HEADERS});
        }

        const range=request.headers.get("Range")||"";
        const r=await s3(env,"GET",key,"",null,"",range);

        if(!r.ok&&r.status!==206){
          return new Response("Video not found",{
            status:r.status,
            headers:HEADERS
          });
        }

        const h=new Headers(HEADERS);
        h.set("Content-Type",r.headers.get("Content-Type")||"application/octet-stream");
        h.set("Accept-Ranges","bytes");

        for(const name of ["Content-Length","Content-Range","Last-Modified","ETag"]){
          const v=r.headers.get(name);
          if(v)h.set(name,v);
        }

        h.set("Cache-Control","public, max-age=3600");

        return new Response(r.body,{
          status:r.status,
          headers:h
        });
      }

      return json({error:"Not found."},404);

    }catch(error){
      return json({error:error?.message||"Server error."},500);
    }
  }
};
// Production configuration redeploy
