(function () {
  "use strict";

  if (window.__latexExtComposer) return;
  window.__latexExtComposer = true;

  const Core = window.LatexCore;
  if (!Core) return;

  const EDITOR_SEL = '[data-slate-editor="true"], [role="textbox"][contenteditable="true"]';
  const SKIP_SEL =
    "[data-slate-spacer], [data-slate-zero-width], [class*='hiddenVisually'], [aria-hidden='true']";
  const states = new WeakMap();
  let bound = false;

  function isComposerEditor(editor) {
    return !!editor.closest('[class*="channelTextArea"]');
  }

  function findButtons(editor) {
    const scope = editor.closest('[class*="channelTextArea"]');
    if (!scope) return null;
    return scope.querySelector('[class*="buttons"], [class*="Buttons"]');
  }

  function editorFromTarget(target) {
    let el = target;
    if (el && el.nodeType === 3) el = el.parentElement;
    if (!(el instanceof Element)) return null;
    return el.closest(EDITOR_SEL);
  }

  function sanitizeForEditor(s) {
    return String(s).replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");
  }

  function getComposerText(editor) {
    const clone = editor.cloneNode(true);

    clone
      .querySelectorAll("img.emoji, [data-type='emoji']")
      .forEach((el) => {
        const name =
          el.getAttribute("data-name") || el.getAttribute("alt") || "";
        el.replaceWith(document.createTextNode(name));
      });

    clone.querySelectorAll(SKIP_SEL).forEach((el) => el.remove());

    clone.querySelectorAll("br").forEach((br) => {
      br.replaceWith(document.createTextNode("\n"));
    });

    const blocks = Array.from(clone.children).filter((el) => {
      const nodeType = el.getAttribute && el.getAttribute("data-slate-node");
      return (
        nodeType === "element" ||
        el.tagName === "DIV" ||
        el.tagName === "P"
      );
    });
    if (blocks.length > 1) {
      blocks.slice(1).forEach((el) => {
        el.parentNode.insertBefore(document.createTextNode("\n"), el);
      });
    }

    clone.querySelectorAll("[data-slate-zero-width]").forEach((el) => {
      el.remove();
    });

    return sanitizeForEditor(clone.textContent || "").replace(/\n+$/, "");
  }

  function getComposerTextStrict(editor) {
    return getComposerText(editor).replace(/\n$/, "");
  }

  function isSkippedTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest(SKIP_SEL)) return true;
    if (parent.hasAttribute && parent.hasAttribute("data-slate-zero-width")) {
      return true;
    }
    let p = parent;
    while (p && p !== node.ownerDocument) {
      if (p.hasAttribute && p.hasAttribute("data-slate-zero-width")) return true;
      p = p.parentElement;
    }
    return false;
  }

  function cleanTextLen(s) {
    return String(s).replace(/\uFEFF/g, "").length;
  }

  function cleanString(s) {
    return String(s).replace(/\uFEFF/g, "");
  }

  function findTextPos(root, targetOffset) {
    if (targetOffset <= 0) {
      const firstWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return isSkippedTextNode(node)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      const first = firstWalker.nextNode();
      return first ? { node: first, offset: 0 } : null;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isSkippedTextNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    let acc = 0;
    let node;
    let last = null;
    while ((node = walker.nextNode())) {
      last = node;
      const raw = node.nodeValue || "";
      const clean = cleanString(raw);
      const cleanLen = clean.length;
      if (cleanLen === 0) continue;
      if (acc + cleanLen >= targetOffset) {
        const delta = targetOffset - acc;
        let rawOffset = 0;
        let seen = 0;
        while (rawOffset < raw.length && seen < delta) {
          if (raw[rawOffset] !== "\uFEFF") seen++;
          rawOffset++;
        }
        return { node, offset: rawOffset };
      }
      acc += cleanLen;
    }
    if (last) {
      const raw = last.nodeValue || "";
      let rawOffset = raw.length;
      while (rawOffset > 0 && raw[rawOffset - 1] === "\uFEFF") rawOffset--;
      return { node: last, offset: rawOffset };
    }
    return null;
  }

  function displayFor(state) {
    if (state.mode === "disabled" || !Core.settings.live) return state.original;
    if (state.mode === "latin") return Core.decodeToLatin(state.original);
    if (state.mode === "latex") return Core.encodeToLatex(state.original);
    return state.original;
  }

  function translateChunk(text, mode) {
    return mode === "latin" ? Core.decodeToLatin(text) : Core.encodeToLatex(text);
  }

  function selectAll(editor) {
    editor.focus();
    try {
      document.execCommand("selectAll");
      const sel = window.getSelection();
      if (
        sel &&
        sel.rangeCount &&
        sel.getRangeAt(0).toString().length > 0
      ) {
        return true;
      }
    } catch (_) {}

    const sel = window.getSelection();
    if (!sel) return false;
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function moveCursorToEnd(editor) {
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isSkippedTextNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    let last = null;
    let n;
    while ((n = walker.nextNode())) last = n;
    const range = document.createRange();
    if (last) {
      range.setStart(last, last.nodeValue.length);
      range.collapse(true);
    } else {
      const fallback = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const first = fallback.nextNode();
      if (first) {
        range.setStart(first, first.nodeValue.length);
        range.collapse(true);
      } else {
        range.selectNodeContents(editor);
        range.collapse(false);
      }
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function placeholderVisible(editor) {
    const scope = editor.parentElement || editor;
    const ph =
      (scope.parentElement &&
        scope.parentElement.querySelector('[data-slate-placeholder="true"]')) ||
      scope.querySelector('[data-slate-placeholder="true"]') ||
      editor.querySelector('[data-slate-placeholder="true"]');
    if (!ph) return false;
    if (typeof window.getComputedStyle === "function") {
      const cs = window.getComputedStyle(ph);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) {
        return false;
      }
    }
    return true;
  }

  function stripRootOrphans(editor) {
    const removed = [];
    [...editor.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        if ((child.nodeValue || "").replace(/\uFEFF/g, "")) {
          removed.push(child.nodeValue);
          child.remove();
        }
        return;
      }
      if (child.nodeType === 1 && !child.hasAttribute("data-slate-node")) {
        const hasSlate = child.querySelector("[data-slate-node]");
        if (!hasSlate && !child.hasAttribute("data-slate-editor")) {
          if ((child.textContent || "").trim()) {
            removed.push(child.textContent);
            child.remove();
          }
        }
      }
    });
    return removed;
  }

  function stripRootOrphansIfStructure(editor) {
    const hasSlateStructure = !!editor.querySelector("[data-slate-node]");
    const hasRootText = [...editor.childNodes].some(
      (c) => c.nodeType === 3 && (c.nodeValue || "").replace(/\uFEFF/g, "")
    );
    if (hasSlateStructure && hasRootText) {
      [...editor.childNodes].forEach((c) => {
        if (c.nodeType === 3 && (c.nodeValue || "").replace(/\uFEFF/g, "")) {
          c.remove();
        }
      });
    }
  }

  function withApplying(editor, fn) {
    const st = states.get(editor);
    if (st) st.applying = true;
    try {
      fn();
    } finally {
      if (st) st.applying = false;
    }
  }

  function exec(cmd, value) {
    try {
      if (value === undefined) return document.execCommand(cmd);
      return document.execCommand(cmd, false, value);
    } catch (_) {
      return false;
    }
  }

  function setComposerText(editor, text) {
    const clean = sanitizeForEditor(text);
    if (getComposerTextStrict(editor) === clean) {
      moveCursorToEnd(editor);
      return true;
    }

    editor.focus();
    let handled = false;
    withApplying(editor, () => {
      selectAll(editor);
      handled = dispatchBeforeInput(editor, "insertText", clean);
      if (!handled) {
        selectAll(editor);
        if (clean === "") exec("delete");
        else exec("insertText", clean);
      }
    });
    moveCursorToEnd(editor);
    return getComposerTextStrict(editor) === clean;
  }

  function dispatchBeforeInput(editor, inputType, data) {
    let ev;
    try {
      ev = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType,
        data
      });
    } catch (_) {
      ev = new Event("beforeinput", { bubbles: true, cancelable: true });
      ev.inputType = inputType;
      ev.data = data;
    }
    return editor.dispatchEvent(ev) === false;
  }

  function trySetInputData(e, value) {
    try {
      Object.defineProperty(e, "data", {
        value,
        configurable: true,
        writable: true
      });
      if (e.data === value) return true;
    } catch (_) {}
    try {
      e.data = value;
      if (e.data === value) return true;
    } catch (_) {}
    return false;
  }

  function selectionOffsets(editor) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(editor);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = cleanTextLen(pre.toString());
    const end = start + cleanTextLen(range.toString());
    return { start, end, collapsed: range.collapsed };
  }

  function replaceRange(editor, start, end, replacement) {
    const p1 = findTextPos(editor, start);
    const p2 = findTextPos(editor, end);
    if (!p1 || !p2) return false;
    const range = document.createRange();
    try {
      range.setStart(p1.node, p1.offset);
      range.setEnd(p2.node, p2.offset);
    } catch (_) {
      return false;
    }
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    withApplying(editor, () => {
      if (replacement === "") exec("delete");
      else exec("insertText", sanitizeForEditor(replacement));
    });
    return true;
  }

  function cursorOffsetInEditor(editor) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
      return getComposerTextStrict(editor).length;
    }
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(editor);
    pre.setEnd(range.startContainer, range.startOffset);
    return cleanTextLen(pre.toString());
  }

  function computeDiff(expected, current) {
    if (current === expected) return null;
    if (current.length > expected.length && current.startsWith(expected)) {
      return {
        kind: "insert",
        at: expected.length,
        text: current.slice(expected.length)
      };
    }
    if (expected.startsWith(current)) {
      return {
        kind: "delete",
        at: current.length,
        count: expected.length - current.length
      };
    }
    let p = 0;
    const n = Math.min(expected.length, current.length);
    while (p < n && expected[p] === current[p]) p++;
    let eE = expected.length;
    let eC = current.length;
    while (eE > p && eC > p && expected[eE - 1] === current[eC - 1]) {
      eE--;
      eC--;
    }
    if (eE === p) {
      return { kind: "insert", at: p, text: current.slice(p, eC) };
    }
    if (eC === p) {
      return { kind: "delete", at: p, count: eE - p };
    }
    return {
      kind: "replace",
      at: p,
      endExpected: eE,
      text: current.slice(p, eC)
    };
  }

  function applyDiffToOriginal(state, diff) {
    if (diff.kind === "insert") {
      state.original =
        state.original.slice(0, diff.at) +
        diff.text +
        state.original.slice(diff.at);
    } else if (diff.kind === "delete") {
      state.original =
        state.original.slice(0, diff.at) +
        state.original.slice(diff.at + diff.count);
    } else if (diff.kind === "replace") {
      const oldLen = diff.endExpected - diff.at;
      state.original =
        state.original.slice(0, diff.at) +
        diff.text +
        state.original.slice(diff.at + oldLen);
    }
  }

  function setEncodingLabel(btn, mode) {
    btn.dataset.mode = mode;
    btn.textContent =
      mode === "latin"
        ? "Encoding to Latin"
        : mode === "latex"
          ? "Encoding to Latex"
          : "Encoding disabled";
  }

  function setAutoLabel(btn) {
    const mode = Core.settings.auto;
    btn.dataset.state = mode === "off" ? "off" : "on";
    btn.dataset.auto = mode;
    btn.textContent = Core.autoLabel(mode);
  }

  function setBulkLabel(btn) {
    const bulk = window.__latexExtBulk;
    const on = !!(bulk && bulk.anyApplied && bulk.anyApplied());
    btn.dataset.state = on ? "on" : "off";
    btn.textContent = on ? "Restore all" : "Encode all";
  }

  function setTitleText(panel) {
    const title = panel.querySelector(".latex-ext-title");
    if (!title) return;
    let t = "LATEX v" + Core.VERSION;
    if (Core.stats.messages > 0) t += " · " + Core.stats.messages;
    title.textContent = t;
  }

  function refreshAllPanels() {
    document
      .querySelectorAll('[data-latex-ext="panel"]')
      .forEach(refreshPanelLabels);
  }
  window.__latexExtBulkRefresh = refreshAllPanels;

  function refreshPanelLabels(panel) {
    const editor = panel._latexEditor;
    const state = editor ? states.get(editor) : null;
    const enc = panel.querySelector('[data-latex-ext="composer"]');
    const auto = panel.querySelector('[data-latex-ext="auto"]');
    const bulk = panel.querySelector('[data-latex-ext="bulk"]');
    if (enc) setEncodingLabel(enc, state ? state.mode : "disabled");
    if (auto) setAutoLabel(auto);
    if (bulk) setBulkLabel(bulk);
    setTitleText(panel);
  }

  function getState(editor) {
    let s = states.get(editor);
    if (!s) {
      s = {
        mode: "disabled",
        original: getComposerTextStrict(editor),
        applying: false,
        sending: false,
        pendingSend: false,
        pasteRaw: null
      };
      states.set(editor, s);
    }
    return s;
  }

  function cycleMode(mode) {
    if (mode === "disabled") return "latin";
    if (mode === "latin") return "latex";
    return "disabled";
  }

  function handleToggle(editor, btn) {
    const state = getState(editor);
    if (placeholderVisible(editor)) {
      stripRootOrphans(editor);
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
    } else {
      const currentBefore = getComposerTextStrict(editor);
      if (currentBefore === "") {
        state.original = "";
        state.sending = false;
        state.pendingSend = false;
      } else if (state.mode === "disabled" || !Core.settings.live) {
        state.original = currentBefore;
      }
    }
    state.mode = cycleMode(state.mode);
    setEncodingLabel(btn, state.mode);

    const display = displayFor(state);
    const current = getComposerTextStrict(editor);
    if (display === current) return;
    setComposerText(editor, display);
  }

  function recoverOriginal(state, current) {
    if (state.mode === "latex") return Core.decodeToLatin(current);
    return current;
  }

  function handleAutoToggle() {
    const next = Core.cycleAuto(Core.settings.auto);
    const wasLive = Core.settings.live;
    const willLive = next !== "off";

    if (wasLive !== willLive) {
      document.querySelectorAll(EDITOR_SEL).forEach((editor) => {
        const state = states.get(editor);
        if (!state) return;
        if (syncIfEmpty(editor, state)) return;
        const current = getComposerTextStrict(editor);
        if (!current) {
          state.sending = false;
          state.pendingSend = false;
          return;
        }
        const wasSending = state.sending || state.pendingSend;
        state.sending = false;
        state.pendingSend = false;
        if (!wasLive) {
          if (!wasSending) state.original = current;
        } else {
          const expected = displayFor(state);
          if (current !== expected) {
            state.original = recoverOriginal(state, current);
          }
        }
      });
    }

    Core.setAuto(next);

    if (wasLive !== willLive) {
      document.querySelectorAll(EDITOR_SEL).forEach((editor) => {
        const state = states.get(editor);
        if (!state) return;
        if (syncIfEmpty(editor, state)) return;
        const display = displayFor(state);
        const current = getComposerTextStrict(editor);
        if (display !== current) setComposerText(editor, display);
      });
    }

    refreshAllPanels();
    Core.notifySettings();
  }

  function handleBulkToggle() {
    const bulk = window.__latexExtBulk;
    if (!bulk) return;
    if (bulk.anyApplied()) bulk.restoreAll();
    else bulk.encodeAll();
    refreshAllPanels();
  }

  function prepareSend(editor, state) {
    if (state.mode === "disabled" || Core.settings.live) return;
    const raw = getComposerTextStrict(editor);
    if (!raw) {
      state.original = "";
      return;
    }
    const target =
      state.mode === "latin" ? Core.decodeToLatin(raw) : Core.encodeToLatex(raw);
    if (raw === target) return;
    state.original = raw;
    state.sending = true;
    Core.bumpMessages(1);
    refreshAllPanels();
    setComposerText(editor, target);
  }

  function scheduleSendClear(editor, state) {
    state.pendingSend = true;
    const tryClear = () => clearCacheIfEmpty(editor, state);
    tryClear();
    [0, 50, 150, 400, 800].forEach((ms) => setTimeout(tryClear, ms));
  }

  function syncOriginalOnly(editor, state) {
    if (state.applying || state.mode === "disabled") return;
    const expected = displayFor(state);
    const current = getComposerTextStrict(editor);
    if (current === expected) return;
    const diff = computeDiff(expected, current);
    if (!diff) return;
    applyDiffToOriginal(state, diff);
  }

  function scheduleOriginalSync(editor, state) {
    setTimeout(() => syncOriginalOnly(editor, state), 0);
  }

  function insertRangeInOriginal(state, start, end, rawText) {
    state.original =
      state.original.slice(0, start) + rawText + state.original.slice(end);
  }

  function handleBeforeInput(e) {
    const editor = editorFromTarget(e.target);
    if (!editor) return;
    const state = states.get(editor);
    if (!state || state.applying) return;
    state.sending = false;
    if (state.mode === "disabled" || !Core.settings.live) return;

    const t = e.inputType || "";
    if (e.isComposing || t === "insertCompositionText") return;

    if (t === "insertText" && e.data != null) {
      const raw = e.data;
      const selOff = selectionOffsets(editor);
      const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
      const end = selOff && !selOff.collapsed ? selOff.end : start;
      insertRangeInOriginal(state, start, end, raw);
      const translated = translateChunk(raw, state.mode);
      if (translated !== raw && !trySetInputData(e, translated)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (dispatchBeforeInput(editor, "insertText", translated)) {
          withApplying(editor, () => {
            exec("insertText", translated);
          });
        }
      }
      return;
    }

    if (t === "insertLineBreak" || t === "insertParagraph") {
      const selOff = selectionOffsets(editor);
      const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
      const end = selOff && !selOff.collapsed ? selOff.end : start;
      insertRangeInOriginal(state, start, end, "\n");
      return;
    }

    if (t === "insertFromPaste" || t === "insertFromDrop") {
      let pasted = "";
      try {
        pasted = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      } catch (_) {}
      if (!pasted && typeof e.data === "string") pasted = e.data;

      const rawFromPaste = state.pasteRaw;
      state.pasteRaw = null;
      clearTimeout(state.pasteRawTimer);

      const raw = rawFromPaste || pasted;
      if (!raw) return;

      if (!rawFromPaste) {
        const sel0 = selectionOffsets(editor);
        const start0 = sel0 ? sel0.start : cursorOffsetInEditor(editor);
        const end0 = sel0 && !sel0.collapsed ? sel0.end : start0;
        insertRangeInOriginal(state, start0, end0, raw);
      }

      const translated = translateChunk(raw, state.mode);
      if (pasted === translated) return;

      if (e.dataTransfer) {
        try {
          e.dataTransfer.setData("text/plain", translated);
        } catch (_) {}
      }
      if (trySetInputData(e, translated)) return;
      try {
        if (
          e.dataTransfer &&
          e.dataTransfer.getData("text/plain") === translated
        ) {
          return;
        }
      } catch (_) {}

      e.preventDefault();
      e.stopImmediatePropagation();
      const selOff = selectionOffsets(editor);
      const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
      const end = selOff && !selOff.collapsed ? selOff.end : start;
      replaceRange(editor, start, end, translated);
      return;
    }

    if (t.startsWith("delete") || t.startsWith("history")) {
      scheduleOriginalSync(editor, state);
    }
  }

  function handlePaste(e) {
    const editor = editorFromTarget(e.target);
    if (!editor) return;
    const state = states.get(editor);
    if (!state || state.applying || state.mode === "disabled") return;
    if (!Core.settings.live) return;

    const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    if (!text) return;

    state.pasteRaw = text;
    clearTimeout(state.pasteRawTimer);
    state.pasteRawTimer = setTimeout(() => {
      state.pasteRaw = null;
    }, 500);

    const selOff = selectionOffsets(editor);
    const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
    const end = selOff && !selOff.collapsed ? selOff.end : start;
    insertRangeInOriginal(state, start, end, text);

    const translated = translateChunk(text, state.mode);
    if (translated !== text && e.clipboardData) {
      try {
        e.clipboardData.setData("text/plain", translated);
      } catch (_) {}
    }
  }

  function clearCacheIfEmpty(editor, state) {
    if (placeholderVisible(editor)) {
      stripRootOrphans(editor);
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
      return;
    }
    if (getComposerTextStrict(editor) === "") {
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
    }
  }

  function syncIfEmpty(editor, state) {
    if (placeholderVisible(editor)) {
      stripRootOrphans(editor);
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
      return true;
    }
    if (getComposerTextStrict(editor) === "") {
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
      return true;
    }
    return false;
  }

  function onEditorInput(editor, state) {
    if (state.applying) return;

    if (syncIfEmpty(editor, state)) return;

    if (state.sending) return;

    stripRootOrphansIfStructure(editor);

    if (state.mode === "disabled" || !Core.settings.live) {
      state.original = getComposerTextStrict(editor);
      return;
    }

    const expected = displayFor(state);
    const current = getComposerTextStrict(editor);
    if (current === expected) return;

    const diff = computeDiff(expected, current);
    if (!diff) return;

    if (diff.kind === "delete") {
      applyDiffToOriginal(state, diff);
      return;
    }

    applyDiffToOriginal(state, diff);
    const replacement = translateChunk(diff.text, state.mode);
    replaceRange(editor, diff.at, diff.at + diff.text.length, replacement);
  }

  function prepareSendFromEvent(e) {
    const editor = editorFromTarget(e.target);
    if (!editor) return;
    const state = states.get(editor);
    if (!state || state.applying) return;
    prepareSend(editor, state);
  }

  function onCompositionEnd(e) {
    const editor = editorFromTarget(e.target);
    if (!editor) return;
    const state = states.get(editor);
    if (!state || state.applying) return;
    if (state.mode === "disabled" || !Core.settings.live) {
      state.original = getComposerTextStrict(editor);
      return;
    }
    const current = getComposerTextStrict(editor);
    if (!current) {
      state.original = "";
      return;
    }
    state.original = recoverOriginal(state, current);
    const display = displayFor(state);
    if (display !== current) setComposerText(editor, display);
  }

  function bindGlobal() {
    if (bound) return;
    bound = true;
    window.addEventListener("beforeinput", handleBeforeInput, true);
    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("compositionend", onCompositionEnd, true);
    window.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const k = e.key || "";
      if (k !== "L" && k !== "l") return;
      e.preventDefault();
      let editor = editorFromTarget(document.activeElement);
      if (!editor || !isComposerEditor(editor)) {
        editor = null;
        document.querySelectorAll(EDITOR_SEL).forEach((ed) => {
          if (!editor && isComposerEditor(ed)) editor = ed;
        });
      }
      if (!editor) return;
      let encBtn = null;
      document.querySelectorAll('[data-latex-ext="panel"]').forEach((p) => {
        if (p._latexEditor === editor) {
          encBtn = p.querySelector('[data-latex-ext="composer"]');
        }
      });
      if (!encBtn) encBtn = document.querySelector('[data-latex-ext="composer"]');
      if (encBtn) handleToggle(editor, encBtn);
    });
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          e.key !== "Enter" ||
          e.shiftKey ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey
        ) {
          return;
        }
        prepareSendFromEvent(e);
        const editor = editorFromTarget(e.target);
        if (!editor) return;
        const state = states.get(editor);
        if (!state) return;
        if (getComposerTextStrict(editor) !== "") {
          scheduleSendClear(editor, state);
        } else {
          clearCacheIfEmpty(editor, state);
        }
      },
      true
    );
    window.addEventListener(
      "mousedown",
      (e) => {
        const el = e.target;
        if (!(el instanceof Element)) return;
        const btn = el.closest("button, [role='button']");
        if (!btn || btn.closest("[data-latex-ext]")) return;
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const isSend =
          btn.matches('button[type="submit"]') ||
          aria.includes("send") ||
          aria.includes("enviar");
        if (!isSend) return;
        const scope =
          btn.closest("form") || btn.closest('[class*="channelTextArea"]');
        const editor = scope && scope.querySelector(EDITOR_SEL);
        if (!editor) return;
        const state = states.get(editor);
        if (state) prepareSend(editor, state);
      },
      true
    );
  }

  function ensurePanel(editor) {
    if (!editor.isConnected || !isComposerEditor(editor)) return;

    const host = findButtons(editor);
    if (!host) return;

    bindGlobal();

    const state = getState(editor);
    if (state.pendingSend || state.sending) clearCacheIfEmpty(editor, state);

    let panel = host.querySelector('[data-latex-ext="panel"]');
    if (panel && panel._latexEditor === editor) {
      if (!host.contains(panel)) host.prepend(panel);
      refreshPanelLabels(panel);
      return;
    }
    if (panel) panel.remove();
    host
      .querySelectorAll(':scope > [data-latex-ext="composer"]')
      .forEach((b) => b.remove());

    panel = document.createElement("div");
    panel.className = "latex-ext-panel";
    panel.dataset.latexExt = "panel";
    panel._latexEditor = editor;

    const title = document.createElement("span");
    title.className = "latex-ext-title";
    title.textContent = "LATEX v" + Core.VERSION;
    panel.appendChild(title);

    const encBtn = document.createElement("button");
    encBtn.type = "button";
    encBtn.className = "latex-ext-btn";
    encBtn.dataset.latexExt = "composer";
    encBtn.title = "Cycle encoding mode (Ctrl+Shift+L)";
    encBtn.setAttribute("aria-label", "Cycle encoding mode");
    encBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToggle(editor, encBtn);
    });
    panel.appendChild(encBtn);

    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.className = "latex-ext-btn";
    autoBtn.dataset.latexExt = "auto";
    autoBtn.title = "Auto: off, outbound only, or outbound+messages";
    autoBtn.setAttribute("aria-label", "Auto mode");
    autoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAutoToggle();
    });
    panel.appendChild(autoBtn);

    const bulkBtn = document.createElement("button");
    bulkBtn.type = "button";
    bulkBtn.className = "latex-ext-btn";
    bulkBtn.dataset.latexExt = "bulk";
    bulkBtn.title = "Encode or restore all visible messages";
    bulkBtn.setAttribute("aria-label", "Encode or restore all messages");
    bulkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleBulkToggle();
    });
    panel.appendChild(bulkBtn);

    refreshPanelLabels(panel);

    if (!editor._latexExtBound) {
      editor._latexExtBound = true;
      editor.addEventListener("input", () => {
        const st = states.get(editor);
        if (st) onEditorInput(editor, st);
      });

      const form = editor.closest("form");
      if (form && !form._latexExtBound) {
        form._latexExtBound = true;
        form.addEventListener("submit", () => {
          const st = states.get(editor);
          if (st) setTimeout(() => clearCacheIfEmpty(editor, st), 0);
        });
      }
    }

    host.prepend(panel);
  }

  function scan() {
    Core.injectStyles(Core.BUTTON_CSS);
    document.querySelectorAll(EDITOR_SEL).forEach(ensurePanel);
    ensureEditEditors();
    refreshAllPanels();
  }

  function isEditEditor(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('[class*="channelTextArea"]')) return false;
    if (el.closest('[class*="editing"]')) return true;
    return false;
  }

  function ensureEditEditors() {
    const sel =
      'textarea, [contenteditable="true"][role="textbox"], [data-slate-editor="true"]';
    document.querySelectorAll(sel).forEach((ed) => {
      if (!isEditEditor(ed)) return;

      const li = ed.closest('[id^="chat-messages-"]');
      const mst =
        li && window.__latexExtMsgState ? window.__latexExtMsgState(li) : null;
      let mode = "disabled";
      if (mst && mst.displayMode === "latex") mode = "latex";
      else if (mst && mst.displayMode === "latin") mode = "latin";

      const read = () =>
        ed.tagName === "TEXTAREA" ? ed.value : getComposerTextStrict(ed);
      const write = (v) => {
        if (ed.tagName === "TEXTAREA") ed.value = v;
        else setComposerText(ed, v);
      };

      if (ed._latexExtEditBound) {
        const st = states.get(ed);
        if (!st) return;
        const wasMode = st.mode;
        st.mode = mode;
        if (mode !== "disabled" && wasMode === "disabled") {
          st.original = read();
          const display = displayFor(st);
          if (display !== st.original) write(display);
        }
        return;
      }

      ed._latexExtEditBound = true;
      const state = {
        mode,
        original: read(),
        applying: false,
        sending: false,
        pendingSend: false,
        pasteRaw: null
      };
      states.set(ed, state);
      if (mode !== "disabled") {
        const display = displayFor(state);
        if (display !== state.original) write(display);
      }

      if (!ed._latexExtBound) {
        ed._latexExtBound = true;
        if (ed.tagName !== "TEXTAREA") {
          ed.addEventListener("input", () => {
            const st = states.get(ed);
            if (st) onEditorInput(ed, st);
          });
        } else {
          ed.addEventListener("input", () => {
            const st = states.get(ed);
            if (!st || st.applying || st.mode === "disabled") return;
            if (!Core.settings.live) {
              st.original = ed.value;
              return;
            }
            const expected = displayFor(st);
            const current = ed.value;
            if (current === expected) return;
            const diff = computeDiff(expected, current);
            if (!diff) return;
            applyDiffToOriginal(st, diff);
            if (diff.kind === "delete") return;
            const next = displayFor(st);
            if (next !== current) {
              st.applying = true;
              const pos = ed.selectionStart;
              ed.value = next;
              try {
                ed.setSelectionRange(pos, pos);
              } catch (_) {}
              st.applying = false;
            }
          });
        }
      }
    });
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }

  function mutationRelevant(m) {
    const check = (n) => {
      if (!n || n.nodeType !== 1) return false;
      if (
        n.matches &&
        (n.matches(EDITOR_SEL) || n.matches("[data-latex-ext]"))
      ) {
        return true;
      }
      if (
        n.querySelector &&
        (n.querySelector(EDITOR_SEL) || n.querySelector("[data-latex-ext]"))
      ) {
        return true;
      }
      return false;
    };
    for (const n of m.addedNodes) if (check(n)) return true;
    for (const n of m.removedNodes) if (check(n)) return true;
    return false;
  }

  new MutationObserver((ms) => {
    if (ms.some(mutationRelevant)) scheduleScan();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.__latexExtComposerScan = scan;
})();
