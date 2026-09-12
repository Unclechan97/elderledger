import { fenToYuanText } from '../../utils/money';

Component({
  properties: {
    visible: { type: Boolean, value: false },
    kind: { type: String, value: 'expense' }, // expense | income
    amountFen: { type: Number, value: 0 },
    categoryName: { type: String, value: '' },
    icon: { type: String, value: '📦' },
    occurredOn: { type: String, value: '' },
  },

  data: {
    amountText: '0.00',
    dateText: '',
  },

  observers: {
    'amountFen, occurredOn'(amountFen: number, occurredOn: string) {
      const today = new Date();
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const yesterday = new Date(today.getTime() - 86400000);
      const dateText =
        occurredOn === fmt(today) ? `今天 · ${occurredOn}` : occurredOn === fmt(yesterday) ? `昨天 · ${occurredOn}` : occurredOn;
      this.setData({ amountText: fenToYuanText(amountFen), dateText });
    },
  },

  methods: {
    onConfirm() {
      this.triggerEvent('confirm');
    },
    onEdit() {
      this.triggerEvent('edit');
    },
    noop() {
      /* 卡片本体拦截冒泡 */
    },
  },
});
