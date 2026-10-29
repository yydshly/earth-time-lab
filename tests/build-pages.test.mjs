import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,stat,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildPages,verifyPages,parsePagesArgs} from '../scripts/build-pages.mjs';
import {PUBLIC_AUDIO_MANIFESTS} from '../scripts/export-public-audio.mjs';

const first='a'.repeat(64)+'.mp3',second='b'.repeat(64)+'.mp3',unused='c'.repeat(64)+'.mp3';
const sourceHtml='<!doctype html><html><head><title>Time Atlas</title></head><body><header class="topbar"><span>世界时间</span></header><main>地球</main></body></html>';
async function fixture(t){
  const parent=path.resolve(tmpdir()),prefix='time-atlas-pages-test-',root=await mkdtemp(path.join(parent,prefix));
  t.after(async()=>{
    const target=path.resolve(root);
    if(path.dirname(target)!==parent||!path.basename(target).startsWith(prefix)||path.basename(target)===prefix)throw new Error('Unsafe temporary fixture cleanup');
    await rm(target,{recursive:true,force:true});
  });
  await mkdir(path.join(root,'dist'));await mkdir(path.join(root,'public','audio'),{recursive:true});
  await writeFile(path.join(root,'dist','index.html'),sourceHtml);
  await writeFile(path.join(root,'dist','app-version.mjs'),"export const endpoint='/api/app-version';\n");
  await writeFile(path.join(root,'dist','voice.mjs'),`export const sample='/audio/${first}'; export const isAudio=p=>p.startsWith('/audio/');\n`);
  await mkdir(path.join(root,'dist','vendor'));await writeFile(path.join(root,'dist','vendor','LICENSE.txt'),'Public library license');
  for(const name of PUBLIC_AUDIO_MANIFESTS)await writeFile(path.join(root,'dist',name),JSON.stringify({chapters:[{audioUrl:'/audio/'+first}]}));
  await writeFile(path.join(root,'public','recorded-voice.json'),JSON.stringify({version:1,model:'speech-test',voiceId:'test-voice',region:'cn',recordings:[{id:'public:introduction',textHash:'d'.repeat(64),audioUrl:'audio/'+second,durationMs:1200}]}));
  await writeFile(path.join(root,'public','audio',first),'ID3 fixed course');await writeFile(path.join(root,'public','audio',second),'ID3 public introduction');
  return root;
}
const absent=async file=>assert.rejects(stat(file),{code:'ENOENT'});
const output=root=>path.join(root,'.release','site');

test('Pages build resolves assets beneath a project subpath and leaves local sources unchanged',async t=>{
  const root=await fixture(t),result=await buildPages({projectDir:root}),out=output(root);
  assert.equal(result.audioFiles,2);assert.match(result.version,/^[a-f\d]{12}$/);
  const html=await readFile(path.join(out,'index.html'),'utf8');
  assert.match(html,/<meta name="time-atlas-deployment" content="recorded">/);assert.match(html,/预录讲解，具体数字以画面为准/);
  assert.match(html,/<header class="topbar"><span id="recorded-deployment-note"/);
  assert.equal(await readFile(path.join(root,'dist','index.html'),'utf8'),sourceHtml);
  assert.equal(await readFile(path.join(root,'dist','app-version.mjs'),'utf8'),"export const endpoint='/api/app-version';\n");
  assert.match(await readFile(path.join(out,'app-version.mjs'),'utf8'),/'\.\/app-version\.json'/);
  const js=await readFile(path.join(out,'voice.mjs'),'utf8');assert.match(js,/'\.\/audio\/a{64}\.mp3'/);assert.match(js,/startsWith\('\/audio\/'\)/);
  const base='https://example.github.io/earth-time-lab/';
  for(const name of [...PUBLIC_AUDIO_MANIFESTS,'recorded-voice.json']){
    const json=JSON.parse(await readFile(path.join(out,name),'utf8'));
    const audioUrl=name==='recorded-voice.json'?json.recordings[0].audioUrl:json.chapters[0].audioUrl;
    assert.match(audioUrl,/^\.\/audio\/[a-f\d]{64}\.mp3$/);assert.equal(new URL(audioUrl,base).pathname,'/earth-time-lab/audio/'+(name==='recorded-voice.json'?second:first));
  }
  assert.equal(JSON.parse(await readFile(path.join(out,'app-version.json'),'utf8')).version,result.version);
  assert.deepEqual(await verifyPages({projectDir:root}),result);
  const before=(await stat(path.join(out,'index.html'))).mtimeMs;
  assert.deepEqual(await buildPages({projectDir:root}),result);assert.equal((await stat(path.join(out,'index.html'))).mtimeMs,before);
  await writeFile(path.join(root,'dist','voice.mjs'),js+'\nexport const revision=2;\n');
  const changed=await buildPages({projectDir:root});assert.notEqual(changed.version,result.version);assert.deepEqual(await verifyPages({projectDir:root}),changed);
});

