# Calendar Filter Spec

## Overview
Component `CalendarPicker` cho phép filter đơn hàng và doanh thu theo 4 chế độ: Ngày, Tháng, Năm, Tùy chọn (custom range).

## Component
**File:** `src/components/dashboard/CalendarPicker.tsx`

## Modes

### Ngày (day)
- Hiển thị lưới calendar tháng hiện tại
- Click ngày → filter theo ngày đó
- Ngày hiện tại: vòng tròn xanh (ring-2 ring-primary)
- Ngày được chọn: nền xanh primary, chữ trắng
- Navigation: nút < > chuyển tháng

### Tháng (month)
- Hiển thị grid 4x3 (Th1 → Th12)
- Click tháng → filter tất cả đơn trong tháng đó
- Navigation: nút < > chuyển năm
- Tháng hiện tại: nền xanh nhạt
- Tháng được chọn: nền primary, chữ trắng

### Năm (year)
- Hiển thị grid 4x3 (12 năm, center ± 5)
- Click năm → filter tất cả đơn trong năm đó
- Navigation: nút < > chuyển khoảng năm
- Năm hiện tại: nền xanh nhạt
- Năm được chọn: nền primary, chữ trắng

### Tùy chọn (custom)
- Hiển thị calendar giống mode Ngày
- 2 bước chọn: start date → end date
- Hint text: "Chọn ngày bắt đầu" / "Chọn ngày kết thúc"
- Range highlight: ngày đầu/cuối = vòng tròn primary, ngày giữa = nền primary/15
- Nếu end date < start date → tự swap

## DateFilter Interface
```typescript
interface DateFilter {
  mode: 'day' | 'month' | 'year' | 'custom';
  date: Date;
  endDate?: Date;
}
```

## Usage

### Orders page (`src/app/orders/page.tsx`)
- Thay thế nút mũi tên < > cũ bằng CalendarPicker
- `getRange(filter)` → trả về `{ start, end }` timestamp cho Firestore query

### Revenue page (`src/components/dashboard/CalendarPicker.tsx`)
- Đã có sẵn CalendarPicker

## Nút "Hôm nay"
- Luôn hiển thị ở cuối calendar
- Click → chuyển viewDate và filter date về ngày hiện tại
- Mode custom: reset cả start + end về today
