import { BASE_URL } from '../utils/config';

// 适老化播报：下载 mp3 → InnerAudioContext 播放
// 静默失败（老人操作不被打断），同短语由服务端缓存加速

let currentAudio: WechatMiniprogram.InnerAudioContext | null = null;

export function speak(text: string): Promise<void> {
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
