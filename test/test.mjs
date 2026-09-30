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

const results = {};
const assert = (name, cond, detail) => {
  results[name] = cond ? "PASS" : "FAIL: " + JSON.stringify(detail);
};

// Start from a clean slate so the default settings are deterministic.
window.localStorage.clear();
assert("localStorage starts empty", window.localStorage.length === 0, window.localStorage.length);

const readSource = (f) => readFileSync(path.join(dir, "..", "src", f), "utf8");
const load = (f) => {
  new Function(readSource(f)).call(window);
};

const coreSource = readSource("core.js");
load("core.js");
load("composer.js");
load("messages.js");

const C = window.LatexCore;
const STORAGE_KEY = "latex-ext-settings";
const ed = document.getElementById("editor");
const emptyEditor = document.getElementById("editor-empty");
const searchEditor = document.getElementById("search-editor");
const modalEditor = document.getElementById("modal-editor");
const composerScope = document.querySelector(".channelTextArea__abc");
const cbtn = composerScope.querySelector('[data-latex-ext="composer"]');
const dbtn = composerScope.querySelector('[data-latex-ext="decode"]');
const composerPanel = cbtn.parentElement;
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

function firePaste(el, text) {
  const ev = new window.Event("paste", { bubbles: true, cancelable: true });
  const store = { "text/plain": text };
  ev.clipboardData = {
    getData(type) { return store[type] || ""; },
    setData(type, v) { store[type] = v; },
    types: ["text/plain"]
  };
  el.dispatchEvent(ev);
  return store;
}

const key = (k, init) => new window.KeyboardEvent("keydown", {
  key: k, bubbles: true, cancelable: true, ...init
});
const pointer = (type) => new window.Event(type, { bubbles: true, cancelable: true });
const mouse = (type) => new window.MouseEvent(type, { bubbles: true, cancelable: true });

const setEncode = (want) => {
  if (C.settings.encode !== want) cbtn.click();
};
const setDecode = async (want) => {
  if (C.settings.decode !== want) {
    dbtn.click();
    await wait(10);
  }
};

// Text nodes that live directly under a slate editor (i.e. orphans that
// Discord can leave behind when it clears the composer after a send).
function strayRootText(el) {
  return [...el.childNodes]
    .filter((n) => n.nodeType === 3 && (n.nodeValue || "").replace(/﻿/g, ""))
    .map((n) => n.nodeValue);
}

let fxSeq = 0;
function addComposerChannel(inner) {
  const el = document.createElement("div");
  el.className = "channelTextArea__fx" + fxSeq++;
  el.innerHTML = inner;
  document.body.appendChild(el);
  return el;
}

let msgSeq = 0;
function addMessage(markupInner) {
  const id = "chat-messages-t" + msgSeq++;
  const li = document.createElement("li");
  li.id = id;
  li.innerHTML =
    '<div id="message-content-' + id + '"><div class="markup">' + markupInner + "</div></div>" +
    '<div class="buttonContainer_c19a55"><div class="buttons__5126c" role="group" aria-label="Message Actions">' +
    '<div class="buttonsInner__5126c popover_f84418">' +
    '<div class="hoverBarButton" aria-label="AddReaction">+</div>' +
    "</div></div></div>";
  document.querySelector("ul").appendChild(li);
  return li;
}
const REPLY_SEL =
  '[class*="repliedMessage"], [class*="replied" i], [class*="replyBar"], [class*="messageReply"]';
const msgContent = (li) =>
  [...li.querySelectorAll('[id^="message-content-"]')].find(
    (el) => !el.closest(REPLY_SEL)
  ) || li.querySelector('[id^="message-content-"]');
const msgBtn = (li) => li.querySelector('[data-latex-ext="msg"]');
const msgBadge = (li) => msgContent(li).querySelector('[data-latex-ext="badge"]');
// Visible text of a message root with the injected badge excluded.
const extFreeText = (root) => {
  const clone = root.cloneNode(true);
  clone.querySelectorAll("[data-latex-ext]").forEach((n) => n.remove());
  return clone.textContent;
};
const msgText = (li) => extFreeText(msgContent(li).querySelector(".markup") || msgContent(li));
const scanMessages = () => {
  if (window.__latexExtMessagesScan) window.__latexExtMessagesScan();
};
const scanComposer = () => {
  if (window.__latexExtComposerScan) window.__latexExtComposerScan();
};

/* ================================================================== *
 * 1. Core: encoding / decoding / detection (unchanged by the refactor)
 * ================================================================== */
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

