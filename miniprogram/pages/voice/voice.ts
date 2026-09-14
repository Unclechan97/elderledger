import { uploadAsr, parseText, createTransaction, getCategories, getSummary } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { speak, stopSpeak } from '../../services/tts';

type Phase = 'idle' | 'recording' | 'recognizing' | 'parsed' | 'failed';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 网络类报错转老人能懂的话（原始 errMsg 是 "cloud.callContainer:fail -606001…" 这种） */
function friendlyErr(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? '');
  console.warn('[voice] 原始错误:', msg); // 排查用：页面文案适老化了，但真实原因必须留痕
  if (/callContainer|-606\d{3}|systemerror|timeout|超时|fail/i.test(msg)) return '服务没连上，请等两秒再按住说话';
  return msg || '识别失败，请检查服务';
}

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
    successVisible: false,
    successText: '',
  },

  recorder: null as WechatMiniprogram.RecorderManager | null,
  successTimer: null as ReturnType<typeof setTimeout> | null,
  startWatchdog: null as ReturnType<typeof setTimeout> | null,
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
      this.clearStartWatchdog();
      this.setData({ phase: 'recording', recognizedText: '' });
    });
    rec.onStop((r) => {
      this.clearStartWatchdog();
      if (this.data.phase !== 'recording') return; // 已被取消/超时处理
      // 防误触：点一下就松手是无效录音，引导按住说话
      if (r.duration !== undefined && r.duration < 1000) {
        this.setData({ phase: 'failed', failText: '按住圆钮说话，说完松开' });
        return;
      }
      this.recognize(r.tempFilePath);
    });
    rec.onError(() => {
      this.clearStartWatchdog();
      this.setData({ phase: 'failed', failText: '录音出错了，请再试' });
    });
    this.recorder = rec;
  },

  onUnload() {
    this.clearStartWatchdog();
    stopSpeak();
  },

  clearStartWatchdog() {
    if (this.startWatchdog) {
      clearTimeout(this.startWatchdog);
      this.startWatchdog = null;
    }
  },

  onVoiceStart() {
    if (this.data.saving) return;
    if (this.data.phase === 'recording' || this.data.phase === 'recognizing') return;
    stopSpeak();
    // 防卡死兜底：开发工具里 RecorderManager.start() 偶发无响应（无 onStart 也无 onError，
    // 清缓存/重编译后更常见），1.5s 没进录音态就"止血重启"一次，再不行给明确提示
    this.clearStartWatchdog();
    this.startWatchdog = setTimeout(() => {
      if (this.data.phase === 'recording') return;
      try {
        this.recorder?.stop(); // 停掉可能卡住的录音会话
      } catch {
        /* 未在录音时无害 */
      }
      setTimeout(() => {
        if (this.data.phase === 'recording') return;
        try {
          this.recorder?.start(RECORDER_OPTS);
        } catch {
          /* 忽略，走下面的终态提示 */
        }
        this.startWatchdog = setTimeout(() => {
          if (this.data.phase !== 'recording') {
            this.setData({ phase: 'failed', failText: '按钮没反应，请再试一次或改用手动输入' });
          }
        }, 1500);
      }, 300);
    }, 1500);
    try {
      this.recorder?.start(RECORDER_OPTS);
    } catch {
      this.setData({ phase: 'failed', failText: '录音启动失败，请再试一次' });
    }
  },

  onVoiceEnd() {
    if (this.data.phase !== 'recording') return;
    this.recorder?.stop();
  },

  async recognize(tempFilePath: string) {
    this.setData({ phase: 'recognizing' });
    try {
      const asrResp = await uploadAsr(tempFilePath);
      const clean = String(asrResp.text || '').trim();
      if (!clean) {
        this.setData({ phase: 'failed', failText: '没听到声音，请凑近手机再说一遍' });
        void speak('没听到声音，请再试一遍');
        return;
      }
      this.setData({ recognizedText: clean });
      // ASR 响应已捎带解析结果（合并请求省一次网关调用）；旧版服务端无 parse 时回退单独调用
      const p = asrResp.parse ?? (await parseText(clean));
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
      this.setData({ phase: 'failed', failText: friendlyErr(err) });
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
      note: this.data.recognizedText.slice(0, 100), // 原话入账（明细页备注行完整展示，100 字兜底超长闲聊）
      source: 'voice',
      confidence: this.parsed.confidence,
      client_token: `v-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, // 幂等：重试/双击不重复入账
    })
      .then(async (r) => {
        // 月汇总由保存响应捎带（省一次网关调用）；旧版服务端无此字段时回退单独查
        let totalLine = '';
        if (typeof r.month_total_fen === 'number' && r.month_total_fen > 0) {
          totalLine = `本月已花 ${fenToYuanText(r.month_total_fen)} 元`;
        } else {
          totalLine = await this.monthTotalLine();
        }
        this.parsed = null;
        this.setData({ phase: 'idle', recognizedText: '', saving: false });
        this.showSuccess(`记好了${totalLine ? `，${totalLine}` : ''}`);
        void speak('记好了'); // 连续记账：留在本页，方便接着说下一笔
      })
      .catch((err: Error) => {
        this.setData({ saving: false, phase: 'failed', failText: friendlyErr(err) });
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

// 录音参数集中一处（onVoiceStart 与卡死重启共用）
const RECORDER_OPTS: WechatMiniprogram.RecorderManagerStartOption = {
  format: 'mp3', // 模拟器不支持 wav（仅真机），mp3 模拟器+真机都支持；服务端统一转 16k wav
  sampleRate: 16000,
  encodeBitRate: 96000, // 16k 采样率允许的上限（官方对照表 24000~96000），清晰度优先
  numberOfChannels: 1,
  duration: 60000, // 上限 60s 自动停
};
