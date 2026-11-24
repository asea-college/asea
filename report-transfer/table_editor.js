(()=>{'use strict';let active=false,last=0;const touch=()=>last=performance.now();const inside=e=>e.target instanceof Node&&document.getElementById('editor')?.contains(e.target);window.EditorInput={get composing(){return active},get last(){return last},quiet(ms=900){return !active&&performance.now()-last>=ms}};for(const type of ['keydown','beforeinput','input'])window.addEventListener(type,e=>{if(inside(e))touch()},true);window.addEventListener('compositionstart',e=>{if(inside(e)){active=true;touch()}},true);window.addEventListener('compositionend',e=>{if(inside(e)){active=false;touch()}},true);})();
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    editor = $("editor"),
    D = DocumentCodec,
    T = TableCodec;
  let blocks = [],
    selected = new Set(),
    anchor = null,
    mode = "report",
    busy = false,
    undo = [],
    redo = [],
    editSaved = false,
    lastSettings = null,
    themes = [],
    activeSteps = null,
    rowSelection = new Map(),
    textSelections = [],
    multiTextSelection = false,
    sectionSelection = false,
    recentColors = [],
    colorPairs = [],
    documentOptions = {},
    insertionPoint = null,
    lastEditorIntent = false,
    baseStyle = {
      fontSize: 10,
      fontFamily: "휴먼명조",
      lineHeight: 1.5,
      paragraphGap: 0,
    };
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d"),
    measure = (s, pt, family = baseStyle.fontFamily) => {
      ctx.font = pt + 'pt "' + family + '",serif';
      return Math.max(
        ...String(s)
          .split("\n")
          .map((x) => ctx.measureText(x).width),
      );
    };
  const ids = [
    "width",
    "fontSize",
    "headerBg",
    "headerFg",
    "header",
    "tight",
    "banded",
    "bandColor",
    "padY",
    "lineHeight",
    "paragraphGap",
  ];
  const settings = () =>
    Object.fromEntries(
      ids.map((id) => [
        id,
        $(id).type === "checkbox" ? $(id).checked : $(id).value,
      ]),
    );
  const opts = () => ({
    width: +$("width").value,
    fontSize: baseStyle.fontSize,
    fontFamily: baseStyle.fontFamily,
    headerBg: $("headerBg").value,
    headerFg: $("headerFg").value,
    header: $("header").checked,
    spacing: $("tight").checked ? -0.6 : 0,
    banded: $("banded").checked,
    bandColor: $("bandColor").value,
    padY: +$("padY").value,
    lineHeight: baseStyle.lineHeight,
    paragraphGap: baseStyle.paragraphGap,
    mode,
    steps: activeSteps,
    page: documentOptions.page,
  });
  const textOf = (n) => readEditorText(n).replace(/\r/g, "").trim(),
    clone = (x) => JSON.parse(JSON.stringify(x));
  function status(s, error = false) {
    $("status").textContent = s;
    $("status").style.color = error ? "var(--ui-danger)" : "var(--ui-fg)";
  }
  function pull() {
    for (const b of blocks) {
      const el = [...editor.children].find((e) => e.dataset.id === b.id);
      if (!el) continue;
      if (b.kind === "image") continue;
      if (b.kind === "table") {
        const t = el.querySelector("table");
        if (t) {
          const logical = new Map();
          for (const td of modelCells(el)) {
            const r = cellRow(td),
              c = cellCol(td),
              key = r + ":" + c;
            logical.set(key, [...(logical.get(key) || []), td]);
          }
          const links = {},
            marks = {};
          for (const [key, cells] of logical) {
            const [r, c] = key.split(":").map(Number);
            let text = "";
            for (const cell of cells) {
              const shift = text.length;
              links[key] = [
                ...(links[key] || []),
                ...readLinks(cell).map((m) => ({
                  ...m,
                  start: m.start + shift,
                  end: m.end + shift,
                })),
              ];
              marks[key] = [
                ...(marks[key] || []),
                ...readMarks(cell).map((m) => ({
                  ...m,
                  start: m.start + shift,
                  end: m.end + shift,
                })),
              ];
              text += readEditorText(cell);
            }
            if (b.rows[r]) b.rows[r][c] = text;
          }
          tableOptions(b).cellLinks = links;
          tableOptions(b).cellMarks = marks;
        }
      } else {
        const t = el.querySelector(".doc-text");
        if (t) {
          b.text = b.literal
            ? readEditorText(t).replace(/\r/g, "")
            : D.clean(textOf(t));
          b.links = readLinks(t);
          b.marks = readMarks(t);
        }
      }
    }
  }
  function snapshot() {
    return {
      documentOptions: clone(documentOptions),
      blocks: clone(blocks),
      mode,
      activeSteps: clone(activeSteps),
      selected: [...selected],
      anchor,
      baseStyle: clone(baseStyle),
      recentColors: clone(recentColors),
      colorPairs: clone(colorPairs),
      settings: lastSettings || settings(),
    };
  }
  function save() {
    pull();
    undo.push(snapshot());
    if (undo.length > 50) undo.shift();
    redo = [];
  }
  function restore(s) {
    documentOptions = s.documentOptions || {};
    document.dispatchEvent(
      new CustomEvent("editor-options-restored", { detail: documentOptions }),
    );
    blocks = clone(s.blocks);
    baseStyle = s.baseStyle || {
      fontSize: +s.settings?.fontSize || 10,
      fontFamily: "휴먼명조",
      lineHeight: +s.settings?.lineHeight || 1.5,
      paragraphGap: +(s.settings?.paragraphGap ?? 0),
    };
    recentColors = s.recentColors || recentColors;
    colorPairs = s.colorPairs || colorPairs;
    textSelections = [];
    mode = s.mode;
    activeSteps = s.activeSteps || null;
    selected = new Set(s.selected);
    anchor = s.anchor;
    for (const [id, v] of Object.entries(s.settings))
      if ($(id).type === "checkbox") $(id).checked = v;
      else $(id).value = v;
    render();
  }
  function history(back) {
    const from = back ? undo : redo,
      to = back ? redo : undo;
    if (!from.length) return;
    pull();
    to.push(snapshot());
    restore(from.pop());
  }
  function selection() {
    for (const el of editor.children)
      el.classList.toggle(
        "chosen",
        sectionSelection && selected.has(el.dataset.id),
      );
    $("selection").textContent = selected.size + "개 문단/표 선택";
    $("undo").disabled = !undo.length;
    $("redo").disabled = !redo.length;
  }
  function syncSpaceIndent(b) {
    if(b.kind==="table" || b.kind==="image")return;
    b.style ||= {};
    if(b.spaceIndent){b.style.indentLeftPt=0;b.style.firstLinePt=0;b.spaceIndentWidthPt=0;}
    const prefix=String(b.text||"").match(/^[ \u00a0]*(?:\d+[.)]|[가-하][.)]|[•●▪◦○□■▶▷※-])[ \u00a0]+/)?.[0];
    b.style.hangingIndentPt=documentOptions.autoHang!==false && prefix
      ? Math.max(0,measure(prefix,b.style.fontSize||baseStyle.fontSize,b.style.fontFamily||baseStyle.fontFamily)*.75)
      : 0;
  }
  function render() {
    if($("enterBehavior"))$("enterBehavior").value=documentOptions.enterBehavior || "paragraph";
    if ($("fontFamily")) $("fontFamily").value = baseStyle.fontFamily;
    if($("autoHang"))$("autoHang").checked=documentOptions.autoHang!==false;

    materializeText();
    if (!(baseStyle.lineHeight > 0)) baseStyle.lineHeight = 1;
    for (const b of blocks) {
      if (
        b.style &&
        b.style.lineHeight !== undefined &&
        !(b.style.lineHeight > 0)
      )
        b.style.lineHeight = 1;
      for (const st of Object.values(b.tableOptions?.cellStyles || {}))
        if (st.lineHeight !== undefined && !(st.lineHeight > 0))
          st.lineHeight = 1;
      syncSpaceIndent(b);
    }
    const menu = $("setLevel");
    menu.replaceChildren();
    for (const [i, label] of [
      "위계 직접 지정",
      ...(activeSteps
        ? activeSteps.map((s, i) =>
            s.pattern.replace("{n}", "1").replace("{ko}", "가"),
          )
        : mode === "official"
          ? [
              "1. 제목",
              "가. 내용",
              "1) 세부",
              "가) 세부",
              "• 더 세부",
              "- 예하 내용",
            ]
          : [
              "1. 제목",
              "1) 내용",
              "• 세부",
              "- 세부의 세부",
              "- 상세",
              "- 예하",
            ]),
    ].entries()) {
      const option = document.createElement("option");
      option.value = i === 0 ? "" : String(i - 1);
      option.textContent = i === 0 ? label : i + "단계 · " + label;
      menu.append(option);
    }
    D.normalize(blocks, mode);
    const labels = D.labels(blocks, mode, activeSteps),
      o = opts();
    editor.innerHTML = "";
    editor.style.width = o.width + 60 + "px";
    editor.append(createInsertionSlot(""));
    blocks.forEach((b, i) => {
      const el = document.createElement("div");
      el.className =
        "doc-block " +
        (b.kind === "table"
          ? "table-block"
          : b.kind === "heading"
            ? "heading-block"
            : "");
      el.dataset.id = b.id;
      el.tabIndex = 0;
      el.setAttribute(
        "aria-label",
        b.kind === "table" ? "표 " + (i + 1) : "문단 " + (i + 1),
      );
      if (b.kind === "image") {
        el.classList.add("image-block");
        el.style.textAlign = b.image.align || "center";
        el.innerHTML = T.imageHTML(b.image, o.width);
      } else if (b.kind === "table") {
        const area = document.createElement("div");
        area.className = "table-content";
        area.contentEditable = "true";
        area.spellcheck = false;
        area.innerHTML = T.convert(
          b.rows,
          { ...o, ...b.tableOptions, headerRows: b.headerRows || [] },
          measure,
        ).html;
        el.append(area);
      } else {
        el.style.marginLeft = "0px";
        if (b.style) {
          el.style.fontWeight =
            (b.style.bold ?? b.kind === "heading") ? "bold" : "normal";
          el.style.fontStyle = b.style.italic ? "italic" : "normal";
          el.style.textDecoration = [
            b.style.underline ? "underline" : "",
            b.style.strike ? "line-through" : "",
          ]
            .filter(Boolean)
            .join(" ");
          el.style.textAlign = b.style.align || "left";
          el.style.color = b.style.color || "";
          el.style.backgroundColor = b.style.background || "";
        }
        el.style.fontSize = (b.style?.fontSize || o.fontSize) + "pt";
        el.style.fontFamily = b.style?.fontFamily || baseStyle.fontFamily;
        el.style.lineHeight = b.style?.lineHeightPt
          ? b.style.lineHeightPt + "pt"
          : b.style?.lineHeight || o.lineHeight;
        el.style.setProperty("--hanging-indent",(b.style?.hangingIndentPt || 0)+"pt");
        el.style.paddingLeft = (b.style?.indentLeftPt || 0) + "pt";
        el.style.setProperty(
          "--paragraph-indent",
          (b.style?.indentLeftPt || 0) + "pt",
        );
        el.style.paddingRight = (b.style?.indentRightPt || 0) + "pt";
        el.style.textIndent = (b.style?.firstLinePt || 0) + "pt";
        el.style.marginTop = (b.style?.spaceBefore || 0) + "pt";
        el.style.marginBottom =
          (b.style?.paragraphGap ?? o.paragraphGap) + "pt";
        const label = document.createElement("span");
        label.className = "doc-label";
        label.textContent =
          (b.literal || b.level === null
            ? ""
            : " ".repeat(b.level * 2)) +
          labels[i];
        label.contentEditable = "false";
        const content = document.createElement("span");
        content.className = "doc-text";
        content.contentEditable = "true";
        content.tabIndex = -1;
        content.spellcheck = false;
        content.innerHTML = D.inlineHTML(b);
        if (!b.text) content.setAttribute("data-empty", "1");
        el.append(
          label,
          document.createTextNode(labels[i] ? " " : ""),
          content,
        );
      }
      editor.append(el, createInsertionSlot(b.id));
    });
    enhanceTables();
    lastSettings = settings();
    $("report").setAttribute("aria-pressed", String(mode === "report"));
    $("official").setAttribute("aria-pressed", String(mode === "official"));
    $("copy").disabled = !blocks.length;
    selection();
    const count = blocks.filter((b) => b.kind === "table").length;
    status(
      blocks.length +
        "개 문단/표 · 표 " +
        count +
        "개 · " +
        (mode === "report" ? "보고형" : "공문서형") +
        " · " +
        baseStyle.fontFamily +
        (mode === "report" && blocks.some((b) => b.level > 3)
          ? " · 깊은 단계는 들여쓰기를 보존하고 - 표시"
          : ""),
    );
    paintTextSelections();
    document.dispatchEvent(
      new CustomEvent("editor-recent-colors", { detail: recentColors }),
    );
    document.dispatchEvent(
      new CustomEvent("editor-color-pairs", { detail: colorPairs }),
    );
    document.dispatchEvent(new Event("editor-content-changed"));
  }
  function importDocument(html, text, replace = false) {
    try {
      const parsed = D.parse(html, text, mode);
      if (!html) {
        const style = insertionStyle();
        for (const b of parsed) {
          if (b.kind === "table")
            b.tableOptions = {
              ...b.tableOptions,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
            };
          else b.style = { ...style, ...b.style };
        }
      }
      insertDocumentBlocks(parsed, replace);
      $("source").value = text || "";
    } catch (e) {
      status(e.message, true);
    }
  }
  function insertionStyle(position = insertionPoint) {
    const b = blockById(position?.id),
      style = { ...baseStyle, ...b?.style };
    if (b?.kind === "table") {
      const key = position?.key;
      Object.assign(style, b.tableOptions?.cellStyles?.[key]);
      for (const m of b.tableOptions?.cellMarks?.[key] || [])
        if (
          m.start <= (position.offset || 0) &&
          m.end >= (position.offset || 0)
        )
          Object.assign(style, m.style);
    } else
      for (const m of b?.marks || [])
        if (
          m.start <= (position?.offset || 0) &&
          m.end >= (position?.offset || 0)
        )
          Object.assign(style, m.style);
    return style;
  }
  function rememberInsertion() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0),
      node =
        range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement;
    if (!editor.contains(node)) return;
    const slot = node.closest?.(".insert-slot");
    if (slot) {
      insertionPoint = { after: slot.dataset.after };
      return;
    }
    const content = node.closest?.(".doc-text,td");
    if (!content) return;
    const r = range.cloneRange();
    r.selectNodeContents(content);
    r.setEnd(range.startContainer, range.startOffset);
    const b = content.closest(".doc-block");
    insertionPoint = {
      id: b.dataset.id,
      offset: readEditorText(r.cloneContents()).length,
      key:
        content.tagName === "TD"
          ? cellRow(content) + ":" + cellCol(content)
          : null,
    };
  }
  function insertDocumentBlocks(
    incoming,
    replace = false,
    position = insertionPoint,
  ) {
    save();
    let list = clone(incoming);
    const inherited = replace ? baseStyle : insertionStyle(position),
      idMap = {};
    for (const b of list) {
      if (b.kind === "table") {
        b.tableOptions = {
          fontFamily: inherited.fontFamily,
          fontSize: inherited.fontSize,
          ...b.tableOptions,
        };
      } else if (b.kind !== "image")
        b.style = {
          fontFamily: inherited.fontFamily,
          fontSize: inherited.fontSize,
          ...b.style,
        };
      const old = b.id;
      b.id = "in" + Date.now() + Math.random().toString(36).slice(2);
      idMap[old] = b.id;
    }
    if (replace || !blocks.length) {
      blocks = list;
      insertionPoint = null;
    } else {
      let index = blocks.length;
      const b = blockById(position?.id);
      if (position && "after" in position) {
        index = position.after
          ? blocks.findIndex((b) => b.id === position.after) + 1
          : 0;
      } else if (b) {
        index = blocks.indexOf(b) + 1;
        if (b.kind !== "table" && b.kind !== "image") {
          const at = Math.max(
              0,
              Math.min(b.text.length, position.offset ?? b.text.length),
            ),
            tail = clone(b);
          tail.id = "tail" + Date.now() + Math.random().toString(36).slice(2);
          tail.text = b.text.slice(at);
          for (const k of ["marks", "links"]) {
            tail[k] = (b[k] || [])
              .filter((m) => m.end > at)
              .map((m) => ({
                ...m,
                start: Math.max(0, m.start - at),
                end: m.end - at,
              }));
            b[k] = (b[k] || [])
              .filter((m) => m.start < at)
              .map((m) => ({ ...m, end: Math.min(at, m.end) }));
          }
          b.text = b.text.slice(0, at);
          if (tail.text) list.push(tail);
          if (!b.text && !b.links?.length && !b.marks?.length) {
            blocks.splice(index - 1, 1);
            index--;
          }
        }
      }
      blocks.splice(index, 0, ...list);
    }
    selected.clear();
    textSelections = [];
    sectionSelection = false;
    allDocumentSelected = false;
    cellRect = null;
    anchor = null;
    render();
    const last = list.at(-1);
    if (last) {
      focusDocumentPoint(last.id, (last.text || "").length);
      rememberInsertion();
    }
    document.dispatchEvent(
      new CustomEvent("editor-inserted", {
        detail: { ids: list.map((b) => b.id), idMap },
      }),
    );
  }
  editor.addEventListener("mouseup", rememberInsertion);
  editor.addEventListener("keyup", rememberInsertion);
  editor.addEventListener("input", rememberInsertion);
  editor.addEventListener("focusout", rememberInsertion);
  document.addEventListener("editor-capture-insertion", rememberInsertion);
  document.addEventListener("editor-insert-blocks", (e) =>
    insertDocumentBlocks(
      e.detail.blocks,
      !!e.detail.replace,
      e.detail.position ?? insertionPoint,
    ),
  );
  document.addEventListener("editor-options-update", (e) => {
    save();
    documentOptions = { ...documentOptions, ...e.detail };
    document.dispatchEvent(
      new CustomEvent("editor-options-restored", { detail: documentOptions }),
    );
    render();
  });

  function transform(kind, value) {
    if (!sectionSelection && !allDocumentSelected) {
      status("Ctrl+클릭으로 위계를 바꿀 구간을 선택해 주세요.", true);
      return;
    }
    if (!selected.size) {
      status("Ctrl+클릭으로 편집할 문단을 선택해 주세요.", true);
      return;
    }
    save();
    let n = 0;
    for (const b of blocks) {
      if (!selected.has(b.id) || b.kind === "table" || b.kind === "image")
        continue;
      n++;
      if (kind === "plain") {
        removeHierarchyText(b);
        b.level = null;
        b.kind = "paragraph";
      } else {
        const l =
          kind === "set"
            ? value
            : Math.max(
                0,
                Math.min(5, (b.level ?? 0) + (kind === "down" ? 1 : -1)),
              );
        b.level = l;
        b.kind = l === 0 ? "heading" : "item";
      }
    }
    if (kind !== "plain") applyHierarchyText();
    render();
    if (!n)
      status(
        "표는 위계 단계 변경 대상이 아닙니다. 본문 문단을 선택해 주세요.",
        true,
      );
  }
  editor.addEventListener("click", (e) => {
    if (marginClickHandled) {
      marginClickHandled = false;
      return;
    }
    const el = e.target.closest(".doc-block");
    if (!el) return;
    if (
      e.ctrlKey &&
      el.classList.contains("table-block") &&
      selectedRects().length
    )
      return;
    if (cellRect && (e.ctrlKey || cellDragging)) return;
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && captureDrag()) return;
    const id = el.dataset.id;
    if (e.shiftKey && anchor) {
      e.preventDefault();
      const a = blocks.findIndex((b) => b.id === anchor),
        z = blocks.findIndex((b) => b.id === id);
      selected = new Set(
        blocks.slice(Math.min(a, z), Math.max(a, z) + 1).map((b) => b.id),
      );
    } else if (e.ctrlKey || e.metaKey) {
      if (textSelections.length && !window.getSelection()?.isCollapsed) return;
      e.preventDefault();
      sectionSelection = true;
      textSelections = [];
      paintTextSelections();
      el.focus({ preventScroll: true });
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchor = id;
    } else {
      sectionSelection = false;
      selected.clear();
      anchor = id;
    }
    selection();
  });
  editor.addEventListener("focusin", () => {
    editSaved = false;
    lastEditorIntent = true;
  });
  editor.addEventListener("beforeinput", (e) => {
    // Never snapshot the editor while Windows IME is assembling a Korean
    // syllable. A snapshot calls pull(), which can move the caret away from
    // the IME's provisional composition range.
    if (
      e.defaultPrevented ||
      window.EditorInput?.composing ||
      e.isComposing ||
      e.inputType === "insertCompositionText"
    ) return;
    if (!editSaved) {
      save();
      editSaved = true;
    }
  });
  editor.addEventListener("input", (e) => {
    // Let the active IME own provisional composition text. Pulling it into the
    // document model on each interim update can reset the caret and drop syllables.
    if (e.isComposing || window.EditorInput?.composing) return;
    pull();
    selection();
    $("copy").disabled = !blocks.length;
    paintTextSelections();
    document.dispatchEvent(
      new CustomEvent("editor-recent-colors", { detail: recentColors }),
    );
    document.dispatchEvent(
      new CustomEvent("editor-color-pairs", { detail: colorPairs }),
    );
    document.dispatchEvent(new Event("editor-content-changed"));
  });
  for (const el of [$("source"), editor])
    el.addEventListener("paste", (e) => {
      const html = e.clipboardData.getData("text/html"),
        text = e.clipboardData.getData("text/plain");
      if (
        el === editor &&
        e.target.closest(".doc-text,.table-content") &&
        !/<table\b|<h[1-6]\b/i.test(html) &&
        !/^\s*#{1,6}\s/m.test(text) &&
        !text.includes("\t") &&
        !text.includes("|") &&
        !text.includes("\n\n")
      )
        return;
      e.preventDefault();
      importDocument(html, text);
    });
  $("convert").onclick = () => importDocument("", $("source").value);
  $("clear").onclick = () => {
    save();
    extraRects = [];
    wholeTables.clear();
    rowRects.clear();
    blocks = [];
    selected.clear();
    textSelections = [];
    sectionSelection = false;
    allDocumentSelected = false;
    cellRect = null;
    activeImage = null;
    insertionPoint = null;
    $("source").value = "";
    render();
  };
  if($("autoHang"))$("autoHang").addEventListener("change",()=>{
    save();documentOptions.autoHang=$("autoHang").checked;render();
    status(documentOptions.autoHang?"자동 내어쓰기：둘째 줄부터 기호 뒤 본문에 맞춤":"자동 내어쓰기 해제");
  });
  for (const id of ids)
    $(id).addEventListener("change", () => {
      save();
      if(["lineHeight","paragraphGap","fontSize"].includes(id)) {
        const value=+$(id).value;
        baseStyle[id]=value;
        for(const b of blocks){
          if(b.kind==="image")continue;
          if(b.kind==="table"){b.tableOptions ||= {};if(id!=="paragraphGap")b.tableOptions[id]=value;continue;}
          b.style ||= {};b.style[id]=value;
          if(id==="lineHeight")delete b.style.lineHeightPt;
        }
      }
      render();
    });
  if($("enterBehavior"))$("enterBehavior").addEventListener("change",()=>{
    save();documentOptions.enterBehavior=$("enterBehavior").value;render();
    status(documentOptions.enterBehavior==="tight"?"Enter：새 문단을 바로 다음 줄에 연결":"Enter：문단 간격 적용 · Shift+Enter：같은 문단 줄바꿈");
  });
  for (const id of ["report", "official"])
    $(id).onclick = () => {
      save();
      mode = id;
      activeSteps = null;
      $("hierarchyTheme").value = id;
      if (sectionSelection) applyHierarchyText();
      render();
    };
  $("up").onclick = () => transform("up");
  $("down").onclick = () => transform("down");
  $("plain").onclick = () => transform("plain");
  $("setLevel").onchange = () => {
    if ($("setLevel").value !== "") transform("set", +$("setLevel").value);
    $("setLevel").value = "";
  };
  $("selectAll").onclick = () => {
    allDocumentSelected = true;
    sectionSelection = false;
    textSelections = [];
    selected = new Set(blocks.map((b) => b.id));
    selection();
  };
  $("selectNone").onclick = () => {
    allDocumentSelected = false;
    sectionSelection = false;
    textSelections = [];
    paintTextSelections();
    selected.clear();
    selection();
  };
  $("undo").onclick = () => history(true);
  $("redo").onclick = () => history(false);
  $("addParagraph").onclick = () => {
    save();
    const pos = blocks.findIndex((b) => b.id === anchor),
      b = {
        id: "u" + Date.now() + Math.random().toString(36).slice(2),
        kind: "paragraph",
        text: "",
        level: null,
      };
    blocks.splice(pos < 0 ? blocks.length : pos + 1, 0, b);
    selected = new Set([b.id]);
    anchor = b.id;
    render();
    editor.querySelector('[data-id="' + b.id + '"] .doc-text').focus();
  };
  $("deleteBlocks").onclick = () => {
    if (!selected.size) return;
    save();
    blocks = blocks.filter((b) => !selected.has(b.id));
    selected.clear();
    render();
  };
  document.addEventListener("keydown", (e) => {
    if (e.target === $("source")) return;
    if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      history(e.key.toLowerCase() === "z" && !e.shiftKey);
    }
    if (e.key === "Tab" && sectionSelection && e.target.closest(".doc-block")) {
      e.preventDefault();
      const id = e.target.closest(".doc-block").dataset.id;
      if (!selected.has(id)) selected = new Set([id]);
      shiftHierarchySpaces(e.shiftKey ? -1 : 1);
    }
  });
  let copyTarget = "standard";
  $("copyCK").onclick = async () => {
    copyTarget = "ckeditor";
    try {
      await $("copy").onclick();
    } finally {
      copyTarget = "standard";
    }
  };
  $("copy").onclick = async () => {
    if (busy || !blocks.length) return;
    busy = true;
    $("copy").disabled = true;
    try {
      pull();
      const payload = D.convert(
        blocks,
        { ...opts(), ckeditor: copyTarget === "ckeditor" },
        measure,
      );
      if (copyTarget === "ckeditor")
        payload.html = D.ckeditorHTML(payload.html);
      const response = await fetch("copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "복사하지 못했습니다.");
      status(
        (copyTarget === "ckeditor"
          ? "CKEditor 전용 복사 완료 · "
          : "문서 복사 완료 · ") +
          payload.blocks +
          "개 문단/표 · 표 " +
          payload.tables +
          "개\n한글 또는 Cafe24 일반 본문에서 Ctrl+V 하세요.",
      );
    } catch (e) {
      status(e.message, true);
    } finally {
      busy = false;
      $("copy").disabled = !blocks.length;
    }
  };
  const baseball =
    "| 순위 | 구단 | 경기 | 승 | 무 | 패 | 승률 | 포스트시즌 |\n| -- | -- | -- | -- | - | -- | -- | -- |\n" +
    [
      "1|서울 라이온즈|144|86|3|55|0.610|한국시리즈 진출",
      "2|부산 웨일스|144|81|2|61|0.570|플레이오프 진출",
      "3|인천 팔콘스|144|77|4|63|0.550|준플레이오프 진출",
      "4|대전 드래곤즈|144|74|3|67|0.525|와일드카드 결정전",
      "5|광주 타이거즈|144|71|2|71|0.500|와일드카드 결정전",
      "6|대구 스톰즈|144|68|4|72|0.486|진출 실패",
      "7|수원 위즈|144|65|3|76|0.461|진출 실패",
      "8|창원 다이노스|144|62|2|80|0.437|진출 실패",
      "9|잠실 베어스|144|58|3|83|0.411|진출 실패",
      "10|고척 히어로즈|144|53|4|87|0.379|진출 실패",
    ]
      .map((s) => "|" + s + "|")
      .join("\n");
  $("example").onclick = () => importDocument("", baseball, true);
  $("documentExample").onclick = async () => {
    try {
      const response = await fetch("document_example.md");
      if (!response.ok) throw Error("예시를 불러오지 못했습니다.");
      importDocument("", await response.text(), true);
    } catch (e) {
      status(e.message, true);
    }
  };

  function captureDrag() {
    if (cellRect) return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return false;
    const found = [];
    rowSelection.clear();
    for (const el of editor.children) {
      if (!el.classList.contains("doc-block")) continue;
      if (!range.intersectsNode(el)) continue;
      found.push(el.dataset.id);
      const rows = [...el.querySelectorAll("tr")];
      if (rows.length) {
        const indices = new Set();
        rows.forEach((tr, i) => {
          if (range.intersectsNode(tr)) indices.add(i);
        });
        rowSelection.set(el.dataset.id, indices);
      }
    }
    if (!found.length) return false;
    selected = new Set(found);
    anchor = found[0];
    selection();
    return true;
  }
  editor.addEventListener("mouseup", () => captureDrag());
  // Capture the browser selection before toolbar buttons take focus.
  for (const bar of document.querySelectorAll(".document-tools,.toolbar"))
    bar.addEventListener("mousedown", () => captureDrag());
  function styleRows(last = false) {
    if (!selected.size) {
      status("표의 행을 드래그하거나 표를 선택해 주세요.", true);
      return;
    }
    save();
    let count = 0;
    for (const b of blocks) {
      if (b.kind !== "table" || !selected.has(b.id)) continue;
      const rects = selectedRects().filter((r) => r.id === b.id),
        rows = last
          ? [b.rows.length - 1]
          : wholeTables.has(b.id)
            ? [0]
            : rects.length
              ? [
                  ...new Set(
                    rects.flatMap((rect) =>
                      Array.from(
                        { length: rect.r2 - rect.r1 + 1 },
                        (_, i) => rect.r1 + i,
                      ),
                    ),
                  ),
                ]
              : [...(rowSelection.get(b.id) || new Set([0]))];
      const remove = rows.every((r) => (b.headerRows || []).includes(r));
      b.headerRows = remove
        ? (b.headerRows || []).filter((r) => !rows.includes(r))
        : [...new Set([...(b.headerRows || []), ...rows])];
      const o = tableOptions(b);
      o.cellStyles ||= {};
      for (const r of rows)
        for (let c = 0; c < b.rows[0].length; c++) {
          const k = r + ":" + c;
          o.cellStyles[k] = { ...o.cellStyles[k] };
          if (remove) {
            delete o.cellStyles[k].top;
            delete o.cellStyles[k].bottom;
          } else
            Object.assign(o.cellStyles[k], { top: "solid", bottom: "solid" });
          if (r > 0) {
            const k = r - 1 + ":" + c;
            o.cellStyles[k] = { ...o.cellStyles[k] };
            if (remove) delete o.cellStyles[k].bottom;
            else o.cellStyles[k].bottom = "solid";
          }
          if (r + 1 < b.rows.length) {
            const k = r + 1 + ":" + c;
            o.cellStyles[k] = { ...o.cellStyles[k] };
            if (remove) delete o.cellStyles[k].top;
            else o.cellStyles[k].top = "solid";
          }
        }
      count += rows.length;
    }
    rowSelection.clear();
    render();
    status(count + "개 행에 제목행 서식 적용");
  }
  $("rowHeader").onclick = () => styleRows();
  $("lastRowHeader").onclick = () => styleRows(true);
  function refreshThemes() {
    const menu = $("hierarchyTheme");
    menu.replaceChildren();
    for (const t of [
      { id: "report", name: "보고형" },
      { id: "official", name: "공문서형" },
      ...themes,
    ]) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      menu.append(o);
    }
  }
  $("hierarchyTheme").onchange = () => {
    const id = $("hierarchyTheme").value,
      t = themes.find((t) => t.id === id);
    save();
    activeSteps = t ? clone(t.steps) : null;
    mode = id === "official" ? "official" : "report";
    if (sectionSelection) applyHierarchyText();
    render();
    $("hierarchyTheme").value = id;
  };
  const grid = $("stepGrid");
  function designSteps() {
    return [...grid.querySelectorAll(".pattern")].map((el, i) => ({
      pattern: el.value,
      spaces: Math.max(
        0,
        Math.min(40, +grid.querySelectorAll(".spaces")[i].value || 0),
      ),
    }));
  }
  function previewHierarchy() {
    const steps = designSteps();
    $("hierarchyPreview").textContent = steps
      .map(
        (s, i) =>
          " ".repeat(s.spaces) +
          s.pattern.replace(/\{n\}/g, "1").replace(/\{ko\}/g, "가") +
          " " +
          (i + 1) +
          "단계 예시",
      )
      .join("\n");
  }
  $("designHierarchy").onclick = () => {
    grid.replaceChildren();
    const steps =
      activeSteps ||
      [
        "{n}.",
        mode === "official" ? "{ko}." : "{n})",
        mode === "official" ? "{n})" : "•",
        mode === "official" ? "{ko})" : "-",
        "•",
        "-",
      ].map((pattern, i) => ({ pattern, spaces: i * 2 }));
    steps.forEach((s, i) => {
      const label = document.createElement("span");
      label.textContent = i + 1 + "단계";
      const pattern = document.createElement("input");
      pattern.className = "pattern";
      pattern.value = s.pattern;
      pattern.maxLength = 60;
      pattern.setAttribute("aria-label", i + 1 + "단계 기호");
      const spaces = document.createElement("input");
      spaces.className = "spaces";
      spaces.type = "number";
      spaces.min = 0;
      spaces.max = 40;
      spaces.value = i * 2;
      spaces.readOnly = true;
      spaces.setAttribute("aria-label", i + 1 + "단계 앞 공백 수");
      const read = document.createElement("button");
      read.textContent = "선택 줄 읽기";
      read.onclick = () => {
        const area = $("hierarchySample"),
          before = area.value.slice(0, area.selectionStart),
          start = before.lastIndexOf("\n") + 1,
          end = area.value.indexOf("\n", area.selectionStart),
          line = area.value.slice(start, end < 0 ? undefined : end),
          m = line.match(/^( *)(\d+[.)]|[가-하][.)]|\S+)\s/);
        if (!m) {
          $("hierarchyStatus").textContent =
            "예시에서 기호가 있는 줄을 선택해 주세요.";
          return;
        }
        spaces.value = i * 2;
        pattern.value = m[2]
          .replace(/^\d+/, "{n}")
          .replace(/^[가-하](?=[.)])/, "{ko}");
        previewHierarchy();
      };
      pattern.oninput = spaces.oninput = previewHierarchy;
      grid.append(label, pattern, spaces, read);
    });
    previewHierarchy();
    $("hierarchyStatus").textContent = "";
    if ($("hierarchyDesigner").showModal) $("hierarchyDesigner").showModal();
    else $("hierarchyDesigner").setAttribute("open", "");
  };
  $("closeHierarchy").onclick = () => {
    $("hierarchyDesigner").close?.();
    $("hierarchyDesigner").removeAttribute("open");
  };
  $("saveHierarchy").onclick = async () => {
    const name = $("hierarchyName").value.trim();
    if (!name) {
      $("hierarchyStatus").textContent = "테마 이름을 입력해 주세요.";
      return;
    }
    const prior = themes.find((t) => t.name === name),
      theme = {
        id: prior?.id || "custom-" + Date.now(),
        name,
        steps: designSteps(),
      };
    const next = [...themes.filter((t) => t.id !== theme.id), theme];
    try {
      const response = await fetch("styles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themes: next }),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error || "저장 실패");
      save();
      themes = next;
      activeSteps = clone(theme.steps);
      mode = "report";
      refreshThemes();
      if (sectionSelection) applyHierarchyText();
      render();
      $("hierarchyTheme").value = theme.id;
      $("closeHierarchy").click();
    } catch (e) {
      $("hierarchyStatus").textContent = e.message;
    }
  };
  fetch("styles")
    .then((r) => r.json())
    .then((data) => {
      themes = Array.isArray(data.themes) ? data.themes : [];
      refreshThemes();
    })
    .catch(() => {});

  function surroundingStyle(after) {
    const index = after ? blocks.findIndex((b) => b.id === after) : -1,
      previous = blocks[index],
      next = blocks
        .slice(index + 1)
        .find((b) => b.kind !== "table" && b.kind !== "image");
    if (previous && previous.kind !== "table" && previous.kind !== "image")
      return pointStyle({
        id: previous.id,
        start: Math.max(0, previous.text.length - 1),
        end: previous.text.length,
      });
    if (next) return pointStyle({ id: next.id, start: 0, end: 0 });
    return { ...baseStyle, fontFamily: baseStyle.fontFamily || "휴먼명조" };
  }
  function createInsertionSlot(after) {
    if (
      blocks.length &&
      (after ? blockById(after)?.gapAfterHidden : baseStyle.leadingGapHidden)
    )
      return document.createDocumentFragment();
    const el = document.createElement("div");
    el.className = "insert-slot";
    el.dataset.after = after;
    el.contentEditable = "true";
    el.tabIndex = 0;
    el.setAttribute("role", "textbox");
    el.setAttribute("aria-label", "문단·이미지 삽입 위치");
    el.addEventListener("input", () => {
      const text = el.textContent;
      if (!text.trim()) return;
      const previous = blockById(after),
        pos = previous ? blocks.indexOf(previous) + 1 : 0,
        b = {
          id: "gap" + Date.now(),
          kind: "paragraph",
          level: null,
          literal: true,
          text,
          style: surroundingStyle(after),
        };
      blocks.splice(pos, 0, b);
      render();
      const content = editor.querySelector(
        '[data-id="' + b.id + '"] .doc-text',
      );
      content.focus();
      const r = document.createRange();
      r.selectNodeContents(content);
      r.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
    });
    return el;
  }
  let extraRects = [],
    wholeTables = new Set(),
    rowRects = new Map(),
    cellRect = null,
    cellDragging = false,
    cellStart = null,
    activeImage = null,
    resize = null;
  function cellAt(node) {
    const td = node.closest?.("td");
    if (!td || !editor.contains(td)) return null;
    return {
      td,
      id: td.closest(".doc-block").dataset.id,
      r: cellRow(td),
      c: cellCol(td),
    };
  }
  function blockById(id) {
    return blocks.find((b) => b.id === id);
  }
  function selectedRects() {
    const rs = [
      ...extraRects,
      ...rowRects.values(),
      ...(cellRect ? [cellRect] : []),
    ];
    for (const id of wholeTables) {
      const b = blockById(id);
      if (b?.kind === "table")
        rs.push({
          id,
          r1: 0,
          r2: b.rows.length - 1,
          c1: 0,
          c2: b.rows[0].length - 1,
        });
    }
    return rs.filter(
      (r, i) =>
        blockById(r.id) &&
        rs.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i,
    );
  }
  function paintCells() {
    const rs = selectedRects();
    let count = 0;
    modelCells(editor).forEach((td) => {
      const at = cellAt(td),
        yes = rs.some(
          (r) =>
            at.id === r.id &&
            at.r >= r.r1 &&
            at.r <= r.r2 &&
            at.c >= r.c1 &&
            at.c <= r.c2,
        );
      td.classList.toggle("cell-picked", yes);
      if (yes) count++;
    });
    if (rs.length) {
      $("selection").textContent =
        count + "개 셀 · " + rs.length + "개 영역 선택";
      emitTextStyle();
    }
  }

  function tableOptions(b) {
    return b.tableOptions || (b.tableOptions = {});
  }
  function enhanceTables() {
    for (const el of editor.querySelectorAll(".table-block")) {
      const b = blockById(el.dataset.id),
        table = el.querySelector("table");
      if (!table) continue;
      [...table.rows[0].cells].slice(0, -1).forEach((td, c) => {
        const handle = document.createElement("span");
        handle.className = "column-grip";
        handle.contentEditable = "false";
        handle.setAttribute("aria-label", c + 1 + "열 너비 조절");
        handle.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          save();
          const m = T.layout(b.rows, { ...opts(), ...b.tableOptions });
          resize = {
            kind: "column",
            id: b.id,
            c,
            x: e.clientX,
            widths: m.widths,
          };
        };
        td.append(handle);
      });
    }
    for (const img of editor.querySelectorAll("img")) {
      const el = img.closest(".doc-block"),
        at = cellAt(img),
        b = blockById(el.dataset.id);
      const list = at ? b.tableOptions?.cellImages?.[at.r + ":" + at.c] : null,
        index = at
          ? [...at.td.querySelectorAll("img")].indexOf(img)
          : [...el.querySelectorAll("img")].indexOf(img),
        model = at
          ? list?.[index]
          : b.kind === "image"
            ? b.image
            : b.inlineImages?.[index]?.image;
      if (!model) continue;
      const box = document.createElement("span");
      box.className = "image-box";
      box.contentEditable = "false";
      img.replaceWith(box);
      box.append(img);
      const grip = document.createElement("span");
      grip.className = "image-grip";
      grip.contentEditable = "false";
      box.append(grip);
      const ref = {
        id: b.id,
        key: at ? at.r + ":" + at.c : null,
        index,
        inline: !at && b.kind !== "image",
      };
      box.onmousedown = (e) => {
        if (e.button === 2 && cellRect) {
          e.stopPropagation();
          return;
        }
        activeImage = ref;
        editor
          .querySelectorAll(".image-box")
          .forEach((x) => x.classList.toggle("active", x === box));
        selected = new Set([b.id]);
        selection();
        e.stopPropagation();
        const rect = box.getBoundingClientRect(),
          edge =
            e.target === grip ||
            e.clientX >= rect.right - 6 ||
            e.clientY >= rect.bottom - 6;
        if (edge && e.button === 0) {
          e.preventDefault();
          save();
          resize = {
            kind: "image",
            ref,
            x: e.clientX,
            y: e.clientY,
            width: +img.width || model.width,
            height: +img.height || model.height,
            max: at
              ? Math.max(8, at.td.getBoundingClientRect().width - 8)
              : opts().width,
            box,
          };
        }
      };
      img.ondragstart = (e) => e.preventDefault();
    }
    editor.querySelectorAll(".image-box").forEach((box) => {
      const b = box.closest(".doc-block"),
        td = box.closest("td"),
        key = td ? cellRow(td) + ":" + cellCol(td) : null;
      const siblings = td
        ? [...td.querySelectorAll(".image-box")]
        : [...b.querySelectorAll(".image-box")];
      box.classList.toggle(
        "active",
        !!activeImage &&
          activeImage.id === b.dataset.id &&
          activeImage.key === key &&
          activeImage.index === siblings.indexOf(box),
      );
    });
    paintCells();
  }
  function imageModel(ref) {
    const b = blockById(ref?.id);
    return ref?.inline
      ? b?.inlineImages?.[ref.index]?.image
      : ref?.key
        ? b?.tableOptions?.cellImages?.[ref.key]?.[ref.index]
        : b?.image;
  }
  editor.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) return;
      if (e.target.closest(".column-grip,.image-box")) return;
      activeImage = null;
      f5Cell = null;
      const at = cellAt(e.target);
      const tableBlock = e.target.closest(".table-block");
      if (e.ctrlKey && !at && tableBlock) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (cellRect) extraRects.push({ ...cellRect });
        const b = blockById(tableBlock.dataset.id);
        cellRect = {
          id: b.id,
          r1: 0,
          r2: b.rows.length - 1,
          c1: 0,
          c2: b.rows[0].length - 1,
        };
        selected = new Set(selectedRects().map((r) => r.id));
        sectionSelection = false;
        window.getSelection()?.removeAllRanges();
        paintCells();
        return;
      }
      if (e.ctrlKey && e.shiftKey && at) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.getSelection()?.removeAllRanges();
        if (wholeTables.has(at.id)) wholeTables.delete(at.id);
        else wholeTables.add(at.id);
        extraRects = [];
        rowRects.clear();
        cellRect = null;
        selected = new Set(wholeTables);
        sectionSelection = true;
        selection();
        paintCells();
        return;
      }
      if (!e.ctrlKey) {
        extraRects = [];
        wholeTables.clear();
        rowRects.clear();
        f5Cell = null;
      } else if (cellRect) {
        extraRects.push({ ...cellRect });
      }
      if (e.ctrlKey && at && !(textSelections.length && e.target !== at.td)) {
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        cellDragging = true;
        cellStart = at;
        cellRect = { id: at.id, r1: at.r, r2: at.r, c1: at.c, c2: at.c };
        selected = new Set([...selectedRects().map((r) => r.id), at.id]);
        sectionSelection = false;
        wholeTables.clear();
        paintCells();
      } else {
        cellRect = null;
        paintCells();
      }
    },
    true,
  );
  editor.addEventListener("mousemove", (e) => {
    if (!cellDragging) return;
    const at = cellAt(e.target);
    if (!at || at.id !== cellStart.id) return;
    cellRect = {
      id: at.id,
      r1: Math.min(at.r, cellStart.r),
      r2: Math.max(at.r, cellStart.r),
      c1: Math.min(at.c, cellStart.c),
      c2: Math.max(at.c, cellStart.c),
    };
    paintCells();
  });
  document.addEventListener("mousemove", (e) => {
    if (!resize) return;
    if (resize.kind === "column") {
      const b = blockById(resize.id),
        widths = [...resize.widths],
        i = resize.c,
        delta = Math.max(
          16 - widths[i],
          Math.min(widths[i + 1] - 16, e.clientX - resize.x),
        );
      widths[i] += delta;
      widths[i + 1] -= delta;
      tableOptions(b).widths = widths;
      const el = [...editor.children].find((x) => x.dataset.id === b.id);
      el.querySelectorAll("col").forEach((col, i) => {
        col.style.width = widths[i] + "px";
        col.width = widths[i];
      });
      return;
    }
    const m = imageModel(resize.ref),
      w = Math.max(
        16,
        Math.min(
          resize.max,
          resize.width +
            (e.ctrlKey || !keepAspect
              ? e.clientX - resize.x
              : Math.abs(e.clientX - resize.x) >
                  Math.abs(
                    ((e.clientY - resize.y) * resize.width) / resize.height,
                  )
                ? e.clientX - resize.x
                : ((e.clientY - resize.y) * resize.width) / resize.height),
        ),
      ),
      h =
        e.ctrlKey || !keepAspect
          ? Math.max(16, resize.height + e.clientY - resize.y)
          : (w * resize.height) / resize.width;
    m.width = w;
    m.height = h;
    const img = resize.box.querySelector("img");
    img.style.width = w + "px";
    img.style.height = h + "px";
    img.width = Math.round(w);
    img.height = Math.round(h);
  });
  document.addEventListener("mouseup", () => {
    cellDragging = false;
    if (resize) {
      resize = null;
      render();
    }
  });
  function requireRect() {
    if (cellRect) return cellRect;
    status("Ctrl+드래그로 셀을 선택해 주세요.", true);
    return null;
  }
  function applyCells(update) {
    const rects = selectedRects().filter(
      (r) => blockById(r.id)?.kind === "table",
    );
    if (
      !rects.length &&
      insertionPoint?.key &&
      blockById(insertionPoint.id)?.kind === "table"
    ) {
      const [r, c] = insertionPoint.key.split(":").map(Number);
      rects.push({ id: insertionPoint.id, r1: r, r2: r, c1: c, c2: c });
    }
    if (!rects.length) return requireRect();
    save();
    for (const rect of rects) {
      const b = blockById(rect.id),
        o = tableOptions(b);
      o.cellStyles ||= {};
      for (let r = rect.r1; r <= rect.r2; r++)
        for (let c = rect.c1; c <= rect.c2; c++) {
          const key = r + ":" + c;
          o.cellStyles[key] = { ...o.cellStyles[key], ...update };
        }
    }
    render();
  }

  for (const [id, align] of [
    ["cellLeft", "left"],
    ["cellCenter", "center"],
    ["cellRight", "right"],
  ])
    $(id).onclick = () => {
      const img = imageModel(activeImage);
      if (img) {
        save();
        img.align = align;
        render();
      } else applyCells({ align });
    };
  $("cellMiddle").onclick = () => applyCells({ valign: "middle" });
  for (const [id, kind] of [
    ["selectColumns", "columns"],
    ["selectRows", "rows"],
    ["selectTable", "table"],
  ])
    $(id).onclick = () => {
      let rect = cellRect;
      if (!rect) {
        const b =
          blockById(insertionPoint?.id) ||
          blocks.find((b) => b.kind === "table" && selected.has(b.id));
        if (!b) return status("표 또는 셀을 먼저 선택해 주세요.", true);
        rect = {
          id: b.id,
          r1: 0,
          r2: b.rows.length - 1,
          c1: 0,
          c2: b.rows[0].length - 1,
        };
      }
      const b = blockById(rect.id);
      cellRect = { ...rect };
      if (kind !== "rows") {
        cellRect.r1 = 0;
        cellRect.r2 = b.rows.length - 1;
      }
      if (kind !== "columns") {
        cellRect.c1 = 0;
        cellRect.c2 = b.rows[0].length - 1;
      }
      paintCells();
    };
  $("equalWidth").onclick = () => {
    const ranges = selectedRects();
    if (!ranges.length) return requireRect();
    save();
    for (const id of new Set(ranges.map((r) => r.id))) {
      const b = blockById(id),
        o = tableOptions(b),
        cols = [
          ...new Set(
            ranges
              .filter((r) => r.id === id)
              .flatMap((r) =>
                Array.from({ length: r.c2 - r.c1 + 1 }, (_, i) => r.c1 + i),
              ),
          ),
        ],
        widths = T.layout(b.rows, { ...opts(), ...o }).widths,
        average = cols.reduce((n, c) => n + widths[c], 0) / cols.length;
      for (const c of cols) widths[c] = average;
      o.widths = widths;
    }
    render();
  };
  $("equalHeight").onclick = () => {
    const ranges = selectedRects();
    if (!ranges.length) return requireRect();
    save();
    for (const id of new Set(ranges.map((r) => r.id))) {
      const b = blockById(id),
        o = tableOptions(b),
        rows = [
          ...new Set(
            ranges
              .filter((r) => r.id === id)
              .flatMap((r) =>
                Array.from({ length: r.r2 - r.r1 + 1 }, (_, i) => r.r1 + i),
              ),
          ),
        ],
        root = editor.querySelector('[data-id="' + id + '"]'),
        height = Math.max(
          ...rows.map(
            (r) =>
              getModelCell(root, r, 0)?.parentElement.getBoundingClientRect()
                .height || 24,
          ),
        );
      o.rowHeights ||= {};
      for (const r of rows) o.rowHeights[r] = height;
    }
    render();
  };

  document.addEventListener("editor-visual-border", (e) => {
    const { style, width, color, scope } = e.detail,
      rects = selectedRects();
    if (!rects.length) {
      status("먼저 적용할 표 셀을 선택해 주세요.");
      return;
    }
    save();
    for (const rect of rects) {
      const b = blockById(rect.id),
        o = tableOptions(b);
      o.cellStyles ||= {};
      const set = (r, c, side) => {
        if (r < 0 || c < 0 || r >= b.rows.length || c >= b.rows[0].length)
          return;
        const key = r + ":" + c;
        o.cellStyles[key] = {
          ...o.cellStyles[key],
          [side]: style,
          [side + "Width"]: width,
          [side + "Color"]: color,
        };
      };
      for (let r = rect.r1; r <= rect.r2; r++)
        for (let c = rect.c1; c <= rect.c2; c++)
          for (const [side, rr, cc, opp, outer, inner] of [
            ["top", r - 1, c, "bottom", r === rect.r1, r > rect.r1],
            ["bottom", r + 1, c, "top", r === rect.r2, r < rect.r2],
            ["left", r, c - 1, "right", c === rect.c1, c > rect.c1],
            ["right", r, c + 1, "left", c === rect.c2, c < rect.c2],
          ])
            if (
              scope === "all" ||
              (scope === "outer" && outer) ||
              (scope === "inner" && inner) ||
              (scope === side && outer) ||
              (scope === "horizontal" &&
                inner &&
                (side === "top" || side === "bottom")) ||
              (scope === "vertical" &&
                inner &&
                (side === "left" || side === "right"))
            ) {
              set(r, c, side);
              set(rr, cc, opp);
            }
    }
    render();
    status("선택한 셀 테두리 적용 · Ctrl+Z로 취소");
  });
  $("cellBorder").onchange = () => {
    const style = $("cellBorder").value,
      rect = requireRect();
    if (!style || !rect) return;
    save();
    const b = blockById(rect.id),
      o = tableOptions(b);
    o.cellStyles ||= {};
    const set = (r, c, side) => {
      if (r < 0 || c < 0 || r >= b.rows.length || c >= b.rows[0].length) return;
      const key = r + ":" + c;
      o.cellStyles[key] = { ...o.cellStyles[key], [side]: style };
    };
    const scope = $("borderTarget")?.value || "all";
    for (let r = rect.r1; r <= rect.r2; r++)
      for (let c = rect.c1; c <= rect.c2; c++) {
        for (const [side, rr, cc, opp, outer, inner] of [
          ["top", r - 1, c, "bottom", r === rect.r1, r > rect.r1],
          ["bottom", r + 1, c, "top", r === rect.r2, r < rect.r2],
          ["left", r, c - 1, "right", c === rect.c1, c > rect.c1],
          ["right", r, c + 1, "left", c === rect.c2, c < rect.c2],
        ]) {
          if (
            scope === "all" ||
            (scope === "outer" && outer) ||
            (scope === "inner" && inner) ||
            (scope === side && outer) ||
            (scope === "horizontal" &&
              inner &&
              (side === "top" || side === "bottom")) ||
            (scope === "vertical" &&
              inner &&
              (side === "left" || side === "right"))
          ) {
            set(r, c, side);
            set(rr, cc, opp);
          }
        }
      }
    render();
    $("cellBorder").value = "";
  };
  editor.addEventListener(
    "paste",
    async (e) => {
      if (
        (e.clipboardData.getData?.("text/plain") || "").trim() &&
        e.clipboardData.getData?.("text/html")
      )
        return;
      const item = [...e.clipboardData.items].find(
        (i) => i.kind === "file" && i.type.startsWith("image/"),
      );
      if (!item) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const at = cellAt(e.target),
        slot = e.target.closest(".insert-slot"),
        parent = e.target.closest(".doc-block"),
        id = slot ? slot.dataset.after : parent?.dataset.id,
        editable = e.target.closest(".doc-text");
      let offset = null;
      const selection = window.getSelection();
      if (editable && selection?.rangeCount) {
        const range = selection.getRangeAt(0).cloneRange();
        range.selectNodeContents(editable);
        range.setEnd(selection.focusNode, selection.focusOffset);
        offset = readEditorText(range.cloneContents()).length;
      }
      try {
        const file = item.getAsFile();
        if (!file || file.size > 3000000)
          throw Error("이미지는 3MB 이하로 넣어 주세요.");
        const src = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
          image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(Error("이미지를 읽지 못했습니다."));
            img.src = src;
          });
        let data = src;
        if (!/^data:image\/(png|jpeg);/i.test(src)) {
          const c = document.createElement("canvas");
          c.width = image.naturalWidth;
          c.height = image.naturalHeight;
          c.getContext("2d").drawImage(image, 0, 0);
          data = c.toDataURL("image/png");
        }
        if (data.length > 4000000) throw Error("이미지 용량을 줄여 주세요.");
        save();
        const b = blockById(id),
          max = at
            ? Math.max(
                16,
                T.layout(b.rows, { ...opts(), ...b.tableOptions }).widths[
                  at.c
                ] - 8,
              )
            : opts().width,
          width = Math.min(image.naturalWidth, max),
          model = {
            src: data,
            width,
            height: (image.naturalHeight * width) / image.naturalWidth,
            align: "center",
          };
        if (at) {
          const o = tableOptions(b);
          o.cellImages ||= {};
          const key = at.r + ":" + at.c;
          o.cellImages[key] ||= [];
          o.cellImages[key].push(model);
          activeImage = { id: b.id, key, index: o.cellImages[key].length - 1 };
        } else {
          let pos = slot
            ? b
              ? blocks.indexOf(b) + 1
              : 0
            : b
              ? blocks.indexOf(b) + 1
              : blocks.length;
          if (b && editable && offset !== null) {
            const tail = b.text.slice(offset);
            b.text = b.text.slice(0, offset);
            if (tail)
              blocks.splice(pos, 0, {
                id: "tail" + Date.now(),
                kind: "paragraph",
                text: tail,
                level: null,
              });
          }
          const next = {
            id: "img" + Date.now(),
            kind: "image",
            level: null,
            image: model,
          };
          blocks.splice(pos, 0, next);
          selected = new Set([next.id]);
          activeImage = { id: next.id, key: null, index: 0 };
        }
        cellRect = null;
        render();
        status("이미지 삽입 완료 · 모서리 드래그: 비율 유지 / Ctrl: 자유 크기");
      } catch (err) {
        status(err.message, true);
      }
    },
    true,
  );

  function activeParagraphs() {
    const list = blocks.filter(
      (b) => selected.has(b.id) && b.kind !== "table" && b.kind !== "image",
    );
    if (list.length) return list;
    const b = blockById(anchor);
    return b && b.kind !== "table" && b.kind !== "image" ? [b] : [];
  }
  function paragraphStyle(style) {
    const points = selectedTextPoints(),
      touched = new Set(points.map((p) => p.id)),
      list = touched.size
        ? blocks.filter(
            (b) =>
              touched.has(b.id) && b.kind !== "table" && b.kind !== "image",
          )
        : activeParagraphs(),
      cells = points.filter((p) => p.key);
    if (
      !cells.length &&
      insertionPoint?.key &&
      blockById(insertionPoint.id)?.kind === "table"
    )
      cells.push({ id: insertionPoint.id, key: insertionPoint.key });
    if (!list.length && !cells.length) {
      status("본문이나 셀을 클릭하거나 선택해 주세요.", true);
      return;
    }
    save();
    for (const b of list) b.style = { ...b.style, ...style };
    for (const p of cells) {
      const o = tableOptions(blockById(p.id));
      o.cellStyles ||= {};
      o.cellStyles[p.key] = { ...o.cellStyles[p.key], ...style };
    }
    render();
  }

  for (const [id, align] of [
    ["cellLeft", "left"],
    ["cellCenter", "center"],
    ["cellRight", "right"],
  ]) {
    const existing = $(id).onclick;
    $(id).onclick = () => {
      if (cellRect || imageModel(activeImage)) existing();
      else paragraphStyle({ align });
    };
  }
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.target.closest(".shell-ribbon,.shell-properties")) captureDrag();
    },
    true,
  );
  let keepAspect = true;
  document.addEventListener("editor-shell-command", (e) => {
    const cmd = e.detail;
    if (cmd.type === "thickBorder") {
      $("cellBorder").value = "thick";
      $("cellBorder").dispatchEvent(new Event("change"));
      return;
    }
    if (cmd.type === "spaceIndent") {
      shiftHierarchySpaces(cmd.direction);
      return;
    }
    if (cmd.type === "findReplace") {
      showFindReplace();
      return;
    }
    if (cmd.type === "saveColorPair") {
      saveColorPair();
      return;
    }
    if (cmd.type === "applyColorPair") {
      applyCharacterStyle({
        color: cmd.pair.color,
        background: cmd.pair.background,
      });
      return;
    }
    if (cmd.type === "inlineStyle") {
      applyCharacterStyle(cmd.style);
      return;
    }
    if (cmd.type === "insertImage") {
      document.dispatchEvent(new Event("editor-shell-pick-image"));
      return;
    }
    if (cmd.type === "aspectLock") {
      keepAspect = !keepAspect;
      status(keepAspect ? "이미지 비율 고정" : "이미지 자유 크기");
      return;
    }
    if (cmd.type === "format") {
      applyCharacterStyle({ [cmd.key]: !selectedFormatValue(cmd.key) });
      return;
    }
    if (cmd.type === "align") {
      paragraphStyle({ align: cmd.value });
      return;
    }
    if (cmd.type === "valign") {
      applyCells({ valign: cmd.value });
      return;
    }
    if (cmd.type === "textColor" || cmd.type === "textBackground") {
      showColorPicker(cmd.type === "textColor" ? "color" : "background");
      return;
    }
    if (cmd.type === "applyColor") {
      applyColor(cmd.key, cmd.value);
      return;
    }
    if (cmd.type === "numbered" || cmd.type === "bulleted") {
      if (!selected.size && anchor) selected.add(anchor);
      transform("set", cmd.type === "numbered" ? 0 : 2);
      return;
    }
    if (cmd.type === "insertLink") {
      editLink();
      return;
    }
    if (cmd.type === "insertTable") {
      const dialog = document.createElement("dialog");
      dialog.innerHTML =
        '<h2>표 삽입</h2><label>행 <input type="number" min="1" max="100" value="4" id="newRows"></label><label>열 <input type="number" min="1" max="40" value="4" id="newCols"></label><label>표 폭 <input id="newTableWidth" type="number" min="240" max="1200" value="620"> px</label><label>정렬 <select id="newTableAlign"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label><label><input id="newTableHeader" type="checkbox" checked> 첫 행을 제목행으로</label><label>테두리 <select id="newTableBorder"><option value="normal">기본</option><option value="thick">위·아래 굵은 선</option><option value="none">선 없음</option></select></label><button id="createTable">삽입</button> <button id="cancelTable">취소</button>';
      document.body.append(dialog);
      dialog.querySelector("#cancelTable").onclick = () => dialog.remove();
      dialog.querySelector("#createTable").onclick = () => {
        const r = Math.max(
            1,
            Math.min(100, +dialog.querySelector("#newRows").value || 4),
          ),
          c = Math.max(
            1,
            Math.min(40, +dialog.querySelector("#newCols").value || 4),
          );
        save();
        const b = {
            id: "table" + Date.now(),
            kind: "table",
            text: "",
            level: null,
            rows: Array.from({ length: r }, (_, r) =>
              Array.from({ length: c }, (_, c) =>
                r === 0 ? "제목 " + (c + 1) : "",
              ),
            ),
            headerRows: dialog.querySelector("#newTableHeader").checked
              ? [0]
              : [],
            tableOptions: {
              width: +dialog.querySelector("#newTableWidth").value || 620,
              header: dialog.querySelector("#newTableHeader").checked,
              tableAlign: dialog.querySelector("#newTableAlign").value,
              fontFamily: insertionStyle().fontFamily,
              fontSize: insertionStyle().fontSize,
              cellStyles: {},
            },
          },
          i = blocks.findIndex((b) => b.id === anchor);
        const border = dialog.querySelector("#newTableBorder").value;
        if (border !== "normal")
          for (let row = 0; row < r; row++)
            for (let col = 0; col < c; col++)
              b.tableOptions.cellStyles[row + ":" + col] =
                border === "none"
                  ? { top: "none", bottom: "none", left: "none", right: "none" }
                  : {
                      ...(row === 0 ? { top: "thick" } : {}),
                      ...(row === r - 1 ? { bottom: "thick" } : {}),
                    };
        blocks.splice(i < 0 ? blocks.length : i + 1, 0, b);
        anchor = b.id;
        selected = new Set([b.id]);
        cellRect = null;
        render();
        dialog.remove();
        focusDocumentPoint(b.id, 0);
      };
      dialog.showModal?.();
      return;
    }
    const b =
      blockById(cellRect?.id) ||
      blocks.find((b) => selected.has(b.id) && b.kind === "table") ||
      blockById(anchor);
    if (!b || b.kind !== "table")
      return status("표 또는 셀을 먼저 선택해 주세요.", true);
    save();
    const row = cmd.type.endsWith("Row"),
      add = cmd.type.startsWith("add"),
      size = row ? b.rows.length : b.rows[0].length,
      start = cellRect ? (row ? cellRect.r1 : cellRect.c1) : size - 1,
      end = cellRect ? (row ? cellRect.r2 : cellRect.c2) : size - 1;
    if (
      !["addRow", "deleteRow", "addColumn", "deleteColumn"].includes(cmd.type)
    )
      return;
    const index = add ? end + 1 : start,
      count = add ? 1 : end - start + 1;
    if (!add && count >= size) {
      status("행과 열은 최소 한 개가 필요합니다.", true);
      return;
    }
    const remap = (i) =>
        add
          ? i >= index
            ? i + 1
            : i
          : i < start
            ? i
            : i > end
              ? i - count
              : null,
      o = tableOptions(b);
    for (const key of ["cellStyles", "cellImages", "cellLinks", "cellMarks"])
      if (o[key]) {
        const result = {};
        for (const [key2, value] of Object.entries(o[key])) {
          let [r, c] = key2.split(":").map(Number),
            next = remap(row ? r : c);
          if (next === null) continue;
          if (row) r = next;
          else c = next;
          result[r + ":" + c] = value;
        }
        o[key] = result;
      }
    if (row) {
      if (add) b.rows.splice(index, 0, Array(b.rows[0].length).fill(""));
      else b.rows.splice(start, count);
      b.headerRows = (b.headerRows || []).map(remap).filter((v) => v !== null);
      const heights = {};
      for (const [r, h] of Object.entries(o.rowHeights || {})) {
        const nr = remap(+r);
        if (nr !== null) heights[nr] = h;
      }
      o.rowHeights = heights;
    } else {
      for (const r of b.rows)
        if (add) r.splice(index, 0, "");
        else r.splice(start, count);
      if (o.widths) {
        if (add)
          o.widths.splice(
            index,
            0,
            o.widths[Math.min(index, o.widths.length - 1)],
          );
        else o.widths.splice(start, count);
      }
    }
    cellRect = null;
    render();
  });
  // Move between real text, table cells, and insertion slots without selecting sections.
  editor.addEventListener("keydown", (e) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const point =
      e.target.closest(".doc-text,.insert-slot,td") ||
      window
        .getSelection()
        ?.focusNode?.parentElement?.closest(".doc-text,.insert-slot,td");
    const sel = window.getSelection();
    if (!point || !sel?.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0),
      pre = range.cloneRange();
    pre.selectNodeContents(point);
    pre.setEnd(range.endContainer, range.endOffset);
    const offset = readEditorText(pre.cloneContents()).length,
      total = point.textContent.length,
      back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    let edge = back ? offset === 0 : offset === total;
    if (
      !edge &&
      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
      range.getBoundingClientRect
    ) {
      const rect = range.getBoundingClientRect(),
        box = point.getBoundingClientRect(),
        line = parseFloat(getComputedStyle(point).lineHeight) || 20;
      edge = back ? rect.top - box.top < line : box.bottom - rect.bottom < line;
    }
    if (!edge) return;
    const all = [...editor.querySelectorAll(".doc-text,.insert-slot,td")];
    let next = all[all.indexOf(point) + (back ? -1 : 1)];
    if (
      point.tagName === "TD" &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      const table = point.closest("table"),
        row = table.rows[point.parentElement.rowIndex + (back ? -1 : 1)];
      next =
        row?.cells[point.cellIndex] ||
        ((back
          ? point.closest(".doc-block").previousElementSibling
          : point.closest(".doc-block").nextElementSibling
        )?.matches(".insert-slot")
          ? back
            ? point.closest(".doc-block").previousElementSibling
            : point.closest(".doc-block").nextElementSibling
          : next);
    }
    if (!next) return;
    e.preventDefault();
    if (next.tagName === "TD") next.closest(".table-content").focus();
    else next.focus();
    const r = document.createRange();
    r.selectNodeContents(next);
    r.collapse(!back);
    sel.removeAllRanges();
    sel.addRange(r);
    anchor =
      next.closest(".doc-block")?.dataset.id || next.dataset.after || null;
    selected.clear();
    selection();
  });

  function readLinks(el) {
    const out = [];
    for (const a of el.querySelectorAll("a[href]")) {
      if (a.dataset.autoLink) continue;
      const url = D.validURL(a.getAttribute("href"));
      if (!url) continue;
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEndBefore(a);
      const start = readEditorText(r.cloneContents()).length;
      out.push({
        start,
        end: start + a.textContent.length,
        url,
        newWindow: a.target === "_blank",
      });
    }
    return out;
  }
  function editLink() {
    pull();
    const range = window.getSelection()?.rangeCount
        ? window.getSelection().getRangeAt(0)
        : null,
      td = range?.startContainer?.parentElement?.closest("td");
    let b =
        blockById(cellRect?.id) || activeParagraphs()[0] || blockById(anchor),
      key = null,
      text,
      links,
      content;
    if (b?.kind === "table") {
      const r = cellRect?.r1 ?? (td ? cellRow(td) : undefined),
        c = cellRect?.c1 ?? (td ? cellCol(td) : undefined);
      if (r === undefined || c === undefined)
        return status("링크를 넣을 셀을 먼저 클릭해 주세요.", true);
      key = r + ":" + c;
      text = b.rows[r][c];
      links = b.tableOptions?.cellLinks?.[key] || [];
      content = [...editor.children]
        .find((el) => el.dataset.id === b.id)
        .querySelectorAll(
          'td[data-cell-row="' + r + '"][data-cell-col="' + c + '"]',
        )[0];
    } else if (b && b.kind !== "image") {
      text = b.text;
      links = b.links || [];
      content = [...editor.children]
        .find((el) => el.dataset.id === b.id)
        .querySelector(".doc-text");
    } else return status("링크를 넣을 본문이나 셀을 먼저 클릭해 주세요.", true);
    let start = 0,
      end = text.length;
    if (
      range &&
      content.contains(range.startContainer) &&
      content.contains(range.endContainer) &&
      !range.collapsed
    ) {
      const r = range.cloneRange();
      r.selectNodeContents(content);
      r.setEnd(range.startContainer, range.startOffset);
      start = readEditorText(r.cloneContents()).length;
      end = start + readEditorText(range.cloneContents()).length;
    }
    if (range?.collapsed && content.contains(range.startContainer)) {
      const r = range.cloneRange();
      r.selectNodeContents(content);
      r.setEnd(range.startContainer, range.startOffset);
      const at = readEditorText(r.cloneContents()).length,
        found = links.find((l) => l.start <= at && l.end >= at);
      start = found ? found.start : at;
      end = found ? found.end : at;
    }
    const old = links.find((l) => l.start <= start && l.end >= end),
      dialog = document.createElement("dialog");
    dialog.id = "linkDialog";
    dialog.innerHTML =
      '<h2>하이퍼링크</h2><label>표시할 글자 <input id="linkLabel"></label><label>URL <input id="linkURL" type="url" placeholder="https://..."></label><label><input id="linkNewWindow" type="checkbox" checked> 새 창에서 열기</label><p id="linkError" role="status"></p><button id="linkApply">적용</button> <button id="linkRemove">링크 해제</button> <button id="linkCancel">취소</button>';
    document.body.append(dialog);
    dialog.querySelector("#linkLabel").value = text.slice(start, end);
    dialog.querySelector("#linkURL").value = old?.url || "";
    dialog.querySelector("#linkNewWindow").checked = old?.newWindow !== false;
    dialog.querySelector("#linkCancel").onclick = () => dialog.remove();
    function commit(remove) {
      const url = remove
        ? null
        : D.validURL(dialog.querySelector("#linkURL").value);
      if (!remove && !url) {
        dialog.querySelector("#linkError").textContent =
          "http, https, mailto 주소를 입력해 주세요.";
        return;
      }
      save();
      const label = remove
          ? text.slice(start, end)
          : dialog.querySelector("#linkLabel").value || url,
        delta = label.length - (end - start),
        next = links
          .filter((l) => l.end <= start || l.start >= end)
          .map((l) =>
            l.start >= end
              ? { ...l, start: l.start + delta, end: l.end + delta }
              : l,
          );
      if (!remove)
        next.push({
          start,
          end: start + label.length,
          url,
          newWindow: dialog.querySelector("#linkNewWindow").checked,
        });
      if (key) {
        const [r, c] = key.split(":").map(Number);
        b.rows[r][c] = text.slice(0, start) + label + text.slice(end);
        const o = tableOptions(b);
        o.cellLinks ||= {};
        o.cellLinks[key] = next;
      } else {
        b.text = text.slice(0, start) + label + text.slice(end);
        b.links = next;
      }
      render();
      dialog.remove();
    }
    dialog.querySelector("#linkApply").onclick = () => commit(false);
    dialog.querySelector("#linkRemove").onclick = () => commit(true);
    dialog.showModal?.();
    dialog.querySelector("#linkURL").focus();
  }
  document.addEventListener('editor-font-change', e => {
    if(window.EditorInput?.composing) return;
    const font=String(e.detail || '').trim();
    if(!font || font.length>100 || /[<>;{}]/.test(font)) return;
    pull();save();baseStyle.fontFamily=font;
    for(const b of blocks) {
      if(b.kind==='image') continue;
      if(b.kind==='table') {
        b.tableOptions ||= {};b.tableOptions.fontFamily=font;
        for(const st of Object.values(b.tableOptions.cellStyles || {})) st.fontFamily=font;
        for(const marks of Object.values(b.tableOptions.cellMarks || {})) for(const m of marks) m.style={...m.style,fontFamily:font};
      } else {b.style={...b.style,fontFamily:font};for(const m of b.marks || []) m.style={...m.style,fontFamily:font};}
    }
    render();status('문서 전체 서체: '+font+' · Ctrl+Z로 취소');
  });
  // Expose snapshots as DOM events, keeping the editor state private.
  document.addEventListener('editor-style-preset',e=>{
    if(window.EditorInput?.composing)return;
    pull();save();
    const p=e.detail||{},font=p.fontFamily||'맑은 고딕';
    for(const b of blocks){
      if(b.kind==='table')b.tableOptions={...b.tableOptions,fontFamily:font,fontSize:p.tableSize||10};
      else if(b.kind!=='image')b.style={...b.style,fontFamily:font,fontSize:b.level!==null&&b.level!==undefined?(p.headingSize||14):(p.bodySize||11),lineHeight:p.lineHeight||1.5};
    }
    render();document.dispatchEvent(new Event('editor-content-changed'));status('문서 전체 서식 적용 · Ctrl+Z로 취소');
  });
  document.addEventListener("editor-document-request", (e) => {
    // During IME composition, expose only the last committed model. Pulling
    // provisional DOM text here (for autosave/pagehide) can reset the caret.
    if (!window.EditorInput?.composing) pull();
    e.detail({
      ...snapshot(),
      settings: settings(),
      source: $("source").value,
    });
  });
  document.addEventListener("editor-document-load", (e) => {
    const state = e.detail;
    if (!Array.isArray(state.blocks)) return;
    undo = [];
    redo = [];
    extraRects = [];
    wholeTables.clear();
    rowRects.clear();
    cellRect = null;
    activeImage = null;
    allDocumentSelected = false;
    restore({
      ...state,
      selected: [],
      anchor: null,
      mode: state.mode || "report",
      settings: state.settings || settings(),
    });
    $("source").value = state.source || "";
  });
  let allDocumentSelected = false;
  editor.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) return;
      if (!e.ctrlKey && !e.metaKey) allDocumentSelected = false;
    },
    true,
  );
  function focusBlank() {
    requestAnimationFrame(() => editor.querySelector(".insert-slot")?.focus());
  }
  function deleteAcrossRange(range) {
    const affected = blocks.filter((b) => {
      const el = [...editor.children].find((el) => el.dataset.id === b.id);
      return el && range.intersectsNode(el);
    });
    if (!affected.length) return false;
    save();
    const first = affected[0],
      last = affected[affected.length - 1];
    let prefix = "",
      suffix = "";
    function fragment(b, start) {
      const el = [...editor.children]
        .find((el) => el.dataset.id === b.id)
        ?.querySelector(".doc-text");
      if (!el) return "";
      const container = start ? range.startContainer : range.endContainer,
        offset = start ? range.startOffset : range.endOffset;
      if (!el.contains(container)) return "";
      const r = range.cloneRange();
      r.selectNodeContents(el);
      if (start) r.setEnd(container, offset);
      else r.setStart(container, offset);
      return r.toString();
    }
    prefix = fragment(first, true);
    suffix = fragment(last, false);
    const index = blocks.indexOf(first),
      ids = new Set(affected.map((b) => b.id));
    blocks = blocks.filter((b) => !ids.has(b.id));
    const tailStart = (last.text || "").length - suffix.length,
      retain = (ranges, start, end, shift) =>
        ranges
          .map((m) => ({
            ...m,
            start: Math.max(start, m.start) - start + shift,
            end: Math.min(end, m.end) - start + shift,
          }))
          .filter((m) => m.end > m.start);
    const b = {
      id: "edit" + Date.now(),
      kind: prefix ? first.kind : "paragraph",
      level: prefix ? first.level : null,
      style: clone(first.style || {}),
      text: prefix + suffix,
      marks: [
        ...retain(first.marks || [], 0, prefix.length, 0),
        ...retain(
          last.marks || [],
          tailStart,
          (last.text || "").length,
          prefix.length,
        ),
      ],
      links: [
        ...retain(first.links || [], 0, prefix.length, 0),
        ...retain(
          last.links || [],
          tailStart,
          (last.text || "").length,
          prefix.length,
        ),
      ],
    };
    blocks.splice(index, 0, b);
    selected.clear();
    anchor = b.id;
    cellRect = null;
    render();
    const el = editor.querySelector('[data-id="' + b.id + '"] .doc-text');
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }
  function handleEditorDocumentKey(e) {
    const sel = window.getSelection();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      allDocumentSelected = true;
      sectionSelection = false;
      textSelections = [];
      selected = new Set(blocks.map((b) => b.id));
      cellRect = null;
      const range = document.createRange();
      range.selectNodeContents(editor);
      sel.removeAllRanges();
      sel.addRange(range);
      selection();
      return;
    }
    if (!["Delete", "Backspace"].includes(e.key)) return;
    if (sectionSelection && selected.size) {
      e.preventDefault();
      save();
      blocks = blocks.filter((b) => !selected.has(b.id));
      selected.clear();
      textSelections = [];
      sectionSelection = false;
      render();
      focusBlank();
      return;
    }
    if (allDocumentSelected) {
      e.preventDefault();
      save();
      blocks = [];
      selected.clear();
      cellRect = null;
      allDocumentSelected = false;
      render();
      focusBlank();
      return;
    }
    if (selectedRects().length > 1) {
      e.preventDefault();
      save();
      const sets = new Map();
      for (const rect of selectedRects()) {
        const cells = sets.get(rect.id) || new Set();
        for (let r = rect.r1; r <= rect.r2; r++)
          for (let c = rect.c1; c <= rect.c2; c++) cells.add(r + ":" + c);
        sets.set(rect.id, cells);
      }
      for (const [id, cells] of sets) {
        const b = blockById(id);
        if (cells.size === b.rows.reduce((n, r) => n + r.length, 0)) {
          blocks = blocks.filter((b) => b.id !== id);
          continue;
        }
        const o = tableOptions(b);
        for (const key of cells) {
          const [r, c] = key.split(":").map(Number);
          b.rows[r][c] = "";
          for (const name of ["cellMarks", "cellLinks", "cellImages"])
            delete o[name]?.[key];
        }
      }
      extraRects = [];
      rowRects.clear();
      wholeTables.clear();
      cellRect = null;
      selected.clear();
      render();
      focusBlank();
      return;
    }
    if (cellRect) {
      const b = blockById(cellRect.id);
      if (
        b &&
        cellRect.r1 === 0 &&
        cellRect.c1 === 0 &&
        cellRect.r2 === b.rows.length - 1 &&
        cellRect.c2 >= Math.max(...b.rows.map((r) => r.length)) - 1
      ) {
        e.preventDefault();
        save();
        const index = blocks.indexOf(b);
        blocks.splice(index, 1);
        cellRect = null;
        selected.clear();
        textSelections = [];
        render();
        const next = blocks[index] || blocks[index - 1];
        if (next) focusDocumentPoint(next.id, 0);
        else focusBlank();
        return;
      }
    }
    if (
      textSelections.length &&
      (multiTextSelection || !sel || sel.isCollapsed)
    ) {
      e.preventDefault();
      deleteTextPoints();
      return;
    }
    if (sel?.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0),
        a = range.startContainer.parentElement?.closest(".doc-text,td"),
        z = range.endContainer.parentElement?.closest(".doc-text,td");
      e.preventDefault();
      if (a?.tagName === "TD" && z?.tagName === "TD") {
        textSelections = textPoints(range);
        deleteTextPoints();
      } else deleteAcrossRange(range);
      return;
    }
    if (cellRect) {
      e.preventDefault();
      save();
      const b = blockById(cellRect.id),
        o = tableOptions(b);
      for (let r = cellRect.r1; r <= cellRect.r2; r++)
        for (let c = cellRect.c1; c <= cellRect.c2; c++) {
          b.rows[r][c] = "";
          delete o.cellLinks?.[r + ":" + c];
          delete o.cellMarks?.[r + ":" + c];
          delete o.cellImages?.[r + ":" + c];
        }
      render();
      return;
    }
    if (deleteDocumentBoundary(e, sel)) return;
    const empty = e.target.closest(".doc-text");
    if (empty && !empty.textContent) {
      e.preventDefault();
      save();
      const id = empty.closest(".doc-block").dataset.id,
        index = blocks.findIndex((b) => b.id === id),
        previous = blocks[index - 1]?.id || "",
        next = blocks[index + 1]?.id;
      blocks = blocks.filter((b) => b.id !== id);
      render();
      if (next) focusDocumentPoint(next, 0);
      else if (previous)
        focusDocumentPoint(previous, (blockById(previous)?.text || "").length);
      else focusBlank();
      return;
    }
    if (activeImage && selected.size) {
      e.preventDefault();
      save();
      blocks = blocks.filter((b) => !selected.has(b.id));
      selected.clear();
      anchor = null;
      render();
      focusBlank();
    }
  }
  document.addEventListener(
    "keydown",
    (e) => {
      const target = e.target,
        sel = window.getSelection(),
        range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const editableControl = target.closest?.("input,textarea,select,dialog");
      if (editableControl && !editor.contains(target)) return;
      const inEditor = editor.contains(target),
        selectionInEditor =
          range &&
          editor.contains(range.startContainer) &&
          editor.contains(range.endContainer);
      if (
        inEditor ||
        selectionInEditor ||
        (lastEditorIntent && target === document.body)
      )
        handleEditorDocumentKey(e);
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    (e) => {
      if (editor.contains(e.target)) {
        lastEditorIntent = true;
      } else if (e.target.closest?.("#source,.document-library"))
        lastEditorIntent = false;
    },
    true,
  );
  editor.addEventListener("contextmenu", (e) => {
    const at = cellAt(e.target),
      el = e.target.closest(".doc-block");
    if (!el) return;
    anchor = el.dataset.id;
    if (at) {
      if (
        selectedRects().some(
          (r) =>
            r.id === at.id &&
            at.r >= r.r1 &&
            at.r <= r.r2 &&
            at.c >= r.c1 &&
            at.c <= r.c2,
        )
      ) {
        selection();
        paintCells();
        return;
      }
      if (
        !cellRect ||
        cellRect.id !== at.id ||
        at.r < cellRect.r1 ||
        at.r > cellRect.r2 ||
        at.c < cellRect.c1 ||
        at.c > cellRect.c2
      )
        cellRect = { id: at.id, r1: at.r, r2: at.r, c1: at.c, c2: at.c };
      selected = new Set([at.id]);
      paintCells();
    } else if (!selected.has(anchor)) {
      selected.clear();
      cellRect = null;
    }
    selection();
  });

  function readMarks(el) {
    const out = [];
    for (const n of el.querySelectorAll(
      "span[style],font[style],b,strong,i,em,u,s,strike",
    )) {
      const s = n.style,
        style = {};
      if (/^(B|STRONG)$/.test(n.tagName)) style.bold = true;
      if (/^(I|EM)$/.test(n.tagName)) style.italic = true;
      if (n.tagName === "U") style.underline = true;
      if (/^(S|STRIKE)$/.test(n.tagName)) style.strike = true;
      if (s.letterSpacing && Number.isFinite(parseFloat(s.letterSpacing)))
        style.letterSpacing = parseFloat(s.letterSpacing);
      if (s.fontStretch && Number.isFinite(parseFloat(s.fontStretch)))
        style.fontScale = parseFloat(s.fontStretch);
      if (s.color) style.color = rgbHex(s.color);
      if (s.backgroundColor) style.background = rgbHex(s.backgroundColor);
      if (s.fontSize) style.fontSize = parseFloat(s.fontSize);
      if (s.fontFamily)
        style.fontFamily = s.fontFamily
          .split(",")[0]
          .replace(/["']/g, "")
          .trim();
      if (s.fontWeight)
        style.bold = s.fontWeight === "bold" || +s.fontWeight >= 600;
      if (s.fontStyle) style.italic = s.fontStyle === "italic";
      if (s.textDecoration || s.textDecorationLine) {
        const d = s.textDecoration || s.textDecorationLine;
        style.underline = d.includes("underline");
        style.strike = d.includes("line-through");
      }
      if (!Object.keys(style).length) continue;
      const r = document.createRange();
      r.selectNodeContents(el);
      r.setEndBefore(n);
      const start = readEditorText(r.cloneContents()).length;
      out.push({ start, end: start + readEditorText(n).length, style });
    }
    const edges = [...new Set(out.flatMap((m) => [m.start, m.end]))].sort(
        (a, b) => a - b,
      ),
      merged = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const start = edges[i],
        end = edges[i + 1],
        style = {};
      if (end <= start) continue;
      for (const m of out)
        if (m.start <= start && m.end >= end) Object.assign(style, m.style);
      if (!Object.keys(style).length) continue;
      const last = merged.at(-1);
      if (
        last &&
        last.end === start &&
        JSON.stringify(last.style) === JSON.stringify(style)
      )
        last.end = end;
      else merged.push({ start, end, style });
    }
    return merged;
  }
  function rgbHex(value) {
    if (/^#[a-f\d]{6}$/i.test(value)) return value;
    const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m
      ? "#" +
          m
            .slice(1)
            .map((v) => (+v).toString(16).padStart(2, "0"))
            .join("")
      : "transparent";
  }
  function textPoints(range) {
    const result = [];
    for (const content of editor.querySelectorAll(
      ".doc-text,td:not([data-repeat])",
    )) {
      if (
        content.closest("[data-pagination]") ||
        !range.intersectsNode(content)
      )
        continue;
      const b = content.closest(".doc-block");
      if (!b) continue;
      const startRange = range.cloneRange();
      startRange.selectNodeContents(content);
      let start = 0,
        end = readEditorText(content).length;
      if (content.contains(range.startContainer)) {
        startRange.setEnd(range.startContainer, range.startOffset);
        start = readEditorText(startRange.cloneContents()).length;
      }
      if (content.contains(range.endContainer)) {
        const r = range.cloneRange();
        r.selectNodeContents(content);
        r.setEnd(range.endContainer, range.endOffset);
        end = readEditorText(r.cloneContents()).length;
      }
      if (end > start)
        result.push({
          id: b.dataset.id,
          key:
            content.tagName === "TD"
              ? cellRow(content) + ":" + cellCol(content)
              : null,
          start,
          end,
        });
    }
    return result;
  }
  function pointsToRange(p) {
    const el = [...editor.children].find((el) => el.dataset.id === p.id);
    if (!el) return null;
    const [r, c] = (p.key || "").split(":").map(Number),
      content = p.key ? getModelCell(el, r, c) : el.querySelector(".doc-text");
    if (!content) return null;
    const walker = document.createTreeWalker(content, 4);
    let n,
      offset = 0,
      start = null,
      end = null;
    while ((n = walker.nextNode())) {
      const next = offset + n.nodeValue.length;
      if (start === null && p.start >= offset && p.start <= next)
        start = [n, p.start - offset];
      if (p.end >= offset && p.end <= next) {
        end = [n, p.end - offset];
        break;
      }
      offset = next;
    }
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(...start);
    range.setEnd(...end);
    return range;
  }
  function paintTextSelections() {
    if (window.CSS?.highlights && window.Highlight) {
      const ranges = textSelections.map(pointsToRange).filter(Boolean);
      CSS.highlights.set("editor-multiselection", new Highlight(...ranges));
    }
  }
  editor.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) return;
      if (!e.ctrlKey && !e.metaKey) {
        textSelections = [];
        sectionSelection = false;
        paintTextSelections();
      }
    },
    true,
  );
  editor.addEventListener("mouseup", (e) => {
    if (e.button === 2 || cellDragging || cellRect) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const points = textPoints(range);
    if (!points.length) return;
    multiTextSelection = !!(e.ctrlKey || e.metaKey);
    textSelections =
      e.ctrlKey || e.metaKey ? [...textSelections, ...points] : points;
    textSelections = textSelections.filter(
      (p, i, a) =>
        a.findIndex(
          (q) =>
            q.id === p.id &&
            q.key === p.key &&
            q.start === p.start &&
            q.end === p.end,
        ) === i,
    );
    sectionSelection = false;
    selected = new Set(textSelections.map((p) => p.id));
    selection();
    paintTextSelections();
  });
  function selectedTextPoints() {
    if (selectedRects().length && !allDocumentSelected && !sectionSelection) {
      const points = new Map();
      for (const rect of selectedRects()) {
        const b = blockById(rect.id);
        for (let r = rect.r1; r <= rect.r2; r++)
          for (let c = rect.c1; c <= rect.c2; c++)
            points.set(rect.id + ":" + r + ":" + c, {
              id: rect.id,
              key: r + ":" + c,
              start: 0,
              end: b.rows[r][c].length,
            });
      }
      return [...points.values()];
    }
    if (allDocumentSelected || sectionSelection) {
      const out = [];
      for (const b of blocks.filter((b) => selected.has(b.id))) {
        if (b.kind === "table")
          b.rows.forEach((r, ri) =>
            r.forEach((text, ci) =>
              out.push({
                id: b.id,
                key: ri + ":" + ci,
                start: 0,
                end: text.length,
              }),
            ),
          );
        else if (b.kind !== "image")
          out.push({ id: b.id, key: null, start: 0, end: b.text.length });
      }
      return out;
    }
    if (textSelections.length) {
      textSelections = textSelections.filter((p) => blockById(p.id));
      if (textSelections.length) return textSelections;
    }
    const sel = window.getSelection();
    return sel?.rangeCount &&
      !sel.isCollapsed &&
      editor.contains(sel.getRangeAt(0).commonAncestorContainer)
      ? textPoints(sel.getRangeAt(0))
      : [];
  }
  function pointStyle(p, offset = p.start) {
    const b = blockById(p.id);
    if (!b) return { ...baseStyle };
    const st = { ...baseStyle, ...b.style };
    if (p.key) {
      for (const k of ["fontFamily", "fontSize", "lineHeight"])
        if (b.tableOptions?.[k] !== undefined) st[k] = b.tableOptions[k];
      Object.assign(st, b.tableOptions?.cellStyles?.[p.key]);
      const row = +p.key.split(":")[0];
      if (st.bold === undefined)
        st.bold = !!(
          (b.headerRows || []).includes(row) ||
          ((b.tableOptions?.header ?? opts().header) && row === 0)
        );
    } else if (st.bold === undefined) st.bold = b.kind === "heading";
    const marks = p.key ? b.tableOptions?.cellMarks?.[p.key] : b.marks;
    for (const m of marks || [])
      if (
        m.start <= offset &&
        (m.end > offset || (p.start === p.end && m.end === offset))
      )
        Object.assign(st, m.style);
    return st;
  }
  function selectedFormatValue(key) {
    const points = selectedTextPoints();
    return (
      points.length > 0 &&
      points.every((p) => {
        const b = blockById(p.id),
          marks = p.key ? b.tableOptions?.cellMarks?.[p.key] : b.marks,
          edges = [
            p.start,
            ...(marks || [])
              .flatMap((m) => [m.start, m.end])
              .filter((x) => x > p.start && x < p.end),
          ];
        return edges.every((x) => !!pointStyle(p, x)[key]);
      })
    );
  }
  function emitTextStyle() {
    const points = selectedTextPoints().filter((p) => blockById(p.id));
    let p = points[0];
    if (!p && insertionPoint?.id && blockById(insertionPoint.id))
      p = {
        ...insertionPoint,
        start: insertionPoint.offset || 0,
        end: insertionPoint.offset || 0,
      };
    if (!p) return;
    const styles = points.length
      ? points.flatMap((p) => {
          const b = blockById(p.id),
            marks = p.key ? b.tableOptions?.cellMarks?.[p.key] : b.marks;
          return [
            p.start,
            ...(marks || [])
              .flatMap((m) => [m.start, m.end])
              .filter((x) => x > p.start && x < p.end),
          ].map((x) => pointStyle(p, x));
        })
      : [pointStyle(p)];
    document.dispatchEvent(
      new CustomEvent("editor-text-style", {
        detail: {
          ...styles[0],
          mixedSize: new Set(styles.map((s) => s.fontSize || 10)).size > 1,
          mixedFont:
            new Set(styles.map((s) => s.fontFamily || "휴먼명조")).size > 1,
        },
      }),
    );
  }
  editor.addEventListener("keyup", emitTextStyle);
  editor.addEventListener("focusin", () => queueMicrotask(emitTextStyle));
  editor.addEventListener("mouseup", () => queueMicrotask(emitTextStyle));
  function keepTextSelection(points) {
    textSelections = points;
    emitTextStyle();
    if (!points.length || selectedRects().length) return;
    const first = pointsToRange(points[0]),
      last = pointsToRange(points.at(-1));
    if (!first || !last) return;
    const target =
      first.startContainer.nodeType === 1
        ? first.startContainer
        : first.startContainer.parentElement;
    target.closest(".doc-text,.table-content")?.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.setBaseAndExtent(
      first.startContainer,
      first.startOffset,
      last.endContainer,
      last.endOffset,
    );
  }

  function adjustSelectedCharacter(key, delta) {
    const points = selectedTextPoints();
    if (!points.length)
      return status("글자 또는 셀을 먼저 선택해 주세요.", true);
    save();
    for (const p of points) {
      const b = blockById(p.id),
        o = p.key ? tableOptions(b) : null;
      if (o) o.cellMarks ||= {};
      const marks = p.key ? (o.cellMarks[p.key] ||= []) : (b.marks ||= []),
        edges = [
          ...new Set([
            p.start,
            p.end,
            ...marks
              .flatMap((m) => [m.start, m.end])
              .filter((x) => x > p.start && x < p.end),
          ]),
        ].sort((a, b) => a - b),
        updates = [];
      for (let i = 0; i < edges.length - 1; i++) {
        const st = pointStyle(p, edges[i]),
          old =
            st[key] ??
            (key === "fontSize" ? 10 : key === "fontScale" ? 100 : 0),
          next =
            key === "letterSpacing"
              ? old + (delta * (st.fontSize || 10) * 4) / 300
              : old + delta;
        updates.push({
          start: edges[i],
          end: edges[i + 1],
          style: {
            [key]:
              key === "fontSize"
                ? Math.max(8, Math.min(36, next))
                : key === "fontScale"
                  ? Math.max(50, Math.min(200, next))
                  : Math.max(-10, Math.min(30, +next.toFixed(5))),
          },
        });
      }
      marks.push(...updates);
      if (!p.end && o) {
        o.cellStyles ||= {};
        const st = pointStyle(p);
        o.cellStyles[p.key] = {
          ...o.cellStyles[p.key],
          [key]:
            (st[key] ??
              (key === "fontScale" ? 100 : key === "fontSize" ? 10 : 0)) +
            delta,
        };
      }
    }
    render();
    keepTextSelection(points);
  }

  function applyCharacterStyle(style) {
    const points = selectedTextPoints();
    if (!points.length) {
      status(
        "글자를 드래그하여 선택해 주세요. 전체 적용은 Ctrl+A를 사용하세요.",
        true,
      );
      return;
    }
    save();
    for (const p of points) {
      const b = blockById(p.id);
      if (!b) continue;
      let marks;
      if (p.key) {
        const o = tableOptions(b);
        o.cellMarks ||= {};
        marks = o.cellMarks[p.key] ||= [];
      } else {
        marks = b.marks ||= [];
        const legacy = {};
        for (const k of [
          "bold",
          "italic",
          "underline",
          "strike",
          "color",
          "background",
          "fontSize",
          "fontFamily",
        ])
          if (b.style?.[k] !== undefined) {
            legacy[k] = b.style[k];
            delete b.style[k];
          }
        if (Object.keys(legacy).length)
          marks.unshift({ start: 0, end: b.text.length, style: legacy });
      }
      marks.push({ start: p.start, end: p.end, style: { ...style } });
    }
    textSelections = points;
    render();
    keepTextSelection(points);
  }
  function applyColor(key, value) {
    applyCharacterStyle({ [key]: value });
    if (/^#[a-f\d]{6}$/i.test(value)) {
      recentColors = [
        { key, color: value },
        ...recentColors.filter((c) => c.key !== key || c.color !== value),
      ].slice(0, 12);
      document.dispatchEvent(
        new CustomEvent("editor-recent-colors", { detail: recentColors }),
      );
      document.dispatchEvent(
        new CustomEvent("editor-color-pairs", { detail: colorPairs }),
      );
      document.dispatchEvent(new Event("editor-content-changed"));
    }
  }
  function showColorPicker(key) {
    if (!selectedTextPoints().length)
      return status("색을 바꿀 글자를 먼저 선택해 주세요.", true);
    document.querySelector(".inline-color-popover")?.remove();
    const pop = document.createElement("div");
    pop.className = "inline-color-popover";
    const label = document.createElement("span");
    label.textContent =
      key === "background" ? "선택한 글자 강조색" : "선택한 글자색";
    const input = document.createElement("input");
    input.type = "color";
    input.value =
      recentColors.find((c) => c.key === key)?.color ||
      (key === "background" ? "#fff2cc" : "#000000");
    input.setAttribute("aria-label", "선택 글자 색상");
    input.onchange = () => {
      applyColor(key, input.value);
      pop.remove();
    };
    pop.append(label, input);
    for (const c of recentColors.filter((c) => c.key === key)) {
      const b = document.createElement("button");
      b.className = "color-swatch";
      b.style.background = c.color;
      b.title = c.color;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => {
        applyColor(key, c.color);
        pop.remove();
      };
      pop.append(b);
    }
    const none = document.createElement("button");
    none.textContent = "색 없음";
    none.onclick = () => {
      applyColor(key, key === "background" ? "transparent" : "#000000");
      pop.remove();
    };
    const close = document.createElement("button");
    close.textContent = "닫기";
    close.onclick = () => pop.remove();
    pop.append(none, close);
    document.body.append(pop);
    const button = document.querySelector(
        '[aria-label="' + (key === "background" ? "배경색" : "글자색") + '"]',
      ),
      rect = button?.getBoundingClientRect();
    pop.style.left =
      Math.max(4, Math.min(rect?.left || 20, innerWidth - 345)) + "px";
    pop.style.top = (rect?.bottom || 60) + "px";
  }
  for (const id of ["fontSize", "lineHeight", "paragraphGap"])
    $(id).addEventListener(
      "change",
      (e) => {
        e.stopImmediatePropagation();
        if (id === "fontSize")
          applyCharacterStyle({
            fontSize: Math.max(8, Math.min(36, +$(id).value || 10)),
          });
        else {
          const normalized=id==="lineHeight"?Math.max(1,Math.min(2,+$(id).value||1.5)):Math.max(0,Math.min(24,+$(id).value||0));
          save();$(id).value=normalized;baseStyle[id]=normalized;
          for(const b of blocks){
            if(b.kind==="image")continue;
            if(b.kind==="table"){
              if(id==="lineHeight"){
                const options=tableOptions(b);options.lineHeight=normalized;
                for(const st of Object.values(options.cellStyles || {})){st.lineHeight=normalized;delete st.lineHeightPt;}
              }
              continue;
            }
            b.style ||= {};b.style[id]=normalized;
            if(id==="lineHeight")delete b.style.lineHeightPt;
          }
          render();status((id==="lineHeight"?"줄 간격 ":"문단 간격 ")+normalized+(id==="paragraphGap"?"pt":"")+" · 문서 전체 적용");
        }
      },
      true,
    );

  function deleteTextPoints() {
    const points = [...textSelections];
    save();
    const groups = new Map();
    for (const p of points) {
      const key = p.id + "|" + (p.key || "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const list of groups.values()) {
      const p = list[0],
        b = blockById(p.id);
      if (!b) continue;
      const o = p.key ? tableOptions(b) : b,
        [r, c] = (p.key || "").split(":").map(Number);
      let text = p.key ? b.rows[r][c] : b.text,
        marks = p.key ? o.cellMarks?.[p.key] || [] : b.marks || [],
        links = p.key ? o.cellLinks?.[p.key] || [] : b.links || [];
      const merged = [];
      for (const q of list.sort((a, b) => a.start - b.start)) {
        const last = merged.at(-1);
        if (last && q.start <= last.end) last.end = Math.max(last.end, q.end);
        else merged.push({ ...q });
      }
      for (const q of merged.reverse()) {
        const map = (v) =>
          v <= q.start ? v : v >= q.end ? v - (q.end - q.start) : q.start;
        text = text.slice(0, q.start) + text.slice(q.end);
        for (const ranges of [marks, links])
          for (const a of ranges) {
            a.start = map(a.start);
            a.end = map(a.end);
          }
        marks = marks.filter((a) => a.end > a.start);
        links = links.filter((a) => a.end > a.start);
      }
      if (p.key) {
        b.rows[r][c] = text;
        o.cellMarks ||= {};
        o.cellLinks ||= {};
        o.cellMarks[p.key] = marks;
        o.cellLinks[p.key] = links;
      } else {
        b.text = text;
        b.marks = marks;
        b.links = links;
      }
    }
    textSelections = [];
    selected.clear();
    render();
  }

  function focusDocumentPoint(id, offset = 0) {
    const block = [...editor.children].find((el) => el.dataset.id === id),
      point = block?.querySelector(".doc-text,td");
    if (!point) {
      block?.focus();
      return;
    }
    if (point.tagName === "TD") point.closest(".table-content").focus();
    else point.focus();
    const range = document.createRange(),
      walker = document.createTreeWalker(point, 4);
    let n,
      left = offset,
      found = false;
    while ((n = walker.nextNode())) {
      if (left <= n.nodeValue.length) {
        range.setStart(n, left);
        range.collapse(true);
        found = true;
        break;
      }
      left -= n.nodeValue.length;
    }
    if (!found) {
      range.selectNodeContents(point);
      range.collapse(offset === 0);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    anchor = id;
    selected.clear();
    textSelections = [];
    sectionSelection = false;
    selection();
  }
  function deleteDocumentBoundary(e, sel) {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.shiftKey ||
      (sel && !sel.isCollapsed)
    )
      return false;
    const slot = e.target.closest(".insert-slot");
    if (slot && !slot.textContent.trim()) {
      if (!blocks.length) return false;
      e.preventDefault();
      save();
      const previous = blockById(slot.dataset.after),
        index = previous ? blocks.indexOf(previous) : -1;
      if (previous) previous.gapAfterHidden = true;
      else baseStyle.leadingGapHidden = true;
      const target =
        e.key === "Backspace"
          ? previous || blocks[0]
          : blocks[index + 1] || previous;
      render();
      if (target)
        focusDocumentPoint(
          target.id,
          e.key === "Backspace" || index === blocks.length - 1
            ? (target.text || "").length
            : 0,
        );
      return true;
    }
    const content = e.target.closest(".doc-text");
    if (!content || !sel?.rangeCount) return false;
    const caret = sel.getRangeAt(0);
    if (!content.contains(caret.startContainer)) return false;
    const before = caret.cloneRange();
    before.selectNodeContents(content);
    before.setEnd(caret.startContainer, caret.startOffset);
    const offset = readEditorText(before.cloneContents()).length,
      id = content.closest(".doc-block").dataset.id,
      b = blockById(id),
      index = blocks.indexOf(b),
      back = e.key === "Backspace";
    if (!b.text.length) return false;
    if (back ? offset !== 0 : offset !== b.text.length) return false;
    const adjacent = blocks[index + (back ? -1 : 1)];
    if (!adjacent || adjacent.kind === "table" || adjacent.kind === "image")
      return false;
    e.preventDefault();
    save();
    const first = back ? adjacent : b,
      last = back ? b : adjacent,
      length = first.text.length;
    first.text += last.text;
    for (const key of ["marks", "links"])
      first[key] = [
        ...(first[key] || []),
        ...(last[key] || []).map((m) => ({
          ...m,
          start: m.start + length,
          end: m.end + length,
        })),
      ];
    if (last.gapAfterHidden) first.gapAfterHidden = true;
    else delete first.gapAfterHidden;
    blocks.splice(blocks.indexOf(last), 1);
    render();
    focusDocumentPoint(first.id, length);
    return true;
  }

  function shiftTextRanges(b, remove, add) {
    for (const key of ["marks", "links"])
      b[key] = (b[key] || [])
        .map((m) => ({
          ...m,
          start: Math.max(0, m.start - remove) + add,
          end: Math.max(0, m.end - remove) + add,
        }))
        .filter((m) => m.end > m.start);
  }
  function materializeText() {
    const pending = blocks.map((b) => ({ ...b, literal: false })),
      labels = D.labels(pending, mode, activeSteps);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === "table" || b.kind === "image" || b.literal) continue;
      const prefix =
        b.level === null
          ? ""
          : " ".repeat(b.level * 2) +
            labels[i] +
            " ";
      if (prefix) {
        b.text = prefix + (b.text || "");
        b.hierarchyPrefix = prefix;
        shiftTextRanges(b, 0, prefix.length);
      }
      b.literal = true;
      b.hierarchySpacingNormalized = true;
    }
  }
  function removeHierarchyText(b) {
    const exact =
        b.hierarchyPrefix && b.text.startsWith(b.hierarchyPrefix)
          ? b.hierarchyPrefix
          : null,
      match = b.text.match(
        /^[ \u00a0]*(?:\d+[.)]|[가-하][.)]|[•●▪-])(?:[ \u00a0]+)/,
      ),
      prefix = exact || match?.[0] || b.text.match(/^[ \u00a0]+/)?.[0] || "";
    if (prefix) {
      b.text = b.text.slice(prefix.length);
      shiftTextRanges(b, prefix.length, 0);
    }
    delete b.hierarchyPrefix;
    b.literal = true;
  }
  function applyHierarchyText() {
    const list = blocks.filter(
        (b) =>
          selected.has(b.id) &&
          b.kind !== "table" &&
          b.kind !== "image" &&
          b.level !== null,
      ),
      labels = D.labels(
        list.map((b) => ({ ...b, literal: false })),
        mode,
        activeSteps,
      );
    list.forEach((b, i) => {
      removeHierarchyText(b);
      const prefix =
        " ".repeat(b.level * 2) +
        labels[i] +
        " ";
      b.text = prefix + b.text;
      shiftTextRanges(b, 0, prefix.length);
      b.hierarchyPrefix = prefix;
      b.literal = true;
      b.hierarchySpacingNormalized = true;
    });
  }

  function saveColorPair() {
    const p = selectedTextPoints()[0];
    if (!p) return status("조합으로 저장할 글자를 먼저 선택해 주세요.", true);
    pull();
    const b = blockById(p.id),
      marks = p.key ? b.tableOptions?.cellMarks?.[p.key] || [] : b.marks || [],
      style = {
        color: b.style?.color || "#000000",
        background: b.style?.background || "transparent",
      };
    for (const m of marks)
      if (m.start <= p.start && m.end > p.start) Object.assign(style, m.style);
    const pair = { color: style.color, background: style.background };
    colorPairs = [
      pair,
      ...colorPairs.filter(
        (p) => p.color !== pair.color || p.background !== pair.background,
      ),
    ].slice(0, 16);
    document.dispatchEvent(
      new CustomEvent("editor-color-pairs", { detail: colorPairs }),
    );
    document.dispatchEvent(new Event("editor-content-changed"));
    status("글자색·배경색 조합 저장됨");
  }
  // Split Enter into real paragraphs, so blank lines are deletable document lines.
  editor.addEventListener(
    "beforeinput",
    (e) => {
      if (
        !["insertParagraph", "insertLineBreak"].includes(e.inputType) ||
        e.isComposing
      )
        return;
      const activeSelection = window.getSelection(),
        focusElement =
          activeSelection?.focusNode?.nodeType === 1
            ? activeSelection.focusNode
            : activeSelection?.focusNode?.parentElement;
      const content =
        e.target.closest(".doc-text,.insert-slot") ||
        focusElement?.closest(".doc-text,.insert-slot");
      if (!content) return;
      const sel = activeSelection;
      if (!sel?.rangeCount || !sel.isCollapsed) return;
      e.preventDefault();
      save();
      if (content.matches(".insert-slot")) {
        const after = blockById(content.dataset.after),
          index = after ? blocks.indexOf(after) + 1 : 0,
          b = {
            id: "line" + Date.now(),
            kind: "paragraph",
            level: null,
            literal: true,
            text: "",
            style: surroundingStyle(content.dataset.after),
          };
        blocks.splice(index, 0, b);
        render();
        focusDocumentPoint(b.id, 0);
        return;
      }
      const b = blockById(content.closest(".doc-block").dataset.id),
        range = sel.getRangeAt(0).cloneRange();
      range.selectNodeContents(content);
      range.setEnd(sel.focusNode, sel.focusOffset);
      const at = readEditorText(range.cloneContents()).length,
        tail = {
          ...clone(b),
          id: "line" + Date.now() + Math.random().toString(36).slice(2),
          kind: "paragraph",
          level: null,
          literal: true,
          text: b.text.slice(at),
          style: insertionStyle({ id: b.id, offset: at }),
        };
      if (at === 0) b.style = { ...tail.style };
      for (const key of ["marks", "links"]) {
        tail[key] = (b[key] || [])
          .filter((m) => m.end > at)
          .map((m) => ({
            ...m,
            start: Math.max(0, m.start - at),
            end: m.end - at,
          }));
        b[key] = (b[key] || [])
          .filter((m) => m.start < at)
          .map((m) => ({ ...m, end: Math.min(at, m.end) }));
      }
      b.text = b.text.slice(0, at);
      b.gapAfterHidden = true;
      delete tail.hierarchyPrefix;
      blocks.splice(blocks.indexOf(b) + 1, 0, tail);
      render();
      focusDocumentPoint(tail.id, 0);
    },
    true,
  );
  function liveLinks(e) {
    if (e.isComposing) return;
    const content = e.target.closest?.(".doc-text");
    if (!content) return;
    const b = blockById(content.closest(".doc-block").dataset.id);
    if (
      !b ||
      (!D.autoLinks(b.text).length &&
        !content.querySelector("[data-auto-link]"))
    )
      return;
    const sel = window.getSelection(),
      range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    let offset = 0;
    if (range && content.contains(range.startContainer)) {
      const r = range.cloneRange();
      r.selectNodeContents(content);
      r.setEnd(range.startContainer, range.startOffset);
      offset = readEditorText(r.cloneContents()).length;
    }
    const html = D.inlineHTML(b);
    if (content.innerHTML !== html) {
      content.innerHTML = html;
      focusDocumentPoint(b.id, offset);
    }
  }
  editor.addEventListener("input", liveLinks);
  editor.addEventListener("compositionend", (e) => {
    pull();
    liveLinks(e);
  });
  (window.requestAnimationFrame || ((fn) => setTimeout(fn, 0)))(() => {
    if (
      !editor.contains(document.activeElement) &&
      document.activeElement === document.body
    )
      editor.querySelector(".insert-slot,.doc-text")?.focus();
  });

  document.addEventListener("editor-focus-start", () => {
    const first = blocks[0];
    if (first) focusDocumentPoint(first.id, 0);
    else editor.querySelector(".insert-slot")?.focus();
  });

  function readEditorText(node) {
    function walk(n) {
      if (n.nodeType === 3) return n.nodeValue;
      if (n.nodeType !== 1) return "";
      if (
        n.hasAttribute("data-pagination") ||
        n.hasAttribute("data-repeat") ||
        n.classList.contains("column-grip") ||
        n.classList.contains("image-grip")
      )
        return "";
      if (n.tagName === "BR")
        return n.hasAttribute("data-paragraph-break") ? "\u2029" : "\n";
      const value = [...n.childNodes].map(walk).join("");
      return (
        value +
        (/^(DIV|P)$/.test(n.tagName) &&
        n !== node &&
        [...n.parentNode.childNodes]
          .slice([...n.parentNode.childNodes].indexOf(n) + 1)
          .some((x) =>
            x.nodeType === 3
              ? x.textContent.length
              : x.nodeType === 1 &&
                !x.matches(
                  ".column-grip,.image-grip,[data-pagination],[data-repeat]",
                ),
          )
          ? "\n"
          : "")
      );
    }
    return [...node.childNodes].map(walk).join("");
  }
  function modelCells(root) {
    return [...root.querySelectorAll("td")].filter(
      (td) => !td.closest("[data-repeat],[data-pagination]"),
    );
  }
  function cellRow(td) {
    return +(td.dataset.cellRow ?? td.parentElement.rowIndex);
  }
  function cellCol(td) {
    return +(td.dataset.cellCol ?? td.cellIndex);
  }
  function getModelCell(root, r, c) {
    return modelCells(root).find(
      (td) => cellRow(td) === r && cellCol(td) === c,
    );
  }
  window.EditorDOM = {
    readText: readEditorText,
    cells: modelCells,
    row: cellRow,
    col: cellCol,
    cell: getModelCell,
  };
  document.addEventListener("editor-focus-position", (e) => {
    const p = e.detail;
    if (p.key) {
      const [r, c] = p.key.split(":").map(Number),
        el = [...editor.children].find((el) => el.dataset.id === p.id),
        point = getModelCell(el, r, c);
      if (point) {
        point.closest(".table-content").focus();
        const range = document.createRange();
        range.selectNodeContents(point);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        anchor = p.id;
        lastEditorIntent = true;
        rememberInsertion();
      }
    } else focusDocumentPoint(p.id, p.offset || 0);
  });

  function decodeFind(text) {
    return text.replace(
      /\^([plt^])/gi,
      (_, key) =>
        ({ p: "\u2029", l: "\n", t: "\t", "^": "^" })[key.toLowerCase()],
    );
  }
  function editTextBlockRange(firstId, lastId, start, end, value) {
    const first = blockById(firstId),
      last = blockById(lastId);
    if (!first || !last) return;
    const at = blocks.indexOf(first),
      tailAt = blocks.indexOf(last),
      prefix = first.text.slice(0, start),
      suffix = last.text.slice(end),
      parts = (prefix + value + suffix).split("\u2029"),
      created = [];
    const crop = (arr, a, z, shift) =>
      arr
        .filter((m) => m.end > a && m.start < z)
        .map((m) => ({
          ...m,
          start: Math.max(a, m.start) - a + shift,
          end: Math.min(z, m.end) - a + shift,
        }));
    parts.forEach((text, i) => {
      const b = {
        ...clone(i === parts.length - 1 && i ? last : first),
        id:
          i === 0
            ? first.id
            : i === parts.length - 1 && first !== last
              ? last.id
              : "replace" + Date.now() + Math.random().toString(36).slice(2),
        text,
        literal: true,
        marks: [],
        links: [],
      };
      const inherited = { ...first.style };
      for (const m of first.marks || [])
        if (m.start <= start && m.end > start)
          Object.assign(inherited, m.style);
      const replacementStart = i === 0 ? prefix.length : 0,
        replacementEnd =
          text.length - (i === parts.length - 1 ? suffix.length : 0);
      if (replacementEnd > replacementStart && Object.keys(inherited).length)
        b.marks.push({
          start: replacementStart,
          end: replacementEnd,
          style: inherited,
        });
      delete b.hierarchyPrefix;
      for (const key of ["marks", "links"]) {
        if (i === 0) b[key].push(...crop(first[key] || [], 0, start, 0));
        if (i === parts.length - 1)
          b[key].push(
            ...crop(
              last[key] || [],
              end,
              last.text.length,
              text.length - suffix.length,
            ),
          );
      }
      created.push(b);
    });
    blocks.splice(at, tailAt - at + 1, ...created);
  }
  function showFindReplace() {
    let dialog = $("findReplaceDialog");
    if (dialog) {
      dialog.querySelector("#findText").focus();
      return;
    }
    dialog = document.createElement("dialog");
    dialog.id = "findReplaceDialog";
    dialog.className = "find-replace-dialog";
    dialog.innerHTML =
      '<h2>찾기 · 바꾸기</h2><label>찾을 내용 <input id="findText" autocomplete="off"></label><label>바꿀 내용 <input id="replaceText" autocomplete="off" placeholder="공백과 ^p, ^l, ^t를 그대로 적용"></label><label>특수 문자 <select id="findSpecial"><option value="">선택하여 삽입</option><option value="^p">문단 나누기 (^p)</option><option value="^l">줄 바꾸기 (^l)</option><option value="^t">탭 (^t)</option><option value="^^">캐럿 문자 (^^)</option></select></label><p class="find-token-help">문단 나눔: ^p · 문단 안 줄바꿈: ^l · 탭: ^t · ^ 문자: ^^</p><div class="find-options"><label><input id="findCase" type="checkbox"> 대소문자 구분</label><label><input id="findSelection" type="checkbox"> Ctrl로 선택한 구간에서만</label></div><div class="find-actions"><button id="findNext">다음 찾기</button><button id="findAll">모두 찾기</button><button id="replaceOne">바꾸기</button><button id="replaceAll">모두 바꾸기</button><button id="findClose">닫기</button></div><p id="findStatus" role="status"></p><div id="findResults"></div>';
    document.body.append(dialog);
    let found = [],
      current = -1;
    const scope = new Set(selected);
    function groups() {
      const out = [];
      let current = [];
      function flush() {
        if (!current.length) return;
        let text = "",
          parts = [];
        current.forEach((b, i) => {
          if (i) text += "\u2029";
          const start = text.length;
          text += b.text;
          parts.push({ b, start, end: text.length });
        });
        out.push({ text, parts });
        current = [];
      }
      for (const b of blocks) {
        if ($("findSelection").checked && !scope.has(b.id)) {
          flush();
          continue;
        }
        if (b.kind === "table") {
          flush();
          b.rows.forEach((row, r) =>
            row.forEach((text, c) =>
              out.push({ text, cell: { b, key: r + ":" + c } }),
            ),
          );
        } else if (b.kind === "image") flush();
        else current.push(b);
      }
      flush();
      return out;
    }
    function location(g, position, end = false) {
      for (let i = 0; i < g.parts.length; i++) {
        const p = g.parts[i];
        if (position <= p.end)
          return { id: p.b.id, offset: Math.max(0, position - p.start) };
        if (position === p.end + 1 && i + 1 < g.parts.length)
          return { id: g.parts[i + 1].b.id, offset: 0 };
      }
      const p = g.parts.at(-1);
      return { id: p.b.id, offset: p.b.text.length };
    }
    function scan() {
      pull();
      const query = decodeFind($("findText").value);
      if (!query) {
        found = [];
        $("findStatus").textContent = "찾을 내용을 입력해 주세요.";
        return [];
      }
      const sensitive = $("findCase").checked,
        q = sensitive ? query : query.toLocaleLowerCase();
      found = [];
      for (const g of groups()) {
        const source = sensitive ? g.text : g.text.toLocaleLowerCase();
        let at = 0;
        while ((at = source.indexOf(q, at)) >= 0) {
          const end = at + query.length;
          found.push({
            g,
            start: at,
            end,
            from: g.cell ? null : location(g, at),
            to: g.cell ? null : location(g, end, true),
          });
          at += Math.max(1, query.length);
        }
      }
      $("findStatus").textContent = found.length + "곳 찾음";
      return found;
    }
    function show(i) {
      if (!found.length) return;
      current = (i + found.length) % found.length;
      const m = found[current],
        id = m.g.cell?.b.id || m.from.id,
        block = editor.querySelector('[data-id="' + id + '"]');
      block?.scrollIntoView?.({ block: "center" });
      $("findStatus").textContent =
        current +
        1 +
        " / " +
        found.length +
        " · " +
        m.g.text
          .slice(Math.max(0, m.start - 12), m.end + 20)
          .replace(/\u2029/g, " ¶ ")
          .replace(/\n/g, " ↵ ");
      if (window.CSS?.highlights && window.Highlight) {
        const range = pointsToRange({
          id,
          key: m.g.cell?.key || null,
          start: m.g.cell ? m.start : m.from.offset,
          end: m.g.cell
            ? m.end
            : m.from.id === m.to.id
              ? m.to.offset
              : m.from.offset,
        });
        CSS.highlights.set(
          "editor-find",
          new Highlight(...(range ? [range] : [])),
        );
      }
    }
    function replace(items) {
      if (!items.length) return;
      save();
      const value = decodeFind($("replaceText").value);
      for (const m of [...items].reverse()) {
        if (!m.g.cell) {
          editTextBlockRange(
            m.from.id,
            m.to.id,
            m.from.offset,
            m.to.offset,
            value,
          );
          continue;
        }
        const { b, key } = m.g.cell,
          [r, c] = key.split(":").map(Number),
          o = tableOptions(b),
          text = b.rows[r][c],
          replacement = value.replace(/\u2029/g, "\n"),
          delta = replacement.length - (m.end - m.start);
        for (const name of ["cellMarks", "cellLinks"])
          for (const x of o[name]?.[key] || []) {
            x.start =
              x.start <= m.start
                ? x.start
                : x.start >= m.end
                  ? x.start + delta
                  : m.start;
            x.end =
              x.end <= m.start
                ? x.end
                : x.end >= m.end
                  ? x.end + delta
                  : m.start + replacement.length;
          }
        b.rows[r][c] = text.slice(0, m.start) + replacement + text.slice(m.end);
      }
      render();
      $("findStatus").textContent =
        items.length + "곳 바꿈 · 공백·문단·줄바꿈 적용";
      current = -1;
      found = [];
      if (window.CSS?.highlights) CSS.highlights.delete("editor-find");
    }
    let tokenTarget = $("replaceText");
    for (const id of ["findText", "replaceText"])
      $(id).addEventListener("focus", () => (tokenTarget = $(id)));
    $("findSpecial").onchange = (e) => {
      const value = e.target.value;
      if (!value) return;
      const input = tokenTarget,
        start = input.selectionStart ?? input.value.length,
        end = input.selectionEnd ?? start;
      input.setRangeText(value, start, end, "end");
      e.target.value = "";
      input.focus();
    };
    $("findNext").onclick = () => {
      const prior = current;
      scan();
      show(prior + 1);
    };
    $("findAll").onclick = () => {
      scan();
      $("findResults").replaceChildren();
      for (const [i, m] of found.entries()) {
        const b = document.createElement("button");
        b.textContent =
          i +
          1 +
          ". " +
          m.g.text
            .slice(Math.max(0, m.start - 15), m.end + 30)
            .replace(/\u2029/g, " ¶ ")
            .replace(/\n/g, " ↵ ");
        b.onclick = () => show(i);
        $("findResults").append(b);
      }
      if (found.length) show(0);
    };
    $("replaceOne").onclick = () => {
      if (current < 0) {
        scan();
        current = 0;
      }
      replace(found[current] ? [found[current]] : []);
    };
    $("replaceAll").onclick = () => replace(scan());
    $("findClose").onclick = () => {
      if (window.CSS?.highlights) CSS.highlights.delete("editor-find");
      dialog.remove();
    };
    dialog.addEventListener("cancel", () => $("findClose").click());
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        $("findNext").click();
      }
    });
    dialog.showModal?.();
    $("findText").focus();
  }
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ["h", "f"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showFindReplace();
      }
    },
    true,
  );

  function hierarchyInfo(b) {
    if (!b || b.kind === "table" || b.kind === "image") return null;
    const m = b.text.match(
      /^([ \u00a0]*)(\d+[.)]|[가-하][.)]|[•●▪-])(?:[ \u00a0]+)/,
    );
    if (!m) return null;
    const official = blocks.some((b) =>
        /^[ \u00a0]*[가-하]\. /.test(b.text || ""),
      ),
      mark = m[2],
      rank = /^\d+\.$/.test(mark)
        ? 0
        : /^[가-하]\.$/.test(mark)
          ? 1
          : /^\d+\)$/.test(mark)
            ? official
              ? 2
              : 1
            : /^[가-하]\)$/.test(mark)
              ? 3
              : /^[•●▪]$/.test(mark)
                ? official
                  ? 4
                  : 2
                : official
                  ? 5
                  : 3;
    return {
      rank,
      indent: m[1].length,
      type: mark.replace(/\d+/, "n").replace(/[가-하]/, "k"),
    };
  }
  function shiftHierarchySpaces(direction) {
    const config = documentOptions.hierarchyIndent || {
        spaces: 2,
        group: true,
      },
      count = 2,
      chosen = selected.size ? [...selected] : anchor ? [anchor] : [];
    if (!chosen.length)
      return status(
        "공백 위치를 옮길 문단을 클릭하거나 Ctrl로 구간을 선택해 주세요.",
        true,
      );
    const move = new Set(chosen);
    if (config.group !== false)
      for (const id of chosen) {
        const index = blocks.findIndex((b) => b.id === id),
          info = hierarchyInfo(blocks[index]);
        if (!info) continue;
        let left = index,
          right = index;
        while (left > 0) {
          const prev = hierarchyInfo(blocks[left - 1]);
          if (
            prev &&
            (prev.rank < info.rank ||
              (prev.rank === info.rank && prev.type !== info.type))
          )
            break;
          left--;
        }
        while (right + 1 < blocks.length) {
          const next = hierarchyInfo(blocks[right + 1]);
          if (
            next &&
            (next.rank < info.rank ||
              (next.rank === info.rank && next.type !== info.type))
          )
            break;
          right++;
        }
        for (let i = left; i <= index; i++) {
          const h = hierarchyInfo(blocks[i]);
          if (h && h.rank === info.rank && h.type === info.type) {
            left = i;
            break;
          }
        }
        for (let i = left; i <= right; i++) {
          const b = blocks[i],
            h = hierarchyInfo(b);
          if ((h && h.rank >= info.rank) || (!h && i > left))
            if (b.kind !== "table" && b.kind !== "image") move.add(b.id);
        }
      }
    save();
    for (const b of blocks) {
      if (!move.has(b.id) || b.kind === "table" || b.kind === "image") continue;
      const remove =
          direction < 0
            ? Math.min(count, (b.text.match(/^[ \u00a0]*/) || [""])[0].length)
            : 0,
        add = direction > 0 ? count : 0;
      b.text = " ".repeat(add) + b.text.slice(remove);
      shiftTextRanges(b, remove, add);
      if (b.inlineImages)
        for (const img of b.inlineImages)
          img.offset = Math.max(0, img.offset - remove) + add;
      b.literal = true;
      b.spaceIndent = true;
      delete b.hierarchyPrefix;
    }
    render();
    status(
      move.size +
        "개 문단 · 번호 유지 · 공백 " +
        count +
        "칸 " +
        (direction > 0 ? "추가" : "제거"),
    );
  }

  const singleBorder = $("cellBorder").onchange;
  $("cellBorder").onchange = () => {
    const ranges = selectedRects(),
      style = $("cellBorder").value;
    if (ranges.length <= 1) return singleBorder();
    const initial = undo.length,
      original = cellRect,
      extras = extraRects,
      others = rowRects,
      whole = wholeTables;
    extraRects = [];
    rowRects = new Map();
    wholeTables = new Set();
    for (const rect of ranges) {
      cellRect = rect;
      $("cellBorder").value = style;
      singleBorder();
    }
    undo.splice(initial + 1);
    cellRect = original;
    extraRects = extras;
    rowRects = others;
    wholeTables = whole;
    paintCells();
  };
  let savedRowTemplates = [];
  fetch("row-styles")
    .then((r) => r.json())
    .then((v) => {
      savedRowTemplates = Array.isArray(v.templates) ? v.templates : [];
    })
    .catch(() => {});
  function selectedRowTargets(kind, scope = "rows") {
    const out = [];
    for (const b of blocks) {
      if (b.kind !== "table") continue;
      let rows = [];
      const rect = cellRect?.id === b.id ? cellRect : rowRects.get(b.id),
        rects = selectedRects().filter((r) => r.id === b.id);
      if (
        scope === "all" ||
        (scope === "tables" && (wholeTables.has(b.id) || selected.has(b.id)))
      )
        rows = [kind === "footer" ? b.rows.length - 1 : 0];
      else if (rects.length)
        rows = [
          ...new Set(
            rects.flatMap((rect) =>
              Array.from(
                { length: rect.r2 - rect.r1 + 1 },
                (_, i) => rect.r1 + i,
              ),
            ),
          ),
        ];
      else if (rowSelection.has(b.id)) rows = [...rowSelection.get(b.id)];
      if (rows.length) out.push({ b, rows });
    }
    return out;
  }
  function captureRowTemplate(kind) {
    pull();
    const target = selectedRowTargets(kind)[0];
    if (!target) return null;
    const { b, rows } = target,
      o = tableOptions(b),
      r = rows[0];
    return {
      kind,
      cells: b.rows[r].map((_, c) => {
        const key = r + ":" + c,
          st = {
            fontFamily: o.fontFamily || baseStyle.fontFamily,
            fontSize: o.fontSize || baseStyle.fontSize,
            padY: o.padY ?? +opts().padY,
            bold: true,
            background:
              "#" + String(o.headerBg || opts().headerBg).replace("#", ""),
            ...o.cellStyles?.[key],
          };
        const root = editor.querySelector('[data-id="' + b.id + '"]'),
          td = root && getModelCell(root, r, c);
        if (td) {
          for (const side of ["top", "bottom", "left", "right"]) {
            st[side] =
              td.style.getPropertyValue("border-" + side + "-style") || "none";
            st[side + "Width"] =
              parseFloat(
                td.style.getPropertyValue("border-" + side + "-width"),
              ) || 0;
          }
          st.padX = parseFloat(td.style.paddingLeft) || 0;
          st.padY = parseFloat(td.style.paddingTop) || 0;
          st.align = td.align || "center";
          st.valign = td.vAlign || "middle";
        }
        for (const m of o.cellMarks?.[key] || []) Object.assign(st, m.style);
        return st;
      }),
      height:
        o.rowHeights?.[r] ||
        Math.round(
          editor
            .querySelector(
              '[data-id="' + b.id + '"] tr[data-model-row="' + r + '"]',
            )
            ?.getBoundingClientRect().height || 0,
        ),
    };
  }
  function applyRowTemplate(template, targets, toggle = false) {
    if (!targets.length)
      return status("Ctrl로 적용할 행을 선택해 주세요.", true);
    save();
    for (const { b, rows } of targets) {
      const o = tableOptions(b);
      o.cellStyles ||= {};
      o.rowHeights ||= {};
      o.rowTemplateUndo ||= {};
      for (const r of rows) {
        const key = template.kind + ":" + r;
        if (toggle && o.rowTemplateUndo[key]) {
          const old = o.rowTemplateUndo[key];
          for (let c = 0; c < b.rows[r].length; c++) {
            const cell = r + ":" + c;
            if (old.cells[c] === null) delete o.cellStyles[cell];
            else o.cellStyles[cell] = old.cells[c];
          }
          if (old.height === null) delete o.rowHeights[r];
          else o.rowHeights[r] = old.height;
          b.headerRows = old.headerRows;
          if (old.marks) o.cellMarks = old.marks;
          for (const [k, st] of Object.entries(old.neighbors)) {
            if (st === null) delete o.cellStyles[k];
            else o.cellStyles[k] = st;
          }
          delete o.rowTemplateUndo[key];
          continue;
        }
        const old = {
          cells: b.rows[r].map((_, c) =>
            clone(o.cellStyles[r + ":" + c] || null),
          ),
          height: o.rowHeights[r] ?? null,
          marks: clone(o.cellMarks || {}),
          headerRows: clone(b.headerRows || []),
          neighbors: {},
        };
        o.rowTemplateUndo[key] ||= old;
        for (let c = 0; c < b.rows[r].length; c++) {
          const st = clone(
              template.cells[Math.min(c, template.cells.length - 1)],
            ),
            cell = r + ":" + c;
          o.cellStyles[cell] = { ...o.cellStyles[cell], ...st };
          if (o.cellMarks?.[cell])
            o.cellMarks[cell] = o.cellMarks[cell].map((m) => ({
              ...m,
              style: Object.fromEntries(
                Object.entries(m.style || {}).filter(
                  ([k]) => st[k] === undefined,
                ),
              ),
            }));
          for (const [nr, side, source] of [
            [r - 1, "bottom", "top"],
            [r + 1, "top", "bottom"],
          ])
            if (nr >= 0 && nr < b.rows.length) {
              const k = nr + ":" + c;
              old.neighbors[k] = clone(o.cellStyles[k] || null);
              o.cellStyles[k] = {
                ...o.cellStyles[k],
                [side]: st[source],
                [side + "Width"]: st[source + "Width"],
              };
            }
        }
        if (template.height) o.rowHeights[r] = template.height;
        b.headerRows = [...new Set([...(b.headerRows || []), r])];
      }
    }
    render();
    paintCells();
    status(targets.reduce((n, x) => n + x.rows.length, 0) + "개 행 서식 적용");
  }
  function applySavedCellTemplate(template) {
    const rects = selectedRects();
    if (!rects.length) return status("적용할 셀을 먼저 선택해 주세요.");
    save();
    const seen = new Set();
    for (const rect of rects) {
      const b = blockById(rect.id),
        o = tableOptions(b);
      o.cellStyles ||= {};
      for (let r = rect.r1; r <= rect.r2; r++)
        for (let c = rect.c1; c <= rect.c2; c++) {
          const key = r + ":" + c,
            token = b.id + "/" + key;
          if (seen.has(token)) continue;
          seen.add(token);
          const st = clone(
            template.cells[Math.min(c - rect.c1, template.cells.length - 1)],
          );
          o.cellStyles[key] = { ...o.cellStyles[key], ...st };
          if (o.cellMarks?.[key])
            o.cellMarks[key] = o.cellMarks[key].map((m) => ({
              ...m,
              style: Object.fromEntries(
                Object.entries(m.style || {}).filter(
                  ([k]) => st[k] === undefined,
                ),
              ),
            }));
        }
    }
    render();
    paintCells();
    status(seen.size + "개 선택 셀에 서식 적용");
  }
  function openSavedRowStyles(kind) {
    pull();
    $("rowStyleDialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "rowStyleDialog";
    const title = document.createElement("h2");
    title.textContent =
      (kind === "footer" ? "마지막 행" : "제목행") + " 서식 적용";
    const label = document.createElement("label");
    label.textContent = "저장된 양식 ";
    const preset = document.createElement("select");
    preset.id = "rowStylePreset";
    label.append(preset);
    const actions = document.createElement("div"),
      apply = document.createElement("button"),
      close = document.createElement("button"),
      message = document.createElement("p");
    apply.id = "rowStyleApply";
    apply.textContent = "적용";
    close.id = "rowStyleClose";
    close.textContent = "닫기";
    message.id = "rowStyleStatus";
    message.setAttribute("role", "status");
    const matching = savedRowTemplates.filter((t) => t.kind === kind);
    matching.forEach((t, i) => preset.append(new Option(t.name, String(i))));
    if (!matching.length) {
      preset.append(new Option("저장된 양식이 없습니다.", ""));
      preset.disabled = true;
      apply.disabled = true;
      message.textContent =
        "저장된 양식이 생기면 이 목록에서 선택할 수 있습니다.";
    }
    actions.append(apply, close);
    dialog.append(title, label, actions, message);
    document.body.append(dialog);
    apply.onclick = () => {
      if (!selectedRects().length) {
        message.textContent = "먼저 적용할 셀을 선택해 주세요.";
        return;
      }
      applySavedCellTemplate(clone(matching[+preset.value]));
      dialog.remove();
    };
    close.onclick = () => dialog.remove();
    dialog.showModal?.();
  }
  function openRowStyles(kind = "header", saveMode = false, cellsMode = false) {
    if (!saveMode) return openSavedRowStyles(kind);
    pull();
    document.getElementById("rowStyleDialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "rowStyleDialog";
    const label = kind === "footer" ? "마지막 행" : "제목행";
    dialog.innerHTML =
      "<h2>" +
      label +
      ' 양식</h2><label>양식 <select id="rowStylePreset"><option value="new">굵은 바깥선 · 얇은 이중선</option><option value="classic">기본 실선</option></select></label><label>적용 범위 <select id="rowStyleScope"><option value="cells">선택한 셀만</option><option value="rows">선택한 행</option><option value="tables">선택한 표</option><option value="all">문서의 모든 표</option></select></label><label>바깥선 두께 <input id="rowStyleWidth" type="number" value="2" min="0.5" max="8" step="0.5"> px</label><label>이중선 간격 <input id="rowStyleGap" type="number" value="1" min="1" max="6" step="0.5"> px</label><label>셀 배경 <input id="rowStyleBg" type="color" value="#dfeaf5"></label><label>양식 이름 <input id="rowStyleName" maxlength="80" placeholder="저장할 이름"></label><div><button id="rowStyleApply">적용</button> <button id="rowStyleSave">선택 행을 양식으로 저장</button> <button id="rowStyleClose">닫기</button></div><p id="rowStyleStatus" role="status"></p>';
    document.body.append(dialog);
    const preset = $("rowStylePreset"),
      matching = savedRowTemplates.filter((t) => t.kind === kind);
    matching.forEach((t, i) => preset.append(new Option(t.name, "saved" + i)));
    $("rowStyleScope").value = cellsMode
      ? "cells"
      : wholeTables.size
        ? "tables"
        : "rows";
    if (cellsMode) {
      $("rowStyleName").closest("label").hidden = true;
      $("rowStyleSave").hidden = true;
      if (matching.length) preset.value = "saved0";
    }
    function template() {
      if (preset.value.startsWith("saved"))
        return clone(matching[+preset.value.slice(5)]);
      const footer = kind === "footer",
        modern = preset.value === "new",
        width = +$("rowStyleWidth").value || 2,
        gap = +$("rowStyleGap").value || 1;
      return {
        kind,
        height: 0,
        cells: [
          {
            bold: true,
            background: $("rowStyleBg").value,
            top: modern && footer ? "double" : "solid",
            bottom: modern && !footer ? "double" : "solid",
            topWidth: modern ? (footer ? 2 + gap : width) : 1,
            bottomWidth: modern ? (footer ? width : 2 + gap) : 1,
          },
        ],
      };
    }
    $("rowStyleApply").onclick = () => {
      if ($("rowStyleScope").value === "cells")
        applySavedCellTemplate(template());
      else
        applyRowTemplate(
          template(),
          selectedRowTargets(kind, $("rowStyleScope").value),
        );
      dialog.remove();
    };
    $("rowStyleSave").onclick = async () => {
      try {
        const name = $("rowStyleName").value.trim(),
          t = captureRowTemplate(kind);
        if (!name || !t)
          throw Error("저장할 행을 선택하고 양식 이름을 입력해 주세요.");
        const next = [
          ...savedRowTemplates.filter(
            (v) => v.name !== name || v.kind !== kind,
          ),
          { ...t, name },
        ];
        const result = await fetch("row-styles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: next }),
        });
        if (!result.ok) throw Error("양식 저장에 실패했습니다.");
        savedRowTemplates = next;
        $("rowStyleStatus").textContent =
          "저장 완료 · 기존 표는 변경하지 않습니다.";
        matching.push(next.at(-1));
        preset.append(new Option(name, "saved" + (matching.length - 1)));
        preset.value = "saved" + (matching.length - 1);
      } catch (e) {
        $("rowStyleStatus").textContent = e.message;
      }
    };
    $("rowStyleClose").onclick = () => dialog.remove();
    dialog.showModal?.();
    if (saveMode) $("rowStyleName").focus();
  }
  document.addEventListener("editor-row-style", (e) =>
    openRowStyles(
      e.detail?.kind || "header",
      !!e.detail?.save,
      !!e.detail?.cells,
    ),
  );
  $("lastRowHeader").onclick = () => {
    const targets = selectedRowTargets("footer");
    const t = {
      kind: "footer",
      height: 0,
      cells: [
        {
          bold: true,
          background: opts().headerBg,
          top: "double",
          topWidth: 3,
          bottom: "solid",
          bottomWidth: 2,
        },
      ],
    };
    applyRowTemplate(t, targets, true);
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.target.closest?.("input,textarea,select,dialog")
      )
        return;
      const sel = window.getSelection(),
        node = sel?.focusNode,
        inside =
          editor.contains(e.target) ||
          (node && editor.contains(node)) ||
          (e.target === document.body &&
            lastEditorIntent &&
            (textSelections.length || selectedRects().length || anchor));
      if (!inside) return;
      const k = e.key.toLowerCase(),
        code = e.code,
        alt = e.altKey && e.shiftKey && !e.ctrlKey;
      let type = null,
        delta = 0;
      if (
        (e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          ["b", "i", "u"].includes(k)) ||
        (alt && ["b", "i", "u"].includes(k))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const key = { b: "bold", i: "italic", u: "underline" }[k];
        applyCharacterStyle({ [key]: !selectedFormatValue(key) });
        return;
      }
      if (
        e.ctrlKey &&
        !e.altKey &&
        (code === "BracketLeft" ||
          code === "BracketRight" ||
          k === "[" ||
          k === "]")
      ) {
        type = "fontSize";
        delta = code === "BracketLeft" || k === "[" ? -1 : 1;
      } else if (alt && ["e", "r", "n", "w", "j", "k", "l"].includes(k)) {
        type = ["e", "r"].includes(k)
          ? "fontSize"
          : ["n", "w"].includes(k)
            ? "letterSpacing"
            : "fontScale";
        delta = ["r", "n", "k"].includes(k) ? -1 : 1;
      }
      if (type) {
        e.preventDefault();
        e.stopImmediatePropagation();
        adjustSelectedCharacter(type, delta);
        return;
      }
      if (alt && k === "c") {
        e.preventDefault();
        applyCharacterStyle({
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          letterSpacing: 0,
          fontScale: 100,
        });
      }
    },
    true,
  );

  let f5Cell = null;
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.defaultPrevented ||
        e.target.closest?.("input,textarea,select,dialog")
      )
        return;
      const sel = window.getSelection(),
        focus =
          sel?.focusNode?.nodeType === 1
            ? sel.focusNode
            : sel?.focusNode?.parentElement;
      if (
        !editor.contains(e.target) &&
        !editor.contains(focus) &&
        !(
          e.target === document.body &&
          lastEditorIntent &&
          (textSelections.length || selectedRects().length || anchor)
        )
      )
        return;
      if (
        e.ctrlKey &&
        e.shiftKey &&
        ["l", "c", "r", "m"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        const align = { l: "left", c: "center", r: "right", m: "justify" }[
          e.key.toLowerCase()
        ];
        if (selectedRects().length) applyCells({ align });
        else paragraphStyle({ align });
        return;
      }
      if (
        e.ctrlKey &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        cellRect
      ) {
        e.preventDefault();
        const b = blockById(cellRect.id),
          origin =
            f5Cell?.id === b.id && f5Cell.stage === 1
              ? f5Cell
              : {
                  id: b.id,
                  r: cellRect.r1,
                  c: cellRect.c1,
                  stage: 1,
                  er: cellRect.r2,
                  ec: cellRect.c2,
                };
        origin.er = Math.max(
          0,
          Math.min(
            b.rows.length - 1,
            (origin.er ?? origin.r) +
              (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0),
          ),
        );
        origin.ec = Math.max(
          0,
          Math.min(
            b.rows[0].length - 1,
            (origin.ec ?? origin.c) +
              (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0),
          ),
        );
        cellRect = {
          id: b.id,
          r1: Math.min(origin.r, origin.er),
          r2: Math.max(origin.r, origin.er),
          c1: Math.min(origin.c, origin.ec),
          c2: Math.max(origin.c, origin.ec),
        };
        f5Cell = origin;
        paintCells();
        return;
      }
      if (e.key === "F5" && e.altKey) {
        const at = cellAt(focus || e.target) || cellAt(e.target),
          b = blockById(at?.id || cellRect?.id);
        if (!b || b.kind !== "table") return;
        e.preventDefault();
        if (!f5Cell || f5Cell.id !== b.id)
          f5Cell = {
            id: b.id,
            r: at?.r ?? cellRect?.r1 ?? 0,
            c: at?.c ?? cellRect?.c1 ?? 0,
            stage: 0,
          };
        f5Cell.stage = (f5Cell.stage % 4) + 1;
        const { r, c, stage } = f5Cell;
        f5Cell.er = r;
        f5Cell.ec = c;
        cellRect = {
          id: b.id,
          r1: stage >= 3 ? 0 : r,
          r2: stage >= 3 ? b.rows.length - 1 : r,
          c1: stage === 2 || stage === 4 ? 0 : c,
          c2: stage === 2 || stage === 4 ? b.rows[0].length - 1 : c,
        };
        selected = new Set(selectedRects().map((r) => r.id));
        sectionSelection = false;
        window.getSelection()?.removeAllRanges();
        editor
          .querySelector('[data-id="' + b.id + '"] .table-content')
          ?.focus();
        paintCells();
      }
    },
    true,
  );

  let formatBrush = null,
    commandPrefix = null,
    marginClickHandled = false;
  function currentCharacterPoint() {
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0),
        node =
          range.startContainer.nodeType === 1
            ? range.startContainer
            : range.startContainer.parentElement,
        el = node.closest?.(".doc-text,td");
      if (el && editor.contains(el)) {
        const before = range.cloneRange();
        before.selectNodeContents(el);
        before.setEnd(range.startContainer, range.startOffset);
        return {
          id: el.closest(".doc-block").dataset.id,
          key: el.tagName === "TD" ? cellRow(el) + ":" + cellCol(el) : null,
          start: readEditorText(before.cloneContents()).length,
          end: readEditorText(before.cloneContents()).length,
        };
      }
    }
    if (insertionPoint?.id)
      return {
        id: insertionPoint.id,
        key: insertionPoint.key,
        start: insertionPoint.offset || 0,
        end: insertionPoint.offset || 0,
      };
    return selectedTextPoints()[0];
  }
  function copyShape() {
    const points = selectedTextPoints();
    if (points.length && formatBrush) {
      applyCharacterStyle(clone(formatBrush));
      status("복사한 글자 모양 적용");
      return;
    }
    const p = currentCharacterPoint();
    if (!p) return status("복사할 글자에 커서를 놓아 주세요.", true);
    formatBrush = Object.fromEntries(
      Object.entries(pointStyle(p)).filter(([k]) =>
        [
          "fontFamily",
          "fontSize",
          "bold",
          "italic",
          "underline",
          "strike",
          "color",
          "background",
          "fontScale",
          "letterSpacing",
        ].includes(k),
      ),
    );
    status("글자 모양 복사됨 · 적용할 글자를 선택한 뒤 Alt+C");
  }
  document.addEventListener(
    "copy",
    (e) => {
      const sel = window.getSelection();
      if (!e.clipboardData || (!sel?.rangeCount && !selectedRects().length))
        return;
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (
        !editor.contains(e.target) &&
        !(range && editor.contains(range.commonAncestorContainer))
      )
        return;
      const points = selectedTextPoints();
      if (!points.length) return;
      pull();
      let copied = [];
      if (selectedRects().length) {
        for (const rect of selectedRects()) {
          const b = clone(blockById(rect.id));
          if (
            rect.r1 === 0 &&
            rect.c1 === 0 &&
            rect.r2 === b.rows.length - 1 &&
            rect.c2 === b.rows[0].length - 1
          ) {
            copied.push(b);
            continue;
          }
          b.rows = b.rows
            .slice(rect.r1, rect.r2 + 1)
            .map((row) => row.slice(rect.c1, rect.c2 + 1));
          for (const field of [
            "cellStyles",
            "cellMarks",
            "cellLinks",
            "cellImages",
          ]) {
            const values = {};
            for (let r = rect.r1; r <= rect.r2; r++)
              for (let c = rect.c1; c <= rect.c2; c++)
                if (b.tableOptions?.[field]?.[r + ":" + c])
                  values[r - rect.r1 + ":" + (c - rect.c1)] =
                    b.tableOptions[field][r + ":" + c];
            b.tableOptions ||= {};
            b.tableOptions[field] = values;
          }
          b.headerRows = (b.headerRows || [])
            .filter((r) => r >= rect.r1 && r <= rect.r2)
            .map((r) => r - rect.r1);
          delete b.tableOptions.merges;
          copied.push(b);
        }
      } else
        for (const p of points) {
          const b = blockById(p.id),
            text = p.key
              ? b.rows[+p.key.split(":")[0]][+p.key.split(":")[1]]
              : b.text,
            marks = p.key ? b.tableOptions?.cellMarks?.[p.key] : b.marks,
            links = p.key ? b.tableOptions?.cellLinks?.[p.key] : b.links,
            crop = (a) =>
              (a || [])
                .filter((m) => m.end > p.start && m.start < p.end)
                .map((m) => ({
                  ...m,
                  start: Math.max(p.start, m.start) - p.start,
                  end: Math.min(p.end, m.end) - p.start,
                }));
          copied.push({
            id: b.id,
            kind: "paragraph",
            literal: true,
            level: null,
            text: text.slice(p.start, p.end),
            style: pointStyle(p),
            marks: crop(marks),
            links: crop(links),
          });
        }
      const payload = D.convert(copied, opts(), measure);
      e.clipboardData.setData("text/html", payload.html);
      e.clipboardData.setData("text/plain", payload.text);
      e.preventDefault();
    },
    true,
  );
  function toggleMarks() {
    documentOptions.marks = !documentOptions.marks;
    editor.classList.toggle("editor-marks", documentOptions.marks);
    document.dispatchEvent(new Event("editor-content-changed"));
    status(documentOptions.marks ? "조판 부호 켜짐" : "조판 부호 꺼짐");
  }
  document.addEventListener("editor-options-restored", (e) =>
    editor.classList.toggle("editor-marks", !!e.detail.marks),
  );
  // The left margin selects a visual line; Ctrl adds other paragraphs without touching their text.
  editor.addEventListener(
    "mousedown",
    (e) => {
      if (!e.ctrlKey || e.target.closest("td,.table-content")) return;
      let el = e.target.closest(".doc-block");
      if (!el && e.target === editor) {
        const candidates = [
          ...editor.querySelectorAll(".doc-block:not(.table-block)"),
        ];
        el = candidates.find((n) => {
          const r = n.getBoundingClientRect();
          return (
            e.clientY >= r.top &&
            e.clientY <= r.bottom &&
            e.clientX <= r.left + 12
          );
        });
      }
      if (!el || e.target.closest(".doc-text")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      marginClickHandled = true;
      sectionSelection = true;
      const id = el.dataset.id;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchor = id;
      window.getSelection()?.removeAllRanges();
      selection();
    },
    true,
  );
  function extendText(e) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const node =
        sel.focusNode?.nodeType === 1
          ? sel.focusNode
          : sel.focusNode?.parentElement,
      host = node?.closest(".doc-text,td");
    if (!host || !editor.contains(host)) return;
    e.preventDefault();
    const backwards = ["ArrowLeft", "ArrowUp"].includes(e.key),
      vertical = ["ArrowUp", "ArrowDown"].includes(e.key),
      beforeNode = sel.focusNode,
      beforeOffset = sel.focusOffset;
    if (sel.modify)
      sel.modify(
        "extend",
        backwards ? "backward" : "forward",
        vertical ? "line" : "character",
      );
    if (
      !sel.modify ||
      (sel.focusNode === beforeNode && sel.focusOffset === beforeOffset)
    ) {
      const hosts = [
          ...editor.querySelectorAll(".doc-text,td:not([data-repeat])"),
        ],
        index = hosts.indexOf(host),
        walker = document.createTreeWalker(host, 4),
        texts = [];
      let n;
      while ((n = walker.nextNode())) texts.push(n);
      let at = 0;
      for (const t of texts) {
        if (t === sel.focusNode) {
          at += sel.focusOffset;
          break;
        }
        at += t.length;
      }
      let next = host,
        offset = at + (backwards ? -1 : 1);
      if (vertical || offset < 0 || offset > host.textContent.length) {
        next = hosts[index + (backwards ? -1 : 1)];
        if (!next) return;
        offset = vertical
          ? Math.min(at, next.textContent.length)
          : backwards
            ? next.textContent.length
            : 0;
      }
      const w = document.createTreeWalker(next, 4);
      let left = offset,
        target = null;
      while ((n = w.nextNode())) {
        if (left <= n.length) {
          target = [n, left];
          break;
        }
        left -= n.length;
      }
      target ||= [next, next.childNodes.length];
      if (sel.extend) sel.extend(...target);
      else {
        const r = document.createRange();
        r.setStart(sel.anchorNode, sel.anchorOffset);
        r.setEnd(...target);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    extraRects = [];
    rowRects.clear();
    wholeTables.clear();
    cellRect = null;
    sectionSelection = false;
    textSelections = textPoints(sel.getRangeAt(0));
    multiTextSelection = false;
    selected = new Set(textSelections.map((p) => p.id));
    selection();
    emitTextStyle();
  }
  function productivityCommand(type) {
    if (type === "formatBrush") copyShape();
    if (type === "marks") toggleMarks();
    if (type === "fitPage") fitOnePage();
    if (type === "print") printDocument();
    if (type === "pdf") exportPDF();
  }
  document.addEventListener("editor-productivity", (e) =>
    productivityCommand(e.detail),
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.target.closest?.("input,textarea,select,dialog")
      )
        return;
      const sel = window.getSelection(),
        inside =
          editor.contains(e.target) ||
          (sel?.focusNode && editor.contains(sel.focusNode)) ||
          (e.target === document.body && lastEditorIntent);
      if (!inside) return;
      const k = e.key.toLowerCase();
      if (commandPrefix && Date.now() < commandPrefix.until) {
        e.preventDefault();
        const p = commandPrefix.kind;
        commandPrefix = null;
        if (p === "insert" && k === "t")
          document.dispatchEvent(
            new CustomEvent("editor-shell-command", {
              detail: { type: "insertTable" },
            }),
          );
        if (p === "insert" && k === "i")
          document.dispatchEvent(
            new CustomEvent("editor-shell-command", {
              detail: { type: "insertImage" },
            }),
          );
        if (p === "view" && k === "c") toggleMarks();
        return;
      }
      if (e.ctrlKey && !e.altKey && ["n", "g"].includes(k)) {
        e.preventDefault();
        commandPrefix = {
          kind: k === "n" ? "insert" : "view",
          until: Date.now() + 2500,
        };
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && k === "c") {
        e.preventDefault();
        copyShape();
        return;
      }
      if (e.ctrlKey && k === "p") {
        e.preventDefault();
        if (e.altKey) exportPDF();
        else printDocument();
        return;
      }
      if (e.ctrlKey && e.altKey && k === "1") {
        e.preventDefault();
        fitOnePage();
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        document.querySelector('button[title*="단축키 목록"]')?.click();
        return;
      }
      if (e.ctrlKey && e.key === "F2") {
        e.preventDefault();
        showFindReplace();
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key.startsWith("Arrow"))
        extendText(e);
    },
    true,
  );
  async function fitOnePage() {
    const wanted = new Set(selectedTextPoints().map((p) => p.id));
    for (const r of selectedRects()) wanted.add(r.id);
    if (!wanted.size) for (const id of selected) wanted.add(id);
    const chosen = blocks.filter((b) => !wanted.size || wanted.has(b.id));
    if (!chosen.length) return;
    save();
    for (const b of chosen) b.pageBreakBefore = false;
    if (chosen.length < blocks.length && blocks.indexOf(chosen[0]) > 0)
      chosen[0].pageBreakBefore = true;
    documentOptions.view = { ...documentOptions.view, mode: "continuous" };
    document.dispatchEvent(
      new CustomEvent("editor-options-restored", { detail: documentOptions }),
    );
    await new Promise((r) => setTimeout(r, 120));
    const page = documentOptions.page || { height: 297, top: 20, bottom: 15 },
      available = ((page.height - page.top - page.bottom) * 96) / 25.4 - 4;
    let fitted = false;
    for (let pass = 0; pass < 12; pass++) {
      const size = chosen.reduce((n, b) => {
        const el = editor.querySelector('[data-id="' + b.id + '"]');
        const css = el ? getComputedStyle(el) : null,
          slot = el?.nextElementSibling;
        return (
          n +
          (el?.getBoundingClientRect().height || 0) +
          (parseFloat(css?.marginBottom) || 0) +
          (parseFloat(css?.marginTop) || 0) +
          (slot?.classList.contains("insert-slot")
            ? slot.getBoundingClientRect().height
            : 0)
        );
      }, 0);
      if (size <= available) {
        fitted = true;
        break;
      }
      const factor = Math.max(0.15, Math.min(0.95, (available / size) * 0.97));
      for (const b of chosen) {
        const scale = (st) => {
          st.fontSize = Math.max(
            0.5,
            (st.fontSize || baseStyle.fontSize || 10) * factor,
          );
          st.paragraphGap = 0;
          st.spaceBefore = 0;
          st.lineHeight = 1;
          st.letterSpacing = Math.max(
            -st.fontSize * 0.15,
            Math.min(st.letterSpacing || 0, -st.fontSize * 0.02),
          );
        };
        if (b.kind === "image") {
          b.image.width *= factor;
          b.image.height *= factor;
        } else if (b.kind === "table") {
          const o = tableOptions(b);
          o.fitPage = true;
          o.fontSize = Math.max(
            0.5,
            (o.fontSize || baseStyle.fontSize || 10) * factor,
          );
          o.minFont = 0.5;
          o.padY = 0;
          for (const st of Object.values(o.cellStyles || {})) {
            scale(st);
            st.padY = 0;
          }
          for (const ms of Object.values(o.cellMarks || {}))
            for (const m of ms)
              if (m.style.fontSize) m.style.fontSize *= factor;
          for (const r in o.rowHeights || {}) o.rowHeights[r] *= factor;
        } else {
          b.style ||= {};
          scale(b.style);
          for (const m of b.marks || [])
            if (m.style.fontSize)
              m.style.fontSize = Math.max(0.5, m.style.fontSize * factor);
        }
      }
      render();
      await new Promise((r) => requestAnimationFrame(r));
    }
    documentOptions.view = {
      ...documentOptions.view,
      mode: "pages",
      currentPage: 1,
    };
    document.dispatchEvent(
      new CustomEvent("editor-options-restored", { detail: documentOptions }),
    );
    document.dispatchEvent(new Event("editor-content-changed"));
    status(
      fitted
        ? "한 페이지 맞춤 완료 · Ctrl+Z로 복구"
        : "최소 크기까지 조정했습니다. 더 작은 여백이나 큰 용지가 필요합니다.",
      !fitted,
    );
  }

  function outputPage() {
    return {
      width: 210,
      height: 297,
      top: 20,
      bottom: 15,
      left: 20,
      right: 20,
      ...documentOptions.page,
    };
  }
  function outputHTML() {
    pull();
    const page = outputPage(),
      width = ((page.width - page.left - page.right) * 96) / 25.4,
      copy = (() => {
        if (document.getElementById("editorOutputScope")?.value !== "selection")
          return clone(blocks);
        let value;
        document.dispatchEvent(
          new CustomEvent("editor-export-request", {
            detail: (s) => (value = s.blocks),
          }),
        );
        if (!value?.length) throw Error("출력할 영역을 먼저 선택해 주세요.");
        return value;
      })();
    for (const b of copy)
      if (b.kind === "table") {
        b.tableOptions ||= {};
        b.tableOptions.width = Math.min(
          b.tableOptions.width || opts().width,
          width,
        );
      }
    return D.convert(
      copy,
      { ...opts(), width: Math.min(opts().width, width) },
      measure,
    ).html;
  }
  async function printDocument() {
    const page = outputPage(),
      frame = document.createElement("iframe");
    frame.title = "문서 인쇄";
    frame.style.cssText =
      "position:fixed;left:-10000px;width:210mm;height:297mm;border:0";
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Pretendard;src:url("' +
        new URL("Pretendard-Regular.ttf", location.href).href +
        '");font-weight:400}@page{size:' +
        page.width +
        "mm " +
        page.height +
        "mm;margin:" +
        page.top +
        "mm " +
        page.right +
        "mm " +
        page.bottom +
        "mm " +
        page.left +
        "mm}body{margin:0;font-synthesis:weight style}table{break-inside:auto;float:none!important}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body>" +
        outputHTML() +
        "</body></html>",
    );
    doc.close();
    await doc.fonts?.ready;
    frame.contentWindow.onafterprint = () => frame.remove();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 120000);
  }
  async function exportPDF() {
    try {
      status("PDF 생성 중");
      const response = await fetch("export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            html: outputHTML(),
            page: outputPage(),
            title: $("documentTitle")?.value || "문서",
          }),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error || "PDF 생성 실패");
      const link = document.createElement("a");
      link.href = "download/" + data.id;
      link.download = data.name;
      document.body.append(link);
      link.click();
      link.remove();
      status("PDF 저장 완료");
    } catch (e) {
      status(e.message + " · 인쇄 메뉴에서 PDF로 저장할 수도 있습니다.", true);
    }
  }


  // Unified editing controller. Capture once at window level so legacy document
  // listeners cannot execute the same edit twice. Model offsets count UTF-16,
  // while navigation uses grapheme boundaries and measured visual lines.
  function installEditorInteractions() {
    let typingStyle = {},
      typingAt = null,
      historyAt = 0,
      composing = false,
      compositionBase = null,
      pointerId = null;
    let preferredX = null,
      marginDrag = null,
      marginRAF = 0,
      ignoreClick = false,
      lineCache = null;
    let savedSelection = null,
      dragPayload = null,
      modelTransaction = false;
    const baseSave = save;
    save = function () {
      if (!modelTransaction) baseSave();
    };
    const uid = () => "edit-" + crypto.randomUUID();
    const control = (t) =>
      t?.closest?.("input,textarea,select,dialog,[role=combobox]");
    const hostOf = (n) =>
      (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.(
        ".doc-text,td:not([data-repeat]),.insert-slot",
      );
    const inside = (e) =>
      !editor.inert && !control(e.target) &&
      (editor.contains(e.target) ||
        (e.target === document.body && lastEditorIntent));
    const stop = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const chars = new Intl.Segmenter("ko", { granularity: "grapheme" });
    const words = new Intl.Segmenter("ko", { granularity: "word" });
    const hosts = () =>
      [...editor.querySelectorAll(".doc-text,td")].filter(
        (n) => !n.closest("[data-pagination],[data-repeat]"),
      );
    function descriptor(h, offset = 0) {
      if (!h) return null;
      if (h.matches(".insert-slot"))
        return { after: h.dataset.after, offset: 0 };
      return {
        id: h.closest(".doc-block").dataset.id,
        key: h.tagName === "TD" ? cellRow(h) + ":" + cellCol(h) : null,
        offset: Math.max(0, Math.min(readEditorText(h).length, offset)),
      };
    }
    function host(p) {
      if (!p) return null;
      if ("after" in p)
        return [...editor.querySelectorAll(".insert-slot")].find(
          (n) => n.dataset.after === p.after,
        );
      const el = [...editor.children].find((n) => n.dataset.id === p.id);
      if (!el) return null;
      return p.key
        ? getModelCell(el, ...p.key.split(":").map(Number))
        : el.querySelector(".doc-text");
    }
    function offset(h, n, o) {
      const r = document.createRange();
      r.selectNodeContents(h);
      try {
        r.setEnd(n, o);
        return readEditorText(r.cloneContents()).length;
      } catch {
        return 0;
      }
    }
    function domPoint(h, at) {
      at = Math.max(0, at);
      let found = null,
        left = at;
      function walk(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            if (left <= c.length) {
              found = [c, left];
              return true;
            }
            left -= c.length;
          } else if (
            c.nodeType === 1 &&
            !c.matches(
              ".image-box,.column-grip,[data-pagination],[data-repeat]",
            )
          ) {
            if (c.tagName === "BR") {
              const i = [...n.childNodes].indexOf(c);
              if (left === 0) {
                found = [n, i];
                return true;
              }
              left--;
              if (left === 0) {
                found = [n, i + 1];
                return true;
              }
            } else if (walk(c)) return true;
          }
        }
        return false;
      }
      walk(h);
      return found || [h, h.childNodes.length];
    }
    function currentSelection() {
      const s = window.getSelection();
      if (!s?.rangeCount) return null;
      const a = hostOf(s.anchorNode),
        f = hostOf(s.focusNode);
      if (!a || !f || !editor.contains(a) || !editor.contains(f)) return null;
      return {
        a: descriptor(a, offset(a, s.anchorNode, s.anchorOffset)),
        f: descriptor(f, offset(f, s.focusNode, s.focusOffset)),
      };
    }
    function clearModes() {
      allDocumentSelected = false;
      sectionSelection = false;
      multiTextSelection = false;
      extraRects = [];
      rowRects.clear();
      wholeTables.clear();
      cellRect = null;
      textSelections = [];
      selected.clear();
      activeImage = null;
      editor
        .querySelectorAll(".image-box.active")
        .forEach((n) => n.classList.remove("active"));
      paintCells();
      paintTextSelections();
    }
    function select(a, f = a, scroll = false) {
      const ah = host(a),
        fh = host(f);
      if (!ah || !fh) return;
      clearModes();
      (fh.closest(".table-content") || fh).focus({ preventScroll: true });
      const s = window.getSelection(),
        ap = domPoint(ah, a.offset),
        fp = domPoint(fh, f.offset);
      s.setBaseAndExtent(...ap, ...fp);
      anchor = f.id || f.after;
      insertionPoint = { ...f };
      lastEditorIntent = true;
      if (!s.isCollapsed) {
        textSelections = textPoints(s.getRangeAt(0));
        selected = new Set(textSelections.map((p) => p.id));
      }
      savedSelection = { a: { ...a }, f: { ...f } };
      selection();
      paintTextSelections();
      emitTextStyle();
      if (scroll) {
        const rect = caretRect(fh, f.offset),
          wrap = editor.closest(".paper-wrap");
        if (wrap && rect) {
          const box = wrap.getBoundingClientRect();
          if (rect.bottom > box.bottom - 12)
            wrap.scrollTop += rect.bottom - box.bottom + 24;
          else if (rect.top < box.top + 12)
            wrap.scrollTop += rect.top - box.top - 24;
        }
      }
    }
    function data(p) {
      const b = blockById(p?.id);
      if (!b) return null;
      if (p.key) {
        const [r, c] = p.key.split(":").map(Number),
          o = tableOptions(b);
        o.cellMarks ||= {};
        o.cellLinks ||= {};
        return {
          b,
          text: b.rows[r]?.[c] ?? "",
          marks: o.cellMarks[p.key] || [],
          links: o.cellLinks[p.key] || [],
          set(t, m, l) {
            b.rows[r][c] = t;
            o.cellMarks[p.key] = m;
            o.cellLinks[p.key] = l;
          },
        };
      }
      if (b.kind === "table" || b.kind === "image") return null;
      return {
        b,
        text: b.text || "",
        marks: b.marks || [],
        links: b.links || [],
        set(t, m, l) {
          b.text = t;
          b.marks = m;
          b.links = l;
        },
      };
    }
    function spliceText(p, start, end, text, style = null) {
      const d = data(p);
      if (!d) return;
      const delta = text.length - (end - start),
        map = (x) => (x <= start ? x : x >= end ? x + delta : start);
      const update = (rs) =>
        rs
          .map((m) => ({ ...m, start: map(m.start), end: map(m.end) }))
          .filter((m) => m.end > m.start);
      const marks = update(d.marks),
        links = update(d.links);
      if (text.length && style && Object.keys(style).length)
        marks.push({ start, end: start + text.length, style: { ...style } });
      d.set(d.text.slice(0, start) + text + d.text.slice(end), marks, links);
      if (p.key && d.b.tableOptions?.cellParagraphs?.[p.key])
        d.b.tableOptions.cellParagraphs[p.key] = update(
          d.b.tableOptions.cellParagraphs[p.key],
        );
      for (const im of d.b.inlineImages || []) im.offset = map(im.offset);
      return { ...p, offset: start + text.length };
    }
    function checkpoint(group = false) {
      const now = performance.now(),
        p = currentSelection();
      if (
        !group ||
        now - historyAt > 700 ||
        !typingAt ||
        JSON.stringify(typingAt) !== JSON.stringify(p?.f)
      ) {
        save();
        const snap = undo.at(-1);
        if (snap) snap.editSelection = p;
      }
      historyAt = group ? now : 0;
    }
    function ensurePoint(p) {
      if (p?.id && data(p)) return p;
      const after = blockById(p?.after),
        i = after ? blocks.indexOf(after) + 1 : blocks.length;
      const b = {
        id: uid(),
        kind: "paragraph",
        literal: true,
        level: null,
        text: "",
        style: {
          ...surroundingStyle(p?.after),
          paragraphGap: 0,
          spaceBefore: 0,
        },
      };
      blocks.splice(i, 0, b);
      return { id: b.id, key: null, offset: 0 };
    }
    function removeSelection() {
      const s = currentSelection();
      if (allDocumentSelected) {
        blocks = [];
        clearModes();
        return ensurePoint(null);
      }
      const points = selectedTextPoints();
      if (!points.length) return ensurePoint(s?.f || insertionPoint);
      const first = points[0],
        last = points.at(-1),
        a = data(first),
        z = data(last);
      if (
        !first.key &&
        !last.key &&
        a &&
        z &&
        first.id !== last.id &&
        !points.some((p) => p.key) &&
        points.length === blocks.indexOf(z.b) - blocks.indexOf(a.b) + 1
      ) {
        const i = blocks.indexOf(a.b),
          j = blocks.indexOf(z.b),
          tail = z.text.slice(last.end),
          start = first.start;
        const crop = (rs, from, to, shift) =>
          rs
            .filter((m) => m.end > from && m.start < to)
            .map((m) => ({
              ...m,
              start: Math.max(from, m.start) - from + shift,
              end: Math.min(to, m.end) - from + shift,
            }));
        a.set(
          a.text.slice(0, start) + tail,
          [
            ...crop(a.marks, 0, start, 0),
            ...crop(z.marks, last.end, z.text.length, start),
          ],
          [
            ...crop(a.links, 0, start, 0),
            ...crop(z.links, last.end, z.text.length, start),
          ],
        );
        blocks.splice(i + 1, j - i);
        clearModes();
        return { id: a.b.id, key: null, offset: start };
      }
      for (const p of [...points].reverse()) spliceText(p, p.start, p.end, "");
      clearModes();
      return { id: first.id, key: first.key, offset: first.start };
    }
    function commitText(text, group = true) {
      checkpoint(group);
      const p = removeSelection();
      const style = {
        ...pointStyle({
          ...p,
          start: Math.max(0, p.offset - 1),
          end: p.offset,
        }),
        ...typingStyle,
      };
      const next = spliceText(p, p.offset, p.offset, text, style);
      if (!next) return;
      const d=data(next),h=host(next);
      if(h&&!next.key&&!d.b.inlineImages?.length){
        h.innerHTML=D.inlineHTML(d.b);
        document.dispatchEvent(new Event("editor-content-changed"));
      } else render();
      select(next);
      typingAt = { ...next };
      editSaved = false;
    }
    document.addEventListener("editor-insert-break",event=>{
      if(window.EditorInput?.composing)return;
      enter(event.detail==="soft");
    });
    function enter(soft = false) {
      checkpoint();
      const p = removeSelection(),
        d = data(p);
      if (!d) return;
      if (soft || p.key) {
        const next = spliceText(
          p,
          p.offset,
          p.offset,
          p.key && !soft ? "\u2029" : "\n",
          typingStyle,
        );
        render();
        select(next);
        return;
      }
      const at = p.offset,
        tail = {
          ...clone(d.b),
          id: uid(),
          kind: "paragraph",
          literal: true,
          level: null,
          text: d.text.slice(at),
          style: {
            ...d.b.style,
            ...pointStyle({ ...p, start: Math.max(0, at - 1), end: at }),
            ...typingStyle,
            paragraphGap: d.b.style?.paragraphGap ?? 0,
            spaceBefore: 0,
          },
        };
      for (const k of ["marks", "links"]) {
        tail[k] = d[k]
          .filter((m) => m.end > at)
          .map((m) => ({
            ...m,
            start: Math.max(at, m.start) - at,
            end: m.end - at,
          }));
        d.b[k] = d[k]
          .filter((m) => m.start < at)
          .map((m) => ({ ...m, end: Math.min(at, m.end) }));
      }
      tail.inlineImages = (d.b.inlineImages || [])
        .filter((i) => i.offset >= at)
        .map((i) => ({ ...i, offset: i.offset - at }));
      d.b.inlineImages = (d.b.inlineImages || []).filter((i) => i.offset < at);
      d.b.text = d.text.slice(0, at);
      d.b.style ||= {};
      d.b.style.paragraphGap = documentOptions.enterBehavior==="tight" ? 0 : baseStyle.paragraphGap;
      tail.style.paragraphGap=baseStyle.paragraphGap;
      d.b.gapAfterHidden = true;
      delete tail.hierarchyPrefix;
      blocks.splice(blocks.indexOf(d.b) + 1, 0, tail);
      render();
      select({ id: tail.id, key: null, offset: 0 });
    }
    function boundaries(text) {
      return [
        0,
        ...[...chars.segment(text)].map((s) => s.index + s.segment.length),
      ];
    }
    function horizontal(p, back, word = false) {
      const h = host(p);
      if (!h) return p;
      const text = readEditorText(h),
        at = p.offset;
      let offsets = word
        ? [
            0,
            ...[...words.segment(text)]
              .filter((s) => s.isWordLike)
              .flatMap((s) => [s.index, s.index + s.segment.length]),
            text.length,
          ]
        : boundaries(text);
      offsets = [...new Set(offsets)].sort((a, b) => a - b);
      const n = back
        ? offsets.filter((n) => n < at).at(-1)
        : offsets.find((n) => n > at);
      if (n !== undefined) return { ...p, offset: n };
      const hs = hosts(),
        next = hs[hs.indexOf(h) + (back ? -1 : 1)];
      return next
        ? descriptor(next, back ? readEditorText(next).length : 0)
        : p;
    }
    function caretRect(h, at) {
      const p = domPoint(h, at),
        r = document.createRange();
      r.setStart(...p);
      r.collapse(true);
      let rc = r.getClientRects()[0];
      if (!rc || !rc.height) {
        const t = readEditorText(h),
          next = boundaries(t).find((n) => n > at);
        if (next !== undefined) {
          r.setEnd(...domPoint(h, next));
          rc = r.getClientRects()[0];
        } else if (at > 0) {
          const prev =
            boundaries(t)
              .filter((n) => n < at)
              .at(-1) || 0;
          r.setStart(...domPoint(h, prev));
          r.setEnd(...p);
          rc = r.getClientRects()[0];
          if (rc)
            return {
              left: rc.right,
              right: rc.right,
              top: rc.top,
              bottom: rc.bottom,
              height: rc.height,
            };
        }
      }
      return rc?.height ? rc : h.getBoundingClientRect();
    }
    function visualLines() {
      const wrap = editor.closest(".paper-wrap"),
        box = (wrap || editor).getBoundingClientRect(),
        er = editor.getBoundingClientRect(),
        focused = hostOf(getSelection()?.focusNode);
      const cacheKey = [
        er.left,
        er.top,
        er.width,
        er.height,
        wrap?.scrollTop,
        focused?.closest(".doc-block")?.dataset.id,
      ].join(":");
      if (lineCache?.key === cacheKey) return lineCache.lines;
      const lines = [];
      for (const h of hosts()) {
        const hr = h.getBoundingClientRect();
        if (
          h !== focused &&
          (hr.bottom < box.top - box.height || hr.top > box.bottom + box.height)
        )
          continue;
        const text = readEditorText(h),
          bs = boundaries(text);
        let line = null;
        for (const at of bs) {
          const r = caretRect(h, at);
          if (!r) continue;
          if (
            !line ||
            Math.abs(line.top - r.top) > Math.max(2, r.height * 0.35)
          ) {
            if (line) line.endOffset = text[at - 1] === "\n" ? at - 1 : at;
            line = {
              host: h,
              top: r.top,
              bottom: r.bottom,
              points: [],
              startOffset: at,
              endOffset: text.length,
            };
            lines.push(line);
          }
          line.points.push({ offset: at, x: r.left });
          line.bottom = Math.max(line.bottom, r.bottom);
        }
      }
      lineCache = { key: cacheKey, lines };
      return lines;
    }
    function move(e) {
      let s = currentSelection();
      if (!s && savedSelection) {
        select(savedSelection.a, savedSelection.f);
        s = currentSelection();
      }
      if (!s) return false;
      const key = e.key,
        back = ["ArrowLeft", "ArrowUp", "Home", "PageUp"].includes(key),
        ext = e.shiftKey;
      let p = s.f,
        n = p;
      const h = host(p);
      if (!h) return false;
      if (
        !ext &&
        !window.getSelection().isCollapsed &&
        ["ArrowLeft", "ArrowRight"].includes(key)
      ) {
        const r = window.getSelection().getRangeAt(0),
          hh = hostOf(back ? r.startContainer : r.endContainer);
        n = descriptor(
          hh,
          offset(
            hh,
            back ? r.startContainer : r.endContainer,
            back ? r.startOffset : r.endOffset,
          ),
        );
      } else if ((e.ctrlKey || e.metaKey) && ["Home", "End"].includes(key)) {
        const hs = hosts(),
          hh = back ? hs[0] : hs.at(-1);
        n = descriptor(hh, back ? 0 : readEditorText(hh).length);
      } else if (["ArrowLeft", "ArrowRight"].includes(key)) {
        n = horizontal(p, back, e.ctrlKey || e.metaKey);
        preferredX = null;
      } else if (
        (e.ctrlKey || e.metaKey) &&
        ["ArrowUp", "ArrowDown"].includes(key)
      ) {
        const hs = hosts(),
          i = hs.indexOf(h),
          hh =
            back && p.offset > 0
              ? h
              : hs[Math.max(0, Math.min(hs.length - 1, i + (back ? -1 : 1)))];
        n = descriptor(hh, back ? 0 : readEditorText(hh).length);
      } else {
        const ls = visualLines(),
          rc = caretRect(h, p.offset);
        let i = ls.findIndex(
          (l) =>
            l.host === h &&
            Math.abs(l.top - rc.top) < Math.max(3, rc.height * 0.35),
        );
        if (i < 0) i = ls.findIndex((l) => l.host === h);
        if (i < 0) return false;
        if (["Home", "End"].includes(key)) {
          const line = ls[i];
          n = descriptor(h, back ? line.startOffset : line.endOffset);
          preferredX = null;
        } else {
          preferredX ??= rc.left;
          let j = i + (back ? -1 : 1);
          if (key.startsWith("Page")) {
            const wrap = editor.closest(".paper-wrap"),
              height = wrap?.clientHeight || innerHeight * 0.7,
              target = rc.top + (back ? -height : height);
            j = ls.reduce(
              (best, l, k) =>
                Math.abs(l.top - target) < Math.abs(ls[best].top - target)
                  ? k
                  : best,
              i,
            );
          }
          j = Math.max(0, Math.min(ls.length - 1, j));
          const line = ls[j],
            pt = line.points.reduce((a, b) =>
              Math.abs(b.x - preferredX) < Math.abs(a.x - preferredX) ? b : a,
            );
          n = descriptor(line.host, pt.offset);
        }
      }
      stop(e);
      select(ext ? s.a : n, n, true);
      typingStyle = {};
      typingAt = null;
      historyAt = 0;
      return true;
    }
    function clearImage() {
      activeImage = null;
      editor
        .querySelectorAll(".image-box.active")
        .forEach((n) => n.classList.remove("active"));
    }
    function mutateTable(type, at = null) {
      const p = at || currentSelection()?.f || insertionPoint,
        rect = selectedRects()[0];
      const b = blockById(rect?.id || p?.id || anchor);
      if (b?.kind !== "table") return false;
      const o = tableOptions(b),
        oldMaps = clone(o),
        isRow = /Row$/.test(type),
        add = type.startsWith("add");
      let start = rect
          ? isRow
            ? rect.r1
            : rect.c1
          : p?.key
            ? +p.key.split(":")[isRow ? 0 : 1]
            : 0,
        end = rect ? (isRow ? rect.r2 : rect.c2) : start;
      const size = isRow ? b.rows.length : b.rows[0].length,
        count = add ? 1 : end - start + 1,
        index = add ? end + 1 : start;
      if (add && size >= (isRow ? 1000 : 40)) {
        status("표의 최대 크기에 도달했습니다.", true);
        return true;
      }
      if (!add && count >= size) {
        status(
          "마지막 행·열은 유지합니다. Delete로 내용을 지울 수 있습니다.",
          true,
        );
        return true;
      }
      checkpoint();
      const map = (i) =>
        add
          ? i >= index
            ? i + 1
            : i
          : i < start
            ? i
            : i > end
              ? i - count
              : null;
      for (const field of [
        "cellStyles",
        "cellMarks",
        "cellLinks",
        "cellImages",
        "cellParagraphs",
      ]) {
        const next = {};
        for (const [key, v] of Object.entries(o[field] || {})) {
          let [r, c] = key.split(":").map(Number),
            n = map(isRow ? r : c);
          if (n === null) continue;
          if (isRow) r = n;
          else c = n;
          next[r + ":" + c] = v;
        }
        if (add && field === "cellStyles") {
          for (let n = 0; n < (isRow ? b.rows[0].length : b.rows.length); n++) {
            const from = isRow ? end + ":" + n : n + ":" + end,
              to = isRow ? index + ":" + n : n + ":" + index;
            if (o[field]?.[from]) next[to] = clone(o[field][from]);
          }
        }
        o[field] = next;
      }
      const merges = [];
      for (const old of o.merges || []) {
        const m = { ...old },
          axis = isRow ? "row" : "col",
          span = isRow ? "rowSpan" : "colSpan",
          a = m[axis],
          z = a + m[span] - 1;
        if (add) {
          if (a >= index) m[axis]++;
          else if (z >= index) m[span]++;
        } else {
          const surviving = Array.from(
            { length: m[span] },
            (_, i) => a + i,
          ).filter((i) => i < start || i > end);
          if (!surviving.length) continue;
          // If the anchor is deleted, retain its content in the surviving anchor.
          if (a >= start && a <= end) {
            const oldKey = m.row + ":" + m.col;
            const r = isRow ? surviving[0] : m.row,
              c = isRow ? m.col : surviving[0];
            b.rows[r][c] = b.rows[m.row][m.col];
            for (const field of [
              "cellMarks",
              "cellLinks",
              "cellImages",
              "cellStyles",
            ])
              if (oldMaps[field]?.[oldKey])
                o[field][(isRow ? map(r) : r) + ":" + (isRow ? c : map(c))] =
                  clone(oldMaps[field][oldKey]);
          }
          m[axis] = map(surviving[0]);
          m[span] = surviving.length;
        }
        if (m.rowSpan > 1 || m.colSpan > 1) merges.push(m);
      }
      o.merges = merges;
      if (isRow) {
        if (add) b.rows.splice(index, 0, Array(b.rows[0].length).fill(""));
        else b.rows.splice(start, count);
        b.headerRows = (b.headerRows || []).map(map).filter((n) => n !== null);
        const hh = {};
        for (const [r, h] of Object.entries(o.rowHeights || {})) {
          const n = map(+r);
          if (n !== null) hh[n] = h;
        }
        o.rowHeights = hh;
      } else {
        for (const row of b.rows)
          if (add) row.splice(index, 0, "");
          else row.splice(start, count);
        if (o.widths) {
          const total = o.widths.reduce((a, b) => a + b, 0);
          if (add) o.widths.splice(index, 0, o.widths[end] || total / size);
          else o.widths.splice(start, count);
          const sum = o.widths.reduce((a, b) => a + b, 0);
          o.widths = o.widths.map((w) => (w * total) / sum);
        }
      }
      clearModes();
      render();
      const row = isRow
          ? Math.min(index, b.rows.length - 1)
          : Math.min(+(p?.key?.split(":")[0] || 0), b.rows.length - 1),
        col = isRow
          ? Math.min(
              +(p?.key?.split(":")[1] || rect?.c1 || 0),
              b.rows[0].length - 1,
            )
          : Math.min(index, b.rows[0].length - 1);
      const visible =
        modelCells(editor.querySelector('[data-id="' + b.id + '"]')).find(
          (td) => cellRow(td) === row && cellCol(td) === col,
        ) ||
        modelCells(editor.querySelector('[data-id="' + b.id + '"]')).find(
          (td) => cellRow(td) >= row,
        );
      if (visible) select(descriptor(visible, 0));
      else {
        const merge = o.merges.find(
          (m) =>
            row >= m.row &&
            row < m.row + m.rowSpan &&
            col >= m.col &&
            col < m.col + m.colSpan,
        );
        const td = merge
          ? getModelCell(
              editor.querySelector('[data-id="' + b.id + '"]'),
              merge.row,
              merge.col,
            )
          : null;
        if (td) select(descriptor(td));
      }
      status(
        add
          ? "빈 " + (isRow ? "행" : "열") + " 추가됨"
          : "선택 " + (isRow ? "행" : "열") + " 삭제됨",
      );
      return true;
    }
    function mergeCells(split = false) {
      const rect = selectedRects()[0],
        p = currentSelection()?.f || insertionPoint,
        b = blockById(rect?.id || p?.id);
      if (b?.kind !== "table") return;
      checkpoint();
      const o = tableOptions(b);
      o.merges ||= [];
      if (split) {
        const [r, c] = (p?.key || rect?.r1 + ":" + rect?.c1)
          .split(":")
          .map(Number);
        o.merges = o.merges.filter(
          (m) =>
            !(
              r >= m.row &&
              r < m.row + m.rowSpan &&
              c >= m.col &&
              c < m.col + m.colSpan
            ),
        );
      } else if (rect) {
        const intersect = (m) =>
          m.row <= rect.r2 &&
          m.row + m.rowSpan - 1 >= rect.r1 &&
          m.col <= rect.c2 &&
          m.col + m.colSpan - 1 >= rect.c1;
        if (
          o.merges.some(
            (m) =>
              intersect(m) &&
              (m.row < rect.r1 ||
                m.col < rect.c1 ||
                m.row + m.rowSpan - 1 > rect.r2 ||
                m.col + m.colSpan - 1 > rect.c2),
          )
        ) {
          status("기존 병합 셀을 모두 포함해 선택해 주세요.", true);
          return;
        }
        const target = { id: b.id, key: rect.r1 + ":" + rect.c1 },
          parts = [],
          marks = [],
          links = [],
          images = [];
        let shift = 0;
        for (let r = rect.r1; r <= rect.r2; r++)
          for (let c = rect.c1; c <= rect.c2; c++) {
            const d = data({ id: b.id, key: r + ":" + c });
            if (parts.length) {
              shift++;
            }
            parts.push(d.text);
            marks.push(
              ...d.marks.map((m) => ({
                ...m,
                start: m.start + shift,
                end: m.end + shift,
              })),
            );
            links.push(
              ...d.links.map((m) => ({
                ...m,
                start: m.start + shift,
                end: m.end + shift,
              })),
            );
            images.push(...(o.cellImages?.[r + ":" + c] || []));
            shift += d.text.length;
            d.set("", [], []);
            if (o.cellImages) delete o.cellImages[r + ":" + c];
          }
        data(target).set(parts.join("\n"), marks, links);
        o.cellImages ||= {};
        o.cellImages[target.key] = images;
        o.merges = o.merges.filter((m) => !intersect(m));
        o.merges.push({
          row: rect.r1,
          col: rect.c1,
          rowSpan: rect.r2 - rect.r1 + 1,
          colSpan: rect.c2 - rect.c1 + 1,
        });
      }
      clearModes();
      render();
      const td = modelCells(
        editor.querySelector('[data-id="' + b.id + '"]'),
      )[0];
      if (td) select(descriptor(td));
    }
    const originalApply = applyCharacterStyle;
    applyCharacterStyle = function (style) {
      pull();
      const points = selectedTextPoints();
      if (!points.length) {
        const p = currentSelection()?.f || insertionPoint;
        if (!p) return;
        typingStyle = {
          ...pointStyle({ ...p, start: p.offset || 0, end: p.offset || 0 }),
          ...typingStyle,
          ...style,
        };
        typingAt = p;
        const d = data(p);
        if (d && !d.text.length) {
          checkpoint();
          if (p.key) {
            const o = tableOptions(d.b);
            o.cellStyles ||= {};
            o.cellStyles[p.key] = { ...o.cellStyles[p.key], ...style };
          } else d.b.style = { ...d.b.style, ...style };
          render();
          select(p);
        }
        document.dispatchEvent(
          new CustomEvent("editor-text-style", { detail: typingStyle }),
        );
        return;
      }
      const saved = currentSelection(),
        wrap = editor.closest(".paper-wrap"),
        top = wrap?.scrollTop;
      originalApply(style);
      // Empty cells/paragraphs have no character range; preserve their next-input style.
      for (const p of points)
        if (p.start === p.end) {
          const d = data(p);
          if (!d) continue;
          if (p.key) {
            const o = tableOptions(d.b);
            o.cellStyles ||= {};
            o.cellStyles[p.key] = { ...o.cellStyles[p.key], ...style };
          } else d.b.style = { ...d.b.style, ...style };
        }
      if (saved) {
        select(saved.a, saved.f);
        textSelections = points;
        selected = new Set(points.map((p) => p.id));
        paintTextSelections();
      } else keepTextSelection(points);
      if (wrap) wrap.scrollTop = top;
      historyAt = 0;
    };
    const oldFormat = selectedFormatValue;
    selectedFormatValue = function (key) {
      if (selectedTextPoints().length) return oldFormat(key);
      const p = currentSelection()?.f || insertionPoint;
      return !!(
        typingStyle[key] ??
        (p
          ? pointStyle({ ...p, start: p.offset || 0, end: p.offset || 0 })[key]
          : false)
      );
    };
    const oldEmit = emitTextStyle;
    emitTextStyle = function () {
      oldEmit();
      const ps = selectedTextPoints();
      if (!ps.length) return;
      const ss = ps.flatMap((p) => {
        const d = data(p);
        return [
          p.start,
          ...(d?.marks || [])
            .flatMap((m) => [m.start, m.end])
            .filter((n) => n > p.start && n < p.end),
        ].map((n) => pointStyle(p, n));
      });
      if (!ss.length) return;
      const detail = { ...ss[0] };
      for (const k of [
        "bold",
        "italic",
        "underline",
        "strike",
        "fontSize",
        "fontFamily",
      ])
        detail["mixed" + k[0].toUpperCase() + k.slice(1)] =
          new Set(ss.map((s) => s[k] ?? false)).size > 1;
      detail.mixedSize = detail.mixedFontSize;
      detail.mixedFont = detail.mixedFontFamily;
      document.dispatchEvent(new CustomEvent("editor-text-style", { detail }));
    };
    const oldRestore = restore;
    restore = function (s) {
      clearModes();
      oldRestore(s);
      historyAt = 0;
      typingStyle = {};
      typingAt = null;
      if (s.editSelection) select(s.editSelection.a, s.editSelection.f);
    };
    const oldParagraph = paragraphStyle;
    paragraphStyle = function (style) {
      if ("lineHeight" in style) style = { ...style, lineHeightPt: null };
      const ps = selectedTextPoints(),
        s = currentSelection(),
        cells = ps.filter((p) => p.key);
      if (!cells.length && s?.f?.key)
        cells.push({ ...s.f, start: s.f.offset, end: s.f.offset });
      const savedCells = new Map();
      for (const p of cells) {
        const d = data(p);
        if (d?.text.includes("\u2029") && !selectedRects().length)
          savedCells.set(
            p.id + "|" + p.key,
            clone(tableOptions(d.b).cellStyles?.[p.key] || {}),
          );
      }
      if (!ps.length && s?.f && !s.f.key) {
        selected = new Set([s.f.id]);
        anchor = s.f.id;
      }
      oldParagraph(style);
      for (const p of cells) {
        const d = data(p),
          o = tableOptions(d.b),
          old = savedCells.get(p.id + "|" + p.key);
        if (!old) continue;
        o.cellStyles ||= {};
        o.cellStyles[p.key] = old;
        o.cellParagraphs ||= {};
        o.cellParagraphs[p.key] ||= [];
        let at = 0;
        for (const line of d.text.split("\u2029")) {
          const end = at + line.length;
          if (
            p.start === p.end
              ? p.start >= at && p.start <= end
              : p.end > at && p.start <= end
          )
            o.cellParagraphs[p.key].push({
              start: at,
              end,
              style: { ...style },
            });
          at = end + 1;
        }
      }
      if (savedCells.size) render();
      if (s) select(s.a, s.f);
    };
    // Real selection has priority over cached highlights. Toolbar controls can
    // keep the cached range, but clicking the document invalidates it immediately.
    window.addEventListener(
      "pointerdown",
      (e) => {
        pointerId = e.pointerId;
      },
      true,
    );
    window.addEventListener("blur", () => {
      if (marginDrag) {
        marginDrag = null;
        cancelAnimationFrame(marginRAF);
      }
    });
    window.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 2) return;
        if (
          !e.target.closest(
            ".image-box,.image-grip,.shell-ribbon,.shell-properties,.shell-context,.toolbar",
          )
        )
          clearImage();
        if (!editor.contains(e.target)) return;
        lastEditorIntent = true;
        preferredX = null;
        historyAt = 0;
        typingStyle = {};
        typingAt = null;
        if (e.target.closest(".image-box")) return;
        if (!e.ctrlKey && !e.metaKey) {
          textSelections = [];
          paintTextSelections();
        }
        const h = hostOf(e.target);
        if (e.shiftKey && savedSelection && h) {
          const hit = hitPoint(e.clientX, e.clientY, h);
          if (hit) {
            stop(e);
            select(savedSelection.a, hit);
            ignoreClick = true;
          }
          return;
        }
        const line = lineAt(e.clientX, e.clientY, true);
        if (line && !e.ctrlKey && !e.metaKey) {
          stop(e);
          marginClickHandled = true;
          ignoreClick = true;
          marginDrag = { first: line, x: e.clientX, y: e.clientY };
          try {
            if (pointerId !== null) editor.setPointerCapture(pointerId);
          } catch {}
          selectLineDrag(line);
          scrollDrag();
          return;
        }
        if (e.detail === 3 && h?.matches(".doc-text")) {
          stop(e);
          select(descriptor(h), descriptor(h, readEditorText(h).length));
          ignoreClick = true;
        }
      },
      true,
    );
    window.addEventListener(
      "click",
      (e) => {
        if (ignoreClick && editor.contains(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          ignoreClick = false;
          marginClickHandled = false;
        }
      },
      true,
    );
    window.addEventListener(
      "contextmenu",
      (e) => {
        if (editor.contains(e.target) && currentSelection())
          savedSelection = currentSelection();
      },
      true,
    );
    function lineAt(x, y, margin = false) {
      const ls = visualLines().filter(
        (l) => !margin || l.host.matches(".doc-text"),
      );
      if (!ls.length) return null;
      const line = ls.reduce((a, b) =>
        Math.abs((b.top + b.bottom) / 2 - y) <
        Math.abs((a.top + a.bottom) / 2 - y)
          ? b
          : a,
      );
      if (margin) {
        const block = line.host.closest(".doc-block").getBoundingClientRect(),
          paper = editor.getBoundingClientRect();
        if (
          x < paper.left - 32 ||
          x > block.left + 3 ||
          y < line.top - 4 ||
          y > line.bottom + 4
        )
          return null;
      }
      return line;
    }
    function selectLineDrag(line) {
      const first = marginDrag.first;
      const back = line.top < first.top;
      const a = descriptor(
          first.host,
          back ? first.endOffset : first.startOffset,
        ),
        f = descriptor(line.host, back ? line.startOffset : line.endOffset);
      select(a, f);
    }
    function scrollDrag() {
      if (!marginDrag) return;
      const wrap = editor.closest(".paper-wrap");
      if (wrap) {
        const r = wrap.getBoundingClientRect(),
          y = marginDrag.y;
        const speed =
          y < r.top + 28
            ? -Math.min(32, (r.top + 28 - y) / 3)
            : y > r.bottom - 28
              ? Math.min(32, (y - r.bottom + 28) / 3)
              : 0;
        if (speed) {
          wrap.scrollTop += speed;
          const line = lineAt(marginDrag.x, marginDrag.y);
          if (line) selectLineDrag(line);
        }
      }
      marginRAF = requestAnimationFrame(scrollDrag);
    }
    window.addEventListener(
      "mousemove",
      (e) => {
        if (!marginDrag) return;
        stop(e);
        marginDrag.x = e.clientX;
        marginDrag.y = e.clientY;
        const line = lineAt(e.clientX, e.clientY);
        if (line) selectLineDrag(line);
      },
      true,
    );
    window.addEventListener(
      "mouseup",
      (e) => {
        if (marginDrag) {
          stop(e);
          marginDrag = null;
          cancelAnimationFrame(marginRAF);
          return;
        }
        const s = currentSelection();
        if (s) savedSelection = s;
      },
      true,
    );
    function hitPoint(x, y, limit = null) {
      let n, o;
      const cp = document.caretPositionFromPoint?.(x, y);
      if (cp) {
        n = cp.offsetNode;
        o = cp.offset;
      } else {
        const r = document.caretRangeFromPoint?.(x, y);
        n = r?.startContainer;
        o = r?.startOffset;
      }
      const h = hostOf(n);
      return h && editor.contains(h) && (!limit || limit === h)
        ? descriptor(h, offset(h, n, o))
        : null;
    }
    window.addEventListener(
      "keydown",
      (e) => {
        if(e.key==='Escape'&&document.querySelector('.editor-context-menu,.inline-color-popover')){document.querySelectorAll('.editor-context-menu,.inline-color-popover').forEach(n=>n.remove());stop(e);return;}
        if (!inside(e) || e.isComposing || composing) return;
        const key = e.key,
          ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && key === "Enter") {
          const p = currentSelection()?.f || insertionPoint;
          if (blockById(p?.id)?.kind === "table") {
            stop(e);
            mutateTable("addRow", p);
          }
          return;
        }
        if (ctrl && key.toLowerCase() === "a") {
          stop(e);
          clearModes();
          allDocumentSelected = true;
          selected = new Set(blocks.map((b) => b.id));
          const r = document.createRange();
          r.selectNodeContents(editor);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          selection();
          return;
        }
        if (ctrl && ["z", "y"].includes(key.toLowerCase())) {
          stop(e);
          history(key.toLowerCase() === "z" && !e.shiftKey);
          return;
        }
        if (key === "Escape") {
          stop(e);
          const p =
            currentSelection()?.f || savedSelection?.f || insertionPoint;
          clearModes();
          if (p) select(p);
          selection();
          return;
        }
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ].includes(key) &&
          !e.altKey &&
          !cellRect
        ) {
          move(e);
          return;
        }
        if (key === "Enter" && !ctrl && !e.altKey) {
          stop(e);
          enter(e.shiftKey);
          return;
        }
        if (key === "Tab" && !ctrl && !e.altKey) {
          const p = currentSelection()?.f;
          if (p?.key) {
            stop(e);
            const hs = hosts(),
              h = host(p),
              i = hs.indexOf(h);
            let next = hs[i + (e.shiftKey ? -1 : 1)];
            if (
              !e.shiftKey &&
              (!next || next.closest(".doc-block") !== h.closest(".doc-block"))
            ) {
              mutateTable("addRow", p);
              return;
            }
            if (next) select(descriptor(next));
            return;
          }
          if (p && blockById(p.id)?.level !== null) {
            stop(e);
            selected = new Set([p.id]);
            sectionSelection = true;
            shiftHierarchySpaces(e.shiftKey ? -1 : 1);
            return;
          }
        }
        if (["Backspace", "Delete"].includes(key)) {
          if (activeImage) {
            stop(e);
            checkpoint();
            const ref = activeImage,
              b = blockById(ref.id);
            if (ref.inline) b.inlineImages.splice(ref.index, 1);
            else if (ref.key)
              b.tableOptions.cellImages[ref.key].splice(ref.index, 1);
            else blocks.splice(blocks.indexOf(b), 1);
            clearModes();
            render();
            focusBlank();
            return;
          }
          if (selectedRects().length) {
            stop(e);
            checkpoint();
            for (const rect of selectedRects()) {
              const b = blockById(rect.id),
                o = tableOptions(b);
              for (let r = rect.r1; r <= rect.r2; r++)
                for (let c = rect.c1; c <= rect.c2; c++) {
                  b.rows[r][c] = "";
                  for (const f of ["cellMarks", "cellLinks", "cellImages"])
                    delete o[f]?.[r + ":" + c];
                }
            }
            render();
            return;
          }
          const s = currentSelection();
          if (allDocumentSelected || selectedTextPoints().length) {
            stop(e);
            checkpoint();
            const p = removeSelection();
            render();
            select(p);
            return;
          }
          if (s) {
            const p = s.f,
              d = data(p),
              back = key === "Backspace";
            if (!d) return;
            if (back ? p.offset > 0 : p.offset < d.text.length) {
              stop(e);
              checkpoint(true);
              const n = horizontal(p, back, ctrl);
              const start = back ? n.offset : p.offset,
                end = back ? p.offset : n.offset;
              spliceText(p, start, end, "");
              render();
              select({ ...p, offset: start });
              typingAt = { ...p, offset: start };
              return;
            }
            if (!p.key) {
              const i = blocks.indexOf(d.b),
                other = blocks[i + (back ? -1 : 1)];
              if (other && other.kind !== "table" && other.kind !== "image") {
                stop(e);
                checkpoint();
                const first = back ? other : d.b,
                  last = back ? d.b : other,
                  n = first.text.length;
                first.text += last.text;
                for (const f of ["marks", "links"])
                  first[f] = [
                    ...(first[f] || []),
                    ...(last[f] || []).map((m) => ({
                      ...m,
                      start: m.start + n,
                      end: m.end + n,
                    })),
                  ];
                first.inlineImages = [
                  ...(first.inlineImages || []),
                  ...(last.inlineImages || []).map((im) => ({
                    ...im,
                    offset: im.offset + n,
                  })),
                ];
                blocks.splice(blocks.indexOf(last), 1);
                render();
                select({ id: first.id, key: null, offset: n });
                return;
              }
            }
            stop(e);
            return;
          }
        }
      },
      true,
    );
    window.addEventListener(
      "beforeinput",
      (e) => {
        if (
          !inside(e) ||
          composing ||
          e.isComposing ||
          e.inputType === "insertCompositionText"
        )
          return;
        if (["insertParagraph", "insertLineBreak"].includes(e.inputType)) {
          stop(e);
          enter(e.inputType === "insertLineBreak");
          return;
        }
        if (e.inputType === "insertText" && e.data !== null) {
          stop(e);
          commitText(e.data);
        }
      },
      true,
    );
    window.addEventListener(
      "compositionstart",
      (e) => {
        if (!editor.contains(e.target)) return;
        checkpoint();
        compositionBase = {
          blocks: clone(blocks),
          nativeText: host(currentSelection()?.f||insertionPoint)?readEditorText(host(currentSelection()?.f||insertionPoint)):"",
          selection: currentSelection(),
          points: clone(selectedTextPoints()),
          all: allDocumentSelected,
        };
        composing = true;
        editSaved = true;
        document.dispatchEvent(
          new CustomEvent("editor-composition-state", {
            detail: { active: true },
          }),
        );
      },
      true,
    );
    window.addEventListener(
      "compositionend",
      (e) => {
        if (!compositionBase) return;
        e.stopImmediatePropagation();
        composing = false;
        historyAt = 0;
        const base = compositionBase;
        compositionBase = null;
        const nativeHost=host(base.selection?.f||insertionPoint), nativeValue=nativeHost&&readEditorText(nativeHost), original=base.nativeText;
        const start=base.points[0]?.start??Math.min(base.selection?.a.offset??0,base.selection?.f.offset??0),end=base.points.at(-1)?.end??Math.max(base.selection?.a.offset??0,base.selection?.f.offset??0);
        const expected=original.slice(0,start)+(e.data??"")+original.slice(end);
        if(nativeHost&&nativeValue===expected){
          pull();
          const nativeSelection=currentSelection();
          if(nativeSelection){savedSelection=nativeSelection;insertionPoint={...nativeSelection.f};typingAt={...nativeSelection.f};}
        } else if(e.data) {
          blocks = base.blocks;
          textSelections = base.points;
          allDocumentSelected = base.all;
          const p =
            base.points.length || base.all
              ? removeSelection()
              : ensurePoint(base.selection?.f || insertionPoint);
          const style = {
            ...pointStyle({
              ...p,
              start: Math.max(0, p.offset - 1),
              end: p.offset,
            }),
            ...typingStyle,
          };
          const next = spliceText(p, p.offset, p.offset, e.data, style);
          render();
          if (next) select(next);
        } else pull();
        editSaved = false;
        document.dispatchEvent(
          new CustomEvent("editor-composition-state", {
            detail: { active: false },
          }),
        );
        document.dispatchEvent(new Event("editor-content-changed"));
      },
      true,
    );
    // Clipboard: use native PNG + DIB through the existing local bridge, plus
    // HTML/RTF for word processors and an app payload for lossless internal paste.
    window.addEventListener(
      "copy",
      (e) => {
        if (
          !lastEditorIntent ||
          (control(e.target) && !editor.contains(e.target))
        )
          return;
        const image = imageModel(activeImage);
        if (!image) return;
        stop(e);
        const b = {
            id: uid(),
            kind: "image",
            level: null,
            image: clone(image),
          },
          payload = D.convert([b], opts(), measure);
        e.clipboardData?.setData("text/html", payload.html);
        e.clipboardData?.setData("text/plain", "[이미지]");
        e.clipboardData?.setData(
          "application/x-ahk-document",
          JSON.stringify([b]),
        );
        fetch("copy-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, image: image.src }),
        })
          .then(async (r) => {
            if (!r.ok)
              throw Error((await r.json()).error || "이미지 복사 실패");
            status("이미지 복사 완료 · 다른 위치에서 Ctrl+V");
          })
          .catch((err) => status(err.message, true));
      },
      true,
    );
    let pasteMode = "merge";
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          inside(e) &&
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === "v"
        )
          pasteMode = e.shiftKey ? "text" : pasteMode;
      },
      true,
    );
    window.addEventListener(
      "paste",
      (e) => {
        if (!editor.contains(e.target) || control(e.target)) return;
        const clip = e.clipboardData;
        if (!clip) return;
        const raw = clip.getData("application/x-ahk-document"),
          html = clip.getData("text/html"),
          text = clip.getData("text/plain");
        if (
          !raw &&
          [...clip.items].some(
            (i) => i.kind === "file" && i.type.startsWith("image/"),
          ) &&
          !html
        ) {
          if (selectedTextPoints().length) {
            checkpoint();
            const p = removeSelection();
            render();
            select(p);
          }
          return;
        }
        if (!raw && !html && !text) return;
        stop(e);
        try {
          let list = raw
            ? JSON.parse(raw)
            : pasteMode === "text"
              ? null
              : D.parse(html, text, mode);
          if (!list) {
            commitText(text.replace(/\r\n?/g, "\n"), false);
            pasteMode = "merge";
            return;
          }
          if (pasteMode === "merge" && !raw) {
            const st = insertionStyle();
            for (const b of list) {
              if (b.kind === "table") {
                b.tableOptions = {
                  ...b.tableOptions,
                  fontFamily: st.fontFamily,
                  fontSize: st.fontSize,
                };
              } else if (b.kind !== "image") {
                b.style = {
                  ...b.style,
                  fontFamily: st.fontFamily,
                  fontSize: st.fontSize,
                  lineHeight: st.lineHeight,
                  paragraphGap: 0,
                };
              }
            }
          }
          checkpoint();
          const p = removeSelection();
          render();
          select(p);
          if (list.length === 1 && list[0].kind === "paragraph" && p.key) {
            const b = list[0];
            const next = spliceText(p, p.offset, p.offset, b.text, b.style);
            const d = data(next);
            d.marks.push(
              ...(b.marks || []).map((m) => ({
                ...m,
                start: m.start + p.offset,
                end: m.end + p.offset,
              })),
            );
            render();
            select(next);
          } else {
            modelTransaction = true;
            try {
              insertDocumentBlocks(list, false, p);
            } finally {
              modelTransaction = false;
            }
          }
        } catch (err) {
          status(err.message, true);
        } finally {
          pasteMode = paste.value;
        }
      },
      true,
    );
    window.addEventListener(
      "dragstart",
      (e) => {
        if (
          !editor.contains(e.target) ||
          e.target.closest(".image-box,.column-grip")
        )
          return;
        const ps = selectedTextPoints();
        if (!ps.length) return;
        dragPayload = {
          points: clone(ps),
          blocks: ps.map((p) => {
            const d = data(p);
            return {
              id: uid(),
              kind: "paragraph",
              literal: true,
              level: null,
              text: d.text.slice(p.start, p.end),
              style: pointStyle(p),
              marks: d.marks
                .filter((m) => m.end > p.start && m.start < p.end)
                .map((m) => ({
                  ...m,
                  start: Math.max(p.start, m.start) - p.start,
                  end: Math.min(p.end, m.end) - p.start,
                })),
            };
          }),
        };
        e.dataTransfer.setData("application/x-ahk-drag", "1");
        e.dataTransfer.effectAllowed = "copyMove";
      },
      true,
    );
    window.addEventListener(
      "dragover",
      (e) => {
        if (dragPayload && editor.contains(e.target)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
        }
      },
      true,
    );
    window.addEventListener(
      "drop",
      (e) => {
        if (!dragPayload || !editor.contains(e.target)) return;
        const p = hitPoint(e.clientX, e.clientY);
        if (!p) return;
        stop(e);
        const payload = dragPayload;
        dragPayload = null;
        if (
          payload.points.some(
            (q) =>
              q.id === p.id &&
              q.key === p.key &&
              p.offset >= q.start &&
              p.offset <= q.end,
          )
        )
          return;
        checkpoint();
        if (!e.ctrlKey) {
          for (const q of [...payload.points].reverse()) {
            spliceText(q, q.start, q.end, "");
            if (p.id === q.id && p.key === q.key && p.offset > q.end)
              p.offset -= q.end - q.start;
          }
        }
        let next = p;
        for (const [i, b] of payload.blocks.entries()) {
          if (i) next = spliceText(next, next.offset, next.offset, "\n");
          next = spliceText(next, next.offset, next.offset, b.text, b.style);
          const d = data(next);
          d.marks.push(
            ...b.marks.map((m) => ({
              ...m,
              start: m.start + next.offset - b.text.length,
              end: m.end + next.offset - b.text.length,
            })),
          );
        }
        render();
        select(next);
      },
      true,
    );
    window.addEventListener("dragend", () => (dragPayload = null), true);
    // Consume structural table commands once; no parallel legacy mutation.
    window.addEventListener(
      "editor-shell-command",
      (e) => {
        const c = e.detail;
        if (
          ["addRow", "deleteRow", "addColumn", "deleteColumn"].includes(c.type)
        ) {
          e.stopImmediatePropagation();
          mutateTable(c.type);
        }
        if (["mergeCells", "splitCells"].includes(c.type)) {
          e.stopImmediatePropagation();
          mergeCells(c.type === "splitCells");
        }
        if (c.type === "paragraphStyle") {
          e.stopImmediatePropagation();
          paragraphStyle(c.style);
        }
        if (c.type === "clearParagraph") {
          e.stopImmediatePropagation();
          paragraphStyle({
            indentLeftPt: 0,
            indentRightPt: 0,
            firstLinePt: 0,
            spaceBefore: 0,
            paragraphGap: 0,
            lineHeight: 1.5,
            lineHeightPt: null,
          });
        }
      },
      true,
    );
    document.addEventListener(
      "editor-content-changed",
      () => (lineCache = null),
    );
    document.addEventListener("editor-layout-ready", () => (lineCache = null));
    window.addEventListener(
      "editor-document-load",
      () => {
        document.querySelectorAll('.editor-context-menu,.inline-color-popover').forEach(n=>n.remove());
        insertionPoint = null;
        savedSelection = null;
        typingStyle = {};
        typingAt = null;
        historyAt = 0;
      },
      true,
    );
    document.addEventListener("selectionchange", () => {
      if (composing || marginDrag) return;
      const s = currentSelection();
      if (s) {
        savedSelection = s;
        insertionPoint = { ...s.f };
      }
    });
    editor.addEventListener("dblclick", (e) => {
      const h = hostOf(e.target);
      if (!h || h.matches(".insert-slot")) return;
      const s = currentSelection();
      if (s) savedSelection = s;
    });
    editor.addEventListener("mousedown", (e) => {
      if (e.target !== editor || e.button !== 0) return;
      const last = [...editor.querySelectorAll(":scope > .doc-block")].at(-1);
      if (last && e.clientY > last.getBoundingClientRect().bottom) {
        checkpoint();
        const b = {
          id: uid(),
          kind: "paragraph",
          level: null,
          literal: true,
          text: "",
          style: { ...baseStyle, paragraphGap: 0 },
        };
        blocks.push(b);
        render();
        select({ id: b.id, key: null, offset: 0 });
      }
    });
    // Compact, discoverable controls reuse existing commands instead of adding
    // separate formatting implementations.
    const group = document.createElement("div");
    group.className = "property-section editor-interaction-settings";
    const title = document.createElement("h3");
    title.textContent = "문단 · 붙여넣기";
    group.append(title);
    for (const [label, key, value] of [
      ["문단 앞 간격 (pt)", "spaceBefore", 0],
      ["왼쪽 들여쓰기 (pt)", "indentLeftPt", 0],
      ["첫 줄 들여쓰기 (pt)", "firstLinePt", 0],
    ]) {
      const l = document.createElement("label"),
        input = document.createElement("input");
      input.type = "number";
      input.min = key === "firstLinePt" ? -100 : 0;
      input.max = 300;
      input.value = value;
      input.setAttribute("aria-label", label);
      l.append(label, input);
      input.onchange = () =>
        paragraphStyle({
          [key]: Math.max(+input.min, Math.min(+input.max, +input.value || 0)),
        });
      group.append(l);
    }
    for (const [label, key] of [
      ["셀 좌우 여백 (px)", "padX"],
      ["셀 상하 여백 (px)", "padY"],
    ]) {
      const l = document.createElement("label"),
        input = document.createElement("input");
      input.type = "number";
      input.min = 0;
      input.max = 40;
      input.value = key === "padX" ? 3 : 2;
      input.setAttribute("aria-label", label);
      l.append(label, input);
      input.onchange = () => {
        const p = currentSelection()?.f || insertionPoint;
        if (!selectedRects().length && p?.key) {
          const [r, c] = p.key.split(":").map(Number);
          cellRect = { id: p.id, r1: r, r2: r, c1: c, c2: c };
        }
        applyCells({ [key]: Math.max(0, Math.min(40, +input.value || 0)) });
      };
      group.append(l);
    }
    const styleSelect = document.createElement("select");
    styleSelect.setAttribute("aria-label", "문단 스타일");
    styleSelect.append(
      new Option("스타일 선택", ""),
      new Option("본문", "body"),
      new Option("제목 1", "h1"),
      new Option("제목 2", "h2"),
    );
    styleSelect.onchange = () => {
      const type = styleSelect.value;
      if (!type) return;
      paragraphStyle(
        type === "body"
          ? {
              fontSize: 10,
              bold: false,
              spaceBefore: 0,
              paragraphGap: 0,
              lineHeight: 1.5,
            }
          : {
              fontSize: type === "h1" ? 16 : 13,
              bold: true,
              spaceBefore: 12,
              paragraphGap: 6,
              lineHeight: 1.4,
              keepWithNext: true,
            },
      );
      styleSelect.value = "";
    };
    group.append(styleSelect);
    const paste = document.createElement("select");
    paste.setAttribute("aria-label", "붙여넣기 방식");
    for (const [v, t] of [
      ["merge", "문서 서식에 맞춤"],
      ["source", "원본 서식 유지"],
      ["text", "텍스트만"],
    ])
      paste.append(new Option(t, v));
    paste.onchange = () => (pasteMode = paste.value);
    group.append(paste);
    for (const [label, fn] of [
      [
        "글자 모양 초기화",
        () =>
          applyCharacterStyle({
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            color: "#000000",
            background: "transparent",
            fontSize: baseStyle.fontSize,
            fontFamily: baseStyle.fontFamily,
            fontScale: 100,
            letterSpacing: 0,
          }),
      ],
      [
        "문단 모양 초기화",
        () =>
          paragraphStyle({
            indentLeftPt: 0,
            indentRightPt: 0,
            firstLinePt: 0,
            spaceBefore: 0,
            paragraphGap: 0,
            lineHeight: 1.5,
            lineHeightPt: null,
          }),
      ],
      [
        "표 왼쪽 맞춤",
        () => {
          const b =
            blockById(insertionPoint?.id) ||
            blocks.find((b) => b.kind === "table" && selected.has(b.id));
          if (b?.kind === "table") {
            checkpoint();
            tableOptions(b).tableAlign = "left";
            render();
          }
        },
      ],
      [
        "첫 열 글자 왼쪽 맞춤",
        () => {
          const b =
            blockById(insertionPoint?.id) ||
            blocks.find((b) => b.kind === "table" && selected.has(b.id));
          if (b?.kind === "table") {
            checkpoint();
            const o = tableOptions(b);
            o.cellStyles ||= {};
            for (let r = 0; r < b.rows.length; r++)
              o.cellStyles[r + ":0"] = {
                ...o.cellStyles[r + ":0"],
                padX: 0,
                align: "left",
              };
            render();
          }
        },
      ],
      ["셀 병합", () => mergeCells()],
      ["셀 나누기", () => mergeCells(true)],
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = fn;
      group.append(b);
    }
    const mountSettings = () =>
      document.querySelector(".shell-properties")?.append(group);
    if (document.querySelector(".shell-properties")) mountSettings();
    else
      document.addEventListener("DOMContentLoaded", mountSettings, {
        once: true,
      });
    window.EditorDOM = {
      ...window.EditorDOM,
      selection: currentSelection,
      visualLines,
      selectPoint: select,
    };
  }

  document.addEventListener("editor-export-request", (e) => {
    pull();
    const ps = selectedTextPoints(),
      out = [],
      rects = selectedRects();
    if (imageModel(activeImage)) {
      out.push({
        id: "export-image",
        kind: "image",
        level: null,
        image: clone(imageModel(activeImage)),
      });
    } else if (rects.length && !allDocumentSelected) {
      for (const r of rects) {
        const b = clone(blockById(r.id)),
          o = (b.tableOptions ||= {});
        b.rows = b.rows
          .slice(r.r1, r.r2 + 1)
          .map((row) => row.slice(r.c1, r.c2 + 1));
        for (const f of [
          "cellStyles",
          "cellMarks",
          "cellLinks",
          "cellImages",
          "cellParagraphs",
        ]) {
          const values = {};
          for (let row = r.r1; row <= r.r2; row++)
            for (let col = r.c1; col <= r.c2; col++)
              if (o[f]?.[row + ":" + col])
                values[row - r.r1 + ":" + (col - r.c1)] = o[f][row + ":" + col];
          o[f] = values;
        }
        o.merges = (o.merges || [])
          .filter(
            (m) =>
              m.row >= r.r1 &&
              m.col >= r.c1 &&
              m.row + m.rowSpan - 1 <= r.r2 &&
              m.col + m.colSpan - 1 <= r.c2,
          )
          .map((m) => ({ ...m, row: m.row - r.r1, col: m.col - r.c1 }));
        if (o.widths) o.widths = o.widths.slice(r.c1, r.c2 + 1);
        b.headerRows = (b.headerRows || [])
          .filter((row) => row >= r.r1 && row <= r.r2)
          .map((row) => row - r.r1);
        out.push(b);
      }
    } else
      for (const b of blocks) {
        const points = ps.filter((p) => p.id === b.id);
        if (allDocumentSelected || (sectionSelection && selected.has(b.id))) {
          out.push(clone(b));
          continue;
        }
        if (b.kind === "table" && points.length) {
          const rows = [
            ...new Set(
              points.filter((p) => p.key).map((p) => +p.key.split(":")[0]),
            ),
          ];
          if (rows.length) {
            const copy = clone(b);
            copy.rows = b.rows.slice(Math.min(...rows), Math.max(...rows) + 1);
            out.push(copy);
          }
          continue;
        }
        if (b.kind === "image") {
          const sel = getSelection();
          if (
            sel?.rangeCount &&
            sel
              .getRangeAt(0)
              .intersectsNode(editor.querySelector('[data-id="' + b.id + '"]'))
          )
            out.push(clone(b));
          continue;
        }
        for (const p of points) {
          const crop = (rs) =>
            (rs || [])
              .filter((m) => m.end > p.start && m.start < p.end)
              .map((m) => ({
                ...m,
                start: Math.max(p.start, m.start) - p.start,
                end: Math.min(p.end, m.end) - p.start,
              }));
          out.push({
            ...clone(b),
            text: b.text.slice(p.start, p.end),
            style: pointStyle(p),
            marks: crop(b.marks),
            links: crop(b.links),
            inlineImages: (b.inlineImages || [])
              .filter((i) => i.offset >= p.start && i.offset <= p.end)
              .map((i) => ({ ...i, offset: i.offset - p.start })),
          });
        }
      }
    e.detail({ ...snapshot(), blocks: out });
  });
  installEditorInteractions();
  lastSettings = settings();
  render();
})();