const encUrl = C.encodeToLatex("see https://discord.com/channels/1/2 now");
assert(
  "url intact on encode",
  encUrl.includes("https://discord.com/channels/1/2") && encUrl.startsWith("Φεε "),
  encUrl
);
assert(
  "url intact on decode",
  C.decodeToLatin("sεε https://discord.com/channels/1/2 σ♥") === "see https://discord.com/channels/1/2 o" ||
    C.decodeToLatin(encUrl).includes("https://discord.com/channels/1/2"),
  C.decodeToLatin(encUrl)
);
const encMention = C.encodeToLatex("hi <@123456789012345678> ok");
assert(
  "user mention intact",
  encMention.includes("<@123456789012345678>") && encMention.startsWith("µ∩ "),
  encMention
);
assert(
  "role mention intact",
  C.encodeToLatex("<@&999> hi").includes("<@&999>"),
  C.encodeToLatex("<@&999> hi")
);
assert(
  "channel mention intact",
  C.encodeToLatex("go <#555> now").includes("<#555>"),
  C.encodeToLatex("go <#555> now")
);
assert(
  "timestamp intact",
  C.encodeToLatex("at <t:1700000000:R> x").includes("<t:1700000000:R>"),
  C.encodeToLatex("at <t:1700000000:R> x")
);
const encCode = C.encodeToLatex("`const x = 1` done");
assert(
  "inline code intact",
  encCode.includes("`const x = 1`") && encCode.endsWith(" ₳⌐þε"),
  encCode
);
assert(
  "code block intact",
  C.encodeToLatex("```\nlet a = 42;\n```\nhi").includes("let a = 42;"),
  C.encodeToLatex("```\nlet a = 42;\n```\nhi")
);
assert(
  "markdown link url intact",
  C.encodeToLatex("[hi](https://example.com/a)").includes("(https://example.com/a)"),
  C.encodeToLatex("[hi](https://example.com/a)")
);
assert(
  "markdown link text encoded url kept",
  C.encodeToLatex("[hi](https://example.com/a)").includes("[µ∩]"),
  C.encodeToLatex("[hi](https://example.com/a)")
);
assert(
  "detect encoded w is latex",
  C.detect(C.encodeToLatex("hello world")) === "latex",
  C.detect(C.encodeToLatex("hello world"))
);
assert(
  "detect bare w latin",
  C.detect("www") === "latin",
  C.detect("www")
);
assert(
  "detect mixed still works",
  C.detect("hola Φ∩") === "mixed",
  C.detect("hola Φ∩")
);
assert(
  "detect pure latex",
  C.detect("Φ∩ εΦ╪σΦ") === "latex",
  C.detect("Φ∩ εΦ╪σΦ")
);
assert(
  "detect pure latin",
  C.detect("hello world") === "latin",
  C.detect("hello world")
);
assert("version is 1.5.0", C.VERSION === "1.5.0", C.VERSION);

/* ================================================================== *
 * 2. Settings model
 * ================================================================== */
assert(
  "default settings are encode:false decode:true",
  C.settings.encode === false && C.settings.decode === true,
  C.settings
);
assert(
  "default settings object has only encode and decode keys",
  Object.keys(C.settings).sort().join(",") === "decode,encode",
  Object.keys(C.settings)
);
assert(
  "no live-translation settings remain (auto/live/message)",
  C.settings.auto === undefined &&
    C.settings.live === undefined &&
    C.settings.message === undefined,
  C.settings
);

// A stored payload from the old (1.4.x) format must be ignored wholesale.
window.localStorage.setItem(
  STORAGE_KEY,
  JSON.stringify({ auto: "both", live: true, message: true })
);
delete window.LatexCore;
new Function(coreSource).call(window);
const legacyCore = window.LatexCore;
assert(
  "legacy stored settings are ignored and defaults are used",
  legacyCore.settings.encode === false &&
    legacyCore.settings.decode === true &&
    legacyCore.settings.auto === undefined &&
    legacyCore.settings.live === undefined &&
    legacyCore.settings.message === undefined,
  legacyCore.settings
);
window.localStorage.removeItem(STORAGE_KEY);
delete window.LatexCore;
new Function(coreSource).call(window);
// Restore the original singleton identity so the loaded composer/messages
// modules keep talking to the same object.
for (const k of Object.keys(C)) delete C[k];
Object.assign(C, window.LatexCore);
delete window.LatexCore;
window.LatexCore = C;
assert(
  "core singleton identity restored after the legacy-payload probe",
  window.LatexCore === C && C.VERSION === "1.5.0" && C.settings.encode === false,
  { version: C.VERSION, settings: C.settings }
);
assert(
  "legacy probe leaves localStorage without the settings key",
  window.localStorage.getItem(STORAGE_KEY) === null,
  window.localStorage.getItem(STORAGE_KEY)
);

/* ================================================================== *
 * 3. Composer panel structure
 * ================================================================== */
assert("composer panel exists inside channelTextArea", !!composerPanel, null);
assert(
  "composer panel children order is title, encode button, decode button",
  composerPanel.children.length === 3 &&
    composerPanel.children[0].classList.contains("latex-ext-title") &&
    composerPanel.children[1] === cbtn &&
    composerPanel.children[2] === dbtn,
  [...composerPanel.children].map((c) => c.className + ":" + c.dataset.latexExt)
);
assert(
  "composer panel title is the first child",
  composerPanel.firstElementChild === composerPanel.querySelector(".latex-ext-title"),
  composerPanel.firstElementChild && composerPanel.firstElementChild.className
);
assert(
  "composer panel title text",
  composerPanel.querySelector(".latex-ext-title").textContent.startsWith("LATEX v" + C.VERSION),
  composerPanel.querySelector(".latex-ext-title").textContent
);
assert(
  "encode button defaults to 'Encoding disabled'",
  cbtn.textContent === "Encoding disabled" && cbtn.dataset.mode === "disabled",
  { text: cbtn.textContent, mode: cbtn.dataset.mode }
);
assert(
  "decode button defaults to 'Decoding enabled'",
  dbtn.textContent === "Decoding enabled" && dbtn.dataset.mode === "enabled",
  { text: dbtn.textContent, mode: dbtn.dataset.mode }
);
assert(
  "no auto button in the panel (4-state cycle removed)",
  !composerPanel.querySelector('[data-latex-ext="auto"]'),
  null
);
assert(
  "no bulk button in the panel (bulk encode/restore removed)",
  !composerPanel.querySelector('[data-latex-ext="bulk"]'),
  null
);
assert(
  "no 'Encoding to Latin/Latex' label anywhere",
  !document.body.textContent.includes("Encoding to "),
  null
);
assert(
  "no 'Live encoding' or 'Message encoding' label anywhere",
  !document.body.textContent.includes("Live encoding") &&
    !document.body.textContent.includes("Message encoding"),
  null
);

