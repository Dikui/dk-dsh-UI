# dk-dsh-front

集中开发、管理和维护 **DeepSeek Harness（DSH）前端插件与界面增强** 的项目。

采用轻量 pnpm workspace：每个功能是可独立安装、启停、测试和升级的插件，复用官方界面，不维护一份自定义 DSH 安装包。

## 插件

| 插件 | 版本 | 功能 | 实现边界 |
| --- | --- | --- | --- |
| [dk-navigation-fold](packages/dk-navigation-fold/README.md) | 0.3.0 | 用顶部标签在工作区与功能导航之间切换，保留 Logo、新会话及工作区工具按钮 | 基于原侧栏 DOM 的可撤销增强，非官方稳定插槽 |

## 结构

```text
.
├── AGENTS.md                 # 项目开发约定
├── package.json              # 私有工作区入口，无统一发布版本
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── packages/
    └── dk-navigation-fold/
        ├── package.json      # 插件 manifest、独立版本和兼容范围
        ├── index.js          # DSH 宿主入口
        ├── cordis.patch.yml
        ├── src/              # 功能实现
        ├── scripts/          # 客户端构建脚本
        ├── test/             # 契约与生命周期测试
        └── lib/              # 本地生成，不提交
```

## 开发

需要 Node >=22.19 和 pnpm 11.28.5；本插件已在 Node 24 上验证。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm build
```

只检查某一个插件：

```sh
pnpm --filter dk-navigation-fold check
```

侧栏分组切换插件没有运行时 npm 依赖；`jsdom` 仅用于测试。`check` 包含源码/产物语法检查、构建与该插件的局部测试，不等同于 DSH 全量测试或实际 GUI 端到端测试。

## 安装到 DSH

1. 先在仓库根目录执行安装依赖与 `pnpm build`。
2. 在 DSH 插件管理中安装本地包，目标使用：

   ```text
   link:<本仓库的绝对路径>/packages/dk-navigation-fold
   ```

3. 启用插件；重新构建后，可在插件管理中停用再启用本插件，让宿主重新读取产物，不另开 Web 服务。若仍无标签栏，需检查插件状态与结构兼容性，不能只依赖刷新或重启。
4. 验证顶部标签可在工作区与功能导航之间切换、选择在刷新后保持，且 Logo、新会话及工作区工具按钮仍正常；在插件管理中停用可恢复原侧栏。

本地链接会直接指向项目中的插件目录，因此应保留工作副本及生成的 `lib/client.js`。修改源码后需要重新构建，再按当前宿主的加载行为刷新验证；本项目没有自动构建 watcher，不保证源码编辑即热更新。

从旧包名 `dsh-navigation-fold` 升级时，插件管理器不会把它当作同一插件：先在插件管理中移除旧安装，再用上面的链接安装 `dk-navigation-fold` 并启用。包名、Cordis/ModuleLoader 入口 id 和 DOM 标记已改为 `dk-` 前缀，旧安装会因目录改名而失效；旧折叠偏好不再读取；新的标签选择写入 `dk-navigation-fold:panel:v1`，因此不需要重置偏好。

## 扩展新的界面功能

- 在 `packages/` 下创建独立插件目录，声明自己的 `dsh.bundle`、`dsh.client`、DSH 兼容范围和版本。
- 优先使用官方公开 API/插槽，不复制整套侧栏或修改官方应用文件。
- 对无法通过公开接口实现的增强，文档说明结构假设，提供失败放开及停用清理。
- 配置独立 `build`、`test`、`check`，根工作区命令会自动纳入；补齐插件目录中的使用与兼容说明。
- 在有真实复用需求前，不引入共享运行时或统一插件管理页面。

官方更新不会直接覆盖此仓库，但依赖 DOM 的插件可能需要适配；宿主版本守卫也可能阻止未经验证的新预发布版本。不要把独立保存理解成永久兼容保证。
