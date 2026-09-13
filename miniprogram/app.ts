import { API_MODE, CLOUD_ENV } from './utils/config';

App({
  onLaunch() {
    // 云托管通道：callContainer 前需 init（本地 Docker 开发走 local 模式，不需要）
    if (API_MODE === 'cloud' && wx.cloud) {
      wx.cloud.init({ env: CLOUD_ENV, traceUser: false });
    }
  },
});
