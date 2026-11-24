/* Browser adapter for the original F2+T codecs. No document network requests. */
(() => {
  'use strict';
  const key = 'asea-report-transfer-v1:';
  const nativeFetch = window.fetch.bind(window);
  let downloadMode = '';
  function download(data, name, type) {
    const url = URL.createObjectURL(new Blob([data], {type}));
    const a = document.createElement('a'); a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
  const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
  async function richCopy(data) {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      try {
        const formats = {'text/html':new Blob([data.html],{type:'text/html'}),'text/plain':new Blob([data.text],{type:'text/plain'})};
        if(data.image) {
          const imageResponse=await nativeFetch(data.image);
          formats['image/png']=await imageResponse.blob();
        }
        await navigator.clipboard.write([new ClipboardItem(formats)]); return;
      } catch (error) { if(data.image) throw error; }
    }
    let copied=false;
    const handler=e=>{if(!e.clipboardData)return;e.preventDefault();e.clipboardData.setData('text/html',data.html);e.clipboardData.setData('text/plain',data.text);copied=true;};
    document.addEventListener('copy',handler,true);
    try { document.execCommand('copy'); } finally { document.removeEventListener('copy',handler,true); }
    if(!copied) throw Error('서식 복사가 허용되지 않았습니다. 브라우저의 클립보드 권한을 허용하거나 HTML 파일을 다운로드해 주세요.');
  }
  window.fetch = async (input, options={}) => {
    const url = new URL(typeof input==='string'?input:input.url,location.href);
    const name=url.pathname.split('/').pop();
    if(url.origin!==location.origin) return nativeFetch(input,options);
    try {
      if(name==='copy'||name==='copy-image') {
        const data=JSON.parse(options.body);
        if(downloadMode) {const mode=downloadMode;downloadMode='';download(mode==='html'?'<!doctype html><html lang="ko"><meta charset="utf-8"><title>보고서</title><body>'+data.html+'</body></html>':data.rtf, '보고서.'+mode,mode==='html'?'text/html;charset=utf-8':'application/rtf');}
        else await richCopy(data);
        return reply({ok:true,formats:['text/html','text/plain']});
      }
      if(name==='styles'||name==='row-styles') {
        if(options.method==='POST') {localStorage.setItem(key+name,options.body);return reply({ok:true});}
        return reply(JSON.parse(localStorage.getItem(key+name)|| (name==='styles'?'{"themes":[]}':'{"templates":[]}')));
      }
      if(name==='export-pdf') return reply({error:'웹 버전은 브라우저 인쇄에서 PDF로 저장해 주세요.'},400);
      return nativeFetch(input,options);
    } catch(error) {downloadMode='';return reply({error:error.message},400);}
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const $=id=>document.getElementById(id);
    function message(text,error=false){$('status').textContent=text;$('status').style.color=error?'#a12626':'';}
    function state(){let result;document.dispatchEvent(new CustomEvent('editor-document-request',{detail:s=>result=s}));if(!result)throw Error('편집기가 아직 준비되지 않았습니다.');return result;}
    function load(s){if(!s||!Array.isArray(s.blocks)||s.blocks.length>10000)throw Error('올바른 Report Transfer 백업이 아닙니다.');if(state().blocks.length&&!confirm('현재 편집 내용을 불러온 문서로 바꾸시겠습니까? 저장하지 않은 변경은 사라집니다.'))return;document.dispatchEvent(new CustomEvent('editor-document-load',{detail:s}));message('문서를 불러왔습니다.');}
    function action(fn){return async()=>{try{if(window.EditorInput?.composing)throw Error('한글 입력을 마친 뒤 다시 눌러 주세요.');await fn();}catch(e){message(e.message,true);}};}
    $('webSave').onclick=action(()=>{localStorage.setItem(key+'draft',JSON.stringify(state()));message('이 브라우저에 초안을 저장했습니다.');});
    $('webLoad').onclick=action(()=>{const raw=localStorage.getItem(key+'draft');if(!raw)throw Error('이 브라우저에 저장된 초안이 없습니다.');load(JSON.parse(raw));});
    $('webBackup').onclick=action(()=>{download(JSON.stringify(state(),null,2),'Report-Transfer-backup.json','application/json');message('백업 파일을 다운로드했습니다.');});
    $('webImport').onclick=()=>$('webFile').click();
    $('webFile').onchange=action(async()=>{const file=$('webFile').files[0];$('webFile').value='';if(!file)return;if(file.size>20_000_000)throw Error('백업 파일은 20MB까지 불러올 수 있습니다.');load(JSON.parse(await file.text()));});
    for(const [id,mode] of [['webHTML','html'],['webRTF','rtf']]) $(id).onclick=action(async()=>{if($('copy').disabled)throw Error('먼저 원문을 넣고 변환해 주세요.');downloadMode=mode;try{await $('copy').onclick();}finally{downloadMode='';}});
  });
})();
