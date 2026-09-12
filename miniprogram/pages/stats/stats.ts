// 统计页：本月钱花在哪儿——分类排行 + 比例条（适老化：大字、不用图表库）
import { getSummary } from '../../services/api';
import { fenToYuanText } from '../../utils/money';

interface StatRow {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  cnt: number;
  amountText: string;
  barWidth: number; // 0-100，相对最大分类
}

Page({
  data: {
    totalText: '0.00',
    diffText: '',
    hasIncome: false,
    incomeText: '0.00',
    rows: [] as StatRow[],
    hasData: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const s = await getSummary();
      const max = Math.max(1, ...s.by_category.map((c) => c.total_fen));
      const rows: StatRow[] = s.by_category.map((c) => ({
        category_id: c.category_id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        cnt: c.cnt,
        amountText: fenToYuanText(c.total_fen),
        barWidth: Math.max(6, Math.round((c.total_fen / max) * 100)), // 最小可见宽度
      }));
      let diffText = '';
      if (s.prev_total_fen > 0) {
        const diff = fenToYuanText(Math.abs(s.diff_last_month_fen));
        diffText = s.diff_last_month_fen >= 0 ? `比上月多花 ${diff} 元` : `比上月少花 ${diff} 元`;
      }
      this.setData({
        totalText: fenToYuanText(s.total_fen),
        diffText,
        hasIncome: s.income_total_fen > 0,
        incomeText: fenToYuanText(s.income_total_fen),
        rows,
        hasData: s.by_category.length > 0,
      });
    } catch {
      wx.showToast({ title: '加载失败，请检查服务', icon: 'none' });
    }
  },
});
