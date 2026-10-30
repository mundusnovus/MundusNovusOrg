/* Christian Systems Cloud transport. GPL-3.0-only. App passwords stay on this device.
 * Only the fixed Cloud origin receives credentials. Every save is conditional.
 */
(function(global){
'use strict';
const origin='https://cloud.christiansystems.org', key='cs.cloud.device.v1';
let credentials=null;try{credentials=JSON.parse(localStorage.getItem(key)||'null');}catch{}
const encode=path=>path.split('/').map(encodeURIComponent).join('/');
const safe=path=>{if(!path.startsWith('/')||path.split('/').some(p=>p==='.'||p==='..'||/[\\\x00-\x1f]/.test(p)))throw Error('Invalid Cloud path.');return path;};
const readProp=(n,name)=>n.getElementsByTagNameNS('*',name)[0]?.textContent||'';
const client={
 connected:()=>!!credentials,
 disconnect(){credentials=null;localStorage.removeItem(key);},
 async connect(){
  // Open synchronously so browsers associate this window with the person's click.
  const popup=global.open('about:blank','christian-cloud-login','width=720,height=760');
  if(!popup)throw Error('Allow a sign-in window to connect Cloud.');
  popup.opener=null;
  try{
   const r=await fetch(origin+'/index.php/login/v2',{method:'POST',credentials:'omit'});if(!r.ok)throw Error('Cloud sign-in is unavailable.');
   const flow=await r.json(),login=new URL(flow.login),poll=new URL(flow.poll.endpoint);
   if(login.origin!==origin||poll.origin!==origin)throw Error('Cloud returned an unexpected sign-in address.');
   popup.location=login.href;
   const deadline=Date.now()+10*60*1000;
   while(Date.now()<deadline){
    const result=await fetch(poll.href,{method:'POST',credentials:'omit',body:new URLSearchParams({token:flow.poll.token})});
    if(result.ok){const c=await result.json();if(new URL(c.server).origin!==origin||!c.loginName||!c.appPassword)throw Error('Cloud returned an invalid device login.');credentials={user:c.loginName,password:c.appPassword};localStorage.setItem(key,JSON.stringify(credentials));popup.close();return;}
    if(result.status!==404)throw Error('Cloud sign-in failed.');
    if(popup.closed)throw Error('Sign-in was closed. Try connecting again.');
    await new Promise(resolve=>setTimeout(resolve,1500));
   }
   throw Error('Sign-in expired. Connect again.');
  }catch(e){popup.close();throw e;}
 },
 async request(path,options={}){
  if(!credentials)throw Error('Connect Christian Cloud first.');
  safe(path);
  const encoded=new TextEncoder().encode(credentials.user+':'+credentials.password);let raw='';for(const b of encoded)raw+=String.fromCharCode(b);
  const response=await fetch(origin+'/remote.php/dav/files/'+encodeURIComponent(credentials.user)+encode(path),{...options,credentials:'omit',redirect:'error',headers:{...options.headers,Authorization:'Basic '+btoa(raw)}});
  if(response.status===401)throw Error('This Cloud connection has expired. Disconnect and connect again.');
  return response;
 },
 async mkdir(path){const r=await this.request(path,{method:'MKCOL'});if(!r.ok&&r.status!==405)throw Error('Could not create the Cloud folder.');},
 async list(path='/'){
  const r=await this.request(path,{method:'PROPFIND',headers:{Depth:'1','Content-Type':'application/xml'},body:'<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><d:resourcetype/><d:getetag/><d:getlastmodified/><oc:fileid/></d:prop></d:propfind>'});
  if(!r.ok)throw Error('Could not open the Cloud folder ('+r.status+').');
  const xml=new DOMParser().parseFromString(await r.text(),'application/xml');if(xml.querySelector('parsererror'))throw Error('Cloud returned an unreadable folder.');
  const prefix='/remote.php/dav/files/'+encodeURIComponent(credentials.user);
  return [...xml.getElementsByTagNameNS('DAV:','response')].flatMap(n=>{
   const href=new URL(readProp(n,'href'),origin);if(href.origin!==origin||!href.pathname.startsWith(prefix+'/'))return [];
   const decoded=decodeURIComponent(href.pathname.slice(prefix.length));if(decoded.replace(/\/$/,'')===path.replace(/\/$/,''))return [];
   const good=[...n.getElementsByTagNameNS('DAV:','propstat')].find(p=>/ 200 /.test(readProp(p,'status')));if(!good)return [];
   return [{path:decoded,name:readProp(good,'displayname')||decoded.split('/').filter(Boolean).pop(),id:readProp(good,'fileid'),etag:readProp(good,'getetag'),modified:readProp(good,'getlastmodified'),directory:good.getElementsByTagNameNS('DAV:','collection').length>0}];
  });
 },
 async read(path){const r=await this.request(path);if(!r.ok)throw Error('Could not read the Cloud file.');return {data:await r.text(),etag:r.headers.get('etag')};},
 async save(path,data,etag){
  const r=await this.request(path,{method:'PUT',headers:etag?{'If-Match':etag}:{'If-None-Match':'*'},body:data});
  if(r.status===412)throw Error('This file changed in Cloud. Open it again, or save with a new name.');
  if(r.status===507)throw Error('Cloud storage is full. Your local work is still here.');
  if(!r.ok)throw Error('Cloud could not save this file ('+r.status+').');
  // Do not silently overwrite later if a proxy fails to return an ETag.
  return r.headers.get('etag');
 },
 editorUrl(id){return origin+'/edit/'+encodeURIComponent(id);}
};
global.csCloud=client;
})(window);
