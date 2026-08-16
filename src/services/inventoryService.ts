import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OrderItem } from '@/types';
import { db } from './firebase';

const PRODUCTS = 'products';
const ORDERS = 'orders';

export const inventoryService = {
  /**
   * Deduct stock for all items atomically.
   * Returns list of productIds without enough stock (nothing deducted if any fail).
   */
  async deductStock(
    items: OrderItem[],
  ): Promise<{ success: boolean; outOfStockProductIds: string[] }> {
    const deductible = items.filter((i) => !i.isExchangeReturn);
    const outOfStockProductIds: string[] = [];

    await runTransaction(db, async (tx) => {
      const refs = deductible.map((i) => doc(db, PRODUCTS, i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      for (let i = 0; i < deductible.length; i++) {
        const stock = snaps[i].exists() ? (snaps[i].data()!.stock as number) : 0;
        if (stock < deductible[i].quantity) {
          outOfStockProductIds.push(deductible[i].productId);
        }
      }

      if (outOfStockProductIds.length === 0) {
        const now = Date.now();
        for (let i = 0; i < deductible.length; i++) {
          tx.update(refs[i], {
            stock: (snaps[i].data()!.stock as number) - deductible[i].quantity,
            updatedAt: now,
          });
        }
      }
    });

    return { success: outOfStockProductIds.length === 0, outOfStockProductIds };
  },

  /**
   * Restore stock when a confirmed+ order is cancelled.
   */
  async restoreStock(items: OrderItem[]): Promise<void> {
    const restorable = items.filter((i) => !i.isExchangeReturn);
    if (restorable.length === 0) return;

    await runTransaction(db, async (tx) => {
      const refs = restorable.map((i) => doc(db, PRODUCTS, i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const now = Date.now();
      for (let i = 0; i < restorable.length; i++) {
        if (snaps[i].exists()) {
          tx.update(refs[i], {
            stock: (snaps[i].data()!.stock as number) + restorable[i].quantity,
            updatedAt: now,
          });
        }
      }
    });
  },

  /**
   * After confirming an order, scan all OTHER draft orders for products
   * whose stock just dropped to 0. Remove those items.
   */
  async cleanupDraftOrdersForProducts(
    confirmedOrderId: string,
    deductedItems: { productId: string; productName: string }[],
  ): Promise<void> {
    if (deductedItems.length === 0) return;

    const productIds = deductedItems.map((i) => i.productId);
    const nameMap = new Map(deductedItems.map((i) => [i.productId, i.productName]));

    const productSnaps = await Promise.all(
      productIds.map((pid) => getDoc(doc(db, PRODUCTS, pid))),
    );
    const stockMap = new Map<string, number>();
    productSnaps.forEach((snap) => {
      if (snap.exists()) stockMap.set(snap.id, snap.data()!.stock as number);
    });

    const zeroStockIds = productIds.filter((pid) => (stockMap.get(pid) ?? 0) === 0);
    if (zeroStockIds.length === 0) return;

    const draftSnap = await getDocs(
      query(collection(db, ORDERS), where('status', '==', 'draft')),
    );

    const batch = writeBatch(db);
    const now = Date.now();

    for (const orderDoc of draftSnap.docs) {
      if (orderDoc.id === confirmedOrderId) continue;

      const items: Array<{ id: string; productId: string; quantity: number; productName?: string }> =
        orderDoc.data()?.items ?? [];

      const removedNames: string[] = [];
      const keptItems = items.filter((item) => {
        if (!zeroStockIds.includes(item.productId)) return true;
        removedNames.push(item.productName || nameMap.get(item.productId) || item.productId);
        return false;
      });

      if (removedNames.length > 0) {
        const existing: string[] = orderDoc.data()?.removedItemsNotification ?? [];
        batch.update(orderDoc.ref, {
          items: keptItems,
          removedItemsNotification: [...existing, ...removedNames],
          updatedAt: now,
        });
      }
    }

    await batch.commit();
  },

  /**
   * Return current stock for a list of product IDs.
   */
  async removeOutOfStockItems(orderId: string): Promise<string[]> {
    const orderRef = doc(db, ORDERS, orderId);
    const removedItemIds: string[] = [];

    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const orderItems: Array<{ id: string; productId: string; quantity: number }> =
        orderSnap.data()?.items ?? [];
      if (orderItems.length === 0) return;

      const productRefs = orderItems.map((i) => doc(db, PRODUCTS, i.productId));
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

      const stockMap = new Map<string, number>();
      for (const snap of productSnaps) {
        if (snap.exists()) stockMap.set(snap.id, snap.data()!.stock as number);
      }

      const keptItems = orderItems.filter((item) => {
        const stock = stockMap.get(item.productId) ?? 0;
        if (stock < item.quantity) {
          removedItemIds.push(item.id);
          return false;
        }
        return true;
      });

      if (removedItemIds.length > 0) {
        tx.update(orderRef, { items: keptItems, updatedAt: Date.now() });
      }
    });

    return removedItemIds;
  },

  async getStockMap(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const snaps = await Promise.all(productIds.map((pid) => getDoc(doc(db, PRODUCTS, pid))));
    const map = new Map<string, number>();
    snaps.forEach((snap) => {
      if (snap.exists()) map.set(snap.id, snap.data()!.stock as number);
    });
    return map;
  },
};
