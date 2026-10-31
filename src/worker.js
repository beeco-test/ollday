const encoder = new TextEncoder();
const COOKIE = '__Host-ollday_admin';
const now = () => Math.floor(Date.now()/1000);
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
async function passwordMatches(password,record){
 const parts=(record||'').split('$');
 if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!=='100000'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const salt=Uint8Array.from(parts[2].match(/../g),h=>parseInt(h,16));
 const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
 let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^parts[3].charCodeAt(i);return diff===0;
}
async function admin(request,env){
 if(!env.ADMIN_PASSWORD_HASH)return false;
 const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
 return !!await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires>? AND credential_version=?').bind(await digest(token),now(),await digest(env.ADMIN_PASSWORD_HASH)).first();
}
async function smallBody(request,max){
 const declared=Number(request.headers.get('Content-Length')||0);if(declared>max)fail(413,'파일 또는 요청이 너무 큽니다.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks=[];
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();fail(413,'파일 또는 요청이 너무 큽니다.')}chunks.push(r.value)}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out;
}
async function bodyJSON(request){
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))fail(415,'JSON 요청이 필요합니다.');
 try{const data=JSON.parse(new TextDecoder().decode(await smallBody(request,250000)));if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'입력값을 확인해주세요.');return data}catch(e){if(e.status)throw e;fail(400,'입력값을 확인해주세요.')}
}
function safeMedia(v){return v===''||(/^\/(assets|media)\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..'))}
function contentInput(d){
 const fields=['title','subtitle','category','body','cover','lineup','specs'];const p={};
 if(!['collection','magazine','news'].includes(d.kind))fail(400,'게시판을 선택해주세요.');p.kind=d.kind;
 for(const f of fields){const value=d[f]??'';if(typeof value!=='string'||value.length>(f==='body'?50000:5000))fail(400,'본문이나 제목 길이를 확인해주세요.');p[f]=value}
 p.title=p.title.trim();if(!p.title||p.title.length>200)fail(400,'제목은 1~200자로 입력해주세요.');
 if(!safeMedia(p.cover))fail(400,'이미지 경로를 확인해주세요.');
 if(!Array.isArray(d.gallery)||d.gallery.length>30||d.gallery.some(x=>typeof x!=='string'||!x||!safeMedia(x)))fail(400,'갤러리 이미지는 최대 30장입니다.');
 p.gallery=JSON.stringify(d.gallery);if(typeof d.published!=='boolean')fail(400,'공개 상태를 확인해주세요.');p.published=d.published?1:0;
 p.sort=Number(d.sort??0);if(!Number.isSafeInteger(p.sort)||Math.abs(p.sort)>1000000)fail(400,'표시 순서를 확인해주세요.');
 p.updated=new Date().toISOString().slice(0,10);return p;
}
async function route(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/content'&&request.method==='GET')return json((await env.DB.prepare('SELECT * FROM posts WHERE published=1 ORDER BY sort,updated DESC,id').all()).results);
 if(path.startsWith('/api/admin/')){
  const write=request.method!=='GET';
  if(write&&(request.headers.get('Origin')!==url.origin||request.headers.get('X-OLLDAY-Admin')!=='1'))fail(403,'허용되지 않은 요청입니다.');
  if(path==='/api/admin/login'&&request.method==='POST'){
   if(!env.ADMIN_PASSWORD_HASH)fail(503,'관리자 비밀번호 설정이 필요합니다.');
   const d=await bodyJSON(request);if(typeof d.password!=='string'||d.password.length<12||d.password.length>200)fail(403,'관리자 비밀번호를 확인해주세요.');
   const key=await digest(request.headers.get('CF-Connecting-IP')||'local');const t=now();
   await env.DB.prepare('INSERT INTO attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.until<=? THEN 1 ELSE attempts.count+1 END, until=CASE WHEN attempts.until<=? THEN excluded.until ELSE attempts.until END').bind(key,t+900,t,t).run();
   const attempt=await env.DB.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first();if(attempt.count>10)fail(429,'시도가 많습니다. 15분 뒤 다시 시도해주세요.');
   if(!await passwordMatches(d.password,env.ADMIN_PASSWORD_HASH))fail(403,'관리자 비밀번호를 확인해주세요.');
   const token=hex(crypto.getRandomValues(new Uint8Array(32)));
   await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(t),env.DB.prepare('DELETE FROM attempts WHERE until<=?').bind(t),env.DB.prepare('INSERT INTO sessions(token_hash,expires,credential_version) VALUES(?,?,?)').bind(await digest(token),t+28800,await digest(env.ADMIN_PASSWORD_HASH))]);
   return json({ok:true},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
  }
  if(!await admin(request,env))fail(401,'관리자 로그인이 필요합니다.');
  if(path==='/api/admin/me'&&request.method==='GET')return json({admin:true});
  if(path==='/api/admin/logout'&&request.method==='POST'){
   const token=request.headers.get('Cookie').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'=')).slice(COOKIE.length+1);
   await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
   return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
  }
  if(path==='/api/admin/content'&&request.method==='GET')return json((await env.DB.prepare('SELECT * FROM posts ORDER BY sort,updated DESC,id').all()).results);
  if(path==='/api/admin/content'&&request.method==='POST'){
   const d=await bodyJSON(request),p=contentInput(d);let id=d.id;
   if(id){
    if(typeof id!=='string'||!Number.isInteger(d.revision)||d.revision<0)fail(400,'수정 버전을 확인해주세요.');
    const result=await env.DB.prepare('UPDATE posts SET kind=?,title=?,subtitle=?,category=?,body=?,cover=?,gallery=?,lineup=?,specs=?,published=?,updated=?,sort=?,revision=revision+1 WHERE id=? AND revision=?').bind(p.kind,p.title,p.subtitle,p.category,p.body,p.cover,p.gallery,p.lineup,p.specs,p.published,p.updated,p.sort,id,d.revision).run();
    if(!result.meta.changes)fail(409,'다른 창에서 변경됐거나 삭제된 글입니다. 목록을 새로고침해주세요.');
   }else{
    id=crypto.randomUUID();await env.DB.prepare('INSERT INTO posts(id,kind,title,subtitle,category,body,cover,gallery,lineup,specs,published,updated,sort,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(id,p.kind,p.title,p.subtitle,p.category,p.body,p.cover,p.gallery,p.lineup,p.specs,p.published,p.updated,p.sort).run();
   }
   return json({id});
  }
  if(path==='/api/admin/delete'&&request.method==='POST'){
   const d=await bodyJSON(request);if(typeof d.id!=='string'||!Number.isInteger(d.revision))fail(400,'삭제할 글을 확인해주세요.');
   const result=await env.DB.prepare('DELETE FROM posts WHERE id=? AND revision=?').bind(d.id,d.revision).run();
   if(!result.meta.changes)fail(409,'다른 창에서 변경됐거나 삭제된 글입니다. 목록을 새로고침해주세요.');return json({ok:true});
  }
  if(path==='/api/admin/upload'&&request.method==='POST'){
   const bytes=await smallBody(request,5100000);let form;try{form=await new Request(request.url,{method:'POST',headers:request.headers,body:bytes}).formData()}catch{fail(400,'이미지 파일을 선택해주세요.')}
   const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>5000000||file.size<12)fail(400,'5MB 이하의 이미지 파일을 선택해주세요.');
   const data=new Uint8Array(await file.arrayBuffer());
   const ext=data[0]===255&&data[1]===216&&data[2]===255?'jpg':data.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])?'png':new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP'?'webp':null;
   if(!ext)fail(400,'JPG, PNG, WebP 이미지만 지원합니다.');
   const key=crypto.randomUUID()+'.'+ext;await env.MEDIA.put(key,data,{httpMetadata:{contentType:ext==='jpg'?'image/jpeg':'image/'+ext}});return json({url:'/media/'+key});
  }
  fail(404,'찾을 수 없습니다.');
 }
 if(path.startsWith('/media/')&&request.method==='GET'){
  const key=path.slice(7);if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))fail(404,'이미지를 찾을 수 없습니다.');
  if(!await admin(request,env)){
   const p=await env.DB.prepare('SELECT id FROM posts WHERE published=1 AND (cover=? OR EXISTS(SELECT 1 FROM json_each(posts.gallery) WHERE value=?)) LIMIT 1').bind(path,path).first();if(!p)fail(404,'이미지를 찾을 수 없습니다.');
  }
  const image=await env.MEDIA.get(key);if(!image)fail(404,'이미지를 찾을 수 없습니다.');return new Response(image.body,{headers:{'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'no-store'}});
 }
 if(path.startsWith('/api/'))fail(404,'찾을 수 없습니다.');
  if(path==='/news'||path==='/news/')return Response.redirect(url.origin+'/content.html?kind=news',302);
 if(!['GET','HEAD'].includes(request.method))fail(405,'지원하지 않는 요청입니다.');
 return env.ASSETS.fetch(request);
}
export default {async fetch(request,env){
 let response;try{response=await route(request,env)}catch(e){response=json({error:e.status?e.message:'처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'},e.status||500)}
 const out=new Response(response.body,response);out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Referrer-Policy','strict-origin-when-cross-origin');out.headers.set('X-Frame-Options','DENY');out.headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return out;
}};
