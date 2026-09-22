// @author AVRG3
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { collectPages } from '../src/lib/collector.js';
import { httpPageSource, httpCacheAdapter } from '../src/lib/adapters.js';
import { CachePlanner, ProgressBridge } from '../src/lib/progress.js';
let server: http.Server, base: string;
const received: unknown[] = [], tokens: (string|undefined)[] = [];
beforeAll(async () => {
  server=http.createServer(async (req,res)=> {
    const url=new URL(req.url!,base); tokens.push(req.headers.authorization);
    if(url.pathname==='/redirect') {res.writeHead(302,{location:`${base}/target`});res.end();return;}
    if(url.pathname==='/failure') {res.writeHead(503);res.end('secret response detail');return;}
    if(url.pathname==='/oversized') {res.writeHead(200);res.write(' '.repeat(300));res.end('{}');return;}
    if(url.pathname==='/malformed') {res.end('{broken');return;}
    if(url.pathname==='/hint') { let body='';for await(const chunk of req)body+=chunk;received.push(JSON.parse(body));res.writeHead(204);res.end();return; }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(url.searchParams.has('cursor')?{data:{rows:[{id:2,cents:200}],next:null,total:2,snapshot:'v1'}}:{data:{rows:[{id:1,cents:100}],next:'opaque?x=1&y=2',total:2,snapshot:'v1'}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
const source = (route='/pages')=>({type:'http' as const,url:base+route,itemsPath:'data.rows',nextCursorPath:'data.next',snapshotPath:'data.snapshot',totalPath:'data.total'});
describe('explicit HTTP adapters',()=>{
  it('collects mapped records using an opaque cursor and host-only authentication',async()=>{
    const result=await collectPages({sourceId:'local-synthetic',key:'id',sumFields:['cents'],fetchPage:httpPageSource({...source(),bearerEnv:'DEMO_TOKEN'},{DEMO_TOKEN:'local-test-value'})});
    expect(result.status).toBe('complete');expect(result.summary.sums.cents).toBe('300');expect(tokens.at(-1)).toBe('Bearer local-test-value');
    expect(JSON.stringify(result.checkpoint)).not.toContain('local-test-value');
  });
  it('rejects redirects, bounds streamed bytes and never returns error response content',async()=>{
    for(const route of ['/redirect','/failure','/oversized','/malformed']){
      const r=await collectPages({sourceId:'x',fetchPage:httpPageSource({...source(route),maxPageBytes:100})});
      expect(r.status).toBe('failed');expect(r.nextStep).not.toContain('secret response detail');
    }
  });
  it('rejects absent configured fields, unsupported schemes, missing credentials and a cursor in the base URL',async()=>{
    const r=await collectPages({sourceId:'x',fetchPage:httpPageSource({...source(),nextCursorPath:'no.such.field'})});expect(r.status).toBe('failed');
    expect(()=>httpPageSource({type:'http',url:'file:///tmp/secrets'})).toThrow(/HTTP/);
    expect(()=>httpPageSource({...source(),bearerEnv:'NOT_SET'},{})).toThrow(/not set/);
    expect(()=>httpPageSource({...source(),url:base+'?cursor=a'})).toThrow(/cursor/);
  });
  it('delivers real HTTP cache hints to a compatible bridge and surfaces failures',async()=>{
    const now=Date.now();const planner=new CachePlanner();planner.ingest({version:1,session:'s',call:'c',sequence:0,atMs:now,phase:'finishing'},now);
    const bridge=new ProgressBridge(planner,httpCacheAdapter(base+'/hint'));const r=await bridge.tick(now);
    expect(r.applied).toEqual(['s']);expect(received.at(-1)).toMatchObject({version:1,session:'s',action:'retain',validUntilMs:now+2000});
    const failed=await new ProgressBridge(planner,httpCacheAdapter(base+'/failure')).tick(now);expect(failed.failed).toHaveLength(1);
    expect(JSON.stringify(failed.failed)).not.toContain('secret response detail');
  });
});
