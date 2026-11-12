import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Contract: reversible, independent folding of sidebar navigation and workspace lists.
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
  const hostStyles = `<style>#sidebar{font:14px/20px sans-serif;--dsh-sidebar-row-padding:12px;--dsh-sidebar-label-gap:6px;--dsw-alias-label-secondary:#bcc3ca;--dsw-alias-label-tertiary:#8f9aa1}#workspace-header{height:36px;color:var(--dsw-alias-label-tertiary)}</style>`;
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head>${hostStyles}</head><body>${html}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const { document } = dom.window;
  prepare(dom.window);
  const dispose = installNavigationFold(document);
  return { dom, document, dispose };
}
function groupToggle(document) {
  return document.querySelector('button[data-dk-navigation-fold-toggle]');
}
function workspaceToggle(document) {
  return document.querySelector('button[data-dk-workspace-fold-toggle]');
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

// small/regression — English host sidebar still showed a Chinese plugin heading (2026-11-08).
test('英文界面安装后功能导航标题不混用中文', () => {
  const markup = sidebarMarkup().replace('>新会话<', '>New Session<').replace('>工作区<', '>Workspaces<');
  const { dom, document, dispose } = setup(markup, window => {
    window.document.documentElement.lang = 'en';
  });
  try {
    assert.equal(workspaceToggle(document).textContent, 'Workspaces');
    assert.equal(groupToggle(document).textContent, 'Navigation');
    assert.equal(groupToggle(document).getAttribute('aria-label'), 'Navigation');
  } finally { dispose(); dom.window.close(); }
});

test('导航标题识别宿主中英文语言标签，其他语言回退英文', () => {
  for (const [language, expected] of [
    ['zh', '功能导航'], ['zh-CN', '功能导航'], ['zh-Hans', '功能导航'],
    ['en', 'Navigation'], ['en-US', 'Navigation'], ['ja', 'Navigation'], ['', 'Navigation'],
  ]) {
    const { dom, document, dispose } = setup(sidebarMarkup(), window => {
      window.document.documentElement.lang = language;
    });
    try {
      assert.equal(groupToggle(document).textContent, expected, language);
      assert.equal(groupToggle(document).getAttribute('aria-label'), expected, language);
    } finally { dispose(); dom.window.close(); }
  }
});

test('原地切换语言更新标题和无障碍名称，保持两组折叠状态且停用后不再更新', async () => {
  const { dom, document, dispose } = setup();
  try {
    const navigation = groupToggle(document);
    const workspace = workspaceToggle(document);
    navigation.click();
    workspace.click();
    const preferences = Object.entries(dom.window.localStorage);
    for (const [language, expected, hostTitle] of [
      ['en', 'Navigation', 'Workspaces'], ['zh-CN', '功能导航', '工作区'], ['en-US', 'Navigation', 'Sessions'],
    ]) {
      // First change only <html lang>: the signal lives outside the observed body.
      document.documentElement.lang = language;
      await nextDomUpdate(dom.window);
      assert.equal(groupToggle(document), navigation, '复用按钮，不重建或重置状态');
      assert.equal(navigation.textContent, expected);
      assert.equal(navigation.getAttribute('aria-label'), expected);
      // Host workspace text may arrive in a later render.
      document.getElementById('workspace-label').textContent = hostTitle;
      await nextDomUpdate(dom.window);
      assert.equal(workspaceToggle(document), workspace);
      assert.equal(workspace.textContent, hostTitle);
      assert.equal(workspace.getAttribute('aria-label'), hostTitle);
      for (const toggle of [navigation, workspace]) assert.equal(toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
      assert.equal(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
      assert.deepEqual(Object.entries(dom.window.localStorage), preferences);
      assert.equal(document.querySelectorAll('[data-dk-fold-toggle]').length, 2);
      assert.equal(document.getElementById('new-session').textContent, '新会话', '不改写宿主文案');
    }
    dispose();
    document.documentElement.lang = 'zh-CN';
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null);
    assert.equal(navigation.textContent, 'Navigation', '停用后已移除的按钮不再响应语言变化');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-label')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('功能导航可整组收起展开，其他侧栏区域和原有点击行为保持不变', () => {
  const { dom, document, dispose } = setup();
  try {
    const nav = document.querySelector('nav');
    let originalClicks = 0;
    nav.querySelector('button').addEventListener('click', () => originalClicks++);
    const toggle = groupToggle(document);
    assert.ok(toggle, '安装后出现功能导航开关');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.getComputedStyle(nav).display, 'none');
    assertUnchangedOtherRegions(document);
    toggle.click();
    assert.notEqual(dom.window.getComputedStyle(nav).display, 'none');
    assert.equal(nav.querySelectorAll('button').length, 8);
    nav.querySelector('button').click();
    assert.equal(originalClicks, 1);
    assertUnchangedOtherRegions(document);
  } finally { dispose(); dom.window.close(); }
});

// regression — DSH 0.2.2-rc.2 moved NAV into a grid scroll area; the old
// direct-sibling locator silently disabled both toggles.
test('rc.2 网格滚动区中仍可折叠导航与工作区，导航开关不进入网格', () => {
  const { dom, document, dispose } = setup(sidebarMarkupRc2());
  try {
    const navigation = groupToggle(document);
    const workspace = workspaceToggle(document);
    const scrollRegion = document.getElementById('scroll-region');
    const scrollArea = document.getElementById('scroll-area');
    const nav = document.querySelector('nav');
    const list = document.getElementById('workspace-list');
    assert.ok(navigation, 'rc.2 侧栏出现功能导航开关');
    assert.ok(workspace, 'rc.2 侧栏出现工作区开关');
    assert.equal(navigation.parentElement.id, 'sidebar');
    assert.equal(navigation.nextElementSibling, scrollRegion, '导航开关插在滚动区之前，不进入 grid');
    assert.equal(scrollArea.querySelector('[data-dk-navigation-fold-toggle]'), null);
    assert.equal(workspace.parentElement.id, 'workspace-header');
    assert.equal(workspace.nextElementSibling.id, 'workspace-label');
    navigation.click();
    assert.equal(navigation.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.getComputedStyle(nav).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(scrollRegion).display, 'none');
    workspace.click();
    assert.equal(workspace.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.getComputedStyle(list).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-header')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('rc.2 侧栏整体重建后重新定位，停用恢复原结构', async () => {
  const { dom, document, dispose } = setup(sidebarMarkupRc2());
  try {
    groupToggle(document).click();
    document.getElementById('sidebar').outerHTML = sidebarMarkupRc2();
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document)?.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    assert.equal(workspaceToggle(document).getAttribute('aria-expanded'), 'true');
    dispose();
    assert.equal(groupToggle(document), null);
    assert.equal(workspaceToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

// small/regression — user-reported: 工作区不能像功能导航一样折叠 (2026-11-08).
test('工作区标题可收起展开列表，且两组开关互不影响', () => {
  const { dom, document, dispose } = setup();
  try {
    const toggle = workspaceToggle(document);
    const list = document.getElementById('workspace-list');
    const nav = document.querySelector('nav');
    assert.ok(toggle, '安装后工作区标题出现折叠开关');
    assert.equal(toggle.textContent, '工作区');
    assert.equal(toggle.getAttribute('aria-controls'), list.id);
    const steps = [
      [toggle, false, true],
      [groupToggle(document), false, false],
      [toggle, true, false],
      [groupToggle(document), true, true],
    ];
    for (const [button, workspaceOpen, navigationOpen] of steps) {
      button.click();
      assert.equal(toggle.getAttribute('aria-expanded'), String(workspaceOpen));
      assert.equal(dom.window.getComputedStyle(list).display !== 'none', workspaceOpen);
      assert.equal(dom.window.getComputedStyle(nav).display !== 'none', navigationOpen);
      assertUnchangedOtherRegions(document);
      assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-header')).display, 'none');
    }
  } finally { dispose(); dom.window.close(); }
});

// small/regression — screenshot reported inconsistent heading formatting (2026-11-08).
test('两组折叠标题使用相同字号与原生标题行高', () => {
  const { dom, document, dispose } = setup();
  try {
    const navigation = dom.window.getComputedStyle(groupToggle(document));
    const workspace = dom.window.getComputedStyle(workspaceToggle(document));
    // JSDOM does not resolve inherited CSS variables reliably. Color and x coordinates
    // are verified with the official styles in Chromium, not inferred from this DOM shim.
    for (const property of ['fontSize', 'fontWeight', 'lineHeight', 'minHeight', 'gap']) {
      assert.equal(navigation[property], workspace[property], `两组标题的 ${property} 一致`);
    }
    assert.equal(navigation.minHeight, '36px', '沿用原生工作区标题的 36px 行高');
  } finally { dispose(); dom.window.close(); }
});

// small/regression — screenshot reported a tooltip obscuring adjacent header controls (2026-11-08).
test('折叠标题不弹出遮挡工具按钮的原生提示，仍提供名称和展开状态', () => {
  const { dom, document, dispose } = setup();
  try {
    for (const toggle of [groupToggle(document), workspaceToggle(document)]) {
      for (const expanded of ['true', 'false']) {
        assert.equal(toggle.getAttribute('aria-expanded'), expanded);
        assert.equal(toggle.getAttribute('aria-label'), toggle.textContent);
        assert.equal(toggle.hasAttribute('title'), false, '已有可见标题和 aria-expanded，不重复显示原生气泡');
        assert.ok(document.getElementById(toggle.getAttribute('aria-controls')));
        toggle.click();
      }
    }
  } finally { dispose(); dom.window.close(); }
});

// small/regression — restart did not help: the official slot anchor was missing from the original fixture.
test('官方工作区插槽晚挂载或重建后可折叠，错误插槽不误接管', async () => {
  const { dom, document, dispose } = setup();
  try {
    const slot = document.querySelector('[data-slot="sidebar.workspaces"]');
    const browser = document.getElementById('workspace-browser');
    assert.ok(workspaceToggle(document), '识别官方 SlotOutlet 容器中的工作区');
    workspaceToggle(document).click();
    browser.remove();
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(browser.querySelector('#workspace-list')).display, 'none');
    slot.append(browser);
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document).getAttribute('aria-expanded'), 'false');
    slot.setAttribute('data-slot', 'unrelated');
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-label')).display, 'none');
    slot.setAttribute('data-slot', 'sidebar.workspaces');
    await nextDomUpdate(dom.window);
    assert.equal(document.querySelectorAll('[data-dk-workspace-fold-toggle]').length, 1);
    dispose();
    assert.equal(document.querySelector('[data-slot="sidebar.workspaces"]'), slot);
    assert.equal(slot.style.display, 'contents');
  } finally { dispose(); dom.window.close(); }
});

test('工作区搜索、视图与新增保留原有点击，并在使用时展开列表', () => {
  const { dom, document, dispose } = setup();
  try {
    for (const id of ['workspace-search', 'workspace-view', 'workspace-add']) {
      const action = document.getElementById(id);
      let clicks = 0;
      action.addEventListener('click', () => clicks++);
      workspaceToggle(document).click();
      assert.notEqual(dom.window.getComputedStyle(action).display, 'none');
      action.click();
      assert.equal(clicks, 1);
      assert.equal(workspaceToggle(document).getAttribute('aria-expanded'), 'true');
      assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
    }
  } finally { dispose(); dom.window.close(); }
});

test('收起工作区时移出列表焦点，搜索快捷键聚焦时自动展开', () => {
  const { dom, document, dispose } = setup();
  try {
    document.querySelector('[data-row-key]').focus();
    workspaceToggle(document).click();
    assert.equal(document.activeElement, workspaceToggle(document));
    document.querySelector('#workspace-header input').focus();
    assert.equal(workspaceToggle(document).getAttribute('aria-expanded'), 'true');
  } finally { dispose(); dom.window.close(); }
});

test('工作区标题跟随原分组文案，搜索展开时不挤占输入框', async () => {
  const { dom, document, dispose } = setup();
  try {
    document.getElementById('workspace-label').textContent = 'Sessions';
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document).textContent, 'Sessions');
    document.getElementById('workspace-search').setAttribute('aria-expanded', 'true');
    await nextDomUpdate(dom.window);
    assert.equal(dom.window.getComputedStyle(workspaceToggle(document)).display, 'none');
    document.getElementById('workspace-search').setAttribute('aria-expanded', 'false');
    await nextDomUpdate(dom.window);
    assert.notEqual(dom.window.getComputedStyle(workspaceToggle(document)).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('工作区折叠独立持久化，旧 key 仅作回退', () => {
  const initial = setup(sidebarMarkup(), window => window.localStorage.setItem('dsh-navigation-fold:collapsed:v1', 'true'));
  let workspacePreference;
  try {
    assert.equal(groupToggle(initial.document).getAttribute('aria-expanded'), 'false', '读取旧功能导航 key');
    assert.equal(workspaceToggle(initial.document).getAttribute('aria-expanded'), 'true');
    workspaceToggle(initial.document).click();
    const storage = initial.dom.window.localStorage;
    workspacePreference = ['dk-navigation-fold:workspaces-collapsed:v1', storage.getItem('dk-navigation-fold:workspaces-collapsed:v1')];
    assert.equal(workspacePreference[1], 'true', '新状态写入新 key');
    assert.equal(storage.getItem('dsh-navigation-fold:collapsed:v1'), 'true', '旧 key 不被改写');
  } finally { initial.dispose(); initial.dom.window.close(); }
  const refreshed = setup(sidebarMarkup(), window => {
    window.localStorage.setItem(...workspacePreference);
    window.localStorage.setItem('dsh-navigation-fold:collapsed:v1', 'true');
    window.localStorage.setItem('dk-navigation-fold:collapsed:v1', 'false');
  });
  try {
    assert.equal(workspaceToggle(refreshed.document).getAttribute('aria-expanded'), 'false');
    assert.equal(groupToggle(refreshed.document).getAttribute('aria-expanded'), 'true', '新 key 优先于旧 key');
  } finally { refreshed.dispose(); refreshed.dom.window.close(); }
});

test('工作区重建后保持收起，结构变化时放开列表而不影响功能导航', async () => {
  const { dom, document, dispose } = setup();
  try {
    workspaceToggle(document).click();
    const replacement = document.createElement('div');
    replacement.innerHTML = sidebarMarkup();
    document.getElementById('workspaces').replaceWith(replacement.querySelector('#workspaces'));
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document).getAttribute('aria-expanded'), 'false');
    const list = document.getElementById('workspace-list');
    assert.equal(dom.window.getComputedStyle(list).display, 'none');
    const header = document.getElementById('workspace-header');
    const label = document.getElementById('workspace-label');
    label.remove();
    await nextDomUpdate(dom.window);
    assert.equal(workspaceToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(list).display, 'none');
    assert.ok(groupToggle(document));
    header.prepend(label);
    await nextDomUpdate(dom.window);
    assert.equal(document.querySelectorAll('button[data-dk-workspace-fold-toggle]').length, 1);
    assert.equal(dom.window.getComputedStyle(list).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('工作区结构不明确时保留原列表与标题，不猜测其他区域', () => {
  const markup = sidebarMarkup().replace('<div id="workspace-list">', '<div id="unknown-region"></div><div id="workspace-list">');
  const { dom, document, dispose } = setup(markup);
  try {
    assert.equal(workspaceToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-label')).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
    assert.ok(groupToggle(document));
  } finally { dispose(); dom.window.close(); }
});

test('工作区无 id 时建立可访问关联，停用后只清理自己生成的 id', () => {
  const { dom, document, dispose } = setup(sidebarMarkup().replace('id="workspace-list"', ''));
  try {
    const toggle = workspaceToggle(document);
    const list = document.querySelector('[data-row-key]').parentElement;
    assert.equal(document.getElementById(toggle.getAttribute('aria-controls')), list);
    dispose();
    assert.equal(list.hasAttribute('id'), false);
    assert.equal(document.getElementById('workspace-header').id, 'workspace-header');
  } finally { dispose(); dom.window.close(); }
});

test('停用时恢复工作区原标题与列表并移除开关监听', async () => {
  const { dom, document, dispose } = setup();
  try {
    const toggle = workspaceToggle(document);
    workspaceToggle(document).click();
    const storage = dom.window.localStorage;
    const before = Object.entries(storage);
    dispose();
    toggle.click();
    document.getElementById('workspace-search').click();
    await nextDomUpdate(dom.window);
    assert.deepEqual(Object.entries(storage), before);
    assert.equal(workspaceToggle(document), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-label')).display, 'none');
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('导航重建后保留折叠，定位失效时恢复原导航，恢复定位后不重复添加开关', async () => {
  const { dom, document, dispose } = setup();
  try {
    groupToggle(document).click();
    document.getElementById('sidebar').outerHTML = sidebarMarkup();
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document)?.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
    sidebarToggle.removeAttribute('data-sidebar-toggle');
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null);
    assert.notEqual(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    sidebarToggle.setAttribute('data-sidebar-toggle', 'true');
    await nextDomUpdate(dom.window);
    assert.equal(document.querySelectorAll('button[data-dk-navigation-fold-toggle]').length, 1);
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    assertUnchangedOtherRegions(document);
  } finally { dispose(); dom.window.close(); }
});

test('未出现侧栏时等待挂载；无关导航不受影响，定位不唯一时自动恢复', async () => {
  const { dom, document, dispose } = setup('<nav id="unrelated" aria-label="文档目录"><button>章节</button></nav>');
  try {
    assert.equal(groupToggle(document), null);
    document.body.insertAdjacentHTML('beforeend', sidebarMarkup());
    await nextDomUpdate(dom.window);
    assert.ok(groupToggle(document));
    groupToggle(document).click();
    workspaceToggle(document).click();
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('unrelated')).display, 'none');
    const second = document.createElement('div');
    second.innerHTML = sidebarMarkup();
    const secondSidebarToggle = second.querySelector('[data-sidebar-toggle]');
    secondSidebarToggle.removeAttribute('data-sidebar-toggle');
    document.body.append(second);
    await nextDomUpdate(dom.window);
    assert.ok(groupToggle(document), '第二棵结构尚未匹配时保留原开关');
    secondSidebarToggle.setAttribute('data-sidebar-toggle', 'true');
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null, '多个可能的侧栏时宁可不折叠');
    assert.equal(workspaceToggle(document), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    for (const nav of document.querySelectorAll('nav')) assert.notEqual(dom.window.getComputedStyle(nav).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('本地存储不可用也可操作；清理后无额外按钮、隐藏属性、样式或延迟重挂载', async () => {
  const { dom, document, dispose } = setup(sidebarMarkup(), window => {
    Object.defineProperty(window, 'localStorage', { get() { throw new window.DOMException('Storage blocked', 'SecurityError'); } });
  });
  try {
    groupToggle(document).click();
    workspaceToggle(document).click();
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    assert.equal(dom.window.getComputedStyle(document.getElementById('workspace-list')).display, 'none');
    document.getElementById('sidebar').outerHTML = sidebarMarkup();
    dispose(); // Cancel a pending observer update too.
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-style]'), null);
    assert.equal(document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('构建产物通过宿主模块入口挂载，插件生命周期结束即恢复导航', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${sidebarMarkup()}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
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
    const toggle = groupToggle(dom.window.document);
    assert.ok(toggle);
    for (const [language, expected] of [['en', 'Navigation'], ['zh-CN', '功能导航']]) {
      dom.window.document.documentElement.lang = language;
      await nextDomUpdate(dom.window);
      assert.equal(toggle.textContent, expected, '构建产物通过公开入口同步语言');
      assert.equal(toggle.getAttribute('aria-label'), expected);
    }
    toggle.click();
    workspaceToggle(dom.window.document).click();
    assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('nav')).display, 'none');
    assert.equal(dom.window.getComputedStyle(dom.window.document.getElementById('workspace-list')).display, 'none');
    for (const dispose of disposers) dispose();
    assert.equal(groupToggle(dom.window.document), null);
    assert.equal(workspaceToggle(dom.window.document), null);
    assert.equal(dom.window.document.querySelector('[data-dk-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(dom.window.document.querySelector('nav')).display, 'none');
  } finally { for (const dispose of disposers) dispose(); dom.window.close(); }
});

test('停用插件完整恢复导航，但页面刷新仍能记住上次收起状态', () => {
  const first = setup();
  let persisted;
  try {
    groupToggle(first.document).click();
    const storage = first.dom.window.localStorage;
    assert.equal(storage.length, 1, '只保存一项插件自己的偏好');
    assert.equal(storage.key(0), 'dk-navigation-fold:collapsed:v1');
    persisted = [storage.key(0), storage.getItem(storage.key(0))];
    first.dispose();
    assert.equal(groupToggle(first.document), null);
    assert.notEqual(first.dom.window.getComputedStyle(first.document.querySelector('nav')).display, 'none');
    assertUnchangedOtherRegions(first.document);
  } finally { first.dispose(); first.dom.window.close(); }
  const refreshed = setup(sidebarMarkup(), window => window.localStorage.setItem(...persisted));
  try {
    assert.equal(groupToggle(refreshed.document).getAttribute('aria-expanded'), 'false');
    assert.equal(refreshed.dom.window.getComputedStyle(refreshed.document.querySelector('nav')).display, 'none');
    assertUnchangedOtherRegions(refreshed.document);
  } finally { refreshed.dispose(); refreshed.dom.window.close(); }
});
