import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);}
const clientFiles=()=>files(join(root,'web')).filter(path=>/\.(js|html|css|json|webmanifest)$/i.test(path));

test('independent environment template has no live-project fallback',()=>{
  const values=read('.env.example').split(/\r?\n/).filter(line=>/^VITE_/.test(line));
  assert.ok(values.some(line=>/^VITE_SUPABASE_URL=\s*$/.test(line)));
  assert.ok(values.some(line=>/^VITE_SUPABASE_PUBLISHABLE_KEY=\s*$/.test(line)));
  for(const line of values.filter(line=>/^VITE_SUPABASE_/.test(line)))assert.match(line,/=\s*$/,'The template must require the new project configuration explicitly');
  assert.doesNotMatch(read('.github/workflows/pages.yml'),/\|\|\s*['"](?:https:\/\/[^'"]+\.supabase\.co|sb_publishable_)/);
});

test('the new checkout cannot publish through the original repository remote',()=>{
  const config=join(root,'.git','config');
  if(!existsSync(config))return;
  const text=readFileSync(config,'utf8');
  const urls=[...text.matchAll(/^\s*url\s*=\s*(.+)$/gm)].map(match=>match[1].trim());
  for(const url of urls)assert.doesNotMatch(url,/[/\:]medicita(?:\.git)?\/?$/i,'A remote must never point at the original app');
});

test('public clients contain no privileged keys or reusable admin credential',()=>{
  for(const path of clientFiles()){
    const source=readFileSync(path,'utf8');
    assert.doesNotMatch(source,/sb_secret_[A-Za-z0-9_-]{10,}/,'A server secret must not be bundled');
    assert.doesNotMatch(source,/(?:SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE)\s*[:=]/i,'A service role key must not be configured in browser code');
    assert.doesNotMatch(source,/localStorage\.clear\s*\(/,'Clearing all browser storage could remove another app session');
    for(const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
      let payload;
      try{payload=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString())}catch{continue}
      assert.notEqual(payload.role,'service_role','A privileged JWT must not reach the client');
    }
  }
});

test('the simulation has its own storage and cannot call the real backend',()=>{
  const entry=read('web/src/services/demo.js');
  const directory=join(root,'web','src','services','demo');
  const source=[entry,...(existsSync(directory)?files(directory).filter(path=>path.endsWith('.js')).map(path=>readFileSync(path,'utf8')):[])].join('\n');
  assert.match(source,/medicita-contigo-demo-v2/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|createClient)\s*\(/,'The presentation adapter must not send network mutations');
  assert.doesNotMatch(source,/from\s*['"][^'"]*(?:supabase|services\/api|\.\/api\.js)/);
});

test('copied source cannot retain the previous project endpoint or public key',t=>{
  const original=resolve(root,'..','medicita','.github','workflows','pages.yml');
  if(!existsSync(original)){t.skip('The original checkout is intentionally absent from independent CI');return}
  const oldConfiguration=readFileSync(original,'utf8');
  const oldValues=[...oldConfiguration.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co|sb_publishable_[A-Za-z0-9_-]+/g)].map(match=>match[0]);
  assert.ok(oldValues.length,'The local isolation comparison needs a reference configuration');
  const newConfiguration=[...clientFiles(),join(root,'.env.example'),join(root,'.github','workflows','pages.yml')].map(path=>readFileSync(path,'utf8')).join('\n');
  for(const value of oldValues)assert.ok(!newConfiguration.includes(value),'The new client must not reuse the original project configuration');
});

test('the locally protected original tree remains byte-identical',t=>{
  const baseline=resolve(root,'..','medicita-original-baseline.json');
  const original=resolve(root,'..','medicita');
  if(!existsSync(baseline)||!existsSync(original)){t.skip('Original source fingerprints are not distributed with independent CI');return}
  const expected=JSON.parse(readFileSync(baseline,'utf8'));
  assert.ok(Object.keys(expected).length>0,'The protected baseline cannot be empty');
  for(const [path,hash] of Object.entries(expected)){
    const fullPath=join(original,path);
    assert.ok(existsSync(fullPath),`A protected source file was removed: ${path}`);
    assert.equal(createHash('sha256').update(readFileSync(fullPath)).digest('hex'),hash,`A protected source file changed: ${path}`);
  }
});