/* ================================================================== *
 * 4. Toggling settings from the panel
 * ================================================================== */
let settingsEvents = 0;
window.addEventListener("latex-ext-settings-changed", () => {
  settingsEvents++;
});

cbtn.click();
assert("encode button click toggles settings.encode to true", C.settings.encode === true, C.settings.encode);
assert(
  "encode button label flips to 'Encoding enabled'",
  cbtn.textContent === "Encoding enabled" && cbtn.dataset.mode === "enabled",
  { text: cbtn.textContent, mode: cbtn.dataset.mode }
);
assert("encode button click dispatches latex-ext-settings-changed", settingsEvents === 1, settingsEvents);
assert(
  "encode toggle refreshes every panel",
  [...document.querySelectorAll('[data-latex-ext="composer"]')].every(
    (b) => b.textContent === "Encoding enabled" && b.dataset.mode === "enabled"
  ),
  [...document.querySelectorAll('[data-latex-ext="composer"]')].map((b) => b.textContent)
);
assert(
  "encode toggle persists {encode:true,decode:true}",
  window.localStorage.getItem(STORAGE_KEY) === '{"encode":true,"decode":true}',
  window.localStorage.getItem(STORAGE_KEY)
);
assert("encode toggle does not touch the editor text", readEd() === "Hola µ⌐Œσ", readEd());

cbtn.click();
assert("encode button click toggles settings.encode back to false", C.settings.encode === false, C.settings.encode);
assert(
  "encode button label returns to 'Encoding disabled'",
  cbtn.textContent === "Encoding disabled" && cbtn.dataset.mode === "disabled",
  { text: cbtn.textContent, mode: cbtn.dataset.mode }
);
assert(
  "persisted settings only contain encode and decode keys",
  (() => {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Object.keys(parsed).sort().join(",") === "decode,encode";
  })(),
  window.localStorage.getItem(STORAGE_KEY)
);

dbtn.click();
await wait(10);
assert("decode button click toggles settings.decode to false", C.settings.decode === false, C.settings.decode);
assert(
  "decode button label flips to 'Decoding disabled'",
  dbtn.textContent === "Decoding disabled" && dbtn.dataset.mode === "disabled",
  { text: dbtn.textContent, mode: dbtn.dataset.mode }
);
assert(
  "decode toggle persists {encode:false,decode:false}",
  window.localStorage.getItem(STORAGE_KEY) === '{"encode":false,"decode":false}',
  window.localStorage.getItem(STORAGE_KEY)
);
assert("decode toggle dispatches settings-changed too", settingsEvents === 3, settingsEvents);
dbtn.click();
await wait(10);
assert("decode button click toggles settings.decode back to true", C.settings.decode === true, C.settings.decode);
assert(
  "encode and decode toggles are independent",
  C.settings.encode === false && C.settings.decode === true,
  C.settings
);

const encodeBeforeHotkey = C.settings.encode;
ed.dispatchEvent(key("L", { ctrlKey: true, shiftKey: true }));
assert(
  "ctrl+shift+L toggles encoding while a composer editor exists",
  C.settings.encode === !encodeBeforeHotkey && cbtn.dataset.mode === "enabled",
  { before: encodeBeforeHotkey, after: C.settings.encode, mode: cbtn.dataset.mode }
);
ed.dispatchEvent(key("L", { ctrlKey: true, metaKey: true }));
assert(
  "ctrl+meta+L without shift does not toggle encoding",
  C.settings.encode === !encodeBeforeHotkey,
  C.settings.encode
);
setEncode(false);
assert("hotkey section ends with encoding disabled", C.settings.encode === false, C.settings.encode);

/* ================================================================== *
 * 5. No live translation: typing / paste / IME / undo never mutate text
 * ================================================================== */
setEncode(true);
assert("no-live-translation setup has encoding enabled", C.settings.encode === true, C.settings.encode);

ed.textContent = "";
typeStr(ed, "Hola ñβε w :sob:");
const typedLiteral = "Hola ñβε w :sob:";
assert(
  "typing while encoding is enabled leaves the DOM text byte-for-byte identical",
  readEd() === typedLiteral,
  { got: readEd(), want: typedLiteral }
);

const undoEv = new window.Event("beforeinput", { bubbles: true, cancelable: true });
undoEv.inputType = "historyUndo";
ed.dispatchEvent(undoEv);
ed.textContent = typedLiteral;
fireInput(ed);
assert(
  "history undo is not intercepted and text is untouched",
  !undoEv.defaultPrevented && readEd() === typedLiteral,
  { prevented: undoEv.defaultPrevented, text: readEd() }
);

const redoEv = new window.Event("beforeinput", { bubbles: true, cancelable: true });
redoEv.inputType = "historyRedo";
ed.dispatchEvent(redoEv);
assert(
  "history redo is not intercepted and text is untouched",
  !redoEv.defaultPrevented && readEd() === typedLiteral,
  { prevented: redoEv.defaultPrevented, text: readEd() }
);

