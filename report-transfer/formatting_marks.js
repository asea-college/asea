(()=>{"use strict";document.addEventListener("DOMContentLoaded",()=>{
 const editor=document.getElementById("editor"),check=document.getElementById("showFormatting");if(!editor||!check)return;
 const overlay=document.createElement("div");overlay.className="formatting-overlay";overlay.setAttribute("aria-hidden","true");document.body.append(overlay);
 let frame=0;check.checked=localStorage.getItem("asea-show-formatting")==="true";
 function draw(){frame=0;overlay.replaceChildren();if(!check.checked)return;
 const origin=editor.getBoundingClientRect();let count=0;
 for(const host of editor.querySelectorAll(".doc-text,td")){
  const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let n;
  while((n=walker.nextNode()))for(let i=0;i<n.length&&count<3000;i++)if(n.data[i]===" "||n.data[i]==="\u00a0"||n.data[i]==="\n"){
   const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+1);const r=range.getBoundingClientRect();if(!r.width&&!r.height)continue;
   const span=document.createElement("span");span.textContent=n.data[i]==="\n"?"↵":"·";span.style.cssText="left:"+(r.left+scrollX)+"px;top:"+(r.top+scrollY)+"px;width:"+Math.max(r.width,3)+"px;height:"+r.height+"px";overlay.append(span);count++;
  }
  const range=document.createRange();range.selectNodeContents(host);range.collapse(false);const r=range.getBoundingClientRect();if(r.height){const span=document.createElement("span");span.textContent="¶";span.style.cssText="left:"+(r.left+scrollX)+"px;top:"+(r.top+scrollY)+"px";overlay.append(span);}
 }
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw);};
 check.addEventListener("change",()=>{localStorage.setItem("asea-show-formatting",String(check.checked));schedule();});
 new MutationObserver(schedule).observe(editor,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["style"]});
 addEventListener("resize",schedule);addEventListener("scroll",schedule,true);document.addEventListener("editor-layout-ready",schedule);schedule();
});})();