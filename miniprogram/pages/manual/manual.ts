import { getCategories, createTransaction, Category } from '../../services/api';
import { yuanStrToFen } from '../../utils/money';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    kind: 'expense' as 'expense' | 'income',
    amount: '',
    currentCategories: [] as Category[],
    selectedCategoryId: 0,
    selectedCategoryName: '',
    selectedCategoryIcon: '📦',
    occurredOn: '',
    today: '',
    dateLabel: '今天',
    confirmVisible: false,
    pendingFen: 0,
    saving: false,
  },

  allCategories: [] as Category[],

  async onLoad() {
    const today = fmtDate(new Date());
    this.setData({ occurredOn: today, today });
    try {
      const r = await getCategories();
      this.allCategories = [...r.expense, ...r.income];
      this.applyKind(this.data.kind);
    } catch {
      wx.showToast({ title: '服务没连上，请检查容器', icon: 'none', duration: 2500 });
    }
  },

  applyKind(kind: 'expense' | 'income') {
    this.setData({
      kind,
      currentCategories: this.allCategories.filter((c) => c.kind === kind),
      selectedCategoryId: 0,
      selectedCategoryName: '',
      selectedCategoryIcon: '📦',
    });
  },

  setKind(e: WechatMiniprogram.TouchEvent) {
    const kind = String(e.currentTarget.dataset.kind) as 'expense' | 'income';
    if (kind !== this.data.kind) this.applyKind(kind);
  },

  onSelectCategory(e: WechatMiniprogram.CustomEvent<{ id: number }>) {
    const id = e.detail.id;
    const cat = this.allCategories.find((c) => c.id === id);
    if (!cat) return;
    this.setData({ selectedCategoryId: id, selectedCategoryName: cat.name, selectedCategoryIcon: cat.icon });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const occurredOn = String(e.detail.value);
    const today = this.data.today;
    const yesterday = fmtDate(new Date(Date.now() - 86400000));
    const dateLabel = occurredOn === today ? '今天' : occurredOn === yesterday ? '昨天' : occurredOn;
    this.setData({ occurredOn, dateLabel });
  },

  onKey(e: WechatMiniprogram.CustomEvent<{ key: string }>) {
    const k = e.detail.key;
    let a = this.data.amount;
    if (k === 'del') {
      a = a.slice(0, -1);
    } else if (k === '.') {
      if (!a.includes('.')) a = (a === '' ? '0' : a) + '.';
    } else if (a.indexOf('.') >= 0) {
      if (a.length - a.indexOf('.') - 1 < 2) a += k; // 小数最多 2 位
    } else if (a === '0') {
      a = k; // 去前导零
    } else if (a.length < 7) {
      a += k; // 整数最多 7 位（< 千万）
    }
    this.setData({ amount: a });
  },

  onSaveTap() {
    if (this.data.saving) return;
    const { amount, selectedCategoryId } = this.data;
    const fen = yuanStrToFen(amount);
    if (fen <= 0) {
      wx.showToast({ title: '先按金额', icon: 'none' });
      return;
    }
    if (!selectedCategoryId) {
      wx.showToast({ title: '先选一个分类', icon: 'none' });
      return;
    }
    this.setData({ pendingFen: fen, confirmVisible: true });
  },

  async onConfirmSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await createTransaction({
        kind: this.data.kind,
        amount_fen: this.data.pendingFen,
        category_id: this.data.selectedCategoryId,
        occurred_on: this.data.occurredOn,
        source: 'manual',
        confidence: 1,
      });
      this.setData({ confirmVisible: false, amount: '', pendingFen: 0, saving: false });
      this.applyKind(this.data.kind);
      wx.showToast({ title: '✅ 记好了', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: (err as Error).message || '保存失败', icon: 'none', duration: 2500 });
    }
  },

  onEditBack() {
    this.setData({ confirmVisible: false });
  },
});
