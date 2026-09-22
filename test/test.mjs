import { Window } from "happy-dom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const window = new Window({ url: "https://discord.com/channels/1/2" });
const { document } = window;

document.head.innerHTML = "";
document.body.innerHTML = readFileSync(path.join(dir, "harness.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>/g, "");

global.window = window;
global.document = document;
global.Element = window.Element;
global.NodeFilter = window.NodeFilter;
global.Node = window.Node;
global.MutationObserver = window.MutationObserver;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.DataTransfer = window.DataTransfer;
global.ClipboardEvent = window.ClipboardEvent;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.InputEvent = window.InputEvent || window.Event;

function computeInnerText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return clone.textContent;
}
Object.defineProperty(window.HTMLElement.prototype, "innerText", {
  get() { return computeInnerText(this); },
  set(v) { this.textContent = v; },
  configurable: true
});

function fireInput(el) {
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

document.execCommand = (cmd, _ui, value) => {
  const sel = window.getSelection();
  const anchor = sel && sel.anchorNode;
  const node =
    (anchor && anchor.nodeType === 3 && anchor.parentElement) ||
    anchor ||
    document.getElementById("editor");
  const ed =
    (node && node.closest && node.closest("[contenteditable]")) ||
    document.getElementById("editor");
  if (!ed) return false;

  if (cmd === "insertText") {
    const text = value == null ? "" : String(value);
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const replaceAll = !range.collapsed && (
        range.toString().length >= (ed.textContent || "").length ||
        range.startOffset === 0 && range.endOffset >= (ed.childNodes.length || 0)
      );
      range.deleteContents();
      if (text) {
        const tn = document.createTextNode(text);
        range.insertNode(tn);
        const r2 = document.createRange();
        r2.selectNodeContents(tn);
        r2.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r2);
      } else {
        const r2 = document.createRange();
        r2.setStart(range.startContainer, range.startOffset);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);
      }
      void replaceAll;
    } else if (text) {
      const tn = document.createTextNode(text);
      ed.appendChild(tn);
      const sel2 = window.getSelection();
      const r2 = document.createRange();
      r2.selectNodeContents(tn);
      r2.collapse(false);
      sel2.removeAllRanges();
      sel2.addRange(r2);
    }
    fireInput(ed);
  } else if (cmd === "delete") {
    if (sel && sel.rangeCount) sel.getRangeAt(0).deleteContents();
    fireInput(ed);
  } else if (cmd === "insertLineBreak") {
    const br = document.createElement("br");
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(br);
      range.setStartAfter(br);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      ed.appendChild(br);
    }
    fireInput(ed);
  }
  return true;
};

const load = (f) => {
  const code = readFileSync(path.join(dir, "..", "src", f), "utf8");
  new Function(code).call(window);
};

load("core.js");
load("composer.js");
load("messages.js");

const results = {};
const assert = (name, cond, detail) => {
  results[name] = cond ? "PASS" : "FAIL: " + JSON.stringify(detail);
};
const ed = document.getElementById("editor");
const cbtn = document.querySelector('[data-latex-ext="composer"]');
const readEd = () => computeInnerText(ed).replace(/\n$/, "");

function simulateUserType(el, ch) {
  const ev = new window.Event("beforeinput", { bubbles: true, cancelable: true });
  ev.inputType = "insertText";
  ev.data = ch;
  el.dispatchEvent(ev);
  if (!ev.defaultPrevented) {
    const ins = ev.data != null ? String(ev.data) : ch;
    el.textContent = (computeInnerText(el) || "") + ins;
    fireInput(el);
  }
}

function typeStr(el, s) {
  for (const ch of s) simulateUserType(el, ch);
}

