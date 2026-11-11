// Movimiento compartido. No modifica datos ni retrasa los controles de edición.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const animations = new WeakMap();
const running = new Set();
const disclosures = new WeakMap();
const easing = 'cubic-bezier(.23, 1, .32, 1)';

preference.addEventListener?.('change', () => {
  if (preference.matches) running.forEach(animation => animation.cancel());
});

export function motionAllowed(element) {
  return !!element && element.isConnected !== false && !preference.matches && typeof element.animate === 'function';
}

export async function animateElement(element, keyframes, options = {}) {
  if (!element) return false;
  animations.get(element)?.cancel();
  if (!motionAllowed(element)) return false;
  let animation;
  try {
    animation = element.animate(keyframes, { duration: 220, easing, ...options });
    animations.set(element, animation);
    running.add(animation);
    await animation.finished;
    return true;
  } catch {
    return false;
  } finally {
    if (animation) {
      running.delete(animation);
      if (animations.get(element) === animation) animations.delete(element);
      animation.cancel();
    }
  }
}

export function revealElement(element, { axis = 'y', distance = 8, duration = 220 } = {}) {
  const offset = axis === 'x' ? `translateX(${distance}px)` : `translateY(${distance}px)`;
  return animateElement(element, [
    { opacity: 0, transform: offset },
    { opacity: 1, transform: 'translate(0, 0)' },
  ], { duration });
}

export function animateContent(element, { distance = 6, duration = 200 } = {}) {
  return revealElement(element, { distance, duration });
}

export function isDisclosureOpen(element) {
  if (!element) return false;
  if (element.dataset.motionOpen != null) return element.dataset.motionOpen === 'true';
  return !element.hidden && element.style.display !== 'none' && getComputedStyle(element).display !== 'none';
}

function visible(element) {
  return element?.isConnected !== false && !element?.hidden && !!element?.getClientRects?.().length;
}

function followingPositions(element) {
  const anchor = element.classList.contains('nav-children') ? element.closest('.nav-group') : element;
  const positions = [];
  for (let sibling = anchor?.nextElementSibling; sibling && positions.length < 16; sibling = sibling.nextElementSibling) {
    if (visible(sibling)) positions.push([sibling, sibling.getBoundingClientRect().top]);
  }
  return positions;
}

function moveFollowing(positions, duration) {
  positions.forEach(([element, before]) => {
    if (!visible(element)) return;
    const delta = before - element.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    animateElement(element, [
      { transform: `translateY(${delta}px)` },
      { transform: 'translateY(0)' },
    ], { duration });
  });
}

// Animar el contenido de cada celda conserva la geometría y semántica de la tabla.
function disclosureContents(element) {
  if (element.tagName !== 'TR') return [element];
  return [...element.cells].map(cell => {
    let content = [...cell.children].find(child => child.classList.contains('motion-disclosure-content'));
    if (!content) {
      content = document.createElement('div');
      content.className = 'motion-disclosure-content';
      while (cell.firstChild) content.appendChild(cell.firstChild);
      cell.appendChild(content);
    }
    return content;
  });
}

export function setDisclosure(element, open, { trigger = null, display = '', animate = true } = {}) {
  if (!element) return Promise.resolve(false);
  open = !!open;
  const previous = disclosures.get(element);
  const wasOpen = isDisclosureOpen(element);
  const initialized = element.dataset.motionOpen != null;
  element.dataset.motionOpen = String(open);
  trigger?.setAttribute('aria-expanded', String(open));
  if (open === wasOpen && previous?.open === open) return previous.promise;
  const state = { open, promise: null };
  disclosures.set(element, state);
  const contents = disclosureContents(element);
  contents.forEach(content => animations.get(content)?.cancel());
  const canAnimate = animate && motionAllowed(element) && (initialized || open !== wasOpen);
  const focusWasInside = element.contains(document.activeElement);
  if (!open && focusWasInside) trigger?.focus({ preventScroll: true });
  element.inert = !open;
  element.setAttribute('aria-hidden', String(!open));

  const finish = () => {
    if (disclosures.get(element) !== state) return open;
    element.style.display = open ? display : 'none';
    element.hidden = !open;
    return open;
  };
  state.promise = (async () => {
    if (open) {
      const positions = canAnimate ? followingPositions(element) : [];
      element.hidden = false;
      element.style.display = display;
      // El display explícito permite cerrar un grupo sin que la clase collapsed
      // interrumpa antes de tiempo la animación de sus opciones.
      if (getComputedStyle(element).display === 'none') element.style.display = element.tagName === 'TR' ? 'table-row' : 'block';
      if (canAnimate) {
        moveFollowing(positions, 230);
        await Promise.all(contents.map(content => revealElement(content, { distance: -8, duration: 230 })));
      }
      return finish();
    }
    if (canAnimate && visible(element)) {
      await Promise.all(contents.map(content => animateElement(content, [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-6px)' },
      ], { duration: 120 })));
    }
    if (disclosures.get(element) !== state) return open;
    const positions = canAnimate ? followingPositions(element) : [];
    finish();
    if (canAnimate) moveFollowing(positions, 160);
    return open;
  })();
  return state.promise;
}

