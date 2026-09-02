// 首页：展示登录态 + 带 token 调用受保护接口（验证 Casdoor 登录链路完整可用）
const api = require('../../api/index')
const auth = require('../../utils/auth')
const config = require('../../config/index')

Page({
  data: {
    userId: '',
    casdoorId: '',
    casdoorName: '',
    mobile: '',
    tokenPreview: '',
    userInfo: null,
    loading: false
  },

  onShow() {
    const keys = config.storageKeys
    const token = wx.getStorageSync(keys.token)
    this.setData({
      userId: wx.getStorageSync(keys.userId) || '',
      casdoorId: wx.getStorageSync(keys.casdoorId) || '',
      casdoorName: wx.getStorageSync(keys.casdoorName) || '',
      mobile: wx.getStorageSync(keys.mobile) || '',
      tokenPreview: token ? token.slice(0, 24) + '...' : ''
    })
  },

  onGetUserInfo() {
    if (this.data.loading) return
    this.setData({ loading: true })
    api
      .getUserInfo()
      .then((info) => {
        this.setData({ loading: false, userInfo: info })
      })
      .catch(() => {
        this.setData({ loading: false })
      })
  },

  onLogout() {
    auth.logout()
    wx.reLaunch({ url: '/pages/login/index' })
  }
})
