import { parseImage, createTransaction, getCategories, getSummary, ParseResult } from '../../services/api';
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
    successVisible: false,
    successText: '',
  },

  parsed: null as { kind: 'expense' | 'income'; amount_fen: number; category_id: number; occurred_on: string; confidence: number } | null,
  catMap: null as Record<number, CatInfo> | null,
  successTimer: null as ReturnType<typeof setTimeout> | null,

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
      const p = await parseImage(await compressForUpload(photoPath));
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
      const msg = String((err as Error)?.message ?? err ?? '');
      console.warn('[photo] 原始错误:', msg); // 页面文案适老化了，真实原因必须留痕
      this.setData({ phase: 'failed', failText: friendlyErr(msg) });
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
      .then(async () => {
        const totalLine = await this.monthTotalLine();
        this.parsed = null;
        this.setData({ phase: 'idle', photoPath: '', saving: false });
        this.showSuccess(`记好了${totalLine ? `，${totalLine}` : ''}`);
        void speak('记好了'); // 连续记账：留在本页，方便接着拍下一张
      })
      .catch((err: Error) => {
        this.setData({ saving: false, phase: 'failed', failText: err.message || '保存失败' });
      });
  },

  async monthTotalLine(): Promise<string> {
    try {
      const s = await getSummary();
      if (s.total_fen > 0) return `本月已花 ${fenToYuanText(s.total_fen)} 元`;
    } catch {
      /* 汇总失败不阻塞 */
    }
    return '';
  },

  showSuccess(text: string) {
    if (this.successTimer) clearTimeout(this.successTimer);
    this.setData({ successVisible: true, successText: text });
    this.successTimer = setTimeout(() => {
      this.setData({ successVisible: false });
    }, 2500);
  },

  onDone() {
    wx.navigateBack();
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

/** 报错转老人能懂的话（网关/网络类错误是英文码，直接显示等于没说） */
function friendlyErr(msg: string): string {
  if (/callContainer|-606\d{3}|system ?error|timeout|超时|fail/i.test(msg)) return '网络不好，请再试一次或改用手动输入';
  return msg || '识别失败，请检查服务';
}

/**
 * 压图后再上传：微信 chooseMedia 的 compressed 只是轻压，新手机随手 1-2MB，
 * base64 后 2-3MB 会超 callContainer 网关包体上限（网关层直接拒 = -606001）。
 * 长边 1280 对小票/截图文字识别足够；压缩失败用原图兜底
 */
function compressForUpload(src: string): Promise<string> {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 60,
      compressedWidth: 1280,
      success: (r) => {
        wx.getFileSystemManager().getFileInfo({
          filePath: r.tempFilePath,
          success: (info) => {
            if (info.size > 1_200_000) {
              // 还嫌大（个别 png 截图）：再压狠一轮
              wx.compressImage({
                src: r.tempFilePath,
                quality: 40,
                compressedWidth: 960,
                success: (r2) => resolve(r2.tempFilePath),
                fail: () => resolve(r.tempFilePath),
              });
              return;
            }
            resolve(r.tempFilePath);
          },
          fail: () => resolve(r.tempFilePath),
        });
      },
      fail: () => resolve(src),
    });
  });
}
