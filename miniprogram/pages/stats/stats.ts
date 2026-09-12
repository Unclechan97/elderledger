// 统计页：本月钱花在哪儿 + 钱从哪儿来——分类排行 + 比例条（适老化：大字、不用图表库）
import { getSummary } from '../../services/api';
import { fenToYuanText } from '../../utils/money';

interface CatStat {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  total_fen: number;
  cnt: number;
}

interface StatRow {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  cnt: number;
  amountText: string;
  barWidth: number; // 0-100，相对该收支方向的最大分类
}

function toRows(list: CatStat[]): StatRow[] {
  const max = Math.max(1, ...list.map((c) => c.total_fen));
  return list.map((c) => ({
    category_id: c.category_id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    cnt: c.cnt,
    amountText: fenToYuanText(c.total_fen),
    barWidth: Math.max(6, Math.round((c.total_fen / max) * 100)), // 最小可见宽度
  }));
}

Page({
  data: {
    totalText: '0.00',
    diffText: '',
    hasIncome: false,
    incomeText: '0.00',
    rows: [] as StatRow[],
    hasData: false,
    incomeRows: [] as StatRow[],
    hasIncomeRows: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const s = await getSummary();
      const rows = toRows(s.by_expense_category);
      const incomeRows = toRows(s.by_income_category);
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
        hasData: rows.length > 0,
        incomeRows,
        hasIncomeRows: incomeRows.length > 0,
      });
    } catch {
      wx.showToast({ title: '加载失败，请检查服务', icon: 'none' });
    }
  },
});
