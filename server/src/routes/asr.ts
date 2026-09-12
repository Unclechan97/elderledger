import { Router } from 'express';
import multer from 'multer';
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
    res.status(502).json({ error: 'ASR 服务不可用（检查 asr 容器是否就绪）', detail: String((e as Error).message) });
  }
});