test('missing prerecorded audio fails the complete preflight before creating output',async t=>{
  const root=await fixture(t);await rm(path.join(root,'public','audio',second));
  await assert.rejects(buildPages({projectDir:root}),error=>error.code==='MISSING_AUDIO'&&!error.message.includes(root));await absent(path.join(root,'.release'));
});

test('only publishable source assets and referenced MP3s enter the output',async t=>{
  const root=await fixture(t),dist=path.join(root,'dist'),publicDir=path.join(root,'public');
  for(const name of ['.env','.voice-settings.json','private.key','secrets.json','credentials.json'])await writeFile(path.join(dist,name),'private test fixture');
  await mkdir(path.join(dist,'.voice-cache'));await writeFile(path.join(dist,'.voice-cache','metadata.json'),'private test fixture');
  await writeFile(path.join(publicDir,'.voice-settings.json'),'private test fixture');await writeFile(path.join(publicDir,'audio','cache.json'),'private test fixture');await writeFile(path.join(publicDir,'audio',unused),'ID3 unpublished audio');
  await writeFile(path.join(root,'.env.minimax'),'private test fixture');
  await buildPages({projectDir:root});
  assert.deepEqual((await readdir(path.join(output(root),'audio'))).sort(),[first,second]);
  for(const name of ['.env','.env.minimax','.voice-settings.json','private.key','secrets.json','credentials.json','.voice-cache'])await absent(path.join(output(root),name));
  assert.equal(await readFile(path.join(output(root),'vendor','LICENSE.txt'),'utf8'),'Public library license');
});

test('machines paths, private JSON configuration, invalid refs and empty course indexes fail closed',async t=>{
  for(const [name,content,code]of [
    ['private.json',JSON.stringify({apiKey:'private test fixture'}),'SECRET_CONTENT'],
    ['path.mjs',"export const location='C:\\Users\\private\\config';",'MACHINE_PATH'],
    ['voice.mjs',"export const clip='/audio/../../private.mp3';",'INVALID_AUDIO_REFERENCE'],
    [PUBLIC_AUDIO_MANIFESTS[0],'{}','EMPTY_MANIFEST'],
  ]){
    const root=await fixture(t);await writeFile(path.join(root,'dist',name),content);
    await assert.rejects(buildPages({projectDir:root}),error=>error.code===code&&!error.message.includes(root));await absent(path.join(root,'.release'));
  }
});

test('output must remain strictly inside .release and unexpected output files are preserved',async t=>{
  const root=await fixture(t);
  for(const outDir of [root,path.join(root,'dist'),path.join(root,'public','audio'),path.join(root,'.release'),path.dirname(root)])await assert.rejects(buildPages({projectDir:root,outDir}),{code:'PROTECTED_OUTPUT'});
  const out=output(root);await mkdir(out,{recursive:true});await writeFile(path.join(out,'keep-me.txt'),'user-owned fixture');
  await assert.rejects(buildPages({projectDir:root}),{code:'UNEXPECTED_OUTPUT'});assert.equal(await readFile(path.join(out,'keep-me.txt'),'utf8'),'user-owned fixture');await absent(path.join(out,'index.html'));
});

test('directory junctions and output hard links cannot redirect writes into original sources',async t=>{
  const root=await fixture(t),release=path.join(root,'.release');await mkdir(release);
  try{await symlink(path.join(root,'dist'),path.join(release,'linked'),process.platform==='win32'?'junction':'dir');}
  catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Directory links unavailable');return;}throw error;}
  await assert.rejects(buildPages({projectDir:root,outDir:path.join(release,'linked','site')}),{code:'OUTPUT_LINK'});
  await mkdir(output(root));await link(path.join(root,'dist','index.html'),path.join(output(root),'index.html'));
  await assert.rejects(buildPages({projectDir:root}),{code:'OUTPUT_HARDLINK'});assert.equal(await readFile(path.join(root,'dist','index.html'),'utf8'),sourceHtml);
});

test('verification detects modified output and CLI accepts only explicit bounded options',async t=>{
  const root=await fixture(t);await buildPages({projectDir:root});await writeFile(path.join(output(root),'index.html'),'changed fixture');
  await assert.rejects(verifyPages({projectDir:root}),{code:'VERIFY_FAILED'});
  assert.deepEqual(parsePagesArgs([]),{verify:false});assert.deepEqual(parsePagesArgs(['--verify']),{verify:true});assert.deepEqual(parsePagesArgs(['--help']),{help:true});
  for(const args of [['--out'],['--verify','--verify'],['--unknown'],['--out','a','--out','b']])assert.throws(()=>parsePagesArgs(args),{code:'INVALID_ARGUMENTS'});
});
