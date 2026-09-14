# 微信云托管 CLI 部署指南

> 目标：把「控制台手动上传 zip」换成一条命令的发版流程，私钥和 `.env` 永不离开本机。

## 原理速览

```
wxcloud login  →  凭据存 ~/.wxcloudconfig（APPID + PRIVATE_KEY，dotenv 格式）
部署 = CLI 把指定目录打成 zip → 上传云托管 → 触发云端 Docker 构建 → 全量发布新版本
```

- AppID：`wxf960e7a85ba37ec1`（复用的个人主体小程序）
- 环境：`elderledger-app-d7fv0hsub61bda15`
- 服务：`elderledger-app`（监听端口 3000，地域默认 ap-shanghai）
- CLI：`@wxcloud/cli@2.3.3`（命令 `wxcloud`；npmmirror 安装）

## 一次性准备（约 3 分钟）

1. **装 CLI**（已装可跳过）：
   ```bash
   npm i -g @wxcloud/cli@2.3.3 --registry=https://registry.npmmirror.com
   wxcloud --version   # 应显示 2.3.3
   ```
2. **生成 CLI 密钥**：微信云托管控制台 → 左下角「设置」→「全局设置」→ **CLI 密钥** → 生成并下载私钥
3. **私钥落位**：存为 `D:\AiProject\wxcloud-key.txt`（不在仓库目录内；想放别处就设环境变量 `WXCLOUD_KEY_FILE`）

## 日常发版（一条命令）

```bash
bash server/scripts/deploy-cloud.sh "这次改了什么"
```

脚本自动完成：检查私钥 → 首次自动登录 → 同步**白名单暂存目录**（仅 package.json / tsconfig.json / src / scripts / Dockerfile）→ `wxcloud run:deploy` 全量发布 → 等待部署日志。

发布后实例构建约 1-3 分钟；**新实例首启要多等约 1 分钟**（initDb 等云托管 MySQL 唤醒，重试上限 33 秒，进程退出会自动重建，最终一定起得来）。

## 安全设计（为什么这么做）

| 措施 | 防什么 |
|---|---|
| 部署用白名单暂存目录 `D:\AiProject\elderledger-deploy-src` | `.env`（各服务密钥）、node_modules、data **物理不在**上传目录里 |
| `server/.dockerignore` | 第二道保险：就算直接从 server/ 打包也排除 .env / data / *.log |
| 私钥 `$(cat ...)` 注入，不回显 | 密钥不进对话记录、不进命令行历史 |
| `.gitignore` 拉黑 `*wxcloud-key*` / `*.pem` / `.wxcloudconfig` | 凭据永不进 git |

服务级环境变量（MYSQL_HOST、MYSQL_PASSWORD 等）在**控制台 → 服务设置 → 环境变量**维护，部署包里不含、脚本不覆盖。

## 常用命令备忘

```bash
wxcloud login  -a wxf960e7a85ba37ec1 -k "$(tr -d '\r' < /d/AiProject/wxcloud-key.txt)"  # 手动登录
wxcloud logout                                  # 清除本机凭据（换密钥时先执行）
wxcloud run:deploy --help                       # 部署参数全集
wxcloud version --help                          # 版本列表等查询命令自查
```

## 故障排查

| 症状 | 处理 |
|---|---|
| 登录报 201「AppID 与私钥不正确」 | 私钥文件带 CRLF？脚本已 `tr -d '\r'`；手动登录用上面命令。仍失败 → 控制台重新生成密钥（旧的作废） |
| 部署时报环境不存在 / 无权限 | 确认 `--region`：ap-shanghai（默认）/ ap-guangzhou / ap-beijing，与环境实际地域一致 |
| 发布卡住 / 版本构建失败 | 控制台 → 版本列表看构建日志；多半是 Dockerfile 内 npm 阶段网络问题，重跑脚本即可 |
| 发布后接口 500/超时几十秒 | 看实例日志有没有 `[db] 数据库暂不可用（可能唤醒中）` —— MySQL 在唤醒，属正常，重试上限 33 秒 |
| 想回滚 | 控制台 → 版本列表 → 历史版本「发布」（CLI 不做回滚，留给人肉确认） |
| 应急通道 | 老办法仍然可用：控制台上传 `D:\AiProject\elderledger-server-deploy.zip`（tar 打包，内容同白名单） |

## 本次上线 checklist（MySQL 迁移首部署）

1. 控制台确认云托管 MySQL 已开通（8.0）、服务环境变量已加 `MYSQL_HOST` / `MYSQL_PASSWORD`
2. 跑 `bash server/scripts/deploy-cloud.sh "mysql migration"`
3. 小程序记一笔 → 列表可见 → 控制台 MySQL 数据管理里 `SELECT * FROM txn LIMIT 5` 能看到
4. 之后随便挑个空闲 30 分钟+，再记一笔还在 → 自动暂停/唤醒闭环验证完成
