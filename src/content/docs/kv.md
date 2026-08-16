# Cloudflare KV 缓存使用指南

> 本应用把部分较慢的接口（**Pages 项目列表**、**GitHub/GitLab 仓库枚举**、**Pages 用量面板**）的响应缓存到 **Cloudflare KV**，让重复访问"秒开"——这是让整体流畅度更接近 Cloudflare 的关键手段。

## 为什么需要 KV 缓存

部署时为了展示**实时**的 Pages 子域名、已绑定域名，或列出你的 Git 仓库，服务端每次都要去请求 Cloudflare / GitHub / GitLab 的 API。这些外部请求慢则几秒，用户每打开一次页面就要等一次。

把结果缓存到 KV 后：

- 首次访问照常请求外部 API 并写入缓存；
- 之后的访问在缓存有效期内**直接返回缓存结果**（KV 就近、毫秒级），外部 API 不用再被打；
- 缓存过期后自动回源刷新，保证数据不会太旧。

## 一、先建一个 KV 命名空间（默认单库）

**只需要这一个，功能即可正常使用。**

1. 打开 Cloudflare 控制台 → 左侧 **Workers & Pages** → **KV**。
2. 点 **创建命名空间**，随意起名（如 `cfos-cache`），创建。
3. 进入该命名空间，复制它的 **Namespace ID**（一长串字母数字）。
4. 在 Vercel 项目的 **Settings → Environment Variables** 配置：

   | 变量 | 值 |
   |---|---|
   | `KV_ACCOUNT_ID` | 你的 Cloudflare 账户 ID（与 `PAGES_ACCOUNT_ID` 相同） |
   | `KV_API_TOKEN` | 有 **Workers KV → Edit** 权限的 API Token（若 `PAGES_KEY` 已含该权限可直接复用其值） |
   | `KV_NAMESPACE_ID` | 刚复制的 Namespace ID |

5. 保存后 **Redeploy** 生效。

> **API Token 权限**：去 Cloudflare → 我的个人资料 → API 令牌 → 创建令牌。若用「编辑 Cloudflare Workers」模板，通常已含 **Workers KV → Edit**；否则需自建 Token 并勾选 **Account → Workers KV → Edit**。

## 二、（可选）加更多 KV 库

如果申请了多个 KV 命名空间（例如分布在多个地区），最多可配 **5 个**。第 1 个用基础变量名，之后的每个库在三个变量后加**数字后缀**（`_2` … `_5`），纯序号、不带地区。

示例——两个库：
```
KV_ACCOUNT_ID=...
KV_API_TOKEN=...
KV_NAMESPACE_ID=...
KV_ACCOUNT_ID_2=...
KV_API_TOKEN_2=...
KV_NAMESPACE_ID_2=...
```

**读写策略**：
- **写入**：写缓存时，数据会写到**全部**已配置的 KV 库（注意是全部），保证任一读取都能命中。
- **读取**：按序尝试各库（第 1 个优先），某个库没有（miss）就自动回退到下一个，总能拿到。
- 只配一个库时，读写都走那一个库，无需任何额外配置。

## 三、调优（可选）

一套变量，作用于所有 KV 库：

| 变量 | 说明 | 默认 |
|---|---|---|
| `KV_PREFIX` | 缓存键前缀，用于隔离多个实例/环境 | `cfos` |
| `KV_DEFAULT_TTL` | 默认缓存时长（秒） | `60` |
| `KV_PAGES_PROJECTS_TTL` | Pages 项目列表缓存（秒） | `15` |
| `KV_GIT_REPOS_TTL` | Git 仓库列表缓存（秒，按用户） | `60` |
| `KV_PAGES_STATS_TTL` | Pages 用量面板缓存（秒） | `8` |
| `KV_ME_TTL` | `/api/me`（当前用户资料）缓存（秒） | `5` |
| `KV_ANALYTICS_TTL` | `/api/analytics`（按用户）缓存（秒） | `30` |
| `KV_SITE_TTL` | 公共 `/api/site` 设置缓存（秒） | `30` |
| `KV_SSH_HOSTS_TTL` | SSH 主机列表缓存（秒，按用户） | `10` |
| `KV_NOTIFICATIONS_TTL` | 通知列表缓存（秒，按用户） | `5` |
| `KV_WORKSPACES_TTL` | 工作区列表缓存（秒，按用户） | `5` |
| `KV_FAVORITES_TTL` | 收藏列表缓存（秒，按用户） | `5` |
| `KV_TICKETS_TTL` | 工单列表缓存（秒，按用户） | `5` |

