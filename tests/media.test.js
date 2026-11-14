import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{Media}from'../lib/media.js';
const fresh=()=>mkdtempSync(join(tmpdir(),'jarvis-media-'));
function fixture(data,path='documents/test.txt'){const c={dataDir:fresh(),token:'999:fake'};const api={getFile:async()=>({file_path:path,file_size:data.length})};const fetch=async()=>new Response(data);return new Media(c,api,{fetch});}
test('UTF8 document becomes untrusted context without executing its text',async()=>{
 const m=fixture(Buffer.from('Содержимое файла'));const r=await m.prepare({document:{file_id:'1',file_name:'notes.txt',mime_type:'text/plain'}});assert.match(r.text,/Содержимое файла/);assert.equal(r.images.length,0);
});
test('executables, oversized files, non-UTF8 and path traversal are rejected',async()=>{
 await assert.rejects(fixture(Buffer.from('MZ executable')).prepare({document:{file_id:'1',file_name:'run.exe'}}));
 await assert.rejects(fixture(Buffer.from('hi'),'../bad').prepare({document:{file_id:'1',file_name:'notes.txt'}}));
 await assert.rejects(fixture(Buffer.from([0xff,0xfe])).prepare({document:{file_id:'1',file_name:'notes.txt'}}));
 await assert.rejects(fixture(Buffer.alloc(1)).prepare({document:{file_id:'1',file_name:'notes.txt',file_size:6000000}}));
});
test('a valid PNG is passed as an image, not interpreted as instructions',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwZkAAAAASUVORK5CYII=','base64');
 const r=await fixture(png,'photos/a.jpg').prepare({photo:[{file_id:'1',file_size:png.length}]});assert.equal(r.images.length,1);assert.match(r.images[0].url,/^data:image\/png;base64,/);
});
test('forged images and voice messages beyond limit fail before decoding',async()=>{
 await assert.rejects(fixture(Buffer.from('not an image')).prepare({photo:[{file_id:'1'}]}));
 await assert.rejects(fixture(Buffer.from('OggS')).prepare({voice:{file_id:'1',duration:121}}));
});
test('owner voice transcription is marked as a spoken request for the controller',async()=>{
 const m=fixture(Buffer.from('OggS test audio'),'voice/file.oga');m.worker=async kind=>{assert.equal(kind,'voice');return'Напомни завтра позвонить';};
 const r=await m.prepare({voice:{file_id:'1',duration:3}});assert.equal(r.voiceRequest,true);assert.match(r.text,/Напомни завтра/);
});
