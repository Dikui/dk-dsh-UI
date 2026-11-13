import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Contract: reversible switching between the sidebar navigation and workspace panels.
// All tests are small/spec unless marked regression; JSDOM replaces only the browser DOM, never user data.
// Node's built-in runner has no test-label API. Test names describe observable contracts.
import { installNavigationFold } from '../src/navigation-fold.js';

// DSH 0.2.2-rc.1 ui-renderer SlotOutlet renders an addressable display:contents
// anchor around every slot; sidebar.workspaces is not the browser root itself.
function sidebarMarkup() {
  return `<div id="sidebar" style="width:260px">
    <div data-window-drag="true"><button data-sidebar-toggle="true" type="button">整个侧栏开关</button></div>
    <div data-window-drag="true" id="logo">deepseek HARNESS</div>
    <button id="new-session" type="button">新会话</button>
    <nav aria-label="功能入口" style="display:flex">
      <button type="button">插件</button><button type="button">自媒体工作台</button>
      <button type="button">歸藏设计</button><button type="button">Superagent</button>
      <button type="button">自动化任务</button><button type="button">上下文洞察</button>
      <button type="button">作品</button><div><button type="button">更多</button></div>
    </nav>
    <div id="workspaces"><div data-slot="sidebar.workspaces" style="display:contents"><div id="workspace-browser">
      <div id="workspace-header">
        <span id="workspace-label">工作区</span>
        <div><div><button id="workspace-search" aria-label="搜索会话" aria-expanded="false">搜索</button><input type="text" tabindex="-1"></div></div>
        <div><button id="workspace-view" aria-label="视图选项">视图</button><button id="workspace-add" aria-label="新增工作区">新增</button></div>
      </div>
      <div id="workspace-list"><button data-row-key="workspace:example">example-workspace</button><button data-row-key="session:example">example-session</button></div>
    </div></div></div>
    <div id="settings">设置</div>
  </div>`;
}
// DSH 0.2.2-rc.2 puts the panel NAV and workspace region inside a grid scroll
// area below the title strip; the sidebar toggle is no longer a sibling of NAV.
function sidebarMarkupRc2() {
  return `<div id="sidebar" style="width:260px">
    <div data-window-drag="true"><button data-sidebar-toggle="true" type="button">整个侧栏开关</button></div>
    <div data-window-drag="true" id="logo">deepseek HARNESS</div>
    <button id="new-session" type="button">新会话</button>
    <div id="scroll-region">
      <div id="scroll-area" data-sidebar-scrollport="">
        <nav aria-label="功能入口" style="display:flex">
          <button type="button">插件</button><button type="button">自媒体工作台</button>
          <button type="button">歸藏设计</button><button type="button">Superagent</button>
          <button type="button">自动化任务</button><button type="button">上下文洞察</button>
          <button type="button">作品</button><div><button type="button">更多</button></div>
        </nav>
        <div id="region-area">
          <div data-slot="sidebar.workspaces" style="display:contents"><div id="workspace-browser">
            <div id="workspace-header">
              <span id="workspace-label">工作区</span>
              <div><div><button id="workspace-search" aria-label="搜索会话" aria-expanded="false">搜索</button><input type="text" tabindex="-1"></div></div>
              <div><button id="workspace-view" aria-label="视图选项">视图</button><button id="workspace-add" aria-label="新增工作区">新增</button></div>
            </div>
            <div id="workspace-list"><button data-row-key="workspace:example">example-workspace</button><button data-row-key="session:example">example-session</button></div>
          </div></div>
        </div>
      </div>
    </div>
    <div id="settings">设置</div>
  </div>`;
}
function setup(html = sidebarMarkup(), prepare = () => {}) {
  // Minimal host typography from the wide sidebar; layout pixels are separately checked in Chromium.
  const hostStyles = `<style>#sidebar{font:14px/20px sans-serif;--dsh-sidebar-row-padding:12px;--dsh-sidebar-label-gap:6px;--dsw-alias-label-secondary:#bcc3ca;--dsw-alias-label-primary:#e8ecef;--dsw-alias-border-l1:#2b3036}#workspace-header{height:36px;color:var(--dsw-alias-label-secondary)}</style>`;
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head>${hostStyles}</head><body>${html}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const { document } = dom.window;
  prepare(dom.window);
  const dispose = installNavigationFold(document);
  return { dom, document, dispose };
}
function switcher(document) {
  return document.querySelector('[data-dk-panel-switcher]');
}
function tab(document, panel) {
  return document.querySelector(`[data-dk-panel-tab="${panel}"]`);
}
function panel(document, panel) {
  return panel === 'navigation' ? document.querySelector('nav') : document.getElementById('workspace-browser');
}
function shown(document, name) {
  return document.defaultView.getComputedStyle(panel(document, name)).display !== 'none';
}
function assertUnchangedOtherRegions(document) {
  for (const id of ['logo', 'new-session', 'workspaces', 'settings']) {
    const element = document.getElementById(id);
    assert.notEqual(document.defaultView.getComputedStyle(element).display, 'none', id);
  }
}
async function nextDomUpdate(window) {
  await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

test('顶部标签默认展示工作区，切换后只显示所选分组', () => {
  const { dom, document, dispose } = setup();
  try {
    const bar = switcher(document);
    assert.ok(bar);
    assert.equal(bar.getAttribute('role'), 'tablist');
    assert.equal(bar.getAttribute('aria-label'), '侧栏分组');
    assert.deepEqual([...bar.children].map(child => child.textContent), ['功能导航', '工作区']);
    assert.equal(tab(document, 'workspace').getAttribute('aria-selected'), 'true');
    assert.equal(tab(document, 'navigation').getAttribute('aria-selected'), 'false');
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(shown(document, 'navigation'), false);
    assert.equal(document.querySelectorAll('[data-dk-panel-hidden]').length, 1);
    // aria-controls must point at the panel each tab shows.
    assert.equal(tab(document, 'workspace').getAttribute('aria-controls'), 'workspace-browser');
    assert.equal(tab(document, 'navigation').getAttribute('aria-controls'), panel(document, 'navigation').id);
    assert.ok(panel(document, 'navigation').id);
    const navigationTab = tab(document, 'navigation');
    navigationTab.click();
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(shown(document, 'workspace'), false);
    assert.equal(navigationTab.getAttribute('aria-selected'), 'true');
    assert.equal(tab(document, 'workspace').getAttribute('aria-selected'), 'false');
    assert.equal(tab(document, 'navigation'), navigationTab, '复用同一个标签，不重建');
    assert.equal(document.querySelectorAll('[data-dk-panel-hidden]').length, 1);
    tab(document, 'workspace').click();
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(shown(document, 'navigation'), false);
  } finally { dispose(); dom.window.close(); }
});

// small/regression — English host sidebar still showed a Chinese plugin heading (2026-11-08).
test('英文界面标签取宿主标题与语言，其他语言回退英文', () => {
  const markup = sidebarMarkup().replace('>工作区<', '>Workspaces<');
  const english = setup(markup, window => { window.document.documentElement.lang = 'en'; });
  try {
    assert.equal(tab(english.document, 'workspace').textContent, 'Workspaces');
    assert.equal(tab(english.document, 'navigation').textContent, 'Navigation');
    assert.equal(switcher(english.document).getAttribute('aria-label'), 'Sidebar sections');
  } finally { english.dispose(); english.dom.window.close(); }
  for (const [language, expected] of [
    ['zh', '功能导航'], ['zh-CN', '功能导航'], ['zh-Hans', '功能导航'],
    ['en', 'Navigation'], ['en-US', 'Navigation'], ['ja', 'Navigation'], ['', 'Navigation'],
  ]) {
    const { dom, document, dispose } = setup(sidebarMarkup(), window => {
      window.document.documentElement.lang = language;
    });
    try {
      assert.equal(tab(document, 'navigation').textContent, expected, language);
    } finally { dispose(); dom.window.close(); }
  }
});

test('原地切换语言或宿主标题只更新文字，不重建标签也不重置选择', async () => {
  const { dom, document, dispose } = setup();
  try {
    const bar = switcher(document);
    const workspaceTab = tab(document, 'workspace');
    const navigationTab = tab(document, 'navigation');
    navigationTab.click();
    for (const [language, expected, hostTitle] of [
      ['en', 'Navigation', 'Workspaces'], ['zh-CN', '功能导航', '工作区'], ['en-US', 'Navigation', 'Sessions'],
    ]) {
      // First change only <html lang>: the signal lives outside the observed body.
      document.documentElement.lang = language;
      await nextDomUpdate(dom.window);
      assert.equal(switcher(document), bar, '复用标签栏');
      assert.equal(tab(document, 'navigation'), navigationTab, '复用标签');
      assert.equal(navigationTab.textContent, expected);
      // Host workspace text may arrive in a later render.
      document.getElementById('workspace-label').textContent = hostTitle;
      await nextDomUpdate(dom.window);
      assert.equal(workspaceTab.textContent, hostTitle);
      assert.equal(navigationTab.getAttribute('aria-selected'), 'true', '语言变化不重置选择');
      assert.equal(shown(document, 'navigation'), true);
    }
  } finally { dispose(); dom.window.close(); }
});

test('工作区标题让位给标签，工具按钮保持原位可见', () => {
  const { dom, document, dispose } = setup();
  try {
    const header = document.getElementById('workspace-header');
    const title = document.getElementById('workspace-label');
    assert.equal(dom.window.getComputedStyle(title).display, 'none', '标题不再重复显示');
    assert.equal(header.firstElementChild.hasAttribute('data-dk-workspace-header-spacer'), true);
    assert.equal(header.firstElementChild.nextElementSibling, title, '占位只补标题原来占的宽度');
    assert.equal(dom.window.getComputedStyle(header.firstElementChild).flexGrow, '1');
    for (const id of ['workspace-search', 'workspace-view', 'workspace-add']) {
      assert.notEqual(dom.window.getComputedStyle(document.getElementById(id)).display, 'none', id);
    }
    assert.equal(dom.window.getComputedStyle(header).height, '36px', '标题行高度不变，避免列表跳动');
  } finally { dispose(); dom.window.close(); }
});

function prepareRc2Spacing(window) {
  const { document } = window;
  document.getElementById('scroll-region').classList.add('host-scroll-region');
  for (const button of document.querySelectorAll('nav > button')) {
    const entry = document.createElement('div');
    entry.className = 'host-panel-entry';
    button.before(entry);
    entry.append(button);
    button.classList.add('host-panel-row');
  }
  const style = document.createElement('style');
  style.textContent = `#sidebar{display:flex;flex-direction:column;height:720px}
    #new-session{flex:none;height:38px;margin:0 4px}
    .host-scroll-region{margin-top:4px;flex:1;min-height:0;display:flex;flex-direction:column}
    [data-sidebar-scrollport]{flex:1;min-height:0;display:grid;grid-template-columns:4px minmax(0,1fr) 6px;grid-template-rows:8px max-content 2px max-content;align-content:start}
    [data-sidebar-scrollport]::before,[data-sidebar-scrollport]::after{content:'';grid-column:2;pointer-events:none}
    [data-sidebar-scrollport]::before{grid-row:1}
    [data-sidebar-scrollport]::after{grid-row:3}
    [data-sidebar-scrollport]>nav{grid-column:2;grid-row:2;flex:none;display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
    [data-sidebar-scrollport]>#region-area{grid-column:2;grid-row:4}
    .host-panel-entry{display:flex;position:relative}
    .host-panel-row{display:flex;align-items:center;box-sizing:border-box;min-height:32px;margin:0;padding:5px 9px;border:0;line-height:22px}`;
  document.head.append(style);
}

function assertRc2SwitcherSpacing(document) {
  const computed = element => document.defaultView.getComputedStyle(element);
  const bar = computed(switcher(document));
  const scrollRegion = computed(document.getElementById('scroll-region'));
  const scrollArea = computed(document.getElementById('scroll-area'));
  const nav = computed(document.querySelector('nav'));
  assert.equal(computed(document.getElementById('sidebar')).flexDirection, 'column');
  assert.equal(computed(document.getElementById('new-session')).marginBottom, '0px');
  assert.equal(bar.marginTop, '8px', '新会话到标签上边缘保留 8px');
  assert.equal(bar.marginBottom, '0px', '不再叠加标签下边距');
  assert.equal(scrollRegion.marginTop, '0px', '不再叠加滚动区上边距');
  assert.equal(scrollRegion.flexDirection, 'column');
  assert.equal(scrollArea.display, 'grid');
  assert.equal(scrollArea.gridTemplateRows,
    '0px max-content 0px max-content', '标签下方不再留 8px 空行，两组之间也不留间隔行');
  assert.equal(nav.gridRow, '2', '只收起留白，不移动导航与工作区的网格位置');
  assert.equal(nav.gap, '2px');
  assert.equal(computed(document.querySelector('nav > .host-panel-entry > button')).minHeight,
    '32px', '真实菜单包装层内的行高不变');
}

test('rc.2 标签固定在滚动区之外，滚动区不再为未选分组留行', () => {
  const { dom, document, dispose } = setup(sidebarMarkupRc2(), prepareRc2Spacing);
  try {
    const bar = switcher(document);
    assert.equal(bar.nextElementSibling, document.getElementById('scroll-region'));
    assert.equal(document.getElementById('scroll-area').contains(bar), false, '标签不进入滚动区');
    assertRc2SwitcherSpacing(document);
    tab(document, 'navigation').click();
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(shown(document, 'workspace'), false);
    assertRc2SwitcherSpacing(document);
    tab(document, 'workspace').click();
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(shown(document, 'navigation'), false);
    assertRc2SwitcherSpacing(document);
  } finally { dispose(); dom.window.close(); }
});

test('rc.1 无滚动区时标签插在导航之前，停用后恢复原有间距', () => {
  const { dom, document, dispose } = setup();
  try {
    const bar = switcher(document);
    assert.equal(bar.parentElement, document.getElementById('sidebar'));
    assert.equal(bar.nextElementSibling, document.querySelector('nav'));
    assert.notEqual(dom.window.getComputedStyle(bar).marginTop, '0px');
    dispose();
    assert.equal(switcher(document), null);
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'flex');
  } finally { dispose(); dom.window.close(); }
});

