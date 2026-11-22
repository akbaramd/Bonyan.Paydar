// Read-only visual QA of the localhost pilot. No scan mutations or credentials logged.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
const root = resolve(import.meta.dirname, '../../../..')
const env = Object.fromEntries(readFileSync(resolve(root, 'infra/local/.env'), 'utf8')
  .split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#') && x.includes('='))
  .map(x => { const i=x.indexOf('='); const v=x.slice(i+1).trim(); return [x.slice(0,i), /^['"].*['"]$/.test(v) ? v.slice(1,-1) : v] }))
if (!env.INFRAGRAPH_ADMIN_EMAIL || !env.INFRAGRAPH_ADMIN_PASSWORD) throw Error('Local credentials missing')
const dir=resolve(root,'infra/local/_publish/runtime'); mkdirSync(dir,{recursive:true})
let browser,channel
for(const candidate of ['chrome','msedge']) { try { browser=await chromium.launch({channel:candidate}); channel=candidate; break } catch {} }
if(!browser) throw Error('Chrome and Edge unavailable to Playwright')
const errors=[]
try {
 const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}})
 const page=await ctx.newPage()
 page.on('pageerror',e=>errors.push(e.message.slice(0,180)))
 page.on('console',m=>{if(m.type()==='error') errors.push(m.text().slice(0,180))})
 const base='https://localhost:8443'
 await page.goto(base+'/topology',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'ورود به مرکز مدیریت شبکه'})).toBeVisible()
 await page.getByLabel('ایمیل').fill(env.INFRAGRAPH_ADMIN_EMAIL)
 await page.getByLabel('رمز عبور').fill(env.INFRAGRAPH_ADMIN_PASSWORD)
 await page.getByRole('button',{name:'ورود',exact:true}).click()
 await expect(page.getByRole('heading',{name:'توپولوژی شبکه'})).toBeVisible()
 await expect(page.getByText('SignalR متصل')).toBeVisible({timeout:20000})
 const api={}
 for(const [key,url] of Object.entries({scans:'/api/v1/discovery/scans?siteId=lan',hosts:'/api/v1/discovery/hosts?siteId=lan',graph:'/api/v1/topology/graph?siteId=lan',sites:'/api/v1/sites',scopes:'/api/v1/discovery/host-scope-candidates'})) {
   const r=await ctx.request.get(base+url); api[key]=r.ok()?await r.json():{status:r.status()}
 }
 await page.screenshot({path:resolve(dir,'infragraph-live-desktop.png'),fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:resolve(dir,'infragraph-live-mobile.png'),fullPage:true,animations:'disabled'})
 const jobs=api.scans?.items??[], hosts=api.hosts?.items??[], g=api.graph??{}, edges=g.edges??g.links??[]
 const kinds=(g.nodes??[]).reduce((acc,n)=>{const type=n.deviceKind??n.kind??n.type??n.deviceType??'unknown';acc[type]=(acc[type]??0)+1;return acc},{}); const sampleKeys=Object.keys((g.nodes??[])[0]??{}); const out={kinds,sampleKeys,browser:channel,site:'lan',jobs:jobs.map(j=>({status:j.status,cidrs:j.cidrs,intervalSeconds:j.intervalSeconds,startedAtUtc:j.startedAtUtc,lastSweepAtUtc:j.lastSweepAtUtc})),activeJobs:jobs.filter(j=>['running','pending','cancelling'].includes(j.status)).length,hosts:hosts.length,nodes:(g.nodes??[]).length,edges:edges.length,edgeTypes:edges.reduce((x,e)=>{const k=e.type??e.sourceType??e.kind??'unknown';x[k]=(x[k]??0)+1;return x},{}),graphKeys:Object.keys(g),sites:api.sites?.sites,scopesAvailable:api.scopes?.available,errors,screenshots:[resolve(dir,'infragraph-live-desktop.png'),resolve(dir,'infragraph-live-mobile.png')]}
 writeFileSync(resolve(dir,'infragraph-live-inspection.json'),JSON.stringify(out,null,2))
 console.log(JSON.stringify(out))
} finally {await browser.close()}