const C = window.LatexCore;
assert(
  "core example",
  C.encodeToLatex("si estas leyendo esto correctamente, lo has traducido te puta madre") ===
    "Φ∩ εΦ╪σΦ Œε¥εþ₳⌐ εΦ╪⌐ Ǝ⌐ΩΩεƎ╪σβεþ╪ε, Œ⌐ µσΦ ╪Ωσ₳↨Ǝ∩₳⌐ ╪ε Æ↨╪σ βσ₳Ωε",
  null
);
assert("ç", C.encodeToLatex("ç") === "ǝ", C.encodeToLatex("ç"));
assert("ñ", C.encodeToLatex("ñ") === "Þ", C.encodeToLatex("ñ"));
assert("emoji shortcode intact", C.encodeToLatex("hola :sob: adios") === "µ⌐Œσ :sob: σ₳∩⌐Φ", C.encodeToLatex("hola :sob: adios"));
assert("custom emoji intact", C.encodeToLatex("hi <:name:123>") === "µ∩ <:name:123>", C.encodeToLatex("hi <:name:123>"));
assert("decode keeps shortcode", C.decodeToLatin(":sob: µ⌐Œσ") === ":sob: hola", C.decodeToLatin(":sob: µ⌐Œσ"));

assert("default Disabled", cbtn.dataset.mode === "disabled", cbtn.textContent);
assert("first child panel", cbtn.parentElement.firstElementChild === cbtn.parentElement.querySelector(".latex-ext-title"), null);
assert("panel title", cbtn.parentElement.querySelector(".latex-ext-title").textContent === "LATEX v" + C.VERSION, cbtn.parentElement.querySelector(".latex-ext-title")?.textContent);
assert("encoding label disabled", cbtn.textContent === "Encoding disabled", cbtn.textContent);

const liveBtn = cbtn.parentElement.querySelector('[data-latex-ext="live"]');
const msgBtn = cbtn.parentElement.querySelector('[data-latex-ext="msgauto"]');
assert("live default on", liveBtn && liveBtn.textContent === "Live encoding enabled", liveBtn?.textContent);
assert("msg default off", msgBtn && msgBtn.textContent === "Message encoding disabled", msgBtn?.textContent);

const probe = new window.Event("beforeinput", { bubbles: true, cancelable: true });
probe.inputType = "insertText";
probe.data = "x";
ed.dispatchEvent(probe);
assert("window capture active (disabled: not prevented)", probe.defaultPrevented === false, probe.defaultPrevented);

cbtn.click();
assert("→ latin", readEd() === "Hola hola" && readEd().length > 0, readEd());
assert("encoding label latin", cbtn.textContent === "Encoding to Latin", cbtn.textContent);
cbtn.click();
assert("→ latex", readEd() === "µ⌐Œσ µ⌐Œσ" && readEd().length > 0, readEd());
assert("encoding label latex", cbtn.textContent === "Encoding to Latex", cbtn.textContent);
cbtn.click();
assert("→ disabled restores", readEd() === "Hola µ⌐Œσ", readEd());
assert("encoding label disabled again", cbtn.textContent === "Encoding disabled", cbtn.textContent);
cbtn.click();
assert("→ latin again", readEd() === "Hola hola", readEd());

const t1 = new window.Event("beforeinput", { bubbles: true, cancelable: true });
t1.inputType = "insertText";
t1.data = " ";
ed.dispatchEvent(t1);
assert("space not blocked", t1.defaultPrevented === false, t1.defaultPrevented);
if (!t1.defaultPrevented) {
  const ins = t1.data != null ? String(t1.data) : " ";
  ed.textContent = (computeInnerText(ed) || "") + ins;
  fireInput(ed);
}
assert("space inserted translated", readEd() === "Hola hola ", JSON.stringify(readEd()));

const t2 = new window.Event("beforeinput", { bubbles: true, cancelable: true });
t2.inputType = "insertText";
t2.data = "β";
ed.dispatchEvent(t2);
assert("β not blocked", t2.defaultPrevented === false, t2.defaultPrevented);
assert("β data mutated to m", t2.data === "m", t2.data);
if (!t2.defaultPrevented) {
  const ins = t2.data != null ? String(t2.data) : "β";
  ed.textContent = (computeInnerText(ed) || "") + ins;
  fireInput(ed);
}
assert("β→m live", readEd() === "Hola hola m", readEd());

