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
    return latex > latin ? "latex" : "latin";
  }

  function otherMode(mode) {
    return mode === "latin" ? "latex" : "latin";
  }

  function translate(text, fromMode) {
    return fromMode === "latin" ? encodeToLatex(text) : decodeToLatin(text);
  }

  const VERSION = "1.0.5";

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
