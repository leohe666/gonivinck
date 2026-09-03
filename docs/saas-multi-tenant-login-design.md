# SaaS 多租户小程序登录设计方案

> 背景：商城将作为 **SaaS 系统** 服务多个商户（租户）。每个商户的小程序是**独立的小程序**（各自的微信 AppID/AppSecret），
> 登录时后端必须区分商户并路由到对应配置；微信凭据不能写入 `.env`、系统变量或任何提交到 git 的文件。

---

## 一、现状与问题

当前实现是**单商户**：

- `gateway.yaml` 里一份 `Casdoor` 配置（固定 `mall-client-id`）+ 一份 `Wechat` 配置（环境变量注入）
- `user` 表 `mobile`、`casdoor_id`（Casdoor 用户 Id）全局唯一索引，无商户维度
- 登录请求 `{code, phoneCode}` 不带商户标识

SaaS 化后的三个必须解决：

1. **每商户一套微信凭据**，从哪来、存哪、怎么安全存；
2. **登录时如何区分商户**，把请求路由到该商户的配置；
3. **跨商户数据隔离**（同一手机号 / 同一微信 openid 在不同商户下是不同用户）。

---

## 二、关键事实（已源码确认）

| 事实 | 出处 |
|------|------|
| Casdoor `GetOAuthToken` 按 `client_id` 查 application，再用该应用绑定的微信 Provider 做 jscode2session 换 openid | `object/token_oauth.go: GetWechatMiniProgramToken` |
| 每个 application 的 `Providers[]` 里可挂**自己的** `WeChatMiniProgram` Provider（内含商户自己的 AppID/AppSecret） | `object/application.go: Providers`、`object/provider.go: GetWechatMiniProgramProvider` |
| **Casdoor 微信 IDP 只有 `GetSessionByCode`（换 openid），没有 getuserphonenumber（手机号）能力** | `idp/wechat_miniprogram.go` |
| `casdoorsdk.Client` 是实例对象，`Client.ParseJwtToken` 按实例自己的证书校验；另提供全局 `ParseJwtToken`（包 `globalClient`） | casdoor-go-sdk v1.53.0 `jwt_global.go`, `jwt.go` |

**推论**：

- **认证（openid）链路可完全委托 Casdoor 多租户**：每个商户 = Casdoor 一个 `organization` + `application` + 微信 Provider。商城后端**不需要**知道微信 AppID/AppSecret，只需持该商户的 Casdoor `client_id`。
- **手机号链路必须商城后端自己做**：Casdoor 不支持，必须用商户微信凭据调 `wxa/business/getuserphonenumber`。**这部分凭据必须入商城库**（加密存储），不能放 `.env`/系统变量。

---

## 三、总体架构：两段凭据分离

```
                            ┌─────────────────────────────────────────────┐
                            │              商城后端（网关 8888）               │
                            │                                               │
 商户A小程序 ──code+phoneCode│  ┌──────────────┐    ┌─────────────────────┐  │
  POST /api/user/mp/login    │  │ ① 查 merchant │    │ ③ 手机号换取（自调微信）│  │
   {merchantId:A, code,      │  │   表          │    │  wx_app_id/secret    │  │
    phoneCode}               │  └──────┬───────┘    │  （商户库，AES加密）   │  │
                            │         │            └──────────┬──────────┘  │
                            │         │ ② client_id(A的)      │             │
                            │         ▼                       │             │
                            │  ┌────────────────────┐        │             │
                            │  │ Casdoor 实例（SaaS） │        │             │
                            │  │ org/app(商户A)      │        │             │
                            │  │  └ 微信Provider     │◀───────┘             │
                            │  │    (A的AppID/Secret)│    （同一组凭据，但    │
                            │  │     jscode2session │     存在两个地方）      │
                            │  └────────────────────┘                       │
                            └─────────────────────────────────────────────┘
```

