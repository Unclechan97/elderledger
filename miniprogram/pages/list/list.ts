import { getTransactions, deleteTransaction, TxnItem } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { speak } from '../../services/tts';
import { getViewAsId, getViewAsName, clearViewAs } from '../../utils/identity';

const PAGE_SIZE = 20;

Page({
  data: {
    range: 'today' as 'today' | 'month',
    items: [] as Array<TxnItem & { amountText: string }>,
    expenseText: '0.00',
    incomeText: '0.00',
    asMode: false,
    asName: '',
    page: 1,
    hasMore: false,
    loadingMore: false,
  },

  onShow() {
    // 家人代看：显示"只读"横幅并隐藏删除（数据隔离由服务端保证，这里只管呈现）
    const asMode = !!getViewAsId();
    this.setData({ asMode, asName: asMode ? getViewAsName() : '' });
    this.load();
  },

  onUnload() {
    if (this.data.asMode) clearViewAs(); // 代看上下文只在浏览期间存在
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
        page: 1,
        hasMore: r.items.length < r.total,
        loadingMore: false,
      });
    } catch {
      wx.showToast({ title: '加载失败，请检查服务', icon: 'none' });
    }
  },

  /** 触底加载下一页并追加（老人零学习：滚就是了） */
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    try {
      const next = this.data.page + 1;
      const r = await getTransactions(this.data.range, next, PAGE_SIZE);
      const more = r.items.map((it) => ({ ...it, amountText: fenToYuanText(it.amount_fen) }));
      this.setData({
        items: [...this.data.items, ...more],
        page: next,
        hasMore: this.data.items.length + more.length < r.total,
        loadingMore: false,
      });
    } catch {
      this.setData({ loadingMore: false });
      wx.showToast({ title: '加载失败，上滑再试', icon: 'none' });
    }
  },

  onReachBottom() {
    void this.loadMore();
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    if (this.data.asMode) return; // 家人只读，双保险（按钮已隐藏）
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.items.find((it) => it.id === id);
    if (!item) return;
    void speak('要删除这一笔吗？删了就找不回来了'); // 不可恢复操作前播报（适老化原则 6）
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
          void speak('已删除');
          wx.showToast({ title: '已删除', icon: 'none' });
          this.load();
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});