test('rc.2 宿主样式晚加载时仍只保留所选分组的内容行', () => {
  const { dom, document, dispose } = setup(sidebarMarkupRc2());
  try {
    prepareRc2Spacing(dom.window);
    assertRc2SwitcherSpacing(document);
    tab(document, 'navigation').click();
    assertRc2SwitcherSpacing(document);
    assert.equal(shown(document, 'workspace'), false);
  } finally { dispose(); dom.window.close(); }
});

test('只收起与标签相邻滚动区的空行，不影响其他滚动区', () => {
  const { dom, document, dispose } = setup(sidebarMarkupRc2(), window => {
    prepareRc2Spacing(window);
    const unrelated = window.document.createElement('div');
    unrelated.innerHTML = '<div id="unrelated-scrollport" data-sidebar-scrollport></div>';
    window.document.body.append(unrelated);
  });
  try {
    assertRc2SwitcherSpacing(document);
    assert.equal(dom.window.getComputedStyle(document.getElementById('unrelated-scrollport')).gridTemplateRows,
      '8px max-content 2px max-content');
  } finally { dispose(); dom.window.close(); }
});

test('方向键、Home、End 切换标签并保持单一 Tab 停靠点', () => {
  const { dom, document, dispose } = setup();
  try {
    const workspaceTab = tab(document, 'workspace');
    const navigationTab = tab(document, 'navigation');
    assert.equal(workspaceTab.tabIndex, 0);
    assert.equal(navigationTab.tabIndex, -1);
    const press = (element, key) => element.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
    // 导航在左、工作区在右：方向键按视觉顺序移动。
    press(workspaceTab, 'ArrowLeft');
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(document.activeElement, navigationTab, '焦点跟到新标签');
    assert.equal(navigationTab.tabIndex, 0);
    assert.equal(workspaceTab.tabIndex, -1);
    press(navigationTab, 'ArrowRight');
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(document.activeElement, workspaceTab);
    press(workspaceTab, 'Home');
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(document.activeElement, navigationTab);
    press(navigationTab, 'End');
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(document.activeElement, workspaceTab);
    press(workspaceTab, 'Tab');
    assert.equal(shown(document, 'workspace'), true, '其他按键不切换');
  } finally { dispose(); dom.window.close(); }
});

