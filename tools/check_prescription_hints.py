"""Synthetic API only: touch autocomplete at 375/390/430px. Optional first argument is a local or published Test3 URL; all API calls are intercepted. Screenshots remain in /tmp."""
import sys,json,time,base64
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:4187/'
API='https://backend.clevervet.tech/api/'
def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token=enc({'alg':'none'})+'.'+enc({'exp':int(time.time())+3600})+'.synthetic'
transfer={'version':1,'token':token,'capturedAt':int(time.time()*1000),'expiresAt':int(time.time()*1000)+3600000}
now=time.time();start=time.strftime('%Y-%m-%dT00:00:00Z',time.gmtime(now-86400));end=time.strftime('%Y-%m-%dT00:00:00Z',time.gmtime(now+86400*2))
patient={'id':'patient','name':'ДЕМО пациент','weightKg':4,'species':'Кошка','card':{'id':'record','status':'ACTIVE','treatment':{'start':start,'sheets':[{'id':'sheet','start':start,'end':end,'locked':False}]}}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [375,390,430]:
  c=b.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,timezone_id='Europe/Moscow')
  c.add_init_script("window.addEventListener('clevervet-mobile:test3-stay-ready:v1',()=>window.dispatchEvent(new CustomEvent('clevervet-mobile:test3-stay-token:v1',{detail:%s})),{once:true});"%json.dumps(transfer))
  page=c.new_page();page.set_default_timeout(8000);posts=[];chains=[]
  def route(r):
   if not r.request.url.startswith(API): return r.continue_()
   path=r.request.url[len(API):]
   if r.request.method=='POST':
    assert path=='medical-records/record/prescription-chains';data=r.request.post_data_json;posts.append(data);chains.append({k:v for k,v in data.items() if k!='prescription'}|{'elements':[data['prescription']]});return r.fulfill(status=200,json={})
   assert r.request.method=='GET'
   if path=='branches':data=[{'id':'b','name':'ИВЦ Запад','workShiftStart':'08:00','departments':[{'id':'d','name':'Хирургический стационар'}]}]
   elif path=='branches/b/departments/d/patients':data=[patient]
   elif path=='medical-records/record/prescription-chains':data=chains
   elif path=='patients/patient/personal-belongings':data=[]
   else:raise Exception(path)
   r.fulfill(status=200,json=data)
  page.route('**/*',route);page.goto(BASE,wait_until='networkidle');page.get_by_role('button',name='Пациенты',exact=True).click();page.locator('.patient-card').first.click();page.get_by_role('button',name='Сетка',exact=True).click()
  page.get_by_role('button',name='Добавить: Медикаменты',exact=True).click()
  name=page.get_by_role('combobox',name='Название назначения',exact=True);con=page.get_by_role('combobox',name='Концентрация',exact=True)
  name.tap();assert page.locator('.prescription-options [role=option]').count()==99
  panel=page.get_by_role('listbox');assert panel.evaluate('(e)=>e.scrollHeight>e.clientHeight');panel.evaluate('(e)=>e.scrollTop=200');assert panel.evaluate('(e)=>e.scrollTop>0')
  name.fill('лидо');page.get_by_role('option',name='Лидокаин',exact=True).tap();assert name.input_value()=='Лидокаин';assert page.get_by_role('listbox').count()==0
  con.tap();assert page.locator('.prescription-options [role=option]').all_text_contents()==['20','100']
  page.get_by_role('option',name='20',exact=True).tap();assert con.input_value()=='20';assert page.get_by_role('listbox').count()==0
  con.fill('');con.tap();assert page.locator('.prescription-options [role=option]').all_text_contents()==['20','100']
  page.set_viewport_size({'width':width,'height':430});con.scroll_into_view_if_needed();con.tap()
  assert page.get_by_role('listbox').is_visible()
  rect=page.get_by_role('listbox').bounding_box();field=con.bounding_box();assert rect['width']==field['width'];assert rect['x']>=0 and rect['x']+rect['width']<=width;assert rect['y']>=0 and rect['y']+rect['height']<=430
  page.screenshot(path=f'/tmp/hints-{width}-keyboard.png');page.get_by_role('option',name='100',exact=True).tap();assert con.input_value()=='100'
  page.set_viewport_size({'width':width,'height':844});name.fill('Марф');page.get_by_role('option',name='Марфлоксин',exact=True).tap();con.fill('');page.get_by_label('На единицу препарата',exact=True).select_option('TABLET');con.tap();assert page.locator('.prescription-options [role=option]').all_text_contents()==['5','20','80']
  page.get_by_role('option',name='80',exact=True).tap();page.get_by_label('Путь введения',exact=True).select_option('ORAL');page.get_by_label('Дозировка',exact=True).fill('1');page.get_by_label('Расписание',exact=True).select_option('once');page.get_by_role('button',name='Создать назначение',exact=True).tap();page.locator('dialog[open]').wait_for(state='detached')
  assert len(posts)==1;assert posts[0]['prescription']['specifics']['concentration']=={'value':80,'units':{'substance':'MILLIGRAM','volume':'TABLET'}}
  print(width,'PASS: dropdown scroll, tap selection, keyboard-size geometry, unit filtering, mock payload');c.close()
 b.close()
