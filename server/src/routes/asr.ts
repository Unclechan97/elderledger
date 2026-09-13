import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { transcribeAudio } from '../services/asr';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
export const asrRouter = Router();

/** POST /api/asr  multipart 字段名: audio（wav 16k 单声道，M0 冒烟/真机录音） */
asrRouter.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '缺少音频文件（multipart 字段名 audio）' });
  try {
    const text = await transcribeAudio(req.file.buffer, req.file.mimetype || 'audio/wav');
    res.json({ text });
  } catch (e) {
    // 真实原因打日志 + 透传 detail（转写失败可能是音频内容/格式问题，不一定是服务挂了）
    console.error('[asr] 转写失败:', (e as Error).message, `mimetype=${req.file.mimetype} size=${req.file.size}`);
    // 诊断：把解不开的音频覆盖落盘（只留最近一份，真机验收后可移除）
    try {
      fs.writeFileSync('/app/data/failed-audio-last.bin', req.file.buffer);
      console.error('[asr] 原始音频已存 data/failed-audio-last.bin');
    } catch { /* dump 失败不影响主流程 */ }
    res.status(502).json({
      error: '识别服务暂时不可用，请重试或手动输入',
      detail: String((e as Error).message),
    });
  }
});
