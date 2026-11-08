/**
 * Add reversible, independent group toggles to the current official sidebar DOM.
 * This is a structural adapter, not an official sidebar extension contract.
 * @param {Document} document
 * @returns {() => void} Restore the original sidebar and remove the enhancement.
 */
export function installNavigationFold(document) {
  const window = document.defaultView;
  if (!window || !document.body) return () => {};
  const style = document.createElement('style');
  style.dataset.dshNavigationFoldStyle = '';
  // The host workspace header already provides row padding. Add it only to the
  // standalone navigation heading so both chevrons and labels share one grid.
  // Keep both headings visually light; the workspace hit area fills only the
  // space before the native toolbar, without resizing or covering its controls.
  style.textContent = `
[data-dsh-navigation-fold-hidden]{display:none!important}
button[data-dsh-fold-toggle]{display:flex;align-items:center;gap:var(--dsh-sidebar-label-gap,6px);flex-shrink:0;box-sizing:border-box;width:100%;min-height:36px;margin:2px 0 4px;padding:0 var(--dsh-sidebar-row-padding,12px);border:0;border-radius:var(--dsw-radius-md,7px);background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,currentColor));font:inherit;font-size:12px;font-weight:400;line-height:20px;text-align:left;cursor:pointer;-webkit-app-region:no-drag}
@media(hover:hover){button[data-dsh-fold-toggle]:hover{color:var(--dsw-alias-label-secondary,currentColor)}}
button[data-dsh-fold-toggle]:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:-2px}
button[data-dsh-fold-toggle] svg{width:14px;height:14px;flex-shrink:0;transition:transform 120ms ease}
button[data-dsh-fold-toggle][aria-expanded=false] svg{transform:rotate(-90deg)}
button[data-dsh-workspace-fold-toggle]{flex:1 1 0;width:0;max-width:none;min-width:0;margin:0;padding:0}
button[data-dsh-fold-toggle] span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
[data-sidebar-collapsed=true] button[data-dsh-fold-toggle] span{display:none}
[data-sidebar-collapsed=true] button[data-dsh-fold-toggle]{width:auto;margin-inline:0;padding-inline:0;justify-content:center}
@media(prefers-reduced-motion:reduce){button[data-dsh-fold-toggle] svg{transition:none}}
`;
  document.head.append(style);

  // Both groups use the same lifecycle, focus and persistence rules. Existing
  // navigation identities stay unchanged; workspace preference has its own key.
  function createFold(kind, storageKey) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dshFoldToggle = '';
    button.setAttribute(`data-dsh-${kind}-fold-toggle`, '');
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
    button.append(chevron, text);
    let closed = false;
    try { closed = window.localStorage.getItem(storageKey) === 'true'; } catch { /* Memory still works when storage is unavailable. */ }
    let binding = null;
    let ownedId = null;
    function persist() {
      try { window.localStorage.setItem(storageKey, String(closed)); } catch { /* Keep the current page usable if persistence is denied. */ }
    }
    function reveal(event) {
      if (!closed || button.contains(event.target)) return;
      closed = false;
      persist();
      render();
    }
    function detach() {
      if (binding) {
        binding.content.removeAttribute('data-dsh-navigation-fold-hidden');
        binding.title?.removeAttribute('data-dsh-navigation-fold-hidden');
        if (ownedId && binding.content.id === ownedId) binding.content.removeAttribute('id');
        binding.header?.removeEventListener('click', reveal, true);
        binding.header?.removeEventListener('focusin', reveal);
      }
      binding = null;
      ownedId = null;
      button.remove();
      button.removeAttribute('aria-controls');
    }
    function render() {
      if (!binding) return;
      const { content, anchor, title, search, label } = binding;
      if (button.nextElementSibling !== anchor) anchor.before(button);
      const caption = title?.textContent.trim() || label;
      if (text.textContent !== caption) text.textContent = caption;
      if (button.getAttribute('aria-label') !== caption) button.setAttribute('aria-label', caption);
      const searching = search?.getAttribute('aria-expanded') === 'true';
      if (searching && closed) { closed = false; persist(); }
      if (closed && content.contains(document.activeElement)) button.focus();
      content.toggleAttribute('data-dsh-navigation-fold-hidden', closed);
      title?.setAttribute('data-dsh-navigation-fold-hidden', '');
      button.toggleAttribute('data-dsh-navigation-fold-hidden', searching);
      const expanded = String(!closed);
      if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
      button.setAttribute('aria-controls', content.id);
    }
    function onClick() {
      closed = !closed;
      persist();
      render();
    }
    button.addEventListener('click', onClick);
    return {
      sync(next) {
        if (next?.content !== binding?.content || next?.anchor !== binding?.anchor ||
          next?.header !== binding?.header || next?.search !== binding?.search) detach();
        if (!next) return;
        if (!binding) {
          next.header?.addEventListener('click', reveal, true);
          next.header?.addEventListener('focusin', reveal);
        }
        // Captions can change while their DOM anchors and fold state stay the same.
        binding = next;
        if (!binding.content.id) {
          let index = 1;
          while (document.getElementById(`dsh-${kind}-fold-group-${index}`)) index++;
          ownedId = `dsh-${kind}-fold-group-${index}`;
          binding.content.id = ownedId;
        }
        render();
      },
      dispose() {
        button.removeEventListener('click', onClick);
        detach();
      },
    };
  }
  const navigationFold = createFold('navigation', 'dsh-navigation-fold:collapsed:v1');
  const workspaceFold = createFold('workspace', 'dsh-navigation-fold:workspaces-collapsed:v1');
  let navigation = null;
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
  function findWorkspace(region) {
    // DSH 0.2.2-rc.1 SlotOutlet wraps the browser in a display:contents anchor:
    // region > [data-slot="sidebar.workspaces"] > browser > header + list.
    // Match the official addressable anchor, never arbitrary wrapper depths.
    // Narrow rails omit the title and have a different shape: leave them alone.
    if (region.children.length !== 1) return null;
    const slot = region.firstElementChild;
    if (slot.tagName !== 'DIV' || slot.getAttribute('data-slot') !== 'sidebar.workspaces' ||
      slot.children.length !== 1) return null;
    const browser = slot.firstElementChild;
    const [header, content] = browser.children;
    if (browser.tagName !== 'DIV' || browser.children.length !== 2 ||
      header?.tagName !== 'DIV' || content?.tagName !== 'DIV') return null;
    const children = [...header.children].filter(child => !child.hasAttribute('data-dsh-workspace-fold-toggle'));
    const title = children[0];
    const inputs = header.querySelectorAll('input[type=text]');
    if (title?.tagName !== 'SPAN' || !title.textContent.trim() || inputs.length !== 1) return null;
    const searches = inputs[0].parentElement.querySelectorAll('button[aria-expanded][aria-label]');
    if (searches.length !== 1) return null;
    return { content, anchor: title, title, header, search: searches[0], label: title.textContent.trim() };
  }
  function sync() {
    navigation = findNavigation();
    // DSH's locale service mirrors its active language to <html lang>.
    // Follow that application setting, not the OS/browser language or host text.
    const label = /^zh(?:-|$)/i.test(document.documentElement.lang) ? '功能导航' : 'Navigation';
    navigationFold.sync(navigation ? { content: navigation, anchor: navigation, label } : null);
    workspaceFold.sync(navigation ? findWorkspace(navigation.nextElementSibling) : null);
  }
  let disposed = false;
  let queued = false;
  const observer = new window.MutationObserver(records => {
    // Ignore streaming chat updates outside the sidebar; coalesce sidebar changes.
    if (navigation?.isConnected && !records.some(record =>
      record.type === 'attributes' || navigation.parentElement?.contains(record.target) ||
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
  sync();
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sidebar-toggle', 'data-window-drag', 'data-slot', 'aria-label', 'aria-expanded'],
  });
  // <html> is outside body: language-only changes otherwise never reach sync().
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    workspaceFold.dispose();
    navigationFold.dispose();
    style.remove();
  };
}
