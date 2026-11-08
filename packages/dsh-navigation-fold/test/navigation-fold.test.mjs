import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Contract: reversible folding of only the sidebar's feature-navigation group.
// All tests are small/spec; JSDOM replaces only the browser DOM, never user data.
// Node's built-in runner has no test-label API. Test names describe observable contracts.
import { installNavigationFold } from '../src/navigation-fold.js';

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
    <div id="workspaces"><button>工作区</button><button>example-workspace</button></div>
    <div id="settings">设置</div>
  </div>`;
}
function setup(html = sidebarMarkup(), prepare = () => {}) {
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head></head><body>${html}</body></html>`, {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const { document } = dom.window;
  prepare(dom.window);
  const dispose = installNavigationFold(document);
  return { dom, document, dispose };
}
function groupToggle(document) {
  return document.querySelector('button[data-dsh-navigation-fold-toggle]');
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
    assert.equal(document.querySelectorAll('button[data-dsh-navigation-fold-toggle]').length, 1);
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
    assert.notEqual(dom.window.getComputedStyle(document.getElementById('unrelated')).display, 'none');
    document.body.insertAdjacentHTML('beforeend', sidebarMarkup());
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null, '多个可能的侧栏时宁可不折叠');
    for (const nav of document.querySelectorAll('nav')) assert.notEqual(dom.window.getComputedStyle(nav).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('本地存储不可用也可操作；清理后无额外按钮、隐藏属性、样式或延迟重挂载', async () => {
  const { dom, document, dispose } = setup(sidebarMarkup(), window => {
    Object.defineProperty(window, 'localStorage', { get() { throw new window.DOMException('Storage blocked', 'SecurityError'); } });
  });
  try {
    groupToggle(document).click();
    assert.equal(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
    document.getElementById('sidebar').outerHTML = sidebarMarkup();
    dispose(); // Cancel a pending observer update too.
    await nextDomUpdate(dom.window);
    assert.equal(groupToggle(document), null);
    assert.equal(document.querySelector('[data-dsh-navigation-fold-style]'), null);
    assert.equal(document.querySelector('[data-dsh-navigation-fold-hidden]'), null);
    assert.notEqual(dom.window.getComputedStyle(document.querySelector('nav')).display, 'none');
  } finally { dispose(); dom.window.close(); }
});

test('构建产物通过宿主模块入口挂载，插件生命周期结束即恢复导航', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${sidebarMarkup()}</body></html>`, { url: 'http://localhost/' });
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
    toggle.click();
    assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('nav')).display, 'none');
    for (const dispose of disposers) dispose();
    assert.equal(groupToggle(dom.window.document), null);
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