test('记住上次选择的标签；旧折叠偏好不再影响展示', () => {
  const first = setup();
  let persisted;
  try {
    tab(first.document, 'navigation').click();
    const storage = first.dom.window.localStorage;
    assert.equal(storage.length, 1, '只保存插件自己的一项偏好');
    assert.equal(storage.key(0), 'dk-navigation-fold:panel:v1');
    persisted = [storage.key(0), storage.getItem(storage.key(0))];
    assert.equal(persisted[1], 'navigation');
    first.dispose();
    assert.equal(switcher(first.document), null);
    assert.equal(shown(first.document, 'navigation'), true);
    assertUnchangedOtherRegions(first.document);
  } finally { first.dispose(); first.dom.window.close(); }
  const refreshed = setup(sidebarMarkup(), window => window.localStorage.setItem(...persisted));
  try {
    assert.equal(tab(refreshed.document, 'navigation').getAttribute('aria-selected'), 'true');
    assert.equal(shown(refreshed.document, 'navigation'), true);
    assert.equal(shown(refreshed.document, 'workspace'), false);
    assertUnchangedOtherRegions(refreshed.document);
  } finally { refreshed.dispose(); refreshed.dom.window.close(); }
  const legacy = setup(sidebarMarkup(), window => {
    window.localStorage.setItem('dk-navigation-fold:collapsed:v1', 'true');
    window.localStorage.setItem('dk-navigation-fold:workspaces-collapsed:v1', 'true');
  });
  try {
    assert.equal(tab(legacy.document, 'workspace').getAttribute('aria-selected'), 'true');
    assert.equal(shown(legacy.document, 'workspace'), true);
    assert.equal(legacy.dom.window.localStorage.getItem('dk-navigation-fold:panel:v1'), null,
      '旧折叠 key 不改变默认分组');
  } finally { legacy.dispose(); legacy.dom.window.close(); }
});

