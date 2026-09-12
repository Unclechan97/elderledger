import { getSummary } from '../../services/api';
import { fenToYuanText } from '../../utils/money';

Page({
  data: {
    dateText: '',
    totalText: '0.00',
    diffText: '',
  },

  onLoad() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    this.setData({ dateText: `${d.getMonth() + 1}月${d.getDate()}日 周${week}` });
  },

  onShow() {
    this.loadSummary();
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
    wx.showToast({ title: 'M5 上线：统计图表', icon: 'none' });
  },
  onFamilyTap() {
    wx.showToast({ title: 'M5 上线：家人协同', icon: 'none' });
  },
});
