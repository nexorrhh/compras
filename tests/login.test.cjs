const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function settle() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// This fixture runs the real login module with fake users and a controllable clock.
function fixture({ users, save, reduced = false } = {}) {
  const profiles = users || [
    { id: 'profile-a', nombre: 'Prueba, Ana', pin: '1234' },
    { id: 'profile-b', nombre: 'Ejemplo, Bruno', pin: '5678' },
  ];
  const elements = new Map();
  const timers = new Map();
  const animations = [];
  const updates = [];
  let time = 0;
  let nextTimer = 0;
  let document;

  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.style = { display: '', setProperty(name, value) { this[name] = value; } };
      this.dataset = {};
      this.attributes = new Map();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.hidden = false;
      this.inert = false;
      this.disabled = false;
      this.isConnected = true;
      this.value = '';
      this.listeners = new Map();
      this.ownText = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
        toggle: (name, force) => {
          const present = force ?? !this.classList.contains(name);
          this.classList[present ? 'add' : 'remove'](name);
          return present;
        },
      };
    }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.ownText = String(value); this.children = []; }
    set innerHTML(value) { this.ownText = ''; this.children = []; parseHTML(String(value), this); }
    get innerHTML() { return this.textContent; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.ownText = ''; this.append(...children); }
    setAttribute(name, value) {
      value = String(value);
      this.attributes.set(name, value);
      if (name === 'id') { this.id = value; elements.set(value, this); }
      if (name === 'class') this.className = value;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      if (name === 'hidden') this.hidden = true;
      if (name === 'style') value.split(';').forEach(property => {
        const colon = property.indexOf(':');
        if (colon !== -1) this.style[property.slice(0, colon).trim()] = property.slice(colon + 1).trim();
      });
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.startsWith('#')) return this.id === part.slice(1);
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part === '[data-id]') return this.dataset.id !== undefined;
        return this.tagName.toLowerCase() === part;
      });
    }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) if (element.matches(selector)) return element;
      return null;
    }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(callback);
    }
    dispatch(name, properties = {}) {
      const event = { target: this, preventDefault() {}, ...properties };
      const results = this.listeners.get(name)?.map(listener => listener(event)) || [];
      results.push(this[`on${name}`]?.(event));
      return Promise.all(results);
    }
    click() {
      if (this.disabled) return Promise.resolve();
      for (let parent = this; parent; parent = parent.parentElement) if (parent.inert) return Promise.resolve();
      return this.dispatch('click');
    }
    focus() { document.activeElement = this; }
    getClientRects() { return this.hidden || this.style.display === 'none' ? [] : [{ width: 200, height: 50 }]; }
    getBoundingClientRect() { return { width: 580, height: 460, top: 20, left: 20 }; }
  }

  function parseHTML(html, root) {
    const stack = [root];
    for (const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
      const value = token[0];
      if (value.startsWith('<!--')) continue;
      if (value.startsWith('</')) { stack.pop(); continue; }
      if (!value.startsWith('<')) { stack.at(-1).ownText += value; continue; }
      const tag = value.match(/^<([\w-]+)/)[1];
      const child = new Element(tag);
      for (const attribute of value.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attribute[1], attribute[2]);
      if (/\shidden(?:\s|>)/.test(value)) child.hidden = true;
      stack.at(-1).appendChild(child);
      if (!/^(input|img|br|hr|meta|link)$/i.test(tag) && !value.endsWith('/>')) stack.push(child);
    }
  }

  const body = new Element('body');
  document = {
    body,
    activeElement: body,
    getElementById: id => elements.get(id) || null,
    createElement: tag => new Element(tag),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector),
  };
  const markup = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  parseHTML(markup.slice(markup.indexOf('<div id="app-login"'), markup.indexOf('<!-- APP -->')), body);
  const app = body.appendChild(new Element());
  app.setAttribute('id', 'app');
  app.style.display = 'none';
  const main = app.appendChild(new Element('main'));
  main.setAttribute('id', 'main-content');

  const SB = {
    from(table) {
      assert.equal(table, 'compras_usuarios');
      let update;
      let profileId;
      const query = {
        select() { return query; },
        eq(name, value) { if (name === 'id') profileId = value; return query; },
        order() { return Promise.resolve({ data: profiles, error: null }); },
        update(value) { update = value; return query; },
        single() {
          updates.push({ id: profileId, pin: update.pin });
          if (save) return save(update, profileId, updates.length);
          return Promise.resolve({ data: { ...profiles.find(user => user.id === profileId), ...update }, error: null });
        },
      };
      return query;
    },
  };
  const motion = (element, keyframes, options) => {
    animations.push({ element, keyframes, options });
    return Promise.resolve(true);
  };
  const context = vm.createContext({
    document,
    window: { matchMedia: () => ({ matches: reduced, addEventListener() {} }) },
    setTimeout(callback, delay = 0) { const id = ++nextTimer; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    performance: { now: () => time },
    animateElement: motion,
    revealElement: motion,
    motionAllowed: element => !!element && !reduced,
    console,
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../js/login.js'), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(`${source}\nglobalThis.api = { mostrarLogin, getUsuarioActual };`, context);
  return {
    ...context.api,
    SB, document, updates, timers, animations,
    get: id => elements.get(id),
    profiles: () => elements.get('login-perfiles').querySelectorAll('button'),
    select: index => elements.get('login-perfiles').querySelectorAll('button')[index].click(),
    async advance(milliseconds) {
      time += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.due <= time) { timers.delete(id); timer.callback(); }
      }
      await settle();
    },
    async finishTimers() {
      for (let count = 0; timers.size && count < 30; count++) {
        time = Math.max(time, ...[...timers.values()].map(timer => timer.due));
        for (const [id, timer] of timers) { timers.delete(id); timer.callback(); }
        await settle();
      }
      assert.equal(timers.size, 0, 'login timers must settle');
    },
  };
}

