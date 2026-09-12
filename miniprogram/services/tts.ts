import { BASE_URL } from '../utils/config';

// 适老化播报：下载 mp3 → InnerAudioContext 播放
// 静默失败（老人操作不被打断），同短语由服务端缓存加速

let currentAudio: WechatMiniprogram.InnerAudioContext | null = null;

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
  return new Promise((resolve) => {
    stopSpeak();
    wx.downloadFile({
      url: `${BASE_URL}/api/tts?text=${encodeURIComponent(text)}`,
      timeout: 8000,
      success: (r) => {
        if (r.statusCode !== 200) return resolve();
        const audio = wx.createInnerAudioContext();
        currentAudio = audio;
        audio.src = r.tempFilePath;
        const done = () => {
          audio.destroy();
          if (currentAudio === audio) currentAudio = null;
          resolve();
        };
        audio.onEnded(done);
        audio.onError(done);
        audio.play();
      },
      fail: () => resolve(),
    });
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