typeStr(ed, "ε⌐w");
assert("latin meow", readEd() === "Hola hola meow", readEd());

cbtn.click();
assert("latex from original", readEd() === "µ⌐Œσ µ⌐Œσ βε⌐w", readEd());

typeStr(ed, " meow");
assert("latex live m→β", readEd() === "µ⌐Œσ µ⌐Œσ βε⌐w βε⌐w", readEd());

cbtn.click();
assert("disabled full original", readEd() === "Hola µ⌐Œσ βε⌐w meow", readEd());

ed.textContent = "";
fireInput(ed);
assert("disabled clear no ghost", computeInnerText(ed) === "" && ed.textContent === "", {
  inner: computeInnerText(ed),
  text: ed.textContent,
  html: ed.innerHTML
});

ed.textContent = "nuevo texto";
fireInput(ed);
assert("disabled retype", readEd() === "nuevo texto", readEd());

cbtn.click();
assert("latin of nuevo", readEd() === "nuevo texto", readEd());
cbtn.click();
assert("latex of nuevo", readEd() !== "nuevo texto" && readEd().length > 0, readEd());
cbtn.click();
assert("disabled back", readEd() === "nuevo texto", readEd());

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click(); 
assert("latin has text", readEd() === "Hola hola", readEd());

const delEv = new window.Event("beforeinput", { bubbles: true, cancelable: true });
delEv.inputType = "deleteContentBackward";
ed.dispatchEvent(delEv);
ed.textContent = "";
fireInput(ed);
await wait(5);

assert("delete-all display empty, not retranslated", readEd() === "", readEd());
cbtn.click(); 
assert("after delete latex stays empty", readEd() === "", readEd());
cbtn.click(); 
assert("after delete disabled stays empty", readEd() === "", readEd());

ed.textContent = "meow\n:sob:";
fireInput(ed);
cbtn.click(); 
assert("nl+sob latin", readEd() === "meow\n:sob:", JSON.stringify(readEd()));
cbtn.click(); 
assert(
  "nl+sob latex no extra lines",
  readEd() === "βε⌐w\n:sob:",
  JSON.stringify(readEd())
);
assert("no BOM in html", !ed.innerHTML.includes("\uFEFF"), ed.innerHTML);
cbtn.click(); 
assert("nl+sob disabled restore", readEd() === "meow\n:sob:", JSON.stringify(readEd()));
assert("no ghost after sob cycle", ed.textContent === "meow\n:sob:", {
  text: ed.textContent,
  html: ed.innerHTML,
  childCount: ed.childNodes.length
});

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click(); 
assert("pre-send latin", readEd() === "Hola hola", readEd());
cbtn.click(); 
assert("pre-send latex", readEd() === "µ⌐Œσ µ⌐Œσ", readEd());

ed.dispatchEvent(
  new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
);
ed.textContent = "";
fireInput(ed);
await wait(80);

cbtn.click(); 
assert("after send disabled empty", readEd() === "", readEd());
cbtn.click(); 
assert("after send latin still empty", readEd() === "", readEd());
cbtn.click(); 
assert("after send latex still empty", readEd() === "", readEd());
cbtn.click(); 

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click(); 
assert("pre-live-off latin", readEd() === "Hola hola", readEd());
liveBtn.click();
assert("live label disabled", liveBtn.textContent === "Live encoding disabled", liveBtn.textContent);
assert("live-off reverts to original", readEd() === "Hola µ⌐Œσ", readEd());

const rawInsert = new window.Event("beforeinput", { bubbles: true, cancelable: true });
rawInsert.inputType = "insertText";
rawInsert.data = "z";
ed.dispatchEvent(rawInsert);
assert("live-off not prevented", rawInsert.defaultPrevented === false, rawInsert.defaultPrevented);
if (!rawInsert.defaultPrevented) {
  ed.textContent = (computeInnerText(ed) || "") + "z";
  fireInput(ed);
}
assert("live-off raw stays", readEd() === "Hola µ⌐Œσz", readEd());

