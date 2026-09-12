FROM node:20-slim
# better-sqlite3 若预编译二进制拉取失败，需要本地编译工具链兜底
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
# 走 npmmirror（国内网络）。注意：新版 npm 禁止 npm config set 下划线键，必须用 npm_config_* 环境变量
ENV npm_config_registry=https://registry.npmmirror.com \
    npm_config_better_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/better-sqlite3
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# 日期边界（今天/本月）按东八区计算
ENV TZ=Asia/Shanghai
EXPOSE 3000
CMD ["npx", "tsx", "src/app.ts"]
