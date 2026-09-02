// ==================== 接口定义 ====================
// 参考历史项目 src/api/index.js（接口函数聚合），升级为模块化导出

const { request } = require('../utils/request')

// ---------- 用户 ----------
// 微信小程序登录（Casdoor SaaS）：公开接口，无需 token
// 入参: {code: wx.login() 临时凭证, phoneCode: getPhoneNumber 授权一次性 code（必填，后端换取手机号并写回 Casdoor）, username?: 昵称, avatar?: 头像URL}
// 出参: {accessToken, accessExpire, userId, casdoorId, casdoorName, mobile}
exports.mpLogin = (data) => request({ url: '/api/user/mp/login', data, loading: false })

// 用户信息（需要 token）：{id, name, gender, mobile}
exports.getUserInfo = () => request({ url: '/api/user/userinfo', data: {} })
