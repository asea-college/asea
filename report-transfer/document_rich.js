(function (root) {
  "use strict";
  const D = root.DocumentCodec,
    T = root.TableCodec,
    plain = D.parse;
  let serial = 0;
  const id = () => "rich" + Date.now() + "_" + ++serial,
    num = (v, base = 10) => {
      const n = parseFloat(v);
      return Number.isFinite(n)
        ? /px$/.test(v)
          ? n * 0.75
          : /mm$/.test(v)
            ? (n * 72) / 25.4
            : n
        : base;
    };
  function hex(v) {
    if (!v || v === "transparent" || v === "none") return "transparent";
    if (/^#[a-f\d]{3}$/i.test(v))
      return (
        "#" +
        v
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      );
    if (/^#[a-f\d]{6}$/i.test(v)) return v;
    const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m
      ? "#" +
          m
            .slice(1)
            .map((v) => (+v).toString(16).padStart(2, "0"))
            .join("")
      : v === "black"
        ? "#000000"
        : v === "white"
          ? "#ffffff"
          : undefined;
  }
  // Resolve Markdown bold markers even when clipboard HTML split them across spans.
  // Update every offset against the original text before stripping the tokens.
  function resolveBoldTokens(b) {
    if(b.preserveMarkdown || !b.text?.includes("**"))return b;
    const source=b.text, tokens=[];
    for(const m of source.matchAll(/\*\*/g)){
      if(m.index>0 && source[m.index-1]==="\\")continue;
      if((b.markdownCodeRanges||[]).some(r=>m.index>=r.start && m.index<r.end))continue;
      tokens.push(m.index);
    }
    if(!tokens.length)return b;
    const offset=n=>{
      let lo=0,hi=tokens.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(tokens[mid]<n)lo=mid+1;else hi=mid;}
      return n-2*lo+(lo?Math.max(0,2-(n-tokens[lo-1])):0);
    };
    const marks=(b.marks||[]).map(m=>({...m,start:offset(m.start),end:offset(m.end)})).filter(m=>m.end>m.start);
    for(let i=0;i+1<tokens.length;i+=2){
      const start=offset(tokens[i]+2),end=offset(tokens[i+1]);
      if(end>start)marks.push({start,end,style:{bold:true}});
    }
    b.marks=marks;
    b.links=(b.links||[]).map(l=>({...l,start:offset(l.start),end:offset(l.end)})).filter(l=>l.end>l.start);
    for(const image of b.inlineImages||[])image.offset=offset(image.offset);
    const chunks=[];let from=0;
    for(const at of tokens){chunks.push(source.slice(from,at));from=at+2;}
    chunks.push(source.slice(from));b.text=chunks.join("");
    delete b.markdownCodeRanges;
    return b;
  }
  function parseHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html"),
      out = [],
      warnings = [],
      rules = [];
    for (const el of doc.querySelectorAll(
      "script,iframe,object,embed,link,svg",
    )) {
      if (el.tagName !== "SCRIPT")
        warnings.push({
          blockId: "",
          message: "스크립트·임베디드 개체는 편집 본문에서 제외했습니다.",
          feature: "object",
        });
      el.remove();
    }
    for (const style of doc.querySelectorAll("style"))
      for (const m of style.textContent
        .replace(/\/\*[^]*?\*\//g, "")
        .matchAll(/([^{}]+)\{([^{}]*)\}/g))
        rules.push([m[1].trim(), m[2]]);
    function css(el) {
      const values = {};
      for (const [selector, body] of rules) {
        try {
          if (!el.matches(selector)) continue;
        } catch {
          continue;
        }
        for (const item of body.split(";")) {
          const at = item.indexOf(":");
          if (at > 0)
            values[item.slice(0, at).trim().toLowerCase()] = item
              .slice(at + 1)
              .trim();
        }
      }
      for (let i = 0; i < el.style.length; i++) {
        const k = el.style[i];
        values[k] = el.style.getPropertyValue(k);
      }
      return values;
    }
    function style(el, inherited = {}) {
      const c = css(el),
        s = { ...inherited };
      if (c["font-family"])
        s.fontFamily = c["font-family"]
          .split(",")[0]
          .replace(/["']/g, "")
          .trim();
      if (el.getAttribute("face")) s.fontFamily = el.getAttribute("face");
      if (c["font-size"]) s.fontSize = num(c["font-size"]);
      if (c.color || el.getAttribute("color"))
        s.color = hex(c.color || el.getAttribute("color"));
      if (c["background-color"] || c.background)
        s.background = hex(c["background-color"] || c.background);
      if (c["font-weight"])
        s.bold = c["font-weight"] === "bold" || +c["font-weight"] >= 600;
      if (/^(B|STRONG)$/.test(el.tagName)) s.bold = true;
      if (c["font-style"]) s.italic = c["font-style"] === "italic";
      if (/^(I|EM)$/.test(el.tagName)) s.italic = true;
      if (c["text-decoration"]) {
        s.underline = c["text-decoration"].includes("underline");
        s.strike = c["text-decoration"].includes("line-through");
      }
      if (el.tagName === "U") s.underline = true;
      if (/^(S|STRIKE|DEL)$/.test(el.tagName)) s.strike = true;
      if (c["letter-spacing"])
        s.letterSpacing = (num(c["letter-spacing"], 0) * 4) / 3;
      if (c["mso-font-width"]) s.fontScale = parseFloat(c["mso-font-width"]);
      if (c["text-align"] || el.getAttribute("align"))
        s.align = c["text-align"] || el.getAttribute("align");
      return s;
    }
    function paragraph(el) {
      const c = css(el),
        s = style(el),
        b = {
          id: id(),
          kind: /^H[1-6]$/.test(el.tagName) ? "heading" : "paragraph",
          literal: true,
          level: null,
          text: "",
          preserveMarkdown: el.tagName==="PRE",
          style: s,
          marks: [],
          links: [],
        };
      if (c["line-height"]) {
        if (/pt|px|mm/.test(c["line-height"]))
          s.lineHeightPt = num(c["line-height"]);
        else
          s.lineHeight =
            parseFloat(c["line-height"]) /
            (c["line-height"].includes("%") ? 100 : 1);
      }
      for (const [key, to] of [
        ["margin-bottom", "paragraphGap"],
        ["margin-top", "spaceBefore"],
        ["margin-left", "indentLeftPt"],
        ["margin-right", "indentRightPt"],
        ["text-indent", "firstLinePt"],
      ])
        if (c[key]) s[to] = num(c[key], 0);
      if (c["page-break-before"] === "always") b.pageBreakBefore = true;
      function walk(n, st, link) {
        if (n.nodeType === 3) {
          const text = n.nodeValue.replace(/\r/g, "");
          const at = b.text.length;
          b.text += text;
          if(n.parentElement?.closest("code,pre"))(b.markdownCodeRanges ||= []).push({start:at,end:b.text.length});
          if (text.length) {
            b.marks.push({ start: at, end: b.text.length, style: st });
            if (link) b.links.push({ start: at, end: b.text.length, ...link });
          }
          return;
        }
        if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TABLE)$/.test(n.tagName))
          return;
        if (n.tagName === "BR") {
          b.text += "\n";
          return;
        }
        if (n.tagName === "IMG") {
          const src = n.getAttribute("src") || "";
          if (/^data:image\//.test(src))
            b.inlineImages = (b.inlineImages || []).concat({
              offset: b.text.length,
              image: {
                src,
                width:
                  parseFloat(n.getAttribute("width") || n.style.width) || 300,
                height:
                  parseFloat(n.getAttribute("height") || n.style.height) || 200,
                align: "left",
              },
            });
          else
            warnings.push({
              blockId: b.id,
              message:
                "외부·로컬 경로 그림은 클립보드 이미지 데이터가 없어 원본 참조로 보관됩니다.",
              feature: "image",
            });
          return;
        }
        const next = style(n, st),
          url = n.tagName === "A" ? D.validURL(n.getAttribute("href")) : null;
        for (const child of n.childNodes)
          walk(
            child,
            next,
            url ? { url, newWindow: n.target === "_blank" } : link,
          );
      }
      for (const child of el.childNodes) walk(child, s, null);
      return resolveBoldTokens(b);
    }
    function table(el) {
      const rows = T.parse(el.outerHTML, ""),
        b = {
          id: id(),
          kind: "table",
          level: null,
          rows,
          headerRows: [],
          tableOptions: {
            header: false,
            cellStyles: {},
            cellMarks: {},
            cellLinks: {},
            cellImages: {},
            merges: [],
            widths: [],
          },
        },
        o = b.tableOptions;
      const align = el.getAttribute("align") || css(el)["text-align"];
      o.tableAlign = ["left", "center", "right"].includes(align)
        ? align
        : "left";
      const grid = [];
      [...el.rows].forEach((tr, ri) => {
        grid[ri] ||= [];
        let ci = 0;
        for (const td of tr.cells) {
          while (grid[ri][ci]) ci++;
          const spanR = td.rowSpan || 1,
            spanC = td.colSpan || 1;
          for (let r = 0; r < spanR; r++) {
            grid[ri + r] ||= [];
            for (let c = 0; c < spanC; c++) grid[ri + r][ci + c] = true;
          }
          if (spanR > 1 || spanC > 1)
            o.merges.push({ row: ri, col: ci, rowSpan: spanR, colSpan: spanC });
          const key = ri + ":" + ci,
            p = paragraph(td),
            c = css(td),
            st = (o.cellStyles[key] = {
              align: p.style.align || td.getAttribute("align") || "left",
              valign:
                td.getAttribute("valign") || c["vertical-align"] || "middle",
            });
          const paras = td.querySelectorAll("[data-cell-paragraph]").length
            ? [...td.querySelectorAll("[data-cell-paragraph]")]
            : [...td.children].filter((n) => /^(P|DIV)$/.test(n.tagName));
          if (paras.length) {
            p.text = "";
            p.marks = [];
            p.links = [];
            o.cellParagraphs ||= {};
            o.cellParagraphs[key] = [];
            paras.forEach((el, pi) => {
              const pb = paragraph(el),
                at = p.text.length;
              if (pi) p.text += "\u2029";
              const start = p.text.length;
              p.text += pb.text;
              o.cellParagraphs[key].push({
                start,
                end: p.text.length,
                style: pb.style,
              });
              p.marks.push(
                ...pb.marks.map((m) => ({
                  ...m,
                  start: m.start + start,
                  end: m.end + start,
                })),
              );
              p.links.push(
                ...pb.links.map((m) => ({
                  ...m,
                  start: m.start + start,
                  end: m.end + start,
                })),
              );
              if (pi === 0 && pb.style.align) st.align = pb.style.align;
            });
          }
          rows[ri][ci] = p.text.replace(/\n$/, "");
          o.cellMarks[key] = p.marks;
          o.cellLinks[key] = p.links;
          if (p.inlineImages)
            o.cellImages[key] = p.inlineImages.map((x) => x.image);
          const bg = hex(
            c["background-color"] || c.background || td.getAttribute("bgcolor"),
          );
          if (bg && bg !== "transparent") st.background = bg;
          for (const side of ["left", "right", "top", "bottom"]) {
            const value = c["border-" + side] || c.border;
            if (value)
              st[side] = /none|hidden|^0(?:px|pt)?\b/.test(value)
                ? "none"
                : /double/.test(value)
                  ? "double"
                  : /dotted|dashed/.test(value)
                    ? "dotted"
                    : "solid";
          }
          if (td.tagName === "TH" && !b.headerRows.includes(ri))
            b.headerRows.push(ri);
          if (ri === 0)
            o.widths.push(
              parseFloat(td.getAttribute("width") || c.width) || 100,
            );
          ci += spanC;
        }
      });
      return b;
    }
    function walk(el) {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          if (n.nodeValue.trim()) {
            const p = doc.createElement("p");
            p.textContent = n.nodeValue;
            out.push(paragraph(p));
          }
          continue;
        }
        if (n.nodeType !== 1 || /^(STYLE|SCRIPT|HEAD|META)$/.test(n.tagName))
          continue;
        if (n.tagName === "TABLE") {
          out.push(table(n));
          continue;
        }
        if (/^(OL|UL)$/.test(n.tagName)) {
          const parents = []; for(let p=n.parentElement;p;p=p.parentElement) if(/^(OL|UL)$/.test(p.tagName)) parents.push(p);
          const depth = Math.min(5, parents.length);
          let number = Number(n.getAttribute("start")) || 1;
          for(const li of [...n.children].filter(x=>x.tagName === "LI")) {
            if(li.hasAttribute("value")) number=Number(li.getAttribute("value")) || number;
            const copy=li.cloneNode(true);copy.querySelectorAll("ol,ul").forEach(x=>x.remove());
            const b=paragraph(copy);
            const existing=/^[ \u00a0]*(?:\d+[.)]|[가-하][.)]|[•●▪-])[ \u00a0]+/.test(b.text);
            if(!existing) {
              const marker=n.tagName === "OL" ? number+"." : "•";
              const prefix=" ".repeat(depth*2)+marker+" ";
              b.text=prefix+b.text.trimEnd();
              for(const key of ["marks","links"]) for(const r of b[key]||[]) {r.start+=prefix.length;r.end+=prefix.length;}
              for(const image of b.inlineImages||[]) image.offset+=prefix.length;
              b.hierarchySpacingNormalized=true;
            }
            b.style.indentLeftPt=0;b.style.firstLinePt=0;
            out.push(b);number++;
            const visitNested=el=>{for(const child of el.children) {if(/^(OL|UL)$/.test(child.tagName)) walk({childNodes:[child]});else visitNested(child);}};
            visitNested(li);
          }
          continue;
        }
        if (/^(P|H[1-6]|PRE|LI|BLOCKQUOTE)$/.test(n.tagName)) {
          out.push(paragraph(n));
          continue;
        }
        if (n.tagName === "IMG") {
          const p = doc.createElement("p");
          p.append(n.cloneNode());
          out.push(paragraph(p));
          continue;
        }
        if (
          n.tagName === "DIV" &&
          !n.querySelector("p,div,table,h1,h2,h3,h4,h5,h6,ul,ol")
        )
          out.push(paragraph(n));
        else walk(n);
      }
    }
    walk(doc.body);
    D.lastImportWarnings = warnings;
    return out;
  }
  D.parse = function (html, text, mode) {
    if (html && /<(?:p|div|table|h[1-6]|img|ul|ol)\b/i.test(html)) {
      const blocks = parseHTML(html);
      if (blocks.length) return D.normalize(blocks, mode);
    }
    D.lastImportWarnings = [];
    return plain(html, text, mode);
  };
  D.parseRichHTML = parseHTML;
})(window);
