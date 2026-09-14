import { getTtsAudio } from './api';

// 适老化播报：/api/tts 取 base64 音频 → 写临时文件 → InnerAudioContext 播放
// 静默失败（老人操作不被打断），同短语由服务端缓存加速
// 注意：每次播报写【唯一文件名】——开发工具对同路径音频文件有解码缓存，
// 覆盖写入后再播可能吐上一次的内容（实测"报错后播报上一条"），唯一名从根上杜绝

let currentAudio: WechatMiniprogram.InnerAudioContext | null = null;
let lastTtsFile: string | null = null;

const TTS_ENABLED_KEY = 'tts_enabled';

/** 播报总开关（默认开）。首页导航行可一键切换 */
export function isTtsEnabled(): boolean {
  try {
    return wx.getStorageSync(TTS_ENABLED_KEY) !== false;
  } catch {
    return true;
  }
}

export function setTtsEnabled(on: boolean) {
  try {
    wx.setStorageSync(TTS_ENABLED_KEY, on);
  } catch {
    /* 存储失败下次默认开 */
  }
}

export function speak(text: string): Promise<void> {
  if (!isTtsEnabled()) return Promise.resolve();
  return getTtsAudio(text)
    .then((r) => {
      if (!r?.audio_base64) throw new Error('空音频响应'); // 防止空写覆盖出坏文件
      const file = `${wx.env.USER_DATA_PATH}/tts-${Date.now()}.mp3`;
      return new Promise<string>((resolve, reject) => {
        wx.getFileSystemManager().writeFile({
          filePath: file,
          data: wx.base64ToArrayBuffer(r.audio_base64),
          success: () => resolve(file),
          fail: (e) => reject(new Error(e.errMsg || '写音频失败')),
        });
      });
    })
    .then(
      (file) =>
        new Promise<void>((resolve) => {
          stopSpeak();
          const prev = lastTtsFile;
          lastTtsFile = file;
          const audio = wx.createInnerAudioContext();
          currentAudio = audio;
          audio.src = file;
          const done = () => {
            audio.destroy();
            if (currentAudio === audio) currentAudio = null;
            if (prev) {
              try {
                wx.getFileSystemManager().unlink({ filePath: prev, fail: () => {} });
              } catch {
                /* 清理失败无所谓 */
              }
            }
            resolve();
          };
          audio.onEnded(done);
          audio.onError(done);
          audio.play();
        }),
    )
    .catch(() => {
      /* 播报失败静默：文字提示仍在，老人操作不被打断 */
    });
}

export function stopSpeak() {
  if (currentAudio) {
    try {
      currentAudio.stop();
      currentAudio.destroy();
    } catch {
      /* 已销毁忽略 */
    }
    currentAudio = null;
  }
}