ed.dispatchEvent(
  new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
);
assert("live-off prepareSend encodes", readEd() === "Hola holaz", readEd());

liveBtn.click();
assert("live re-enabled label", liveBtn.textContent === "Live encoding enabled", liveBtn.textContent);
cbtn.click(); 
assert("latin→latex after live-off", readEd() === "µ⌐Œσ µ⌐Œσ√", readEd());
cbtn.click(); 
assert("back to disabled", readEd() === "Hola µ⌐Œσz", readEd());

ed.textContent = "nuevo draft";
fireInput(ed);
cbtn.click(); 
cbtn.click(); 
assert("stale-prep latex mode", readEd() !== "nuevo draft", readEd());
liveBtn.click(); 
assert("stale-prep live off original", readEd() === "nuevo draft", readEd());
ed.textContent = "otro texto";
assert("stale-prep dom only (no input → original still old)", readEd() === "otro texto", readEd());
ed.dispatchEvent(
  new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
);
assert(
  "stale cache does not leak on send",
  readEd() === C.encodeToLatex("otro texto"),
  { got: readEd(), want: C.encodeToLatex("otro texto") }
);
liveBtn.click(); 
cbtn.click(); 
ed.textContent = "";
fireInput(ed);

ed.textContent = "stale hello";
fireInput(ed);
cbtn.click(); 
assert("stale prep latin", readEd() === "stale hello", readEd());
liveBtn.click(); 
assert("stale prep live off", readEd() === "stale hello", readEd());
ed.textContent = "fresh typed";
const staleEnter = new window.KeyboardEvent("keydown", {
  key: "Enter",
  bubbles: true,
  cancelable: true
});
ed.dispatchEvent(staleEnter);
assert(
  "live-off send uses DOM not stale original",
  readEd() === "fresh typed" || readEd() === C.encodeToLatex("fresh typed") || readEd() === C.decodeToLatin("fresh typed"),
  readEd()
);
liveBtn.click(); 
cbtn.click(); 
cbtn.click(); 

ed.textContent = "";
fireInput(ed);
msgBtn.click();
assert("msg label enabled", msgBtn.textContent === "Message encoding enabled", msgBtn.textContent);

const li3 = document.getElementById("chat-messages-333");
await wait(50);
const content3 = document.getElementById("message-content-333");
const badge3 = content3.querySelector('[data-latex-ext="badge"]');
assert("auto translate latex msg", content3.textContent.includes("si estas"), content3.textContent);
assert("auto badge latex", badge3 && badge3.textContent === "(latex)", badge3?.textContent);

msgBtn.click();
assert("msg label disabled", msgBtn.textContent === "Message encoding disabled", msgBtn.textContent);
await wait(50);
assert("msg restore after disable", content3.textContent.includes("Φ∩"), content3.textContent);
assert("badge removed", !content3.querySelector('[data-latex-ext="badge"]'), content3.innerHTML);

const li4 = document.getElementById("chat-messages-444");
const content4 = document.getElementById("message-content-444");
const mbtn4 = li4.querySelector('[data-latex-ext="msg"]');
mbtn4.click(); 
const badge4 = content4.querySelector('[data-latex-ext="badge"]');
const edited4 = content4.querySelector(".edited");
assert("manual badge latex", badge4 && badge4.textContent === "(latex)", badge4?.textContent);
assert(
  "badge before edited",
  badge4 && edited4 && !!(badge4.compareDocumentPosition(edited4) & Node.DOCUMENT_POSITION_FOLLOWING),
  { badge: !!badge4, edited: !!edited4 }
);
assert("edited text intact", content4.textContent.includes("(edited)"), content4.textContent);
assert("edited not translated", !content4.textContent.includes("⊘") && content4.textContent.includes("(edited)"), content4.textContent);
mbtn4.click();
assert("manual restore removes badge", !content4.querySelector('[data-latex-ext="badge"]'), content4.innerHTML);
assert("manual restore keeps edited", content4.textContent.includes("(edited)"), content4.textContent);

