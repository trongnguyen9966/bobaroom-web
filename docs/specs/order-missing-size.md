# Order Missing Size Spec

## Overview
Cho phép lưu đơn hàng nháp (draft) khi sản phẩm chưa chọn size, nhưng block xác nhận đơn cho đến khi tất cả sản phẩm có size được setup đều đã chọn size.

## Data Model

### Order type
```typescript
interface Order {
  hasMissingSize: boolean;  // true nếu có sản phẩm chưa chọn size khi lưu
  // ... other fields
}
```

### Firestore
- Field `hasMissingSize` lưu trong document `/orders/{id}`
- Được set khi create và update order
- Default: `false`

## Flow

### 1. Tạo đơn hàng (Create)
**Files:** `src/app/orders/create/page.tsx` (web), `src/app/orders/create.tsx` (mobile)

```
User thêm sản phẩm → User nhấn Lưu
  → Check: có item nào có sizes[] > 0 nhưng chưa chọn selectedSize?
    → Có: Hiển thị confirm dialog
      "X, Y chưa chọn size. Lưu đơn nháp không có size?"
      "(Bạn sẽ không thể xác nhận đơn cho đến khi chọn size)"
      → User nhấn Lưu → Lưu với hasMissingSize: true
      → User nhấn Hủy → Quay lại
    → Không: Lưu bình thường với hasMissingSize: false
```

### 2. Danh sách đơn hàng (List)
**Files:** `src/app/orders/page.tsx` (web), `src/app/(tabs)/index.tsx` (mobile)

- Nếu `order.hasMissingSize && order.status === 'draft'`:
  - **Web:** Card có border đỏ (`border-red-300 border-l-4 border-l-red-400 bg-red-50/30`) + badge "Thiếu size"
  - **Mobile:** Card có background đỏ nhạt + left border đỏ + tag "Thiếu size" (đỏ)

### 3. Chi tiết đơn hàng (Detail)
**Files:** `src/app/orders/[id]/page.tsx` (web), `src/app/orders/[id].tsx` (mobile)

**Missing size detection (useEffect):**
```
if order.status !== 'draft' → không check
Lấy items chưa có selectedSize
  → Fetch product data cho các items đó
  → Check product.sizes.length > 0 → item thực sự cần size
  → Set hasMissingSize = true, missingSizeProductIds = Set<string>
```

**UI:**
- Warning banner: "Có sản phẩm chưa chọn size. Chỉnh sửa đơn để chọn size trước khi xác nhận."
- Nút "Xác nhận đơn hàng": disabled khi hasMissingSize
- Item row: red border-left + badge "Chưa chọn size" nếu `!item.selectedSize && missingSizeProductIds.has(item.productId)`

## Visual Summary

```
┌─ Danh sách đơn ──────────────────┐
│ ┌──────────────────────────────┐  │
│ │🔴 Bảo Nhi      [Thiếu size] │  │
│ │   3 sản phẩm   196.800đ     │  │
│ └──────────────────────────────┘  │
└───────────────────────────────────┘

┌─ Chi tiết đơn ────────────────────┐
│ ⚠ Có sản phẩm chưa chọn size     │
│                                    │
│ 🔴│ Voi xanh      [Chưa chọn size]│
│   │ xanh dương                     │
│   │                                │
│   │ Mèo disney                     │
│   │ F06                            │
│                                    │
│ [Xác nhận đơn hàng] ← DISABLED    │
└────────────────────────────────────┘
```
