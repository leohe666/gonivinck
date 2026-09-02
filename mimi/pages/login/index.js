// 登录页：微信一键登录（Casdoor SaaS 链路）+ 手机号快速验证（必填真实链路）
// 参考历史项目（src/modules/qiandao/pages/index/index.vue 的 wx.login 流程），
// 升级：
//   - 头像/昵称改用微信新版组件（chooseAvatar + type=nickname），替代已废弃的 getUserProfile
//   - 手机号必填：登录按钮使用 open-type="getPhoneNumber"，
//     用户授权后拿到一次性 phoneCode，随登录请求一并提交给后端：
//       后端 → Casdoor 换 openid + 微信 getPhoneNumber 换手机号 → 写回 Casdoor 用户 → 落地商城用户
const auth = require('../../utils/auth')

Page({
  data: {
    loading: false,
    nickname: '',
    avatar: '',
    result: null, // 登录成功返回 {accessToken, accessExpire, userId, casdoorId, casdoorName, mobile}
    error: '',
    tokenPreview: ''
  },

  onShow() {
    // 启动时 app.js 已静默恢复登录态：若已有 token 直接进首页
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

  // 手机号快速验证回调（必填授权）：成功返回 e.detail.code，随登录请求提交给后端换取手机号
  onGetPhoneNumber(e) {
    if (this.data.loading) return

    const errMsg = (e.detail && e.detail.errMsg) || ''
    const phoneCode = e.detail && e.detail.code

    if (!phoneCode || errMsg.indexOf('ok') === -1) {
      this.setData({
        error: '需要授权手机号才能登录，请点击「微信授权手机号并登录」并允许授权'
      })
      return
    }

    // 授权成功：携带 phoneCode 走 wx.login 流程
    this.setData({ loading: true, error: '' })

    // 可选资料：昵称/头像（微信临时路径，真实生产需先上传到自己的文件服务）
    const extra = { phoneCode }
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
