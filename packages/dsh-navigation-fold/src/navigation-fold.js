/**
 * Add a reversible group toggle to the current official sidebar DOM.
 * This is a structural adapter, not an official sidebar extension contract.
 * @param {Document} document
 * @returns {() => void} Restore the original navigation and remove the enhancement.
 */
export function installNavigationFold(document) {
  const window = document.defaultView;
  if (!window || !document.body) return () => {};
  const style = document.createElement('style');
  style.dataset.dshNavigationFoldStyle = '';
  style.textContent = `
[data-dsh-navigation-fold-hidden]{display:none!important}
button[data-dsh-navigation-fold-toggle]{display:flex;align-items:center;gap:7px;flex-shrink:0;box-sizing:border-box;width:calc(100% - 16px);min-height:30px;margin:2px 8px 4px;padding:5px 8px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:inherit;font-size:12px;text-align:left;cursor:pointer;-webkit-app-region:no-drag}
button[data-dsh-navigation-fold-toggle]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
button[data-dsh-navigation-fold-toggle]:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:1px}
button[data-dsh-navigation-fold-toggle] svg{width:14px;height:14px;flex-shrink:0;transition:transform 120ms ease}
button[data-dsh-navigation-fold-toggle][aria-expanded=false] svg{transform:rotate(-90deg)}
[data-sidebar-collapsed=true] button[data-dsh-navigation-fold-toggle] span{display:none}
[data-sidebar-collapsed=true] button[data-dsh-navigation-fold-toggle]{width:auto;margin-inline:0;padding-inline:0;justify-content:center}
@media(prefers-reduced-motion:reduce){button[data-dsh-navigation-fold-toggle] svg{transition:none}}
`;
  document.head.append(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dshNavigationFoldToggle = '';
  const label = '功能导航';
  button.setAttribute('aria-label', label);
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 16 16');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm4 6 4 4 4-4');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  chevron.append(path);
  const text = document.createElement('span');
  text.textContent = label;
  button.append(chevron, text);

  const storageKey = 'dsh-navigation-fold:collapsed:v1';
  let closed = false;
  try { closed = window.localStorage.getItem(storageKey) === 'true'; } catch { /* Storage may be unavailable; memory still works. */ }
  let target = null;
  let addedId = false;
  function findNavigation() {
    const candidates = new Set();
    for (const toggle of document.querySelectorAll('button[data-sidebar-toggle]')) {
      let container = toggle.parentElement;
      while (container && container !== document.body) {
        const navs = [...container.children].filter(child => child.tagName === 'NAV');
        const brand = [...container.children].some(child => child.hasAttribute('data-window-drag'));
        if (brand && navs.length === 1 && navs[0].hasAttribute('aria-label') && navs[0].nextElementSibling?.tagName === 'DIV') {
          candidates.add(navs[0]);
          break;
        }
        container = container.parentElement;
      }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
  }
  function detach() {
    if (target) {
      target.removeAttribute('data-dsh-navigation-fold-hidden');
      if (addedId) target.removeAttribute('id');
    }
    target = null;
    addedId = false;
    button.remove();
    button.removeAttribute('aria-controls');
  }
  function render() {
    if (!target) return;
    if (button.nextElementSibling !== target) target.before(button);
    if (closed && target.contains(document.activeElement)) button.focus();
    target.toggleAttribute('data-dsh-navigation-fold-hidden', closed);
    button.setAttribute('aria-expanded', String(!closed));
    button.setAttribute('aria-controls', target.id);
    button.title = `${closed ? '展开' : '收起'}${label}`;
  }
  function sync() {
    const next = findNavigation();
    if (next !== target) detach();
    if (!next) return;
    target = next;
    if (!target.id) {
      let index = 1;
      while (document.getElementById(`dsh-navigation-fold-group-${index}`)) index++;
      target.id = `dsh-navigation-fold-group-${index}`;
      addedId = true;
    }
    render();
  }
  function onClick() {
    closed = !closed;
    try { window.localStorage.setItem(storageKey, String(closed)); } catch { /* Keep the current page usable if persistence is denied. */ }
    render();
  }
  let disposed = false;
  let queued = false;
  const observer = new window.MutationObserver(records => {
    // Ignore streaming chat updates outside the sidebar; coalesce actual sidebar changes.
    if (target?.isConnected && !records.some(record =>
      record.type === 'attributes' || target.parentElement?.contains(record.target) ||
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches('[data-sidebar-toggle]') || node.querySelector('[data-sidebar-toggle]')))
    )) return;
    if (queued || disposed) return;
    queued = true;
    window.queueMicrotask(() => {
      queued = false;
      if (!disposed) sync();
    });
  });
  button.addEventListener('click', onClick);
  sync();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sidebar-toggle', 'data-window-drag', 'aria-label'],
  });
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    button.removeEventListener('click', onClick);
    detach();
    style.remove();
  };
}
