# ElderLedger · 银龄记账

面向老年人的极简记账微信小程序：**说一句话、拍一张照、按个大按钮**，账就记好了。

> 定位差异：微信官方「微信记账本」解决的是**自动记录微信支付**；本项目解决的是——
> **现金、买菜、药费、人情往来都能"开口就记"，子女还能远程看到。**

**当前状态**：M0–M5 全部完成，已上微信云托管，真机验收通过（2026-09），提审准备中。

## 三种记账方式

| 方式 | 流程 | 技术 |
|------|------|------|
| 🎤 说一笔 | 按住说话 → 语音转文字 → 解析金额/分类/日期 → 大卡片确认 → 播报"记好了" | RecorderManager + 腾讯云一句话识别 + 正则/GLM-4-Flash |
| 📷 拍一张 | 拍小票 / 支付截图 → 上传 → 多模态识别提取 → 大卡片确认 | GLM-4V-Flash |
| ✋ 手动记 | 大数字键盘 + 分类九宫格 + 日期默认今天，3 步内完成 | 原生自绘适老组件 |

## 技术栈

| 层 | 选型 | 成本 |
|----|------|------|
| 小程序端 | 微信原生小程序 + TypeScript | ¥0 |
| 后端 | Node.js 20 + Express 5 + TypeScript（单容器） | 含在部署行 |
| 数据库 | 微信云托管 MySQL（serverless，10 分钟无连接自动暂停） | ≈1–5 元/月 |
| 语音识别 | 腾讯云一句话识别（16k mp3，服务端 ffmpeg 归一化） | 5000 次/月免费额度 |
| 语音播报 | 腾讯云基础语音合成（音色 101001，客户端短语缓存） | 免费资源包至 2026-12 |
| 文本解析 | **正则优先**（确定性金额计算），GLM-4-Flash 只兜底 | ¥0 |
| 图片识别 | GLM-4V-Flash（免费多模态） | ¥0 |
| 部署 | 微信云托管 1核2G 常驻 1 实例（≈60 元/月），callContainer 免域名免备案 | ≈60 元/月 |
| 发版 | `bash server/scripts/deploy-cloud.sh "备注"`（@wxcloud/cli，白名单暂存目录） | ¥0 |

## 请求通道架构（核心设计）

callContainer 网关在容器 CPU 打满时会拒客（-606001，实测 0.25 核必现、1核2G 消失）。据此分通道：

| 端点 | 通道 | 说明 |
|------|------|------|
| 账本写读（txn/summary/categories/family/export） | `wx.cloud.callContainer` | 身份由网关注入 `x-wx-openid`，不可伪造 |
| 重流量开放端点（asr/tts/parse，零身份依赖） | **公网直连优先** → 失败自动回落 callContainer | 绕开网关；multipart 上行省 1/3 体积；服务端 `openApiGuard` 校验 `x-app-key` 防蹭配额 |
| 本地开发 | `wx.request`/`wx.uploadFile` | `utils/config.ts` 一键切换 |

其他要点：写操作 `client_token` 幂等键防重复入库；网关瞬时失败客户端 2s/6s/12s 自动重试；一次语音记账仅 2 次调用（ASR 响应捎带解析、保存响应捎带月合计）；TTS 客户端短语缓存 + 无视 iOS 静音开关。

## 里程碑进度

| 里程碑 | 状态 |
|--------|------|
| M0 脚手架 → M5 家人协同+导出 | ✅ 全部完成（2026-09-12） |
| SQLite → 云托管 MySQL 迁移 | ✅ 2026-09-14 |
| 上微信云托管 + CLI 一键发版 | ✅ 2026-09-15 |
| -606001 网关拒客攻坚（公网直连通道 + 1核2G） | ✅ 2026-09-17 |
| 真机验收（语音/播报/保存全链路） | ✅ 2026-09-17 |
| 提审上线（改名/类目/隐私指引） | ⏳ 进行中 |

## 快速开始

```bash
# 云端模式（默认，API_MODE='cloud'）：微信开发者工具导入 miniprogram/ 即可，
# 服务端已运行在微信云托管，无需本地启动任何服务

# 本地开发：起 app + mysql 双容器（语音走腾讯云，需 .env 密钥）
cd server
cp .env.example .env              # 填 ZHIPU_API_KEY / TENCENT_SECRET_ID/KEY
docker compose up -d              # mysql 映射宿主 33061（避开本机 3306）
npm start                         # 或 docker compose up -d app

# 发版到云托管（需 ~/.wxcloudconfig 登录态，见 docs/deploy-cli.md）
bash server/scripts/deploy-cloud.sh "备注"
```

## 目录结构

```
ElderLedger/
├── docs/                  # 调研、需求、选型、架构、计划、发版指南
├── miniprogram/           # 小程序端（pages/services/utils）
│   └── services/api.ts    # 三通道请求层（direct/callContainer/local）
└── server/
    ├── src/               # Express + mysql2（routes/db/services/utils）
    ├── scripts/           # deploy-cloud.sh 发版 / direct-asr-stress.mjs 直连压测
    └── Dockerfile
```

## 主要调研来源

- 开源记账：[ezbookkeeping](https://github.com/mayswind/ezbookkeeping)、[Firefly III](https://github.com/firefly-iii/firefly-iii)、[Actual Budget](https://github.com/actualbudget/actual)、[awesome-wechat-weapp 合集](https://github.com/justjavac/awesome-wechat-weapp)
- 语音能力：~~微信同声传译插件 WechatSI~~（**实测个人主体不可添加**——插件类目对个人不开放，2026-09-11）；本地 FunASR/edge-tts 方案（M2 早期）已演进为腾讯云 ASR/TTS（免运维，免费额度覆盖个人用量）
- 图片识别：[智谱 GLM-4V-Flash（免费）](https://bigmodel.cn/dev/howuse/glm-4vflash)、[腾讯云票据 OCR（备选）](https://cloud.tencent.com/document/product/866/58257)
- 适老化：工信部《移动互联网应用(App)适老化通用设计规范》（2021）、GB/T 37668-2019《信息技术 互联网内容无障碍可访问性技术要求与测试方法》
