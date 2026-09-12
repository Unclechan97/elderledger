import { getTransactions, deleteTransaction, TxnItem } from '../../services/api';
import { fenToYuanText } from '../../utils/money';

Page({
  data: {
    range: 'today' as 'today' | 'month',
    items: [] as Array<TxnItem & { amountText: string }>,
    expenseText: '0.00',
    incomeText: '0.00',
  },

  onShow() {
    this.load();
  },

  setRange(e: WechatMiniprogram.TouchEvent) {
    const range = String(e.currentTarget.dataset.range) as 'today' | 'month';
    if (range !== this.data.range) {
      this.setData({ range });
      this.load();
    }
  },

  async load() {
    try {
      const r = await getTransactions(this.data.range);
      this.setData({
        items: r.items.map((it) => ({ ...it, amountText: fenToYuanText(it.amount_fen) })),
        expenseText: fenToYuanText(r.expense_fen),
        incomeText: fenToYuanText(r.income_fen),
      });
    } catch {
      wx.showToast({ title: '加载失败，请检查服务', icon: 'none' });
    }
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.items.find((it) => it.id === id);
    if (!item) return;
    wx.showModal({
      title: '删除这一笔？',
      content: `${item.category_icon} ${item.category_name} ¥${item.amountText}`,
      confirmText: '删除',
      cancelText: '先不删',
      confirmColor: '#D84315',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await deleteTransaction(id);
          wx.showToast({ title: '已删除', icon: 'none' });
          this.load();
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});
