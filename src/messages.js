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
