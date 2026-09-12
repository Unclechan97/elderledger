import { Category } from '../../services/api';

Component({
  properties: {
    categories: { type: Array, value: [] as Category[] },
    selectedId: { type: Number, value: 0 },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const id = Number(e.currentTarget.dataset.id);
      this.triggerEvent('select', { id });
    },
  },
});