const delEv = new window.Event("beforeinput", { bubbles: true, cancelable: true });
delEv.inputType = "deleteContentBackward";
ed.dispatchEvent(delEv);
ed.textContent = "Hola ñ";
fireInput(ed);
assert(
  "deleting backwards is not translated",
  !delEv.defaultPrevented && readEd() === "Hola ñ",
  { prevented: delEv.defaultPrevented, text: readEd() }
);

const compEv = new window.Event("beforeinput", { bubbles: true, cancelable: true });
compEv.inputType = "insertCompositionText";
compEv.isComposing = true;
compEv.data = "ñ";
ed.dispatchEvent(compEv);
assert(
  "IME composition input is not intercepted or rewritten",
  !compEv.defaultPrevented && compEv.data === "ñ",
  { prevented: compEv.defaultPrevented, data: compEv.data }
);
ed.dispatchEvent(new window.Event("compositionend", { bubbles: true }));
assert("IME compositionend does not translate the text", readEd() === "Hola ñ", readEd());

const pasteStore = firePaste(ed, "mundo");
assert(
  "paste clipboard data is left untouched while encoding is enabled",
  pasteStore["text/plain"] === "mundo",
  pasteStore["text/plain"]
);

setEncode(false);
ed.textContent = "";
typeStr(ed, "Hola mundo");
assert(
  "typing while encoding is disabled leaves the DOM text byte-for-byte identical",
  readEd() === "Hola mundo",
  readEd()
);
const pasteStore2 = firePaste(ed, "adios");
assert(
  "paste clipboard data is left untouched while encoding is disabled",
  pasteStore2["text/plain"] === "adios",
  pasteStore2["text/plain"]
);
ed.textContent = "";
fireInput(ed);
assert(
  "clearing the editor produces no ghost text",
  readEd() === "" && strayRootText(ed).length === 0,
  { text: readEd(), strays: strayRootText(ed) }
);

/* ================================================================== *
 * 6. Encoding happens at send time only
 * ================================================================== */
const sendChannel = addComposerChannel(
  '<form class="formSend">' +
    '<div data-slate-editor="true" role="textbox" contenteditable="true" class="sendEditor"></div>' +
    '<div class="buttons__send"><button type="submit" aria-label="Send message">S</button></div>' +
  "</form>"
);
const enviarChannel = addComposerChannel(
  '<div data-slate-editor="true" role="textbox" contenteditable="true" class="sendEditor2"></div>' +
  '<div class="buttons__send2"><button type="button" aria-label="Enviar mensaje">E</button></div>'
);
await wait(30);
const sendEd = sendChannel.querySelector(".sendEditor");
const sendEd2 = enviarChannel.querySelector(".sendEditor2");
const submitBtn = sendChannel.querySelector('button[type="submit"]');
const enviarBtn = enviarChannel.querySelector('[aria-label="Enviar mensaje"]');
assert("send channel composer gets its own panel", !!sendChannel.querySelector('[data-latex-ext="panel"]'), null);

setEncode(true);
const statsBeforeEnter = C.stats.messages;
sendEd.textContent = "Hola mundo";
fireInput(sendEd);
sendEd.dispatchEvent(key("Enter"));
assert(
  "Enter encodes the whole editor content at send time",
  sendEd.textContent === C.encodeToLatex("Hola mundo"),
  { got: sendEd.textContent, want: C.encodeToLatex("Hola mundo") }
);
assert(
  "encoding on send bumps the messages stat",
  C.stats.messages === statsBeforeEnter + 1,
  { before: statsBeforeEnter, after: C.stats.messages }
);

const statsBeforeNoop = C.stats.messages;
sendEd2.textContent = "µ⌐Œσ";
fireInput(sendEd2);
sendEd2.dispatchEvent(key("Enter"));
assert(
  "send-time encoding is a no-op for already-latex text",
  sendEd2.textContent === "µ⌐Œσ",
  sendEd2.textContent
);
assert(
  "no-op encoding does not bump the messages stat",
  C.stats.messages === statsBeforeNoop,
  { before: statsBeforeNoop, after: C.stats.messages }
);

const statsBeforeClick = C.stats.messages;
sendEd.textContent = "otra linea";
fireInput(sendEd);
submitBtn.dispatchEvent(mouse("mousedown"));
assert(
  "mousedown on the send button encodes the editor content",
  sendEd.textContent === C.encodeToLatex("otra linea"),
  { got: sendEd.textContent, want: C.encodeToLatex("otra linea") }
);
assert(
  "send-button mousedown bumps the messages stat",
  C.stats.messages === statsBeforeClick + 1,
  { before: statsBeforeClick, after: C.stats.messages }
);

sendEd2.textContent = "tercera";
fireInput(sendEd2);
enviarBtn.dispatchEvent(mouse("mousedown"));
assert(
  "send button matched via the 'enviar' aria-label also encodes",
  sendEd2.textContent === C.encodeToLatex("tercera"),
  { got: sendEd2.textContent, want: C.encodeToLatex("tercera") }
);

