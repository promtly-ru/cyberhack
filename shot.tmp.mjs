import { chromium } from 'playwright';
const [app,w,h]=process.argv.slice(2); const W=+w,H=+h;
const url=app==='site'?'http://localhost:4198/':'http://localhost:4199/';
const b = await chromium.launch({ channel: 'msedge' });
const ctx=await b.newContext({viewport:{width:W,height:H},hasTouch:W<800,serviceWorkers:'block'}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,80)));
const ovf=()=>pg.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
await pg.goto(url,{waitUntil:'commit',timeout:30000}); await pg.waitForTimeout(3000);
const r={};
if(app==='site'){ r.menu=await ovf(); const hs=new Set(); for(let i=0;i<10;i++){hs.add(await pg.evaluate(()=>Math.round(document.querySelector('.hero h1').getBoundingClientRect().height))); await pg.waitForTimeout(500);} r.h1=[...hs].join('/');
  r.fullPageOvf=await ovf(); }
else { await pg.getByText('Я уже умею играть').click({force:true}); await pg.waitForTimeout(700);
  for (const id of ['menu-howto','menu-profile','menu-download','menu-weekly']) { try{ await pg.click(`[data-testid=${id}]`,{force:true}); await pg.waitForTimeout(700); r[id]=await ovf(); await pg.reload({waitUntil:'commit'}); await pg.waitForTimeout(1500); const s=pg.getByText('Я уже умею играть'); if(await s.count()) await s.click({force:true}); await pg.waitForTimeout(500);}catch(e){r[id]='ERR'} } }
console.log(app,W+'x'+H,JSON.stringify(r),JSON.stringify(errs.slice(0,2)));
await b.close();
