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
