"""Synthetic API only: six creation forms at 375/390/430px. Run against npm run dev -- --port 4187. Screenshots stay in /tmp; no clinical data or real credentials."""
import sys,json,time,base64
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:4187/'
API='https://backend.clevervet.tech/api/'
def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token=enc({'alg':'none'})+'.'+enc({'exp':int(time.time())+3600})+'.synthetic'
transfer={'version':1,'token':token,'capturedAt':int(time.time()*1000),'expiresAt':int(time.time()*1000)+3600000}
now=time.time();start=time.strftime('%Y-%m-%dT00:00:00Z',time.gmtime(now-86400));end=time.strftime('%Y-%m-%dT00:00:00Z',time.gmtime(now+86400*2))
patient={'id':'patient','name':'ДЕМО пациент','weightKg':4,'species':'Кошка','card':{'id':'record','status':'ACTIVE','treatment':{'start':start,'sheets':[{'id':'sheet','start':start,'end':end,'locked':False}]}}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [375,390,430]:
  c=b.new_context(viewport={'width':width,'height':844},is_mobile=True,has_touch=True,timezone_id='Europe/Moscow');c.add_init_script("window.addEventListener('clevervet-mobile:test3-stay-ready:v1',()=>window.dispatchEvent(new CustomEvent('clevervet-mobile:test3-stay-token:v1',{detail:%s})),{once:true});"%json.dumps(transfer))
  page=c.new_page();page.set_default_timeout(8000);chains=[];posts=[]
  def route(r):
   if not r.request.url.startswith(API):return r.continue_()
   path=r.request.url[len(API):];method=r.request.method
   if method=='POST':
    assert path=='medical-records/record/prescription-chains';data=r.request.post_data_json;posts.append(data);chains.append({k:v for k,v in data.items() if k!='prescription'}|{'elements':[data['prescription']]});return r.fulfill(status=200,json={})
   assert method=='GET'
   if path=='branches': data=[{'id':'b','name':'ИВЦ Запад','workShiftStart':'08:00','departments':[{'id':'d','name':'Хирургический стационар'}]}]
   elif path=='branches/b/departments/d/patients':data=[patient]
   elif path=='medical-records/record/prescription-chains':data=chains
   elif path=='patients/patient/personal-belongings':data=[]
   else:raise Exception(path)
   r.fulfill(status=200,json=data)
  page.route('**/*',route);page.goto(BASE,wait_until='networkidle');page.get_by_role('button',name='Пациенты',exact=True).click();page.locator('.patient-card').first.click();page.get_by_role('button',name='Сетка',exact=True).click()
  # six empty categories must remain available
  for category in ['Мониторинг','Оценка состояния','Растворы','Медикаменты','Процедуры','Уход']:
   page.get_by_role('button',name='Добавить: '+category,exact=True).click();dialog=page.locator('dialog[open]');dialog.wait_for();page.get_by_label('Название назначения',exact=True).fill('ДЕМО '+category)
   assert dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   # Reduced viewport approximates keyboard geometry, actual native keyboard is not emulated.
   page.set_viewport_size({'width':width,'height':430});page.get_by_label('Комментарий / инструкция',exact=True).fill('ДЕМО');page.get_by_role('button',name='Отмена',exact=True).scroll_into_view_if_needed();assert page.get_by_role('button',name='Отмена',exact=True).is_visible()
   page.set_viewport_size({'width':width,'height':844});page.screenshot(path=f'/tmp/prescription-{width}-{category}.png')
   if category=='Растворы':page.get_by_label('Скорость восполнения, мл/ч',exact=True).fill('10')
   if category=='Медикаменты':
    page.get_by_label('Концентрация',exact=True).fill('10');page.get_by_label('Единицы концентрации',exact=True).select_option('MILLIGRAM');page.get_by_label('На единицу препарата',exact=True).select_option('MILLILITRE');page.get_by_label('Дозировка',exact=True).fill('1');page.get_by_label('Единицы дозировки',exact=True).select_option('MILLIGRAM');page.get_by_label('На единицу массы / животное',exact=True).select_option('KILOGRAM');page.get_by_label('Путь введения',exact=True).select_option('INTRAVENOUS')
   page.get_by_label('Расписание',exact=True).select_option('once');page.get_by_role('button',name='Создать назначение',exact=True).click();page.locator('dialog[open]').wait_for(state='detached');assert len(posts)==len(chains)
   assert page.locator('.name-cell').filter(has_text='ДЕМО '+category).count()==1
  print(width,'passed: 6 forms, empty groups, overflow, reduced viewport; mock POSTs',len(posts));c.close()
 b.close()
