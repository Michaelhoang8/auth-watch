const test=require('node:test');
const assert=require('node:assert/strict');
const {read}=require('../portfolio/static/text_file.js');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const file=text=>{const bytes=new TextEncoder().encode(text);return {size:bytes.length,arrayBuffer:async()=>bytes.buffer};};

test('local text import preserves Unicode and strips the UTF-8 BOM',async()=>{
  assert.equal(await read(file('\ufeffname,note\r\nAda,café ☕\r\n'),100,'100 bytes'),'name,note\r\nAda,café ☕\r\n');
});
test('local import rejects oversized files before reading and checks actual bytes',async()=>{
  let reads=0;
  await assert.rejects(read({size:101,arrayBuffer(){reads++;}},100,'100 bytes'),/100 bytes/);
  assert.equal(reads,0);
  await assert.rejects(read({size:1,arrayBuffer:async()=>new ArrayBuffer(101)},100,'100 bytes'),/100 bytes/);
});
test('local import reports empty, invalid encoding, and unavailable files clearly',async()=>{
  await assert.rejects(read(file(' \n\t'),100,'100 bytes'),/file is empty/);
  await assert.rejects(read({size:2,arrayBuffer:async()=>new Uint8Array([0xc3,0x28]).buffer},100,'100 bytes'),/not valid UTF-8/);
  await assert.rejects(read({size:2,arrayBuffer:async()=>{throw Error('OS read failure');}},100,'100 bytes'),/could not be read/);
});

function appHarness(name){
  const elements=new Map(),pending=[];
  function element(){return {value:'',files:[],handlers:{},dataset:{},classList:{toggle(){}},
    addEventListener(type,callback){this.handlers[type]=callback;},setAttribute(){},querySelectorAll(){return [];}};}
  const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
  const context=vm.createContext({document:{querySelector:get,querySelectorAll:selector=>selector.startsWith('textarea')?[get('#source')]:[],dispatchEvent(){}},
    window:{designIdentity(){},analysisEmpty(){return '';},addEventListener(){},localTextFile:{read:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}},
    location:{hash:''},Event,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,`../portfolio/static/${name}.js`),'utf8'),context);
  return {get,pending,context,choose(){get('#file').files=[{name:'fixture.txt',size:10}];return get('#file').handlers.change();}};
}
for(const name of ['security']){
  test(`${name} ignores a delayed file after manual edits and after a newer file`,async()=>{
    const h=appHarness(name);
    const old=h.choose();h.get('#source').value='Typed input';h.get('#source').handlers.input();
    h.pending[0].resolve('Obsolete file');await old;
    assert.equal(h.get('#source').value,'Typed input');
    const first=h.choose(),second=h.choose();
    h.pending[2].resolve('Latest file');await second;
    h.pending[1].resolve('Older file');await first;
    assert.equal(h.get('#source').value,'Latest file');
  });
  test(`${name} preserves its previous source and downloadable report on file failure`,async()=>{
    const h=appHarness(name);h.get('#source').value='Existing input';h.get('#download').disabled=false;
    const importing=h.choose();h.pending[0].reject(Error('Invalid UTF-8'));await importing;
    assert.equal(h.get('#source').value,'Existing input');
    assert.equal(h.get('#download').disabled,false);
    assert.equal(h.get('#notice').textContent,'Invalid UTF-8');
    const late=h.choose();h.context.switchMode(name==='security'?'headers':name==='devops'?'pipeline':name==='ml'?'evaluate':'sales');
    const afterSwitch=h.get('#source').value;
    h.pending[1].resolve('Wrong app input');await late;
    assert.equal(h.get('#source').value,afterSwitch);
  });
}
