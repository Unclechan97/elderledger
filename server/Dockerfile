FROM node:20-slim
# better-sqlite3 若预编译二进制拉取失败，需要本地编译工具链兜底
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
# 走 npmmirror（国内网络），并镜像 better-sqlite3 的二进制
RUN npm config set registry https://registry.npmmirror.com \
    && npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3 \
    && npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
EXPOSE 3000
CMD ["npx", "tsx", "src/app.ts"]
