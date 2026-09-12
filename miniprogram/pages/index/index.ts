import { getSummary } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { isTtsEnabled, setTtsEnabled, speak } from '../../services/tts';

const GUIDE_KEY = 'guide_shown';

Page({
  data: {
    dateText: '',
    totalText: '0.00',
    diffText: '',
    ttsOn: true,
    showGuide: false,
  },

  onLoad() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    this.setData({ dateText: `${d.getMonth() + 1}月${d.getDate()}日 周${week}` });
    // 首次使用：引导层 + 语音讲解（只出现一次）
    let firstTime = false;
    try {
      firstTime = wx.getStorageSync(GUIDE_KEY) !== true;
    } catch {
      /* 存储异常视为已看过，不阻塞 */
    }
    if (firstTime) {
      this.setData({ showGuide: true });
      void speak('欢迎使用银龄记账。按住话筒说话就能记账，也可以拍一张支付页面，或者手动按键输入。');
    }
  },

  onGuideDone() {
    try {
      wx.setStorageSync(GUIDE_KEY, true);
    } catch {
      /* 下次再引导一次，无碍 */
    }
    this.setData({ showGuide: false });
  },

  onShow() {
    this.loadSummary();
    this.setData({ ttsOn: isTtsEnabled() });
  },

  /** 播报总开关：首页一键切换，全局生效 */
  onToggleSound() {
    const on = !this.data.ttsOn;
    setTtsEnabled(on);
    this.setData({ ttsOn: on });
    wx.showToast({ title: on ? '声音已打开' : '声音已关闭', icon: 'none' });
  },

  async loadSummary() {
    try {
      const s = await getSummary();
      let diffText = '';
      if (s.prev_total_fen > 0) {
        const diff = fenToYuanText(Math.abs(s.diff_last_month_fen));
        diffText = s.diff_last_month_fen >= 0 ? `比上月多花 ${diff} 元` : `比上月少花 ${diff} 元`;
      }
      this.setData({ totalText: fenToYuanText(s.total_fen), diffText });
    } catch {
      // 静默失败：首页保留上次数值；明细/记账页会给出明确错误提示
    }
  },

  onVoiceTap() {
    wx.navigateTo({ url: '/pages/voice/voice' });
  },
  onPhotoTap() {
    wx.navigateTo({ url: '/pages/photo/photo' });
  },
  onManualTap() {
    wx.navigateTo({ url: '/pages/manual/manual' });
  },
  onListTap() {
    wx.navigateTo({ url: '/pages/list/list' });
  },
  onStatsTap() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },
  onFamilyTap() {
    wx.navigateTo({ url: '/pages/family/family' });
  },
});