setEncode(false);
sendEd.textContent = "sin codificar";
fireInput(sendEd);
sendEd.dispatchEvent(key("Enter"));
assert(
  "Enter does not touch the editor when encoding is disabled",
  sendEd.textContent === "sin codificar",
  sendEd.textContent
);
const statsBeforeDisabled = C.stats.messages;
sendEd.textContent = "otra vez";
fireInput(sendEd);
submitBtn.dispatchEvent(mouse("mousedown"));
assert(
  "send-button mousedown does not touch the editor when encoding is disabled",
  sendEd.textContent === "otra vez",
  sendEd.textContent
);
assert(
  "disabled encoding never bumps the messages stat on send",
  C.stats.messages === statsBeforeDisabled,
  { before: statsBeforeDisabled, after: C.stats.messages }
);

setEncode(true);
searchEditor.textContent = "buscar hola";
fireInput(searchEditor);
searchEditor.dispatchEvent(key("Enter"));
searchEditor.closest("form").querySelector('button[type="submit"]').dispatchEvent(mouse("mousedown"));
assert(
  "search editor is never encoded, even with encoding enabled",
  searchEditor.textContent === "buscar hola",
  searchEditor.textContent
);
modalEditor.textContent = "guardar mundo";
fireInput(modalEditor);
modalEditor.dispatchEvent(key("Enter"));
modalEditor.closest(".modalForm__m").querySelector('button[type="button"]').dispatchEvent(mouse("mousedown"));
assert(
  "modal editor is never encoded, even with encoding enabled",
  modalEditor.textContent === "guardar mundo",
  modalEditor.textContent
);
setEncode(false);

const emptyPanelBtn = emptyEditor
  .closest('[class*="channelTextArea"]')
  .querySelector('[data-latex-ext="composer"]');
const emptyHtmlBefore = emptyEditor.innerHTML;
emptyPanelBtn.click();
emptyPanelBtn.click();
assert(
  "toggling encoding on an empty composer never writes into the DOM",
  emptyEditor.innerHTML === emptyHtmlBefore && computeInnerText(emptyEditor) === "",
  { before: emptyHtmlBefore, after: emptyEditor.innerHTML }
);
setEncode(false);

const bomWrap = addComposerChannel('<div class="buttons__bom"><button>Emoji</button></div>');
const bomEditor = document.createElement("div");
bomEditor.setAttribute("data-slate-editor", "true");
bomEditor.setAttribute("role", "textbox");
bomEditor.setAttribute("contenteditable", "true");
bomEditor.innerHTML =
  "hola" +
  '<span data-slate-zero-width="z" data-slate-length="0">﻿</span>' +
  '<span data-slate-node="text"><span data-slate-leaf="true">' +
  '<span data-slate-zero-width="n" data-slate-length="0">﻿<br></span></span></span>' +
  "mundo";
bomWrap.insertBefore(bomEditor, bomWrap.firstChild);
await wait(30);
assert("slate/BOM composer gets a panel", !!bomWrap.querySelector('[data-latex-ext="composer"]'), null);
setEncode(true);
bomEditor.dispatchEvent(key("Enter"));
assert(
  "slate/BOM composer is encoded on send with no leftover zero-width chars",
  bomEditor.textContent === C.encodeToLatex("holamundo") &&
    !bomEditor.textContent.includes("﻿") &&
    !bomEditor.innerHTML.includes("﻿"),
  { text: bomEditor.textContent, html: bomEditor.innerHTML }
);
setEncode(false);

// Ghost/orphan regression: a send whose composer shows a slate placeholder
// must strip the stray root-level text nodes Discord leaves behind.
function ghostChannel() {
  return addComposerChannel(
    '<div class="slateBox">' +
      '<div data-slate-placeholder="true">Message Group</div>' +
      '<div data-slate-editor="true" role="textbox" contenteditable="true" class="ghostEditor">' +
        "wσwσwσwσw" +
        '<div data-slate-node="element"><span data-slate-node="text">' +
        '<span data-slate-leaf="true"><span data-slate-zero-width="n" data-slate-length="0">﻿<br></span>' +
        "</span></span></div></div>" +
      '<div class="buttons__ghost"><button type="submit" aria-label="Send message">S</button></div>' +
    "</div>"
  );
}
const ghostWrap = ghostChannel();
await wait(30);
const ghostEd = ghostWrap.querySelector(".ghostEditor");
assert(
  "ghost fixture starts with root text plus slate structure plus a visible placeholder",
  strayRootText(ghostEd).length === 1 &&
    !!ghostEd.querySelector("[data-slate-node]") &&
    !!ghostWrap.querySelector('[data-slate-placeholder="true"]'),
  { strays: strayRootText(ghostEd), html: ghostEd.innerHTML }
);
ghostEd.dispatchEvent(key("Enter"));
await wait(900);
assert(
  "ghost root text is stripped by the send-clear timers",
  strayRootText(ghostEd).length === 0 && !ghostEd.textContent.includes("wσwσ"),
  { strays: strayRootText(ghostEd), text: ghostEd.textContent }
);

/* ================================================================== *
 * 7. Incoming messages
 * ================================================================== */
const li111 = document.getElementById("chat-messages-111");
const li222 = document.getElementById("chat-messages-222");
const li333 = document.getElementById("chat-messages-333");
const li444 = document.getElementById("chat-messages-444");
const li777 = document.getElementById("chat-messages-777");
const btn111 = msgBtn(li111);
const btn222 = msgBtn(li222);
const btn333 = msgBtn(li333);
const msgPanel333 = li333.querySelector('[data-latex-ext="msg-panel"]');

