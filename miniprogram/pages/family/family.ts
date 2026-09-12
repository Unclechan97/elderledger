// M5 家人协同页：老人出示邀请码 / 家人绑定后看汇总、看明细、代记、导出
import { getMe, createInvite, bindFamily, getElders, exportCsvUrl, MeResp } from '../../services/api';
import { fenToYuanText } from '../../utils/money';
import { setUserId, setViewAs, clearViewAs, identityHeaders } from '../../utils/identity';
import { speak } from '../../services/tts';
import { BASE_URL } from '../../utils/config';

Page({
  data: {
    mode: 'loading' as 'loading' | 'elder' | 'bind' | 'managing',
    inviteCode: '',
    bindCode: '',
    elderName: '',
    elderExpenseText: '0.00',
    elderIncomeText: '0.00',
    elderCount: 0,
  },

  onLoad() {
    this.refresh();
  },

  /** 绑定老人的信息（页面实例属性，不进 data——仅供跳转时设置 view-as） */
  boundElder: null as { id: number; nickname: string } | null,

  /** 按当前身份决定视图：elder→出示邀请码；family→管理视图 */
  async refresh() {
    try {
      const me: MeResp = await getMe();
      if (me.role === 'family' && me.elder) {
        // 家人身份：展示绑定老人的汇总。注意这里不持久化 view-as——
        // 只在"看明细/代记/导出"动作期间临时设置，离开即清，
        // 否则家人回首页自己记一笔会写进老人账本
        this.boundElder = me.elder;
        await this.loadElderSummary();
        this.setData({ mode: 'managing', elderName: me.elder.nickname });
      } else {
        this.boundElder = null;
        this.setData({ mode: 'elder', inviteCode: me.invite_code || '' });
      }
    } catch (err) {
      wx.showToast({ title: (err as Error).message || '加载失败', icon: 'none' });
      this.setData({ mode: 'elder' });
    }
  },

  async loadElderSummary() {
    try {
      const r = await getElders();
      const e = r.elders[0];
      if (e) {
        this.setData({
          elderExpenseText: fenToYuanText(e.expense_fen),
          elderIncomeText: fenToYuanText(e.income_fen),
          elderCount: e.month_count,
        });
      }
    } catch {
      /* 汇总失败不阻塞页面 */
    }
  },

  /** 老人：生成/换新邀请码 */
  async onCreateInvite() {
    try {
      const r = await createInvite();
      this.setData({ inviteCode: r.invite_code });
      void speak('邀请码生成好了，把上面的码念给孩子听，孩子输入后就能看到你的账本。');
    } catch (err) {
      wx.showToast({ title: (err as Error).message || '生成失败', icon: 'none' });
    }
  },

  /** 老人端入口：切到绑定视图（本地开发同一台设备模拟子女） */
  onGoBind() {
    this.setData({ mode: 'bind', bindCode: '' });
  },

  onBindCancel() {
    this.setData({ mode: 'elder' });
  },

  onBindInput(e: WechatMiniprogram.Input) {
    this.setData({ bindCode: String(e.detail.value || '').toUpperCase() });
  },

  /** 子女：凭码绑定 → 本地开发存为当前身份，之后默认代看老人 */
  async onBindSubmit() {
    const code = this.data.bindCode.trim();
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
      return;
    }
    try {
      const r = await bindFamily(code);
      setUserId(String(r.family_user_id));
      this.boundElder = r.elder;
      void speak(`绑定成功，现在可以看到${r.elder.nickname}的账本了`);
      await this.loadElderSummary();
      this.setData({ mode: 'managing', elderName: r.elder.nickname });
    } catch (err) {
      wx.showToast({ title: (err as Error).message || '绑定失败', icon: 'none' });
    }
  },

  /** 看明细：临时进入"代看"上下文，list 离开时自清 */
  onViewList() {
    const me = this.boundElder;
    if (me) setViewAs(String(me.id), me.nickname);
    wx.navigateTo({ url: '/pages/list/list' });
  },

  /** 代记一笔：临时进入"代记"上下文，manual 离开时自清 */
  onViewManual() {
    const me = this.boundElder;
    if (me) setViewAs(String(me.id), me.nickname);
    wx.navigateTo({ url: '/pages/manual/manual' });
  },

  /** 导出本月 CSV → 微信文件转发 */
  onExport() {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const elder = this.boundElder;
    if (elder) setViewAs(String(elder.id), elder.nickname);
    wx.showLoading({ title: '正在导出' });
    wx.downloadFile({
      url: exportCsvUrl(month),
      header: identityHeaders(),
      success: (r) => {
        wx.hideLoading();
        if (r.statusCode >= 400) {
          wx.showToast({ title: '导出失败', icon: 'none' });
          return;
        }
        wx.shareFileMessage({
          filePath: r.tempFilePath,
          fileName: `银龄账单-${month}.csv`,
          success: () => wx.showToast({ title: '已转发', icon: 'none' }),
          fail: () => wx.showToast({ title: '文件已下载，可在微信聊天里发送', icon: 'none' }),
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: `下载失败，请确认服务 ${BASE_URL} 可达`, icon: 'none', duration: 3000 });
      },
      complete: () => {
        if (elder) clearViewAs();
      },
    });
  },

  /** 调试：本机切回老人身份（上线后身份来自 openid，无此入口） */
  onBackToElder() {
    setUserId('');
    clearViewAs();
    this.boundElder = null;
    this.setData({ inviteCode: '' });
    wx.showToast({ title: '已切回老人身份', icon: 'none' });
    this.refresh();
  },
});
