(function (root) {
  "use strict";
  const esc = (s) =>
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
  const fontTable =
    "{\\fonttbl" +
    ["휴먼명조", "Pretendard", "맑은 고딕", "바탕", "굴림"]
      .map(
        (name, i) =>
          "{\\f" + i + "\\fnil\\fcharset129 " + rtfEscape(name) + ";}",
      )
      .join("") +
    "}";
  const defaultFonts = ["휴먼명조", "Pretendard", "맑은 고딕", "바탕", "굴림"];
  function makeFontTable(extra = []) {
    return (
      "{\\fonttbl" +
      [...defaultFonts, ...extra.filter((f) => !defaultFonts.includes(f))]
        .map(
          (name, i) =>
            "{\\f" + i + "\\fnil\\fcharset129 " + rtfEscape(name) + ";}",
        )
        .join("") +
      "}"
    );
  }
  const defaults = {
    width: 620,
    fontSize: 10,
    fontFamily: "휴먼명조",
    minFont: 8,
    headerBg: "DFEAF5",
    headerFg: "000000",
    border: "333333",
    spacing: -0.6,
    header: true,
    banded: false,
    bandColor: "F3F6FA",
    padY: 2,
  };
  function splitPipe(line) {
    let out = [],
      cell = "",
      code = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "\\" && line[i + 1] === "|") {
        cell += "|";
        i++;
        continue;
      }
      if (c === "`") {
        code = !code;
        continue;
      }
      if (c === "|" && !code) {
        out.push(cell.trim());
        cell = "";
      } else cell += c;
    }
    out.push(cell.trim());
    if (line.trim().startsWith("|")) out.shift();
    if (line.trim().endsWith("|") && !line.trim().endsWith("\\|")) out.pop();
    return out;
  }
  function cleanText(s) {
    return String(s)
      .replace(/\*\*([^]*?)\*\*/g, "$1")
      .replace(/__([^]*?)__/g, "$1")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  }
  function nodeText(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return "";
    if (/^(SCRIPT|STYLE|IMG|IFRAME|OBJECT|SVG)$/.test(n.tagName)) return "";
    if (n.tagName === "BR") return "\n";
    return (
      [...n.childNodes].map(nodeText).join("") +
      (/^(P|DIV)$/.test(n.tagName) ? "\n" : "")
    );
  }
  function normalize(rows) {
    if (!rows.length || !rows[0].length)
      throw Error("표의 행과 열을 찾지 못했습니다.");
    const cols = Math.max(...rows.map((r) => r.length));
    if (cols > 40 || rows.length > 1000 || cols * rows.length > 20000)
      throw Error("한 번에 1,000행·40열·20,000칸 이내의 표를 넣어 주세요.");
    return rows.map((r) =>
      Array.from({ length: cols }, (_, i) => String(r[i] ?? "")),
    );
  }
  function parse(html, text) {
    if (String(html || "").length + String(text || "").length > 4e6)
      throw Error("표 데이터가 너무 큽니다.");
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html"),
        tables = [...doc.querySelectorAll("table")].filter(
          (t) => !t.parentElement.closest("table"),
        );
      if (tables.length) {
        if (tables.length > 1)
          throw Error(
            "여러 표가 선택되었습니다. 변환할 표 하나만 복사해 주세요.",
          );
        const table = tables[0],
          rows = [];
        [...table.rows].forEach((tr, ri) => {
          rows[ri] ??= [];
          let ci = 0;
          [...tr.cells].forEach((cell) => {
            while (rows[ri][ci] !== undefined) ci++;
            const rs = Math.min(1000, Math.max(1, Number(cell.rowSpan) || 1)),
              cs = Math.min(40, Math.max(1, Number(cell.colSpan) || 1));
            for (let y = 0; y < rs; y++) {
              rows[ri + y] ??= [];
              for (let x = 0; x < cs; x++)
                rows[ri + y][ci + x] =
                  y === 0 && x === 0 ? nodeText(cell).trim() : "";
            }
            ci += cs;
          });
        });
        return normalize(rows);
      }
    }
    let lines = String(text || "")
      .replace(/\r/g, "")
      .replace(/^\s*```[^\n]*\n|\n\s*```\s*$/g, "")
      .split("\n");
    let rows = [];
    const pipe = lines.filter((l) => l.includes("|"));
    if (pipe.length >= 2) {
      rows = pipe
        .map(splitPipe)
        .filter(
          (r) =>
            r.length > 1 &&
            !r.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, ""))),
        )
        .map((r) => r.map(cleanText));
    } else {
      lines = lines.filter((l) => l.trim());
      if (lines.some((l) => l.includes("\t")))
        rows = lines.map((l) => l.split("\t"));
      else
        throw Error(
          "표를 복사하거나 Markdown 표( | 구분) 또는 탭으로 나눈 내용을 붙여넣어 주세요.",
        );
    }
    return normalize(rows);
  }
  function cellParagraphHTML(c, r, col, text, st) {
    const key = r + ":" + col,
      records = c.cellParagraphs?.[key] || [],
      D = root.DocumentCodec;
    if (!D) return esc(text).replace(/\n/g, "<br>");
    if (!text.includes("\u2029") && !records.length)
      return D.inlineHTML({
        text,
        style: st,
        links: c.cellLinks?.[key],
        marks: c.cellMarks?.[key],
      });
    let at = 0;
    return text
      .split("\u2029")
      .map((line, index, lines) => {
        const start = at,
          end = at + line.length,
          style = { ...st };
        for (const p of records)
          if (p.start <= start && p.end >= end) Object.assign(style, p.style);
        const crop = (rs) =>
          (rs || [])
            .filter((m) => m.end > start && m.start < end)
            .map((m) => ({
              ...m,
              start: Math.max(start, m.start) - start,
              end: Math.min(end, m.end) - start,
            }));
        const css =
          "display:block;min-height:1lh;text-align:" +
          (style.align || st.align || "left") +
          ";line-height:" +
          (style.lineHeightPt
            ? style.lineHeightPt + "pt"
            : style.lineHeight || c.lineHeight || 1.5) +
          ";margin-top:" +
          (style.spaceBefore || 0) +
          "pt;margin-bottom:" +
          (style.paragraphGap || 0) +
          "pt;";
        const value =
          '<span data-cell-paragraph="1" style="' +
          css +
          '">' +
          (D.inlineHTML({
            text: line,
            marks: crop(c.cellMarks?.[key]),
            links: crop(c.cellLinks?.[key]),
          }) || "") +
          "</span>" +
          (index < lines.length - 1
            ? '<br data-paragraph-break="1" style="display:none">'
            : "");
        at = end + 1;
        return value;
      })
      .join("");
  }
  function options(o) {
    const c = { ...defaults, ...o };
    for (const k of ["headerBg", "headerFg", "border", "bandColor"]) {
      c[k] = String(c[k]).replace("#", "").toUpperCase();
      if (!/^[0-9A-F]{6}$/.test(c[k]))
        throw Error("색상은 6자리 HEX로 입력해 주세요.");
    }
    c.padY = Math.max(0, Math.min(12, Number(c.padY) || 0));
    c.width = Math.max(240, Math.min(1200, Number(c.width) || 620));
    c.fontSize = Math.max(
      c.fitPage ? 0.5 : 8,
      Math.min(18, Number(c.fontSize) || 10),
    );
    c.minFont = Math.min(
      c.fontSize,
      Math.max(c.fitPage ? 0.5 : 7, Number(c.minFont) || 8),
    );
    c.spacing = Math.max(-1, Math.min(0, Number(c.spacing) || 0));
    return c;
  }
  function layout(rows, opt, measure) {
    const c = options(opt);
    measure =
      measure ||
      ((s, pt) =>
        ([...s].reduce(
          (n, ch) => n + (/[\u0000-\u00ff]/.test(ch) ? 0.53 : 1),
          0,
        ) *
          pt *
          4) /
        3);
    const n = rows[0].length,
      pad = 8;
    const desired = Array.from({ length: n }, (_, i) =>
      Math.max(22, ...rows.map((r) => measure(r[i], c.fontSize) + pad)),
    );
    const min = Array.from({ length: n }, () => Math.min(34, c.width / n));
    const spare = Math.max(0, c.width - min.reduce((a, b) => a + b, 0));
    const weights = desired.map((v, i) => Math.max(1, v - min[i]));
    const total = weights.reduce((a, b) => a + b, 0);
    let widths = weights.map((v, i) =>
      Math.floor(min[i] + (spare * v) / total),
    );
    if (
      Array.isArray(c.widths) &&
      c.widths.length === n &&
      c.widths.every((w) => Number.isFinite(w) && w > 0)
    ) {
      const sum = c.widths.reduce((a, b) => a + b, 0);
      widths = c.widths.map((w) =>
        Math.max(1, Math.floor((w * c.width) / sum)),
      );
    }
    widths[n - 1] += c.width - widths.reduce((a, b) => a + b, 0);
    const cells = rows.map((row, ri) =>
      row.map((text, i) => {
        const available = Math.max(8, widths[i] - pad);
        let pt = c.cellStyles?.[ri + ":" + i]?.fontSize || c.fontSize,
          spacing = 0;
        for (; pt >= c.minFont; pt -= 0.25) {
          const need = measure(
            text,
            pt,
            c.cellStyles?.[ri + ":" + i]?.fontFamily || c.fontFamily,
          );
          spacing = Math.max(
            c.spacing,
            Math.min(0, (available - need) / Math.max(1, [...text].length - 1)),
          );
          if (
            need + spacing * Math.max(0, [...text].length - 1) <=
            available + 0.2
          )
            break;
        }
        pt = Math.max(c.minFont, pt);
        return {
          text,
          pt,
          spacing,
          nowrap:
            !text.includes("\n") &&
            measure(
              text,
              pt,
              c.cellStyles?.[ri + ":" + i]?.fontFamily || c.fontFamily,
            ) +
              spacing * Math.max(0, [...text].length - 1) <=
              available + 0.2,
        };
      }),
    );
    return { rows, c, widths, cells };
  }
  function numeric(text) {
    return /^[\s(+−-]*[₩$€¥]?\s*[\d,.]+\s*(?:원|만원|천원|억원|%|퍼센트|₩|달러)\s*\)?$/.test(
      String(text),
    );
  }
  function alignment(c, ri, text, ci, rows) {
    if (
      ["left", "center", "right"].includes(c.cellStyles?.[ri + ":" + ci]?.align)
    )
      return c.cellStyles[ri + ":" + ci].align;
    const monetary =
      /단가|금액|예산|비용|가격|비율|승률|%/.test(rows?.[0]?.[ci] || "") &&
      /^[\s(+−-]*[\d,.]+\s*\)?$/.test(text);
    return !(c.header && ri === 0) && (numeric(text) || monetary)
      ? "right"
      : "center";
  }
  function isHead(c, r) {
    return (c.header && r === 0) || (c.headerRows || []).includes(r);
  }
  function edge(c, r, i, side, count, cols) {
    const own = c.cellStyles?.[r + ":" + i]?.[side];
    if (own) return own;
    if (side === "left") return i === 0 ? "none" : "solid";
    if (side === "right") return i === cols - 1 ? "none" : "solid";
    if (side === "top")
      return r === 0 || isHead(c, r) || isHead(c, r - 1) ? "solid" : "dotted";
    return r === count - 1 || isHead(c, r) || isHead(c, r + 1)
      ? "solid"
      : "dotted";
  }
  const cssEdge = (s, c, width) =>
    s === "thick"
      ? "2px solid #" + c.border
      : s === "none"
        ? "0 none transparent"
        : (width ? width + "px" : s === "double" ? "3px" : "1px") +
          " " +
          s +
          " #" +
          c.border;
  function imageHTML(img, max = 1200) {
    const w = Math.max(8, Math.min(max, +img.width || 300)),
      h = Math.max(8, ((+img.height || 200) * w) / (+img.width || 300));
    if (!/^data:image\/(png|jpeg);base64,[a-z\d+/=]+$/i.test(img.src || ""))
      return "";
    return (
      '<img src="' +
      img.src +
      '" width="' +
      Math.round(w) +
      '" height="' +
      Math.round(h) +
      '" style="width:' +
      w +
      "px;height:" +
      h +
      'px;max-width:100%;vertical-align:middle;" alt="이미지">'
    );
  }
  function imageRTF(img, max = 1200) {
    const match = /^data:image\/(png|jpeg);base64,([a-z\d+/=]+)$/i.exec(
      img.src || "",
    );
    if (!match) return "";
    const w = Math.max(8, Math.min(max, +img.width || 300)),
      h = Math.max(8, ((+img.height || 200) * w) / (+img.width || 300)),
      hex = Array.from(atob(match[2]), (c) =>
        c.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join("");
    return (
      "{\\pict" +
      (match[1] === "png" ? "\\pngblip" : "\\jpegblip") +
      "\\picwgoal" +
      Math.round(w * 15) +
      "\\pichgoal" +
      Math.round(h * 15) +
      " " +
      hex +
      "}"
    );
  }
  function htmlTable(model) {
    const { c, widths, cells } = model;
    return (
      '<table border="0" frame="hsides" rules="none" cellpadding="3" cellspacing="0" width="' +
      c.width +
      '" data-table-align="' +
      (c.tableAlign || "left") +
      '" style="float:none;clear:both;display:table;margin-left:' +
      (c.tableAlign === "right" || c.tableAlign === "center" ? "auto" : "0") +
      ";margin-right:" +
      (c.tableAlign === "center" ? "auto" : "0") +
      ";border-left:0 none transparent;border-right:0 none transparent;border-collapse:collapse;table-layout:fixed;width:" +
      c.width +
      "px;max-width:100%;font-family:" +
      esc(c.fontFamily || "휴먼명조") +
      ",serif;font-size:" +
      c.fontSize +
      'pt;color:#000;background:#fff;"><colgroup>' +
      widths
        .map((w) => '<col width="' + w + '" style="width:' + w + 'px">')
        .join("") +
      "</colgroup><tbody>" +
      cells
        .map(
          (row, r) =>
            '<tr style="height:' +
            (c.rowHeights?.[r] || 0) +
            'px">' +
            row
              .map((cell, i) => {
                const merge = (c.merges || []).find(
                  (m) => m.row === r && m.col === i,
                );
                if (
                  (c.merges || []).some(
                    (m) =>
                      r >= m.row &&
                      r < m.row + m.rowSpan &&
                      i >= m.col &&
                      i < m.col + m.colSpan &&
                      (r !== m.row || i !== m.col),
                  )
                )
                  return "";
                const st = c.cellStyles?.[r + ":" + i] || {},
                  head = isHead(c, r),
                  strong = st.bold ?? head,
                  bg = (
                    st.background ||
                    (head
                      ? c.headerBg
                      : c.banded && (r - (c.header ? 1 : 0)) % 2 === 0
                        ? c.bandColor
                        : "FFFFFF")
                  ).replace(/^#/, ""),
                  align = alignment(c, r, cell.text, i, model.rows),
                  v = c.cellStyles?.[r + ":" + i]?.valign || "middle";
                const borders = ["top", "bottom", "left", "right"]
                  .map(
                    (side) =>
                      "border-" +
                      side +
                      ":" +
                      cssEdge(
                        edge(c, r, i, side, cells.length, row.length),
                        {
                          ...c,
                          border: String(
                            st[side + "Color"] || c.border,
                          ).replace("#", ""),
                        },
                        st[side + "Width"],
                      ) +
                      ";",
                  )
                  .join("");
                return (
                  "<td" +
                  (cell.nowrap ? ' nowrap="nowrap"' : "") +
                  ' data-cell-row="' +
                  r +
                  '" data-cell-col="' +
                  i +
                  '"' +
                  (merge
                    ? ' rowspan="' +
                      merge.rowSpan +
                      '" colspan="' +
                      merge.colSpan +
                      '"'
                    : "") +
                  ' align="' +
                  align +
                  '" valign="' +
                  v +
                  '" width="' +
                  widths[i] +
                  '" bgcolor="#' +
                  bg +
                  '" style="' +
                  borders +
                  "width:" +
                  widths[i] +
                  "px;padding:" +
                  (st.padY ?? c.padY) +
                  "px " +
                  (st.padX ?? 3) +
                  "px;text-align:" +
                  align +
                  ";vertical-align:" +
                  v +
                  ";" +
                  (cell.nowrap
                    ? "white-space:nowrap;"
                    : "overflow-wrap:anywhere;") +
                  "font-family:" +
                  esc(c.fontFamily || "휴먼명조") +
                  ",serif;font-size:" +
                  cell.pt +
                  "pt;font-style:" +
                  (st.italic ? "italic" : "normal") +
                  ";text-decoration:" +
                  [
                    st.underline ? "underline" : "",
                    st.strike ? "line-through" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") +
                  ";font-weight:" +
                  (strong ? "bold" : "normal") +
                  ";background:#" +
                  bg +
                  ";color:#" +
                  (st.color
                    ? st.color.replace(/^#/, "")
                    : head
                      ? c.headerFg
                      : "000000") +
                  ';"><p align="' +
                  align +
                  '" style="margin:0;padding:0;text-align:' +
                  align +
                  ";white-space:pre-wrap;line-height:" +
                  (st.lineHeightPt
                    ? st.lineHeightPt + "pt"
                    : st.lineHeight || c.lineHeight || 1.5) +
                  ';"><font face="' +
                  esc(st.fontFamily || c.fontFamily || "휴먼명조") +
                  '" style="font-size:' +
                  cell.pt +
                  "pt;letter-spacing:" +
                  cell.spacing.toFixed(2) +
                  'px;">' +
                  (strong ? "<b>" : "") +
                  (root.DocumentCodec
                    ? cellParagraphHTML(c, r, i, cell.text, { align, ...st })
                    : esc(cell.text).replace(/\n/g, "<br>")) +
                  (strong ? "</b>" : "") +
                  "</font>" +
                  (c.cellImages?.[r + ":" + i] || [])
                    .map(
                      (img) =>
                        '<span style="display:block;text-align:' +
                        (img.align || align) +
                        ';">' +
                        imageHTML(img, Math.max(8, widths[i] - 8)) +
                        "</span>",
                    )
                    .join("") +
                  "</p></td>"
                );
              })
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table>"
    );
  }
  function rtfEscape(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const v = s.charCodeAt(i),
        ch = s[i];
      out +=
        ch === "\\" || ch === "{" || ch === "}"
          ? "\\" + ch
          : ch === "\n"
            ? "\\line "
            : v > 127
              ? "\\u" + (v > 32767 ? v - 65536 : v) + "?"
              : ch;
    }
    return out;
  }
  function cellParagraphRTF(c, r, col, text, st, colors) {
    const key = r + ":" + col,
      D = root.DocumentCodec,
      records = c.cellParagraphs?.[key] || [];
    const render = (b) =>
      D.inlineRTF(
        b,
        (v) => colors.indexOf(v.replace("#", "").toUpperCase()) + 1,
        [...defaultFonts, ...(c.extraFonts || [])],
      );
    if (!text.includes("\u2029") && !records.length)
      return render({
        text,
        style: st,
        links: c.cellLinks?.[key],
        marks: c.cellMarks?.[key],
      });
    let at = 0;
    return text
      .split("\u2029")
      .map((line, i) => {
        const start = at,
          end = at + line.length,
          style = { ...st };
        for (const p of records)
          if (p.start <= start && p.end >= end) Object.assign(style, p.style);
        const crop = (rs) =>
          (rs || [])
            .filter((m) => m.end > start && m.start < end)
            .map((m) => ({
              ...m,
              start: Math.max(start, m.start) - start,
              end: Math.min(end, m.end) - start,
            }));
        at = end + 1;
        return (
          (i ? "\par\pard\intbl " : "") +
          ({ left: "\ql", center: "\qc", right: "\qr", justify: "\qj" }[
            style.align
          ] || "\ql") +
          "\sb" +
          Math.round((style.spaceBefore || 0) * 20) +
          "\sa" +
          Math.round((style.paragraphGap || 0) * 20) +
          "\sl" +
          Math.round((style.lineHeight || c.lineHeight || 1.5) * 240) +
          "\slmult1 " +
          render({
            text: line,
            marks: crop(c.cellMarks?.[key]),
            links: crop(c.cellLinks?.[key]),
          })
        );
      })
      .join("");
  }
  function rtfTable(model) {
    const { c, widths, cells } = model,
      colors = [
        c.border,
        c.headerBg,
        c.headerFg,
        "FFFFFF",
        "000000",
        c.bandColor,
        ...Object.values(c.cellStyles || {}).flatMap((st) =>
          ["top", "bottom", "left", "right"]
            .map((side) => st[side + "Color"])
            .filter((v) => /^#[a-f\d]{6}$/i.test(v || ""))
            .map((v) => v.slice(1).toUpperCase()),
        ),
        ...(c.extraColors || [
          ...new Set(
            Object.values(c.cellMarks || {})
              .flat()
              .flatMap((m) => [m.style?.color, m.style?.background])
              .filter((v) => /^#[a-f\d]{6}$/i.test(v || ""))
              .map((v) => v.slice(1).toUpperCase()),
          ),
        ]),
      ];
    const ct = colors
      .map(
        (s) =>
          "\\red" +
          parseInt(s.slice(0, 2), 16) +
          "\\green" +
          parseInt(s.slice(2, 4), 16) +
          "\\blue" +
          parseInt(s.slice(4, 6), 16) +
          ";",
      )
      .join("");
    const scale = Math.min(c.width * 15, 9000) / c.width;
    let out =
      "{\\rtf1\\ansi\\ansicpg949\\deff0\\uc1" +
      makeFontTable(c.extraFonts || []) +
      "{\\colortbl;" +
      ct +
      "}\\viewkind4\\f0\\fs" +
      Math.round(c.fontSize * 2) +
      " ";
    cells.forEach((row, ri) => {
      const head = (c.header && ri === 0) || (c.headerRows || []).includes(ri),
        band = !head && c.banded && (ri - (c.header ? 1 : 0)) % 2 === 0;
      out +=
        "\\trowd\\trgaph45\\trleft0" +
        (c.tableAlign === "right"
          ? "\\trqr"
          : c.tableAlign === "center"
            ? "\\trqc"
            : "\\trql") +
        "\\trrh" +
        Math.round(
          Math.max(
            (c.fontSize * 1.25 + c.padY * 1.5) * 20,
            (c.rowHeights?.[ri] || 0) * 15,
          ),
        ) +
        "\\trbrdrl\\brdrnil\\trbrdrr\\brdrnil\\trbrdrh\\brdrdot\\brdrw5\\brdrcf1\\trbrdrv\\brdrs\\brdrw10\\brdrcf1 ";
      let x = 0;
      row.forEach((cell, i) => {
        x += widths[i] * scale;
        const st = c.cellStyles?.[ri + ":" + i] || {},
          merge = (c.merges || []).find(
            (m) =>
              ri >= m.row &&
              ri < m.row + m.rowSpan &&
              i >= m.col &&
              i < m.col + m.colSpan,
          ),
          mergeFlags = merge
            ? (merge.colSpan > 1
                ? i === merge.col
                  ? "\\clmgf"
                  : "\\clmrg"
                : "") +
              (merge.rowSpan > 1
                ? ri === merge.row
                  ? "\\clvmgf"
                  : "\\clvmrg"
                : "")
            : "",
          br = (s, side) =>
            s === "none"
              ? "\\brdrnil"
              : (s === "thick"
                  ? "\\brdrs\\brdrw30"
                  : s === "dotted"
                    ? "\\brdrdot\\brdrw5"
                    : s === "double"
                      ? "\\brdrdb\\brdrw10"
                      : "\\brdrs\\brdrw10") +
                "\\brdrcf" +
                (st[side + "Color"]
                  ? Math.max(
                      1,
                      colors.indexOf(
                        st[side + "Color"].replace("#", "").toUpperCase(),
                      ) + 1,
                    )
                  : 1) +
                (s !== "thick" && st[side + "Width"]
                  ? "\\brdrw" + Math.round(st[side + "Width"] * 15)
                  : "");
        out +=
          mergeFlags +
          (st.valign === "top"
            ? "\\clvertalt"
            : st.valign === "bottom"
              ? "\\clvertalb"
              : "\\clvertalc") +
          "\\clcbpat" +
          (st.background
            ? Math.max(
                1,
                colors.indexOf(st.background.replace("#", "").toUpperCase()) +
                  1,
              )
            : head
              ? 2
              : band
                ? 6
                : 4) +
          ["left", "right", "bottom", "top"]
            .map(
              (side) =>
                "\\clbrdr" +
                { left: "l", right: "r", bottom: "b", top: "t" }[side] +
                br(edge(c, ri, i, side, cells.length, row.length), side),
            )
            .join("") +
          "\\cellx" +
          Math.round(x) +
          " ";
      });
      row.forEach((cell, ci) => {
        const st = c.cellStyles?.[ri + ":" + ci] || {};
        out +=
          "\\pard\\intbl" +
          (alignment(c, ri, cell.text, ci, model.rows) === "right"
            ? "\\qr"
            : "\\qc") +
          "\\f" +
          Math.max(
            0,
            [...defaultFonts, ...(c.extraFonts || [])].indexOf(
              st.fontFamily || c.fontFamily || "휴먼명조",
            ),
          ) +
          "\\fs" +
          Math.round(cell.pt * 2) +
          "\\cf" +
          (head ? 3 : 5) +
          "\\b" +
          ((st.bold ?? head) ? 1 : 0) +
          "\\i" +
          (st.italic ? 1 : 0) +
          "\\ul" +
          (st.underline ? 1 : 0) +
          "\\strike" +
          (st.strike ? 1 : 0) +
          "\\expndtw" +
          Math.round(cell.spacing * 15) +
          " " +
          (root.DocumentCodec
            ? cellParagraphRTF(
                c,
                ri,
                ci,
                cell.text,
                { align: alignment(c, ri, cell.text, ci, model.rows), ...st },
                colors,
              )
            : rtfEscape(cell.text)) +
          (c.cellImages?.[ri + ":" + ci] || [])
            .map(
              (img) =>
                (img.align === "left"
                  ? "\\ql "
                  : img.align === "right"
                    ? "\\qr "
                    : "\\qc ") + imageRTF(img, Math.max(8, widths[ci] - 8)),
            )
            .join("") +
          "\\cell ";
      });
      out += "\\row ";
    });
    return out + "\\pard }";
  }
  function convert(rows, opts, measure) {
    rows = normalize(rows);
    const m = layout(rows, opts, measure);
    return {
      html: htmlTable(m),
      rtf: rtfTable(m),
      text: rows.map((r) => r.join("\t")).join("\r\n"),
      rows: rows.length,
      columns: rows[0].length,
      wrapped: m.cells.flat().filter((c) => !c.nowrap).length,
    };
  }
  root.TableCodec = {
    parse,
    normalize,
    layout,
    convert,
    defaults,
    rtfEscape,
    imageHTML,
    imageRTF,
    fontTable,
    defaultFonts,
    makeFontTable,
  };
  if (typeof module !== "undefined") module.exports = root.TableCodec;
})(typeof window !== "undefined" ? window : globalThis);
