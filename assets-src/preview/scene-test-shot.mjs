import {chromium} from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.wasm':'application/wasm'};
const srv=http.createServer((q,s)=>{const p='.'+decodeURIComponent(q.url.split('?')[0]);fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();return;}s.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});}).listen(8765);
const b=await chromium.launch({headless:true,args:['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'],executablePath:'/opt/pw-browsers/chromium',ignoreDefaultArgs:['--headless=old'],args2:['x'],_a:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage({viewport:{width:1280,height:720}});
pg.on('console',m=>{if(m.type()==='error')console.log('ERR',m.text())}); pg.on('pageerror',e=>console.log('PAGEERR',e.message));
for(const [name,qs] of JSON.parse(process.argv[2])){
  await pg.goto('http://localhost:8765/index.html?'+qs); await pg.waitForFunction('window.DONE===true',{timeout:180000});
  await pg.screenshot({path:name}); console.log('shot',name);
}
await b.close(); srv.close();