assert("message panel exists", !!msgPanel333, null);
assert(
  "message panel title",
  msgPanel333.querySelector(".latex-ext-title").textContent.startsWith("LATEX v" + C.VERSION),
  msgPanel333.querySelector(".latex-ext-title").textContent
);
assert(
  "message panel is prepended into the actions container",
  li333.querySelector('[class*="buttonsInner"]').firstElementChild === msgPanel333,
  li333.querySelector('[class*="buttonsInner"]').firstElementChild?.className
);
assert("message button lives inside the message panel", btn333.parentElement === msgPanel333, null);

const orig333 = "Φ∩ εΦ╪σΦ εΦ╪⌐ Ωε⊥";
assert(
  "latex message is auto-decoded to latin on scan",
  msgText(li333) === C.decodeToLatin(orig333),
  msgText(li333)
);
assert(
  "auto-decoded message gets a (latex) badge",
  msgBadge(li333)?.textContent === "(latex)",
  msgBadge(li333)?.textContent
);
assert(
  "auto-decoded message button reads 'Latin'",
  btn333.textContent === "Latin" && btn333.dataset.mode === "latin",
  { text: btn333.textContent, mode: btn333.dataset.mode }
);
assert(
  "mixed message is auto-decoded to latin on scan",
  msgText(li111) === "lma hola",
  msgText(li111)
);
assert(
  "auto-decoded mixed message gets a (mixed) badge",
  msgBadge(li111)?.textContent === "(mixed)",
  msgBadge(li111)?.textContent
);
assert(
  "auto-decoded mixed message button reads 'Latin'",
  btn111.textContent === "Latin",
  btn111.textContent
);
assert(
  "the hover-bar action buttons are never translated",
  [...li111.querySelectorAll(".hoverBarButton")].map((b) => b.textContent).join("|") === "+|P|...",
  [...li111.querySelectorAll(".hoverBarButton")].map((b) => b.textContent).join("|")
);

const embedTitle = li222.querySelector(".embedTitle__abc123");
const embedDesc = li222.querySelector(".embedDescription__abc123");
const embedField = li222.querySelector(".embedFieldValue__abc123");
const compBtn = li222.querySelector(".button__def456 .contents__def456");
assert(
  "latin-only message is left untouched by auto-decoding",
  embedTitle.textContent === "Titulo embed" &&
    embedDesc.textContent === "Descripcion del embed" &&
    embedField.textContent === "Valor del campo" &&
    compBtn.textContent === "Aceptar cosa" &&
    !msgBadge(li222),
  {
    title: embedTitle.textContent,
    desc: embedDesc.textContent,
    field: embedField.textContent,
    comp: compBtn.textContent,
    badge: msgBadge(li222)?.textContent
  }
);
assert(
  "latin-only message button reports the detected latin mode",
  btn222.textContent === "Latin" && btn222.dataset.mode === "latin",
  { text: btn222.textContent, mode: btn222.dataset.mode }
);

const quotedContent = document.getElementById("message-content-999");
assert(
  "reply preview quote is never translated or badged",
  quotedContent.textContent === "quoted original text" &&
    !quotedContent.querySelector('[data-latex-ext="badge"]'),
  quotedContent.innerHTML
);
assert(
  "reply body itself is translated",
  msgText(li777) === "actual reply sie",
  msgText(li777)
);

assert(
  "(edited) marker is excluded from translation",
  msgText(li444) === "si estas(edited)",
  msgText(li444)
);

// Decoding "(edited)" is a no-op, so exercise the *encoding* direction to
// prove the marker really is excluded from the translated text nodes.
const editedMsg = addMessage('Φ∩ <span class="edited">(edited)</span>');
await wait(30);
msgBtn(editedMsg).click();
assert(
  "the (edited) marker is never encoded when a message is shown as latex",
  msgText(editedMsg) === C.encodeToLatex("si") + " (edited)",
  msgText(editedMsg)
);
assert(
  "badge is placed before the (edited) marker",
  msgBadge(li444) &&
    msgBadge(li444).nextElementSibling?.classList.contains("edited"),
  { badge: msgBadge(li444)?.textContent, next: msgBadge(li444)?.nextElementSibling?.className }
);

// Manual cycling back from an auto-decoded translation.
btn333.click();
assert(
  "clicking an auto-decoded message restores the original latex text",
  msgText(li333) === orig333,
  msgText(li333)
);
assert(
  "clicking an auto-decoded message removes the badge",
  !msgBadge(li333),
  msgContent(li333).innerHTML
);

// Regression: an explicit click must not be undone by the automatic decoder.
scanMessages();
await wait(30);
assert(
  "manual click is not undone by a forced rescan (manual flag honoured)",
  msgText(li333) === orig333 && !msgBadge(li333),
  { text: msgText(li333), badge: msgBadge(li333)?.textContent }
);
scanMessages();
await wait(60);
assert(
  "manual click is still not undone after further rescans",
  msgText(li333) === orig333 && !msgBadge(li333),
  { text: msgText(li333), badge: msgBadge(li333)?.textContent }
);

btn333.click();
assert(
  "clicking again re-decodes the original latex text",
  msgText(li333) === C.decodeToLatin(orig333),
  msgText(li333)
);
assert(
  "re-decoding restores the (latex) badge",
  msgBadge(li333)?.textContent === "(latex)",
  msgBadge(li333)?.textContent
);