test('invalid and incorrect PINs keep the login open and never initialize the app', async () => {
  const f = fixture();
  let entries = 0;
  await f.mostrarLogin(f.SB, () => { entries++; });
  await f.select(0);
  f.get('login-pin').value = '12';
  await f.get('login-entrar').click();
  assert.match(f.get('login-error').textContent, /4 dígitos/);
  f.get('login-pin').value = '9999';
  await f.get('login-entrar').click();
  assert.match(f.get('login-error').textContent, /incorrecto/i);
  assert.equal(f.get('login-pin').value, '');
  assert.equal(f.document.activeElement, f.get('login-pin'));
  assert.equal(f.get('login-pin').getAttribute('aria-invalid'), 'true');
  assert.equal(f.get('app-login').style.display, 'flex');
  assert.equal(f.getUsuarioActual(), null);
  assert.equal(entries, 0);
});

test('welcome is visible before initialization and waits for both loading and its minimum display time', async () => {
  const f = fixture();
  const loading = deferred();
  let entries = 0;
  await f.mostrarLogin(f.SB, () => {
    entries++;
    assert.equal(f.get('login-welcome').hidden, false);
    assert.match(f.get('login-welcome-title').textContent, /Ana/);
    assert.equal(f.get('app').inert, true);
    assert.equal(f.get('app').getAttribute('aria-hidden'), 'true');
    f.get('app').style.display = 'block';
    return loading.promise;
  });
  await f.select(0);
  f.get('login-pin').value = '1234';
  const entering = f.get('login-entrar').click();
  await settle();
  assert.equal(entries, 1);
  assert.equal(f.get('login-pin').disabled, true);
  assert.equal(f.get('login-entrar').disabled, true);
  assert.ok(f.profiles().every(profile => profile.disabled));
  assert.equal(f.get('app').inert, true);
  assert.equal(f.get('app').getAttribute('aria-hidden'), 'true');
  await f.advance(1149);
  assert.equal(f.get('app-login').style.display, 'flex');
  loading.resolve();
  await settle();
  assert.equal(f.get('app-login').style.display, 'flex');
  await f.advance(1);
  await entering;
  assert.equal(f.get('app-login').style.display, 'none');
  assert.equal(f.get('app').inert, false);
  assert.equal(f.get('app').getAttribute('aria-hidden'), null);
  assert.equal(f.getUsuarioActual().id, 'profile-a');
  assert.equal(f.document.activeElement, f.get('main-content'));
});

