"use strict";

// A tiny DOM stand-in so bracket.js (the UI layer) can be unit tested in Node.
//
// It is deliberately not a browser: it implements only the handful of APIs the
// engine touches, and it seeds its element table from the real index.html, so a
// lookup for an element the markup doesn't define returns null exactly as it
// would in a browser. That makes the markup/engine contract part of the test.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "bracket.js"), "utf-8");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

const TAG_RE = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;

function readAttr(attrs, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : null;
}

function readDataAttrs(attrs) {
  const out = {};
  const re = /\bdata-([a-zA-Z][\w-]*)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrs))) {
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = m[2];
  }
  return out;
}

// Matches how a browser serializes text set via textContent.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class FakeElement {
  constructor(tag, doc) {
    this.tagName = String(tag || "div").toUpperCase();
    this.ownerDocument = doc;
    this.id = "";
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.disabled = false;
    this.checked = false;
    this.scrollTop = 0;
    this.value = "";
    this.parentElement = null;
    this._classes = new Set();
    this._text = "";
    this._html = null;
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get classList() {
    const classes = this._classes;
    return {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    };
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = value == null ? "" : String(value);
    this._html = null;
    this.children = [];
  }

  get innerHTML() {
    return this._html === null ? escapeHtml(this._text) : this._html;
  }

  set innerHTML(value) {
    this._html = String(value == null ? "" : value);
    this._text = "";
    this.children = parseFragment(this._html, this.ownerDocument);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  after(node) {
    const parent = this.parentElement;
    if (!parent) return;
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }

  remove() {}

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  focus() {}

  select() {}

  closest() {
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const wanted = selector.replace(/^\./, "");
    const byClass = selector.startsWith(".");
    const found = [];
    const walk = (el) => {
      for (const child of el.children) {
        const hit = byClass ? child._classes.has(wanted) : child.tagName === wanted.toUpperCase();
        if (hit) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  // Fires both addEventListener handlers and on<type> properties, which the
  // engine uses interchangeably.
  dispatch(type, event = {}) {
    const detail = { type, target: this, stopPropagation() {}, preventDefault() {}, ...event };
    for (const handler of this.listeners.get(type) || []) handler(detail);
    const inline = this[`on${type}`];
    if (typeof inline === "function") inline(detail);
    return detail;
  }
}

// Shallow parse: every tag in the fragment becomes a flat child element
// carrying its class and data-* attributes. Enough for the class-based lookups
// the engine does after assigning innerHTML.
function parseFragment(html, doc) {
  const els = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    if (m[1] === "/" || m[0].startsWith("</")) continue;
    const el = new FakeElement(m[1], doc);
    const cls = readAttr(m[2], "class");
    if (cls) el.className = cls;
    Object.assign(el.dataset, readDataAttrs(m[2]));
    els.push(el);
  }
  return els;
}

class FakeDocument {
  constructor() {
    this.byId = new Map();
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  getElementById(id) {
    return this.byId.get(id) || null;
  }

  // The engine only uses this to find the theme root, which the test page has
  // no equivalent of.
  querySelector() {
    return null;
  }
}

// Element ids (and their starting classes, notably `hidden`) come from the
// shipped markup so visibility assertions reflect the real initial state.
function createDocumentFromMarkup() {
  const doc = new FakeDocument();
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(INDEX_HTML))) {
    const id = readAttr(m[2], "id");
    if (!id) continue;
    const el = new FakeElement(m[1], doc);
    el.id = id;
    const cls = readAttr(m[2], "class");
    if (cls) el.className = cls;
    const closing = INDEX_HTML.indexOf(`</${m[1]}>`, TAG_RE.lastIndex);
    const inner = closing === -1 ? "" : INDEX_HTML.slice(TAG_RE.lastIndex, closing);
    if (inner && !inner.includes("<")) el.textContent = inner.trim();
    doc.byId.set(id, el);
  }
  return doc;
}

function createStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()].sort(),
    raw: map,
  };
}

// Ids the engine expects the markup to provide.
function engineElementIds() {
  const ids = new Set();
  const re = /getElementById\("([^"]+)"\)/g;
  let m;
  while ((m = re.exec(UI_SOURCE))) ids.add(m[1]);
  return [...ids].sort();
}

function markupElementIds() {
  const doc = createDocumentFromMarkup();
  return [...doc.byId.keys()].sort();
}

// Loads bracket.js against the fake DOM and returns handles for driving it.
function loadBracketUi(options = {}) {
  const document = createDocumentFromMarkup();
  // Passing a storage object through instead of a seed lets two loads share one
  // origin, which is how saved progress is compared across sets.
  const storage =
    options.storage && typeof options.storage.getItem === "function"
      ? options.storage
      : createStorage(options.storage);
  const win = {
    BRACKET: options.config || {},
    ITEMS: options.items,
    ART: options.art,
    BracketCore: require("../bracket-core.js"),
    localStorage: storage,
    confirm: options.confirm || (() => true),
    location: { href: "" },
  };
  const navigator = { clipboard: { writeText: async () => {} } };

  const run = new Function("window", "document", "navigator", "setTimeout", UI_SOURCE);
  run(win, document, navigator, setTimeout);

  const el = (id) => document.getElementById(id);
  return {
    window: win,
    document,
    storage,
    el,
    text: (id) => el(id).textContent,
    html: (id) => el(id).innerHTML,
    isHidden: (id) => el(id).classList.contains("hidden"),
    click: (target) => (typeof target === "string" ? el(target) : target).dispatch("click"),
    datasetCards: () => el("dataset-list").querySelectorAll(".dataset-card"),
    // The picker renders each set as one <button>, so splitting on the tag
    // gives per-card HTML to assert against.
    datasetCardHtml: () =>
      el("dataset-list")
        .innerHTML.split("<button")
        .slice(1),
  };
}

module.exports = {
  loadBracketUi,
  createStorage,
  engineElementIds,
  markupElementIds,
};