const slateHost = document.createElement("div");
slateHost.setAttribute("data-slate-editor", "true");
slateHost.setAttribute("role", "textbox");
slateHost.setAttribute("contenteditable", "true");
slateHost.innerHTML =
  'yooo wsp ' +
  '<div data-slate-node="element">' +
  '<span data-slate-node="text"><span data-slate-leaf="true" class="emptyText__1464f">' +
  '<span data-slate-zero-width="z" data-slate-length="0">\uFEFF</span></span></span>' +
  '<span data-slate-node="element" data-slate-inline="true" data-slate-void="true" contenteditable="false" class="inlineVoid__1464f">' +
  '<img class="emoji" data-type="emoji" data-name=":sob:" alt=":sob:">' +
  '<span class="hiddenVisually_b18fe2">:sob:</span>' +
  '<span data-slate-spacer="true"><span data-slate-node="text">' +
  '<span data-slate-leaf="true"><span data-slate-zero-width="z" data-slate-length="0">\uFEFF</span></span></span></span>' +
  "</span>" +
  '<span data-slate-node="text"><span data-slate-leaf="true" class="emptyText__1464f">' +
  '<span data-slate-zero-width="n" data-slate-length="0">\uFEFF<br></span></span></span>' +
  "</div>";

const wrap = document.createElement("div");
wrap.className = "channelTextArea__w";
wrap.innerHTML = '<div class="buttons__w"><button>Emoji</button></div>';
wrap.insertBefore(slateHost, wrap.firstChild);
document.body.appendChild(wrap);
await wait(50);

const slateBtn = wrap.querySelector('[data-latex-ext="composer"]');
assert("slate-structure button", !!slateBtn, null);
if (slateBtn) {
  slateBtn.click(); 
  const latinText = slateHost.textContent || "";
  assert(
    "slate latin: emoji + text present",
    latinText.includes(":sob:") && latinText.includes("yooo"),
    JSON.stringify(latinText)
  );
  slateBtn.click(); 
  const latexText = slateHost.textContent || "";
  assert("slate latex: no BOM after rewrite", !latexText.includes("\uFEFF"), JSON.stringify(latexText));
  assert(
    "slate latex: shortcode kept",
    latexText.includes(":sob:"),
    JSON.stringify(latexText)
  );
  slateBtn.click(); 
  const backText = slateHost.textContent || "";
  assert("slate disabled: no BOM after full cycle", !backText.includes("\uFEFF"), JSON.stringify(backText));
  assert(
    "slate disabled: has content",
    backText.includes("yooo") || backText.includes(":sob:"),
    JSON.stringify(backText)
  );
}

const edE = document.getElementById("editor-empty");
const cbtnE = [...document.querySelectorAll('[data-latex-ext="composer"]')].find(
  (b) => b.closest(".channelTextArea__empty")
);
assert("empty has button", !!cbtnE, null);
if (cbtnE) {
  const htmlBefore = edE.innerHTML;
  cbtnE.click();
  cbtnE.click();
  cbtnE.click();
  assert(
    "empty permute no DOM",
    edE.innerHTML === htmlBefore && computeInnerText(edE) === "",
    { before: htmlBefore, after: edE.innerHTML }
  );
}

const li1 = document.getElementById("chat-messages-111");
const mbtn1 = li1.querySelector('[data-latex-ext="msg"]');
const mpanel1 = li1.querySelector('[data-latex-ext="msg-panel"]');
const actions1 = li1.querySelector('[class*="buttonsInner"]');
assert("msg panel exists", !!mpanel1, null);
assert("msg panel title", mpanel1 && mpanel1.querySelector(".latex-ext-title").textContent === "LATEX v" + C.VERSION, mpanel1?.querySelector(".latex-ext-title")?.textContent);
assert("msg panel first", actions1 && actions1.firstElementChild === mpanel1, actions1?.firstElementChild?.className);
assert("msg btn inside panel", mbtn1 && mbtn1.parentElement === mpanel1, null);
assert("msg btn label initial", mbtn1 && mbtn1.textContent === "Latin", mbtn1?.textContent);
const content1 = document.getElementById("message-content-111");
mbtn1.click();
assert("msg transform", content1.textContent.includes("σ"), content1.textContent);
assert("msg btn after transform", mbtn1.textContent === "Latex", mbtn1.textContent);
mbtn1.click();
assert("msg restore", content1.textContent.includes("Œβσ"), content1.textContent);

