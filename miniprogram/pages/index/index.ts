import { getCategories, Category } from '../../services/api';

Page({
  data: {
    dateText: '',
    monthlyText: '0.00',
    connState: '连接中…',
    categories: [] as Category[],
  },

  onLoad() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    this.setData({ dateText: `${d.getMonth() + 1}月${d.getDate()}日 周${week}` });
    this.loadCategories();
  },

  async loadCategories() {
    try {
      const r = await getCategories();
      this.setData({
        categories: [...r.expense, ...r.income],
        connState: '✅ 已连接',
      });
    } catch {
      this.setData({ connState: '❌ 未连上（先 docker compose up，再检查 BASE_URL）' });
    }
  },

  onVoiceTap() {
    wx.showToast({ title: 'M2 上线：语音记账', icon: 'none' });
  },
  onPhotoTap() {
    wx.showToast({ title: 'M3 上线：拍照记账', icon: 'none' });
  },
  onManualTap() {
    wx.showToast({ title: 'M1 上线：手动记账', icon: 'none' });
  },
});
