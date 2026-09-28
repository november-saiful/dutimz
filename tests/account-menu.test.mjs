import assert from 'node:assert/strict';
import test from 'node:test';
import { bindAccountPopup, positionAccountPopup } from '../src/scripts/account-menu.mjs';

function makeElement(rect = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const styles = {};
  return {
    hidden: true,
    style: styles,
    dataset: {},
    contains: (node) => node === this,
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    dispatch(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event); },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    focus() { this.focused = true; },
    getBoundingClientRect() { return { width: 320, height: 280, ...rect }; },
  };
}

function makeEnvironment() {
  const docListeners = new Map();
  const winListeners = new Map();
  const doc = {
    addEventListener(type, listener) { docListeners.set(type, listener); },
    removeEventListener(type) { docListeners.delete(type); },
    dispatch(type, event = {}) { docListeners.get(type)?.(event); },
  };
  const win = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener(type, listener) { winListeners.set(type, listener); },
    removeEventListener(type) { winListeners.delete(type); },
  };
  return { doc, win };
}

test('account popup stays within the viewport and opens above a low trigger', () => {
  const panel = makeElement({ width: 320, height: 280 });
  const trigger = makeElement({ x: 290, y: 780, top: 780, right: 370, bottom: 824 });
  positionAccountPopup(panel, trigger, { innerWidth: 390, innerHeight: 844 });

  assert.equal(panel.style.left, '50px');
  assert.equal(panel.dataset.placement, 'top');
  assert.ok(Number.parseFloat(panel.style.bottom) >= 0);
  assert.ok(Number.parseFloat(panel.style.maxHeight) <= 764);
});

test('account popup opens, closes on outside click, and returns focus on Escape', () => {
  const panel = makeElement({ width: 320, height: 280 });
  const button = makeElement({ x: 240, y: 20, top: 20, right: 360, bottom: 64 });
  const outside = {};
  const { doc, win } = makeEnvironment();
  bindAccountPopup({ button, panel, doc, win });

  button.dispatch('click');
  assert.equal(panel.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  doc.dispatch('click', { target: outside });
  assert.equal(panel.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.dispatch('click');
  let prevented = false;
  doc.dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(panel.hidden, true);
  assert.equal(button.focused, true);
});