export function toggleDisclosure(element, options) {
  return setDisclosure(element, !isDisclosureOpen(element), options);
}

// El cambio de vista es síncrono para que los gráficos midan su ancho real.
// El cierre anterior persiste como una copia visual sin controles ni eventos.
export function transitionViews(outgoing, incoming, { display = '' } = {}) {
  if (!incoming) return Promise.resolve(false);
  const changing = outgoing && outgoing !== incoming;
  const transferFocus = changing && outgoing.contains(document.activeElement);
  if (changing && visible(outgoing) && motionAllowed(outgoing) && outgoing.querySelectorAll('*').length < 400) {
    const bounds = outgoing.getBoundingClientRect();
    const parent = outgoing.parentElement;
    if (parent && bounds.width && bounds.height) {
      const ghost = document.createElement('div');
      ghost.className = 'motion-view-exit';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      const copy = outgoing.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
      copy.style.display = '';
      ghost.appendChild(copy);
      Object.assign(ghost.style, { position: 'fixed', top: `${bounds.top}px`, left: `${bounds.left}px`, width: `${bounds.width}px`, maxHeight: `${Math.min(bounds.height, window.innerHeight)}px` });
      document.body.appendChild(ghost);
      animateElement(ghost, [{ opacity: .75, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 110 }).finally(() => ghost.remove());
    }
  }
  if (changing) {
    outgoing.style.display = 'none';
    outgoing.inert = true;
    outgoing.setAttribute('aria-hidden', 'true');
  }
  incoming.hidden = false;
  incoming.inert = false;
  incoming.style.display = display;
  incoming.removeAttribute('aria-hidden');
  if (transferFocus) {
    const target = incoming.querySelector('h1, h2, h3, .ptitle') || incoming;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  return revealElement(incoming, { distance: 10, duration: 230 });
}

let initialized = false;
export function initInteractionMotion() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button, .login-perfil, .subtab, .cot-bloque-tab, .prov-grupo-item');
    if (!control || control.disabled || !visible(control)) return;
    // El efecto se reproduce también con Enter y Espacio en botones nativos.
    animateElement(control, [
      { opacity: .65, transform: 'scale(.975)' },
      { opacity: 1, transform: 'scale(1)' },
    ], { duration: 210 });
  });

  let filterObserver = null;
  let filterTimeout = null;
  const watchResults = control => {
    const filters = control.closest('.filters, [data-motion-filter]');
    const scope = filters?.closest('.sec, .modal');
    if (!scope || preference.matches || typeof MutationObserver !== 'function') return;
    filterObserver?.disconnect();
    clearTimeout(filterTimeout);
    const refreshed = new WeakSet();
    filterObserver = new MutationObserver(records => {
      const containers = new Set();
      records.forEach(record => {
        const result = record.target.closest?.('.tw, .cards, .charts-grid, .gantt-w, .prov-grupos-lista, [data-motion-results]');
        if (result && scope.contains(result) && visible(result) && !result.querySelector('.loading, .spin') && !refreshed.has(result)) containers.add(result);
      });
      containers.forEach(result => {
        refreshed.add(result);
        animateContent(result, { distance: 5, duration: 210 });
      });
    });
    filterObserver.observe(scope, { childList: true, subtree: true });
    filterTimeout = setTimeout(() => filterObserver?.disconnect(), 1600);
  };
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button');
    if (control?.closest('.filters')) watchResults(control);
  }, true);
  document.addEventListener('change', event => {
    const control = event.target;
    if (!control.matches?.('select, input[type="checkbox"], input[type="radio"], input[type="date"], input[type="month"], input[type="week"]')) return;
    animateElement(control, [{ opacity: .55 }, { opacity: 1 }], { duration: 190 });
    watchResults(control);
  }, true);
}
