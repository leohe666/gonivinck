// ==================== 登录态管理 ====================
// 参考历史项目 src/store/index.js（token 全局状态），升级为 storage + globalData 双缓存：
//  - storage 持久化（冷启动可恢复）
//  - app.globalData 热态缓存（避免频繁读 storage）
// 登录链路：
//   wx.login() → code → POST /api/user/mp/login {code, username?, avatar?}
//   → 后端转交 Casdoor（真实微信凭据）→ 签发商城 JWT
//   → 返回 {accessToken, accessExpire, userId, casdoorName}

const config = require('../config/index')
const { request } = require('./request')

const KEYS = config.storageKeys

/**
 * 微信小程序登录（核心流程）
 * @param {Object} extra 可选：{username: 微信昵称, avatar: 头像URL}，用于更新 Casdoor 用户资料
 * @returns {Promise<{accessToken, accessExpire, userId, casdoorName}>}
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
          data: Object.assign({ code: res.code }, extra),
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
 * 静默登录（app 启动时调用）：
 * 已有有效 token 直接跳过，否则静默走 wx.login 流程，不打扰用户
 */
function silentLogin() {
  const token = wx.getStorageSync(KEYS.token)
  if (token) {
    return Promise.resolve({ already: true, accessToken: token })
  }
  return wxLogin()
}

/** 保存登录态（storage + globalData） */
function saveAuth(data) {
  wx.setStorageSync(KEYS.token, data.accessToken)
  wx.setStorageSync(KEYS.accessExpire, data.accessExpire)
  wx.setStorageSync(KEYS.userId, data.userId)
  wx.setStorageSync(KEYS.casdoorName, data.casdoorName)
  const app = getApp()
  if (app) {
    app.globalData.token = data.accessToken
    app.globalData.userId = data.userId
    app.globalData.casdoorName = data.casdoorName
  }
}

/** 退出登录：清空本地登录态（Casdoor 侧用户保留，下次登录自动复用） */
function logout() {
  const keys = config.storageKeys
  wx.removeStorageSync(keys.token)
  wx.removeStorageSync(keys.accessExpire)
  wx.removeStorageSync(keys.userId)
  wx.removeStorageSync(keys.casdoorName)
  wx.removeStorageSync(keys.userInfo)
  const app = getApp()
  if (app) {
    app.globalData.token = null
    app.globalData.userId = null
    app.globalData.casdoorName = null
  }
}

/** 当前是否已登录 */
function isLoggedIn() {
  return !!wx.getStorageSync(KEYS.token)
}

module.exports = { wxLogin, silentLogin, logout, isLoggedIn, saveAuth }
