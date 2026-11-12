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
  style.dataset.dkNavigationFoldStyle = '';
  // The host workspace header already provides row padding. Add it only to the
  // standalone navigation heading so both chevrons and labels share one grid.
  // Keep both headings visually light; the workspace hit area fills only the
  // space before the native toolbar, without resizing or covering its controls.
  style.textContent = `
[data-dk-navigation-fold-hidden]{display:none!important}
button[data-dk-fold-toggle]{display:flex;align-items:center;gap:var(--dsh-sidebar-label-gap,6px);flex-shrink:0;box-sizing:border-box;width:100%;min-height:36px;margin:2px 0 4px;padding:0 var(--dsh-sidebar-row-padding,12px);border:0;border-radius:var(--dsw-radius-md,7px);background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,currentColor));font:inherit;font-size:12px;font-weight:400;line-height:20px;text-align:left;cursor:pointer;-webkit-app-region:no-drag}
@media(hover:hover){button[data-dk-fold-toggle]:hover{color:var(--dsw-alias-label-secondary,currentColor)}}
button[data-dk-fold-toggle]:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:-2px}
button[data-dk-fold-toggle] svg{width:14px;height:14px;flex-shrink:0;transition:transform 120ms ease}
button[data-dk-fold-toggle][aria-expanded=false] svg{transform:rotate(-90deg)}
/* The first transparent menu row already has internal leading. Keep 8px
   after New Session, but do not stack a grid spacer and margins below the
   heading. Preserve the other rc.2 rows and scope to our adjacent scrollport. */
button[data-dk-navigation-fold-toggle]:has(+ div > [data-sidebar-scrollport]){margin-top:8px;margin-bottom:0}
button[data-dk-navigation-fold-toggle] + div:has(> [data-sidebar-scrollport]){margin-top:0}
button[data-dk-navigation-fold-toggle] + div > [data-sidebar-scrollport]{grid-template-rows:0px max-content 2px max-content}
button[data-dk-workspace-fold-toggle]{flex:1 1 0;width:0;max-width:none;min-width:0;margin:0;padding:0}
button[data-dk-fold-toggle] span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
[data-sidebar-collapsed=true] button[data-dk-fold-toggle] span{display:none}
[data-sidebar-collapsed=true] button[data-dk-fold-toggle]{width:auto;margin-inline:0;padding-inline:0;justify-content:center}
@media(prefers-reduced-motion:reduce){button[data-dk-fold-toggle] svg{transition:none}}
`;
  document.head.append(style);

  // Both groups use the same lifecycle, focus and persistence rules. New writes
  // use the dk- keys; the pre-rename dsh- keys remain readable as a fallback.
  function createFold(kind, storageKey, legacyStorageKey) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dkFoldToggle = '';
    button.setAttribute(`data-dk-${kind}-fold-toggle`, '');
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
    try {
      closed = (window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey)) === 'true';
    } catch { /* Memory still works when storage is unavailable. */ }
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
        binding.content.removeAttribute('data-dk-navigation-fold-hidden');
        binding.title?.removeAttribute('data-dk-navigation-fold-hidden');
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
      content.toggleAttribute('data-dk-navigation-fold-hidden', closed);
      title?.setAttribute('data-dk-navigation-fold-hidden', '');
      button.toggleAttribute('data-dk-navigation-fold-hidden', searching);
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
          while (document.getElementById(`dk-${kind}-fold-group-${index}`)) index++;
          ownedId = `dk-${kind}-fold-group-${index}`;
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
  const navigationFold = createFold('navigation',
    'dk-navigation-fold:collapsed:v1', 'dsh-navigation-fold:collapsed:v1');
  const workspaceFold = createFold('workspace',
    'dk-navigation-fold:workspaces-collapsed:v1', 'dsh-navigation-fold:workspaces-collapsed:v1');
  let navigation = null;
  function findNavigation() {
    // DSH 0.2.2-rc.2 moved the navigation into a grid scroll area below the
    // logo row, so the toggle and NAV no longer share a direct parent. Match
    // the sidebar root instead: one NAV whose following region owns the
    // official workspace slot, and insert before the root child holding NAV.
    const candidates = new Map();
    for (const toggle of document.querySelectorAll('button[data-sidebar-toggle]')) {
      let container = toggle.parentElement;
      while (container && container !== document.body) {
        const navs = [...container.querySelectorAll('nav[aria-label]')].filter(nav => {
          const region = nav.nextElementSibling;
          return region?.tagName === 'DIV' &&
            region.querySelector('[data-slot="sidebar.workspaces"]');
        });
        if (navs.length === 1) {
          const nav = navs[0];
          const anchor = [...container.children].find(child => child === nav || child.contains(nav));
          // Never insert above a wrapper that also owns the toggle: that would
          // detach the control from the sidebar body instead of placing it
          // beside NAV. The official rc.1/rc.2 layouts keep them separate.
          if (anchor && !anchor.contains(toggle)) candidates.set(nav, { nav, anchor, root: container });
          break;
        }
        container = container.parentElement;
      }
    }
    return candidates.size === 1 ? [...candidates.values()][0] : null;
  }
  function findWorkspace(region) {
    // DSH 0.2.2-rc.1/rc.2 SlotOutlet wraps the browser in a display:contents
    // anchor: region > [data-slot="sidebar.workspaces"] > browser > header + list.
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
    const children = [...header.children].filter(child => !child.hasAttribute('data-dk-workspace-fold-toggle'));
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
    navigationFold.sync(navigation
      ? { content: navigation.nav, anchor: navigation.anchor, label }
      : null);
    workspaceFold.sync(navigation ? findWorkspace(navigation.nav.nextElementSibling) : null);
  }
  let disposed = false;
  let queued = false;
  const observer = new window.MutationObserver(records => {
    // Ignore streaming chat updates outside the sidebar; coalesce sidebar changes.
    const sidebar = navigation?.root;
    if (sidebar?.isConnected && !records.some(record =>
      record.type === 'attributes' || sidebar.contains(record.target) ||
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node === sidebar || node.contains(sidebar) ||
          node.matches('[data-sidebar-toggle]') || node.querySelector('[data-sidebar-toggle]')))
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
