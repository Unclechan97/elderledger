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
