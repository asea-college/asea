(function (root) {
  "use strict";
  const T = root.TableCodec,
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const ko = [
    "가",
    "나",
    "다",
    "라",
    "마",
    "바",
    "사",
    "아",
    "자",
    "차",
    "카",
    "타",
    "파",
    "하",
  ];
  let serial = 0;
  const clean = (s) =>
    String(s)
      .replace(/\\\*/g, "*")
      .replace(/\*\*/g, "")
      .replace(/__([^]*?)__/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .trim();
  const stripMarker = (s) =>
    clean(s).replace(/^(?:\d+[.)]|[가-하][.)]|[•●▪])\s+(?=\S)/, "");
  const block = (kind, text = "", level = null, rows) => ({
    id: "b" + ++serial,
    kind,
    text: (String(text).match(/^[ \u00a0]*/) || [""])[0] + clean(text),
    level,
    literal: kind !== "table",
    ...(rows ? { rows } : {}),
  });
  // Hierarchy indentation is stored in text as U+0020, never layout offsets.
  function spaceHierarchy(b) {
    if (b.hierarchySpacingNormalized || !b.literal || b.kind === "table" || b.kind === "image") return;
    const official = /(?:^|\n)[ \u00a0]*[가-하][.)]\s/.test(b.text || "");
    const edits = [];
    const source = String(b.text || "");
    const re = /^([ \u00a0]*)(\d+\.|[가-하]\.|\d+\)|[가-하]\)|[•●▪]|-)([ \u00a0]+)(?=\S)/gm;
    let m;
    while ((m = re.exec(source))) {
      const mark = m[2];
      const level = /^\d+\.$/.test(mark) ? 0 : /^[가-하]\.$/.test(mark) ? 1 : /^\d+\)$/.test(mark) ? 2 : /^[가-하]\)$/.test(mark) ? 3 : /^[•●▪]$/.test(mark) ? (official ? 4 : 2) : (official ? 5 : 3);
      edits.push({at:m.index, old:m[1].length, value:" ".repeat(level * 2)});
    }
    for (const e of edits.reverse()) {
      b.text = b.text.slice(0,e.at) + e.value + b.text.slice(e.at + e.old);
      const offset = v => v <= e.at ? v : v >= e.at + e.old ? v + e.value.length - e.old : e.at + e.value.length;
      for (const key of ["marks","links"]) for (const r of b[key] || []) {r.start=offset(r.start);r.end=offset(r.end);}
      for (const img of b.inlineImages || []) img.offset=offset(img.offset);
    }
    if(edits.length) {
      b.style ||= {}; b.style.indentLeftPt=0; b.style.firstLinePt=0;
      b.spaceIndent=false; b.spaceIndentWidthPt=0;
    }
    b.hierarchySpacingNormalized=true;
  }
  function normalize(blocks, mode = "report", enforce = false) {
    let previous = -1;
    for (const b of blocks) {
      spaceHierarchy(b);
      if (b.kind === "image") continue;
      if (b.kind === "table") {
        b.rows = T.normalize(b.rows.map((r) => r.map((v) => String(v ?? ""))));
        continue;
      }
      b.text = b.literal
        ? String(b.text ?? "")
        : b.level === null
          ? clean(b.text)
          : stripMarker(b.text);
      if (b.level !== null) {
        b.level = Math.max(
          0,
          Math.min(
            5,
            Number(b.level) || 0,
            enforce && !b.literal ? previous + 1 : 5,
          ),
        );
        previous = b.level;
      }
    }
    return blocks;
  }
  function markdown(text) {
    text = String(text)
      .replace(/&#(?:x0*20|0*32);/gi, " ")
      .replace(/&nbsp;|&#(?:x0*a0|0*160);/gi, "\u00a0");
    const lines = String(text).replace(/\r/g, "").split("\n"),
      out = [];
    const headings = lines
      .map((l) => l.match(/^\s{0,3}(#{1,6})\s+/))
      .filter(Boolean);
    const base = headings.length
      ? Math.min(...headings.map((m) => m[1].length))
      : 1;
    const official = lines.some((l) => /^\s*[가-하][.)]\s+/.test(l));
    const explicitScheme =
      official || lines.some((l) => /^\s*[•●▪]\s+/.test(l));
    let pending = [],
      fenced = false,
      lastHeading = -1;
    const flush = () => {
      if (pending.length) {
        out.push(block("paragraph", pending.join("\n")));
        pending = [];
      }
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i],
        trim = line.trim();
      if (/^```|^~~~/.test(trim)) {
        flush();
        fenced = !fenced;
        continue;
      }
      if (fenced) {
        pending.push(line);
        continue;
      }
      if (!trim) {
        flush();
        continue;
      }
      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?\s*:?-+/.test(lines[i + 1]) &&
        lines[i + 1].includes("|")
      ) {
        flush();
        const table = [line];
        while (
          i + 1 < lines.length &&
          lines[i + 1].trim() &&
          lines[i + 1].includes("|")
        )
          table.push(lines[++i]);
        out.push(block("table", "", null, T.parse("", table.join("\n"))));
        continue;
      }
      if (line.includes("\t")) {
        flush();
        const table = [line];
        while (i + 1 < lines.length && lines[i + 1].includes("\t"))
          table.push(lines[++i]);
        out.push(block("table", "", null, T.parse("", table.join("\n"))));
        continue;
      }
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
      if (h) {
        flush();
        lastHeading = Math.max(0, h[1].length - base);
        out.push(block("heading", h[2], lastHeading));
        continue;
      }
      const m = line.match(
        /^(\s*)(\d+\.|[가-하]\.|\d+\)|[가-하]\)|[•●▪]|[-+*])\s+(.+)$/,
      );
      if (m) {
        flush();
        let level;
        const mark = m[2],
          indent = m[1].replace(/\t/g, "    ").length;
        if (/^\d+\.$/.test(mark))
          level = indent
            ? Math.floor(indent / 2)
            : lastHeading >= 0
              ? lastHeading + 1
              : 0;
        else if (/^[가-하]\.$/.test(mark)) level = 1;
        else if (/^\d+\)$/.test(mark)) level = official ? 2 : 1;
        else if (/^[가-하]\)$/.test(mark)) level = 3;
        else if (/^[•●▪]$/.test(mark)) level = official ? 4 : 2;
        else if (mark === "-" && explicitScheme) level = official ? 5 : 3;
        else
          level = indent
            ? Math.max(lastHeading + 1, Math.floor(indent / 2))
            : Math.max(0, lastHeading + 1);
        out.push({
          ...block(level === 0 ? "heading" : "item", m[3], level),
          text: line,
        });
        continue;
      }
      if (/^[-*_]{3,}$/.test(trim)) continue;
      pending.push(line);
    }
    flush();
    return out;
  }
  function htmlBlocks(html) {
    const doc = new DOMParser().parseFromString(html, "text/html"),
      out = [];
    const hs = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const base = hs.length ? Math.min(...hs.map((h) => +h.tagName[1])) : 1;
    let lastHeading = -1;
    function text(n) {
      if (n.nodeType === 3) return n.nodeValue;
      if (
        n.nodeType !== 1 ||
        /^(SCRIPT|STYLE|IMG|IFRAME|OBJECT|SVG)$/.test(n.tagName)
      )
        return "";
      if (n.tagName === "BR") return "\n";
      return (
        [...n.childNodes].map(text).join("") +
        (/^(P|DIV)$/.test(n.tagName) ? "\n" : "")
      );
    }
    function walk(parent, depth = 0) {
      let inline = "";
      const flush = () => {
        if (inline.trim()) out.push(block("paragraph", inline));
        inline = "";
      };
      for (const n of parent.childNodes) {
        if (n.nodeType === 3) {
          inline += n.nodeValue;
          continue;
        }
        if (
          n.nodeType !== 1 ||
          /^(SCRIPT|STYLE|IMG|IFRAME|OBJECT|SVG|BUTTON)$/.test(n.tagName)
        )
          continue;
        if (n.tagName === "TABLE") {
          flush();
          out.push(block("table", "", null, T.parse(n.outerHTML, "")));
        } else if (/^H[1-6]$/.test(n.tagName)) {
          flush();
          lastHeading = +n.tagName[1] - base;
          out.push(block("heading", text(n), lastHeading));
        } else if (/^(OL|UL)$/.test(n.tagName)) {
          flush();
          for (const li of [...n.children].filter((x) => x.tagName === "LI")) {
            const copy = li.cloneNode(true);
            copy.querySelectorAll("ol,ul").forEach((x) => x.remove());
            out.push(
              block("item", text(copy), Math.max(0, lastHeading + 1) + depth),
            );
            for (const nested of [...li.children].filter((x) =>
              /^(OL|UL)$/.test(x.tagName),
            ))
              walk({ childNodes: [nested] }, depth + 1);
          }
        } else if (/^(P|PRE|BLOCKQUOTE)$/.test(n.tagName)) {
          flush();
          out.push(block("paragraph", text(n)));
        } else if (/^(DIV|SECTION|ARTICLE|MAIN|BODY)$/.test(n.tagName)) {
          flush();
          walk(n, depth);
        } else if (n.tagName === "BR") {
          inline += "\n";
        } else inline += text(n);
      }
      flush();
    }
    walk(doc.body);
    return out;
  }
  function parse(html, text, mode = "report") {
    if (String(html || "").length + String(text || "").length > 4e6)
      throw Error("문서가 너무 큽니다. 나누어 넣어 주세요.");
    let blocks =
      html && /<(?:table|p|h[1-6]|ol|ul|div)\b/i.test(html)
        ? htmlBlocks(html)
        : markdown(text || "");
    if (!blocks.length) throw Error("붙여넣을 내용을 찾지 못했습니다.");
    if (blocks.length > 2000)
      throw Error("한 번에 2,000문단 이내로 넣어 주세요.");
    return normalize(blocks, mode, true);
  }
  function labels(blocks, mode = "report", steps) {
    const counters = [0, 0, 0, 0, 0, 0];
    return blocks.map((b) => {
      if (
        b.kind === "table" ||
        b.kind === "image" ||
        b.literal ||
        b.level === null
      )
        return "";
      const l = b.level;
      counters[l]++;
      for (let i = l + 1; i < 6; i++) counters[i] = 0;
      const n = counters[l],
        k =
          n <= ko.length
            ? ko[n - 1]
            : ko[(n - 1) % ko.length] + (Math.floor((n - 1) / ko.length) + 1);
      if (steps?.[l])
        return steps[l].pattern
          .replace(/\{n\}/g, String(n))
          .replace(/\{ko\}/g, k);
      return mode === "official"
        ? [n + ".", k + ".", n + ")", k + ")", "•", "-"][l]
        : [n + ".", n + ")", "•", "-", "-", "-"][l];
    });
  }
  function ckeditorHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const table of doc.querySelectorAll("table")) {
      const a =
        table.getAttribute("data-table-align") ||
        table.getAttribute("align") ||
        "left";
      table.removeAttribute("align");
      table.style.clear = "both";
      table.style.display = "table";
      table.style.marginLeft = a === "left" ? "0px" : "auto";
      table.style.marginRight =
        a === "right" ? "0px" : a === "center" ? "auto" : "0px";
      table.style.float = "none";
      table.style.textAlign = a;
    }
    for (const font of doc.querySelectorAll("font")) {
      const span = doc.createElement("span");
      span.style.fontFamily = font.getAttribute("face") || "휴먼명조";
      span.style.fontSize = font.style.fontSize || "10pt";
      while (font.firstChild) span.append(font.firstChild);
      font.replaceWith(span);
    }
    for (const td of doc.querySelectorAll("td")) {
      const size = td.style.fontSize || "10pt",
        family = td.style.fontFamily || "휴먼명조",
        color = td.style.color || "#000000",
        bg = td.getAttribute("bgcolor") || td.style.backgroundColor;
      td.style.backgroundColor = bg || "#ffffff";
      td.style.borderLeft =
        td.style.borderLeftStyle === "none"
          ? "0px none transparent"
          : td.style.borderLeft;
      td.style.borderRight =
        td.style.borderRightStyle === "none"
          ? "0px none transparent"
          : td.style.borderRight;
      for (const font of td.querySelectorAll("span")) {
        if (!font.style.fontFamily) font.style.fontFamily = family;
        if (!font.style.fontSize) font.style.fontSize = size;
        if (!font.style.color) font.style.color = color;
      }
      if (td.style.fontWeight === "bold" && !td.querySelector("strong,b")) {
        const strong = doc.createElement("strong");
        while (td.firstChild) strong.append(td.firstChild);
        td.append(strong);
      }
    }
    for (const p of doc.querySelectorAll("td>p")) {
      if (p.style.lineHeight && !p.parentElement.style.lineHeight)
        p.parentElement.style.lineHeight = p.style.lineHeight;
      while (p.firstChild) p.before(p.firstChild);
      p.remove();
    }
    for (const p of doc.querySelectorAll("p")) {
      p.style.whiteSpace = "pre-wrap";
      const span = doc.createElement("span");
      span.style.fontFamily = p.style.fontFamily || "inherit";
      span.style.fontSize = p.style.fontSize || "inherit";
      while (p.firstChild) span.append(p.firstChild);
      p.append(span);
    }
    const wrapper = doc.body.firstElementChild;
    if (wrapper) {
      wrapper.setAttribute("xmlns:w", "urn:schemas-microsoft-com:office:word");
      wrapper.setAttribute(
        "xmlns:o",
        "urn:schemas-microsoft-com:office:office",
      );
    }
    for (const p of doc.querySelectorAll("p")) p.classList.add("MsoNormal");
    for (const table of doc.querySelectorAll("table")) {
      table.classList.add("MsoTableGrid");
      const cols = [...table.querySelectorAll("col")].map((c) =>
        parseFloat(c.getAttribute("width") || c.style.width),
      );
      for (const tr of table.rows)
        for (const td of tr.cells) {
          const index = +td.getAttribute("data-cell-col") || td.cellIndex,
            width = cols[index] || parseFloat(td.getAttribute("width"));
          if (width) {
            td.setAttribute("width", String(width));
            td.style.setProperty("width", width + "px", "important");
          }
          td.style.setProperty(
            "font-weight",
            td.style.fontWeight || "normal",
            "important",
          );
          td.style.setProperty(
            "text-align",
            td.getAttribute("align") || td.style.textAlign || "left",
            "important",
          );
          td.style.setProperty(
            "font-family",
            td.style.fontFamily || "inherit",
            "important",
          );
          td.style.setProperty(
            "font-size",
            td.style.fontSize || "10pt",
            "important",
          );
        }
      table.setAttribute(
        "style",
        table.getAttribute("style") +
          ";mso-table-lspace:0pt;mso-table-rspace:0pt;mso-table-layout-alt:fixed",
      );
    }
    return doc.body.innerHTML;
  }
  function validURL(url) {
    try {
      const u = new URL(url);
      return ["https:", "http:", "mailto:"].includes(u.protocol)
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  const fontNames = ["휴먼명조", "Pretendard", "맑은 고딕", "바탕", "굴림"];
  function styleCSS(s) {
    return (
      [
        "color",
        "background",
        "fontSize",
        "fontFamily",
        "letterSpacing",
        "fontScale",
        "bold",
        "italic",
        "underline",
        "strike",
      ]
        .map((k) => {
          const v = s?.[k];
          if (v === undefined) return "";
          if (
            (k === "color" || k === "background") &&
            (/^#[0-9a-f]{6}$/i.test(v) ||
              (k === "background" && v === "transparent"))
          )
            return (
              (k === "background" ? "background-color" : k) + ":" + v + ";"
            );
          if (k === "letterSpacing")
            return "letter-spacing:" + (+v || 0) + "px;";
          if (k === "fontScale")
            return (
              "font-stretch:" +
              Math.max(10, Math.min(400, +v || 100)) +
              "%;" +
              (+v !== 100
                ? "display:inline-block;max-width:100%;transform:scaleX(" +
                  Math.max(0.5, Math.min(2, +v / 100)) +
                  ");transform-origin:left center;"
                : "")
            );
          if (k === "fontSize")
            return "font-size:" + Math.max(0.5, Math.min(96, +v || 10)) + "pt;";
          if (k === "fontFamily" && typeof v === "string" && v.length <= 100)
            return (
              "font-family:" +
              esc("'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\27 ") + "'") +
              ";"
            );
          if (k === "bold")
            return "font-weight:" + (v ? "bold" : "normal") + ";";
          if (k === "italic")
            return "font-style:" + (v ? "italic" : "normal") + ";";
          return "";
        })
        .join("") +
      (s?.underline !== undefined || s?.strike !== undefined
        ? "text-decoration:" +
          ([s.underline ? "underline" : "", s.strike ? "line-through" : ""]
            .filter(Boolean)
            .join(" ") || "none") +
          ";"
        : "")
    );
  }
  function autoLinks(text) {
    return [...String(text).matchAll(/https?:\/\/[^\s<>]+/gi)]
      .map((m) => {
        const label = m[0].replace(/[.,;!?)}\]]+$/, "");
        return {
          start: m.index,
          end: m.index + label.length,
          url: validURL(label),
          newWindow: true,
          auto: true,
        };
      })
      .filter((l) => l.url);
  }
  function runs(b) {
    const text = String(b.text || ""),
      points = new Set([0, text.length]),
      links = (b.links || []).filter((l) => validURL(l.url));
    links.push(
      ...autoLinks(text).filter(
        (a) => !links.some((l) => l.start < a.end && l.end > a.start),
      ),
    );
    const marks = b.marks || [];
    for (const image of b.inlineImages || [])
      points.add(Math.max(0, Math.min(text.length, image.offset)));
    for (const r of [...links, ...marks]) {
      points.add(Math.max(0, Math.min(text.length, +r.start || 0)));
      points.add(Math.max(0, Math.min(text.length, +r.end || 0)));
    }
    const edges = [...points].sort((a, b) => a - b),
      out = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const start = edges[i],
        end = edges[i + 1];
      if (start === end) continue;
      const link = links.find((l) => l.start <= start && l.end >= end),
        style = Object.fromEntries(
          ["letterSpacing", "fontScale"]
            .filter((k) => b.style?.[k] !== undefined)
            .map((k) => [k, b.style[k]]),
        );
      for (const m of marks)
        if (m.start <= start && m.end >= end) Object.assign(style, m.style);
      out.push({
        start,
        end,
        text: text.slice(start, end),
        url: link ? validURL(link.url) : null,
        newWindow: link?.newWindow !== false,
        auto: link?.auto,
        style,
      });
    }
    return out;
  }
  function inlineHTML(b) {
    const images = (at) =>
      (b.inlineImages || [])
        .filter((i) => i.offset === at)
        .map(
          (i, index) =>
            '<span class="inline-document-image" contenteditable="false">' +
            T.imageHTML(i.image) +
            "</span>",
        )
        .join("");
    return (
      runs(b)
        .map((r) => {
          let text = esc(r.text).replace(/\n/g, "<br>"),
            style = styleCSS(r.style);
          if (style) text = '<span style="' + style + '">' + text + "</span>";
          return (
            images(r.start) +
            (r.url
              ? '<a href="' +
                esc(r.url) +
                '"' +
                (r.auto ? ' data-auto-link="1"' : "") +
                (r.newWindow
                  ? ' target="_blank" rel="noopener noreferrer"'
                  : "") +
                ">" +
                text +
                "</a>"
              : text)
          );
        })
        .join("") + images(String(b.text || "").length)
    );
  }
  function inlineRTF(b, colorIndex = () => 0, fonts = fontNames) {
    return (
      runs(b)
        .map((r) => {
          const s = r.style;
          let text = T.rtfEscape(r.text),
            prefix = "";
          for (const [k, tag] of [
            ["bold", "b"],
            ["italic", "i"],
            ["underline", "ul"],
            ["strike", "strike"],
          ])
            if (s[k] !== undefined) prefix += "\\" + tag + (s[k] ? 1 : 0);
          if (s.fontSize) prefix += "\\fs" + Math.round(s.fontSize * 2);
          if (fonts.includes(s.fontFamily))
            prefix += "\\f" + fonts.indexOf(s.fontFamily);
          if (s.letterSpacing !== undefined)
            prefix += "\\expndtw" + Math.round(s.letterSpacing * 15);
          if (s.fontScale !== undefined)
            prefix += "\\charscalex" + Math.round(s.fontScale);
          if (s.color) prefix += "\\cf" + colorIndex(s.color);
          if (s.background)
            prefix +=
              "\\highlight" +
              (s.background === "transparent" ? 0 : colorIndex(s.background));
          if (prefix) text = "{" + prefix + " " + text + "}";
          return (
            (b.inlineImages || [])
              .filter((i) => i.offset === r.start)
              .map((i) => T.imageRTF(i.image))
              .join("") +
            (r.url
              ? "{\\field{\\*\\fldinst " +
                T.rtfEscape(
                  'HYPERLINK "' +
                    r.url.replace(/"/g, "%22") +
                    '"' +
                    (r.newWindow ? ' \\t "_blank"' : ""),
                ) +
                "}{\\fldrslt " +
                text +
                "}}"
              : text)
          );
        })
        .join("") +
      (b.inlineImages || [])
        .filter((i) => i.offset === String(b.text || "").length)
        .map((i) => T.imageRTF(i.image))
        .join("")
    );
  }
  function colors(blocks) {
    return [
      ...new Set(
        blocks
          .flatMap((b) => [
            b.style,
            ...(b.marks || []).map((m) => m.style),
            ...Object.values(b.tableOptions?.cellMarks || {})
              .flat()
              .map((m) => m.style),
            ...Object.values(b.tableOptions?.cellStyles || {}),
          ])
          .filter(Boolean)
          .flatMap((s) => [s.color, s.background])
          .filter((v) => /^#[0-9a-f]{6}$/i.test(v || ""))
          .map((v) => v.slice(1).toUpperCase()),
      ),
    ];
  }
  function extraFonts(bs) {
    return [
      ...new Set(
        bs
          .flatMap((b) => [
            b.style,
            ...(b.marks || []).map((m) => m.style),
            ...Object.values(b.tableOptions?.cellMarks || {})
              .flat()
              .map((m) => m.style),
          ])
          .filter(Boolean)
          .map((s) => s.fontFamily)
          .filter((f) => f && !fontNames.includes(f)),
      ),
    ];
  }
  function convert(blocks, opts = {}, measure) {
    const mode = opts.mode || "report",
      copy = normalize(JSON.parse(JSON.stringify(blocks)), mode),
      prefixes = labels(copy, mode, opts.steps),
      pt = Math.max(8, Math.min(18, Number(opts.fontSize) || 10)),
      gap = Math.max(0, Math.min(24, +opts.paragraphGap || 0)),
      line = Math.max(1, Math.min(2, +opts.lineHeight || 1.5));
    const extraPalette = colors(copy),
      fontPalette = [
        ...new Set([
          ...extraFonts(copy),
          ...[
            opts.fontFamily,
            ...copy
              .filter((b) => b.kind === "table")
              .map((b) => b.tableOptions?.fontFamily),
          ].filter((f) => f && !fontNames.includes(f)),
        ]),
      ],
      allFonts = [...fontNames, ...fontPalette],
      tables = copy
        .filter((b) => b.kind === "table")
        .map((b) =>
          T.convert(
            b.rows,
            {
              ...opts,
              ...b.tableOptions,
              extraColors: extraPalette,
              extraFonts: fontPalette,
              headerRows: b.headerRows || [],
            },
            measure,
          ),
        );
    let header = tables.length
      ? tables[0].rtf.slice(0, tables[0].rtf.indexOf("\\trowd"))
      : "{\\rtf1\\ansi\\ansicpg949\\deff0\\uc1" +
        T.makeFontTable(fontPalette) +
        "";
    const extraColors = extraPalette,
      colorDefs = extraColors
        .map(
          (v) =>
            "\\red" +
            parseInt(v.slice(0, 2), 16) +
            "\\green" +
            parseInt(v.slice(2, 4), 16) +
            "\\blue" +
            parseInt(v.slice(4, 6), 16) +
            ";",
        )
        .join("");
    if (extraColors.length && !tables.length)
      header += "{\\colortbl;" + colorDefs + "}";
    const colorIndex = (v) =>
      extraColors.indexOf(String(v).replace("#", "").toUpperCase()) +
      1 +
      (tables.length ? 6 : 0);
    let rtf = header + "\\paperw11906\\margl1440\\margr1440 ",
      html = [],
      plain = [],
      ti = 0;
    copy.forEach((b, i) => {
      if (b.kind === "image") {
        html.push(
          '<p style="margin:0;line-height:0;text-align:' +
            (b.image.align || "center") +
            ';">' +
            T.imageHTML(b.image, opts.width || 620) +
            "</p>",
        );
        rtf +=
          "\\pard" +
          (b.image.align === "left"
            ? "\\ql "
            : b.image.align === "right"
              ? "\\qr "
              : "\\qc ") +
          T.imageRTF(b.image, opts.width || 620) +
          "\\par ";
        plain.push("[이미지]");
        return;
      }
      if (b.kind === "table") {
        const t = tables[ti++];
        html.push(
          '<div data-table-block="1" style="display:block;clear:both;width:100%;margin:0 0 ' +
            (b.tableOptions?.spaceAfter ?? 0) +
            'pt 0;">' +
            t.html +
            "</div>",
        );
        rtf +=
          t.rtf.slice(t.rtf.indexOf("\\trowd")).replace(/\\pard\s*\}$/, "") +
          "\\pard ";
        plain.push(t.text);
        return;
      }
      const blockPt = b.style?.fontSize || pt,
        blockLine = b.style?.lineHeight || line,
        blockGap = b.style?.paragraphGap ?? gap,
        blockFont = b.style?.fontFamily || opts.fontFamily || "휴먼명조";
      const pre = prefixes[i],
        spaces = b.literal || b.level === null ? 0 : b.level * 2,
        bold = b.style?.bold ?? b.kind === "heading";
      const visible = " ".repeat(spaces) + (pre ? pre + " " : "") + b.text;
      html.push(
        '<p align="' +
          (b.style?.align || "left") +
          '" style="' +
          (b.pageBreakBefore
            ? "break-before:page;page-break-before:always;"
            : "") +
          (b.style?.keepWithNext
            ? "break-after:avoid;page-break-after:avoid;"
            : "") +
          "clear:both;display:block;text-align:" +
          (b.style?.align || "left") +
          ";margin:" +
          (b.style?.spaceBefore || 0) +
          "pt " +
          (b.style?.indentRightPt || 0) +
          "pt " +
          blockGap +
          "pt " +
          (b.style?.indentLeftPt || 0) +
          "pt;text-indent:" +
          (b.style?.firstLinePt || 0) +
          "pt;white-space:pre-wrap;line-height:" +
          (b.style?.lineHeightPt ? b.style.lineHeightPt + "pt" : blockLine) +
          ";font-family:" +
          blockFont +
          ",serif;font-size:" +
          blockPt +
          "pt;color:" +
          (b.style?.color || "#000") +
          ";font-style:" +
          (b.style?.italic ? "italic" : "normal") +
          ";text-decoration:" +
          [
            b.style?.underline ? "underline" : "",
            b.style?.strike ? "line-through" : "",
          ]
            .filter(Boolean)
            .join(" ") +
          ";background-color:" +
          (b.style?.background || "transparent") +
          ";font-weight:" +
          (bold ? "bold" : "normal") +
          ';"><font face="' +
          blockFont +
          '">' +
          (bold ? "<b>" : "") +
          esc(" ".repeat(spaces) + (pre ? pre + " " : "")).replace(
            /\n/g,
            "<br>",
          ) +
          (inlineHTML(b) || "<br>") +
          (bold ? "</b>" : "") +
          "</font></p>",
      );
      rtf +=
        (b.pageBreakBefore ? "\\page " : "") +
        "\\pard\\f" +
        Math.max(0, allFonts.indexOf(blockFont)) +
        "\\fs" +
        Math.round(blockPt * 2) +
        "\\cf" +
        (b.style?.color ? colorIndex(b.style.color) : tables.length ? 5 : 0) +
        "\\highlight" +
        (b.style?.background ? colorIndex(b.style.background) : 0) +
        "\\b" +
        (bold ? 1 : 0) +
        (b.style?.align === "right"
          ? "\\qr"
          : b.style?.align === "center"
            ? "\\qc"
            : b.style?.align === "justify"
              ? "\\qj"
              : "\\ql") +
        "\\i" +
        (b.style?.italic ? 1 : 0) +
        "\\ul" +
        (b.style?.underline ? 1 : 0) +
        "\\strike" +
        (b.style?.strike ? 1 : 0) +
        "\\li" +
        Math.round((b.style?.indentLeftPt || 0) * 20) +
        "\\ri" +
        Math.round((b.style?.indentRightPt || 0) * 20) +
        "\\fi" +
        Math.round((b.style?.firstLinePt || 0) * 20) +
        "\\sb" +
        Math.round(
          (copy[i - 1]?.kind === "table"
            ? Math.max(blockGap, b.style?.spaceBefore || 0)
            : b.style?.spaceBefore || 0) * 20,
        ) +
        "\\sa" +
        Math.round(blockGap * 20) +
        "\\sl" +
        (b.style?.lineHeightPt
          ? -Math.round(b.style.lineHeightPt * 20)
          : Math.round(blockLine * 240)) +
        "\\slmult" +
        (b.style?.lineHeightPt ? 0 : 1) +
        " " +
        "\\u32?".repeat(spaces) +
        T.rtfEscape(pre ? pre + " " : "") +
        inlineRTF(b, colorIndex, allFonts) +
        "\\par ";
      plain.push(visible);
    });
    return {
      html:
        '<div data-document="1" style="max-width:100%;font-family:휴먼명조,HYHumanMyeongJo,serif;color:#000;background:#fff;">' +
        html.join("") +
        "</div>",
      rtf: rtf + "}",
      text: plain.join("\r\n\r\n"),
      blocks: copy.length,
      tables: tables.length,
      rows: tables.reduce((n, t) => n + t.rows, 0),
      columns: tables.length ? Math.max(...tables.map((t) => t.columns)) : 0,
    };
  }
  root.DocumentCodec = {
    parse,
    markdown,
    normalize,
    labels,
    convert,
    clean,
    ckeditorHTML,
    inlineHTML,
    inlineRTF,
    validURL,
    autoLinks,
  };
})(typeof window !== "undefined" ? window : globalThis);
