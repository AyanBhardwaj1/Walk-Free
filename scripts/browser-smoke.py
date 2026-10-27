from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.goto('http://127.0.0.1:5173',wait_until='networkidle',timeout=60000)
 page.screenshot(path='/tmp/walk-free-desktop.png')
 assert not errors, errors
 assert page.locator('canvas').count()==1
 print(page.title(),'canvas',page.locator('canvas').count(),'errors',errors)
 page.get_by_role('button',name='Design studio',exact=True).click()
 page.get_by_role('button',name='Tree',exact=True).click()
 page.locator('canvas').click(position={'x':500,'y':350})
 assert page.get_by_text('New tree',exact=True).count()==1
 print('Placement verified')
 page.get_by_role('button',name='Undo',exact=True).click()
 assert page.get_by_text('New tree',exact=True).count()==0
 page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path='/tmp/walk-free-mobile.png')
 assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
 print('Undo and mobile layout verified')
 b.close()