btn111.click();
assert(
  "mixed translation clicks through to whole-message latex",
  msgText(li111) === C.encodeToLatex("lma hola") &&
    btn111.textContent === "Latex",
  { text: msgText(li111), btn: btn111.textContent }
);
assert(
  "mixed badge is kept while showing the latex translation",
  msgBadge(li111)?.textContent === "(mixed)",
  msgBadge(li111)?.textContent
);
btn111.click();
assert(
  "clicking after whole-message latex restores the original mixed text",
  msgText(li111) === "Œβσ hola" && !msgBadge(li111),
  { text: msgText(li111), badge: msgBadge(li111)?.textContent }
);
assert(
  "message button falls back to the detected mode after restore",
  btn111.textContent === "Mixed" && btn111.dataset.mode === "mixed",
  { text: btn111.textContent, mode: btn111.dataset.mode }
);

btn222.click();
assert(
  "embed description is translated on click",
  embedDesc.textContent === C.encodeToLatex("Descripcion del embed"),
  embedDesc.textContent
);
assert(
  "message component label is translated on click",
  compBtn.textContent === C.encodeToLatex("Aceptar cosa"),
  compBtn.textContent
);
assert(
  "embed translation adds a (latin) badge in the message content",
  msgBadge(li222)?.textContent === "(latin)",
  msgBadge(li222)?.textContent
);
btn222.click();
assert(
  "embed and component text are restored on the next click",
  embedDesc.textContent === "Descripcion del embed" &&
    compBtn.textContent === "Aceptar cosa" &&
    !msgBadge(li222),
  { desc: embedDesc.textContent, comp: compBtn.textContent }
);

// A message without a content selector/embed/component falls back to the
// message container as its translatable root.
const fbMsg = document.createElement("li");
fbMsg.id = "chat-messages-t" + msgSeq++;
fbMsg.innerHTML =
  '<div class="messageContent_fallback">Φ∩εΦ╪σΦ fallback</div>' +
  '<div class="buttonContainer_c19a55"><div class="buttons__5126c" role="group" aria-label="Message Actions">' +
  '<div class="buttonsInner__5126c popover_f84418"><div class="hoverBarButton">P</div></div>' +
  "</div></div>";
document.querySelector("ul").appendChild(fbMsg);
await wait(30);
const fbBody = fbMsg.querySelector(".messageContent_fallback");
assert(
  "a message without a content selector is translated through its fallback root",
  !!msgBtn(fbMsg) && extFreeText(fbBody) === "siestas fallback",
  { text: extFreeText(fbBody), btn: !!msgBtn(fbMsg) }
);
assert(
  "the fallback translation never touches the action buttons",
  fbMsg.querySelector(".hoverBarButton").textContent === "P",
  fbMsg.querySelector(".hoverBarButton").textContent
);

// Robustness: Discord may re-render the same characters as a different set of
// text nodes. Clicking must still work and a second click must return.
const segMsg = addMessage("Φ∩ εΦ╪σΦ");
await wait(30);
const segBtn = msgBtn(segMsg);
const segOriginal = "Φ∩ εΦ╪σΦ";
const segTranslated = C.decodeToLatin(segOriginal);
assert(
  "segmentation fixture is auto-decoded",
  msgText(segMsg) === segTranslated,
  msgText(segMsg)
);
msgContent(segMsg).querySelector(".markup").innerHTML = segTranslated
  .split("")
  .map((c) => "<i>" + c + "</i>")
  .join("");
scanMessages();
await wait(20);
assert(
  "re-segmented markup still reads as the same translated text",
  msgText(segMsg) === segTranslated,
  msgText(segMsg)
);
segBtn.click();
assert(
  "click after re-segmentation restores the original text (no silent no-op)",
  msgText(segMsg) === segOriginal,
  msgText(segMsg)
);
segBtn.click();
assert(
  "second click after re-segmentation returns to the previous state",
  msgText(segMsg) === segTranslated,
  msgText(segMsg)
);
assert(
  "second click after re-segmentation restores the badge",
  msgBadge(segMsg)?.textContent === "(latex)",
  msgBadge(segMsg)?.textContent
);

