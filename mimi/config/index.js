// ==================== 全局配置 ====================
// 参考历史项目 src/config.js，升级为集中配置 + 环境注释
module.exports = {
  // 后端统一网关地址（唯一入口 8888，旧 API 端口已下线）
  //  本地开发: http://localhost:8888
  //    - 微信开发者工具 → 详情 → 本地设置 → 勾选“不校验合法域名、web-view（业务域名）、
  //      TLS 版本以及 HTTPS 证书”，否则无法请求 http 域名
  //  生产环境: 必须是 https 域名，且在小程序后台
  //    「开发管理 → 开发设置 → 服务器域名 → request 合法域名」里配置
  baseUrl: 'http://localhost:8888',

  // 商户 Id（SaaS 多租户标识，对应后端 merchant 表；每个商户独立 Casdoor 组织 + 微信凭据）
  // 登录请求会自动附带该字段，后端按商户路由 Casdoor/微信配置（见 docs/saas-multi-tenant-login-design.md）
  merchantId: 1,

  // 小程序 AppID（与 project.config.json 的 appid 保持一致）
  // 后端 Casdoor 的微信小程序 Provider (admin/provider-wechat-mp) 使用同一组
  // AppID/AppSecret，见 docs/casdoor-integration.md
  appid: 'wxf76e1101f4b99b6d',

  // 版本号（可随发布更新）
  version: '1.0.0',

  // 登录态缓存 key
  storageKeys: {
    token: 'mall_token',
    accessExpire: 'mall_access_expire',
    userId: 'mall_user_id',
    casdoorId: 'mall_casdoor_id',
    casdoorName: 'mall_casdoor_name',
    mobile: 'mall_mobile',
    userInfo: 'mall_user_info'
  }
}
