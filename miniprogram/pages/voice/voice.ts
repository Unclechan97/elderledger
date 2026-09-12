import { uploadAsr, parseText, createTransaction, getCategories } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { speak, stopSpeak } from '../../services/tts';

type Phase = 'idle' | 'recording' | 'recognizing' | 'parsed' | 'failed';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

Page({
  data: {
    phase: 'idle' as Phase,
    recognizedText: '',
    failText: '',
    amountText: '0.00',
    categoryIcon: '📦',
    categoryName: '',
    dateLabel: '今天',
    saving: false,
  },

  recorder: null as WechatMiniprogram.RecorderManager | null,
  parsed: null as {
    kind: 'expense' | 'income';
    amount_fen: number;
    category_id: number;
    occurred_on: string;
    confidence: number;
  } | null,

  onLoad() {
    const rec = wx.getRecorderManager();
    rec.onStart(() => {
      this.setData({ phase: 'recording', recognizedText: '' });
    });
    rec.onStop((r) => {
      if (this.data.phase !== 'recording') return; // 已被取消/超时处理
      this.recognize(r.tempFilePath);
    });
    rec.onError(() => {
      this.setData({ phase: 'failed', failText: '录音出错了，请再试' });
    });
    this.recorder = rec;
  },

  onUnload() {
    stopSpeak();
  },

  onVoiceStart() {
    if (this.data.saving) return;
    stopSpeak();
    this.recorder?.start({
      format: 'wav',
      sampleRate: 16000,
      numberOfChannels: 1,
      duration: 60000, // 上限 60s 自动停
    });
  },

  onVoiceEnd() {
    if (this.data.phase !== 'recording') return;
    this.recorder?.stop();
  },

  async recognize(tempFilePath: string) {
    this.setData({ phase: 'recognizing' });
    try {
      const { text } = await uploadAsr(tempFilePath);
      const clean = text.trim();
      if (!clean) {
        this.setData({ phase: 'failed', failText: '没听到声音，请凑近手机再说一遍' });
        void speak('没听到声音，请再试一遍');
        return;
      }
      this.setData({ recognizedText: clean });
      const p = await parseText(clean);
      if (!p.kind || p.amount_fen <= 0 || !p.category_id) {
        this.setData({ phase: 'failed', failText: p.message || '没听清，请说清楚金额' });
        void speak('没听清金额，请再说一遍，或者手动输入');
        return;
      }
      const dateLabel = p.occurred_on === this.todayStr() ? '今天' : DATE_RE.test(p.occurred_on) ? p.occurred_on : '今天';
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
        dateLabel,
      });
      // 分类名/图标：解析结果只有 id，从全局分类缓存取（index/manual 均预载过；这里直接查）
      const cats = await this.loadCategoryMap();
      const cat = cats[p.category_id];
      if (cat) this.setData({ categoryName: cat.name, categoryIcon: cat.icon });
      const catName = cat?.name ?? '';
      const kindWord = p.kind === 'income' ? '收入' : '支出';
      void speak(`${kindWord} ${fenToYuanText(p.amount_fen)} 元，${catName}，对吗？`);
    } catch (err) {
      this.setData({ phase: 'failed', failText: (err as Error).message || '识别失败，请检查服务' });
    }
  },

  async loadCategoryMap(): Promise<Record<number, { name: string; icon: string }>> {
    if (voiceCategoryMap) return voiceCategoryMap;
    const r = await getCategories();
    voiceCategoryMap = {};
    for (const c of [...r.expense, ...r.income]) voiceCategoryMap[c.id] = { name: c.name, icon: c.icon };
    return voiceCategoryMap;
  },

  onConfirmSave() {
    if (this.data.saving || !this.parsed) return;
    this.setData({ saving: true });
    createTransaction({
      kind: this.parsed.kind,
      amount_fen: this.parsed.amount_fen,
      category_id: this.parsed.category_id,
      occurred_on: this.parsed.occurred_on,
      note: this.data.recognizedText.slice(0, 50),
      source: 'voice',
      confidence: this.parsed.confidence,
    })
      .then(() => {
        this.setData({ phase: 'idle', recognizedText: '', saving: false });
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
    this.setData({ phase: 'idle', recognizedText: '', failText: '' });
  },

  onManualFallback() {
    wx.redirectTo({ url: '/pages/manual/manual' });
  },

  todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
});

let voiceCategoryMap: Record<number, { name: string; icon: string }> | null = null;
