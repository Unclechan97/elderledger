Component({
  data: {
    keys: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['.', '0', 'del'],
    ],
  },
  methods: {
    onKey(e: WechatMiniprogram.TouchEvent) {
      const key = String(e.currentTarget.dataset.key);
      this.triggerEvent('key', { key });
    },
  },
});
