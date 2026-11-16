"""Headless Chromium QA for the independent, explicitly fictitious UI.

Run after `npm run dev -- --host 127.0.0.1 --port 5174`:
  python tests/browser-smoke.py
Requires the environment's installed Python Playwright + Chromium.
No real accounts, original project, or remote writes are used.
"""
import json
import os
import traceback
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

BASE = os.environ.get('CONTIGO_QA_URL', 'http://127.0.0.1:5174/')
OUT = Path(os.environ.get('CONTIGO_QA_OUTPUT', '/workspace/work/contigo-browser-qa'))
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'medicita-contigo-demo-v2'
report = {'base': BASE, 'browser': 'Chromium headless', 'flow': {}, 'responsive': [], 'errors': [], 'limitations': ['No physical devices, real Google login, live two-account browser flow, screen reader, or WCAG certification.']}


def capture(page,name):
    try:
        page.screenshot(path=str(OUT/name),full_page=True,timeout=20000,animations='disabled')
    except Exception as error:
        report.setdefault('screenshot_warnings',[]).append({'file':name,'message':str(error).split('\n')[0]})


def state(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)


def wait_state(page, expression):
    page.wait_for_function('(input)=>{const s=JSON.parse(localStorage.getItem(input.key));return s && (new Function("s", "return ("+input.expression+")"))(s)}', arg={'key': KEY, 'expression': expression})


def ready(page):
    page.wait_for_function('!document.documentElement.dataset.saving')


def click(page, action, identifier=None, scope=''):
    locator = scope + f'[data-action="{action}"]'
    if identifier is not None:
        locator += f'[data-id="{identifier}"]'
    page.locator(locator + ':visible').first.click()


def nav(page, name):
    ready(page)
    page.locator(f'[data-page="{name}"]:visible').first.click()
    page.wait_for_function('(name)=>document.querySelector(`.nav-link.active[data-page="${name}"]`)!==null', arg=name)


def actor(page, name):
    page.locator('#demo-actor').select_option(name)
    expected = {'patient-a': 'Paciente', 'patient-b': 'Paciente', 'admin': 'Administración', 'reception': 'Recepción', 'supervisor': 'Supervisión'}[name]
    page.wait_for_function('(label)=>document.querySelector(".topbar-context .eyebrow")?.textContent===label', arg=expected)
    page.wait_for_function('(name)=>document.querySelector("#demo-actor")?.value===name', arg=name)
    # Distinguish the two patients, whose role labels are intentionally equal.
    if name.startswith('patient-'):
        expected_name = 'Ana' if name == 'patient-a' else 'Luis'
        page.wait_for_function('(name)=>document.querySelector(".account-name")?.textContent.includes(name)', arg=expected_name)


def kpis(page):
    return page.locator('.kpi').evaluate_all('(items)=>Object.fromEntries(items.map(x=>[x.querySelector("span")?.textContent,x.querySelector("strong")?.textContent]))')


