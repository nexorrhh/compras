import { animateElement, motionAllowed } from './motion.js';

const modalStates = new WeakMap();
const modalStack = [];
let keyboardBound = false;

function stateFor(overlay) {
  if (!modalStates.has(overlay)) {
    modalStates.set(overlay, { open: false, closing: false, sequence: 0, opener: null, bound: false });
  }
  return modalStates.get(overlay);
}

function visibleControl(element) {
  return element && element.isConnected !== false && !element.disabled
    && !element.closest?.('[hidden], [inert]')
    && (!element.getClientRects || element.getClientRects().length > 0);
}

function controlsFor(overlay) {
  return [...overlay.querySelectorAll('input:not([type="hidden"]), select, textarea, button, a[href], [tabindex="0"]')]
    .filter(visibleControl);
}

function topModal() {
  return [...modalStack].reverse().find(overlay => overlay.isConnected !== false && stateFor(overlay).open);
}

function focusModal(overlay) {
  const panel = overlay.querySelector('.modal') || overlay;
  const controls = controlsFor(overlay);
  const autofocus = controls.find(element => element.hasAttribute('autofocus'));
  const field = controls.find(element => element.matches('input:not([type="hidden"]), select, textarea'));
  const target = autofocus || field || controls[0] || panel;
  if (target === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
  target.focus?.({ preventScroll: true });
}

function removeFromStack(overlay) {
  const index = modalStack.indexOf(overlay);
  if (index !== -1) modalStack.splice(index, 1);
}

function restoreFocus(overlay, state) {
  const underlying = topModal();
  if (underlying) {
    (underlying.querySelector('.modal') || underlying).setAttribute('aria-modal', 'true');
    if (underlying.contains(state.opener) && visibleControl(state.opener)) state.opener.focus({ preventScroll: true });
    else focusModal(underlying);
  } else if (!overlay.contains(state.opener) && visibleControl(state.opener)) {
    state.opener.focus({ preventScroll: true });
  }
}

function bindKeyboard() {
  if (keyboardBound) return;
  keyboardBound = true;
  document.addEventListener('keydown', event => {
    const overlay = topModal();
    if (!overlay || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(overlay);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = controlsFor(overlay);
    event.preventDefault();
    if (!controls.length) { focusModal(overlay); return; }
    const current = controls.indexOf(document.activeElement);
    const next = current === -1 ? (event.shiftKey ? controls.length - 1 : 0)
      : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus({ preventScroll: true });
  });
}

function visualState(element) {
  const styles = getComputedStyle(element);
  return { opacity: styles.opacity || '1', transform: styles.transform || 'none' };
}

export function openModal(overlay) {
  if (!overlay) return;
  bindKeyboard();
  const state = stateFor(overlay);
  const panel = overlay.querySelector('.modal') || overlay;
  const wasOpen = overlay.classList.contains('open');
  const overlayStart = wasOpen ? visualState(overlay) : { opacity: 0 };
  const panelStart = wasOpen ? visualState(panel) : { opacity: 0, transform: 'translateY(12px) scale(.985)' };
  if (!wasOpen) state.opener = document.activeElement;
  state.sequence += 1;
  state.open = true;
  state.closing = false;
  overlay.inert = false;
  overlay.removeAttribute('aria-hidden');
  overlay.classList.add('open');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const title = panel.querySelector('.mtitle');
  if (title) {
    if (!title.id) title.id = `${overlay.id || 'modal'}-title`;
    panel.setAttribute('aria-labelledby', title.id);
  }
  removeFromStack(overlay);
  modalStack.forEach(other => (other.querySelector('.modal') || other).removeAttribute('aria-modal'));
  modalStack.push(overlay);
  overlay.style.zIndex = String(200 + modalStack.length * 2);
  if (!state.bound) {
    overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(overlay); });
    state.bound = true;
  }
  animateElement(overlay, [{ opacity: overlayStart.opacity }, { opacity: 1 }], { duration: 180 });
  if (panel !== overlay) {
    animateElement(panel, [panelStart, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 220 });
  }
  focusModal(overlay);
}

export function closeModal(overlay) {
  if (!overlay) return;
  const state = stateFor(overlay);
  if (state.closing) return;
  const panel = overlay.querySelector('.modal') || overlay;
  const sequence = ++state.sequence;
  state.open = false;
  state.closing = true;
  overlay.style.zIndex = '199';
  removeFromStack(overlay);
  restoreFocus(overlay, state);
  overlay.inert = true;
  overlay.setAttribute('aria-hidden', 'true');
  panel.removeAttribute('aria-modal');
  const finish = () => {
    if (state.sequence !== sequence || state.open) return;
    overlay.classList.remove('open');
    state.closing = false;
  };
  if (!overlay.classList.contains('open') || !motionAllowed(overlay)) {
    finish();
    return;
  }
  const animations = [animateElement(overlay, [
    { opacity: visualState(overlay).opacity }, { opacity: 0 },
  ], { duration: 140, easing: 'ease-out' })];
  if (panel !== overlay) {
    animations.push(animateElement(panel, [
      visualState(panel), { opacity: 0, transform: 'translateY(8px) scale(.99)' },
    ], { duration: 140, easing: 'ease-out' }));
  }
  Promise.all(animations).then(finish);
}
