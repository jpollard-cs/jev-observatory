"""UI test bridge. Preserve real ES-module boundaries; bridge only loopback API transport."""
import json,re,urllib.request,urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

def launch(browser,root,base,width=1440,height=1080):
 page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
 page.errors=[];page.on('pageerror',lambda e:page.errors.append(str(e)))
 token={}
 def api(route,data=None):
  headers={} if data is None else {'Content-Type':'application/json','Origin':base,'X-Workbench-Token':token.get('csrf','')}
  req=urllib.request.Request(base+'/api/'+route,data=None if data is None else json.dumps(data).encode(),headers=headers)
  try:
   with urllib.request.urlopen(req) as r: obj=json.load(r)
  except urllib.error.HTTPError as e: raise Exception(json.load(e).get('error','API error'))
  if route=='bootstrap':token['csrf']=obj['csrf']
  return json.dumps(obj)
 page.expose_function('localApiBridge',api)
 text=(root/'public/index.html').read_text();text=re.sub(r'<script\b.*?</script>','',text,flags=re.S);text=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',text)
 page.set_content(text)
 for f in ['style.css','observatory.css','atlas.css','library.css','connection.css','guided.css']:
  if (root/'public'/f).exists():page.add_style_tag(content=(root/'public'/f).read_text())
 page.evaluate("Object.defineProperty(window,'localStorage',{value:{data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=String(v)},removeItem(k){delete this.data[k]}}});")
 sources={f.name:f.read_text() for f in (root/'public').glob('*.js')}
 s=sources['app.js'];a=s.index('async function api(');b=s.index('\nfunction saveApplication',a);sources['app.js']=s[:a]+"async function api(route,data){return JSON.parse(await window.localApiBridge(route,data??null));}"+s[b:]
 page.evaluate('''async (sources)=>{const urls={};function moduleURL(name){if(urls[name])return urls[name];let text=sources[name];if(text===undefined)throw Error('Missing test module '+name);text=text.replace(/(from\\s*['"]|import\\s*['"])(\\.\\/[^'"]+)(['"])/g,(_,a,b,c)=>a+moduleURL(b.slice(2))+c);return urls[name]=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));}await import(moduleURL('app.js'));}''',sources)
 page.wait_for_selector('h1',timeout=20000)
 return page
