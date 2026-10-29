import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.release/site');
const base='/earth-time-lab/';
const port=Number(process.env.PREVIEW_PORT||4321);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json','.mp3':'audio/mpeg','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Static preview: no API backend.');return;}
    if(!pathname.startsWith(base)){res.writeHead(404);res.end('Use '+base);return;}
    const relative=decodeURIComponent(pathname.slice(base.length))||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    let start=0,end=info.size-1,partial=false;
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!match||!match[1]&&!match[2]){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return;}
      if(!match[1])start=Math.max(0,info.size-Number(match[2]));
      else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return;}
      partial=true;
    }
    const headers={'content-type':mime[path.extname(file)]||'application/octet-stream','content-length':end-start+1,'accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff'};
    if(partial)headers['content-range']=`bytes ${start}-${end}/${info.size}`;
    res.writeHead(partial?206:200,headers);if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.headersSent)res.writeHead(404);res.end('Static file not found.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Recorded site preview: http://127.0.0.1:${port}${base}`));
