# ElderLedger · 银龄记账

面向老年人的极简记账微信小程序：**说一句话、拍一张照、按个大按钮**，账就记好了。

> 定位差异：微信官方「微信记账本」解决的是**自动记录微信支付**；本项目解决的是——
> **现金、买菜、药费、人情往来都能"开口就记"，子女还能远程看到。**

## 三种记账方式

| 方式 | 流程 | 技术 |
|------|------|------|
| 🎤 说一笔 | 按住说话 → 语音转文字 → LLM 解析金额/分类/日期 → 大卡片确认 → 语音播报"记好了" | WechatSI 插件 + GLM-4-Flash |
| 📷 拍一张 | 拍小票 / 微信支付宝支付截图 → 上传 → 多模态识别提取 → 大卡片确认 | GLM-4V-Flash |
| ✋ 手动记 | 大数字键盘 + 分类九宫格 + 日期默认今天，3 步内完成 | 原生自绘适老组件 |

## 技术栈速览

| 层 | 选型 | 成本 |
|----|------|------|
| 小程序端 | 微信原生小程序 + TypeScript | ¥0 |
| 语音识别/播报 | 微信同声传译插件 WechatSI（官方免费） | ¥0 |
| 文本语义解析 | GLM-4-Flash（免费，json_schema 结构化输出） | ¥0 |
| 图片识别 | GLM-4V-Flash（免费多模态，单图 ≤ 5MB） | ¥0 |
| 后端 | Node.js 20 + Express 5 + TypeScript | ¥0 |
| 数据库 | SQLite（better-sqlite3，WAL 模式） | ¥0 |
| 开发调试 | 微信开发者工具 + 局域网真机预览（本地为基准） | ¥0 |

**本地开发阶段全链路零成本，无任何云服务依赖。**

## 文档导航

| 文档 | 内容 |
|------|------|
| [docs/01-竞品与开源项目调研.md](docs/01-竞品与开源项目调研.md) | 商业产品 + 开源项目调研，借鉴点与差异定位 |
| [docs/02-需求设计.md](docs/02-需求设计.md) | 用户画像、适老化设计原则、功能清单（P0/P1/P2）、核心流程、验收标准 |
| [docs/03-技术选型.md](docs/03-技术选型.md) | 各层选型对比与结论、成本分析、技术风险对策 |
| [docs/04-架构设计.md](docs/04-架构设计.md) | 总体架构、目录结构、数据模型 DDL、API 草案、LLM Prompt 草案 |
| [docs/05-开发计划.md](docs/05-开发计划.md) | 里程碑 M0–M5、验收标准、测试计划、风险登记 |

## 里程碑进度

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| 调研 + 需求设计 + 技术选型 | 本批次文档 | ✅ 完成 |
| M0 脚手架 | 仓库结构、小程序模板、Express+SQLite 骨架 | ⬜ 待开始 |
| M1 手动记账闭环 | 分类九宫格、大键盘、明细、月汇总 | ⬜ |
| M2 语音记账 | WechatSI + GLM-4-Flash 解析 + TTS 播报 | ⬜ |
| M3 拍照记账 | 拍照上传 + GLM-4V 提取 + 失败兜底 | ⬜ |
| M4 适老化打磨 | 字号走查、全程语音、防误触、老人实测 | ⬜ |
| M5 家人协同 + 导出 | 子女绑定只读、CSV 导出 | ⬜ |

## 目录结构（规划）

```
ElderLedger/
├── docs/                # 调研、需求、选型、架构、计划
├── miniprogram/         # 微信原生小程序（M0 创建）
└── server/              # Node.js + Express + SQLite（M0 创建）
```

## 主要调研来源

- 开源记账：[ezbookkeeping](https://github.com/mayswind/ezbookkeeping)、[Firefly III](https://github.com/firefly-iii/firefly-iii)、[Actual Budget](https://github.com/actualbudget/actual)、[awesome-wechat-weapp 合集](https://github.com/justjavac/awesome-wechat-weapp)
- 语音能力：微信同声传译插件 WechatSI（插件 APPID `wx069ba97219f66d99`，小程序管理后台「插件管理」添加）
- 图片识别：[智谱 GLM-4V-Flash（免费）](https://bigmodel.cn/dev/howuse/glm-4vflash)、[腾讯云票据 OCR（备选）](https://cloud.tencent.com/document/product/866/58257)、[GLM-4V 小票提取 JSON 实战](https://blog.csdn.net/weixin_44786513/article/details/144271881)
- 适老化：工信部《移动互联网应用(App)适老化通用设计规范》（2021）、GB/T 37668-2019《信息技术 互联网内容无障碍可访问性技术要求与测试方法》
