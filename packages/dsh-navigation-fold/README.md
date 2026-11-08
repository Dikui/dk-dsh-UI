# 功能导航折叠 · dsh-navigation-fold

本地独立 DSH 插件，只收起「新会话」与「工作区」之间的功能入口，不替换官方侧栏，也不修改应用安装包。

## 使用

- 「新会话」下方出现 **功能导航** 按钮，点击收起或展开整组入口（包括「更多」）。
- 默认展开；仅使用浏览器 localStorage 的 `dsh-navigation-fold:collapsed:v1` 记住上次状态。存储受限时仍可在当前页面使用。
- Logo、新会话、工作区、设置及官方“整个侧栏开关”保持原状。原有功能按钮不被移动或重新实现。
- 在插件管理中停用或卸载 `dsh-navigation-fold` 可恢复原导航；本地偏好保留，方便重新启用时恢复状态。
- 插件装入已有桌面 profile 后，若当前页面未出现按钮，请在原桌面窗口刷新一次。不需要启动新的 Web 服务。

## 边界与兼容性

宿主提供普通插件加载与生命周期，但当前没有公开的“整组导航折叠”插槽。因此此插件以结构化 DOM 适配器增强原侧栏：定位原有 `data-sidebar-toggle`、拖动区域及导航/工作区相邻关系，不依赖翻译文案或散列 CSS 类名。

- 只有唯一匹配的侧栏会被增强；无法定位或匹配不唯一时恢复原导航，不隐藏其他菜单。
- 官方渲染重建节点后自动重新定位；停用时撤销样式、按钮和监听。
- 独立保存可避免被官方安装包更新直接覆盖，**不代表官方支持的永久兼容接口**；官方改变 DOM 后可能需要适配。
- 声明的 DSH 版本范围是 `^0.2.2-rc.1`；后续预发布版本可能因版本守卫需要主动评估后升级声明，不能绕过兼容守卫。
- 本插件无网络请求、不读取凭据、不注册代理工具，无运行时 npm 依赖。

## 开发与检查

需要 Node >=22.19、pnpm。`jsdom` 仅是开发依赖。在本仓库根目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter dsh-navigation-fold test
pnpm --filter dsh-navigation-fold build
pnpm --filter dsh-navigation-fold check
```

安装时使用本地包来源 `link:<本仓库绝对路径>/packages/dsh-navigation-fold`。生成产物不入库，安装前必须 build。详见[项目说明](../../README.md)。

源码在 `src/navigation-fold.js`，构建脚本生成 ModuleLoader 格式的 `lib/client.js`。修改源码后必须重新构建；普通源码编辑不会自动更新此 GUI。

测试覆盖：整组收起/展开、其他区域与原有点击不变、状态持久化、节点重建、定位失效/歧义时放开、延迟挂载、存储异常、停用清理。测试使用近似官方结构的独立 DOM，不应当作已登录桌面 GUI 的端到端验证。