// Peek: hold the button to show the original.
const peekMsg = addMessage("Hola mundo");
await wait(30);
const peekBtn = msgBtn(peekMsg);
peekBtn.click();
const peekShown = C.encodeToLatex("Hola mundo");
assert(
  "peek fixture is translated",
  msgText(peekMsg) === peekShown,
  msgText(peekMsg)
);
peekBtn.dispatchEvent(pointer("pointerdown"));
assert(
  "pointerdown shows the original while the button is held",
  msgText(peekMsg) === "Hola mundo" &&
    !msgBadge(peekMsg),
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
await wait(20);
peekBtn.dispatchEvent(pointer("pointerup"));
await wait(10);
assert(
  "pointerup after a short hold restores the translation and the badge",
  msgText(peekMsg) === peekShown &&
    msgBadge(peekMsg)?.textContent === "(latin)",
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
await wait(260);
peekBtn.dispatchEvent(pointer("pointerdown"));
await wait(260);
peekBtn.dispatchEvent(pointer("pointerup"));
await wait(10);
assert(
  "pointerup after a long hold restores the translation and the badge",
  msgText(peekMsg) === peekShown &&
    msgBadge(peekMsg)?.textContent === "(latin)",
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
peekBtn.dispatchEvent(mouse("click"));
assert(
  "click right after a long hold is suppressed",
  msgText(peekMsg) === peekShown &&
    msgBadge(peekMsg)?.textContent === "(latin)",
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
// A second long hold that ends in pointerleave also arms the suppression, but
// the flag must be cleared again by the next pointerdown so that a later click
// is not swallowed.
await wait(260);
peekBtn.dispatchEvent(pointer("pointerdown"));
await wait(260);
peekBtn.dispatchEvent(pointer("pointerleave"));
await wait(10);
assert(
  "pointerleave after a long hold restores the translation and the badge",
  msgText(peekMsg) === peekShown &&
    msgBadge(peekMsg)?.textContent === "(latin)",
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
peekBtn.dispatchEvent(pointer("pointerdown"));
peekBtn.dispatchEvent(pointer("pointerup"));
peekBtn.dispatchEvent(mouse("click"));
assert(
  "a later click after a pointerleave is not suppressed by the old hold",
  msgText(peekMsg) !== peekShown && !msgBadge(peekMsg),
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);

// Decode toggling restores and re-applies every translation.
await setDecode(false);
assert(
  "turning decoding off restores translated messages to their originals",
  msgText(li333) === orig333 &&
    msgText(peekMsg) === "Hola mundo",
  {
    l333: msgText(li333),
    peek: msgText(peekMsg)
  }
);
assert(
  "turning decoding off removes every badge",
  document.querySelectorAll('[data-latex-ext="badge"]').length === 0,
  document.querySelectorAll('[data-latex-ext="badge"]').length
);
assert(
  "decode button reflects the disabled state",
  dbtn.textContent === "Decoding disabled" && dbtn.dataset.mode === "disabled",
  { text: dbtn.textContent, mode: dbtn.dataset.mode }
);
await setDecode(true);
assert(
  "turning decoding back on re-decodes non-manual messages",
  msgText(li333) === C.decodeToLatin(orig333) &&
    msgBadge(li333)?.textContent === "(latex)",
  { text: msgText(li333), badge: msgBadge(li333)?.textContent }
);
assert(
  "turning decoding back on does not re-decode a manually overridden message",
  msgText(peekMsg) === "Hola mundo" && !msgBadge(peekMsg),
  { text: msgText(peekMsg), badge: msgBadge(peekMsg)?.textContent }
);
assert(
  "decode button reflects the enabled state",
  dbtn.textContent === "Decoding enabled" && dbtn.dataset.mode === "enabled",
  { text: dbtn.textContent, mode: dbtn.dataset.mode }
);

/* ================================================================== *
 * 8. Structural expectations preserved from the previous suite
 * ================================================================== */
assert(
  "no panel is injected into the search editor",
  !searchEditor.closest('[class*="searchBar"]').querySelector('[data-latex-ext="panel"]'),
  searchEditor.closest('[class*="searchBar"]').innerHTML.slice(0, 120)
);
assert(
  "no panel is injected into the modal editor",
  !modalEditor.closest('[class*="modalForm"]').querySelector('[data-latex-ext="panel"]'),
  modalEditor.closest('[class*="modalForm"]').innerHTML.slice(0, 120)
);
assert(
  "search editor has no latex-ext panel ancestor",
  !searchEditor.closest('[data-latex-ext="panel"]'),
  null
);

const panelNodeBefore = composerPanel;
const panelParentBefore = composerPanel.parentElement;
scanComposer();
scanMessages();
await wait(20);
assert(
  "panel is not moved or recreated on rescan",
  panelNodeBefore.parentElement === panelParentBefore && panelNodeBefore.isConnected,
  {
    parentSame: panelNodeBefore.parentElement === panelParentBefore,
    connected: panelNodeBefore.isConnected
  }
);

const styleBefore = document.getElementById("latex-ext-styles");
styleBefore.remove();
scanComposer();
assert(
  "stylesheet is re-injected after removal",
  !!document.getElementById("latex-ext-styles"),
  null
);

assert(
  "stats are shown in the panel title",
  C.stats.messages > 0 &&
    composerPanel.querySelector(".latex-ext-title").textContent.includes("·"),
  { stats: C.stats.messages, title: composerPanel.querySelector(".latex-ext-title").textContent }
);

// ctrl+shift+L is a no-op while no composer editor exists in the DOM.
const editorSelector = '[data-slate-editor="true"], [role="textbox"][contenteditable="true"]';
const editorsBefore = document.querySelectorAll(editorSelector).length;
const scopes = [...document.querySelectorAll('[class*="channelTextArea"]')];
const detached = document.createDocumentFragment();
scopes.forEach((s) => detached.appendChild(s));
const encodeBeforeNoEditor = C.settings.encode;
window.dispatchEvent(key("L", { ctrlKey: true, shiftKey: true }));
assert(
  "ctrl+shift+L is ignored when no composer editor exists",
  C.settings.encode === encodeBeforeNoEditor &&
    editorsBefore > 0 &&
    document.querySelectorAll(editorSelector).length > 0,
  {
    before: encodeBeforeNoEditor,
    after: C.settings.encode,
    editorsBefore,
    editorsNow: document.querySelectorAll(editorSelector).length
  }
);
while (detached.firstChild) document.body.appendChild(detached.firstChild);
assert(
  "re-attached composer scopes get their panels back",
  !!document.querySelector(".channelTextArea__abc [data-latex-ext='panel']"),
  null
);
await wait(20);

console.log(JSON.stringify(results, null, 2));
const fails = Object.entries(results).filter(([, v]) => String(v).startsWith("FAIL"));
process.exit(fails.length ? 1 : 0);
