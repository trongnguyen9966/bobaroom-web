import { orderService } from './orderService';
import { productService } from './productService';
import { settingsService } from './settingsService';
import {
  OrderStatus,
  OrderSummary,
  RevenueStats,
  ChartDataPoint,
  DateFilter,
} from '@/types';
import {
  getStartOfDay,
  getEndOfDay,
  getStartOfMonth,
  getEndOfMonth,
  getStartOfYear,
  getEndOfYear,
  getDaysInMonth,
} from '@/utils/date';

// Revenue-eligible statuses (matching mobile app logic)
const REVENUE_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'packed',
  'shipped',
  'completed',
];

function isRevenueOrder(order: OrderSummary): boolean {
  return REVENUE_STATUSES.includes(order.status);
}

export function getDateRange(filter: DateFilter): [number, number] {
  const d = filter.date;
  if (filter.mode === 'day') {
    return [getStartOfDay(d).getTime(), getEndOfDay(d).getTime()];
  }
  if (filter.mode === 'month') {
    return [getStartOfMonth(d).getTime(), getEndOfMonth(d).getTime()];
  }
  if (filter.mode === 'custom' && filter.endDate) {
    return [getStartOfDay(d).getTime(), getEndOfDay(filter.endDate).getTime()];
  }
  return [getStartOfYear(d).getTime(), getEndOfYear(d).getTime()];
}

/**
 * Compute revenue stats — matches mobile revenueService.getStats exactly.
 * Fetches products for costPrice fallback + full order for accurate COGS.
 */
async function computeStats(orders: OrderSummary[]): Promise<RevenueStats> {
  const revenueOrders = orders.filter(isRevenueOrder);

  // Load settings for actualShippingFee and priceRounding
  const settings = await settingsService.get();
  const asfEnabled = settings.actualShippingFeeEnabled;
  const asfValue = settings.actualShippingFee;

  // Load all products for costPrice fallback (old orders may have costPrice=0)
  const allProducts = await productService.getAll();
  const productCostMap = new Map(allProducts.map((p) => [p.id, p.costPrice]));

  let totalRevenue = 0;
  let totalOperatingCost = 0;
  let totalPlatformFee = 0;
  let totalCostOfGoods = 0;
  let lockedCustomerShipping = 0;
  let lockedShopShipping = 0;
  let unlockedPaidShippingOrders = 0;
  let unlockedFreeShippingOrders = 0;

  for (const order of revenueOrders) {
    const isExchange = !!order.exchangeFromOrderId;

    if (isExchange) {
      // Exchange orders: only count positive price difference as revenue
      const priceDiff = order.exchangePriceDiff ?? 0;
      if (priceDiff <= 0) continue;
      totalRevenue += priceDiff;
    } else {
      // Normal orders: apply price rounding if enabled
      let total = order.total;
      if (settings.priceRoundingEnabled && settings.priceRoundingMode && order.orderType === 'normal') {
        const raw = Math.max(0, order.subtotal - order.discountAmount) + order.shippingFee;
        total = settings.priceRoundingMode === 'up'
          ? Math.ceil(raw / 500) * 500
          : Math.floor(raw / 500) * 500;
      }
      totalRevenue += total;
      totalOperatingCost += order.operatingCost ?? 0;
      totalPlatformFee += order.platformFeeAmount ?? 0;
    }

    // COGS: fetch full order, use stored costPrice with fallback to product costPrice
    const fullOrder = await orderService.getById(order.id);
    if (fullOrder) {
      for (const item of fullOrder.items) {
        if (!item.isGift && !item.isExchangeReturn) {
          const cp = item.costPrice > 0 ? item.costPrice : (productCostMap.get(item.productId) ?? 0);
          totalCostOfGoods += cp * item.quantity;
        }
      }
    }

    // Shipping fee logic — skip exchange orders (matching mobile)
    if (!isExchange && order.orderType === 'normal') {
      const isShipped = order.status === 'shipped' || order.status === 'completed';
      if (isShipped) {
        if (order.shippingFee > 0) {
          lockedCustomerShipping += order.lockedShippingCost ?? 0;
        } else {
          lockedShopShipping += order.lockedShippingCost ?? 0;
        }
      } else {
        if (order.shippingFee > 0) unlockedPaidShippingOrders++;
        else unlockedFreeShippingOrders++;
      }
    }
  }

  const actualFee = (asfEnabled && asfValue) ? asfValue : 0;
  const totalCustomerShipping = lockedCustomerShipping + unlockedPaidShippingOrders * actualFee;
  const totalShopShipping = lockedShopShipping + unlockedFreeShippingOrders * actualFee;
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
    totalOrders: revenueOrders.length,
    averageOrderValue: revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0,
  };
}

/** Chart revenue per order — matches mobile getDailyChart/getMonthlyChart */
function chartRevenue(o: OrderSummary): number {
  if (!isRevenueOrder(o)) return 0;
  if (o.exchangeFromOrderId) return Math.max(0, o.exchangePriceDiff ?? 0);
  return o.total;
}

function getDailyChartData(orders: OrderSummary[], filter: DateFilter): ChartDataPoint[] {
  if (filter.mode === 'day') {
    const hours: ChartDataPoint[] = [];
    for (let h = 0; h < 24; h++) {
      const d = new Date(filter.date);
      d.setHours(h, 0, 0, 0);
      const hStart = d.getTime();
      const hEnd = new Date(filter.date).setHours(h, 59, 59, 999);
      const value = orders
        .filter((o) => isRevenueOrder(o) && o.createdAt >= hStart && o.createdAt <= hEnd)
        .reduce((sum, o) => sum + chartRevenue(o), 0);
      hours.push({ label: `${h}h`, value });
    }
    return hours;
  }

  if (filter.mode === 'month') {
    const year = filter.date.getFullYear();
    const month = filter.date.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const days: ChartDataPoint[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dayStart = getStartOfDay(d).getTime();
      const dayEnd = getEndOfDay(d).getTime();
      const value = orders
        .filter((o) => isRevenueOrder(o) && o.createdAt >= dayStart && o.createdAt <= dayEnd)
        .reduce((sum, o) => sum + chartRevenue(o), 0);
      days.push({ label: String(day), value });
    }
    return days;
  }

  if (filter.mode === 'custom' && filter.endDate) {
    const start = getStartOfDay(filter.date);
    const end = getEndOfDay(filter.endDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const days: ChartDataPoint[] = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dayStart = getStartOfDay(d).getTime();
      const dayEnd = getEndOfDay(d).getTime();
      const value = orders
        .filter((o) => isRevenueOrder(o) && o.createdAt >= dayStart && o.createdAt <= dayEnd)
        .reduce((sum, o) => sum + chartRevenue(o), 0);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      days.push({ label, value });
    }
    return days;
  }

  // Year mode: monthly chart
  const year = filter.date.getFullYear();
  const months: ChartDataPoint[] = [];
  for (let m = 0; m < 12; m++) {
    const mStart = new Date(year, m, 1, 0, 0, 0, 0).getTime();
    const mEnd = new Date(year, m + 1, 0, 23, 59, 59, 999).getTime();
    const value = orders
      .filter((o) => isRevenueOrder(o) && o.createdAt >= mStart && o.createdAt <= mEnd)
      .reduce((sum, o) => sum + chartRevenue(o), 0);
    const label = `T${m + 1}`;
    months.push({ label, value });
  }
  return months;
}

export const revenueService = {
  getDateRange,
  computeStats,
  getDailyChartData,
  isRevenueOrder,
};
