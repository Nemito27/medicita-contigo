"""Browser acceptance for the November update, using fictional data only.

Run with Vite already serving the application:
  CONTIGO_QA_URL=http://127.0.0.1:5174/ python tests/update-browser-smoke.py

Requires Python Playwright and Chromium. Writes screenshots and JSON evidence to
work/update-browser-qa (or CONTIGO_UPDATE_QA_OUTPUT). This script never signs into
a real account and never calls a private remote mutation.
"""
import json
import os
import re
import shutil
import traceback
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

BASE = os.environ.get('CONTIGO_QA_URL', 'http://127.0.0.1:5174/').rstrip('/') + '/'
OUT = Path(os.environ.get('CONTIGO_UPDATE_QA_OUTPUT', str(Path(__file__).resolve().parents[1] / 'work' / 'update-browser-qa')))
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'medicita-contigo-demo-v2'
DECEMBER_KEY = KEY + ':medicita-december-2026-v1'
report = {'base': BASE, 'browser': 'Chromium headless', 'flows': {}, 'responsive': [], 'errors': [], 'limitations': ['Fictional browser simulation; no real Google sessions, physical devices, screen reader, background push, or WCAG certification. Live database and permission tests are separate.']}


def install_public_read_bridge(context):
    """Optional managed-Chromium workaround; HTTPS verification stays enabled.

    It forwards only the fixed public fictional-dataset read to the actual
    Supabase endpoint. No local fixture, session, or private mutation is used.
    """
    if os.environ.get('CONTIGO_QA_READ_BRIDGE') != '1':
        return
    report['public_dataset_transport'] = 'Actual Supabase HTTPS response forwarded by Python with default certificate verification; managed Chromium does not trust the proxy certificate.'

    def forward(route):
        request = route.request
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info'}
        if request.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
            return
        body = request.post_data or '{}'
        assert request.method == 'POST' and json.loads(body) == {'p_tag': 'medicita-december-2026-v1'}
        http = urllib.request.Request(request.url, data=body.encode(), method='POST', headers={'apikey': request.headers['apikey'], 'Content-Type': 'application/json', 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(http, timeout=30) as response:
            data = response.read()
            assert response.status == 200
        route.fulfill(status=200, content_type='application/json', headers=headers, body=data)

    context.route('https://iqisdeyxlzpxtlbkyero.supabase.co/rest/v1/rpc/get_demo_dataset', forward)


def capture(page, name):
    try:
        page.screenshot(path=str(OUT / name), full_page=True, timeout=20000, animations='disabled')
    except Exception as error:
        report.setdefault('screenshot_warnings', []).append({'file': name, 'message': str(error).split('\n')[0]})


def state(page, key=KEY):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', key)


def wait_state(page, expression, key=KEY, timeout=15000):
    page.wait_for_function('(input)=>{const s=JSON.parse(localStorage.getItem(input.key));return s&&(new Function("s","return ("+input.expression+")"))(s)}', arg={'key': key, 'expression': expression}, timeout=timeout)


def ready(page):
    page.wait_for_function('!document.documentElement.dataset.saving')


def click(page, action, identifier=None, scope=''):
    selector = scope + f'[data-action="{action}"]'
    if identifier is not None:
        selector += f'[data-id="{identifier}"]'
    page.locator(selector + ':visible').first.click()


def nav(page, name):
    ready(page)
    if not page.locator(f'[data-page="{name}"]:visible').count():
        page.locator('.mobile-menu summary').click()
    page.locator(f'[data-page="{name}"]:visible').first.click()
    page.wait_for_function('(name)=>document.querySelector(`.nav-link.active[data-page="${name}"]`)!==null', arg=name)
    page.wait_for_function('document.querySelector("#main-content")?.getAttribute("aria-busy")!=="true"')


def actor(page, name):
    ready(page)
    page.locator('#demo-actor').select_option(name)
    page.wait_for_function('(name)=>document.querySelector("#demo-actor")?.value===name', arg=name)
    role = 'Administración' if name == 'admin' else 'Recepción' if name == 'reception' else 'Supervisión' if name == 'supervisor' else 'Paciente'
    page.wait_for_function('(role)=>document.querySelector(".topbar-context .eyebrow")?.textContent===role', arg=role)
    if name in ['patient-a', 'patient-b']:
        page.wait_for_function('(name)=>document.querySelector(".account-name")?.textContent.includes(name)', arg='Ana' if name == 'patient-a' else 'Luis')


def start(context, query='?demo=1'):
    page = context.new_page()
    page.set_default_timeout(15000)
    page.on('pageerror', lambda error: report['errors'].append({'type': 'pageerror', 'message': str(error)}))
    page.on('console', lambda message: report['errors'].append({'type': 'console', 'message': message.text}) if message.type == 'error' else None)
    page.on('request', lambda request: report['errors'].append({'type': 'unexpected-demo-remote-mutation', 'url': request.url}) if request.method not in ['GET', 'HEAD', 'OPTIONS'] and '.supabase.co/rest/v1/' in request.url and not request.url.split('?')[0].endswith('/rpc/get_demo_dataset') else None)
    page.goto(BASE + query, wait_until='networkidle')
    page.locator('#demo-actor').wait_for()
    return page


def submit(page, form_id):
    page.locator(f'#{form_id} button[type="submit"]').click()
    ready(page)


def close(page):
    page.keyboard.press('Escape')
    page.wait_for_function('!document.querySelector("#modal").open')


def advance_one_minute(page):
    click(page, 'demo-clock')
    # The control rounds seconds down; two displayed minutes guarantees that
    # the server-equivalent 30-second cooldown has actually elapsed.
    value = datetime.fromisoformat(page.locator('#demo-time').input_value()) + timedelta(minutes=2)
    page.locator('#demo-time').fill(value.strftime('%Y-%m-%dT%H:%M'))
    submit(page, 'demo-clock-form')


def own_ledger(page, patient='patient-a', key=KEY):
    return [row for row in state(page, key).get('reward_ledger', []) if row['patient_id'] == patient]


def own_balance(page, patient='patient-a', key=KEY):
    return sum(row['amount'] for row in own_ledger(page, patient, key))


def balance_ui(page):
    return int(page.locator('.reward-balance strong').inner_text().replace('.', '').replace(',', ''))


def inspect(page, label, width):
    result = page.evaluate('''()=>{
      const visible=x=>x.getClientRects().length>0&&getComputedStyle(x).visibility!=="hidden";
      const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
      return {viewport:innerWidth,document_width:document.documentElement.scrollWidth,
        duplicate_ids:[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))],
        unlabelled:[...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(visible).filter(x=>!x.labels?.length&&!x.getAttribute('aria-label')&&!x.getAttribute('aria-labelledby')).map(x=>({tag:x.tagName,id:x.id,name:x.name})),
        small_buttons:[...document.querySelectorAll('button')].filter(visible).map(x=>({text:x.innerText.trim().slice(0,60),width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})).filter(x=>x.width<43.5||x.height<43.5),
        bad_text:document.querySelector('.app-main')?.innerText.match(/undefined|NaN|Invalid Date/g)||[]};
    }''')
    result.update(page=label, width=width, failures=[])
    if result['document_width'] > width + 1:
        result['failures'].append('document overflow')
    if result['duplicate_ids']:
        result['failures'].append('duplicate IDs')
    if result['unlabelled']:
        result['failures'].append('unlabelled controls')
    if result['bad_text']:
        result['failures'].append('invalid value text')
    if result['small_buttons']:
        result['failures'].append('button below 44px target')
    report['responsive'].append(result)


def rewards_flow(context):
    page = start(context)
    actor(page, 'patient-a')
    nav(page, 'rewards')
    assert balance_ui(page) == own_balance(page)
    welcome = [row for row in own_ledger(page) if row['action'] == 'welcome']
    assert len(welcome) == 1 and welcome[0]['amount'] == 5
    assert page.locator('.reward-mission').count() == 6
    assert page.locator('.reward-award').count() >= 5
    initial = own_balance(page)
    page.reload(wait_until='networkidle')
    page.locator('#demo-actor').wait_for()
    actor(page, 'patient-a')
    nav(page, 'rewards')
    assert balance_ui(page) == initial
    assert len([row for row in own_ledger(page) if row['action'] == 'welcome']) == 1
    nav(page, 'appointments')
    click(page, 'patient-confirm', 'appointment-a', '.app-main ')
    wait_state(page, "s.appointments.find(a=>a.id==='appointment-a').status==='confirmed'")
    assert own_balance(page) == initial + 2
    nav(page, 'rewards')
    assert balance_ui(page) == initial + 2
    nav(page, 'appointments')
    click(page, 'patient-change', 'appointment-a', '.app-main ')
    page.locator('#available-slot').select_option('slot-general-alternative')
    submit(page, 'patient-booking-select')
    submit(page, 'patient-booking-confirm')
    wait_state(page, "s.appointments.find(a=>a.id==='appointment-a').status==='cancelled'")
    replacement = next(a for a in state(page)['appointments'] if a['patient_id'] == 'patient-a' and a['slot_id'] == 'slot-general-alternative' and a['status'] == 'reserved')
    original = next(a for a in state(page)['appointments'] if a['id'] == 'appointment-a')
    assert replacement['care_process_id'] == original['care_process_id']
    click(page, 'patient-confirm', replacement['id'], '.app-main ')
    wait_state(page, f"s.appointments.find(a=>a.id==={json.dumps(replacement['id'])}).status==='confirmed'")
    assert own_balance(page) == initial + 2
    assert len([row for row in own_ledger(page) if row['action'] == 'confirmation' and (row.get('reference') or {}).get('care_process_id') == original['care_process_id']]) == 1
    nav(page, 'rewards')
    click(page, 'reward-own-history')
    page.get_by_role('dialog').get_by_role('heading', name='Mis movimientos de coronitas').wait_for()
    assert 'Intención de asistir' in page.get_by_role('dialog').inner_text() or 'confirm' in page.get_by_role('dialog').inner_text().lower()
    close(page)
    report['flows']['rewards_once_per_care_process'] = {'passed': True, 'initial_balance': initial, 'after_confirmation_and_reschedule': own_balance(page)}
    capture(page, 'rewards-desktop.png')
    nav(page, 'community')
    page.locator('#reward-community-alias').fill('SolVerde')
    page.locator('#reward-community-preferences input[name="opt_in"]').check()
    submit(page, 'reward-community-preferences')
    wait_state(page, "s.profiles.find(p=>p.id==='patient-a').community_opt_in===true")
    page.locator('.reward-community-person h3').filter(has_text='SolVerde').wait_for()
    community_text = page.locator('.reward-community-grid').inner_text()
    for private in ['example.invalid', 'patient-a', 'Demostración A', 'appointment-a']:
        assert private not in community_text
    page.locator('#reward-community-preferences input[name="opt_in"]').uncheck()
    submit(page, 'reward-community-preferences')
    wait_state(page, "s.profiles.find(p=>p.id==='patient-a').community_opt_in===false")
    assert not page.locator('.reward-community-person h3').filter(has_text='SolVerde').count()
    assert f'Tu saldo: {initial + 2} coronitas' in page.locator('.app-main').inner_text()
    report['flows']['community_opt_in_privacy_and_withdrawal'] = 'passed'
    actor(page, 'admin')
    nav(page, 'patients')
    click(page, 'reward-person-adjust', 'patient-a')
    page.locator('#reward-adjust-amount').fill('7')
    page.locator('#reward-adjust-reason').fill('Corrección administrativa ficticia verificada')
    submit(page, 'reward-adjust-form')
    wait_state(page, "s.reward_ledger.some(r=>r.patient_id==='patient-a'&&r.action==='adjustment'&&r.amount===7)")
    click(page, 'reward-person-history', 'patient-a')
    page.get_by_role('dialog').get_by_text('Corrección administrativa ficticia verificada', exact=False).wait_for()
    close(page)
    actor(page, 'patient-a')
    nav(page, 'rewards')
    assert balance_ui(page) == initial + 9
    report['flows']['administrative_adjustment_visible_in_history'] = 'passed'


def comments_flow(context):
    page = start(context)
    actor(page, 'patient-a')
    nav(page, 'rooms')
    room = page.locator('[data-action="comm-open-comments"]').first.get_attribute('data-id')
    click(page, 'comm-open-comments', room)
    body = 'El computador de la sala ayuda a organizar la atención.'
    page.locator('#comm-comment-alias').fill('SalaClara')
    page.locator('#comm-comment-body').fill(body)
    assert page.locator('[data-comm-count]').inner_text().startswith(f'{len(body)}/500')
    assert page.locator('#comm-comment-body').get_attribute('maxlength') == '500'
    before = own_balance(page)
    submit(page, 'comm-comment-create')
    page.locator('.comm-comment-text').filter(has_text=body).wait_for()
    assert own_balance(page) == before
    created = next(c for c in state(page)['room_comments'] if c['body'] == body)
    assert created['status'] == 'published'
    close(page)
    actor(page, 'patient-b')
    nav(page, 'rooms')
    click(page, 'comm-open-comments', room)
    assert not page.locator(f'[data-comment-id="{created["id"]}"] [data-action="comm-comment-edit"]').count()
    click(page, 'comm-comment-report', created['id'])
    page.locator('#comm-report-reason').fill('Solicito revisar esta observación ficticia')
    submit(page, 'comm-comment-report-form')
    actor(page, 'admin')
    nav(page, 'moderation')
    page.locator('#comm-moderation-status').select_option('published')
    submit(page, 'comm-moderation-filter')
    click(page, 'comm-moderate', created['id'])
    page.locator('#comm-next-status').select_option('hidden')
    page.locator('#comm-moderate-reason').fill('Ocultamiento ficticio para comprobar trazabilidad')
    submit(page, 'comm-moderate-form')
    wait_state(page, f"s.room_comments.find(c=>c.id==={json.dumps(created['id'])}).status==='hidden'")
    actor(page, 'patient-b')
    nav(page, 'rooms')
    click(page, 'comm-open-comments', room)
    assert not page.locator('.comm-comment-text').filter(has_text=body).count()
    close(page)
    actor(page, 'patient-a')
    advance_one_minute(page)
    nav(page, 'rooms')
    click(page, 'comm-open-comments', room)
    page.locator('#comm-comment-body').fill('p.u.t.a')
    submit(page, 'comm-comment-create')
    page.locator('#dialog-error:visible').wait_for()
    assert re.search('respet|lenguaje|reformula', page.locator('#dialog-error').inner_text(), re.I)
    assert not any(c['body'] == 'p.u.t.a' for c in state(page)['room_comments'])
    xss = '<img src=x onerror=window.__contigoCommentXss=1>'
    page.locator('#comm-comment-body').fill(xss)
    submit(page, 'comm-comment-create')
    wait_state(page, f"s.room_comments.some(c=>c.body==={json.dumps(xss)})")
    assert page.evaluate('!window.__contigoCommentXss && document.querySelectorAll("img[onerror]").length===0')
    capture(page, 'comments-safe-text.png')
    report['flows']['comments_alias_counter_report_moderation_and_xss'] = 'passed'


def visual_call_flow(context):
    staff = start(context)
    actor(staff, 'admin')
    slot = next(s for s in state(staff)['slots'] if s['id'] == 'slot-recovery')
    attend = datetime.fromisoformat(slot['starts_at'].replace('Z', '+00:00')) + timedelta(minutes=10)
    click(staff, 'demo-clock')
    staff.locator('#demo-time').fill(attend.astimezone(ZoneInfo('America/Santiago')).strftime('%Y-%m-%dT%H:%M'))
    submit(staff, 'demo-clock-form')
    nav(staff, 'calendar')
    staff.locator('#admin-calendar-from').fill(attend.astimezone(ZoneInfo('America/Santiago')).strftime('%Y-%m-%d'))
    submit(staff, 'admin-calendar-filters')
    click(staff, 'admin-arrival', 'appointment-a', '.app-main ')
    staff.get_by_role('dialog').get_by_label('Reserva de hoy', exact=True).select_option('appointment-a')
    staff.locator('#admin-checkin-appointment input[name="identity_checked"]').check()
    submit(staff, 'admin-checkin-appointment')
    wait_state(staff, "s.appointments.find(a=>a.id==='appointment-a').status==='arrived'")
    patient = start(context)
    actor(patient, 'patient-a')
    nav(patient, 'rooms')
    room = patient.locator('[data-action="comm-open-comments"]').first.get_attribute('data-id')
    click(patient, 'comm-open-comments', room)
    draft = 'Borrador que debe mantenerse al recibir mi llamado'
    patient.locator('#comm-comment-body').fill(draft)
    # Disable audio entry points: receiving and responding must still work.
    patient.evaluate('''()=>{window.__contigoAudioUsed=false;window.Audio=class{constructor(){window.__contigoAudioUsed=true;throw Error('Audio disabled for QA')}};if(window.AudioContext)window.AudioContext=class{constructor(){window.__contigoAudioUsed=true;throw Error('Audio disabled for QA')}};}''')
    click(staff, 'comm-call', 'appointment-a', '.app-main ')
    patient.locator('#modal [data-action="comm-call-understood"]:visible').first.wait_for(timeout=20000)
    assert patient.locator('#comm-comment-body').input_value() == draft
    wait_state(patient, "s.box_calls.some(c=>c.appointment_id==='appointment-a'&&c.status==='received')")
    assert not patient.evaluate('window.__contigoAudioUsed')
    for width in [320, 390, 768, 1440]:
        patient.set_viewport_size({'width': width, 'height': 1000 if width >= 768 else 844})
        inspect(patient, 'visual-call-dialog', width)
    capture(patient, 'visual-call-inside-dialog.png')
    click(patient, 'comm-call-help', scope='#modal ')
    wait_state(patient, "s.box_calls.some(c=>c.appointment_id==='appointment-a'&&c.status==='help')")
    nav(staff, 'calls')
    staff.get_by_text('Solicita ayuda', exact=False).first.wait_for()
    other = start(context)
    actor(other, 'patient-b')
    assert not other.locator('[data-visual-call]').count(), 'The call leaked to a different fictional patient'
    other.close()
    public = context.new_page()
    public.goto(BASE + '?demo=1&sala=todas', wait_until='networkidle')
    public.locator('.comm-public-turn').first.wait_for()
    public_text = public.locator('.comm-public-screen').inner_text()
    call = next(c for c in state(patient)['box_calls'] if c['appointment_id'] == 'appointment-a')
    assert re.fullmatch(r'[A-Z]+-[A-Z0-9]{6,}', call['turn_code'])
    assert call['turn_code'] in public_text
    for private in ['Ana', 'Luis', 'Demostración A', 'patient-a', 'appointment-a', 'example.invalid', 'Necesito ayuda']:
        assert private not in public_text, f'Public screen exposed {private}'
    for width in [320, 390, 768, 1440]:
        public.set_viewport_size({'width': width, 'height': 1000 if width >= 768 else 844})
        inspect(public, 'public-room', width)
    capture(public, 'public-room-opaque-turn.png')
    public.close()
    patient.reload(wait_until='networkidle')
    patient.locator('#demo-actor').wait_for()
    actor(patient, 'patient-a')
    patient.locator('[data-action="comm-call-understood"]:visible').first.wait_for(timeout=20000)
    click(patient, 'comm-call-understood')
    wait_state(patient, "s.box_calls.some(c=>c.appointment_id==='appointment-a'&&c.status==='understood')")
    nav(staff, 'calls')
    staff.get_by_text('Entendido por la persona', exact=False).first.wait_for(timeout=20000)
    assert patient.evaluate('!document.querySelector("audio[autoplay]")')
    report['flows']['visual_call_two_tabs_draft_audio_free_help_reload_understood'] = 'passed'
    report['flows']['visual_call_other_patient_isolation_and_public_opaque_turn'] = 'passed'
    before_attendance = own_balance(staff)
    nav(staff, 'calendar')
    click(staff, 'admin-complete', 'appointment-a', '.app-main ')
    click(staff, 'admin-complete-confirm', 'appointment-a', '#modal ')
    wait_state(staff, "s.appointments.find(a=>a.id==='appointment-a').status==='completed'")
    assert own_balance(staff) == before_attendance + 10
    assert all(c.get('closed_at') for c in state(staff)['box_calls'] if c['appointment_id'] == 'appointment-a')
    nav(staff, 'patients')
    click(staff, 'reward-person-history', 'patient-a')
    click(staff, 'reward-correct-attendance', 'appointment-a', '#modal ')
    staff.locator('#reward-correction-reason').fill('Validación ficticia registrada por error de prueba')
    submit(staff, 'reward-attendance-correction')
    wait_state(staff, "s.appointments.find(a=>a.id==='appointment-a').status==='arrived'")
    assert own_balance(staff) == before_attendance
    nav(staff, 'calendar')
    click(staff, 'admin-complete', 'appointment-a', '.app-main ')
    click(staff, 'admin-complete-confirm', 'appointment-a', '#modal ')
    wait_state(staff, "s.appointments.find(a=>a.id==='appointment-a').status==='completed'")
    assert own_balance(staff) == before_attendance + 10
    movements = [r for r in own_ledger(staff) if (r.get('reference') or {}).get('care_process_id') == 'appointment-a' and r['action'].startswith('attendance')]
    assert sum(r['amount'] for r in movements) == 10
    report['flows']['attendance_validation_correction_and_restoration_net_once'] = {'passed': True, 'movements': [r['amount'] for r in movements]}


def preferences_flow(context):
    page = context.new_page()
    page.goto(BASE, wait_until='networkidle')
    click(page, 'access-visual')
    page.wait_for_function('document.documentElement.classList.contains("visual-mode")')
    value = page.evaluate('JSON.parse(localStorage.getItem("medicita-contigo-a11y-v2"))')
    assert value['visual_mode'] is True and 'visual_mode' in value['pending_keys']
    page.reload(wait_until='networkidle')
    assert page.locator('[data-action="access-visual"]').get_attribute('aria-pressed') == 'true'
    click(page, 'start-demo')
    page.locator('#demo-actor').wait_for()
    actor(page, 'patient-a')
    nav(page, 'profile')
    page.locator('input[name="visual_mode"]').check()
    page.locator('input[name="vibration_enabled"]').check()
    submit(page, 'patient-profile-save')
    wait_state(page, "s.profiles.find(p=>p.id==='patient-a').preferences.visual_mode===true&&s.profiles.find(p=>p.id==='patient-a').preferences.vibration_enabled===true")
    page.reload(wait_until='networkidle')
    page.locator('#demo-actor').wait_for()
    actor(page, 'patient-a')
    nav(page, 'profile')
    assert page.locator('input[name="visual_mode"]').is_checked()
    assert page.locator('input[name="vibration_enabled"]').is_checked()
    assert page.locator('[data-action="access-visual"]').get_attribute('aria-pressed') == 'true'
    assert 'si tu navegador no permite vibración' in page.locator('.app-main').inner_text().lower()
    report['flows']['visual_preferences_prelogin_and_profile_reload'] = 'passed in local simulation; live preference merge covered separately by unit/SQL tests'


def december_flow(context):
    page = start(context, '?demo=1&dataset=december-2026&day=2026-12-03')
    data = state(page, DECEMBER_KEY)
    assert data and data['dataset_tag'] == 'medicita-december-2026-v1'
    assert len([p for p in data['profiles'] if p['role'] == 'patient']) == 120
    assert len(data['professionals']) == 12 and len(data['rooms']) == 8
    future = [s for s in data['slots'] if s.get('dataset_section') == 'december']
    assert len(future) == 528
    counts = {}
    for day, expected in [('2026-12-03', 120), ('2026-12-04', 126), ('2026-12-05', 114)]:
        slots = [s for s in future if datetime.fromisoformat(s['starts_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('America/Santiago')).strftime('%Y-%m-%d') == day]
        ids = {s['id'] for s in slots}
        booked = [a for a in data['appointments'] if a['slot_id'] in ids and a['status'] in ['reserved', 'confirmed', 'arrived', 'completed']]
        assert len(slots) == 176 and len(booked) == expected
        assert all(a['status'] in ['reserved', 'confirmed'] for a in booked)
        counts[day] = {'slots': len(slots), 'occupied': len(booked), 'without_appointment': len(slots) - len(booked)}
    actor(page, 'admin')
    nav(page, 'patients')
    assert 'fictici' in page.locator('.app-main').inner_text().lower()
    nav(page, 'calendar')
    assert page.locator('#admin-calendar-from').input_value() == '2026-12-03'
    capture(page, 'december-calendar.png')
    original_clock_offset = state(page, DECEMBER_KEY).get('clock_offset_ms', 0)
    for day in ['2026-12-04', '2026-12-05', '2026-12-03']:
        click(page, 'december-day', day)
        page.wait_for_function('(day)=>document.querySelector("#admin-calendar-from")?.value===day', arg=day)
        assert page.locator('.day-column').count() == 1
        assert 'day=' + day in page.url
        assert state(page, DECEMBER_KEY).get('clock_offset_ms', 0) == original_clock_offset
    assert not state(page, KEY), 'December namespace wrote over the legacy demonstration'
    report['flows']['december_dataset_counts_and_isolation'] = {'passed': True, 'days': counts, 'patients': 120, 'technical_actors': 3, 'historical_slots': len(data['slots']) - 528}


def responsive_flow(context):
    page = start(context)
    for width in [320, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000 if width >= 768 else 844})
        actor(page, 'patient-a')
        for name in ['rewards', 'community', 'rooms', 'profile']:
            nav(page, name)
            inspect(page, 'patient-' + name, width)
        nav(page, 'rooms')
        click(page, 'comm-open-comments')
        page.locator('#comm-comment-body').wait_for()
        inspect(page, 'comments-dialog', width)
        for _ in range(12):
            page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("#modal").contains(document.activeElement)')
        close(page)
        actor(page, 'admin')
        for name in ['patients', 'moderation', 'calls']:
            nav(page, name)
            inspect(page, 'admin-' + name, width)
        nav(page, 'patients')
        click(page, 'reward-person-adjust', 'patient-a')
        inspect(page, 'adjustment-dialog', width)
        capture(page, f'adjustment-{width}.png')
        close(page)
    report['flows']['new_sections_four_viewports_and_modal_focus'] = 'passed'


with sync_playwright() as p:
    executable = os.environ.get('CONTIGO_CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])
    report['browser_version'] = browser.version
    report['checked_at'] = datetime.now(ZoneInfo('America/Santiago')).isoformat(timespec='seconds')
    selected_flows = set(filter(None, os.environ.get('CONTIGO_QA_FLOWS', '').split(',')))
    for name, flow in [('rewards', rewards_flow), ('comments', comments_flow), ('visual_calls', visual_call_flow), ('preferences', preferences_flow), ('december', december_flow), ('responsive', responsive_flow)]:
        if selected_flows and name not in selected_flows:
            continue
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        install_public_read_bridge(context)
        try:
            flow(context)
        except Exception as error:
            report['flows'][name + '_failure'] = {'message': str(error), 'traceback': traceback.format_exc()}
            if context.pages:
                capture(context.pages[-1], name + '-failure.png')
        finally:
            context.close()
    browser.close()

(OUT / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
if any(key.endswith('_failure') for key in report['flows']) or report['errors'] or any(item['failures'] for item in report['responsive']):
    raise SystemExit(1)
