# 商城微信小程序（Casdoor 统一登录）

基于历史项目（`tikumini`，uni-app 架构）重构的小程序登录示例。**只借鉴架构，不含历史业务**，并做了如下升级：

| 历史项目（tikumini） | 本项目（mimi） | 升级点 |
|----------------------|----------------|--------|
| uni-app CLI + Vuex + `uni.request` | 原生微信小程序 | 免构建工具链，微信开发者工具直接打开即可运行 |
| `src/config.js`（appid/version） | `config/index.js`（baseUrl/appid/storageKey） | 后端地址集中配置，环境切换只改一处 |
| `src/api/request.js`（柯里化工厂） | `utils/request.js` | token 自动注入、401 统一重登、错误 toast 收敛 |
| `src/api/index.js`（接口函数聚合） | `api/index.js` | 同上，按模块导出 |
| `src/store/index.js`（Vuex token） | `utils/auth.js` + `globalData` | 更轻量：storage 持久化 + globalData 热缓存 |
| `wx.getUserProfile` 授权弹窗 | `open-type="chooseAvatar"` + `type="nickname"` | 微信新版资料组件（旧接口已废弃） |

## 登录链路

```
小程序                          后端网关(8888)                  Casdoor               微信
wx.login() → code ──┐
                    │  POST /api/user/mp/login {code}
                    ▼
                 后端 → 转发 code ──▶ jscode2session ──▶ 换取 openid
                    ◀── 签发 Casdoor JWT ── 校验 ──┘
                    落地本地 user 表（首次自动注册）→ 签发商城 JWT
                    ▼
                返回 {accessToken, accessExpire, userId, casdoorName}
```

- 启动时 `app.js` 自动**静默登录**（已有 token 则跳过）
- 登录页提供**微信一键登录**，可选完善头像/昵称（提交给后端更新 Casdoor 用户资料）
- 首页演示带 token 调用受保护接口 `/api/user/userinfo`（401 自动清理登录态并跳回登录页）

## 目录结构

```
mimi/
├── project.config.json      # 项目配置（appid: wxf76e1101f4b99b6d）
├── app.js                   # 入口：静默登录 + 401 全局处理
├── app.json / app.wxss      # 页面注册 / 全局样式
├── config/index.js          # 全局配置：baseUrl、appid、storageKey
├── utils/
│   ├── request.js           # 请求封装：token 注入 / 401 / loading / 错误提示
│   └── auth.js              # 登录态：wxLogin / silentLogin / logout
├── api/index.js             # 接口定义：mpLogin / getUserInfo
└── pages/
    ├── login/               # 登录页（一键登录 + 可选资料）
    └── index/               # 首页（登录态 + 用户信息 + 退出）
```

## 运行步骤

### 1. 后端准备（仓库根目录）

```bash
docker compose up -d            # 启动全部服务（含 Casdoor）
# Casdoor 微信 Provider 已配置真实 AppID/AppSecret（admin/provider-wechat-mp）
# 网关 Casdoor.MockMiniProgram=false（真实链路）
# 验证：curl -X POST http://localhost:8888/api/user/mp/login -H 'Content-Type: application/json' -d '{"code":"任意假code"}'
#   → 返回 casdoor error: invalid_grant: ... invalid code 即链路已通（假 code 必然失败）
```

### 2. 导入微信开发者工具

1. 打开微信开发者工具 → 导入项目 → 选择本目录 `mimi/`
2. AppID 已内置 `wxf76e1101f4b99b6d`（与后端 Casdoor Provider 一致）
3. **详情 → 本地设置 → 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**（本地 http://localhost 必需）
4. 编译运行 → 登录页点「微信一键登录」→ wx.login() 返回真实 code → 后端/Casdoor 与微信换 openid → 登录成功进首页

> 说明：微信开发者工具模拟器中 `wx.login()` 使用真实 AppID 会返回**有效 code**，
> 后端 Casdoor 用同一 AppID/AppSecret 即可真实换取 openid，登录链路完全真实。
> 若想验证失败分支，可临时把 `config/index.js` 的 baseUrl 改错或停掉后端。

### 3. 生产发布

1. 后端 `config/index.js` → `baseUrl` 改为 **https 域名**（如 `https://api.yourmall.com`）
2. 微信公众平台 → 开发管理 → 服务器域名：request 合法域名添加该域名
3. 小程序体验版/发布前在开发者工具勾选「上传代码时自动补全 project.config」等常规配置
4. 后端网关 `Casdoor.Endpoint` 可指向云 SaaS（如 `https://door.casdoor.com`），其余无需改动

## 接口约定

后端所有接口**统一响应体**：`{code, msg, data}`

- `code=0` 成功，业务数据在 `data`；`code!=0` 失败，`msg` 为错误信息
- 401 未登录：HTTP 401 + 空 body（本小程序 request 层会清登录态并跳回登录页）
- 响应头 `request_id`（= trace-id），可查全链路日志

| 接口 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/user/mp/login` | POST | 公开 | `{code, username?, avatar?}` → `data: {accessToken, accessExpire, userId, casdoorName}` |
| `/api/user/userinfo` | POST | Bearer token | `data: {id, name, gender, mobile}` |

错误处理：401 自动清理 token 并跳回登录页；其余错误 toast 展示后端 message。

## 常见问题

- **登录失败 `invalid code`**：code 是一次性的（5 分钟有效），wx.login 每次登录都要重新调用；模拟器/真机 code 均有效
- **请求被拦截（域名不合法）**：确认已勾选「不校验合法域名」，且 baseUrl 为 `http://localhost:8888`
- **`request:fail` 网络异常**：确认后端已 `docker compose up -d` 且网关健康（`curl http://localhost:8888/api/user/mp/login`）
- **头像/昵称为临时路径**：`chooseAvatar` 返回本地临时文件路径，生产需先上传到对象存储再传 URL 给后端
