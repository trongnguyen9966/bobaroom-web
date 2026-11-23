/**
 * Revenue Aggregation Service
 *
 * Pre-computes daily revenue stats into Firestore `revenue_daily/{YYYY-MM-DD}` docs.
 * Revenue page reads these docs instead of re-computing from raw orders each time.
 *
 * Benefits:
 * - No 1000-doc Firestore limit for year queries
 * - No N+1 getById calls for COGS
 * - Instant revenue display (just sum daily docs)
 */

import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { OrderStatus, OrderSummary, RevenueStats } from '@/types';
import { settingsService } from './settingsService';
import { calcTotals } from './orderService';

const DAILY_COLLECTION = 'revenue_daily';

const REVENUE_STATUSES: OrderStatus[] = [
  'confirmed', 'preparing', 'packed', 'shipped', 'completed',
];

function isRevenueOrder(order: OrderSummary): boolean {
  return REVENUE_STATUSES.includes(order.status);
}

export interface DailyRevenueStat {
  date: string;
  totalRevenue: number;
  totalOperatingCost: number;
  totalPlatformFee: number;
  totalCostOfGoods: number;
  orderCount: number;
  customerShippingLocked: number;
  shopShippingLocked: number;
  paidShippingUnlockedCount: number;
  freeShippingUnlockedCount: number;
  updatedAt: number;
}

function emptyDailyStat(date: string): DailyRevenueStat {
  return {
    date,
    totalRevenue: 0,
    totalOperatingCost: 0,
    totalPlatformFee: 0,
    totalCostOfGoods: 0,
    orderCount: 0,
    customerShippingLocked: 0,
    shopShippingLocked: 0,
    paidShippingUnlockedCount: 0,
    freeShippingUnlockedCount: 0,
    updatedAt: Date.now(),
  };
}

function dateToKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function timestampToKey(ts: number): string {
  return dateToKey(new Date(ts));
}

/**
 * Compute daily stat from a list of orders (all assumed to be on the same day).
 */
function computeDailyStat(orders: OrderSummary[], dateKey: string, settings: { priceRoundingEnabled: boolean; priceRoundingMode?: string }): DailyRevenueStat {
  const stat = emptyDailyStat(dateKey);
  const revenueOrders = orders.filter(isRevenueOrder);

  for (const order of revenueOrders) {
    const isExchange = !!order.exchangeFromOrderId;

    if (isExchange) {
      const priceDiff = Number(order.exchangePriceDiff) || 0;
      if (priceDiff <= 0) continue;
      stat.totalRevenue += priceDiff;
    } else {
      let total = order.total;
      if (settings.priceRoundingEnabled && settings.priceRoundingMode && order.orderType === 'normal') {
        const raw = Math.max(0, order.subtotal - order.discountAmount) + order.shippingFee;
        total = settings.priceRoundingMode === 'up'
          ? Math.ceil(raw / 500) * 500
          : Math.floor(raw / 500) * 500;
      }
      stat.totalRevenue += total;
      stat.totalOperatingCost += Number(order.operatingCost) || 0;
      stat.totalPlatformFee += Number(order.platformFeeAmount) || 0;
    }

    // COGS from summary (already computed in calcTotals, no N+1 needed)
    stat.totalCostOfGoods += Number(order.costOfGoods) || 0;

    // Shipping
    if (!isExchange && order.orderType === 'normal') {
      const isShipped = order.status === 'shipped' || order.status === 'completed';
      if (isShipped) {
        const locked = Number(order.lockedShippingCost) || 0;
        if (order.shippingFee > 0) {
          stat.customerShippingLocked += locked;
        } else {
          stat.shopShippingLocked += locked;
        }
      } else {
        if (order.shippingFee > 0) stat.paidShippingUnlockedCount++;
        else stat.freeShippingUnlockedCount++;
      }
    }

    stat.orderCount++;
  }

  stat.updatedAt = Date.now();
  return stat;
}

// ---- Internal: query orders for a single day ----

interface StoredItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  isGift?: boolean;
  createdAt: number;
  productName?: string;
  productSku?: string;
  productColor?: string;
  productSize?: string;
  productImageUri?: string | null;
  costPrice?: number;
  isExchangeReturn?: boolean;
  selectedSize?: string;
}