test('repeated Enter and clicks initialize a successful session only once', async () => {
  const f = fixture();
  let entries = 0;
  await f.mostrarLogin(f.SB, () => { entries++; });
  await f.select(0);
  f.get('login-pin').value = '1234';
  const first = f.get('login-pin').dispatch('keydown', { key: 'Enter' });
  const second = f.get('login-pin').dispatch('keydown', { key: 'Enter' });
  const third = f.get('login-entrar').click();
  await settle();
  await f.finishTimers();
  await Promise.all([first, second, third]);
  assert.equal(entries, 1);
  await f.get('login-pin').dispatch('keydown', { key: 'Enter' });
  assert.equal(entries, 1);
});

test('a slow initialization keeps the welcome visible after the animation minimum has elapsed', async () => {
  const f = fixture();
  const loading = deferred();
  await f.mostrarLogin(f.SB, () => loading.promise);
  await f.select(0);
  f.get('login-pin').value = '1234';
  const entering = f.get('login-entrar').click();
  await settle();
  await f.advance(4000);
  assert.equal(f.get('login-welcome').hidden, false);
  assert.equal(f.get('app-login').style.display, 'flex');
  assert.equal(f.get('login-entrar').disabled, true);
  assert.equal(f.get('app').inert, true);
  assert.equal(f.get('app').getAttribute('aria-hidden'), 'true');
  loading.resolve();
  await settle();
  await entering;
  assert.equal(f.get('app-login').style.display, 'none');
  assert.equal(f.get('app').inert, false);
  assert.equal(f.get('app').getAttribute('aria-hidden'), null);
});

test('reopening login clears the previous welcome, selection and session', async () => {
  const f = fixture();
  await f.mostrarLogin(f.SB, () => {});
  await f.select(0);
  f.get('login-pin').value = '1234';
  const firstEntry = f.get('login-entrar').click();
  await settle();
  await f.finishTimers();
  await firstEntry;
  assert.equal(f.getUsuarioActual().id, 'profile-a');
  f.get('app').style.display = 'none';
  await f.mostrarLogin(f.SB, () => {});
  assert.equal(f.getUsuarioActual(), null);
  assert.equal(f.get('app-login').style.display, 'flex');
  assert.equal(f.get('login-welcome').hidden, true);
  assert.equal(f.get('login-pin-wrap').style.display, 'none');
  assert.equal(f.get('login-pin').value, '');
  assert.ok(f.profiles().every(profile => !profile.disabled && !profile.classList.contains('sel')));
  await f.select(1);
  f.get('login-pin').value = '5678';
  const secondEntry = f.get('login-entrar').click();
  await settle();
  assert.match(f.get('login-welcome-title').textContent, /Bruno/);
  await f.finishTimers();
  await secondEntry;
  assert.equal(f.getUsuarioActual().id, 'profile-b');
});