test('宿主展开工作区搜索时自动切回工作区，收起后不跳回', async () => {
  const { dom, document, dispose } = setup();
  try {
    tab(document, 'navigation').click();
    assert.equal(shown(document, 'workspace'), false);
    const search = document.getElementById('workspace-search');
    search.setAttribute('aria-expanded', 'true');
    await nextDomUpdate(dom.window);
    assert.equal(shown(document, 'workspace'), true, '搜索框所在分组必须可见');
    assert.equal(tab(document, 'workspace').getAttribute('aria-selected'), 'true');
    assert.equal(dom.window.getComputedStyle(document.getElementById('workspace-label')).display, 'none');
    assert.equal(dom.window.getComputedStyle(document.querySelector('[data-dk-workspace-header-spacer]')).display,
      'none', '搜索展开时让出整行宽度');
    search.setAttribute('aria-expanded', 'false');
    await nextDomUpdate(dom.window);
    assert.equal(shown(document, 'workspace'), true, '收起搜索不切换分组');
    assert.equal(dom.window.localStorage.getItem('dk-navigation-fold:panel:v1'), 'workspace');
  } finally { dispose(); dom.window.close(); }
});

test('侧栏重建后保持选择并重新挂载，停用后完整恢复', async () => {
  const { dom, document, dispose } = setup();
  try {
    tab(document, 'navigation').click();
    document.getElementById('sidebar').outerHTML = sidebarMarkup();
    await nextDomUpdate(dom.window);
    assert.equal(document.querySelectorAll('[data-dk-panel-switcher]').length, 1, '不重复挂载');
    assert.equal(tab(document, 'navigation').getAttribute('aria-selected'), 'true', '重建后保持选择');
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(document.getElementById('workspace-label').hasAttribute('data-dk-navigation-fold-hidden'), true);
    assert.equal(switcher(document).nextElementSibling, document.querySelector('nav'));
    dispose(); // Cancel a pending observer update too.
    await nextDomUpdate(dom.window);
    assert.equal(switcher(document), null);
    assert.equal(document.querySelector('[data-dk-panel-hidden]'), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.equal(document.querySelector('[data-dk-workspace-header-spacer]'), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-style]'), null);
    assert.equal(document.querySelector('nav').id, '', '不遗留插件生成的 id');
    assert.equal(shown(document, 'workspace'), true);
    assert.equal(shown(document, 'navigation'), true);
    assertUnchangedOtherRegions(document);
  } finally { dispose(); dom.window.close(); }
});

test('缺少工作区标题、官方插槽或导航时不接管', () => {
  const cases = [
    ['没有标题（窄侧栏结构）', () => sidebarMarkup().replace('<span id="workspace-label">工作区</span>', '')],
    ['没有官方工作区插槽', () => sidebarMarkup().replace('data-slot="sidebar.workspaces"', 'data-slot="other"')],
    ['没有导航', () => sidebarMarkup()
      .replace('<nav aria-label="功能入口" style="display:flex">', '<div style="display:flex">')
      .replace('</nav>', '</div>')],
    ['两个侧栏', () => `${sidebarMarkup()}${sidebarMarkup().replace(/id="/g, 'id="b-')}`],
  ];
  for (const [name, markup] of cases) {
    const { dom, document, dispose } = setup(markup());
    try {
      assert.equal(switcher(document), null, name);
      assert.equal(document.querySelector('[data-dk-panel-hidden]'), null, name);
      const title = document.getElementById('workspace-label');
      if (title) assert.equal(title.hasAttribute('data-dk-navigation-fold-hidden'), false, name);
      const nav = document.querySelector('nav');
      if (nav) assert.notEqual(dom.window.getComputedStyle(nav).display, 'none', name);
    } finally { dispose(); dom.window.close(); }
  }
});

test('本地存储不可用也可切换；清理后无额外标签、隐藏属性或样式', async () => {
  const { dom, document, dispose } = setup(sidebarMarkup(), window => {
    Object.defineProperty(window, 'localStorage', { get() { throw new window.DOMException('Storage blocked', 'SecurityError'); } });
  });
  try {
    tab(document, 'navigation').click();
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(shown(document, 'workspace'), false);
    document.getElementById('sidebar').outerHTML = sidebarMarkup();
    dispose();
    await nextDomUpdate(dom.window);
    assert.equal(switcher(document), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-style]'), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('构建产物通过宿主模块入口挂载，插件生命周期结束即恢复导航', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${sidebarMarkupRc2()}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  prepareRc2Spacing(dom.window);
  const disposers = [];
  try {
    let client;
    const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
    // Only the ModuleLoader/Context boundary is substituted, not the navigation logic.
    runInNewContext(code, {
      window: { __ModuleLoader__: { load(definition) { client = definition.factory(); } } },
      document: dom.window.document,
    });
    client.apply({ effect(start) { disposers.push(start()); } });
    assert.ok(switcher(dom.window.document));
    assertRc2SwitcherSpacing(dom.window.document);
    for (const [language, expected] of [['en', 'Navigation'], ['zh-CN', '功能导航']]) {
      dom.window.document.documentElement.lang = language;
      await nextDomUpdate(dom.window);
      assert.equal(tab(dom.window.document, 'navigation').textContent, expected, '构建产物通过公开入口同步语言');
    }
    tab(dom.window.document, 'navigation').click();
    assert.equal(shown(dom.window.document, 'navigation'), true);
    assert.equal(shown(dom.window.document, 'workspace'), false);
    for (const dispose of disposers) dispose();
    assert.equal(switcher(dom.window.document), null);
    assert.equal(dom.window.document.querySelector('[data-dk-panel-hidden]'), null);
    assert.equal(dom.window.document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(dom.window.document.querySelector('nav')).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(dom.window.document.getElementById('workspace-list')).display, 'none');
  } finally { for (const dispose of disposers) dispose(); dom.window.close(); }
});

test('重复挂载时接管上一次实例，切换器不叠加', () => {
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head></head><body>${sidebarMarkup()}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const first = installNavigationFold(document);
  const second = installNavigationFold(document);
  try {
    // Re-applying without disposing the previous run must not stack a switch row.
    assert.equal(document.querySelectorAll('[data-dk-panel-switcher]').length, 1);
    assert.equal(document.querySelectorAll('style[data-dk-navigation-fold-style]').length, 1);
    // The retired run is already disposed: calling it again changes nothing.
    first();
    assert.equal(document.querySelectorAll('[data-dk-panel-switcher]').length, 1, '旧实例停用不得移除新实例的切换器');
    tab(document, 'navigation').click();
    assert.equal(shown(document, 'navigation'), true, '接管后的切换仍然生效');
    assert.equal(shown(document, 'workspace'), false);
  } finally {
    second();
    assert.equal(document.querySelector('[data-dk-panel-switcher]'), null);
    assert.equal(document.querySelector('style[data-dk-navigation-fold-style]'), null);
    assert.equal(shown(document, 'navigation'), true);
    assert.equal(shown(document, 'workspace'), true);
    dom.window.close();
  }
});

test('安装时清掉旧版残留的折叠按钮、样式与隐藏标记', () => {
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head></head><body>${sidebarMarkup()}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const staleToggle = document.createElement('button');
  staleToggle.setAttribute('data-dk-navigation-fold-toggle', 'navigation');
  document.querySelector('nav').before(staleToggle);
  const staleStyle = document.createElement('style');
  staleStyle.setAttribute('data-dk-navigation-fold-style', '');
  document.head.append(staleStyle);
  document.querySelector('nav').setAttribute('data-dk-navigation-fold-hidden', '');
  document.getElementById('workspace-browser').setAttribute('data-dk-panel-hidden', '');
  const dispose = installNavigationFold(document);
  try {
    assert.equal(document.querySelector('[data-dk-navigation-fold-toggle]'), null, '旧版折叠按钮不得残留');
    assert.equal(document.querySelectorAll('style[data-dk-navigation-fold-style]').length, 1);
    assert.equal(document.querySelector('nav').hasAttribute('data-dk-navigation-fold-hidden'), false);
    assert.equal(shown(document, 'workspace'), true, '残留的隐藏标记不得遮住所选分组');
  } finally { dispose(); dom.window.close(); }
});