const li2 = document.getElementById("chat-messages-222");
const mbtn2 = li2.querySelector('[data-latex-ext="msg"]');
const embedDesc = li2.querySelector(".embedDescription__abc123");
const compBtn = li2.querySelector(".button__def456 .contents__def456");
mbtn2.click();
assert("embed transform", embedDesc.textContent !== "Descripcion del embed", embedDesc.textContent);
assert("component transform", compBtn.textContent !== "Aceptar cosa", compBtn.textContent);
assert("label Latex", mbtn2.textContent === "Latex", mbtn2.textContent);
assert(
  "embed msg btn in panel",
  mbtn2.parentElement && mbtn2.parentElement.dataset.latexExt === "msg-panel",
  mbtn2.parentElement?.dataset?.latexExt
);
mbtn2.click();
assert("embed restore", embedDesc.textContent === "Descripcion del embed", embedDesc.textContent);
assert("component restore", compBtn.textContent === "Aceptar cosa", compBtn.textContent);

const content5 = document.getElementById("message-content-111");
mbtn1.click();
assert("manual on 111", content5.textContent.includes("σ"), content5.textContent);
msgBtn.click();
await wait(50);
assert(
  "msg translation off does not revert manual",
  content5.textContent.includes("σ"),
  content5.textContent
);
msgBtn.click();
await wait(50);
assert(
  "msg translation on leaves manual alone",
  content5.textContent.includes("σ"),
  content5.textContent
);
mbtn1.click();

const panelHost = cbtn.closest('[data-latex-ext="panel"]') || cbtn.parentElement;
const panelNodeBefore = panelHost;
const panelParentBefore = panelHost.parentElement;
if (window.__latexExtComposerScan) window.__latexExtComposerScan();
if (window.__latexExtMessagesScan) window.__latexExtMessagesScan();
await wait(20);
assert(
  "panel not moved on rescan",
  panelNodeBefore.parentElement === panelParentBefore &&
    panelNodeBefore.isConnected,
  {
    connected: panelNodeBefore.isConnected,
    parentSame: panelNodeBefore.parentElement === panelParentBefore
  }
);

const styleBefore = document.getElementById("latex-ext-styles");
if (styleBefore) styleBefore.remove();
if (window.__latexExtComposerScan) window.__latexExtComposerScan();
assert("styles re-injected", !!document.getElementById("latex-ext-styles"), null);

const bomEditor = document.createElement("div");
bomEditor.setAttribute("data-slate-editor", "true");
bomEditor.setAttribute("role", "textbox");
bomEditor.setAttribute("contenteditable", "true");
bomEditor.innerHTML =
  'hola' +
  '<span data-slate-zero-width="z" data-slate-length="0">﻿</span>' +
  '<span data-slate-node="text"><span data-slate-leaf="true">' +
  '<span data-slate-zero-width="n" data-slate-length="0">﻿<br></span></span></span>' +
  'mundo';
