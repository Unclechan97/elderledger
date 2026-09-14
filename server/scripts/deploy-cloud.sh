#!/usr/bin/env bash
# 银龄记账 · 微信云托管 CLI 部署脚本（替代"控制台手动上传 zip"）
#
# 一次性准备：
#   1. 控制台 → 设置 → 全局设置 → CLI 密钥 → 生成/下载私钥
#   2. 私钥存到  D:\AiProject\wxcloud-key.txt   （或用环境变量 WXCLOUD_KEY_FILE 指定别处）
#   3. npm i -g @wxcloud/cli@2.3.3 --registry=https://registry.npmmirror.com
#
# 日常发版（在仓库任意目录）：
#   bash server/scripts/deploy-cloud.sh "这次改了什么"
#
# 安全设计：
#   - 部署包从"干净暂存目录"打出来，只有 package.json/tsconfig/src/scripts/Dockerfile，
#     .env、node_modules、data 物理不存在于暂存目录（.dockerignore 是第二道保险）
#   - 私钥通过 $(cat 文件) 注入，不回显、不进日志
set -euo pipefail

APP_ID="wxf960e7a85ba37ec1"
ENV_ID="elderledger-app-d7fv0hsub61bda15"
SERVICE="elderledger-app"
REGION="ap-shanghai"
KEY_FILE="${WXCLOUD_KEY_FILE:-/d/AiProject/wxcloud-key.txt}"
STAGING="${WXCLOUD_STAGING:-/d/AiProject/elderledger-deploy-src}"

[ "$STAGING" != "/" ] && [ -n "$STAGING" ] || { echo "❌ STAGING 路径非法"; exit 1; }
cd "$(dirname "$0")/.." # server/

# 0) 前置检查
command -v wxcloud >/dev/null || { echo "❌ 未安装 wxcloud CLI，见文件头注释"; exit 1; }
if [ ! -f "$KEY_FILE" ]; then
  echo "❌ 未找到 CLI 私钥：$KEY_FILE"
  echo "   控制台 → 设置 → 全局设置 → CLI 密钥 → 生成/下载，存为上述路径后重试"
  exit 1
fi

# 1) 登录（凭据写在 ~/.wxcloudconfig，已登录则跳过；换密钥先 wxcloud logout）
if [ ! -f "$HOME/.wxcloudconfig" ]; then
  echo "→ 首次登录..."
  wxcloud login -a "$APP_ID" -k "$(tr -d '\r' < "$KEY_FILE")"
fi

# 2) 重建干净暂存目录（白名单制：加新文件要显式加到这里）
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -r package.json tsconfig.json src scripts Dockerfile .dockerignore "$STAGING/"
echo "→ 暂存目录已同步：$STAGING"

# 3) 打包上传 + 全量发布（服务环境变量在控制台维护，此处不动）
cd "$STAGING"
wxcloud run:deploy . \
  -e "$ENV_ID" \
  -s "$SERVICE" \
  --region "$REGION" \
  --targetDir . \
  --dockerfile Dockerfile \
  --containerPort 3000 \
  --releaseType FULL \
  --noConfirm \
  --remark "${1:-cli 部署 $(date +%m%d-%H%M)}"

echo "✅ 部署命令已提交，实例构建约 1-3 分钟；首次启动等 MySQL 唤醒多等 ~1 分钟属正常"
