// ==================== 请求封装 ====================
// 参考历史项目 src/api/request.js（uni.request Promise 封装 + 柯里化工厂），
// 升级为原生小程序 wx.request：token 自动注入、401 统一处理、loading/错误提示收敛

const config = require('../config/index')

// 401（token 失效）回调，由 app.js 注册：清登录态并跳转登录页
let onUnauthorized = null

/**
 * 通用请求
 * @param {Object} options
 * @param {string}  options.url      接口路径，如 '/api/user/mp/login'
 * @param {string}  [options.method='POST']
 * @param {Object}  [options.data={}]
 * @param {boolean} [options.auth=true]  是否自动携带 Authorization: Bearer token
 * @param {boolean} [options.loading=true] 是否显示全局 loading
 * @returns {Promise<Object>} 解析为接口返回的 JSON
 */
function request(options) {
  const { url, method = 'POST', data = {}, auth = true, loading = true } = options

  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    if (auth) {
      const token = wx.getStorageSync(config.storageKeys.token)
      if (token) {
        header.Authorization = 'Bearer ' + token
      }
    }

    if (loading) {
      wx.showLoading({ title: '加载中...', mask: true })
    }

    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      header,
      timeout: 15000,
      success(res) {
        // 后端所有接口统一响应体：{code, msg, data}
        //  code=0 成功（data 为业务数据）；code!=0 业务失败（HTTP 2xx 时也视为失败）
        if (res.statusCode === 200) {
          const body = res.data
          if (body && typeof body === 'object' && 'code' in body) {
            if (body.code === 0) {
              resolve(body.data)
              return
            }
            // 业务失败（code != 0）
            const msg = body.msg || '请求失败'
            wx.showToast({ title: String(msg).slice(0, 30), icon: 'none' })
            reject(body)
            return
          }
          resolve(body)
          return
        }
        if (res.statusCode === 401) {
          // token 失效：清理登录态并通知跳转
          clearAuth()
          if (onUnauthorized) onUnauthorized()
          reject({ code: 401, message: '登录已过期，请重新登录' })
          return
        }
        // 非 2xx 错误：统一响应体 {code,msg,data:null}（或历史纯文本错误）
        const body = res.data
        const msg = (body && (body.msg || body.message || body.desc)) ||
          (typeof body === 'string' ? body : '') ||
          '请求失败 (' + res.statusCode + ')'
        wx.showToast({ title: String(msg).slice(0, 30), icon: 'none' })
        reject(body || { code: res.statusCode, message: msg })
      },
      fail(err) {
        wx.showToast({ title: '网络异常，请检查后端是否启动', icon: 'none' })
        reject(err)
      },
      complete() {
        if (loading) wx.hideLoading()
      }
    })
  })
}

function clearAuth() {
  const keys = config.storageKeys
  wx.removeStorageSync(keys.token)
  wx.removeStorageSync(keys.accessExpire)
  wx.removeStorageSync(keys.userId)
  wx.removeStorageSync(keys.casdoorId)
  wx.removeStorageSync(keys.casdoorName)
  wx.removeStorageSync(keys.mobile)
  wx.removeStorageSync(keys.userInfo)
}

module.exports = {
  request,
  clearAuth,
  setUnauthorizedHandler(fn) {
    onUnauthorized = fn
  }
}
