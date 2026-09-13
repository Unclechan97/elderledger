import { getTtsAudio } from './api';

// 适老化播报：/api/tts 取 base64 音频 → 写临时文件 → InnerAudioContext 播放
// 静默失败（老人操作不被打断），同短语由服务端缓存加速

let currentAudio: WechatMiniprogram.InnerAudioContext | null = null;

const TTS_ENABLED_KEY = 'tts_enabled';
const TTS_FILE = `${wx.env.USER_DATA_PATH}/tts-current.mp3`;

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
    .then(
      (r) =>
        new Promise<void>((resolve, reject) => {
          wx.getFileSystemManager().writeFile({
            filePath: TTS_FILE,
            data: wx.base64ToArrayBuffer(r.audio_base64),
            success: () => resolve(),
            fail: (e) => reject(new Error(e.errMsg || '写音频失败')),
          });
        }),
    )
    .then(
      () =>
        new Promise<void>((resolve) => {
          stopSpeak();
          const audio = wx.createInnerAudioContext();
          currentAudio = audio;
          audio.src = TTS_FILE;
          const done = () => {
            audio.destroy();
            if (currentAudio === audio) currentAudio = null;
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
