(function(root){
"use strict";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function rtfHTML(rtf){
 if(!/^\s*\{\\rtf/.test(rtf))return "";
 let state={skip:false,uc:1,b:false,i:false,size:10},stack=[],text="",para="",out="",row=null,table="",fallback=0;
 function flush(){if(text){para+='<span style="font-size:'+state.size+'pt;font-weight:'+(state.b?'bold':'normal')+';font-style:'+(state.i?'italic':'normal')+'">'+esc(text)+'</span>';text="";}}
 function endTable(){if(table){out+='<table border="1" style="border-collapse:collapse">'+table+'</table>';table="";}}
 function paragraph(){flush();if(row){para+="<br>";return;}endTable();out+='<p>'+(para||"<br>")+'</p>';para="";}
 function cell(){flush();if(!row)row={cells:[],widths:[]};row.cells.push(para.replace(/<br>$/,""));para="";}
 for(let at=0;at<rtf.length;){
  const ch=rtf[at++];
  if(ch==="{"){flush();stack.push({...state});continue;}
  if(ch==="}"){flush();state=stack.pop()||state;continue;}
  if(ch!=="\\"){if(!state.skip&&ch!=="\r"&&ch!=="\n"){if(fallback)fallback--;else text+=ch;}continue;}
  if(rtf[at]==="'"){
   let bytes=[];while(rtf[at]==="'"&&/^[a-f\d]{2}$/i.test(rtf.slice(at+1,at+3))){bytes.push(parseInt(rtf.slice(at+1,at+3),16));at+=3;if(rtf[at]==="\\"&&rtf[at+1]==="'")at++;else break;}
   if(!state.skip){let t;try{t=new TextDecoder("euc-kr").decode(new Uint8Array(bytes));}catch{t=String.fromCharCode(...bytes);}if(fallback)fallback=Math.max(0,fallback-bytes.length);else text+=t;}continue;
  }
  const m=/^([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(at));
  if(!m){const c=rtf[at++];if(c==="*")state.skip=true;else if(!state.skip&&/[\\{}]/.test(c)){if(fallback)fallback--;else text+=c;}continue;}
  at+=m[0].length;const k=m[1],n=m[2]===undefined?1:+m[2];
  if(["fonttbl","colortbl","stylesheet","info","pict","object","header","footer","fldinst","listtable","listoverridetable"].includes(k)){state.skip=true;continue;}
  if(state.skip)continue;
  if(k==="u"){text+=String.fromCharCode(n<0?n+65536:n);fallback=state.uc;continue;}
  if(k==="uc"){state.uc=n;continue;}
  if(k==="par"){paragraph();continue;}if(k==="line"){flush();para+="<br>";continue;}
  if(k==="tab"){text+="\t";continue;}
  if(k==="trowd"){if(para||text)paragraph();row={cells:[],widths:[]};continue;}
  if(k==="cellx"&&row){row.widths.push(n);continue;}
  if(k==="cell"){cell();continue;}
  if(k==="row"){if(row){if(para||text)cell();table+="<tr>"+row.cells.map((v,i)=>'<td style="border:1px solid #333;width:'+Math.max(1,((row.widths[i]||1500)-(row.widths[i-1]||0))/20)+'pt">'+v+'</td>').join("")+"</tr>";row=null;}continue;}
  if(["b","i","fs"].includes(k)){flush();if(k==="b")state.b=!!n;else if(k==="i")state.i=!!n;else state.size=n/2;}
 }
 if(text||para)paragraph();endTable();return out;
}
root.OfficeClipboard={rtfHTML,read(clip){
 let html=clip.getData("text/html"),text=clip.getData("text/plain");
 const rtf=clip.getData("text/rtf")||clip.getData("application/rtf");
 if(!/<table\b/i.test(html)&&/\\trowd\b/.test(rtf)){const converted=rtfHTML(rtf);if(converted)html=converted;}
 return {html,text,types:[...clip.types]};
}};
})(window);