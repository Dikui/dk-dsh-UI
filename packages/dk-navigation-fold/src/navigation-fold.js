/**
 * Switch the official sidebar between the workspace browser and the panel
 * navigation. Only one group is rendered at a time, so scrolling one group can
 * no longer push the other group's heading around. This is a structural adapter
 * for the shipped sidebar DOM, not an official sidebar extension contract.
 * @param {Document} document
 * @returns {() => void} Restore the original sidebar and remove the enhancement.
 */
export function installNavigationFold(document) {
  const window = document.defaultView;
  if (!window || !document.body) return () => {};
  // The host may re-apply a client plugin without disposing the previous run
  // (reload, re-enable, hot update), and every run would stack its own switch
  // above the same sidebar. Take over from that run instead of doubling up.
  const instanceKey = Symbol.for('dk-navigation-fold.instance');
  const previous = document[instanceKey];
  if (typeof previous === 'function') previous();
  // Also drop artifacts left by a build that could not register itself.
  for (const stale of document.querySelectorAll(
    '[data-dk-panel-switcher],[data-dk-navigation-fold-style],[data-dk-navigation-fold-toggle],[data-dk-workspace-header-spacer]',
  )) stale.remove();
  for (const stale of document.querySelectorAll('[data-dk-panel-hidden],[data-dk-navigation-fold-hidden]')) {
    stale.removeAttribute('data-dk-panel-hidden');
    stale.removeAttribute('data-dk-navigation-fold-hidden');
  }
  const style = document.createElement('style');
  style.dataset.dkNavigationFoldStyle = '';
  // The switch sits above the scrollport, so it keeps its place while the
  // selected list scrolls. Host nodes are only ever hidden, never moved: the
  // host still owns every node it renders, including their order.
  style.textContent = `
[data-dk-panel-switcher]{display:flex;gap:2px;flex-shrink:0;box-sizing:border-box;margin:8px 8px 0;padding:0 4px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18))}
[data-dk-panel-switcher] button[role=tab]{flex:1 1 0;min-width:0;min-height:30px;margin-bottom:-1px;padding:0 6px 6px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:inherit;font-size:12px;font-weight:400;line-height:20px;text-align:center;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;-webkit-app-region:no-drag}
@media(hover:hover){[data-dk-panel-switcher] button[role=tab][aria-selected=false]:hover{color:var(--dsw-alias-label-primary,currentColor)}}
[data-dk-panel-switcher] button[role=tab][aria-selected=true]{color:var(--dsw-alias-label-primary,currentColor);border-bottom-color:currentColor}
[data-dk-panel-switcher] button[role=tab]:focus-visible{outline:2px solid var(--dsw-alias-label-primary,currentColor);outline-offset:-2px}
[data-dk-panel-hidden]{display:none!important}
[data-dk-navigation-fold-hidden]{display:none!important}
/* The tab already names the group, so the shipped heading keeps its row height
   through this spacer instead of repeating the same word twice. */
[data-dk-workspace-header-spacer]{flex-grow:1;flex-shrink:1;flex-basis:0;min-width:0}
/* One panel at a time: drop the grid's top spacer and the row between panels. */
[data-dk-panel-switcher]+div>[data-sidebar-scrollport]{grid-template-rows:0px max-content 0px max-content}
[data-dk-panel-switcher]+div:has(> [data-sidebar-scrollport]){margin-top:0}
`;
  document.head.append(style);

  // Left-to-right order of the switch; the workspace list stays the default view.
  const panels = ['navigation', 'workspace'];
  const storageKey = 'dk-navigation-fold:panel:v1';
  const switcher = document.createElement('div');
  switcher.setAttribute('data-dk-panel-switcher', '');
  switcher.setAttribute('role', 'tablist');
  const tabs = new Map();
  // Ids we create for aria-controls are removed again on dispose.
  const ownedIds = new Set();
  let active = 'workspace';
  let binding = null;
  // Track the transition only: a panel that stays hidden must not fight the
  // user who deliberately switches away from an open search.
  let wasSearching = false;
  let disposed = false;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (panels.includes(stored)) active = stored;
  } catch { /* Memory still works when storage is unavailable. */ }
  function persist() {
    try { window.localStorage.setItem(storageKey, active); } catch { /* Keep the current page usable if persistence is denied. */ }
  }
  function select(panel) {
    if (!binding || active === panel) return;
    active = panel;
    persist();
    render();
  }
  function setLabel(tab, label) {
    if (tab.textContent !== label) tab.textContent = label;
  }
  for (const panel of panels) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('data-dk-panel-tab', panel);
    tab.addEventListener('click', () => select(panel));
    // Roving tabindex: one stop in the tab order, arrows move between panels.
    tab.addEventListener('keydown', event => {
      const current = panels.indexOf(active);
      const next = event.key === 'Home' ? panels[0]
        : event.key === 'End' ? panels[panels.length - 1]
        : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? panels[(current + 1) % panels.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? panels[(current - 1 + panels.length) % panels.length]
        : null;
      if (!next) return;
      event.preventDefault();
      select(next);
      tabs.get(next).focus();
    });
    tabs.set(panel, tab);
    switcher.append(tab);
  }
  function attach(next) {
    const spacer = document.createElement('span');
    spacer.setAttribute('data-dk-workspace-header-spacer', '');
    spacer.setAttribute('aria-hidden', 'true');
    binding = { ...next, spacer };
    for (const [panel, element] of [['workspace', next.workspace.browser], ['navigation', next.nav]]) {
      if (element.id) continue;
      let index = 1;
      while (document.getElementById(`dk-panel-${panel}-${index}`)) index++;
      element.id = `dk-panel-${panel}-${index}`;
      ownedIds.add(element);
    }
  }
  function detach() {
    if (binding) {
      binding.nav.removeAttribute('data-dk-panel-hidden');
      binding.workspace.browser.removeAttribute('data-dk-panel-hidden');
      binding.workspace.title?.removeAttribute('data-dk-navigation-fold-hidden');
      binding.spacer.remove();
    }
    for (const element of ownedIds) element.removeAttribute('id');
    ownedIds.clear();
    binding = null;
    wasSearching = false;
    switcher.remove();
  }
  function render() {
    if (!binding) return;
    const { anchor, nav, workspace, spacer } = binding;
    const { header, title, search } = workspace;
    if (switcher.parentElement !== anchor.parentElement || switcher.nextElementSibling !== anchor) {
      anchor.before(switcher);
    }
    if (title && (spacer.parentElement !== header || spacer.nextElementSibling !== title)) title.before(spacer);
    setLabel(tabs.get('workspace'), workspace.label);
    // DSH's locale service mirrors its active language to <html lang>.
    // Follow that application setting, not the OS/browser language or host text.
    const zh = /^zh(?:-|$)/i.test(document.documentElement.lang);
    setLabel(tabs.get('navigation'), zh ? '功能导航' : 'Navigation');
    const switcherLabel = zh ? '侧栏分组' : 'Sidebar sections';
    if (switcher.getAttribute('aria-label') !== switcherLabel) switcher.setAttribute('aria-label', switcherLabel);
    // A hidden panel cannot take focus, so follow the host when it opens search.
    const searching = search.getAttribute('aria-expanded') === 'true';
    if (searching && !wasSearching && active !== 'workspace') {
      active = 'workspace';
      persist();
    }
    wasSearching = searching;
    for (const panel of panels) {
      const tab = tabs.get(panel);
      const selected = String(active === panel);
      if (tab.getAttribute('aria-selected') !== selected) tab.setAttribute('aria-selected', selected);
      tab.tabIndex = active === panel ? 0 : -1;
      const target = panel === 'navigation' ? nav : workspace.browser;
      target.toggleAttribute('data-dk-panel-hidden', active !== panel);
      if (target.id) tab.setAttribute('aria-controls', target.id);
    }
    title?.setAttribute('data-dk-navigation-fold-hidden', '');
    spacer.toggleAttribute('data-dk-navigation-fold-hidden', searching);
  }
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
    if (!region || region.children.length !== 1) return null;
    const slot = region.firstElementChild;
    if (slot.tagName !== 'DIV' || slot.getAttribute('data-slot') !== 'sidebar.workspaces' ||
      slot.children.length !== 1) return null;
    const browser = slot.firstElementChild;
    if (browser.tagName !== 'DIV' || browser.children.length !== 2) return null;
    const [header, list] = browser.children;
    if (header.tagName !== 'DIV' || list.tagName !== 'DIV') return null;
    const children = [...header.children].filter(child => !child.hasAttribute('data-dk-workspace-header-spacer'));
    const title = children[0];
    const inputs = header.querySelectorAll('input[type=text]');
    if (title?.tagName !== 'SPAN' || !title.textContent.trim() || inputs.length !== 1) return null;
    const searches = inputs[0].parentElement.querySelectorAll('button[aria-expanded][aria-label]');
    if (searches.length !== 1) return null;
    return { browser, header, title, search: searches[0], label: title.textContent.trim() };
  }
  function sync() {
    const navigation = findNavigation();
    const workspace = navigation ? findWorkspace(navigation.nav.nextElementSibling) : null;
    // Both groups must be addressable: hiding the navigation with no workspace
    // panel to show in its place would leave an empty sidebar. The narrow rail
    // renders no titled browser, so it fails the same check and keeps its layout.
    const next = navigation && workspace
      ? { root: navigation.root, anchor: navigation.anchor, nav: navigation.nav, workspace }
      : null;
    if (binding && (!next || next.root !== binding.root || next.anchor !== binding.anchor ||
      next.nav !== binding.nav || next.workspace.browser !== binding.workspace.browser)) detach();
    if (!next) return;
    if (binding) binding.workspace = next.workspace;
    else attach(next);
    render();
  }
  let queued = false;
  const observer = new window.MutationObserver(records => {
    // Ignore streaming chat updates outside the sidebar; coalesce sidebar changes.
    const sidebar = binding?.root;
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
  // <html> is outside body: language changes otherwise never reach sync().
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    detach();
    style.remove();
    if (document[instanceKey] === dispose) delete document[instanceKey];
  };
  document[instanceKey] = dispose;
  return dispose;
}
