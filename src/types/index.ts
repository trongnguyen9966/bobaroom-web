export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'preparing'
  | 'packed'
  | 'shipped'
  | 'cancelled'
  | 'completed'
  | 'deleted';

export type DiscountType = 'percent' | 'vnd';
export type PaymentMethod = 'paid' | 'cod';
export type OrderType = 'normal' | 'tiktok' | 'shopee';
export type PlatformFeeType = 'percent' | 'vnd';

export interface ProductCategory {
  id: string;
  name: string;
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  color: string;
  size: string;
  categoryId: string | null;
  categoryName: string | null;
  qrCode: string | null;
  imageUri: string | null;
  price: number;
  costPrice: number;
  stock: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProductDTO {
  name: string;
  sku: string;
  color: string;
  size: string;
  categoryId: string | null;
  qrCode: string | null;
  imageUri: string | null;
  price: number;
  costPrice: number;
  stock: number;
}

export type UpdateProductDTO = Partial<CreateProductDTO>;

export interface AppSettings {
  freeShippingEnabled: boolean;
  freeShippingThreshold: number;
  freeShippingPaymentMethod: 'paid' | 'cod' | 'both';
  priceRoundingEnabled: boolean;
  priceRoundingMode: 'up' | 'down';
  actualShippingFeeEnabled: boolean;
  actualShippingFee: number;
  giftItemsEnabled: boolean;
  promotionEnabled: boolean;
  promotionDiscountType: 'percent' | 'vnd';
  promotionDiscountValue: number;
  confirmationRequiredEnabled: boolean;
  confirmationRequiredCategoryIds: string[];
  exchangeEnabled: boolean;
  exchangeCategoryIds: string[];
  googleSheetsId: string;
  driveFolderId: string;
  waitingOrderEnabled: boolean;
  waitingOrderCategoryIds: string[];
  defaultShippingFeeEnabled: boolean;
  defaultShippingFee: number;
}

export interface Order {
  id: string;
  orderCode: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerProvince: string;
  customerDistrict: string;
  customerWard: string;
  notes: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  discountType: DiscountType;
  discountValue: number;
  shippingFee: number;
  operatingCost: number;
  orderType: OrderType;
  platformFeeType: PlatformFeeType;
  platformFeeValue: number;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  shippedAt: number | null;
  lockedTotal: number | null;
  lockedShippingCost: number | null;
  exchangeFromOrderId: string | null;
  exchangeOrderId: string | null;
  exchangeCost: number;
  exchangePriceDiff: number;
  deposit: number;
  isWaiting: boolean;
  editingBy: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
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
  currentStock: number;
  costPrice: number;
  isExchangeReturn?: boolean;
}

export interface OrderSummary extends Order {
  subtotal: number;
  discountAmount: number;
  total: number;
  platformFeeAmount: number;
  itemCount: number;
  itemNames: string;
  costOfGoods: number;
}

export interface OrderWithItems extends OrderSummary {
  items: OrderItem[];
}

export interface CreateOrderDTO {
  orderCode?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerProvince?: string;
  customerDistrict?: string;
  customerWard?: string;
  notes?: string;
  paymentMethod?: PaymentMethod | null;
  discountType: DiscountType;
  discountValue: number;
  shippingFee: number;
  orderType?: OrderType;
  platformFeeType?: PlatformFeeType;
  platformFeeValue?: number;
  deposit?: number;
  exchangeFromOrderId?: string | null;
  exchangeCost?: number;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice?: number;
    isGift?: boolean;
    productName?: string;
    productSku?: string;
    productColor?: string;
    productSize?: string;
    productImageUri?: string | null;
    costPrice?: number;
  }[];
}

export interface RevenueStats {
  totalRevenue: number;
  totalOperatingCost: number;
  totalPlatformFee: number;
  totalCustomerShipping: number;
  totalShopShipping: number;
  netRevenue: number;
  totalCostOfGoods: number;
  estimatedProfit: number;
  totalOrders: number;
  averageOrderValue: number;
}

export interface DateFilter {
  mode: 'day' | 'month' | 'year' | 'custom';
  date: Date;
  endDate?: Date;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}
