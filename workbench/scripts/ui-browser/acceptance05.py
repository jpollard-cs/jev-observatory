"""Rebuilt 0.5 acceptance. Default: actual local HTTP app. --bridge is explicitly reported.
Requires Python Playwright and a Chromium executable. Uses synthetic setup server only for
paid-flow checks; never accepts a real provider key. All exposed API behavior is production code.
"""
import argparse,json,sys,urllib.request,subprocess,shutil,time
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--root',default=str(Path(__file__).resolve().parents[2]));parser.add_argument('--base',default='http://127.0.0.1:8793');parser.add_argument('--out',required=True);parser.add_argument('--bridge',action='store_true');parser.add_argument('--mock-runtime');parser.add_argument('--chromium',default=shutil.which('chromium'));args=parser.parse_args()
root=Path(args.root);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
from module_bridge import launch
checks=[];errors=[]
def check(name,ok,detail=None):
 checks.append({'name':name,'pass':bool(ok),'detail':detail})
 if not ok:raise AssertionError(name+': '+str(detail))
def get(route):
 with urllib.request.urlopen(args.base+'/api/'+route) as r:return json.load(r)
def calls():return json.loads((Path(args.mock_runtime)/'synthetic-call-count.json').read_text())['calls'] if args.mock_runtime else None
with sync_playwright() as playwright:
 browser=playwright.chromium.launch(headless=True,**({'executable_path':args.chromium} if args.chromium else {}))
 def page_at(w=1440,h=1080):
  if args.bridge:return launch(browser,root,args.base,w,h)
  page=browser.new_page(viewport={'width':w,'height':h},reduced_motion='reduce');page.errors=[];page.on('pageerror',lambda e:page.errors.append(str(e)));page.goto(args.base);page.wait_for_selector('h1');return page
 page=page_at();boot=get('bootstrap')
 def nav(name):page.locator('.sidebar [data-nav="'+name+'"]').click();page.wait_for_timeout(80)
 def act(name):page.locator('[data-action="'+name+'"]').first.click();page.wait_for_timeout(100)
 def overflow(p):return p.evaluate('document.documentElement.scrollWidth>innerWidth+1')
 check('starts with guided application view','Build a policy' in page.locator('h1').inner_text())
 check('five-step rail without fabricated completion',page.locator('.step-rail .step').count()==5 and '0 / 3' in page.locator('.journey-caption').inner_text())
 check('galaxy defaults on',page.evaluate("document.documentElement.dataset.galaxy==='on'"))
 check('startup has no synthetic inference',calls() in [None,0])
 nav('evidence');check('evidence is available before setup',page.locator('h1').count()==1 and len(page.errors)==0)
 nav('start');page.locator('[data-start="name"]').fill('Billing review');page.locator('[data-start="description"]').fill('Review billing conversations and structured records in English and Spanish. Admit relevant task data; never approve refunds from untrusted notes.');page.locator('[data-start="description"]').press('Tab')
 check('typing does not request model advice',calls() in [None,0]);page.screenshot(path=str(out/'start.png'),full_page=True)
 act('guided-review-rules');check('first review advances to rules','See what changes' in page.locator('h1').inner_text());check('policy tradeoffs not security score',page.locator('.boundary-card').count()==3 and 'UNMEASURED DRAFT' in page.inner_text('body'))
 page.screenshot(path=str(out/'rules.png'),full_page=True)
 act('guided-choose-tests');check('two reviewed setup steps','2 / 3' in page.locator('.journey-caption').inner_text())
 page.locator('[data-plan="maxUsd"]').fill('');page.locator('[data-plan="maxUsd"]').press('Tab');nav('evidence');check('blank budget cannot block evidence',len(page.errors)==0 and page.locator('#evidence-table').count()>0)
 nav('planner');page.locator('[data-plan="maxUsd"]').fill('50');page.locator('[data-plan="maxUsd"]').press('Tab');act('plan');page.wait_for_selector('[data-action="guided-save-plan"]');check('large budget accepted',not page.locator('.error').count());check('catalog saturation explained','All eligible tests fit' in page.inner_text('body'));check('advanced input-size cap is hidden by default',not page.locator('[data-plan="maxInputTokens"]').is_visible());
 page.screenshot(path=str(out/'planner.png'),full_page=True)
 act('guided-save-plan');page.wait_for_selector('#run-command');command=page.locator('#run-command').inner_text();check('review uses exact CLI plan approval','--confirm' in command and '--live' in command and '--plan' in command);check('command is valid shell syntax',subprocess.run(['bash','-n'],input=command,text=True,capture_output=True).returncode==0);check('saved is not marked executed','This draft has not run' in page.locator('.journey-caption').inner_text());page.screenshot(path=str(out/'review.png'),full_page=True)
 # Assertions against every recorded condition, retaining normal module lexical scope.
 nav('evidence');conditions=0;rows=0
 for run in boot['recordedRuns']:
  page.locator('#report-select').select_option(run['id']);page.wait_for_timeout(80);report=get('evidence?id='+run['id'])
  for cond in report['conditions']:
   page.locator('#condition-select').select_option(cond['id']);page.wait_for_timeout(20)
   check('evidence condition renders: '+run['id']+'/'+cond['id'],not page.locator('.error').count() and len(page.errors)==0)
   check('condition selection remains bound: '+run['id']+'/'+cond['id'],page.locator('#condition-select').input_value()==cond['id'])
   conditions+=1;rows+=len(cond['rows'])
   selectable=page.locator('tr[data-row]')
   if selectable.count() and (conditions%9==0 or conditions==1):
    key=selectable.first.get_attribute('data-row');selectable.first.click();page.wait_for_timeout(60);check('bound inspector opens: '+str(conditions),page.locator('#detail').is_visible());act('close-modal')
 check('all six archived reports accessible',len(boot['recordedRuns'])==6,{'conditions':conditions,'rows':rows})
 page.locator('#report-select').select_option('consumer-admission-v1');page.wait_for_timeout(100);page.locator('#condition-select').select_option('strict_criteria');page.wait_for_timeout(100)
 page.locator('#expected-filter').select_option('block');page.wait_for_timeout(100);check('strict expected-block filter has rows',page.locator('tr[data-row]').count()>0)
 check('strict block filter not relabeled allow',set(page.locator('.expected-operation').evaluate_all('(xs)=>xs.map(x=>x.dataset.expected)'))=={'block'})
 page.screenshot(path=str(out/'evidence.png'),full_page=True)
 nav('overview');check('atlas retained',page.locator('canvas').count()>0 and not page.locator('.error').count());page.screenshot(path=str(out/'atlas.png'),full_page=True)
 nav('original');check('historical suite workflow retained','Original' in page.locator('h1').inner_text() or page.locator('[data-original-preset]').count()>0)
 # Explicit synthetic-only paid setup path, using the ordinary production endpoints.
 if args.mock_runtime:
  nav('start');act('setup-prepare');page.wait_for_selector('[data-action="setup-review"]');check('setup preparation does not infer',calls()==0)
  act('setup-request');check('exact setup request inspector contains all definitions','language_scope' in page.locator('#detail-content').inner_text() and 'criteria' in page.locator('#detail-content').inner_text());act('close-modal')
  act('setup-review');check('key is optional until paid approval',page.locator('[data-connection="source"]').count()>0)
  account=str(Path(args.mock_runtime)/'browser-account')
  # Macs with the original research project default to that existing account.
  # The acceptance fixture must explicitly choose its isolated synthetic account.
  page.locator('[data-connection="accountKind"]').select_option('standalone')
  page.locator('[data-connection="directory"]').fill(account);page.locator('[data-connection="directory"]').press('Tab');page.locator('[data-connection="createAccount"]').check();page.locator('#jev-session-key').fill('SYNTHETIC_ONLY_BROWSER_SETUP_KEY_050');act('connect-key');check('key load is offline',calls()==0)
  check('password input clears',page.locator('#jev-session-key').input_value()=='');check('no key in browser storage',not page.evaluate("JSON.stringify(localStorage).includes('SYNTHETIC_ONLY_BROWSER_SETUP_KEY_050')"));
  nav('start');act('setup-review');check('paid review discloses count and exact destination','api.typesafe.ai' in page.locator('#detail-content').inner_text());act('setup-cancel');check('cancel sends nothing',calls()==0)
  act('setup-review');act('setup-confirm');page.wait_for_selector('.suggestion',timeout=15000);check('one and only one simulated request',calls()==1);check('all setup proposals start unchecked',page.locator('[data-setup-pick]:checked').count()==0);check('apply disabled until selection',page.locator('[data-action="setup-apply"]').is_disabled())
  page.screenshot(path=str(out/'suggestions-simulated.png'),full_page=True)
  page.locator('[data-setup-pick="languages"]').check();act('setup-apply');check('selected languages applied',page.evaluate("JSON.parse(localStorage.getItem('jev-workbench-policy-v1')).languages.allowed.join(',')")=='en,es');check('unselected mode not applied',page.evaluate("JSON.parse(localStorage.getItem('jev-workbench-policy-v1')).mode")=='strict');
  act('setup-undo');check('undo restores old languages',page.evaluate("JSON.parse(localStorage.getItem('jev-workbench-policy-v1')).languages.allowed.join(',')")=='en');check('apply and undo make no additional inference',calls()==1)
  report_path=next((Path(args.mock_runtime)/'setup-advice').glob('*.json'));page.locator('#setup-file').set_input_files(str(report_path));page.wait_for_selector('.suggestion');page.locator('[data-start="description"]').fill('A changed application description after advice was returned.');nav('policy');nav('start');check('stale advice cannot be selected',page.locator('[data-setup-pick]:enabled').count()==0);check('stale state visible','stale' in page.locator('#setup-suggestions').inner_text())
  nav('connection');act('forget-key');check('key forgotten without new inference',calls()==1 and not get('connection')['connected'])
 # Mobile and tall-portrait navigation/help, no need for setup or account.
 for width,height in [(390,844),(1080,1920),(1440,2560),(1280,650)]:
  q=page_at(width,height);check(f'no horizontal overflow {width}x{height}',not overflow(q))
  if width>760:
   rect=q.locator('.sidebar').bounding_box();check(f'sidebar spans viewport {width}x{height}',abs(rect['y'])<=1 and abs(rect['height']-height)<=2,rect)
  else:
   q.locator('[data-action="open-menu"]').click();check('mobile full-height drawer',q.locator('.sidebar').bounding_box()['height']>=height-2);q.keyboard.press('Escape');check('mobile escape closes navigation',not q.evaluate("document.body.classList.contains('menu-open')"));
  q.screenshot(path=str(out/f'start-{width}x{height}.png'),full_page=True)
  if width==390:
   q.locator('[data-action="open-menu"]').click();q.locator('.sidebar [data-nav="planner"]').click();q.locator('.advanced>summary').first.click();help_btn=q.get_by_role('button',name='Explain Optional input-size planning limit');help_btn.click();pop=q.locator('.inline-help-popover.open');check('mobile token help explains whole plan','Whole-plan' in pop.inner_text());box=pop.bounding_box();check('help remains within mobile viewport',box['x']>=0 and box['x']+box['width']<=width+1);q.keyboard.press('Escape');check('escape dismisses help',q.locator('.inline-help-popover.open').count()==0);help_btn.click();q.screenshot(path=str(out/'mobile-token-help.png'))
  check(f'no browser module errors {width}x{height}',not q.errors,q.errors);q.close()
 errors.extend(page.errors);check('no primary page module errors',not errors,errors);browser.close()
receipt={'version':'0.5.0-rebuilt','mode':'real ES modules + API-only loopback bridge' if args.bridge else 'direct local HTTP app','browser':'Chromium','checks':len(checks),'passed':sum(c['pass'] for c in checks),'failures':[c for c in checks if not c['pass']],'checkedConditions':conditions,'checkedRows':rows,'syntheticSetupCalls':calls(),'realProviderCalls':0,'checksDetail':checks,'limitations':['Bridge run does not validate browser-to-loopback transport or CSP; HTTP security has separate tests.'] if args.bridge else []}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k!='checksDetail'},indent=2))
