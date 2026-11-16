import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionGate} from '../web/src/services/session.js';
import {chileToIso,chileInput,dayKey,addDays} from '../web/src/utils/date.js';
test('account replacement and sign-out invalidate pending private UI work',()=>{
  const gate=createSessionGate();gate.apply('a');const request=gate.version;
  assert.equal(gate.apply('a'),false);assert.equal(gate.isCurrent(request),true);
  gate.apply('b');assert.equal(gate.isCurrent(request),false);
  const qr=gate.version;gate.apply(null);assert.equal(gate.isCurrent(qr),false);
});
test('Chilean date input converts independently of device timezone',()=>{
  assert.equal(chileToIso('2026-11-24T10:30'),'2026-11-24T13:30:00.000Z');
  assert.equal(chileInput('2026-07-10T14:30:00Z'),'2026-07-10T10:30');
  assert.equal(dayKey('2026-11-24T02:30:00Z'),'2026-11-23');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.throws(()=>chileToIso('2026-02-30T10:30'));
  assert.throws(()=>chileToIso('2026-09-06T00:30'));
});
