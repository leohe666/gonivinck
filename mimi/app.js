// ==================== 小程序入口 ====================
const auth = require('./utils/auth')
const { setUnauthorizedHandler } = require('./utils/request')

App({
  globalData: {
    token: null,
    userId: null,
    casdoorId: null,
    casdoorName: null,
    mobile: null
  },

  onLaunch() {
    // 注册 401 统一处理：token 失效时回到登录页
    setUnauthorizedHandler(() => {
      wx.reLaunch({ url: '/pages/login/index' })
    })

    // 已有 token 直接恢复登录态；无 token 时返回未登录，由登录页引导用户授权手机号完成首次登录。
    auth
      .silentLogin()
      .then((data) => {
        if (!data.already) {
          console.log('[app] 静默登录成功 userId=', data.userId)
        }
      })
      .catch((err) => {
        console.error('[app] 静默登录失败:', err.message)
      })
  }
})
