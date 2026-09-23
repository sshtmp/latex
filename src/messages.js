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
  let lastMessageFlag = !!Core.settings.message;

  window.__latexExtMsgState = stateFor;

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
      displayMode: null,
      peeking: false
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
    const st = stateFor(li);
    if (st && st.saved && st.displayMode) {
      setButtonMode(btn, st.displayMode);
      return;
    }
    setButtonMode(btn, Core.detect(combinedText(li)));
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
    const state = ensureState(li);
    if (!state.baseSaved) {
      state.baseSaved = nodes.map((n) => n.nodeValue);
    }
    state.saved = nodes.map((n) => n.nodeValue);
    for (const n of nodes) n.nodeValue = fn(n.nodeValue);
    state.applied = nodes.map((n) => n.nodeValue);
    state.origDetect = source;
    state.displayMode = target;
    setStateFor(li, state);
    ensureBadge(li, source);
    if (btn) setButtonMode(btn, target);
    Core.bumpMessages(1);
    if (window.__latexExtBulkRefresh) window.__latexExtBulkRefresh();
    return state;
  }

  function restoreBase(li, btn) {
    const state = stateFor(li);
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
      setStateFor(li, state);
    }
    ensureBadge(li, null);
    if (btn) refreshLabel(li, btn);
  }

  function isShowingApplied(li) {
    const state = stateFor(li);
    if (!state || !state.applied) return false;
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    return nodesMatch(nodes, state.applied);
  }

  function reconcile(li) {
    const state = stateFor(li);
    if (!state || !state.applied || state.peeking) return;
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    if (nodesMatch(nodes, state.applied)) return;
    if (state.baseSaved && nodesMatch(nodes, state.baseSaved)) {
      state.applied = null;
      state.saved = null;
      state.baseSaved = null;
      state.origDetect = null;
      state.displayMode = null;
      setStateFor(li, state);
      ensureBadge(li, null);
      return;
    }
    setStateFor(li, newState());
    ensureBadge(li, null);
  }

  function showBase(li) {
    const state = stateFor(li);
    if (!state || !state.applied || !state.baseSaved) return false;
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    if (nodes.length !== state.baseSaved.length) return false;
    nodes.forEach((n, i) => {
      n.nodeValue = state.baseSaved[i];
    });
    state.peeking = true;
    ensureBadge(li, null);
    return true;
  }

  function reapply(li) {
    const state = stateFor(li);
    if (!state || !state.applied || !state.peeking) return;
    const nodes = collectTextNodes(collectTranslatableRoots(li));
    if (nodes.length !== state.applied.length) return;
    nodes.forEach((n, i) => {
      n.nodeValue = state.applied[i];
    });
    state.peeking = false;
    ensureBadge(li, state.origDetect);
  }

  function anyApplied() {
    let found = false;
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      if (found) return;
      const st = stateFor(li);
      if (st && (st.applied || st.saved) && !st.peeking) found = true;
    });
    return found;
  }

  function encodeAll() {
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      ensureButton(li);
      if (isShowingApplied(li)) return;
      const raw = combinedText(li);
      if (!raw.trim()) return;
      const d = Core.detect(raw);
      if (d === "latin") return;
      applyTransform(li, li.querySelector('[data-latex-ext="msg"]'), "latin", d);
      const st = ensureState(li);
      st.manual = true;
      setStateFor(li, st);
    });
    if (window.__latexExtBulkRefresh) window.__latexExtBulkRefresh();
  }

  function restoreAll() {
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      const st = stateFor(li);
      if (!st || (!st.applied && !st.saved)) return;
      restoreBase(li, li.querySelector('[data-latex-ext="msg"]'));
      const s = ensureState(li);
      s.manual = true;
      setStateFor(li, s);
    });
    if (window.__latexExtBulkRefresh) window.__latexExtBulkRefresh();
  }

  window.__latexExtBulk = { anyApplied, encodeAll, restoreAll };

  function attachPeek(btn, li) {
    if (btn._latexExtPeekBound) return;
    btn._latexExtPeekBound = true;
    let peekStart = 0;
    let suppressClick = false;
    btn.addEventListener("pointerdown", () => {
      const st = stateFor(li);
      if (st && st.applied && !st.peeking) {
        peekStart = Date.now();
        showBase(li);
      }
    });
    const endPeek = () => {
      const st = stateFor(li);
      if (!st || !st.peeking) return;
      const held = Date.now() - peekStart;
      reapply(li);
      if (held >= 250) suppressClick = true;
      peekStart = 0;
    };
    btn.addEventListener("pointerup", endPeek);
    btn.addEventListener("pointerleave", endPeek);
    btn.addEventListener("click", (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  function handleToggle(li, btn) {
    const state = ensureState(li);
    const wasManual = state.manual;
    state.manual = true;
    setStateFor(li, state);

    if (isShowingApplied(li)) {
      if (!wasManual) {
        restoreBase(li, btn);
        const st = stateFor(li);
        if (st) {
          st.manual = true;
          setStateFor(li, st);
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
    const state = stateFor(li);
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
      const state = stateFor(li);
      if (state && (state.saved || state.applied || state.baseSaved)) {
        restoreBase(li, li.querySelector('[data-latex-ext="msg"]'));
      }
      const st = newState();
      setStateFor(li, st);
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
      const st = stateFor(li);
      if (!(st && st.saved)) refreshLabel(li, btn);
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
    setButtonMode(btn, Core.detect(combinedText(li)));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToggle(li, btn);
    });
    attachPeek(btn, li);
    panel.appendChild(btn);

    sep = document.createElement("div");
    sep.className = "latex-ext-sep";
    sep.dataset.latexExt = "sep";
    sep.setAttribute("aria-hidden", "true");

    container.prepend(panel);
    container.insertBefore(sep, panel.nextSibling);
    ensureState(li);
  }

  function scan() {
    Core.injectStyles(Core.BUTTON_CSS);
    pruneStates();
    document.querySelectorAll(MSG_SEL).forEach((li) => {
      ensureButton(li);
      reconcile(li);
      maybeAutoTranslate(li);
      const btn = li.querySelector('[data-latex-ext="msg"]');
      const st = stateFor(li);
      if (btn && !(st && st.saved)) refreshLabel(li, btn);
    });
  }

  function onSettingsChanged() {
    const messageFlag = !!Core.settings.message;
    if (messageFlag !== lastMessageFlag) {
      lastMessageFlag = messageFlag;
      resetMessageDefaults();
    }
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
