import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { transcribeAudio } from '../services/asr';
import { parseTextCore } from './parse';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
export const asrRouter = Router();

/** POST /api/asr —— 双通道：multipart 字段 audio（本地 wx.uploadFile）| JSON { audio_base64, mime }（云端 callContainer） */
asrRouter.post('/', upload.single('audio'), async (req, res) => {
  let audio: Buffer | undefined;
  let mime = 'audio/wav';
  if (req.file) {
    audio = req.file.buffer;
    mime = req.file.mimetype || mime;
  } else {
    const b64 = String((req.body as { audio_base64?: string })?.audio_base64 || '');
    if (b64) {
      audio = Buffer.from(b64, 'base64');
      mime = String((req.body as { mime?: string })?.mime || mime);
    }
  }
  if (!audio || !audio.length) {
    return res.status(400).json({ error: '缺少音频（multipart 字段 audio 或 JSON audio_base64）' });
  }
  try {
    const text = await transcribeAudio(audio, mime);
    // 同响应捎带解析结果：一次录音只打一次网关（省掉 /api/parse/text 那次调用，
    // callContainer 有频控，每次记账少一半请求）；解析异常时客户端回退到单独调用
    let parse;
    try {
      parse = await parseTextCore(String(text));
    } catch (pe) {
      console.warn('[asr] 解析异常，客户端将回退:', (pe as Error).message);
    }
    res.json({ text, parse });
  } catch (e) {
    // 真实原因打日志 + 透传 detail（转写失败可能是音频内容/格式问题，不一定是服务挂了）
    console.error('[asr] 转写失败:', (e as Error).message, `mimetype=${mime} size=${audio.length}`);
    // 诊断：把解不开的音频覆盖落盘（只留最近一份，真机验收后可移除）
    try {
      fs.writeFileSync('/app/data/failed-audio-last.bin', audio);
      console.error('[asr] 原始音频已存 data/failed-audio-last.bin');
    } catch { /* dump 失败不影响主流程 */ }
    res.status(502).json({
      error: '识别服务暂时不可用，请重试或手动输入',
      detail: String((e as Error).message),
    });
  }
});
