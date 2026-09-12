import { parseImage, createTransaction, getCategories, ParseResult } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { speak, stopSpeak } from '../../services/tts';

type Phase = 'idle' | 'working' | 'parsed' | 'failed';

interface CatInfo {
  name: string;
  icon: string;
}

Page({
  data: {
    phase: 'idle' as Phase,
    photoPath: '',
    failText: '',
    amountText: '0.00',
    categoryIcon: '📦',
    categoryName: '',
    dateLabel: '今天',
    saving: false,
  },

  parsed: null as { kind: 'expense' | 'income'; amount_fen: number; category_id: number; occurred_on: string; confidence: number } | null,
  catMap: null as Record<number, CatInfo> | null,

  onUnload() {
    stopSpeak();
  },

  chooseFromCamera() {
    this.choose(['camera']);
  },

  chooseFromAlbum() {
    this.choose(['album']);
  },

  choose(sourceType: Array<'camera' | 'album'>) {
    stopSpeak();
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (r) => {
        const path = r.tempFiles[0]?.tempFilePath;
        if (path) this.recognize(path);
      },
      fail: () => {
        /* 用户取消选择，静默回到当前状态 */
      },
    });
  },

  async recognize(photoPath: string) {
    this.setData({ phase: 'working', photoPath });
    try {
      const p = await parseImage(photoPath);
      if (!p.kind || p.amount_fen <= 0 || !p.category_id) {
        this.setData({ phase: 'failed', failText: p.message || '没看清这张图，请拍清楚金额' });
        void speak('没看清这张图，请拍清楚金额');
        return;
      }
      const cats = await this.loadCatMap();
      const cat = cats[p.category_id];
      this.parsed = {
        kind: p.kind,
        amount_fen: p.amount_fen,
        category_id: p.category_id,
        occurred_on: p.occurred_on,
        confidence: p.confidence,
      };
      this.setData({
        phase: 'parsed',
        amountText: fenToYuanText(p.amount_fen),
        categoryName: cat?.name ?? '',
        categoryIcon: cat?.icon ?? '📦',
        dateLabel: p.occurred_on === this.todayStr() ? '今天' : p.occurred_on,
      });
      const kindWord = p.kind === 'income' ? '收入' : '支出';
      void speak(`${kindWord} ${fenToYuanText(p.amount_fen)} 元，${cat?.name ?? ''}，对吗？`);
    } catch (err) {
      this.setData({ phase: 'failed', failText: (err as Error).message || '识别失败，请检查服务' });
    }
  },

  async loadCatMap(): Promise<Record<number, CatInfo>> {
    if (this.catMap) return this.catMap;
    const r = await getCategories();
    const map: Record<number, CatInfo> = {};
    for (const c of [...r.expense, ...r.income]) map[c.id] = { name: c.name, icon: c.icon };
    this.catMap = map;
    return map;
  },

  onConfirmSave() {
    if (this.data.saving || !this.parsed) return;
    this.setData({ saving: true });
    createTransaction({
      kind: this.parsed.kind,
      amount_fen: this.parsed.amount_fen,
      category_id: this.parsed.category_id,
      occurred_on: this.parsed.occurred_on,
      note: '拍照记账',
      source: 'photo',
      confidence: this.parsed.confidence,
    })
      .then(() => {
        this.setData({ phase: 'idle', photoPath: '', saving: false });
        this.parsed = null;
        void speak('记好了');
        setTimeout(() => wx.navigateBack(), 1200);
      })
      .catch((err: Error) => {
        this.setData({ saving: false, phase: 'failed', failText: err.message || '保存失败' });
      });
  },

  onRetry() {
    stopSpeak();
    this.parsed = null;
    this.setData({ phase: 'idle', failText: '' });
  },

  onManualFallback() {
    wx.redirectTo({ url: '/pages/manual/manual' });
  },

  todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
});
