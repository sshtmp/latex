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
    if (editor.closest('[class*="channelTextArea"]')) return true;
    const row = editor.closest("form") || editor.parentElement;
    return !!(row && row.querySelector('[class*="buttons"], [class*="Buttons"]'));
  }

  function findButtons(editor) {
    const scope =
      editor.closest('[class*="channelTextArea"]') ||
      editor.parentElement;
    if (!scope) return null;
    return (
      scope.querySelector('[class*="buttons"], [class*="Buttons"]') ||
      editor.parentElement
    );
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
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function findTextPos(root, targetOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (targetOffset <= 0) {
      const first = walker.nextNode();
      return first ? { node: first, offset: 0 } : null;
    }
    let acc = 0;
    let node;
    let last = null;
    while ((node = walker.nextNode())) {
      last = node;
      const len = node.nodeValue.length;
      if (acc + len >= targetOffset) {
        return { node, offset: targetOffset - acc };
      }
      acc += len;
    }
    if (last) return { node: last, offset: last.nodeValue.length };
    return null;
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
    for (let attempt = 0; attempt < 2; attempt++) {
      selectAll(editor);
      withApplying(editor, () => {
        if (clean === "") exec("delete");
        else exec("insertText", clean);
      });
      if (getComposerTextStrict(editor) === clean) {
        moveCursorToEnd(editor);
        return true;
      }
    }
    moveCursorToEnd(editor);
    return getComposerTextStrict(editor) === clean;
  }

  function insertAtCursor(editor, text) {
    const clean = sanitizeForEditor(text);
    if (clean === "") return;
    withApplying(editor, () => {
      exec("insertText", clean);
    });
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

  function setLiveLabel(btn) {
    const on = Core.settings.live;
    btn.dataset.state = on ? "on" : "off";
    btn.textContent = on
      ? "Live translation enabled"
      : "Live translation disabled";
  }

  function setMessageLabel(btn) {
    const on = Core.settings.message;
    btn.dataset.state = on ? "on" : "off";
    btn.textContent = on
      ? "Message translation enabled"
      : "Message translation disabled";
  }

  function refreshAllPanels() {
    document
      .querySelectorAll('[data-latex-ext="panel"]')
      .forEach(refreshPanelLabels);
  }

  function refreshPanelLabels(panel) {
    const editor = panel._latexEditor;
    const state = editor ? states.get(editor) : null;
    const enc = panel.querySelector('[data-latex-ext="composer"]');
    const live = panel.querySelector('[data-latex-ext="live"]');
    const msg = panel.querySelector('[data-latex-ext="msgauto"]');
    if (enc) setEncodingLabel(enc, state ? state.mode : "disabled");
    if (live) setLiveLabel(live);
    if (msg) setMessageLabel(msg);
  }

  function getState(editor) {
    let s = states.get(editor);
    if (!s) {
      s = {
        mode: "disabled",
        original: getComposerTextStrict(editor),
        applying: false,
        sending: false,
        pendingSend: false
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
    const currentBefore = getComposerTextStrict(editor);
    if (currentBefore === "") {
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
    } else if (state.mode === "disabled" || !Core.settings.live) {
      state.original = currentBefore;
    }
    state.mode = cycleMode(state.mode);
    setEncodingLabel(btn, state.mode);

    const display = displayFor(state);
    const current = getComposerTextStrict(editor);
    if (display === current) return;
    setComposerText(editor, display);
  }

  function handleLiveToggle() {
    Core.settings.live = !Core.settings.live;
    document.querySelectorAll(EDITOR_SEL).forEach((editor) => {
      const state = states.get(editor);
      if (!state) return;
      state.sending = false;
      state.pendingSend = false;
      if (syncIfEmpty(editor, state)) return;
      const display = displayFor(state);
      const current = getComposerTextStrict(editor);
      if (display !== current) setComposerText(editor, display);
    });
    refreshAllPanels();
    Core.notifySettings();
  }

  function handleMessageToggle() {
    Core.settings.message = !Core.settings.message;
    refreshAllPanels();
    Core.notifySettings();
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
    if (!diff || diff.kind !== "delete") return;
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

    if (t === "insertText" && e.data != null) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selOff = selectionOffsets(editor);
      const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
      const end = selOff && !selOff.collapsed ? selOff.end : start;
      insertRangeInOriginal(state, start, end, e.data);
      insertAtCursor(editor, translateChunk(e.data, state.mode));
      return;
    }

    if (t === "insertLineBreak" || t === "insertParagraph") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selOff = selectionOffsets(editor);
      const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
      const end = selOff && !selOff.collapsed ? selOff.end : start;
      insertRangeInOriginal(state, start, end, "\n");
      insertAtCursor(editor, "\n");
      return;
    }

    if (t === "insertFromPaste" || t === "insertFromDrop") {
      e.preventDefault();
      e.stopImmediatePropagation();
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

    e.preventDefault();
    e.stopImmediatePropagation();

    const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    if (!text) return;

    const selOff = selectionOffsets(editor);
    const start = selOff ? selOff.start : cursorOffsetInEditor(editor);
    const end = selOff && !selOff.collapsed ? selOff.end : start;
    insertRangeInOriginal(state, start, end, text);
    insertAtCursor(editor, translateChunk(text, state.mode));
  }

  function clearCacheIfEmpty(editor, state) {
    if (getComposerTextStrict(editor) === "") {
      state.original = "";
      state.sending = false;
      state.pendingSend = false;
    }
  }

  function syncIfEmpty(editor, state) {
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

    if (state.mode === "disabled" || !Core.settings.live) {
      state.original = getComposerTextStrict(editor);
      return;
    }

    const expected = displayFor(state);
    const current = getComposerTextStrict(editor);
    if (current === "") {
      state.original = "";
      return;
    }
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

  function bindGlobal() {
    if (bound) return;
    bound = true;
    window.addEventListener("beforeinput", handleBeforeInput, true);
    window.addEventListener("paste", handlePaste, true);
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
        const btn = el.closest('button[type="submit"]');
        if (!btn) return;
        const scope = btn.closest("form") || btn.closest('[class*="channelTextArea"]');
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
      if (!host.contains(panel)) host.appendChild(panel);
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
    title.textContent = "LATEX v1";
    panel.appendChild(title);

    const encBtn = document.createElement("button");
    encBtn.type = "button";
    encBtn.className = "latex-ext-btn";
    encBtn.dataset.latexExt = "composer";
    encBtn.title = "Cycle encoding mode";
    encBtn.setAttribute("aria-label", "Cycle encoding mode");
    encBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToggle(editor, encBtn);
    });
    panel.appendChild(encBtn);

    const liveBtn = document.createElement("button");
    liveBtn.type = "button";
    liveBtn.className = "latex-ext-btn";
    liveBtn.dataset.latexExt = "live";
    liveBtn.title = "Auto-translate while typing; off translates only on send";
    liveBtn.setAttribute(
      "aria-label",
      "Auto-translate while typing; off translates only on send"
    );
    liveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleLiveToggle();
    });
    panel.appendChild(liveBtn);

    const msgBtn = document.createElement("button");
    msgBtn.type = "button";
    msgBtn.className = "latex-ext-btn";
    msgBtn.dataset.latexExt = "msgauto";
    msgBtn.title = "Auto-translate incoming Latex messages";
    msgBtn.setAttribute("aria-label", "Auto-translate incoming Latex messages");
    msgBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleMessageToggle();
    });
    panel.appendChild(msgBtn);

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

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.__latexExtComposerScan = scan;
})();
