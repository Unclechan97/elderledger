Component({
  properties: {
    recording: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  methods: {
    onTouchStart() {
      if (this.data.busy) return;
      this.triggerEvent('start');
    },
    onTouchEnd() {
      if (!this.data.recording) return;
      this.triggerEvent('end');
    },
  },
});
