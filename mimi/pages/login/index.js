// 登录页：微信一键登录（Casdoor SaaS 链路）
// 参考历史项目（src/modules/qiandao/pages/index/index.vue 的 wx.login 流程），
// 升级：头像/昵称改用微信新版组件（chooseAvatar + type=nickname），
// 替代已废弃的 getUserProfile 授权弹窗
const auth = require('../../utils/auth')

Page({
  data: {
    loading: false,
    nickname: '',
    avatar: '',
    result: null, // 登录成功返回 {accessToken, accessExpire, userId, casdoorName}
    error: '',
    tokenPreview: ''
  },

  onShow() {
    // 启动时 app.js 已静默登录过：若已有 token 直接进首页
    if (auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatar: e.detail.avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  onLogin() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '', result: null })

    // 可选资料：昵称/头像（微信临时路径，真实生产需先上传到自己的文件服务）
    const extra = {}
    if (this.data.nickname) extra.username = this.data.nickname
    if (this.data.avatar) extra.avatar = this.data.avatar

    auth
      .wxLogin(extra)
      .then((data) => {
        this.setData({
          loading: false,
          result: data,
          tokenPreview: data.accessToken ? data.accessToken.slice(0, 24) + '...' : ''
        })
        // 登录成功，短暂展示结果后进入首页
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' })
        }, 1500)
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || '登录失败，请检查后端服务'
        })
      })
  }
})
