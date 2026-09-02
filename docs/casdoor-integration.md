# Casdoor 集成（SaaS 模式 + 微信小程序登录）

本项目已集成 [Casdoor](https://casdoor.org/)（开源身份认证平台），采用 **SaaS 模式**：

- **一个 Casdoor 实例 = 一个多租户身份平台**：每个租户（客户）在 Casdoor 里是一个 `organization`。
- 本商城当前使用租户 `mall`（organization = `mall`），应用 `mall-app`。
- 商城自身不存第三方密码/凭据，只存一个 `casdoor_id` 映射（Casdoor 用户 Id，稳定唯一），用户身份统一由 Casdoor 管理。

登录链路（微信小程序）：

```
微信小程序 (wx.login → code + getPhoneNumber → phoneCode)
   │  POST /api/user/mp/login {code, phoneCode}
   ▼
Go-Zero 后端 (user.api / gateway)
   │  ① POST {CASDOOR}/api/login/oauth/access_token
   │     表单: tag=wechat_miniprogram&client_id=...&code=...
   ▼
Casdoor ──② jscode2session──▶ 微信服务器 (换 openid，自动创建/更新 Casdoor 用户)
   │  ③ 返回 Casdoor JWT (RS256，应用证书签名)
   ▼
Go-Zero 后端 ④ 用证书公钥校验 JWT → 取稳定关联键 user.id + name（形如 wechat-{openid}）
   │  ⑤ 用 phoneCode 调微信 getuserphonenumber 换取真实手机号（common/wechatx）
   │  ⑥ 用用户 JWT 把手机号写回 Casdoor 用户信息（用户自更新，无 clientSecret）
   │  ⑦ 落地本地 user 表（首次自动注册，casdoor_id 关联，mobile=真实手机号）→ 签发商城自身 JWT
   ▼
返回 {accessToken, accessExpire, userId, casdoorId, casdoorName, mobile}
```

> **手机号必填**：登录请求必须携带 `phoneCode`（微信手机号快速验证组件返回的一次性 code），
> 后端据此换取真实手机号写入 `user.mobile`，并同步写回 Casdoor 用户信息（`phone`）。未授权手机号直接拒绝登录。

---

## 一、新增/改动清单

| 位置 | 说明 |
|------|------|
| `docker-compose.yml` | 新增 `casdoor` 服务（`casbin/casdoor:3.163.0`，宿主机端口 **8443**，数据持久化 `data/casdoor`） |
| `casdoor/init_data.json` | Casdoor 首次启动自动导入：租户 `mall`、应用 `mall-app`、微信小程序 Provider、JWT 证书 `cert-mall`、演示用户 `mall-user` |
| `casdoor/cert-mall.{crt,key}` | 为 Casdoor JWT 签名生成的 RSA 证书（私钥在 Casdoor 内，公钥给后端校验） |
| `code/common/casdoorx/` | 公共包：`ExchangeMiniProgramCode`（code 换 token）、`ParseToken`（JWT 校验，取 `id` 关联键）、`UpdateUserPhone`（用户 JWT 自更新手机号） |
| `code/service/user/rpc/` | `user.proto` `LoginByCasdoor` RPC（按 `casdoor_id` 查询/自动创建本地用户）；`user` 表以 `casdoor_id` 为唯一关联键 |
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
  "casdoorId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "casdoorName": "wechat-{微信openid}",
  "mobile": "138****8000"
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
        phoneCode: phoneCode,      // getPhoneNumber 授权一次性 code（必填，换取手机号）
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

## 三、全真实链路（无 Mock）

项目已**移除一切 mock/联调分支**（`MockMiniProgram`、`MockOpenId`、假手机号派生等均已删除），
登录链路的每一环都是真实调用：

- `wx.login()` code → Casdoor → 微信 `jscode2session`（换 openid，自动创建/更新 Casdoor 用户）
- `getPhoneNumber` phoneCode → 微信 `getuserphonenumber`（换真实手机号）
- 手机号写回 Casdoor：用小程序用户刚签发的 Casdoor JWT 调 `PUT /api/update-user`（`phone` 字段），
  以用户自身身份自更新，后端无需保存任何 clientSecret

当前仓库状态：**真实微信凭据已配置**（AppID `wxf76e1101f4b99b6d` 已写入 Casdoor Provider
`admin/provider-wechat-mp` 与 `casdoor/init_data.json`）。网关已实测：假 code 返回 `invalid code`
（微信侧错误，证明链路真实打通）。

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
| 登录报 `invalid appid` | 微信 Provider 还是占位凭据，需填真实 AppID/AppSecret |
| `casdoor endpoint not configured` | `Casdoor.Endpoint` 为空，检查 yaml |
| 证书读取失败日志 | `Casdoor.Certificate` 路径相对 `code/` 目录（容器内 `/usr/src/code`） |
| Casdoor 控制台登录不上 | `docker compose logs casdoor` 看是否 panic；`data/casdoor` 数据损坏时可删除后重启（会重新导入 init_data.json） |
| 修改 init_data.json 不生效 | 仅首次启动导入（`initDataNewOnly=true`）；已存在对象需在控制台删除或手工改 |