def inspect(page, label, width):
    result = page.evaluate('''()=>{
      const visible=x=>x.getClientRects().length>0&&getComputedStyle(x).visibility!=="hidden";
      const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
      return {
        viewport:innerWidth, document_width:document.documentElement.scrollWidth,
        duplicate_ids:[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))],
        unlabelled:[...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible).filter(x=>!x.labels?.length&&!x.getAttribute('aria-label')&&!x.getAttribute('aria-labelledby')).map(x=>({tag:x.tagName,id:x.id,name:x.name})),
        small_buttons:[...document.querySelectorAll('button')].filter(visible).map(x=>({text:x.innerText.trim().slice(0,60),width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})).filter(x=>x.width<43.5||x.height<43.5),
        bad_text:document.querySelector('.app-main')?.innerText.match(/undefined|NaN|Invalid Date/g)||[]
      };
    }''')
    result.update(page=label, width=width)
    report['responsive'].append(result)
    result['failures']=[]
    if result['document_width']>width+1: result['failures'].append('document overflow')
    if result['duplicate_ids']: result['failures'].append('duplicate IDs')
    if result['unlabelled']: result['failures'].append('unlabelled controls')
    if result['bad_text']: result['failures'].append('invalid value text')
    return result


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page = context.new_page()
    page.set_default_timeout(10000)
    page.on('pageerror', lambda error: report['errors'].append({'type': 'pageerror', 'message': str(error)}))
    page.on('console', lambda message: report['errors'].append({'type': 'console', 'message': message.text}) if message.type == 'error' else None)
    try:
        page.goto(BASE + '?demo=1', wait_until='networkidle')
        page.locator('#demo-actor').wait_for()
        actor(page, 'patient-a')
        # Native Escape should close and restore the triggering button.
        click(page, 'patient-not-attend', 'appointment-a', '.app-main ')
        page.get_by_role('dialog').get_by_role('heading', name='No podré asistir', exact=True).wait_for()
        assert page.get_by_role('dialog').get_by_role('button', name='Quiero cancelar mi hora', exact=True).is_visible()
        assert page.get_by_role('dialog').get_by_role('button', name='Quiero cambiarla por otra', exact=True).is_visible()
        page.keyboard.press('Escape')
        page.wait_for_function('!document.querySelector("#modal").open')
        assert page.evaluate('document.activeElement?.dataset.action') == 'patient-not-attend', 'Escape did not restore modal trigger focus'
        click(page, 'patient-not-attend', 'appointment-a', '.app-main ')
        click(page, 'patient-cancel', 'appointment-a', '#modal ')
        page.locator('#cancel-reason').select_option(label='Problema de horario')
        page.locator('#patient-cancel-confirm button[type="submit"]').click()
        wait_state(page, "s.appointments.find(a=>a.id==='appointment-a').status==='cancelled'")
        ready(page)
        report['flow']['cancellation'] = 'passed'

        actor(page, 'admin')
        nav(page, 'calendar')
        scenario_slot=next(item for item in state(page)['slots'] if item['id']=='slot-recovery')
        scenario_day=datetime.fromisoformat(scenario_slot['starts_at'].replace('Z','+00:00')).astimezone(ZoneInfo('America/Santiago')).strftime('%Y-%m-%d')
        page.locator('#admin-calendar-from').fill(scenario_day)
        page.locator('#admin-calendar-filters button[type="submit"]').click()
        click(page, 'admin-offer-slot', 'slot-recovery', '.app-main ')
        click(page, 'admin-review-offer', 'slot-recovery|wait-b', '#modal ')
        click(page, 'admin-send-offer', 'slot-recovery|wait-b', '#modal ')
        wait_state(page, "s.offers.some(o=>o.slot_id==='slot-recovery'&&o.status==='pending')")
        ready(page)
        report['flow']['supervised_offer'] = 'passed'

        actor(page, 'patient-b')
        nav(page, 'notifications')
        click(page, 'patient-offer-review', scope='.app-main ')
        page.locator('#patient-offer-respond button[type="submit"]').click()
        wait_state(page, "s.offers.some(o=>o.slot_id==='slot-recovery'&&o.status==='accepted')")
        ready(page)
        data = state(page)
        new_appointment = next(a for a in data['appointments'] if a['slot_id']=='slot-recovery' and a['patient_id']=='patient-b' and a['status']=='confirmed')
        assert next(a for a in data['appointments'] if a['id']=='appointment-b-later')['status']=='cancelled'
        report['flow']['atomic_acceptance'] = 'passed'

        actor(page, 'admin')
        nav(page, 'reports')
        values = kpis(page)
        assert values.get('Nuevas asignaciones') == '1', values
        assert values.get('Cupos recuperados') == '0', values
        report['flow']['accepted_is_not_attended'] = 'passed'
        capture(page,'admin-before-attendance.png')

        slot = next(s for s in state(page)['slots'] if s['id']=='slot-recovery')
        attend = datetime.fromisoformat(slot['starts_at'].replace('Z','+00:00')) + timedelta(minutes=35)
        local = attend.astimezone(ZoneInfo('America/Santiago')).strftime('%Y-%m-%dT%H:%M')
        click(page, 'demo-clock')
        page.locator('#demo-time').fill(local)
        page.locator('#demo-clock-form button[type="submit"]').click()
        page.wait_for_function('!document.querySelector("#modal").open')
        ready(page)
        nav(page, 'calendar')
        click(page, 'admin-arrival', new_appointment['id'], '.app-main ')
        assisted=page.get_by_role('dialog').get_by_label('Reserva de hoy', exact=True)
        assisted.select_option(new_appointment['id'])
        page.locator('#admin-checkin-appointment input[name="identity_checked"]').check()
        page.locator('#admin-checkin-appointment button[type="submit"]').click()
        wait_state(page, f"s.appointments.find(a=>a.id==={json.dumps(new_appointment['id'])}).status==='arrived'")
        ready(page)
        click(page, 'admin-complete', new_appointment['id'], '.app-main ')
        click(page, 'admin-complete-confirm', new_appointment['id'], '#modal ')
        wait_state(page, f"s.appointments.find(a=>a.id==={json.dumps(new_appointment['id'])}).status==='completed'")
        ready(page)
        nav(page, 'reports')
        values=kpis(page)
        assert values.get('Cupos recuperados')=='1', values
        report['flow']['arrival_completion_recovery'] = 'passed'
        with page.expect_download() as download_info:
            click(page,'admin-export-report',scope='.app-main ')
        csv=download_info.value
        csv.save_as(str(OUT/'report-aggregated.csv'))
        csv_text=(OUT/'report-aggregated.csv').read_text(encoding='utf-8-sig')
        assert 'Ana' not in csv_text and 'Luis' not in csv_text and 'patient-a' not in csv_text
        report['flow']['aggregate_csv'] = 'passed'
        capture(page,'admin-after-attendance.png')

        actor(page,'supervisor')
        assert not page.locator('.app-main').get_by_text('Ana',exact=False).count()
        assert not page.locator('.app-main').get_by_text('Luis',exact=False).count()
        assert not page.locator('[data-page="patients"]:visible').count()
        nav(page,'history')
        text=page.locator('.app-main').inner_text()
        assert 'patient-a' not in text and 'patient-b' not in text and 'Ana' not in text and 'Luis' not in text
        report['flow']['supervisor_privacy'] = 'passed'
    except Exception as error:
        report['flow']['failure']={'message':str(error),'traceback':traceback.format_exc()}
        capture(page,'flow-failure.png')
    finally:
        context.close()

    # A clean fictional scenario for the independent responsive pass.
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    page=context.new_page()
    page.set_default_timeout(10000)
    page.on('pageerror',lambda error:report['errors'].append({'type':'pageerror-responsive','message':str(error)}))
    try:
        page.goto(BASE+'?demo=1',wait_until='networkidle')
        page.locator('#demo-actor').wait_for()
        for width in [320,375,390,768,1024,1440]:
            page.set_viewport_size({'width':width,'height':1000 if width>=768 else 844})
            actor(page,'patient-a')
            for name in ['home','appointments','waitlist','notifications','profile','rooms','help']:
                # Desktop sidebar or mobile quicknav; use the all-options drawer for secondary pages.
                if not page.locator(f'[data-page="{name}"]:visible').count():
                    page.locator('.mobile-menu summary').click()
                nav(page,name)
                inspect(page,f'patient-{name}',width)
            if width in [390,1440]:
                nav(page,'home');capture(page,f'patient-{width}.png')
            actor(page,'admin')
            for name in ['dashboard','calendar','waiting','cancellations','rooms','resources','patients','reports','history']:
                if not page.locator(f'[data-page="{name}"]:visible').count():
                    page.locator('.mobile-menu summary').click()
                nav(page,name)
                inspect(page,f'admin-{name}',width)
            if width in [390,1440]:
                nav(page,'dashboard');capture(page,f'admin-{width}.png')
        # Local preference controls must change state and preserve navigation.
        click(page,'access-simple');assert page.locator('html').evaluate('(x)=>x.classList.contains("simple-mode")')
        click(page,'access-contrast');assert page.locator('html').evaluate('(x)=>x.classList.contains("high-contrast")')
        inspect(page,'simple-high-contrast',1440)
        report['preferences']='passed'
    except Exception as error:
        report['responsive_failure']={'message':str(error),'traceback':traceback.format_exc()}
        capture(page,'responsive-failure.png')
    finally:
        context.close()

    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    page=context.new_page();page.set_default_timeout(10000)
    page.on('pageerror',lambda error:report['errors'].append({'type':'pageerror-extra','message':str(error)}))
    try:
        page.goto(BASE,wait_until='networkidle')
        page.locator('.landing').wait_for()
        for width in [320,375,390,768,1024,1440]:
            page.set_viewport_size({'width':width,'height':1000 if width>=768 else 844})
            inspect(page,'landing',width)
            if width in [390,1440]: capture(page,f'landing-{width}.png')
        page.set_viewport_size({'width':320,'height':844})
        click(page,'start-demo');page.locator('#demo-actor').wait_for()
        actor(page,'patient-a')
        click(page,'patient-qr',scope='.app-main ')
        page.locator('#modal img[src^="data:image"]').first.wait_for()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for _ in range(12): page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("#modal").contains(document.activeElement)')
        capture(page,'qr-320.png')
        page.keyboard.press('Escape')
        if not page.locator('[data-page="profile"]:visible').count():page.locator('.mobile-menu summary').click()
        nav(page,'profile')
        xss='<img src=x onerror=window.__contigoXss=1>'
        page.locator('#profile-name').fill(xss)
        page.locator('#patient-profile-save button[type="submit"]').click()
        wait_state(page,f's.profiles.find(x=>x.id==="patient-a").full_name==={json.dumps(xss)}')
        ready(page)
        assert page.evaluate('!window.__contigoXss&&document.querySelectorAll("img[onerror]").length===0')
        page.locator('#profile-phone').fill('bad')
        page.locator('#patient-profile-save button[type="submit"]').click()
        page.wait_for_function('!document.querySelector("#profile-phone").checkValidity()||document.querySelector("#toast").textContent.includes("teléfono")')
        assert page.locator('#profile-phone').input_value()=='bad'
        assert state(page)['profiles'][0]['phone']==''
        page.locator('#profile-phone').fill('')
        click(page,'access-simple');ready(page)
        click(page,'access-contrast');ready(page)
        for name in ['home','appointments','waitlist','notifications','profile','rooms','help']:
            if not page.locator(f'[data-page="{name}"]:visible').count():page.locator('.mobile-menu summary').click()
            nav(page,name);inspect(page,f'simple-high-contrast-patient-{name}',320)
        report['additional']={'qr_320_no_overflow':True,'native_modal_focus_contained':True,'profile_xss_escaped':True,'invalid_phone_draft_preserved':True}
    except Exception as error:
        report['additional_failure']={'message':str(error),'traceback':traceback.format_exc()}
        capture(page,'additional-failure.png')
    finally:
        context.close();browser.close()

(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['flow'].get('failure') or report.get('responsive_failure') or report.get('additional_failure') or report['errors'] or any(item.get('failures') for item in report['responsive']):
    raise SystemExit(1)