const bomWrap = document.createElement("div");
bomWrap.className = "channelTextArea__bom";
bomWrap.innerHTML = '<div class="buttons__bom"><button>E</button></div>';
bomWrap.insertBefore(bomEditor, bomWrap.firstChild);
document.body.appendChild(bomWrap);
await wait(50);
const bomBtn = bomWrap.querySelector('[data-latex-ext="composer"]');
assert("bom editor has panel", !!bomBtn, null);
if (bomBtn) {
  bomBtn.click();
  const latinBom = bomBtn.closest(".channelTextArea__bom")
    ? bomEditor.textContent
    : bomEditor.textContent;
  assert(
    "bom cycle latin keeps text",
    latinBom.includes("hola") && latinBom.includes("mundo"),
    JSON.stringify(latinBom)
  );
  bomBtn.click();
  bomBtn.click();
  assert(
  "bom cycle back no duplicate",
    (bomEditor.textContent.match(/hola/g) || []).length === 1 &&
      (bomEditor.textContent.match(/mundo/g) || []).length === 1,
    bomEditor.textContent
  );
}

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click();
assert("post-send setup latin", readEd() === "Hola hola", readEd());
ed.textContent = "";
assert("cleared without input event", readEd() === "", readEd());
cbtn.click();
assert(
  "empty editor after send: encode toggle no ghost",
  readEd() === "",
  readEd()
);
cbtn.click();
assert(
  "empty editor after send: back to disabled no ghost",
  readEd() === "",
  readEd()
);

ed.textContent = "send me";
fireInput(ed);
cbtn.click();
assert("send path latin", readEd() === "send me", readEd());
ed.dispatchEvent(
  new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
);
ed.textContent = "";
await wait(900);
cbtn.click();
cbtn.click();
assert(
  "after Enter+empty: no ghost restore",
  readEd() === "",
  readEd()
);

const ghostWrap = document.createElement("div");
ghostWrap.className = "channelTextArea__ghost";
ghostWrap.innerHTML =
  '<div class="slateBox">' +
  '<div data-slate-placeholder="true">Message Group</div>' +
  '<div data-slate-editor="true" role="textbox" contenteditable="true" id="editor-ghost">' +
  "wσwσwσwσw" +
  '<div data-slate-node="element"><span data-slate-node="text">' +
  '<span data-slate-leaf="true"><span data-slate-zero-width="n" data-slate-length="0">﻿<br></span></span></span></div>' +
  "</div>" +
  '<div class="buttons__ghost"><button>E</button></div>' +
  "</div>";
document.body.appendChild(ghostWrap);
await wait(50);
const ghostEd = document.getElementById("editor-ghost");
const ghostBtn = ghostWrap.querySelector('[data-latex-ext="composer"]');
assert("ghost editor has panel", !!ghostBtn, null);
if (ghostBtn) {
  ghostBtn.click();
  assert(
    "placeholder+orphan: toggle clears ghost",
    !ghostEd.textContent.includes("wσwσ"),
    ghostEd.textContent
  );
  ghostBtn.click();
  ghostBtn.click();
  assert(
    "placeholder+orphan: full cycle stays clean",
    !ghostEd.textContent.includes("wσwσ"),
    ghostEd.textContent
  );
}

ghostEd.textContent = "wσwσwσwσw";
const ghostEnter = new window.KeyboardEvent("keydown", {
  key: "Enter",
  bubbles: true,
  cancelable: true
});
ghostEd.dispatchEvent(ghostEnter);
await wait(900);
assert(
  "placeholder+orphan: send clear removes ghost",
  !ghostEd.textContent.includes("wσwσ"),
  ghostEd.textContent
);

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click();
assert("live-toggle setup latin", readEd() === "Hola hola", readEd());
ed.textContent = "Hola hola!";
fireInput(ed);
liveBtn.click();
assert(
  "live-off keeps newly typed text in cache form",
  readEd().includes("!"),
  readEd()
);
liveBtn.click();
assert(
  "live-on keeps newly typed text",
  readEd().includes("!"),
  readEd()
);
cbtn.click();
cbtn.click();

ed.textContent = "Hola µ⌐Œσ";
fireInput(ed);
cbtn.click();
cbtn.click();
assert("live-on setup latex", readEd() !== "Hola µ⌐Œσ", readEd());
ed.textContent = readEd() + "!";
fireInput(ed);
liveBtn.click();
assert(
  "live-off after latex typing keeps exclamation",
  readEd().includes("!"),
  readEd()
);
liveBtn.click();
cbtn.click();
cbtn.click();

console.log(JSON.stringify(results, null, 2));
const fails = Object.entries(results).filter(([, v]) => String(v).startsWith("FAIL"));
process.exit(fails.length ? 1 : 0);
