
(() => {
'use strict';
let installPrompt=null, tourIndex=0, tourMode='standard', tourTarget=null;
const $=id=>document.getElementById(id);
const seenKey='asea-report-transfer:welcome-v1';
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('appinstalled',()=>{installPrompt=null;if($('installApp'))$('installApp').title='앱 설치가 완료되었습니다.';});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
const shapes={
copy:'M9 9h11v12H9z M5 15H3V3h11v2',help:'M9 9a3 3 0 1 1 4 3c-1 1-1 2-1 2 M12 18h.01',install:'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
up:'M8 6 3 11l5 5 M3 11h12 M11 4h10 M11 18h10',down:'m16 6 5 5-5 5 M21 11H9 M3 4h10 M3 18h10',
left:'M3 5h18 M3 10h12 M3 15h18 M3 20h12',center:'M3 5h18 M6 10h12 M3 15h18 M6 20h12',right:'M3 5h18 M9 10h12 M3 15h18 M9 20h12',
middle:'M3 3h18 M3 21h18 M12 6v12 M8 10l4-4 4 4 M8 14l4 4 4-4',
table:'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
rows:'M3 3h18v18H3z M3 9h18 M3 15h18 M6 12h12',columns:'M3 3h18v18H3z M9 3v18 M15 3v18 M12 6v12',
equal:'M3 4v16 M21 4v16 M9 4v16 M15 4v16 M3 12h18',height:'M4 3h16 M4 9h16 M4 15h16 M4 21h16 M12 3v18',
header:'M3 3h18v18H3z M3 9h18 M6 6h12',footer:'M3 3h18v18H3z M3 15h18 M6 18h12',
text:'M4 4h16 M12 4v16 M8 20h8',all:'M3 7V3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M7 8h10 M7 12h10 M7 16h10',
none:'M3 7V3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M8 8l8 8 M16 8l-8 8',
add:'M12 3v18 M3 12h18',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
undo:'m8 4-5 5 5 5 M3 9h11a6 6 0 0 1 0 12h-3',redo:'m16 4 5 5-5 5 M21 9H10a6 6 0 0 0 0 12h3',
design:'m4 20 4-1L20 7l-3-3L5 16z M13 8l3 3',
save:'M4 3h14l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8',folder:'M3 6h7l2 3h9v12H3z M3 6V3h7l2 3',
download:'M12 3v12m-5-5 5 5 5-5 M4 17v4h16v-4',upload:'M12 17V5m-5 5 5-5 5 5 M4 17v4h16v-4',font:'M3 20 10 3l7 17 M5 15h10 M18 12h5 M20 10v10',document:'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'
};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',shapes[name]||shapes.document);svg.append(p);return svg;}
document.addEventListener('DOMContentLoaded',()=>{
 const names={up:'up',down:'down',cellLeft:'left',cellCenter:'center',cellRight:'right',cellMiddle:'middle',selectColumns:'columns',selectRows:'rows',selectTable:'table',equalWidth:'equal',equalHeight:'height',rowHeader:'header',lastRowHeader:'footer',plain:'text',selectAll:'all',selectNone:'none',addParagraph:'add',deleteBlocks:'trash',undo:'undo',redo:'redo',designHierarchy:'design',webSave:'save',webLoad:'folder',webBackup:'download',webImport:'upload',webHTML:'document',webRTF:'document',clear:'trash',example:'table',documentExample:'document'};
 for(const [id,name] of Object.entries(names)){const b=$(id);if(!b)continue;const text=b.textContent.trim();b.title=text;b.setAttribute('aria-label',text);b.classList.add('tool-icon');const label=document.createElement('span');label.className='sr-only';label.textContent=text;b.replaceChildren(icon(name),label);}
 for(const [id,name] of [['copy','copy'],['copyCK','copy'],['installApp','install'],['showHelp','help'],['loadFonts','font'],['convert','spark']]){const b=$(id);b.classList.add('with-icon');b.prepend(icon(name));b.title=b.textContent.trim();}
 const welcome=$('welcomeGuide'), tour=$('guidedTour');
 const markSeen=()=>{try{localStorage.setItem(seenKey,'1');}catch{}};
 function closeTour(){tour.hidden=true;tourTarget?.classList.remove('tour-focus');tourTarget=null;document.body.classList.remove('guide-green');markSeen();}
 function showWelcome(){closeTour();if(!welcome.open)welcome.showModal();}
 function dismissWelcome(){welcome.close();markSeen();}
 $('showHelp').onclick=showWelcome;
 $('dismissWelcome').onclick=$('laterGuide').onclick=dismissWelcome;
 welcome.addEventListener('cancel',markSeen);
 const common=[
 ['#source','자료 복사 후 붙여넣기','ChatGPT·Claude 등 AI나 웹페이지에서 표가 포함된 자료를 복사합니다. 왼쪽 ‘원본 붙여넣기’ 칸을 클릭하고 Ctrl+V로 붙여넣습니다. 문장과 표를 함께 복사해도 됩니다.'],
 ['#convert','변환하고 미리보기 확인','붙여넣으면 변환된 문서가 표시됩니다. 원문을 직접 입력하거나 수정한 경우 ‘변환’을 누릅니다. 번호와 표가 오른쪽에 들어왔는지 확인합니다. 연습하려면 ‘문서 예시’ 아이콘을 이용하세요.'],
 ['#editor','본문과 표를 직접 편집','오른쪽 본문이나 표의 내용을 클릭해 수정합니다. 드래그로 문단과 표를 가로질러 선택할 수 있습니다. 번호와 들여쓰기는 실제 스페이스 문자로 유지됩니다.'],
 ['.toolbar','서체와 표 서식 조정','서체 칸에 이름을 입력해 찾고 선택합니다. ‘내 PC 서체 불러오기’는 권한 승인 후 설치된 글꼴 목록을 보여줍니다. 글자 크기·표 폭·제목 색을 조정할 수 있습니다. 도구 아이콘 위에 마우스를 올리면 이름이 나옵니다.']
 ];
 function steps(){return [...common,tourMode==='academic'?['#copyCK','학사정보 게시판 형식 복사','녹색 ‘학사정보 형식 복사’를 누릅니다. 학사정보 시스템의 게시판 글쓰기 화면으로 이동해 일반 본문 편집 영역을 클릭한 뒤 Ctrl+V로 붙여넣습니다. HTML 소스 입력창에는 붙여넣지 않습니다.']:['#copy','기안문 형식 복사','파란색 ‘기안문 형식 복사’를 누릅니다. 그룹웨어 기안문 작성 화면의 일반 본문 편집 영역을 클릭하고 Ctrl+V로 붙여넣습니다. HTML 소스 입력창에는 붙여넣지 않습니다.'],['#webSave','최종 확인과 초안 저장','붙여넣은 문서에서 번호·표·서체를 확인합니다. ‘초안 저장’은 현재 브라우저에 저장하며, 다른 PC로 옮길 때는 ‘백업 다운로드’를 사용합니다. 상단 ‘사용법’에서 안내를 다시 볼 수 있습니다.']];}
 function renderTour(){tourTarget?.classList.remove('tour-focus');const list=steps(), [selector,title,body]=list[tourIndex];tourTarget=document.querySelector(selector);tourTarget?.classList.add('tour-focus');tourTarget?.scrollIntoView({block:'nearest',behavior:'auto'});$('tourProgress').textContent=(tourMode==='academic'?'학사정보':'기안문')+' · '+(tourIndex+1)+' / '+list.length;$('tourTitle').textContent=title;$('tourBody').textContent=body;$('tourBack').disabled=tourIndex===0;$('tourNext').textContent=tourIndex===list.length-1?'완료':'다음';}
 function start(mode){dismissWelcome();tourMode=mode;tourIndex=0;tour.hidden=false;document.body.classList.toggle('guide-green',mode==='academic');renderTour();}
 $('guideStandard').onclick=()=>start('standard');$('guideAcademic').onclick=()=>start('academic');
 $('tourBack').onclick=()=>{if(tourIndex>0){tourIndex--;renderTour();}};
 $('tourNext').onclick=()=>{if(tourIndex===steps().length-1)closeTour();else{tourIndex++;renderTour();}};
 $('closeTour').onclick=closeTour;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!tour.hidden)closeTour();});
 $('installApp').onclick=async()=>{
  if(matchMedia('(display-mode: standalone)').matches){$('installMessage').textContent='이미 설치된 앱으로 실행 중입니다.';$('installGuide').showModal();return;}
  if(installPrompt){const p=installPrompt;installPrompt=null;try{await p.prompt();await p.userChoice;}catch{$('installGuide').showModal();}return;}
  $('installGuide').showModal();
 };
 $('closeInstall').onclick=()=>$('installGuide').close();
 $('fontFamily').addEventListener('change',()=>{const font=$('fontFamily').value.trim();if(font)document.dispatchEvent(new CustomEvent('editor-font-change',{detail:font}));});
 $('fontFamily').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('fontFamily').dispatchEvent(new Event('change'));$('fontFamily').blur();}});
 $('loadFonts').onclick=async()=>{
  const b=$('loadFonts');if(!window.queryLocalFonts){$('status').textContent='이 브라우저는 설치 서체 목록 읽기를 지원하지 않습니다. 서체 이름을 직접 입력해 주세요. 설치되지 않은 서체는 대체 글꼴로 표시됩니다.';return;}
  b.disabled=true;
  try{const fonts=await window.queryLocalFonts();const primary=['굴림','나눔고딕','휴먼명조','맑은 고딕','바탕','돋움'];const families=[...new Set(fonts.map(f=>f.family))].filter(f=>!primary.includes(f)).sort((a,b)=>a.localeCompare(b,'ko'));$('fontChoices').replaceChildren(...[...primary,...families].map(f=>{const o=document.createElement('option');o.value=f;return o;}));$('status').textContent='내 PC 서체 '+families.length+'종을 불러왔습니다. 서체 칸에 이름을 입력해 검색하세요.';}
  catch(e){$('status').textContent='서체 접근이 허용되지 않았습니다. 기본 서체를 선택하거나 설치된 서체 이름을 직접 입력해 주세요.';}
  finally{b.disabled=false;}
 };
 let seen=false;try{seen=localStorage.getItem(seenKey)==='1';}catch{}
 if(!seen)showWelcome();
});
})();