test('PIN creation requires a matching confirmation and locks the selected profile while saving', async () => {
  const saving = deferred();
  const f = fixture({
    users: [
      { id: 'new-profile', nombre: 'Prueba, Ana', pin: null },
      { id: 'other-profile', nombre: 'Ejemplo, Bruno', pin: '5678' },
    ],
    save: () => saving.promise,
  });
  let entries = 0;
  await f.mostrarLogin(f.SB, () => { entries++; });
  await f.select(0);
  f.get('login-pin').value = '1234';
  await f.get('login-entrar').click();
  assert.match(f.get('login-pin-label').textContent, /Repetí/);
  f.get('login-pin').value = '4321';
  await f.get('login-entrar').click();
  assert.match(f.get('login-error').textContent, /coincide/);
  assert.equal(f.updates.length, 0);
  assert.equal(entries, 0);
  f.get('login-pin').value = '1234';
  await f.get('login-entrar').click();
  f.get('login-pin').value = '1234';
  const entering = f.get('login-entrar').click();
  await settle();
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0].id, 'new-profile');
  assert.ok(f.profiles().every(profile => profile.disabled));
  await f.profiles()[1].dispatch('click');
  await f.get('login-pin').dispatch('keydown', { key: 'Enter' });
  assert.equal(f.updates.length, 1);
  saving.resolve({ data: { id: 'new-profile', nombre: 'Prueba, Ana', pin: '1234' }, error: null });
  await settle();
  assert.equal(entries, 1);
  assert.equal(f.getUsuarioActual().id, 'new-profile');
  await f.finishTimers();
  await entering;
});

test('a failed PIN save restores controls and allows retrying the same confirmation', async () => {
  const f = fixture({
    users: [{ id: 'new-profile', nombre: 'Prueba, Ana', pin: null }],
    save: (update, id, attempt) => Promise.resolve(attempt === 1
      ? { data: null, error: { message: 'No se pudo guardar el PIN' } }
      : { data: { id, nombre: 'Prueba, Ana', ...update }, error: null }),
  });
  let entries = 0;
  await f.mostrarLogin(f.SB, () => { entries++; });
  await f.select(0);
  f.get('login-pin').value = '1234';
  await f.get('login-entrar').click();
  f.get('login-pin').value = '1234';
  await f.get('login-entrar').click();
  assert.match(f.get('login-error').textContent, /guardar/);
  assert.equal(f.get('login-pin').disabled, false);
  assert.equal(f.get('login-entrar').disabled, false);
  assert.ok(f.profiles().every(profile => !profile.disabled));
  assert.equal(entries, 0);
  assert.equal(f.getUsuarioActual(), null);
  f.get('login-pin').value = '1234';
  const retry = f.get('login-entrar').click();
  await settle();
  await f.finishTimers();
  await retry;
  assert.equal(f.updates.length, 2);
  assert.equal(entries, 1);
  assert.equal(f.getUsuarioActual().id, 'new-profile');
});

test('initialization rejection returns to an operable login and permits another attempt', async () => {
  const f = fixture();
  let entries = 0;
  await f.mostrarLogin(f.SB, async () => {
    entries++;
    assert.equal(f.get('app').inert, true);
    assert.equal(f.get('app').getAttribute('aria-hidden'), 'true');
    f.get('app').style.display = 'block';
    if (entries === 1) throw new Error('No se pudo preparar el tablero');
  });
  await f.select(0);
  f.get('login-pin').value = '1234';
  const first = f.get('login-entrar').click();
  await settle();
  await f.finishTimers();
  await first;
  assert.equal(f.get('app-login').style.display, 'flex');
  assert.equal(f.get('app').style.display, 'none');
  assert.equal(f.get('app').inert, false);
  assert.equal(f.get('app').getAttribute('aria-hidden'), null);
  assert.equal(f.get('login-welcome').hidden, true);
  assert.equal(f.get('login-pin').disabled, false);
  assert.equal(f.get('login-entrar').disabled, false);
  assert.equal(f.getUsuarioActual(), null);
  assert.match(f.get('login-error').textContent, /preparar|iniciar|cargar/i);
  f.get('login-pin').value = '1234';
  const retry = f.get('login-entrar').click();
  await settle();
  await f.finishTimers();
  await retry;
  assert.equal(entries, 2);
  assert.equal(f.get('app-login').style.display, 'none');
  assert.equal(f.get('app').inert, false);
  assert.equal(f.get('app').getAttribute('aria-hidden'), null);
});
