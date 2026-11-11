const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A small DOM fixture exercises the real motion module without a browser or dependencies.
function fixture({ reduced = false } = {}) {
  const preferenceListeners = [];
  const preference = {
    matches: reduced,
    addEventListener(name, callback) { if (name === 'change') preferenceListeners.push(callback); },
  };
  const allAnimations = [];
  const state = { clones: 0 };
  let document;

  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.style = { display: '' };
      this.dataset = {};
      this.attributes = new Map();
      this.childNodes = [];
      this.parentElement = null;
      this.hidden = false;
      this.inert = false;
      this.isConnected = true;
      this.className = '';
      this.listeners = new Map();
      this.classList = {
        contains: value => this.className.split(/\s+/).includes(value),
      };
    }
    get children() { return this.childNodes.filter(node => node instanceof Element); }
    get firstChild() { return this.childNodes[0] || null; }
    get cells() { return this.children.filter(node => /^(TD|TH)$/.test(node.tagName)); }
    get nextElementSibling() {
      const siblings = this.parentElement?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    }
    appendChild(node) {
      if (node.parentElement) {
        const siblings = node.parentElement.childNodes;
        siblings.splice(siblings.indexOf(node), 1);
      }
      node.parentElement = this;
      node.isConnected = this.isConnected;
      this.childNodes.push(node);
      return node;
    }
    remove() {
      if (this.parentElement) {
        const siblings = this.parentElement.childNodes;
        siblings.splice(siblings.indexOf(this), 1);
      }
      this.parentElement = null;
      this.isConnected = false;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(node) {
      for (let cursor = node; cursor; cursor = cursor.parentElement) if (cursor === this) return true;
      return false;
    }
    closest(selector) {
      for (let cursor = this; cursor; cursor = cursor.parentElement) {
        if (selector.startsWith('.') && cursor.classList.contains(selector.slice(1))) return cursor;
      }
      return null;
    }
    getClientRects() {
      for (let cursor = this; cursor; cursor = cursor.parentElement) {
        if (cursor.hidden || cursor.style?.display === 'none' || cursor.isConnected === false) return [];
      }
      return [{ width: 200, height: 40 }];
    }
    getBoundingClientRect() {
      return typeof this.bounds === 'function' ? this.bounds() : { top: 20, left: 10, width: 200, height: 40 };
    }
    querySelectorAll(selector) {
      if (this.queryOverride) return this.queryOverride(selector);
      const descendants = [];
      const visit = element => element.children.forEach(child => { descendants.push(child); visit(child); });
      visit(this);
      return selector === '[id]' ? descendants.filter(node => node.attributes.has('id')) : descendants;
    }
    cloneNode(deep) {
      state.clones++;
      const copy = new Element(this.tagName);
      copy.style = { ...this.style };
      copy.className = this.className;
      copy.attributes = new Map(this.attributes);
      if (deep) this.children.forEach(child => copy.appendChild(child.cloneNode(true)));
      return copy;
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    click() { this.listeners.get('click')?.({ target: this }); }
    focus() { document.activeElement = this; }
    animate(keyframes, options) {
      let resolve, reject;
      const animation = {
        element: this, keyframes, options, settled: false, cancelled: false,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish() { if (!this.settled) { this.settled = true; resolve(); } },
        cancel() {
          this.cancelled = true;
          if (!this.settled) { this.settled = true; reject(new Error('Animation cancelled')); }
        },
      };
      allAnimations.push(animation);
      return animation;
    }
  }

  document = {
    body: new Element('body'), activeElement: null,
    createElement: tag => new Element(tag), addEventListener() {},
  };
  document.activeElement = document.body;
  const context = vm.createContext({
    window: { matchMedia: () => preference, innerHeight: 800 },
    document, setTimeout, clearTimeout,
    getComputedStyle: element => ({ display: element.hidden ? 'none' : element.style.display || (element.tagName === 'TR' ? 'table-row' : 'block') }),
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../js/motion.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(`${source}\nglobalThis.api = { animateElement, revealElement, isDisclosureOpen, setDisclosure, transitionViews };`, context);
  return {
    ...context.api, Element, document, allAnimations, state,
    setReduced(value) { preference.matches = value; preferenceListeners.forEach(callback => callback()); },
    finishAll() { allAnimations.forEach(animation => animation.finish()); },
  };
}

async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

test('rapid open, close and reopen leaves the final disclosure visible and operable', async () => {
  const f = fixture();
  const detail = new f.Element();
  const trigger = new f.Element('button');
  detail.style.display = 'none';
  const first = f.setDisclosure(detail, true, { trigger });
  assert.equal(f.isDisclosureOpen(detail), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(detail.inert, false);
  const closing = f.setDisclosure(detail, false, { trigger });
  assert.equal(f.isDisclosureOpen(detail), false);
  assert.equal(detail.inert, true);
  const reopened = f.setDisclosure(detail, true, { trigger });
  assert.equal(f.isDisclosureOpen(detail), true);
  f.finishAll();
  await Promise.all([first, closing, reopened]);
  assert.equal(detail.hidden, false);
  assert.notEqual(detail.style.display, 'none');
  assert.equal(detail.inert, false);
  assert.equal(detail.getAttribute('aria-hidden'), 'false');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
});

test('table disclosure wraps existing cell content without replacing nodes or listeners', async () => {
  const f = fixture();
  const row = new f.Element('tr');
  const cell = row.appendChild(new f.Element('td'));
  const button = cell.appendChild(new f.Element('button'));
  const text = cell.appendChild({ textContent: 'Existing content', parentElement: null });
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  row.style.display = 'none';
  const opening = f.setDisclosure(row, true);
  f.finishAll();
  await opening;
  assert.equal(cell.children.length, 1);
  const wrapper = cell.children[0];
  assert.equal(wrapper.childNodes[0], button);
  assert.equal(wrapper.childNodes[1], text);
  assert.equal(wrapper.classList.contains('motion-disclosure-content'), true);
  button.click();
  assert.equal(clicks, 1);
  const closing = f.setDisclosure(row, false);
  f.finishAll();
  await closing;
  const reopening = f.setDisclosure(row, true);
  f.finishAll();
  await reopening;
  assert.equal(cell.children[0], wrapper);
  assert.equal(wrapper.children[0], button);
});

test('an old cancelled animation cannot cancel its replacement', async () => {
  const f = fixture();
  const element = new f.Element();
  const first = f.revealElement(element);
  const replacement = f.revealElement(element);
  await settle();
  assert.equal(f.allAnimations[0].cancelled, true);
  assert.equal(f.allAnimations[1].cancelled, false);
  f.allAnimations[1].finish();
  assert.equal(await first, false);
  assert.equal(await replacement, true);
});

test('reduced motion starts and closes disclosures immediately without animation', async () => {
  const f = fixture({ reduced: true });
  const detail = new f.Element();
  const trigger = new f.Element('button');
  detail.style.display = 'none';
  const opening = f.setDisclosure(detail, true, { trigger });
  assert.equal(detail.style.display, '');
  assert.equal(detail.hidden, false);
  assert.equal(detail.inert, false);
  await opening;
  const closing = f.setDisclosure(detail, false, { trigger });
  assert.equal(detail.style.display, 'none');
  assert.equal(detail.hidden, true);
  assert.equal(detail.inert, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  await closing;
  assert.equal(f.allAnimations.length, 0);
});

test('changing reduced motion during a close cancels motion and settles the intended state', async () => {
  const f = fixture();
  const detail = new f.Element();
  const trigger = new f.Element('button');
  const opening = f.setDisclosure(detail, true, { trigger });
  await opening;
  const closing = f.setDisclosure(detail, false, { trigger });
  assert.equal(detail.inert, true);
  f.setReduced(true);
  await closing;
  assert.equal(detail.hidden, true);
  assert.equal(detail.style.display, 'none');
  assert.equal(detail.getAttribute('aria-hidden'), 'true');
  assert.equal(f.allAnimations.every(animation => animation.cancelled), true);
});

test('closing a focused disclosure returns focus before its content becomes inert', async () => {
  const f = fixture({ reduced: true });
  const detail = new f.Element();
  const input = detail.appendChild(new f.Element('input'));
  const trigger = new f.Element('button');
  input.focus();
  await f.setDisclosure(detail, false, { trigger });
  assert.equal(f.document.activeElement, trigger);
  assert.equal(detail.inert, true);
});

test('large view switches immediately without cloning hundreds of descendants', async () => {
  const f = fixture();
  const parent = f.document.body.appendChild(new f.Element());
  const outgoing = parent.appendChild(new f.Element());
  const incoming = parent.appendChild(new f.Element());
  outgoing.queryOverride = () => Array.from({ length: 401 }, () => ({}));
  incoming.style.display = 'none';
  incoming.hidden = true;
  incoming.inert = true;
  const transition = f.transitionViews(outgoing, incoming);
  assert.equal(outgoing.style.display, 'none');
  assert.equal(outgoing.inert, true);
  assert.equal(incoming.style.display, '');
  assert.equal(incoming.hidden, false);
  assert.equal(incoming.inert, false);
  assert.equal(f.state.clones, 0);
  f.finishAll();
  await transition;
});

test('small view exit ghosts are inert, contain no duplicate IDs and are removed', async () => {
  const f = fixture();
  const parent = f.document.body.appendChild(new f.Element());
  const outgoing = parent.appendChild(new f.Element());
  outgoing.setAttribute('id', 'outgoing-view');
  outgoing.appendChild(new f.Element('button')).setAttribute('id', 'real-control');
  const incoming = parent.appendChild(new f.Element());
  incoming.style.display = 'none';
  const transition = f.transitionViews(outgoing, incoming);
  const ghost = f.document.body.children.find(child => child.className === 'motion-view-exit');
  assert.ok(ghost);
  assert.equal(ghost.inert, true);
  assert.equal(ghost.getAttribute('aria-hidden'), 'true');
  assert.equal(ghost.querySelectorAll('[id]').length, 0);
  assert.equal(outgoing.children[0].getAttribute('id'), 'real-control');
  f.finishAll();
  await transition;
  await settle();
  assert.equal(f.document.body.children.includes(ghost), false);
});

test('revealing a disclosure smoothly offsets following siblings into their new positions', async () => {
  const f = fixture();
  const parent = f.document.body.appendChild(new f.Element());
  const detail = parent.appendChild(new f.Element());
  const following = parent.appendChild(new f.Element());
  detail.style.display = 'none';
  following.bounds = () => ({ top: detail.style.display === 'none' ? 20 : 120, left: 0, width: 200, height: 30 });
  const opening = f.setDisclosure(detail, true);
  const reposition = f.allAnimations.find(animation => animation.element === following);
  assert.ok(reposition);
  assert.equal(reposition.keyframes[0].transform, 'translateY(-100px)');
  f.finishAll();
  await opening;
});
