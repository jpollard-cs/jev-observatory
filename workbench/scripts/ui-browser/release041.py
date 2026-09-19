from pathlib import Path
from playwright.sync_api import sync_playwright
from module_bridge import launch
import json,time,urllib.request,os
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('WORKBENCH_UI_OUTPUT',str(ROOT/'runtime/ui-validation')));OUT.mkdir(parents=True,exist_ok=True);BASE=os.environ.get('WORKBENCH_TEST_URL','http://127.0.0.1:8791');checks=[]
def check(name,ok,details=None):
 checks.append({'name':name,'passed':bool(ok),'details':details})
 print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(str(details or name))
def nav(p,tab):
 if p.viewport_size['width']<=760:p.locator('#menu-toggle').click()
 p.locator('[data-nav="'+tab+'"]').click();p.wait_for_timeout(50)
def distribution(p):return p.locator('td.expected-operation').evaluate_all('(xs)=>xs.reduce((a,x)=>(a[x.dataset.expected]=(a[x.dataset.expected]||0)+1,a),{})')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('WORKBENCH_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=launch(b,ROOT,BASE)
 nav(page,'evidence');check('ES-module Evidence view renders actual rows',page.locator('tr[data-row]').count()==64,page.errors)
 expect={'rich_control':{'allow':45,'block':3},'compact_both':{'allow':45,'block':3},'inspection_question':{'allow':64},'inspection_criteria':{'allow':64},'strict_question':{'allow':16,'review':4,'block':44},'strict_criteria':{'allow':16,'review':4,'block':44},'contextual_question':{'allow':26,'review':6,'block':32},'contextual_criteria':{'allow':26,'review':6,'block':32}}
 for cid,expected in expect.items():
  page.select_option('#condition-select',cid);check('Actual expected labels '+cid,distribution(page)==expected,distribution(page))
 page.select_option('#condition-select','strict_criteria');page.select_option('#expected-filter','block');check('Expected block filter',page.locator('tr[data-row]').count()==44)
 key=page.locator('tr[data-row]').first.get_attribute('data-row');page.locator('tr[data-row]').first.click();page.wait_for_selector('#detail[open]')
 check('Inspector uses clicked observation identity',key in page.locator('#detail-content').text_content())
 page.locator('[data-action=close-modal]').click();page.locator('[data-action=reset-filters]').click()
 page.screenshot(path=str(OUT/'evidence-fixed.png'),full_page=False)
 for report in ['compact-single-pass-48-v1','prompt-variant-lab-v1','boundary-fewshot-v2','original-campaign','original-encoding','consumer-admission-v1']:
  options=page.locator('#report-select option').evaluate_all('(xs)=>xs.map(x=>x.value)')
  rid=next((x for x in options if report in x),None);check('Archived report is selectable '+report,bool(rid),options)
  page.select_option('#report-select',rid);page.wait_for_timeout(400)
  conditions=page.locator('#condition-select option').evaluate_all('(xs)=>xs.map(x=>x.value)')
  for cid in conditions:
   page.select_option('#condition-select',cid);check('Render '+report+'/'+cid,not page.errors and page.locator('tr[data-row]').count()>0,page.errors)
 # Verify no old global-error recursion if intentionally invalid action
 nav(page,'original');page.locator('[data-original-option=maxUsd]').fill('');page.locator('[data-original-option=maxUsd]').blur()
 page.locator('[data-original-preset=extensions]').click();check('Changing suite ignores unfinished budget',not page.locator('.error').count())
 check('Inactive matrix factors are disabled',page.locator('[data-original-factor=lengths]:enabled').count()==0)
 page.locator('[data-action=original-export]').click();check('Export selection not blocked by budget',not page.errors)
 page.locator('[data-original-option=maxUsd]').fill('100');page.locator('[data-original-option=maxUsd]').blur();page.locator('[data-action=original-preview]').click();page.wait_for_timeout(500)
 check('Original planner accepts large budget',not page.locator('.error').count(),page.locator('.error').all_text_contents())
 check('Catalog saturation message shown','entire eligible catalog' in page.locator('.budget-coverage').inner_text())
 nav(page,'planner');page.locator('[data-plan=maxUsd]').fill('50');page.locator('[data-plan=maxUsd]').blur();page.locator('[data-tier=gold]').click();page.locator('[data-action=plan]').first.click();page.wait_for_timeout(1000)
 check('Current policy planner accepts $50',not page.locator('.error').count(),page.locator('.error').all_text_contents());check('Unused budget visible','Unallocated' in page.locator('.budget-coverage').inner_text())
 page.screenshot(path=str(OUT/'budget-fixed.png'),full_page=False)
 page.locator('[data-plan=maxUsd]').fill('0');page.locator('[data-plan=maxUsd]').blur();page.locator('[data-action=plan]').first.click();page.wait_for_timeout(250)
 check('Invalid active budget shows recoverable error',page.locator('.error').count()==1 and not page.errors)
 nav(page,'policy');page.locator('[data-action=compile]').click();page.wait_for_timeout(300);check('Unfinished planner budget cannot block policy compilation',not page.locator('.error').count(),page.errors)
 nav(page,'evidence');check('Unfinished planner budget cannot block evidence',page.locator('tr[data-row]').count()>0 and not page.errors)
 nav(page,'connection');check('Connection source selector present',page.locator('#jev-session-key').count()==1);check('Key never stored in localStorage',page.evaluate("Object.values(localStorage.data).every(v=>!v.includes('apiKey'))"))
 page.screenshot(path=str(OUT/'connection.png'),full_page=False)
 nav(page,'selection');page.locator('[data-action=prepare-rank]').click();page.wait_for_timeout(300);check('Ranking prep ignores invalid test budget',page.locator('[data-action=review-advisor]').count()==1, page.locator('.error').all_text_contents())
 # no paid action here; authorize without key routes to setup.
 page.locator('[data-action=review-advisor]').click();page.wait_for_timeout(100);check('No-key review routes to connection',page.locator('#jev-session-key').count()==1)
 for tab in ['overview','context','provenance']:
  nav(page,tab);check('Remaining view '+tab,not page.errors,page.errors)
 mobile=launch(b,ROOT,BASE,390,844)
 for tab in ['connection','evidence','planner','selection','original','overview']:
  nav(mobile,tab);check('Mobile no overflow '+tab,mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'),mobile.errors);check('Mobile no render exceptions '+tab,not mobile.errors,mobile.errors)
 tall=launch(b,ROOT,BASE,1080,1920);box=tall.locator('.sidebar').bounding_box();check('Sidebar remains full portrait height',box['height']==1920 and box['y']==0,box)
 check('No render errors across ES modules',not page.errors,page.errors)
 OUT.joinpath('browser-checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'browser':'Chromium','transport':'Local API test bridge; ES modules loaded separately preserving lexical scopes. Direct loopback navigation blocked by environment.','providerCalls':0},indent=2))
 b.close()
