import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,stat,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exportPublicAudio,parseExportArgs,PUBLIC_AUDIO_MANIFESTS} from '../scripts/export-public-audio.mjs';

const first='a'.repeat(64)+'.mp3',second='b'.repeat(64)+'.mp3';
const audio=Buffer.from('ID3 fixed-course-test-audio');
async function fixture(t,{two=false,missing=false}={}){
  const parent=path.resolve(tmpdir()),prefix='time-atlas-public-audio-test-',root=await mkdtemp(path.join(parent,prefix));
  t.after(async()=>{
    const target=path.resolve(root);
    if(path.dirname(target)!==parent||!path.basename(target).startsWith(prefix)||path.basename(target)===prefix)throw new Error('Unsafe temporary fixture cleanup');
    await rm(target,{recursive:true,force:true});
  });
  await mkdir(path.join(root,'dist'));await mkdir(path.join(root,'.voice-cache'));
  for(const [index,name]of PUBLIC_AUDIO_MANIFESTS.entries()){
    const data={chapters:{first:{audioUrl:'/audio/'+first}},...(two&&index===0?{cues:[{audioUrl:'/audio/'+second}]}:{})};
    await writeFile(path.join(root,'dist',name),JSON.stringify(data));
  }
  await writeFile(path.join(root,'.voice-cache',first),audio);
  if(!missing)await writeFile(path.join(root,'.voice-cache',second),Buffer.from('ID3 unrelated-or-second-audio'));
  await writeFile(path.join(root,'.voice-cache','private-cache-metadata.json'),'not course data');
  return root;
}
const absent=async file=>{await assert.rejects(stat(file),{code:'ENOENT'});};

test('exports unique fixed-course MP3 references only and keeps the original cache unchanged',async t=>{
  const root=await fixture(t),cache=path.join(root,'.voice-cache');
  const before=await Promise.all((await readdir(cache)).map(async name=>[name,await readFile(path.join(cache,name))]));
  const result=await exportPublicAudio({projectDir:root});
  assert.deepEqual(result,{files:1,copied:1,reused:0,bytes:audio.length});
  const out=path.join(root,'.release','public-audio','audio');
  assert.deepEqual(await readdir(out),[first]);assert.deepEqual(await readFile(path.join(out,first)),audio);
  for(const [name,bytes]of before)assert.deepEqual(await readFile(path.join(cache,name)),bytes);
});

test('identical outputs are verified and reused without being overwritten',async t=>{
  const root=await fixture(t),out=path.join(root,'.release','public-audio','audio');
  await exportPublicAudio({projectDir:root});const before=await stat(path.join(out,first));
  assert.deepEqual(await exportPublicAudio({projectDir:root}),{files:1,copied:0,reused:1,bytes:audio.length});
  assert.equal((await stat(path.join(out,first))).mtimeMs,before.mtimeMs);
});

test('a same-name conflict stops the entire preflight before copying another file',async t=>{
  const root=await fixture(t,{two:true}),out=path.join(root,'.release','conflict','audio'),different=Buffer.from('ID3 different output');
  await mkdir(out,{recursive:true});await writeFile(path.join(out,second),different);
  await assert.rejects(exportPublicAudio({projectDir:root,outDir:out}),{code:'OUTPUT_CONFLICT'});
  await absent(path.join(out,first));assert.deepEqual(await readFile(path.join(out,second)),different);
});

test('missing sources fail before output creation and do not reveal the source directory',async t=>{
  const root=await fixture(t,{two:true,missing:true});
  await assert.rejects(exportPublicAudio({projectDir:root}),error=>error.code==='MISSING_AUDIO'&&!error.message.includes(root));
  await absent(path.join(root,'.release'));
});

test('project, source, dist, cache and ancestor outputs are rejected',async t=>{
  const root=await fixture(t);
  for(const outDir of [root,path.join(root,'dist','audio'),path.join(root,'.voice-cache'),path.join(root,'scripts','audio'),path.dirname(root)])
    await assert.rejects(exportPublicAudio({projectDir:root,outDir}),{code:'PROTECTED_OUTPUT'});
  await absent(path.join(root,'scripts'));
});

test('directory junctions cannot redirect an export into the source cache',async t=>{
  const root=await fixture(t),release=path.join(root,'.release'),link=path.join(release,'linked');
  await mkdir(release);
  try{await symlink(path.join(root,'.voice-cache'),link,process.platform==='win32'?'junction':'dir');}
  catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Directory links unavailable');return;}throw error;}
  await assert.rejects(exportPublicAudio({projectDir:root,outDir:path.join(link,'audio')}),{code:'OUTPUT_LINK'});
  await absent(path.join(root,'.voice-cache','audio'));
});

test('invalid audio URLs cannot escape the fixed manifest allowlist',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'dist',PUBLIC_AUDIO_MANIFESTS[0]),JSON.stringify({audioUrl:'/audio/../../private.mp3'}));
  await assert.rejects(exportPublicAudio({projectDir:root}),{code:'INVALID_REFERENCE'});
  await absent(path.join(root,'.release'));
});

test('CLI options are explicit and errors do not print local absolute paths',()=>{
  assert.deepEqual(parseExportArgs([]),{});assert.deepEqual(parseExportArgs(['--help']),{help:true});
  assert.deepEqual(parseExportArgs(['--out','release-audio']),{outDir:path.resolve('release-audio')});
  for(const args of [['--out'],['--unknown'],['--out','a','--out','b']])assert.throws(()=>parseExportArgs(args),{code:'INVALID_ARGUMENTS'});
  const script=fileURLToPath(new URL('../scripts/export-public-audio.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'--unknown'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/INVALID_ARGUMENTS/);assert.equal(result.stderr.includes(path.dirname(script)),false);assert.equal(result.stdout,'');
});