- **链路 A（openid）**：凭据存 **Casdoor**（`organization` + `application` + `Provider`），商城后端只存/传 `client_id`。
- **链路 B（手机号）**：凭据存 **商城 `merchant` 表**（AppSecret AES-GCM 加密），网关运行时解密调用。
- **手机号写回 Casdoor**：换取到真实手机号后，商城后端用该用户刚签发的 Casdoor JWT 调 `PUT /api/update-user`（或 SDK `UpdateUser`）把 `phone` 写回 Casdoor 用户记录（自更新，无需额外管理凭据）；失败降级为仅写本地 `user` 表并记日志，可后续回补（见第五节）。

> 为什么手机号凭据不能也放 Casdoor：Casdoor 3.163.0 的微信 IDP 未实现 `getuserphonenumber`，且把 access_token 开放给第三方缺乏安全边界。等 Casdoor 官方支持后，可收敛为单点存储。

---

## 四、数据模型

### 4.1 新增 `merchant` 表（商户/租户配置）

```sql
CREATE TABLE `merchant`
(
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`             VARCHAR(128) NOT NULL DEFAULT '' COMMENT '商户名称',
    `status`           TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态: 1启用 0停用',
    -- Casdoor 租户段（openid 链路；client_secret 不需要，小程序登录不带 secret）
    `casdoor_endpoint` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '该商户的 Casdoor 实例地址',
    `casdoor_client_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '该商户在 Casdoor 的应用 clientId',
    `casdoor_org`      VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Casdoor organization（租户名）',
    `casdoor_app`      VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Casdoor application 名',
    `casdoor_cert_pem` TEXT                             COMMENT '该商户 Casdoor 应用证书公钥（校验 JWT）',
    -- 微信小程序段（手机号链路；secret 加密）
    `wx_app_id`        VARCHAR(64) NOT NULL DEFAULT '' COMMENT '微信小程序 AppID（公开）',
    `wx_app_secret_enc` VARCHAR(512) NOT NULL DEFAULT '' COMMENT '微信 AppSecret（AES-GCM 加密后）',
    `create_time`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_casdoor_client_id` (`casdoor_client_id`),
    UNIQUE KEY `idx_wx_app_id` (`wx_app_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
```

### 4.2 `user` 表改造（租户隔离）

```sql
ALTER TABLE `user`
    ADD COLUMN `merchant_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '所属商户(merchant.id), 0=历史存量默认商户' AFTER `id`,
    DROP INDEX `idx_mobile_unique`,
    DROP INDEX `idx_casdoor_id`,
    ADD UNIQUE KEY `idx_merchant_mobile` (`merchant_id`, `mobile`),
    ADD UNIQUE KEY `idx_merchant_casdoor` (`merchant_id`, `casdoor_id`);
```

- 同一手机号在不同商户下可各有一个账号（联合唯一）；同一商户内唯一。
- 微信 openid 本来就按 AppID 隔离（不同小程序 openid 不同），`(merchant_id, casdoor_id)` 联合唯一兜底。

### 4.3 商户开通流程（运营侧）

1. Casdoor 控制台：新建 `organization`（如 `merchantA`）→ 应用（拿 `clientId`、生成证书）→ 挂微信 Provider（填商户自己的 AppID/AppSecret）
2. 商城侧：`INSERT INTO merchant ...`（`wx_app_secret` 用 AES 加密后写入 `wx_app_secret_enc`）
3. 生成小程序分包/独立小程序：`config/index.js` 配自己的 `merchantId` + `appid`

---

## 五、登录时序（多商户区分）

```
商户A小程序                         网关(8888)
  wx.login() → code ────────────────┐
  getPhoneNumber → phoneCode ───────┤ POST /api/user/mp/login
                                   │   body: {merchantId: "A", code, phoneCode}
                                   ▼
                              ① 查 merchant 表（merchantId=A）
                                   │  得到 casdoor_client_id / cert_pem / wx_app_id / wx_secret_enc
                                   ▼
                              ② 调 Casdoor /api/login/oauth/access_token
                                   │  form: tag=wechat_miniprogram&client_id=<A的>&code=...
                                   │  Casdoor 用 A 绑定的微信 Provider 做 jscode2session → A 的 JWT
                                   ▼
                              ③ casdoorsdk.NewClient(A 的 endpoint/clientId/证书).ParseJwtToken
                                   │  （每商户一个 Client 实例，各自证书；不再用全局 InitConfig）
                                   ▼
                              ④ 解密 A 的 wx_secret → 调微信 getuserphonenumber(phoneCode) → 手机号
                                   ▼
                              ④½ 用 ③ 的 Casdoor JWT 调 update-user 把 phone 写回 Casdoor 用户
                                   │  （自更新；失败则降级仅写本地，记日志待回补）
                                   ▼
                              ⑤ userRpc.LoginByCasdoor({MerchantId:A, CasdoorId, CasdoorName, Mobile})
                                   │  user 表按 (merchant_id, casdoor_id) 查/建
                                   ▼
                              ⑥ 签发商城 JWT（claims 里带 merchant_id，后续接口按商户隔离）
                                   ▼
                            返回 {accessToken, userId, casdoorId, casdoorName, mobile}
```

> **手机号写回 Casdoor 的授权方式**：Casdoor 管理接口 `PUT /api/update-user?id={owner}/{name}` 接受 `Authorization: Bearer <JWT>`，且允许用户更新**自己**的记录（`isAdminOrSelf`，Casdoor 个人资料页同款接口）。因此直接用 ③ 拿到的小程序用户 JWT 即可，商城后端**不需要**保存任何商户的 Casdoor client_secret 或管理账号。
>
> **Casdoor 3.163.0 实测踩坑（2026-09-03 已解决）**：写回有两个隐藏校验，缺一不可：
> 1. **body 必须携带稳定 `Id`（UUID）**：`ID` 字段在组织 accountItems 里 modifyRule=Immutable，SDK `UpdateUserForColumns` 会把整个 user 序列化进 body——若 body 中 `Id` 缺失或与目标不一致，服务端对比失败报 `The ID is immutable.`。
> 2. **组织 accountItems 中 `Country code` 的 modifyRule 需为 `Self`**（默认是 `Admin`）：微信自动创建的用户 `countryCode` 为空，写 `phone` 时服务端归一化会连带写 `countryCode`，而 `Country code=Admin` 会拒绝普通用户 token（报 `Only admin can modify the Country code.` / `Phone number is invalid`）。已在 Casdoor 控制台将 mall 组织该字段改为 `Self`。
>
> 若目标 Casdoor 版本仍禁用 self-update（无法改组织配置时），再退化为「商户 application 开 `client_credentials`，后端持其 client_secret（加密入库）换管理 token」方案（注意该 token 权限更大，需控制）。

## 六、微信凭据安全

| 项 | 方案 |
|----|------|
| 存储 | `merchant.wx_app_secret_enc`，入库前 **AES-256-GCM** 加密（随机 nonce，密文 `nonce+ciphertext` base64） |
| 主密钥 | 单个部署主密钥，来自 **KMS**（生产）/ 本地密钥文件（开发，gitignore）——不是每家商户一个，而是加密所有商户 secret 的一把主密钥 |
| 内存缓存 | 网关按 `merchantId` 缓存解密后的凭据（带 TTL），避免每次解密；`wechatx` 的 access_token 缓存从全局单值改为 `map[appid]token` |
| 日志 | 手机号打印脱敏 `138****8000`；绝不打印 secret |
| git | `merchant` 表中无明文 secret；密钥文件 gitignore；仓库仅存 `pub_key` 类型的证书 |

## 七、改动清单（预估）

| 层 | 改动 |
|----|------|
| `code/service/user/model` | 新增 `merchant` 表 model；`user` 表加 `merchant_id`、联合唯一索引；`LoginByCasdoor` 按 `(merchant_id, casdoor_id)` 查/建 |
| `code/service/user/rpc/user.proto` | `LoginByCasdoorRequest`/`Response` 增加 `MerchantId` |
| `code/common/casdoorx` | `ExchangeMiniProgramCode` 改按传入的 `clientId` 请求（去掉写死）；`ParseToken` 改为 `NewClient(cfg).ParseJwtToken`（每商户证书）；新增 `UpdateUserPhone`（用用户 JWT 调 update-user 写回 phone） |
| `code/common/wechatx` | access_token 缓存改 `map[appid]`；`GetPhoneNumber(cfg)` 保持传参即可 |
| `code/common/merchantx`（新） | merchant 表读取 + AES 解密 + 缓存封装 |
| `code/service/gateway/api` | `MpLoginRequest` 加 `MerchantId`；`mploginlogic` 按商户组装两段调用 + 手机号写回 Casdoor；商城 JWT claims 带 `merchant_id`；移除 yaml 中 `Wechat` 段（改查库） |
| `mimi/` | `config/index.js` 加 `merchantId`；登录请求携带；README 说明多商户发布 |
| `casdoor/` | 多商户时新增 `organization/provider` 的部署化脚本/文档（init_data.json 目前单租户示例） |

## 八、关于"是否需要配置中心"

**不需要引入 Nacos/Consul 之类的配置中心。**

- 商户微信凭据是**业务数据**（随商户开通/停用增删改查、有审计），不是部署配置；放数据库表 + 管理 API 最合适。
- 唯一属于"配置"的是**主密钥**（KMS/密钥文件），它天然是单点、不走多租户。
- 配置中心解决的是"多环境动态下发"，与"每商户一份业务凭据"是两个问题；当前规模引入反而增加运维复杂度。

## 九、实现落地状态（2026-09-03）

- ✅ 数据库：`merchant` 表已建；`user` 表加 `merchant_id`/`casdoor_id` 列、`idx_merchant_mobile` 唯一、(merchant_id,casdoor_id) 索引；存量数据回填默认商户 1 + 真实 Casdoor UUID（mock 用户占位）。
- ✅ `user.proto`：`LoginByCasdoorRequest/Response` 加 `MerchantId`；新增 `GetMerchant` RPC（user rpc 内持有平台主密钥，解密后返回商户 Casdoor 段 + 微信明文凭据；网关不接触密钥）。
- ✅ `common/merchantx`（新）：AES-256-GCM 加解密 + 主密钥文件加载；`common/wechatx` access_token 缓存改 `map[appid]`（多商户隔离）。
- ✅ 网关：`MpLoginRequest` 加 `MerchantId`；`mploginlogic` 按 `merchantId` → `GetMerchant` → 用该商户 Casdoor clientId/证书换 openid、该商户微信凭据换手机号 → 以 (merchant_id, casdoor_id) 落地本地用户；yaml 中 Casdoor/Wechat 硬编码段已删除。
- ✅ 主密钥：`data/master.key`（64 hex，gitignored）→ docker-compose 只读挂载 `/data/master.key`，user rpc 经 `MERCHANT_MASTER_KEY_FILE` 读取。
- ✅ 前端：`mimi/config/index.js` 加 `merchantId: 1`，`auth.js wxLogin` 自动附带。
- ⏳ 待做：商户开通管理 API/脚本（写 merchant 表 + Casdoor organization/provider 创建）；商城 JWT claims 携带 merchant_id。

## 十、待确认决策点

1. **商户标识传递**：小程序请求带 `merchantId`（推荐，显式、与微信解耦），也可用 `wx_app_id` 反查（少一个字段但商户配置里 AppID 变更要联动）。→ 推荐 `merchantId`
2. **手机号唯一性**：按商户隔离（`(merchant_id, mobile)` 联合唯一，推荐）还是全局唯一（简单但不同商户同手机号冲突）。
3. **本期落地范围**：是否现在就实现完整多租户（merchant 表 + 多商户路由），还是先只把"凭据入库 + merchantId 路由"做出来、商家后台后续补？
