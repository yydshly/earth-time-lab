import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {isVersionedAppFile,appContentVersion,createAppVersionService} from '../app-version-service.mjs';
import {observeAppVersion} from '../dist/app-version-model.mjs';
import {createAppServer} from '../server.mjs';

test('only published entry documents, modules and styles enter the release ID',()=>{
  const entry=(name,isFile=true)=>({name,isFile:()=>isFile});
  for(const name of ['index.html','app.mjs','style.css'])assert.equal(isVersionedAppFile(entry(name)),true);
  for(const name of ['.env','.private.mjs','tour-audio.json','profile.json','voice.mp3','image.png'])assert.equal(isVersionedAppFile(entry(name)),false);
  assert.equal(isVersionedAppFile(entry('app.mjs',false)),false);
});

test('version is content based and independent of file enumeration order',()=>{
  const files=[{name:'app.mjs',content:'start()'},{name:'index.html',content:'<main></main>'}];
  const first=appContentVersion(files);assert.match(first,/^[a-f0-9]{12}$/);
  assert.equal(first,appContentVersion([...files].reverse()));
  assert.notEqual(first,appContentVersion([{...files[0],content:'start(2)'},files[1]]));
  assert.notEqual(first,appContentVersion([{...files[0],name:'other.mjs'},files[1]]));
});

test('service caches unmodified content and ignores generated audio/configuration',async()=>{
  let revision=1,content='page',reads=0,metadataReads=0;
  const files={
    readdir:async()=>['index.html','app.mjs','tour-audio.json','.env'].map(name=>({name,isFile:()=>true})),
    stat:async()=>{metadataReads++;return {size:content.length,mtimeMs:revision};},
    readFile:async file=>{reads++;const name=path.basename(file);assert.ok(['index.html','app.mjs'].includes(name));return Buffer.from(content);}
  };
  const service=createAppVersionService({root:'published-test-root',files});
  const initial=await service.getVersion();assert.equal(reads,2);
  assert.equal(await service.getVersion(),initial);assert.equal(reads,2);assert.equal(metadataReads,4);
  revision++;assert.equal(await service.getVersion(),initial);assert.equal(reads,4);
  content='new page';revision++;assert.notEqual(await service.getVersion(),initial);
});

test('client holds the loaded version fixed and rejects missing or malformed releases',()=>{
  const first=observeAppVersion({}, {app:'earth-time-lab',version:'aaaaaaaaaaaa'});
  assert.equal(first.updateAvailable,false);assert.equal(first.loadedVersion,'aaaaaaaaaaaa');
  const changed=observeAppVersion(first,{app:'earth-time-lab',version:'bbbbbbbbbbbb'});
  assert.equal(changed.loadedVersion,first.loadedVersion);assert.equal(changed.updateAvailable,true);
  for(const response of [null,{app:'other',version:'cccccccccccc'},{app:'earth-time-lab',version:'bad'}]){
    const ignored=observeAppVersion(changed,response);assert.equal(ignored.accepted,false);assert.equal(ignored.loadedVersion,first.loadedVersion);assert.equal(ignored.availableVersion,changed.availableVersion);assert.equal(ignored.updateAvailable,true);
  }
  assert.equal(observeAppVersion(changed,{app:'earth-time-lab',version:'aaaaaaaaaaaa'}).updateAvailable,false);
});

test('version endpoint is local, no-store and contains only the public release identifier',async t=>{
  const server=createAppServer({voiceService:{},appVersionService:{getVersion:async()=> '0123456789ab'}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/api/app-version');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{app:'earth-time-lab',version:'0123456789ab'});
  const blocked=await fetch(origin+'/api/app-version',{headers:{origin:'https://external.example'}});assert.equal(blocked.status,403);
  assert.equal((await fetch(origin+'/api/app-version',{method:'POST'})).status,404);
});
