import {
  collection,
  getDocs,
  query as fsQuery,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { Product, ProductCategory } from '@/types';
import { db } from './firebase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(snap: { id: string; data(): Record<string, any> | undefined }): Product {
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    sku: d.sku ?? '',
    color: d.color,
    size: d.size ?? '',
    categoryId: d.categoryId ?? null,
    categoryName: d.categoryName ?? null,
    qrCode: d.qrCode ?? null,
    imageUri: d.imageUri ?? null,
    realImageUris: d.realImageUris ?? [],
    price: d.price,
    costPrice: 0, // never expose cost price publicly
    stock: d.stock,
    sizes: d.sizes ?? [],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCategory(snap: { id: string; data(): Record<string, any> | undefined }): ProductCategory {
  const d = snap.data()!;
  return { id: snap.id, name: d.name, createdAt: d.createdAt };
}

export interface TopSeller {
  productId: string;
  quantity: number;
}

interface StoredItem {
  productId: string;
  quantity: number;
  isExchangeReturn?: boolean;
}

export const catalogService = {
  subscribeToProducts(callback: (products: Product[]) => void): () => void {
    return onSnapshot(
      fsQuery(collection(db, 'products'), orderBy('createdAt', 'desc')),
      (snap) => callback(snap.docs.map(mapProduct)),
    );
  },

  subscribeToCategories(callback: (categories: ProductCategory[]) => void): () => void {
    return onSnapshot(
      fsQuery(collection(db, 'categories'), orderBy('name', 'asc')),
      (snap) => callback(snap.docs.map(mapCategory)),
    );
  },

  async getTopSellers(period: 'month' | 'year'): Promise<TopSeller[]> {
    const now = new Date();
    const start = period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      : new Date(now.getFullYear(), 0, 1).getTime();
    const snap = await getDocs(collection(db, 'orders'));
    const counts = new Map<string, number>();

    for (const d of snap.docs) {
      const data = d.data();
      const status = data?.status as string;
      if (status === 'cancelled' || status === 'deleted') continue;
      const createdAt = data?.createdAt as number;
      if (createdAt < start) continue;

      const items: StoredItem[] = data?.items ?? [];
      for (const item of items) {
        if (item.isExchangeReturn) continue;
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity);
      }
    }

    return Array.from(counts.entries())
      .map(([productId, quantity]) => ({ productId, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 20);
  },

  async getAllSoldCounts(): Promise<Map<string, number>> {
    const snap = await getDocs(collection(db, 'orders'));
    const counts = new Map<string, number>();
    for (const d of snap.docs) {
      const data = d.data();
      const status = data?.status as string;
      if (status === 'cancelled' || status === 'deleted') continue;
      const items: StoredItem[] = data?.items ?? [];
      for (const item of items) {
        if (item.isExchangeReturn) continue;
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return counts;
  },
};
