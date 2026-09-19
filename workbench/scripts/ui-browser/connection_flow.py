from module_bridge import launch
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os,subprocess,atexit
ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('WORKBENCH_UI_OUTPUT',str(ROOT/'runtime/ui-validation')));OUT.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node',str(Path(__file__).with_name('mock-connection-server.mjs'))],stdout=subprocess.PIPE,text=True)
atexit.register(lambda:server.terminate());info=json.loads(server.stdout.readline());assert info['synthetic'] is True
TMP=Path(info['dir']);BASE=info['base'];KEY='TEST_ONLY_NOT_A_REAL_PROVIDER_KEY_041'
checks=[]
def check(name,ok):
 print(('PASS ' if ok else 'FAIL ')+name,flush=True);checks.append({'name':name,'passed':bool(ok)});assert ok,name
def count():return json.loads((TMP/'calls.json').read_text())['calls'] if (TMP/'calls.json').exists() else 0
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('WORKBENCH_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);page=launch(b,ROOT,BASE)
 page.locator('[data-nav=connection]').click();page.locator('[data-connection=accountKind]').select_option('standalone');page.locator('[data-connection=directory]').fill(str(TMP/'account'));page.locator('[data-connection=directory]').blur();page.locator('[data-connection=createAccount]').check();page.locator('[data-connection=accountLimitUsd]').fill('0.01');page.locator('[data-connection=accountLimitUsd]').blur();page.locator('#jev-session-key').fill(KEY);page.locator('[data-action=connect-key]').click();page.wait_for_timeout(200)
 check('Loading key makes zero transport calls',count()==0)
 check('Password field cleared',page.locator('#jev-session-key').input_value()=='')
 check('No key value retained in browser localStorage',page.evaluate('(key)=>!JSON.stringify(localStorage.data).includes(key)',KEY))
 check('Loaded is not falsely provider verified','not yet validated with TypeSafe' in page.locator('#content').inner_text())
 page.locator('[data-nav=selection]').click();page.locator('[data-action=prepare-rank]').click();page.wait_for_timeout(250);page.locator('[data-action=review-advisor]').click();page.wait_for_selector('#detail[open]')
 check('Review still makes zero calls',count()==0)
 page.screenshot(path=str(OUT/'advisor-confirmation-SIMULATED.png'),full_page=False)
 page.locator('[data-action=cancel-advisor]').first.click();check('Cancel makes zero calls',count()==0)
 page.locator('[data-action=review-advisor]').click();page.wait_for_selector('#detail[open]');page.locator('[data-action=confirm-advisor]').click();page.wait_for_function("document.querySelector('#content').textContent.includes('Local advisor: complete')",timeout=20000)
 check('Explicit confirmed plan makes six simulated calls',count()==6)
 check('Advice automatically imports recorded results','Matching report: complete' in page.locator('#content').inner_text())
 check('Execution has zero page errors',not page.errors)
 page.locator('[data-action=advisor-plan]').click();page.locator('[data-action=plan]').first.click();page.wait_for_timeout(600)
 check('Returned advice is usable in evaluation planner',not page.locator('.error').count())
 page.locator('[data-nav=connection]').click();page.locator('[data-connection=accountKind]').select_option('standalone');check('Provider-verified only after valid response','received a valid pinned-model response' in page.locator('#content').inner_text())
 page.locator('[data-action=forget-key]').click();page.wait_for_timeout(150);check('Forget clears connection','NOT CONNECTED' in page.locator('#content').inner_text())
 check('No key appears in rendered content',KEY not in page.locator('body').text_content())
 (OUT/'browser-execution-checks.json').write_text(json.dumps({'checks':checks,'transport':'Injected synthetic inference; zero provider traffic. Actual production UI modules and HTTP routes via test bridge.','simulatedCalls':count()},indent=2));b.close()

server.terminate();server.wait(timeout=10)
