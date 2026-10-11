// ==UserScript==
// @name         Latex
// @namespace    https://github.com/sshtmp/latex
// @version      1.5.0
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
  const PROTECT_RE =
    /(`{3}[\s\S]*?`{3})|(`[^`\n]*`)|(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|(<@[!&]?\d+>)|(<#\d+>)|(<t:\d+(?::[A-Za-z])?>)|(<a?:[a-zA-Z0-9_]+:\d+>)|(:[a-zA-Z0-9_+-]+:)/g;

  function stripDiacritics(ch) {
    return ch.normalize("NFD").replace(COMBINING_RE, "");
  }

  function mapOutsideProtected(text, fn) {
    let out = "";
    let last = 0;
    PROTECT_RE.lastIndex = 0;
    let m;
    while ((m = PROTECT_RE.exec(text))) {
      out += fn(text.slice(last, m.index));
      out += m[0];
      last = m.index + m[0].length;
    }
    out += fn(text.slice(last));
    return out;
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
    return mapOutsideProtected(text, encodeChunk);
  }

  function decodeToLatin(text) {
    return mapOutsideProtected(text, decodeChunk);
  }

  function detect(text) {
    let latin = 0;
    let latex = 0;
    for (const ch of text) {
      if (LATEX_CHARS.has(ch)) latex++;
      else if (MAP[ch] !== undefined && MAP[ch] === ch) continue;
      else if (/\p{Script=Latin}/u.test(ch)) latin++;
    }
    if (latex > 0 && latin > 0) return "mixed";
    if (latex > 0) return "latex";
    return "latin";
  }

  const VERSION = "1.5.0";
  const STORAGE_KEY = "latex-ext-settings";

  const settings = {
    encode: false,
    decode: true
  };

  const stats = {
    messages: 0
  };

  function bumpMessages(n) {
    stats.messages += n == null ? 1 : n;
  }

  function loadSettings() {
    try {
      const ls = window.localStorage;
      if (!ls) return;
      const raw = ls.getItem(STORAGE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return;
      if (typeof o.encode === "boolean") settings.encode = o.encode;
      if (typeof o.decode === "boolean") settings.decode = o.decode;
    } catch (_) {}
  }

  function saveSettings() {
    try {
      const ls = window.localStorage;
      if (!ls) return;
      ls.setItem(
        STORAGE_KEY,
        JSON.stringify({ encode: settings.encode, decode: settings.decode })
      );
    } catch (_) {}
  }

  loadSettings();

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
    saveSettings();
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
    .latex-ext-btn[data-mode="enabled"] {
      color: var(--text-link, #00a8fc);
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
    encodeToLatex,
    decodeToLatin,
    detect,
    injectStyles,
    notifySettings,
    bumpMessages,
    stats,
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

  const EDITOR_SEL =
    '[data-slate-editor="true"], [role="textbox"][contenteditable="true"]';
  const SKIP_SEL =
    "[data-slate-spacer], [data-slate-zero-width], [class*='hiddenVisually'], [aria-hidden='true']";
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

    clone.querySelectorAll("img.emoji, [data-type='emoji']").forEach((el) => {
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
    let p = parent;
    while (p && p !== node.ownerDocument) {
      if (p.hasAttribute && p.hasAttribute("data-slate-zero-width")) return true;
      p = p.parentElement;
    }
    return false;
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

  function exec(cmd, value) {
    try {
      if (value === undefined) return document.execCommand(cmd);
      return document.execCommand(cmd, false, value);
    } catch (_) {
      return false;
    }
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

  function setComposerText(editor, text) {
    const clean = sanitizeForEditor(text);
    if (getComposerTextStrict(editor) === clean) {
      moveCursorToEnd(editor);
      return true;
    }

    editor.focus();
    selectAll(editor);
    let handled = dispatchBeforeInput(editor, "insertText", clean);
    if (!handled) {
      selectAll(editor);
      if (clean === "") exec("delete");
      else exec("insertText", clean);
    }
    stripRootOrphansIfStructure(editor);
    moveCursorToEnd(editor);
    return getComposerTextStrict(editor) === clean;
  }

  function setLabel(btn, on, label) {
    btn.dataset.mode = on ? "enabled" : "disabled";
    btn.textContent = on ? label + " enabled" : label + " disabled";
  }

  function setTitleText(panel) {
    const title = panel.querySelector(".latex-ext-title");
    if (!title) return;
    let t = "LATEX v" + Core.VERSION;
    if (Core.stats.messages > 0) t += " · " + Core.stats.messages;
    title.textContent = t;
  }

  function refreshPanelLabels(panel) {
    const enc = panel.querySelector('[data-latex-ext="composer"]');
    const dec = panel.querySelector('[data-latex-ext="decode"]');
    if (enc) setLabel(enc, Core.settings.encode, "Encoding");
    if (dec) setLabel(dec, Core.settings.decode, "Decoding");
    setTitleText(panel);
  }

  function refreshAllPanels() {
    document
      .querySelectorAll('[data-latex-ext="panel"]')
      .forEach(refreshPanelLabels);
  }
  window.__latexExtBulkRefresh = refreshAllPanels;

  function toggleEncode() {
    Core.settings.encode = !Core.settings.encode;
    refreshAllPanels();
    Core.notifySettings();
  }

  function toggleDecode() {
    Core.settings.decode = !Core.settings.decode;
    refreshAllPanels();
    Core.notifySettings();
  }

  function prepareSend(editor) {
    if (!Core.settings.encode) return;
    const raw = getComposerTextStrict(editor);
    if (!raw) return;
    const target = Core.encodeToLatex(raw);
    if (raw === target) return;
    if (!setComposerText(editor, target)) return;
    Core.bumpMessages(1);
    refreshAllPanels();
  }

  function clearAfterSend(editor) {
    if (placeholderVisible(editor)) stripRootOrphans(editor);
  }

  function scheduleSendClear(editor) {
    [0, 50, 150, 400, 800].forEach((ms) => setTimeout(() => {
      if (editor.isConnected) clearAfterSend(editor);
    }, ms));
  }

  function composerEditor() {
    let editor = editorFromTarget(document.activeElement);
    if (!editor || !isComposerEditor(editor)) {
      editor = null;
      document.querySelectorAll(EDITOR_SEL).forEach((ed) => {
        if (!editor && isComposerEditor(ed)) editor = ed;
      });
    }
    return editor;
  }

  function bindGlobal() {
    if (bound) return;
    bound = true;

    window.addEventListener(
      "keydown",
      (e) => {
        if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
        const k = e.key || "";
        if (k !== "L" && k !== "l") return;
        if (!composerEditor()) return;
        e.preventDefault();
        toggleEncode();
      },
      true
    );

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
        const editor = editorFromTarget(e.target);
        if (!editor || !isComposerEditor(editor)) return;
        prepareSend(editor);
        scheduleSendClear(editor);
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
        if (!editor || !isComposerEditor(editor)) return;
        prepareSend(editor);
        scheduleSendClear(editor);
      },
      true
    );
  }

  function attachToggle(btn, onClick) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }

  function ensurePanel(editor) {
    if (!editor.isConnected || !isComposerEditor(editor)) return;

    const host = findButtons(editor);
    if (!host) return;

    bindGlobal();

    let panel = host.querySelector('[data-latex-ext="panel"]');
    if (panel && panel._latexEditor === editor) {
      if (!host.contains(panel)) host.prepend(panel);
      refreshPanelLabels(panel);
      return;
    }
    if (panel) panel.remove();
    host
      .querySelectorAll(
        ':scope > [data-latex-ext="composer"], :scope > [data-latex-ext="decode"]'
      )
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
    encBtn.title = "Encode outgoing messages to Latex when sent (Ctrl+Shift+L)";
    encBtn.setAttribute("aria-label", "Toggle encoding");
    attachToggle(encBtn, toggleEncode);
    panel.appendChild(encBtn);

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "latex-ext-btn";
    decBtn.dataset.latexExt = "decode";
    decBtn.title = "Decode incoming messages automatically";
    decBtn.setAttribute("aria-label", "Toggle decoding");
    attachToggle(decBtn, toggleDecode);
    panel.appendChild(decBtn);

    refreshPanelLabels(panel);
    host.prepend(panel);
  }

  function scan() {
    Core.injectStyles(Core.BUTTON_CSS);
    document.querySelectorAll(EDITOR_SEL).forEach(ensurePanel);
    refreshAllPanels();
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

(function () {
  "use strict";

  if (window.__latexExtMessages) return;
  window.__latexExtMessages = true;

  const Core = window.LatexCore;
  if (!Core) return;

  const MSG_SEL = '[id^="chat-messages-"]';
  const CONTENT_SEL = '[id^="message-content-"]';
  const REPLY_SEL =
    '[class*="repliedMessage"], [class*="replied" i], [class*="replyBar"], [class*="messageReply"]';
  const states = new Map();
  let lastDecode = !!Core.settings.decode;

  function stateFor(li) {
    return states.get(li.id);
  }

  function setStateFor(li, st) {
    states.set(li.id, st);
  }

  function ensureState(li) {
    let st = states.get(li.id);
    if (!st) {
      st = newState();
      states.set(li.id, st);
    }
    return st;
  }

  function newState() {
    return {
      manual: false,
      baseText: null,
      appliedText: null,
      source: null,
      target: null,
      peeking: false
    };
  }

  function rebase(st, text) {
    st.baseText = text;
    st.appliedText = null;
    st.source = null;
    st.target = null;
    st.peeking = false;
  }

  function clearApplied(st) {
    st.appliedText = null;
    st.source = null;
    st.target = null;
    st.peeking = false;
  }

  function pruneStates() {
    const alive = new Set();
    document.querySelectorAll(MSG_SEL).forEach((li) => alive.add(li.id));
    for (const id of [...states.keys()]) {
      if (!alive.has(id)) states.delete(id);
    }
  }

  function isReplyPreview(el) {
    return !!(el instanceof Element && el.closest(REPLY_SEL));
  }

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

    li.querySelectorAll(CONTENT_SEL).forEach((el) => {
      if (isReplyPreview(el)) return;
      add(el);
    });
    li.querySelectorAll('[class*="embedFull"]').forEach((el) => {
      if (isReplyPreview(el)) return;
      add(el);
    });
    li.querySelectorAll('[class*="components"]').forEach((el) => {
      if (actions && actions.contains(el)) return;
      if (isReplyPreview(el)) return;
      add(el);
    });

    if (roots.length === 0) {
      const fallback = li.querySelector('[class*="message"]');
      if (
        fallback &&
        !isReplyPreview(fallback) &&
        !(actions && actions.contains(fallback))
      ) {
        add(fallback);
      }
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

  function snapshot(li) {
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    return { nodes, text: nodes.map((n) => n.nodeValue).join("") };
  }

  function canMap(st) {
    return (
      st.baseText != null &&
      st.appliedText != null &&
      st.baseText.length === st.appliedText.length
    );
  }

  function writeNodes(nodes, text) {
    let at = 0;
    for (const n of nodes) {
      const len = (n.nodeValue || "").length;
      n.nodeValue = text.slice(at, at + len);
      at += len;
    }
  }

  function setButtonMode(btn, mode) {
    btn.dataset.mode = mode;
    if (mode === "latex") btn.textContent = "Latex";
    else if (mode === "mixed") btn.textContent = "Mixed";
    else btn.textContent = "Latin";
  }

  function findMsgPanel(li) {
    return li.querySelector('[data-latex-ext="msg-panel"]');
  }

  function placePanel(panel, sep, container) {
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
  }

  function refreshLabel(li, btn) {
    const st = stateFor(li);
    if (st && st.target && st.appliedText != null) {
      setButtonMode(btn, st.target);
      return;
    }
    setButtonMode(btn, Core.detect(snapshot(li).text));
  }

  function badgeHost(li) {
    let content = null;
    li.querySelectorAll(CONTENT_SEL).forEach((el) => {
      if (content || isReplyPreview(el)) return;
      content = el;
    });
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

  function applyTransform(li, btn, target, source) {
    const { nodes, text } = snapshot(li);
    if (!text.trim()) return null;

    const st = ensureState(li);
    const showingApplied = st.appliedText != null && text === st.appliedText;
    if (!showingApplied && text !== st.baseText) rebase(st, text);

    const fn = target === "latex" ? Core.encodeToLatex : Core.decodeToLatin;
    for (const n of nodes) n.nodeValue = fn(n.nodeValue);

    st.appliedText = nodes.map((n) => n.nodeValue).join("");
    st.source = source;
    st.target = target;
    st.peeking = false;
    setStateFor(li, st);
    ensureBadge(li, source);
    if (btn) setButtonMode(btn, target);
    Core.bumpMessages(1);
    if (window.__latexExtBulkRefresh) window.__latexExtBulkRefresh();
    return st;
  }

  function restore(li, btn) {
    const st = stateFor(li);
    if (!st || st.appliedText == null) return false;
    const { nodes, text } = snapshot(li);

    if (text === st.appliedText && canMap(st)) {
      writeNodes(nodes, st.baseText);
    } else if (text !== st.baseText) {
      rebase(st, text);
      ensureBadge(li, null);
      if (btn) refreshLabel(li, btn);
      return true;
    }

    clearApplied(st);
    setStateFor(li, st);
    ensureBadge(li, null);
    if (btn) refreshLabel(li, btn);
    return true;
  }

  function showBase(li) {
    const st = stateFor(li);
    if (!st || st.appliedText == null || st.peeking || !canMap(st)) return false;
    const { nodes, text } = snapshot(li);
    if (text !== st.appliedText) return false;
    writeNodes(nodes, st.baseText);
    st.peeking = true;
    ensureBadge(li, null);
    return true;
  }

  function reapply(li) {
    const st = stateFor(li);
    if (!st || !st.peeking) return;
    st.peeking = false;
    if (st.appliedText == null || !canMap(st)) return;
    const { nodes, text } = snapshot(li);
    if (text !== st.baseText) return;
    writeNodes(nodes, st.appliedText);
    ensureBadge(li, st.source);
  }

  function handleToggle(li, btn) {
    const st = ensureState(li);
    st.manual = true;
    setStateFor(li, st);

    const { text } = snapshot(li);
    if (!text.trim()) return;

    const showingApplied = st.appliedText != null && text === st.appliedText;
    if (showingApplied) {
      if (st.target === "latin" && st.source === "mixed") {
        applyTransform(li, btn, "latex", st.source);
        return;
      }
      restore(li, btn);
      return;
    }

    const detected = Core.detect(text);
    if (detected === "latin") applyTransform(li, btn, "latex", "latin");
    else applyTransform(li, btn, "latin", detected);
  }

  function maybeAutoTranslate(li) {
    if (!Core.settings.decode) return;
    const st = stateFor(li);
    if (st && (st.manual || st.peeking)) return;

    const { text } = snapshot(li);
    if (!text.trim()) return;
    if (st && st.appliedText != null && text === st.appliedText) return;

    const detected = Core.detect(text);
    if (detected === "latin") return;
    applyTransform(li, li.querySelector('[data-latex-ext="msg"]'), "latin", detected);
  }

  function resetMessageDefaults() {
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      restore(li, li.querySelector('[data-latex-ext="msg"]'));
      setStateFor(li, newState());
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
      placePanel(panel, sep, container);
      refreshLabel(li, btn);
      reconcile(li);
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
    setButtonMode(btn, Core.detect(snapshot(li).text));
    attachPeek(btn, li);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn._suppressClick) {
        btn._suppressClick = false;
        return;
      }
      handleToggle(li, btn);
    });
    panel.appendChild(btn);

    sep = document.createElement("div");
    sep.className = "latex-ext-sep";
    sep.dataset.latexExt = "sep";
    sep.setAttribute("aria-hidden", "true");

    container.prepend(panel);
    container.insertBefore(sep, panel.nextSibling);
    ensureState(li);
  }

  function attachPeek(btn, li) {
    if (btn._latexExtPeekBound) return;
    btn._latexExtPeekBound = true;
    let peekStart = 0;

    btn.addEventListener("pointerdown", () => {
      btn._suppressClick = false;
      peekStart = 0;
      if (showBase(li)) peekStart = Date.now();
    });

    const endPeek = () => {
      const st = stateFor(li);
      if (!st || !st.peeking) return;
      const held = peekStart ? Date.now() - peekStart : 0;
      reapply(li);
      if (held >= 250) btn._suppressClick = true;
      peekStart = 0;
    };
    btn.addEventListener("pointerup", endPeek);
    btn.addEventListener("pointerleave", endPeek);
  }

  function reconcile(li) {
    const st = stateFor(li);
    if (!st) return;
    const { text } = snapshot(li);
    if (st.appliedText != null && text === st.appliedText) return;
    if (st.baseText != null && text === st.baseText) return;
    rebase(st, text);
    st.manual = false;
    setStateFor(li, st);
    ensureBadge(li, null);
  }

  function scan() {
    Core.injectStyles(Core.BUTTON_CSS);
    pruneStates();
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      ensureButton(li);
      reconcile(li);
      maybeAutoTranslate(li);
      const btn = li.querySelector('[data-latex-ext="msg"]');
      if (btn) refreshLabel(li, btn);
    });
  }

  function onSettingsChanged() {
    if (!Core.settings.decode && lastDecode) resetMessageDefaults();
    lastDecode = !!Core.settings.decode;
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

  function mutationRelevant(m) {
    const t = m.target;
    if (t && t.nodeType === 1 && t.closest && t.closest(MSG_SEL)) return true;
    const check = (n) => {
      if (!n || n.nodeType !== 1) return false;
      if (n.matches && (n.matches(MSG_SEL) || n.matches("[data-latex-ext]")))
        return true;
      if (
        n.querySelector &&
        (n.querySelector(MSG_SEL) || n.querySelector("[data-latex-ext]"))
      )
        return true;
      if (n.closest && n.closest(MSG_SEL)) return true;
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
  window.__latexExtMessagesScan = scan;
  if (window.__latexExtBulkRefresh) window.__latexExtBulkRefresh();
})();

})();
