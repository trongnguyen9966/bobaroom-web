# Address Parsing Spec

## Overview
Hệ thống parse địa chỉ tiếng Việt từ text khách hàng → tách thành các trường: province, district, ward, street address.

## Components

### 1. `parseCustomerText(raw: string)`
**File:** `src/utils/parseCustomerText.ts`

Parse text dán từ Zalo/Facebook → tách `name`, `phone`, `address`.

**Rules:**
- Dòng có label (Tên:, SĐT:, Địa chỉ:) → ưu tiên parse theo label
- Dòng có số điện thoại (0xxx hoặc +84xxx, 10 số) → phone
- Dòng có keyword địa chỉ (phường, quận, ấp, số nhà, siêu thị...) → address
- Dòng không có số, < 40 ký tự → name
- **Multi-line address:** Nếu đã có address mà gặp thêm dòng có keyword hành chính → nối vào address bằng `, `
- Bỏ qua noise lines: "dạ", "oke", "mình gửi"
- Strip trailing noise: "ạ", "nha", "nhé", "ak"

**Example:**
```
Input:
  Bảo Nhi
  0766945923
  số nhà 157 tổ 7 ấp phụng thạnh 1 lộ chùa sau lưng siêu thị copmax
  Phường Thốt Nốt, Quận Thốt Nốt, Cần Thơ

Output:
  name: "Bảo Nhi"
  phone: "0766945923"
  address: "số nhà 157 tổ 7 ấp phụng thạnh 1..., Phường Thốt Nốt, Quận Thốt Nốt, Cần Thơ"
```

### 2. `expandAbbreviations(text: string)`
**File:** `src/services/addressLookupService.ts` (internal function)

Mở rộng viết tắt địa chỉ: P. → Phường, Q. → Quận, H. → Huyện, TX. → Thị xã, TT. → Thị trấn, TP. → Thành phố.

**Vietnamese word boundary fix:**
- Dùng `(?<![a-zà-ỹ])` thay vì `\b` để tránh match sai trong từ tiếng Việt
- Lý do: `\b` sai khi ký tự Unicode NFD tạo word boundary giả (ví dụ: "tháp" → "tháPhường")
- Chỉ áp dụng cho P và H (single-letter, dễ trùng)

**Edge cases đã fix:**
| Input | Trước fix | Sau fix |
|-------|-----------|---------|
| `Tháp Mười` | `TháPhường Mười` | `Tháp Mười` (không đổi) |
| `nghiệp Phú` | `nghiệPhường ú` | `nghiệp Phú` (không đổi) |
| `P. Bến Nghé` | `Phường Bến Nghé` | `Phường Bến Nghé` ✓ |

### 3. `lookupAddress(address: string)`
**File:** `src/services/addressLookupService.ts`

Parse address string → `{ province, ward, district }` bằng cách:
1. `expandAbbreviations` → mở rộng viết tắt
2. `tokenize` → tách token theo dấu phẩy, gạch ngang
3. Match token với database tỉnh/thành (hardcoded)
4. Match phường/xã từ database

## Address Levels

### 2-level (Mới - sau sáp nhập)
- **Tỉnh/Thành phố** + **Phường/Xã/Ấp**
- API: hardcoded database trong `addressLookupService.ts`
- SPX Export: ward → cột `Quận/Huyện`, cột `Xã/Phường` trống

### 3-level (Cũ - trước sáp nhập)
- **Tỉnh/Thành phố** + **Quận/Huyện** + **Phường/Xã**
- API: `provinces.open-api.vn` (`oldAddressService.ts`)
- SPX Export: district → cột `Quận/Huyện`, ward → cột `Xã/Phường`

## SPX Export Logic
**File:** `src/services/spxXlsxService.ts`

```
if (district) {
  Quận/Huyện = district
  Xã/Phường = ward
} else {
  Quận/Huyện = ward
  Xã/Phường = ""
}
```
