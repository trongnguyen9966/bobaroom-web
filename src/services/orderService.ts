import {
  CreateOrderDTO,
  Order,
  OrderItem,
  OrderStatus,
  OrderSummary,
  OrderType,
  OrderWithItems,
} from '@/types';
import { generateId } from '@/utils/uuid';
import {
  collection,
  deleteDoc,
  doc,
  query as fsQuery,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const ORDERS = 'orders';

interface StoredItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  isGift: boolean;
  createdAt: number;
  productName: string;
  productSku: string;
  productColor: string;
  productSize: string;
  productImageUri: string | null;
  costPrice: number;
  isExchangeReturn?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(snap: { id: string; data(): Record<string, any> | undefined }): Order {
  const d = snap.data()!;
  return {
    id: snap.id,
    orderCode: d.orderCode ?? null,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerAddress: d.customerAddress,
    customerProvince: d.customerProvince ?? '',
    customerDistrict: d.customerDistrict ?? '',
    customerWard: d.customerWard ?? '',
    notes: d.notes ?? '',
    status: d.status,
    paymentMethod: d.paymentMethod ?? null,
    discountType: d.discountType,
    discountValue: d.discountValue,
    shippingFee: d.shippingFee,
    operatingCost: d.operatingCost ?? 0,
    orderType: d.orderType ?? 'normal',
    platformFeeType: d.platformFeeType ?? 'percent',
    platformFeeValue: d.platformFeeValue ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    confirmedAt: d.confirmedAt ?? null,
    shippedAt: d.shippedAt ?? null,
    lockedTotal: d.lockedTotal ?? null,
    lockedShippingCost: d.lockedShippingCost ?? null,
    exchangeFromOrderId: d.exchangeFromOrderId ?? null,
    exchangeOrderId: d.exchangeOrderId ?? null,
    exchangeCost: d.exchangeCost ?? 0,
    exchangePriceDiff: d.exchangePriceDiff ?? 0,
    deposit: d.deposit ?? 0,
    isWaiting: d.isWaiting ?? false,
    editingBy: d.editingBy ?? null,
  };
}

function mapStoredItem(raw: StoredItem, orderId: string): OrderItem {
  return {
    id: raw.id,
    orderId,
    productId: raw.productId,
    quantity: raw.quantity,
    unitPrice: raw.unitPrice,
    originalUnitPrice: raw.originalUnitPrice,
    isGift: raw.isGift ?? false,
    createdAt: raw.createdAt,
    productName: raw.productName ?? '',
    productSku: raw.productSku ?? '',
    productColor: raw.productColor ?? '',
    productSize: raw.productSize ?? '',
    productImageUri: raw.productImageUri ?? null,
    currentStock: 0,
    costPrice: raw.costPrice ?? 0,
    isExchangeReturn: raw.isExchangeReturn ?? false,
  };
}

export function calcTotals(order: Order, items: OrderItem[]) {
  const subtotal = items
    .filter((i) => !i.isGift)
    .reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountAmount =
    order.discountType === 'percent'
      ? subtotal * (order.discountValue / 100)
      : order.discountValue;
  const total = Math.max(0, subtotal - discountAmount) + order.shippingFee + (order.exchangeCost ?? 0);
  const platformFeeAmount =
    order.platformFeeType === 'percent'
      ? total * (order.platformFeeValue / 100)
      : order.platformFeeValue;
  const itemCount = items.filter((i) => !i.isGift).reduce((s, i) => s + i.quantity, 0);
  const itemNames = items
    .filter((i) => !i.isGift)
    .map((i) => i.productName)
    .join(', ');
  const costOfGoods = items
    .filter((i) => !i.isGift)
    .reduce((s, i) => s + (i.costPrice ?? 0) * i.quantity, 0);
  return { subtotal, discountAmount, total, platformFeeAmount, itemCount, itemNames, costOfGoods };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToSummary(snap: { id: string; data(): Record<string, any> | undefined }): OrderSummary {
  const order = mapDoc(snap);
  const storedItems: StoredItem[] = snap.data()?.items ?? [];
  const items = storedItems.map((i) => mapStoredItem(i, snap.id));
  return { ...order, ...calcTotals(order, items) };
}

export const orderService = {
  async getAll(query?: string): Promise<OrderSummary[]> {
    const snap = await getDocs(fsQuery(collection(db, ORDERS), orderBy('createdAt', 'desc')));
    let list = snap.docs.map(docToSummary).filter((o) => o.status !== 'deleted');
    if (query?.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.orderCode?.toLowerCase().includes(q) ||
          o.customerPhone.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerAddress.toLowerCase().includes(q),
      );
    }
    return list;
  },

  async getById(id: string): Promise<OrderWithItems | null> {
    const snap = await getDoc(doc(db, ORDERS, id));
    if (!snap.exists()) return null;
    const order = mapDoc(snap);
    const storedItems: StoredItem[] = snap.data()?.items ?? [];
    const items = storedItems.map((i) => mapStoredItem(i, id));
    return { ...order, items, ...calcTotals(order, items) };
  },

  async create(data: CreateOrderDTO): Promise<Order> {
    const id = generateId();
    const now = Date.now();
    const items: StoredItem[] = data.items.map((item) => ({
      id: generateId(),
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      originalUnitPrice: item.originalUnitPrice ?? item.unitPrice,
      isGift: item.isGift ?? false,
      createdAt: now,
      productName: item.productName ?? '',
      productSku: item.productSku ?? '',
      productColor: item.productColor ?? '',
      productSize: item.productSize ?? '',
      productImageUri: item.productImageUri ?? null,
      costPrice: item.costPrice ?? 0,
    }));

    const orderDoc = {
      orderCode: data.orderCode?.trim() || null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      customerProvince: data.customerProvince ?? '',
      customerDistrict: data.customerDistrict ?? '',
      customerWard: data.customerWard ?? '',
      notes: data.notes ?? '',
      status: 'draft',
      paymentMethod: data.paymentMethod ?? null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      shippingFee: data.shippingFee,
      operatingCost: 0,
      orderType: data.orderType ?? 'normal',
      platformFeeType: data.platformFeeType ?? 'percent',
      platformFeeValue: data.platformFeeValue ?? 0,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      shippedAt: null,
      lockedTotal: null,
      lockedShippingCost: null,
      deposit: data.deposit ?? 0,
      exchangeFromOrderId: data.exchangeFromOrderId ?? null,
      exchangeCost: data.exchangeCost ?? 0,
      exchangePriceDiff: 0,
      items,
    };

    await setDoc(doc(db, ORDERS, id), orderDoc);

    return {
      id,
      orderCode: orderDoc.orderCode,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      customerProvince: data.customerProvince ?? '',
      customerDistrict: data.customerDistrict ?? '',
      customerWard: data.customerWard ?? '',
      notes: data.notes ?? '',
      status: 'draft',
      paymentMethod: data.paymentMethod ?? null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      shippingFee: data.shippingFee,
      operatingCost: 0,
      orderType: data.orderType ?? 'normal',
      platformFeeType: data.platformFeeType ?? 'percent',
      platformFeeValue: data.platformFeeValue ?? 0,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      shippedAt: null,
      lockedTotal: null,
      lockedShippingCost: null,
      deposit: data.deposit ?? 0,
      exchangeFromOrderId: data.exchangeFromOrderId ?? null,
      exchangeOrderId: null,
      exchangeCost: data.exchangeCost ?? 0,
      exchangePriceDiff: 0,
      isWaiting: false,
      editingBy: null,
    };
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    extra?: {
      paymentMethod?: string;
      confirmedAt?: number;
      shippedAt?: number;
      lockedTotal?: number;
      lockedShippingCost?: number;
    },
  ): Promise<void> {
    const now = Date.now();
    const updates: Record<string, unknown> = { status, updatedAt: now };
    if (extra?.paymentMethod !== undefined) updates.paymentMethod = extra.paymentMethod;
    if (extra?.confirmedAt !== undefined) updates.confirmedAt = extra.confirmedAt;
    if (extra?.shippedAt !== undefined) updates.shippedAt = extra.shippedAt;
    if (extra?.lockedTotal !== undefined) updates.lockedTotal = extra.lockedTotal;
    if (extra?.lockedShippingCost !== undefined) updates.lockedShippingCost = extra.lockedShippingCost;
    await updateDoc(doc(db, ORDERS, id), updates);
  },

  async update(id: string, data: CreateOrderDTO): Promise<void> {
    const now = Date.now();
    const snap = await getDoc(doc(db, ORDERS, id));
    const existingItems: StoredItem[] = snap.data()?.items ?? [];
    const existingMap = new Map(existingItems.map((i) => [i.productId, i]));

    const items: StoredItem[] = data.items.map((item) => {
      const prev = existingMap.get(item.productId);
      return {
        id: prev?.id ?? generateId(),
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        originalUnitPrice: item.originalUnitPrice ?? item.unitPrice,
        isGift: item.isGift ?? false,
        createdAt: prev?.createdAt ?? now,
        productName: item.productName ?? prev?.productName ?? '',
        productSku: item.productSku ?? prev?.productSku ?? '',
        productColor: item.productColor ?? prev?.productColor ?? '',
        productSize: item.productSize ?? prev?.productSize ?? '',
        productImageUri: item.productImageUri ?? prev?.productImageUri ?? null,
        costPrice: item.costPrice ?? prev?.costPrice ?? 0,
      };
    });

    const updates: Record<string, unknown> = {
      orderCode: data.orderCode?.trim() || null,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      customerProvince: data.customerProvince ?? '',
      customerDistrict: data.customerDistrict ?? '',
      customerWard: data.customerWard ?? '',
      notes: data.notes ?? '',
      discountType: data.discountType,
      discountValue: data.discountValue,
      shippingFee: data.shippingFee,
      orderType: data.orderType ?? 'normal',
      platformFeeType: data.platformFeeType ?? 'percent',
      platformFeeValue: data.platformFeeValue ?? 0,
      deposit: data.deposit ?? 0,
      items,
      updatedAt: now,
    };
    if (data.paymentMethod !== undefined) {
      updates.paymentMethod = data.paymentMethod;
    }
    await updateDoc(doc(db, ORDERS, id), updates);
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, ORDERS, id));
  },

  async addItem(
    orderId: string,
    productId: string,
    quantity: number,
    unitPrice: number,
    productInfo?: { name: string; sku: string; color: string; size: string; imageUri: string | null; costPrice: number },
  ): Promise<void> {
    const ref = doc(db, ORDERS, orderId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const items: StoredItem[] = snap.data()?.items ?? [];
      const now = Date.now();
      const idx = items.findIndex((i) => i.productId === productId);
      if (idx >= 0) {
        items[idx] = { ...items[idx], quantity: items[idx].quantity + quantity, unitPrice };
      } else {
        items.push({
          id: generateId(),
          productId,
          quantity,
          unitPrice,
          originalUnitPrice: unitPrice,
          isGift: false,
          createdAt: now,
          productName: productInfo?.name ?? '',
          productSku: productInfo?.sku ?? '',
          productColor: productInfo?.color ?? '',
          productSize: productInfo?.size ?? '',
          productImageUri: productInfo?.imageUri ?? null,
          costPrice: productInfo?.costPrice ?? 0,
        });
      }
      tx.update(ref, { items, updatedAt: now });
    });
  },

  async updateItemQuantity(orderId: string, itemId: string, quantity: number): Promise<void> {
    const ref = doc(db, ORDERS, orderId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const items: StoredItem[] = snap.data()?.items ?? [];
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        items[idx] = { ...items[idx], quantity };
        tx.update(ref, { items, updatedAt: Date.now() });
      }
    });
  },

  async removeItem(orderId: string, itemId: string): Promise<void> {
    const ref = doc(db, ORDERS, orderId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const items: StoredItem[] = (snap.data()?.items ?? []).filter(
        (i: StoredItem) => i.id !== itemId,
      );
      tx.update(ref, { items, updatedAt: Date.now() });
    });
  },

  async updatePaymentMethod(id: string, method: string): Promise<void> {
    await updateDoc(doc(db, ORDERS, id), { paymentMethod: method, updatedAt: Date.now() });
  },

  async updateNotes(id: string, notes: string): Promise<void> {
    await updateDoc(doc(db, ORDERS, id), { notes, updatedAt: Date.now() });
  },

  async updateOperatingCost(id: string, cost: number): Promise<void> {
    await updateDoc(doc(db, ORDERS, id), { operatingCost: cost, updatedAt: Date.now() });
  },

  async getFiltered(options: {
    query?: string;
    startMs?: number;
    endMs?: number;
    statuses?: OrderStatus[];
    orderTypes?: OrderType[];
  }): Promise<OrderSummary[]> {
    const constraints = [orderBy('createdAt', 'desc')] as Parameters<typeof fsQuery>[1][];
    if (options.startMs !== undefined) constraints.push(where('createdAt', '>=', options.startMs));
    if (options.endMs !== undefined) constraints.push(where('createdAt', '<=', options.endMs));

    const snap = await getDocs(fsQuery(collection(db, ORDERS), ...constraints));
    let list = snap.docs.map(docToSummary);

    if (options.statuses && options.statuses.length > 0) {
      list = list.filter((o) => options.statuses!.includes(o.status));
    }
    if (options.orderTypes && options.orderTypes.length > 0) {
      list = list.filter((o) => options.orderTypes!.includes(o.orderType));
    }
    if (options.query?.trim()) {
      const sq = options.query.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.orderCode?.toLowerCase().includes(sq) ||
          o.customerPhone.toLowerCase().includes(sq) ||
          o.customerName.toLowerCase().includes(sq) ||
          o.customerAddress.toLowerCase().includes(sq),
      );
    }
    return list;
  },

  async checkAndCompleteShipped(): Promise<void> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const snap = await getDocs(
      fsQuery(collection(db, ORDERS), where('status', '==', 'shipped')),
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    const now = Date.now();
    snap.docs
      .filter((d) => (d.data().shippedAt ?? 0) <= sevenDaysAgo)
      .forEach((d) => batch.update(d.ref, { status: 'completed', updatedAt: now }));
    await batch.commit();
  },

  async cleanupStaleDrafts(): Promise<void> {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const snap = await getDocs(
      fsQuery(collection(db, ORDERS), where('status', '==', 'draft')),
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const lastSaved = data.updatedAt ?? data.createdAt ?? 0;
      if (lastSaved <= tenDaysAgo) {
        batch.delete(d.ref);
        count++;
      }
    }
    if (count > 0) await batch.commit();
  },

  subscribeToFiltered(
    options: {
      query?: string;
      startMs?: number;
      endMs?: number;
      statuses?: OrderStatus[];
      orderTypes?: OrderType[];
    },
    callback: (orders: OrderSummary[]) => void,
  ): () => void {
    const constraints = [orderBy('createdAt', 'desc')] as Parameters<typeof fsQuery>[1][];
    if (options.startMs !== undefined) constraints.push(where('createdAt', '>=', options.startMs));
    if (options.endMs !== undefined) constraints.push(where('createdAt', '<=', options.endMs));

    return onSnapshot(
      fsQuery(collection(db, ORDERS), ...constraints),
      (snap) => {
        if (!snap) return;
        let list = snap.docs.map(docToSummary).filter((o) => o.status !== 'deleted');

        if (options.statuses && options.statuses.length > 0) {
          list = list.filter((o) => options.statuses!.includes(o.status));
        }
        if (options.orderTypes && options.orderTypes.length > 0) {
          list = list.filter((o) => options.orderTypes!.includes(o.orderType));
        }
        if (options.query?.trim()) {
          const sq = options.query.trim().toLowerCase();
          list = list.filter(
            (o) =>
              o.orderCode?.toLowerCase().includes(sq) ||
              o.customerPhone.toLowerCase().includes(sq) ||
              o.customerName.toLowerCase().includes(sq) ||
              o.customerAddress.toLowerCase().includes(sq),
          );
        }
        callback(list);
      },
      (error) => {
        console.error('[orderService] subscribeToFiltered error:', error);
        callback([]);
      },
    );
  },

  subscribeToOrder(id: string, callback: (order: OrderWithItems | null) => void): () => void {
    return onSnapshot(doc(db, ORDERS, id), (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const order = mapDoc(snap);
      const storedItems: StoredItem[] = snap.data()?.items ?? [];
      const items = storedItems.map((i) => mapStoredItem(i, id));
      callback({ ...order, items, ...calcTotals(order, items) });
    });
  },

  async setEditingBy(orderId: string, sessionId: string): Promise<void> {
    await updateDoc(doc(db, ORDERS, orderId), { editingBy: sessionId, updatedAt: Date.now() });
  },

  async clearEditingBy(orderId: string, sessionId: string): Promise<void> {
    const snap = await getDoc(doc(db, ORDERS, orderId));
    if (snap.exists() && snap.data()?.editingBy === sessionId) {
      await updateDoc(doc(db, ORDERS, orderId), { editingBy: null, updatedAt: Date.now() });
    }
  },

  async checkEditingBy(orderId: string): Promise<string | null> {
    const snap = await getDoc(doc(db, ORDERS, orderId));
    return snap.data()?.editingBy ?? null;
  },

  async confirmWaiting(orderIds: string[]): Promise<void> {
    const batch = writeBatch(db);
    const now = Date.now();
    orderIds.forEach((id) => {
      batch.update(doc(db, ORDERS, id), { isWaiting: false, updatedAt: now });
    });
    await batch.commit();
  },
};
