import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { AppSettings } from '@/types';

const DOC_PATH = 'app_settings/global';

const DEFAULTS: AppSettings = {
  freeShippingEnabled: false,
  freeShippingThreshold: 500000,
  freeShippingPaymentMethod: 'paid',
  priceRoundingEnabled: false,
  priceRoundingMode: 'down',
  actualShippingFeeEnabled: false,
  actualShippingFee: 0,
  giftItemsEnabled: false,
  promotionEnabled: false,
  promotionDiscountType: 'percent',
  promotionDiscountValue: 0,
  confirmationRequiredEnabled: false,
  confirmationRequiredCategoryIds: [],
  exchangeEnabled: false,
  exchangeCategoryIds: [],
  googleSheetsId: '',
  driveFolderId: '',
  waitingOrderEnabled: false,
  waitingOrderCategoryIds: [],
  defaultShippingFeeEnabled: false,
  defaultShippingFee: 0,
};

function merge(data: Record<string, unknown>): AppSettings {
  return { ...DEFAULTS, ...data } as AppSettings;
}

export const settingsService = {
  async get(): Promise<AppSettings> {
    const snap = await getDoc(doc(db, DOC_PATH));
    if (!snap.exists()) {
      await setDoc(doc(db, DOC_PATH), DEFAULTS);
      return DEFAULTS;
    }
    return merge(snap.data());
  },

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    await updateDoc(doc(db, DOC_PATH), { [key]: value });
  },

  async setMultiple(entries: Partial<AppSettings>): Promise<void> {
    await updateDoc(doc(db, DOC_PATH), entries);
  },

  subscribe(callback: (settings: AppSettings) => void): () => void {
    return onSnapshot(doc(db, DOC_PATH), (snap) => {
      if (snap.exists()) {
        callback(merge(snap.data()));
      } else {
        callback(DEFAULTS);
      }
    });
  },

  applyRounding(amount: number, mode: 'up' | 'down'): number {
    const remainder = amount % 1000;
    if (remainder === 0) return amount;
    const base = amount - remainder;
    if (mode === 'down') {
      return remainder >= 500 ? base + 500 : base;
    }
    return remainder > 500 ? base + 1000 : base + 500;
  },
};