> 调大 TTL 更快但数据更"旧"；部署新项目后想立刻看到，可适当调小，或等 TTL 过期自动刷新。

## 四、没有配置 KV 会怎样

完全没配置时，自动回退到**进程内内存缓存**（单实例局部加速），功能不受任何影响。多实例部署下内存缓存不共享，所以跨实例重复请求仍会打外部 API——配了 KV 才能真正做到全站就近、秒开。

## 五、生效范围

KV 缓存已应用到以下接口：

- `/api/deploy/list` —— Pages 项目列表（含实时子域名、域名）→ 缓存 `KV_PAGES_PROJECTS_TTL`
- `/api/pages/sources` —— GitHub / GitLab 仓库列表 → 缓存 `KV_GIT_REPOS_TTL`
- `/api/pages/stats` —— Pages 右侧用量面板 → 缓存 `KV_PAGES_STATS_TTL`
- `/api/me` —— 当前用户资料/连接状态 → 缓存 `KV_ME_TTL`
- `/api/analytics` —— 统计面板（按用户）→ 缓存 `KV_ANALYTICS_TTL`（`currentIp` 始终实时，不缓存）
- `/api/site` —— 公共站点设置 → 缓存 `KV_SITE_TTL`（另有边缘缓存）
- `/api/ssh-hosts` —— SSH 主机列表 → 缓存 `KV_SSH_HOSTS_TTL`（增删改后立即失效）
- `/api/notifications` —— 通知列表 → 缓存 `KV_NOTIFICATIONS_TTL`（新通知/已读后立即失效）
- `/api/workspaces` —— 工作区列表 → 缓存 `KV_WORKSPACES_TTL`（创建/重命名/删除后立即失效）
- `/api/favorites` —— 收藏列表 → 缓存 `KV_FAVORITES_TTL`（收藏/取消后立即失效）
- `/api/tickets` —— 工单列表 → 缓存 `KV_TICKETS_TTL`（新建/管理员回复后立即失效）

**内存缓存（无需 KV 也生效）**：
- 站点设置 `getSetting`（站点名、favicon、横幅等）有 **30 秒进程内内存缓存**——每次页面渲染都会读取这些设置，内存缓存让 DB 远离热路径；管理员在后台修改设置后立即清除缓存，马上生效。

**正确性说明**：
- 每个**用户相关**的缓存键都含用户 ID，互不串数据；`/api/site` 是公共数据，用固定键。
- `/api/analytics` 的 `currentIp`/`currentIpFamily` 是请求者自己的 IP，**始终实时计算，不进缓存**，避免不同用户读到别人的 IP。
- `/api/me` 的会话校验与账号删除截止检查每次实时执行，不进缓存。
- 会**改变数据**的操作（部署、删项目、绑定域名、增删改 SSH 主机）都会主动失效对应缓存，列表立即刷新，不靠 TTL 等待。

所有缓存键均含 `KV_PREFIX` 与（必要时）用户 ID，保证多实例、多用户之间互不串数据。

## 六、D1 二级备份（可选）

可以把 KV 缓存**镜像到 Cloudflare D1** 作为冗余存储（见[环境变量说明](/docs/env#cloudflare-d1-二级备份可选默认关闭)）。开启后：

- 每次 KV 缓存写入都会**同步复制到 D1**（尽力而为、不阻塞主流程）；
- KV 读不到时会**回退到 D1**，再去拉取上游。

设置 `D1_ENABLED=true`，并配置最多 5 个 D1 数据库 ID（`D1_SQL_1` … `D1_SQL_5`）；配置超过 5 个会报错。镜像表（`cache_store`）在首次使用时自动创建。
