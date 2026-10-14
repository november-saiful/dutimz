import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const port=3201, origin=`http://localhost:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,NEXT_PUBLIC_DEMO_MODE:'true'},stdio:'ignore'});
async function ready(){for(let i=0;i<40;i++){try{if((await fetch(origin)).ok)return}catch{} await new Promise(r=>setTimeout(r,500));}throw Error('not ready')}
try { await ready(); const browser=await chromium.launch(); for(const width of [1920,1440,414,390]) { const page=await browser.newPage({viewport:{width,height:900}}); await page.route('**/*',h=>h.request().url().startsWith(origin)?h.continue():h.abort()); page.on('console',m=>{if(m.type()==='error')console.log(`CONSOLE ${width}: ${m.text().slice(0,2500)}`)}); page.on('pageerror',e=>console.log(`PAGEERROR ${width}: ${String(e).slice(0,2500)}`)); await page.goto(origin,{waitUntil:'load'}); await page.waitForTimeout(1200); console.log(`DONE ${width}`); await page.close(); } await browser.close(); } finally {server.kill('SIGTERM')}
