# Casdoor 集成（SaaS 模式 + 微信小程序登录）

本项目已集成 [Casdoor](https://casdoor.org/)（开源身份认证平台），采用 **SaaS 模式**：

- **一个 Casdoor 实例 = 一个多租户身份平台**：每个租户（客户）在 Casdoor 里是一个 `organization`。
- 本商城当前使用租户 `mall`（organization = `mall`），应用 `mall-app`。
- 商城自身不存第三方密码/凭据，只存一个 `casdoor_name` 映射（微信 openid 等），用户身份统一由 Casdoor 管理。

登录链路（微信小程序）：

```
微信小程序 (wx.login → code)
   │  POST /api/user/mp/login {code}
   ▼
Go-Zero 后端 (user.api / gateway)
   │  ① POST {CASDOOR}/api/login/oauth/access_token
   │     表单: tag=wechat_miniprogram&client_id=...&code=...
   ▼
Casdoor ──② jscode2session──▶ 微信服务器 (换 openid，自动创建/更新 Casdoor 用户)
   │  ③ 返回 Casdoor JWT (RS256，应用证书签名)
   ▼
Go-Zero 后端 ④ 用证书公钥校验 JWT → 取 user.name（形如 wechat-{openid}）
   │  ⑤ 落地本地 user 表（首次自动注册）→ 签发商城自身 JWT
   ▼
返回 {accessToken, accessExpire, userId, casdoorName}
```

---

## 一、新增/改动清单

| 位置 | 说明 |
|------|------|
| `docker-compose.yml` | 新增 `casdoor` 服务（`casbin/casdoor:3.163.0`，宿主机端口 **8443**，数据持久化 `data/casdoor`） |
| `casdoor/init_data.json` | Casdoor 首次启动自动导入：租户 `mall`、应用 `mall-app`、微信小程序 Provider、JWT 证书 `cert-mall`、演示用户 `mall-user` |
| `casdoor/cert-mall.{crt,key}` | 为 Casdoor JWT 签名生成的 RSA 证书（私钥在 Casdoor 内，公钥给后端校验） |
| `code/common/casdoorx/` | 新增公共包：`ExchangeMiniProgramCode`（code 换 token）、`ParseToken`（JWT 校验）、`MockOpenId`（本地模拟） |
| `code/service/user/rpc/` | `user.proto` 新增 `LoginByCasdoor` RPC（按 `casdoor_name` 查询/自动创建本地用户）；`user` 表新增 `casdoor_name` 列 |
| `code/service/gateway/api/` | 网关 8888 新增 `POST /api/user/mp/login` + `Casdoor` 配置（唯一 API 入口；旧 user/product/order/pay API 源码已删除，端口全部下线） |
| `mimi/` | 微信小程序项目（DevTools 直接导入，真实 AppID 已配置，登录流程走通） |
| `go-zero-mall.apipost.postman_collection.json` | 合并后的统一集合：按 用户/商品/订单/支付 分组，全部走 8888，含真实响应 |

## 二、快速使用

### 1. 启动 Casdoor

```bash
docker compose up -d casdoor      # 首次会自动导入 init_data.json
# 控制台：http://localhost:8443   账号 admin / 123（built-in 组织）
```

初始化完成后，Casdoor 里已有：

- 组织（租户）：`mall`
- 应用：`mall-app`（clientId `mall-client-id`，clientSecret `mall-client-secret`）
- Provider：`provider-wechat-mp`（类型 `WeChatMiniProgram`，已配置真实微信 AppID/AppSecret）
- 证书：`mall/cert-mall`（RS256）
- 演示用户：`mall/mall-user` / `123456`

### 2. 调用小程序登录接口

```bash
# 统一网关（唯一入口 8888）
curl -X POST http://localhost:8888/api/user/mp/login \
  -H 'Content-Type: application/json' \
  -d '{"code":"wx-login-code-001","username":"微信用户","avatar":"https://..."}'
```

响应示例（真实 code 登录成功时；本地无真实 code 时返回 `casdoor error: ... invalid code`，属预期）：

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "accessExpire": 1788175243,
  "userId": 18,
  "casdoorName": "wechat-{微信openid}"
}
```

拿到的 `accessToken` 可直接访问 `POST /api/user/userinfo` 等受保护接口：

```bash
curl -X POST http://localhost:8888/api/user/userinfo -H "Authorization: Bearer <accessToken>"
```

### 3. 小程序端代码示例

```js
// 微信小程序
wx.login({
  success: (res) => {
    wx.request({
      url: 'https://你的后端/api/user/mp/login',
      method: 'POST',
      data: {
        code: res.code,            // wx.login() 的临时凭证
        username: '微信昵称',       // 可选
        avatar: 'https://头像url'  // 可选
      },
      header: { 'content-type': 'application/json' },
      success: (r) => {
        // r.data.accessToken 即商城 JWT，后续请求带上 Authorization: Bearer
      }
    });
  }
});
```

## 三、本地 Mock 模式与生产切换

`Casdoor.MockMiniProgram`（`code/service/gateway/api/etc/gateway.yaml`，旧 user.api 已下线）：

- **本地开发（默认 true）**：没有真实微信 AppID/Secret 也能跑通整个登录流程。`code` 会被确定性映射成 openid（`mock-*`），同一个 code 永远登录同一个用户，便于重复测试。
- **真实模式（当前已启用 false）**：走真实链路——后端把 code 交给 Casdoor，Casdoor 用微信小程序 **AppID/AppSecret** 调 `jscode2session` 换 openid。

当前仓库状态：**真实微信凭据已配置**（AppID `wxf76e1101f4b99b6d` 已写入 Casdoor Provider `admin/provider-wechat-mp` 与 `casdoor/init_data.json`），`MockMiniProgram: false`，网关已实测：假 code 返回 `invalid code`（微信侧错误，证明链路真实打通）。如需切回 Mock（如无网环境联调），把 `MockMiniProgram` 改回 `true` 并重启网关即可。

配套小程序项目见 **`mimi/`**（微信开发者工具直接导入，`project.config.json` 已内置同一 AppID）。

## 四、其他入口（验证 Casdoor 集成本身）

用演示用户走 Casdoor 密码授权换取 **Casdoor 签发的 JWT**（可用于验证 `ParseToken` 校验链路）：

```bash
curl -X POST http://localhost:8443/api/login/oauth/access_token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&client_id=mall-client-id&client_secret=mall-client-secret&username=mall-user&password=123456'
```

返回的 `access_token` 是 Casdoor JWT（RS256，`mall/cert-mall` 签名），后端可用同样的证书公钥校验——这正是小程序登录中后端校验的那一步。

## 五、SaaS 模式：如何新增租户

不需要改业务代码，在 Casdoor 控制台操作：

1. 组织 → 新增组织（如 `tenant-b`），会自动获得默认应用与证书；
2. 应用 → 为 `tenant-b` 建应用，获取新的 `clientId/clientSecret`，绑定微信 Provider；
3. 在商城的 `user.yaml`/`gateway.yaml` 中把 `Casdoor.OrganizationName/ApplicationName/ClientId/ClientSecret/Certificate` 换成新租户配置，重启即可。

证书导出（换租户/换证书时用）：

```bash
# 浏览器登录 Casdoor 后
curl -b cookies.txt "http://localhost:8443/api/get-cert?id=mall/cert-mall" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['certificate'])" > casdoor-cert.pem
```

## 六、故障排查

| 现象 | 原因/处理 |
|------|----------|
| 登录报 `invalid appid` | 微信 Provider 还是占位凭据，需填真实 AppID/AppSecret（或开 Mock） |
| `casdoor endpoint not configured` | `Casdoor.Endpoint` 为空，检查 yaml |
| 证书读取失败日志 | `Casdoor.Certificate` 路径相对 `code/` 目录（容器内 `/usr/src/code`） |
| Casdoor 控制台登录不上 | `docker compose logs casdoor` 看是否 panic；`data/casdoor` 数据损坏时可删除后重启（会重新导入 init_data.json） |
| 修改 init_data.json 不生效 | 仅首次启动导入（`initDataNewOnly=true`）；已存在对象需在控制台删除或手工改 |
