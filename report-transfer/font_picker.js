(()=>{
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const input=document.getElementById('fontFamily'),choices=document.getElementById('fontChoices');
 if(!input||!choices)return;
 input.removeAttribute('list');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','fontPickerList');
 const shell=document.createElement('span');shell.className='font-picker-shell';input.before(shell);shell.append(input);
 const arrow=document.createElement('button');arrow.type='button';arrow.className='font-picker-arrow';arrow.setAttribute('aria-label','서체 목록 열기');arrow.title='서체 목록 열기';arrow.textContent='▾';shell.append(arrow);
 const menu=document.createElement('div');menu.id='fontPickerList';menu.className='font-picker-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label','서체 검색 결과');menu.hidden=true;document.body.append(menu);
 let values=[],selected=-1,lastValue=input.value,shown=0;
 function position(){
   if(menu.hidden)return;
   const r=input.getBoundingClientRect(),width=Math.min(Math.max(r.width,300),innerWidth-16);
   menu.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';
   menu.style.top=(r.bottom+4)+'px';menu.style.width=width+'px';
   menu.style.maxHeight=Math.max(100,Math.min(320,innerHeight-r.bottom-16))+'px';
 }
 function close(){menu.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function activate(i){
   if(!values.length)return;selected=(i+values.length)%values.length;
   for(const el of menu.querySelectorAll('[role=option]'))el.setAttribute('aria-selected',String(+el.dataset.index===selected));
   const item=menu.querySelector('[data-index="'+selected+'"]');if(item){input.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}
 }
 function choose(i){
   if(!values[i])return;lastValue=values[i];input.value=lastValue;
   close();input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();
 }
 function more(){
   const limit=Math.min(values.length,shown+60),fragment=document.createDocumentFragment();
   for(let i=shown;i<limit;i++){
     const option=document.createElement('div');option.id='font-choice-'+i;option.className='font-picker-option';option.setAttribute('role','option');option.setAttribute('aria-selected',String(input.value===values[i]));option.dataset.index=i;
     const name=document.createElement('span');name.textContent=values[i];name.style.fontFamily=JSON.stringify(values[i])+',sans-serif';name.className='font-choice-name';
     const sample=document.createElement('span');sample.textContent='가나다 ABC 123';sample.style.fontFamily=JSON.stringify(values[i])+',sans-serif';sample.className='font-choice-sample';
     option.append(name,sample);option.addEventListener('mousedown',event=>event.preventDefault());option.addEventListener('click',()=>choose(i));fragment.append(option);
   }
   shown=limit;menu.append(fragment);
 }
 function open(query=''){
   const q=query.trim().toLocaleLowerCase();values=[...new Set([...choices.options].map(o=>o.value))].filter(f=>!q||f.toLocaleLowerCase().includes(q));
   menu.replaceChildren();selected=-1;shown=0;
   if(!values.length){const empty=document.createElement('div');empty.className='font-picker-empty';empty.textContent='일치하는 서체가 없습니다. 설치된 서체명은 직접 입력 후 Enter로 적용할 수 있습니다.';menu.append(empty);}
   more();menu.hidden=false;input.setAttribute('aria-expanded','true');position();
 }
 input.addEventListener('focus',()=>{lastValue=input.value;open();input.select();});
 input.addEventListener('click',()=>{if(menu.hidden)open();});
 input.addEventListener('input',()=>open(input.value));
 input.addEventListener('keydown',event=>{
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();event.stopImmediatePropagation();if(menu.hidden)open();
     if(selected+1>=shown&&shown<values.length)more();
     activate(selected+(event.key==='ArrowDown'?1:-1));return;
   }
   if(event.key==='Enter'){
     event.preventDefault();event.stopImmediatePropagation();
     if(!menu.hidden&&selected>=0)choose(selected);
     else{close();lastValue=input.value.trim();input.value=lastValue;if(lastValue)input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();}
   }
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();input.value=lastValue;close();}
   if(event.key==='Tab')close();
 },true);
 input.addEventListener('blur',()=>{if(!menu.contains(document.activeElement))close();});
 arrow.addEventListener('mousedown',event=>event.preventDefault());
 arrow.onclick=()=>{if(menu.hidden){input.focus();open();}else close();};
 menu.addEventListener('scroll',()=>{if(menu.scrollHeight-menu.scrollTop-menu.clientHeight<80&&shown<values.length)more();});
 document.addEventListener('mousedown',event=>{if(!shell.contains(event.target)&&!menu.contains(event.target))close();},true);
 window.addEventListener('resize',position);
 document.addEventListener('scroll',event=>{if(!menu.contains(event.target))position();},true);
 new MutationObserver(()=>{if(!menu.hidden)open(input.value===lastValue?'':input.value);}).observe(choices,{childList:true});
});
})();
