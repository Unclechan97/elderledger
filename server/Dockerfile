FROM node:20-slim
# ffmpeg：把小程序传来的音频（mp3/wav/…）统一转 16k 单声道 wav 再喂识别引擎。
# 数据已迁到 MySQL（云托管 MySQL / 本地 compose mysql 容器），无原生依赖、无需编译工具链。
# apt 换清华源：deb.debian.org 国内直连极慢（曾卡 10 分钟+）
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
# 走 npmmirror（国内网络）
ENV npm_config_registry=https://registry.npmmirror.com
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# 日期边界（今天/本月）按东八区计算
ENV TZ=Asia/Shanghai
EXPOSE 3000
CMD ["npx", "tsx", "src/app.ts"]
