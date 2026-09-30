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
