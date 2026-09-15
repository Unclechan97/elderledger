import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// 开放端点（语音识别/播报/解析，无用户数据）走公网域名直连时暴露在外，
// 用共享密钥挡住第三方蹭腾讯 ASR/TTS 配额。密钥内置小程序源码，可被提取——
// 损失上限是配额消耗；账本数据的身份与写权限由 callContainer 网关侧 openid 保证，不依赖此头
const OPEN_PATH_RE = /^\/api\/(asr|tts|parse)(\/|$)/;

export function openApiGuard(req: Request, res: Response, next: NextFunction) {
  if (!OPEN_PATH_RE.test(req.path)) return next();
  if (req.header('x-app-key') === config.appSharedKey) return next();
  return res.status(401).json({ error: '未授权的访问' });
}
