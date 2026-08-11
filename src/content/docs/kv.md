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

## 二、（可选）加 4 个地区库，实现就近读写

如果你的用户分布在全球，可以在**不同地区**各建一个 KV 命名空间，让每个地区的用户就近读取，速度更快。

- 支持最多 **5 个** KV 库：`ASIA`、`NA`（北美）、`SA`（南美）、`EU`（欧洲）。
- 每个地区库同样是 3 个变量：`KV_<地区>_ACCOUNT_ID` / `KV_<地区>_API_TOKEN` / `KV_<地区>_NAMESPACE_ID`。
- 同一地区有**两个**库时，第二个在地区后加 `-2`（如 `KV_ASIA_2_*`）。

示例：亚洲 2 个 + 北美 1 个：
```
KV_ASIA_ACCOUNT_ID=...
KV_ASIA_API_TOKEN=...
KV_ASIA_NAMESPACE_ID=...
KV_ASIA_2_ACCOUNT_ID=...
KV_ASIA_2_API_TOKEN=...
KV_ASIA_2_NAMESPACE_ID=...
KV_NA_ACCOUNT_ID=...
KV_NA_API_TOKEN=...
KV_NA_NAMESPACE_ID=...
```

**读写策略**：
- **写入**：部署/写缓存时，数据会写到**全部**已配置的 KV 库（注意是全部），保证任意地区都有副本。
- **读取**：根据请求的地区（Vercel 注入的 `x-vercel-ip-country`）**就近优先**读取；就近库没有（miss）则自动回退到其他库，总能拿到。
- 只配默认单库时，读写都走那一个库，无需任何额外配置。

## 三、调优（可选）

一套变量，作用于所有 KV 库：

| 变量 | 说明 | 默认 |
|---|---|---|
| `KV_PREFIX` | 缓存键前缀，用于隔离多个实例/环境 | `cfos` |
| `KV_DEFAULT_TTL` | 默认缓存时长（秒） | `60` |
| `KV_PAGES_PROJECTS_TTL` | Pages 项目列表缓存（秒） | `15` |
| `KV_GIT_REPOS_TTL` | Git 仓库列表缓存（秒，按用户） | `60` |
| `KV_PAGES_STATS_TTL` | Pages 用量面板缓存（秒） | `8` |

> 调大 TTL 更快但数据更"旧"；部署新项目后想立刻看到，可适当调小，或等 TTL 过期自动刷新。

## 四、没有配置 KV 会怎样

完全没配置时，自动回退到**进程内内存缓存**（单实例局部加速），功能不受任何影响。多实例部署下内存缓存不共享，所以跨实例重复请求仍会打外部 API——配了 KV 才能真正做到全站就近、秒开。

## 五、生效范围

KV 缓存已应用到以下接口：

- `/api/deploy/list` —— Pages 项目列表（含实时子域名、域名）→ 缓存 `KV_PAGES_PROJECTS_TTL`
- `/api/pages/sources` —— GitHub / GitLab 仓库列表 → 缓存 `KV_GIT_REPOS_TTL`
- `/api/pages/stats` —— Pages 右侧用量面板 → 缓存 `KV_PAGES_STATS_TTL`

所有缓存键均含 `KV_PREFIX` 与（必要时）用户 ID，保证多实例、多用户之间互不串数据。