function mapDocToSummary(snap: { id: string; data(): Record<string, any> }): OrderSummary {
  const d = snap.data();
  const order = {
    id: snap.id,
    orderCode: d.orderCode ?? null,
    customerName: d.customerName ?? '',
    customerPhone: d.customerPhone ?? '',
    customerAddress: d.customerAddress ?? '',
    customerProvince: d.customerProvince ?? '',
    customerDistrict: d.customerDistrict ?? '',
    customerWard: d.customerWard ?? '',
    notes: d.notes ?? '',
    status: d.status,
    paymentMethod: d.paymentMethod ?? null,
    discountType: d.discountType ?? 'percent',
    discountValue: Number(d.discountValue) || 0,
    shippingFee: Number(d.shippingFee) || 0,
    operatingCost: Number(d.operatingCost) || 0,
    orderType: d.orderType ?? 'normal',
    platformFeeType: d.platformFeeType ?? 'percent',
    platformFeeValue: Number(d.platformFeeValue) || 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    confirmedAt: d.confirmedAt ?? null,
    shippedAt: d.shippedAt ?? null,
    lockedTotal: d.lockedTotal != null ? Number(d.lockedTotal) : null,
    lockedShippingCost: d.lockedShippingCost != null ? Number(d.lockedShippingCost) : null,
    exchangeFromOrderId: d.exchangeFromOrderId ?? null,
    exchangeOrderId: d.exchangeOrderId ?? null,
    exchangeCost: Number(d.exchangeCost) || 0,
    exchangePriceDiff: Number(d.exchangePriceDiff) || 0,
    deposit: Number(d.deposit) || 0,
    isWaiting: d.isWaiting ?? false,
    hasMissingSize: d.hasMissingSize ?? false,
    editingBy: d.editingBy ?? null,
  };
  const storedItems: StoredItem[] = d.items ?? [];
  const items = storedItems.map((raw) => ({
    id: raw.id,
    orderId: snap.id,
    productId: raw.productId,
    quantity: Number(raw.quantity) || 0,
    unitPrice: Number(raw.unitPrice) || 0,
    originalUnitPrice: Number(raw.originalUnitPrice) || 0,
    isGift: raw.isGift ?? false,
    createdAt: raw.createdAt,
    productName: raw.productName ?? '',
    productSku: raw.productSku ?? '',
    productColor: raw.productColor ?? '',
    productSize: raw.productSize ?? '',
    productImageUri: raw.productImageUri ?? null,
    currentStock: 0,
    costPrice: Number(raw.costPrice) || 0,
    isExchangeReturn: raw.isExchangeReturn ?? false,
    selectedSize: raw.selectedSize,
  }));
  return { ...order, ...calcTotals(order, items) };
}

async function queryOrdersForDay(dateKey: string): Promise<OrderSummary[]> {
  const [year, month, day] = dateKey.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfDay),
      where('createdAt', '<=', endOfDay),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs
    .map((d) => mapDocToSummary(d as unknown as { id: string; data(): Record<string, any> }))
    .filter((o) => o.status !== 'deleted');
}

// ---- Public API ----

/**
 * Rebuild the daily aggregation doc for a specific date.
 * Called whenever an order on that date changes status.
 */
async function rebuildDay(dateKey: string): Promise<void> {
  const orders = await queryOrdersForDay(dateKey);
  const settings = await settingsService.get();
  const stat = computeDailyStat(orders, dateKey, settings);
  await setDoc(doc(db, DAILY_COLLECTION, dateKey), stat);
}

/**
 * Rebuild daily aggregation for a date from a timestamp.
 */
async function rebuildDayFromTimestamp(ts: number): Promise<void> {
  await rebuildDay(timestampToKey(ts));
}

/**
 * Rebuild all daily docs in a date range (for migration).
 * Returns the number of days rebuilt.
 */
async function rebuildRange(startMs: number, endMs: number, onProgress?: (done: number, total: number) => void): Promise<number> {
  const start = new Date(startMs);
  const end = new Date(endMs);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const days: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(dateToKey(current));
    current.setDate(current.getDate() + 1);
  }

  for (let i = 0; i < days.length; i++) {
    await rebuildDay(days[i]);
    onProgress?.(i + 1, days.length);
  }
  return days.length;
}

/**
 * Read daily docs in a date range and return aggregated RevenueStats.
 */
async function getStats(startMs: number, endMs: number): Promise<RevenueStats> {
  const startKey = timestampToKey(startMs);
  const endKey = timestampToKey(endMs);

  const snap = await getDocs(
    query(
      collection(db, DAILY_COLLECTION),
      where('date', '>=', startKey),
      where('date', '<=', endKey),
    ),
  );

  const settings = await settingsService.get();
  const asfEnabled = settings.actualShippingFeeEnabled;
  const asfValue = settings.actualShippingFee;
  const actualFee = (asfEnabled && asfValue) ? asfValue : 0;

  let totalRevenue = 0;
  let totalOperatingCost = 0;
  let totalPlatformFee = 0;
  let totalCostOfGoods = 0;
  let totalOrders = 0;
  let customerShippingLocked = 0;
  let shopShippingLocked = 0;
  let paidShippingUnlocked = 0;
  let freeShippingUnlocked = 0;

  for (const d of snap.docs) {
    const stat = d.data() as DailyRevenueStat;
    totalRevenue += Number(stat.totalRevenue) || 0;
    totalOperatingCost += Number(stat.totalOperatingCost) || 0;
    totalPlatformFee += Number(stat.totalPlatformFee) || 0;
    totalCostOfGoods += Number(stat.totalCostOfGoods) || 0;
    totalOrders += Number(stat.orderCount) || 0;
    customerShippingLocked += Number(stat.customerShippingLocked) || 0;
    shopShippingLocked += Number(stat.shopShippingLocked) || 0;
    paidShippingUnlocked += Number(stat.paidShippingUnlockedCount) || 0;
    freeShippingUnlocked += Number(stat.freeShippingUnlockedCount) || 0;
  }

  const totalCustomerShipping = customerShippingLocked + paidShippingUnlocked * actualFee;
  const totalShopShipping = shopShippingLocked + freeShippingUnlocked * actualFee;
  const netRevenue = totalRevenue - totalOperatingCost - totalPlatformFee - totalCustomerShipping - totalShopShipping;

  return {
    totalRevenue,
    totalOperatingCost,
    totalPlatformFee,
    totalCustomerShipping,
    totalShopShipping,
    netRevenue,
    totalCostOfGoods,
    estimatedProfit: netRevenue - totalCostOfGoods,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
  };
}

export const revenueAggService = {
  rebuildDay,
  rebuildDayFromTimestamp,
  rebuildRange,
  getStats,
  dateToKey,
  timestampToKey,
};
