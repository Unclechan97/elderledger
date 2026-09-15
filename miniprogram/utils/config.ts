/**
 * API 通道开关：
 * - 'cloud'：微信云托管（体验版/正式版用）。callContainer 免域名免备案，自动注入 openid 身份
 * - 'local'：本地 Docker（开发调试用）。X-User-Id 模拟身份，需在详情→本地设置勾选"不校验合法域名"
 */
export const API_MODE: 'cloud' | 'local' = 'cloud';

/** 云托管环境ID（云托管控制台-概况 里复制） */
export const CLOUD_ENV = 'elderledger-app-d7fv0hsub61bda15';

/** 云托管服务名（callContainer 多服务路由用 X-WX-SERVICE 头指定） */
export const CLOUD_SERVICE = 'elderledger-app';

/** 本地服务地址（API_MODE=local 时用；真机预览改电脑局域网 IP，如 http://192.168.1.5:3000） */
export const BASE_URL = 'http://127.0.0.1:3000';

/**
 * 云托管公网直连域名：重流量端点（语音识别/播报/图片解析）绕开 callContainer 网关。
 * 实测 callContainer 网关间歇 -606001（请求未到容器即被拒，容器直连压测 10/10 全过），
 * 账本写读仍走 callContainer（身份由网关注入 openid，不可伪造）。
 * 空字符串 = 不启用直连，全部走 callContainer。
 * 注意：正式版需把此域名加入小程序后台 request + uploadFile 合法域名
 */
export const DIRECT_BASE = 'https://elderledger-app-313318-10-1323623511.sh.run.tcloudbase.com';

/** 开放端点共享密钥（服务端 openApiGuard 校验，防第三方蹭 ASR/TTS 配额；与 server/src/config.ts 内置值一致） */
export const APP_SHARED_KEY = '6e0e224e91e18969cfe2e3a92fe79798a8a868924f9676be';
