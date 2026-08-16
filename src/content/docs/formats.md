# 输出格式（Formats）

输出格式是部署提供的**标准产出模板**——文档、演示文稿、表格等。每个格式带一组种子文件，工作区可以从某个格式创建，agent 也会收到该格式的提示（agentHint），从而产出符合预期的内容。

## 从格式创建工作区

首页输入框下方会显示 **"或从模板开始"** 一行按钮（部署启用了格式时）：

- 每个按钮对应一个格式（如 **New Doc**、**New Deck**、**New Sheet**）
- 点击后创建新工作区，并自动写入该格式的种子文件（HTML/CSS/JS）
- 之后照常和 agent 对话，agent 会参考该格式的 agentHint 继续完善

## 切换工作区的格式

工作区编辑器顶栏有一个格式徽章（如 "Doc"）。点击可打开切换菜单：

- 选择另一个格式 → 写入该格式的种子文件（**不会覆盖你已有的文件**，只补充缺失的、并更新入口标记）
- 选择 **"通用应用"** → 移除格式关联，回到默认入口文件
- 切换会记录到操作日志（`workspace.format_switch`）

## 内置格式

部署自带三个内置格式（首次访问时自动初始化）：

| 格式 ID | 标题 | 产出 | 图标 |
| --- | --- | --- | --- |
| `format.document` | Document | Doc / Docs | fileText |
| `format.presentation` | Presentation | Deck / Decks | presentation |
| `format.spreadsheet` | Spreadsheet | Sheet / Sheets | table |

每个格式带一个或多个**变体**（如 Document 有 Article / Report），创建时使用第一个变体的种子文件。

## 模板市场

在 **蓝图** 页面，每个工作区行有 **"提交到市场"** 按钮：

1. 填写模板名称、描述、单数/复数名词、产出类型、图标、agent 提示、变体名
2. 提交后进入 **待审核** 状态（`pending`），管理员在 Admin → 格式 面板审核
3. 批准后对所有用户开放，出现在首页的 "New …" 按钮行

## 管理员策展（Admin → 格式）

管理员在 **Admin → 格式** 标签页管理所有格式：

- **待审核**：批准 / 拒绝用户提交的市场模板
- **已策展**：启用 / 禁用格式、编辑标题/描述/名词/图标/agent 提示
- 内置格式（Bundled）不能删除，只能禁用
- 禁用后用户无法再选择该格式创建新工作区

## 蓝图归档与格式

`.gadget.json` 归档现在会记录工作区创建时的 `formatId`：

- **导出**时自动写入
- **导入**时若该格式仍存在且启用，则恢复格式关联；否则回退为通用应用

## 图标词汇表

格式图标使用封闭词汇表，前端映射为具体图形：

`fileText` · `gridNine` · `presentation` · `appWindow` · `flowArrow` · `kanban` · `chartBar` · `table` · `notebook` · `listChecks`

未知图标自动回退为通用应用图标（appWindow）。