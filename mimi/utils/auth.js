// ==================== 登录态管理 ====================
// 参考历史项目 src/store/index.js（token 全局状态），升级为 storage + globalData 双缓存：
//  - storage 持久化（冷启动可恢复）
//  - app.globalData 热态缓存（避免频繁读 storage）
// 登录链路：
//   wx.login() → code + phoneCode → POST /api/user/mp/login
//   → 后端转交 Casdoor（真实微信凭据）→ 换取手机号并写回 Casdoor → 签发商城 JWT
//   → 返回 {accessToken, accessExpire, userId, casdoorId, casdoorName, mobile}

const config = require('../config/index')
const { request } = require('./request')

const KEYS = config.storageKeys

/**
 * 微信小程序登录（核心流程）
 * @param {Object} extra 可选：{username: 微信昵称, avatar: 头像URL, phoneCode: 手机号授权一次性 code（真实链路必填，后端换取手机号）}
 * @returns {Promise<{accessToken, accessExpire, userId, casdoorId, casdoorName, mobile}>}
 */
function wxLogin(extra = {}) {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          reject(new Error('wx.login 未返回 code'))
          return
        }
        request({
          url: '/api/user/mp/login',
          data: Object.assign({ code: res.code, merchantId: config.merchantId }, extra),
          loading: false
        })
          .then((data) => {
            if (!data || !data.accessToken) {
              reject(new Error('登录失败：' + JSON.stringify(data)))
              return
            }
            saveAuth(data)
            resolve(data)
          })
          .catch(reject)
      },
      fail(err) {
        reject(new Error('wx.login 调用失败：' + (err.errMsg || JSON.stringify(err))))
      }
    })
  })
}

/**
 * 静默恢复登录态（app 启动时调用）：
 * 真实链路手机号为必填（wxLogin 必须携带 phoneCode），无法在后台静默完成首次登录；
 * 因此仅当已有本地 token 时恢复登录态，无 token 时返回未登录，由登录页引导用户授权手机号。
 */
function silentLogin() {
  const token = wx.getStorageSync(KEYS.token)
  if (token) {
    return Promise.resolve({ already: true, accessToken: token })
  }
  return Promise.resolve({ already: false })
}

/** 保存登录态（storage + globalData） */
function saveAuth(data) {
  wx.setStorageSync(KEYS.token, data.accessToken)
  wx.setStorageSync(KEYS.accessExpire, data.accessExpire)
  wx.setStorageSync(KEYS.userId, data.userId)
  wx.setStorageSync(KEYS.casdoorId, data.casdoorId)
  wx.setStorageSync(KEYS.casdoorName, data.casdoorName)
  if (data.mobile) {
    wx.setStorageSync(KEYS.mobile, data.mobile)
  }
  const app = getApp()
  if (app) {
    app.globalData.token = data.accessToken
    app.globalData.userId = data.userId
    app.globalData.casdoorId = data.casdoorId
    app.globalData.casdoorName = data.casdoorName
    app.globalData.mobile = data.mobile || ''
  }
}

/** 退出登录：清空本地登录态（Casdoor 侧用户保留，下次登录自动复用） */
function logout() {
  const keys = config.storageKeys
  wx.removeStorageSync(keys.token)
  wx.removeStorageSync(keys.accessExpire)
  wx.removeStorageSync(keys.userId)
  wx.removeStorageSync(keys.casdoorId)
  wx.removeStorageSync(keys.casdoorName)
  wx.removeStorageSync(keys.mobile)
  wx.removeStorageSync(keys.userInfo)
  const app = getApp()
  if (app) {
    app.globalData.token = null
    app.globalData.userId = null
    app.globalData.casdoorId = null
    app.globalData.casdoorName = null
    app.globalData.mobile = null
  }
}

/** 当前是否已登录 */
function isLoggedIn() {
  return !!wx.getStorageSync(KEYS.token)
}

module.exports = { wxLogin, silentLogin, logout, isLoggedIn, saveAuth }
