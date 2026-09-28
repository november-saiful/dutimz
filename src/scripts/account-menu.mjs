export function positionAccountPopup(panel, trigger, viewport = window) {
  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const width = Math.min(panelRect.width || 320, viewport.innerWidth - margin * 2);
  const left = Math.max(margin, Math.min(triggerRect.right - width, viewport.innerWidth - width - margin));
  const below = viewport.innerHeight - triggerRect.bottom - gap;
  const above = triggerRect.top - gap;
  const placeBelow = below >= Math.min(panelRect.height, 240) || below >= above;
  const availableHeight = Math.max(120, (placeBelow ? below : above) - margin);

  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  panel.style.top = placeBelow ? `${triggerRect.bottom + gap}px` : 'auto';
  panel.style.bottom = placeBelow ? 'auto' : `${viewport.innerHeight - triggerRect.top + gap}px`;
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${availableHeight}px`;
  panel.dataset.placement = placeBelow ? 'bottom' : 'top';
}

export function bindAccountPopup({ button, panel, doc = document, win = window }) {
  if (!button || !panel) return () => {};

  const close = ({ restoreFocus = false } = {}) => {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus({ preventScroll: true });
  };

  const open = () => {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionAccountPopup(panel, button, win);
  };

  const onTriggerClick = () => {
    if (panel.hidden) open();
    else close();
  };
  const onDocumentClick = (event) => {
    if (!button.contains(event.target) && !panel.contains(event.target)) close();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      close({ restoreFocus: true });
    }
  };
  const onViewportChange = () => {
    if (!panel.hidden) positionAccountPopup(panel, button, win);
  };

  button.addEventListener('click', onTriggerClick);
  doc.addEventListener('click', onDocumentClick);
  doc.addEventListener('keydown', onKeyDown);
  win.addEventListener('resize', onViewportChange);
  win.addEventListener('scroll', onViewportChange, true);

  return () => {
    button.removeEventListener('click', onTriggerClick);
    doc.removeEventListener('click', onDocumentClick);
    doc.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('resize', onViewportChange);
    win.removeEventListener('scroll', onViewportChange, true);
  };
}
