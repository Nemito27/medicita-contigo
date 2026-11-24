import test from 'node:test';
import assert from 'node:assert/strict';
import {readAccessibility,mergeAccessibility,persistAccessibility} from '../web/src/services/accessibility.js';

function memory(){const entries=new Map();return {getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};}
test('explicit pre-login visual choice wins once; defaults never overwrite another device preferences',()=>{
  const local={visual_mode:true,high_contrast:false};
  assert.equal(mergeAccessibility(local,['visual_mode'],{visual_mode:false,reduce_motion:true}).visual_mode,true);
  assert.equal(mergeAccessibility({},[],{visual_mode:true}).visual_mode,true);
  assert.equal(mergeAccessibility(local,[],{visual_mode:false}).visual_mode,false);
});
test('local accessibility records contain only whitelisted preferences and explicit pending choices',()=>{
  const storage=memory();
  persistAccessibility(storage,'test',{visual_mode:true,email:'private@example.invalid'},['visual_mode','role','visual_mode']);
  assert.deepEqual(readAccessibility(storage,'test'),{prefs:{visual_mode:true},pending:['visual_mode']});
  assert.ok(!storage.getItem('test').includes('email'));
});
