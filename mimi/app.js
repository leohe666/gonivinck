// ==================== 小程序入口 ====================
const auth = require('./utils/auth')
const { setUnauthorizedHandler } = require('./utils/request')

App({
  globalData: {
    token: null,
    userId: null,
    casdoorName: null
  },

  onLaunch() {
    // 注册 401 统一处理：token 失效时回到登录页
    setUnauthorizedHandler(() => {
      wx.reLaunch({ url: '/pages/login/index' })
    })

    // 静默登录：已有 token 跳过；没有则静默换取（不弹窗打扰）
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
