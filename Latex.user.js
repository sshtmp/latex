// ==UserScript==
// @name         Latex
// @namespace    https://github.com/sshtmp/latex
// @version      1.1.0
// @description  Latin/Latex (Changed-style) encoder for Discord web
// @author       sshtmp
// @match        https://discord.com/*
// @run-at       document-idle
// @grant        none
// @supportURL   https://guns.lol/tm
// @downloadURL  https://raw.githubusercontent.com/sshtmp/latex/main/Latex.user.js
// @updateURL    https://raw.githubusercontent.com/sshtmp/latex/main/Latex.user.js
// ==/UserScript==

(function () {
"use strict";

(function () {
  "use strict";

  if (window.LatexCore) return;

  const MAP = {
    A: "σ", a: "σ",
    B: "£", b: "£",
    C: "Ǝ", c: "Ǝ",
    "Ç": "ǝ", "ç": "ǝ",
    D: "₳", d: "₳",
    E: "ε", e: "ε",
    F: "╛", f: "╛",
    G: "Γ", g: "Γ",
    H: "µ", h: "µ",
    I: "∩", i: "∩",
    J: "⌠", j: "⌠",
    K: "≡", k: "≡",
    L: "Œ", l: "Œ",
    M: "β", m: "β",
    N: "þ", n: "þ",
    "Ñ": "Þ", "ñ": "Þ",
    O: "⌐", o: "⌐",
    P: "Æ", p: "Æ",
    Q: "¶", q: "¶",
    R: "Ω", r: "Ω",
    S: "Φ", s: "Φ",
    T: "╪", t: "╪",
    U: "↨", u: "↨",
    V: "ǂ", v: "ǂ",
    W: "w", w: "w",
    X: "⋛", x: "⋛",
    Y: "¥", y: "¥",
    Z: "√", z: "√",
    "1": "●",
    "2": "▬",
    "3": "▲",
    "4": "■",
    "5": "▱",
    "6": "◈",
    "7": "▩",
    "8": "▣",
    "9": "▶",
    "0": "◀"
  };

  const LATEX_CHARS = new Set(
    Object.values(MAP).filter((v) => !/^[a-zA-Z]$/.test(v))
  );

  const REVERSE = {};
  for (const [k, v] of Object.entries(MAP)) {
    if (k !== k.toLowerCase()) REVERSE[v] = k;
  }
  for (const [k, v] of Object.entries(MAP)) {
    if (k === k.toLowerCase()) REVERSE[v] = k;
  }

  const COMBINING_RE = /\p{M}+/gu;
  const EMOJI_SPLIT_RE = /(<a?:[a-zA-Z0-9_]+:\d+>|:[a-zA-Z0-9_+-]+:)/;

  function stripDiacritics(ch) {
    return ch.normalize("NFD").replace(COMBINING_RE, "");
  }

  function mapOutsideEmoji(text, fn) {
    return text
      .split(EMOJI_SPLIT_RE)
      .map((part, i) => (i % 2 === 1 ? part : fn(part)))
      .join("");
  }

  function encodeChunk(text) {
    let out = "";
    for (const ch of text) {
      if (MAP[ch] !== undefined) {
        out += MAP[ch];
        continue;
      }
      const base = stripDiacritics(ch);
      if (base.length === 1) {
        out += MAP[base] !== undefined ? MAP[base] : ch;
      } else if (base.length === 0) {
        out += ch;
      } else {
        for (const b of base) out += MAP[b] !== undefined ? MAP[b] : b;
      }
    }
    return out;
  }

  function decodeChunk(text) {
    let out = "";
    for (const ch of text) out += REVERSE[ch] !== undefined ? REVERSE[ch] : ch;
    return out;
  }

  function encodeToLatex(text) {
    return mapOutsideEmoji(text, encodeChunk);
  }

  function decodeToLatin(text) {
    return mapOutsideEmoji(text, decodeChunk);
  }

  function detect(text) {
    let latin = 0;
    let latex = 0;
    for (const ch of text) {
      if (LATEX_CHARS.has(ch)) latex++;
      else if (/\p{Script=Latin}/u.test(ch)) latin++;
    }
    if (latex > 0 && latin > 0) return "mixed";
    if (latex > 0) return "latex";
    return "latin";
  }

  function otherMode(mode) {
    return mode === "latin" ? "latex" : "latin";
  }

  function translate(text, fromMode) {
    return fromMode === "latin" ? encodeToLatex(text) : decodeToLatin(text);
  }

  const VERSION = "1.1.0";

  const settings = {
    live: true,
    message: false
  };

  function injectStyles(css) {
    const ID = "latex-ext-styles";
    const existing = document.getElementById(ID);
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css;
      return;
    }
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function notifySettings() {
    const E = window.CustomEvent || CustomEvent;
    window.dispatchEvent(new E("latex-ext-settings-changed"));
  }

  const BUTTON_CSS = `
    .latex-ext-panel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 8px;
      background: var(--background-tertiary, #1e1f22);
      box-sizing: border-box;
      max-width: 100%;
      flex-shrink: 0;
      user-select: none;
    }
    .latex-ext-title {
      font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.06em;
      color: var(--text-muted, #949ba4);
      padding: 0 4px 0 2px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .latex-ext-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      height: 28px;
      padding: 0 10px;
      border: none;
      border-radius: 6px;
      background: var(--background-secondary, #2b2d31);
      color: var(--interactive-normal, #b5bac1);
      font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.01em;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background-color .15s ease, color .15s ease;
    }
    .latex-ext-btn:hover {
      background: var(--background-modifier-hover, rgba(255, 255, 255, 0.08));
      color: var(--interactive-hover, #dbdee1);
    }
    .latex-ext-btn:active {
      background: var(--background-modifier-active, rgba(255, 255, 255, 0.14));
    }
    .latex-ext-btn:focus-visible {
      outline: 2px solid var(--focus-primary, #00a8fc);
      outline-offset: 1px;
    }
    .latex-ext-btn[data-mode="disabled"] {
      color: var(--text-muted, #949ba4);
    }
    .latex-ext-btn[data-mode="latin"] {
      color: var(--interactive-normal, #b5bac1);
    }
    .latex-ext-btn[data-mode="latex"] {
      color: var(--text-link, #00a8fc);
    }
    .latex-ext-btn[data-mode="mixed"] {
      color: #f0b232;
    }
    .latex-ext-btn[data-state="off"] {
      color: var(--text-muted, #949ba4);
    }

    .latex-ext-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      height: 24px;
      padding: 0 8px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--interactive-normal, #b5bac1);
      font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.02em;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background-color .15s ease, color .15s ease;
    }
    .latex-ext-toggle:hover {
      background: var(--background-modifier-hover, rgba(4, 4, 5, 0.07));
      color: var(--interactive-hover, #dbdee1);
    }
    .latex-ext-toggle:active {
      background: var(--background-modifier-active, rgba(4, 4, 5, 0.16));
    }
    .latex-ext-toggle:focus-visible {
      outline: 2px solid var(--focus-primary, #00a8fc);
      outline-offset: 1px;
    }
    .latex-ext-toggle[data-mode="disabled"] {
      color: var(--text-muted, #949ba4);
    }
    .latex-ext-toggle[data-mode="disabled"]:hover {
      color: var(--interactive-hover, #dbdee1);
      background: var(--background-modifier-hover, rgba(4, 4, 5, 0.07));
    }
    .latex-ext-toggle[data-mode="latin"] {
      color: var(--interactive-normal, #b5bac1);
    }
    .latex-ext-toggle[data-mode="latex"] {
      color: var(--text-link, #00a8fc);
    }
    .latex-ext-toggle[data-mode="mixed"] {
      color: #f0b232;
    }
    .latex-ext-toggle[data-mode="latex"]:hover {
      color: var(--text-link, #00a8fc);
      background: var(--background-modifier-hover, rgba(4, 4, 5, 0.07));
    }

    .latex-ext-toolbar .latex-ext-toggle {
      height: 32px;
      min-width: 32px;
      padding: 0 16px 0 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
    }

    .latex-ext-toolbar .latex-ext-msg-panel {
      height: 32px;
      padding: 0 6px 0 8px;
      gap: 6px;
      border-radius: 8px;
      align-items: center;
    }
    .latex-ext-toolbar .latex-ext-msg-panel .latex-ext-title {
      font-size: 11px;
      padding: 0 2px;
    }
    .latex-ext-toolbar .latex-ext-msg-panel .latex-ext-btn {
      height: 24px;
      min-width: 32px;
      padding: 0 10px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
    }

    .latex-ext-sep {
      width: 1px;
      height: 24px;
      margin: 0 6px;
      background: var(--background-modifier-accent, hsla(0, 0%, 100%, 0.06));
      flex-shrink: 0;
      align-self: center;
      pointer-events: none;
    }
    .latex-ext-toolbar .latex-ext-sep {
      height: 24px;
      margin: 0 8px;
    }

    .latex-ext-tag {
      color: var(--text-muted, #949ba4);
      font-size: 0.8em;
      font-weight: 400;
      margin-left: 4px;
      white-space: nowrap;
      user-select: none;
    }
  `;

  window.LatexCore = {
    VERSION,
    MAP,
    LATEX_CHARS,
    REVERSE,
    encodeToLatex,
    decodeToLatin,
    detect,
    otherMode,
    translate,
    injectStyles,
    notifySettings,
    settings,
    BUTTON_CSS
  };
})();

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
      ? "Live encoding enabled"
      : "Live encoding disabled";
  }

  function setMessageLabel(btn) {
    const on = Core.settings.message;
    btn.dataset.state = on ? "on" : "off";
    btn.textContent = on
      ? "Message encoding enabled"
      : "Message encoding disabled";
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

  function handleLiveToggle() {
    const wasLive = Core.settings.live;
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

    Core.settings.live = !wasLive;

    document.querySelectorAll(EDITOR_SEL).forEach((editor) => {
      const state = states.get(editor);
      if (!state) return;
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
    title.textContent = "LATEX v" + Core.VERSION;
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
    liveBtn.title = "Auto-encode while typing; off encodes only on send";
    liveBtn.setAttribute(
      "aria-label",
      "Auto-encode while typing; off encodes only on send"
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
    msgBtn.title = "Auto-encode incoming Latex messages";
    msgBtn.setAttribute("aria-label", "Auto-encode incoming Latex messages");
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

(function () {
  "use strict";

  if (window.__latexExtMessages) return;
  window.__latexExtMessages = true;

  const Core = window.LatexCore;
  if (!Core) return;

  const MSG_SEL = '[id^="chat-messages-"]';
  const CONTENT_SEL = '[id^="message-content-"]';
  const states = new WeakMap();

  function findActionContainer(li) {
    return (
      li.querySelector('[class*="buttonsInner"]') ||
      li.querySelector('[role="toolbar"]') ||
      li.querySelector('[class*="buttonContainer"] [class*="buttons"]')
    );
  }

  function collectTranslatableRoots(li) {
    const roots = [];
    const seen = new Set();
    const actions = findActionContainer(li);

    const add = (el) => {
      if (!el || seen.has(el)) return;
      if (el.closest("[data-latex-ext]")) return;
      if (actions && actions.contains(el)) return;
      seen.add(el);
      roots.push(el);
    };

    li.querySelectorAll(CONTENT_SEL).forEach(add);
    li.querySelectorAll('[class*="embedFull"]').forEach(add);
    li.querySelectorAll('[class*="components"]').forEach((el) => {
      if (actions && actions.contains(el)) return;
      add(el);
    });

    if (roots.length === 0) {
      const fallback = li.querySelector('[class*="message"]');
      if (fallback && !(actions && actions.contains(fallback))) add(fallback);
    }
    return roots;
  }

  function collectTextNodes(roots) {
    const nodes = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const parent = n.parentElement;
        if (!parent) continue;
        if (parent.closest("[data-latex-ext]")) continue;
        if (parent.closest('[class*="edited"]')) continue;
        nodes.push(n);
      }
    }
    return nodes;
  }

  function combinedText(li) {
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    let s = "";
    for (const n of nodes) s += n.nodeValue;
    return s;
  }

  function setButtonMode(btn, mode) {
    btn.dataset.mode = mode;
    if (mode === "latex") btn.textContent = "Latex";
    else if (mode === "mixed") btn.textContent = "Mixed";
    else btn.textContent = "Latin";
  }

  function newState() {
    return {
      saved: null,
      applied: null,
      baseSaved: null,
      manual: false,
      origDetect: null,
      displayMode: null
    };
  }

  function findMsgPanel(li) {
    return li.querySelector('[data-latex-ext="msg-panel"]');
  }

  function placePanel(panel, btn, sep, container) {
    if (!container.contains(panel)) container.prepend(panel);
    if (!sep) {
      sep = document.createElement("div");
      sep.className = "latex-ext-sep";
      sep.dataset.latexExt = "sep";
      sep.setAttribute("aria-hidden", "true");
    }
    if (sep.parentNode !== container || panel.nextSibling !== sep) {
      container.insertBefore(sep, panel.nextSibling);
    }
    void btn;
  }

  function refreshLabel(li, btn) {
    const st = states.get(li);
    if (st && st.saved && st.displayMode) {
      setButtonMode(btn, st.displayMode);
      return;
    }
    setButtonMode(btn, Core.detect(combinedText(li)));
  }

  function badgeHost(li) {
    const content = li.querySelector(CONTENT_SEL);
    if (content) return content.querySelector(".markup") || content;
    const roots = collectTranslatableRoots(li);
    return roots[0] || null;
  }

  function ensureBadge(li, sourceMode) {
    const host = badgeHost(li);
    if (!host) return;
    let badge = host.querySelector('[data-latex-ext="badge"]');
    if (!sourceMode) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.latexExt = "badge";
      badge.className = "latex-ext-tag";
    }
    badge.textContent = "(" + sourceMode + ")";
    const edited = host.querySelector('[class*="edited"]');
    if (edited) {
      if (badge.nextSibling !== edited) host.insertBefore(badge, edited);
    } else if (badge.parentNode !== host || host.lastElementChild !== badge) {
      host.appendChild(badge);
    }
  }

  function nodesMatch(nodes, arr) {
    return (
      arr &&
      nodes.length === arr.length &&
      nodes.every((n, i) => n.nodeValue === arr[i])
    );
  }

  function applyTransform(li, btn, toMode, origDetect) {
    const roots = collectTranslatableRoots(li);
    const nodes = collectTextNodes(roots);
    const raw = nodes.map((n) => n.nodeValue).join("");
    const source = origDetect || Core.detect(raw);
    const target = toMode || (source === "latin" ? "latex" : "latin");
    const fn = target === "latex" ? Core.encodeToLatex : Core.decodeToLatin;
    const state = states.get(li) || newState();
    if (!state.baseSaved) {
      state.baseSaved = nodes.map((n) => n.nodeValue);
    }
    state.saved = nodes.map((n) => n.nodeValue);
    for (const n of nodes) n.nodeValue = fn(n.nodeValue);
    state.applied = nodes.map((n) => n.nodeValue);
    state.origDetect = source;
    state.displayMode = target;
    states.set(li, state);
    ensureBadge(li, source);
    if (btn) setButtonMode(btn, target);
    return state;
  }

  function restoreBase(li, btn) {
    const state = states.get(li);
    const roots = collectTranslatableRoots(li);
    const nodes = collectTextNodes(roots);
    const src = state && state.baseSaved;
    if (src && nodes.length === src.length) {
      nodes.forEach((n, i) => {
        n.nodeValue = src[i];
      });
    }
    if (state) {
      state.saved = null;
      state.applied = null;
      state.baseSaved = null;
      state.origDetect = null;
      state.displayMode = null;
      states.set(li, state);
    }
    ensureBadge(li, null);
    if (btn) refreshLabel(li, btn);
  }

  function isShowingApplied(li) {
    const state = states.get(li);
    if (!state || !state.applied) return false;
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    return nodesMatch(nodes, state.applied);
  }

  function handleToggle(li, btn) {
    const state = states.get(li) || newState();
    const wasManual = state.manual;
    state.manual = true;
    states.set(li, state);

    if (isShowingApplied(li)) {
      if (!wasManual) {
        restoreBase(li, btn);
        const st = states.get(li);
        if (st) {
          st.manual = true;
          states.set(li, st);
        }
        return;
      }
      if (state.origDetect === "mixed" && state.displayMode === "latin") {
        applyTransform(li, btn, "latex", "mixed");
        return;
      }
      restoreBase(li, btn);
      return;
    }

    const roots = collectTranslatableRoots(li);
    const nodes = collectTextNodes(roots);
    const raw = nodes.map((n) => n.nodeValue).join("");
    const detected = Core.detect(raw);

    if (detected === "mixed") {
      applyTransform(li, btn, "latin", "mixed");
    } else if (detected === "latex") {
      applyTransform(li, btn, "latin", "latex");
    } else {
      applyTransform(li, btn, "latex", "latin");
    }
  }

  function maybeAutoTranslate(li) {
    if (!Core.settings.message) return;
    const state = states.get(li);
    if (state && (state.manual || state.saved)) return;
    const raw = combinedText(li);
    if (!raw.trim()) return;
    const d = Core.detect(raw);
    if (d === "latin") return;
    const btn = li.querySelector('[data-latex-ext="msg"]');
    applyTransform(li, btn, "latin", d);
  }

  function resetMessageDefaults() {
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      const state = states.get(li);
      if (state && (state.saved || state.applied || state.baseSaved)) {
        restoreBase(li, li.querySelector('[data-latex-ext="msg"]'));
      }
      const st = states.get(li) || newState();
      st.manual = false;
      st.baseSaved = null;
      st.saved = null;
      st.applied = null;
      st.origDetect = null;
      st.displayMode = null;
      states.set(li, st);
      ensureBadge(li, null);
      const btn = li.querySelector('[data-latex-ext="msg"]');
      if (btn) refreshLabel(li, btn);
    });
  }

  function ensureButton(li) {
    const container = findActionContainer(li);
    if (!container) return;

    container.classList.add("latex-ext-toolbar");

    let panel = findMsgPanel(li);
    let btn = container.querySelector('[data-latex-ext="msg"]');
    let sep = container.querySelector('[data-latex-ext="sep"]');

    if (panel && btn) {
      placePanel(panel, btn, sep, container);
      const st = states.get(li);
      if (!(st && st.saved)) refreshLabel(li, btn);
      return;
    }
    if (btn && !panel) btn.remove();
    if (panel && !btn) panel.remove();
    panel = null;
    btn = null;

    panel = document.createElement("div");
    panel.className = "latex-ext-panel latex-ext-msg-panel";
    panel.dataset.latexExt = "msg-panel";

    const title = document.createElement("span");
    title.className = "latex-ext-title";
    title.textContent = "LATEX v" + Core.VERSION;
    panel.appendChild(title);

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "latex-ext-btn";
    btn.dataset.latexExt = "msg";
    btn.title = "Cycle message encoding: Mixed, Latin, Latex";
    btn.setAttribute("aria-label", "Cycle message encoding: Mixed, Latin, Latex");
    setButtonMode(btn, Core.detect(combinedText(li)));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToggle(li, btn);
    });
    panel.appendChild(btn);

    sep = document.createElement("div");
    sep.className = "latex-ext-sep";
    sep.dataset.latexExt = "sep";
    sep.setAttribute("aria-hidden", "true");

    container.prepend(panel);
    container.insertBefore(sep, panel.nextSibling);
    states.set(li, states.get(li) || newState());
  }

  function scan() {
    Core.injectStyles(Core.BUTTON_CSS);
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      ensureButton(li);
      maybeAutoTranslate(li);
      const btn = li.querySelector('[data-latex-ext="msg"]');
      const st = states.get(li);
      if (btn && !(st && st.saved)) refreshLabel(li, btn);
    });
  }

  function onSettingsChanged() {
    resetMessageDefaults();
    scheduleScan();
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

  window.addEventListener("latex-ext-settings-changed", onSettingsChanged);

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.__latexExtMessagesScan = scan;
})();

})();
