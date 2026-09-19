"""DOM integration through a local API bridge; no browser network-policy changes.
The environment blocks navigation to loopback. HTTP authorization is tested separately
in tests/server.test.mjs; this runner executes the real UI source with an exposed local bridge.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, urllib.request,re,os,shutil
ROOT=Path(__file__).resolve().parent.parent; OUT=ROOT/'validation/browser';OUT.mkdir(exist_ok=True)
base=os.environ.get('WORKBENCH_TEST_URL','http://127.0.0.1:8787'); csrf=None

def bridge(route,data=None):
 global csrf
 if data is None:
  req=urllib.request.Request(base+'/api/'+route)
 else:
  req=urllib.request.Request(base+'/api/'+route,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','Origin':base,'X-Workbench-Token':csrf})
 try:
  with urllib.request.urlopen(req) as r: result=json.load(r)
 except urllib.error.HTTPError as e: result=json.load(e);raise Exception(result.get('error','Local API failed'))
 if route=='bootstrap':csrf=result['csrf']
 return result

def launch_ui(browser,width=1440,height=1080):
 page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
 page.set_content(re.sub(r'<script.*?</script>','',(ROOT/'public/index.html').read_text(),flags=re.S).replace('<link rel="stylesheet" href="/style.css">',''))
 page.add_style_tag(content=(ROOT/'public/style.css').read_text())
 page.expose_function('localApiBridge',bridge)
 page.evaluate("Object.defineProperty(window,'localStorage',{value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});")
 ui=(ROOT/'public/ui.js').read_text().replace('export ','')
 app=(ROOT/'public/app.js').read_text(); app=app[app.index('\n')+1:]
 a=app.index('async function api(');b=app.index('\nfunction save()',a)
 app=app[:a]+"async function api(route,data){return await window.localApiBridge(route,data??null);}"+app[b:]
 page.add_script_tag(content='(async()=>{'+ui+'\n'+app+'\n})();')
 page.wait_for_selector('h1');return page

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or p.chromium.executable_path,args=['--no-sandbox'])
 page=launch_ui(browser);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'overview.png'),full_page=True)
 print('Overview',page.locator('h1').all_text_contents())
 page.locator('[data-nav="policy"]').click();page.locator('[data-preset="contextual"]').click()
 page.locator('[data-action="compile"]').click();page.wait_for_timeout(700)
 print('Policy errors',page.locator('.error').all_text_contents())
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'policy.png'),full_page=True)
 page.locator('[data-nav="planner"]').click();page.locator('[data-tier="gold"]').click();page.locator('[data-action="plan"]').first.click();page.wait_for_timeout(900)
 print('Planner errors',page.locator('.error').all_text_contents())
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'planner.png'),full_page=True)
 page.locator('[data-action="prepare"]').click();page.wait_for_timeout(1300)
 print('Prepared',page.locator('.error').all_text_contents())
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'prepared.png'),full_page=True)
 page.locator('[data-nav="evidence"]').click();page.select_option('#condition-select','contextual_criteria');page.select_option('#row-filter','errors')
 print('Evidence',page.locator('[data-row]').count())
 page.locator('[data-row]').first.click();page.wait_for_timeout(500)
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'case-detail.png'),full_page=True)
 page.locator('[data-action="close-modal"]').click()
 page.locator('[data-nav="context"]').click();page.wait_for_timeout(700)
 print('Context errors',page.locator('.error').all_text_contents())
 page.evaluate("document.getElementById('toast').style.display='none'");page.screenshot(path=str(OUT/'context.png'),full_page=True)
 desktop_overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
 mobile=launch_ui(browser,390,844)
 mobile_checks=[]
 for tab in ['overview','policy','planner','evidence','context','provenance']:
  mobile.locator('[data-nav="'+tab+'"]').click();mobile.wait_for_timeout(200)
  mobile_checks.append({'tab':tab,'overflow':mobile.evaluate('document.documentElement.scrollWidth>innerWidth'),'errors':mobile.locator('.error').all_text_contents()})
 mobile.locator('[data-nav="policy"]').click();mobile.screenshot(path=str(OUT/'mobile-policy.png'),full_page=True)
 result={'browser':'Chromium','execution':'Real UI source using exposed local HTTP bridge; browser loopback navigation blocked by environment policy. No browser policy changed. HTTP security separately tested.','desktopOverflow':desktop_overflow,'mobile':mobile_checks,'pageErrors':errors,'liveCalls':0}
 (OUT/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
 browser.close()
