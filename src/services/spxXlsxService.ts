import * as XLSX from 'xlsx';
import { OrderWithItems } from '@/types';
import { orderService } from './orderService';
import { getFullProvinceName, parseVietnameseAddress } from './addressLookupService';

export type SpxAddressFormat = '2level' | '3level';

const SPX_HEADERS_2LEVEL = [
  '*Mã đơn hàng', '*Tên người nhận', '*Số điện thoại',
  '*Tỉnh/Thành Phố', '*Xã/Phường',
  '*Địa chỉ chi tiết', 'Lưu ý về địa chỉ', 'Mã bưu chính',
  '*Tên sản phẩm',
  'Số lượng (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  'Giá tiền (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  '*Tổng cân nặng bưu gửi (KG)',
  'Chiều dài (CM)', 'Chiều rộng (CM)', 'Chiều cao (CM)',
  'Mã khách hàng',
  '*Giá trị đơn hàng',
  '*Giao hàng một phần (Y/N)',
  '*Cho phép thử hàng (Y/N)',
  '*Cho xem hàng, không cho thử (Y/N)',
  'Thu phí từ chối nhận hàng (Y/N)',
  'Phí từ chối nhận hàng cần thu',
  '*Thu COD (Y/N)',
  'Số tiền COD',
  'bưu gửi giá trị cao (Y/N)',
  '*Hình thức thanh Toán',
  'Lưu ý giao hàng',
  'Nhắc nhở điền đúng số tiền COD',
  'Đơn chờ hoàn thành nếu ở dưới hiện "Đủ điều kiện"',
];

const SPX_HEADERS_3LEVEL = [
  '*Mã đơn hàng', '*Tên người nhận', '*Số điện thoại',
  '*Tỉnh/Thành Phố', '*Quận/Huyện', '*Xã/Phường',
  '*Địa chỉ chi tiết', 'Lưu ý về địa chỉ', 'Mã bưu chính',
  '*Tên sản phẩm',
  'Số lượng (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  'Giá tiền (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  '*Tổng cân nặng bưu gửi (KG)',
  'Chiều dài (CM)', 'Chiều rộng (CM)', 'Chiều cao (CM)',
  'Mã khách hàng',
  '*Giá trị đơn hàng',
  '*Giao hàng một phần (Y/N)',
  '*Cho phép thử hàng (Y/N)',
  '*Cho xem hàng, không cho thử (Y/N)',
  'Thu phí từ chối nhận hàng (Y/N)',
  'Phí từ chối nhận hàng cần thu',
  '*Thu COD (Y/N)',
  'Số tiền COD',
  'bưu gửi giá trị cao (Y/N)',
  '*Hình thức thanh Toán',
  'Lưu ý giao hàng',
  'Nhắc nhở điền đúng số tiền COD',
  'Đơn chờ hoàn thành nếu ở dưới hiện "Đủ điều kiện"',
];

function buildRow(order: OrderWithItems, idx: number, format: SpxAddressFormat): unknown[] {
  const isCod = order.paymentMethod === 'cod';
  const total = order.lockedTotal ?? order.total;
  const codAmount = Math.max(0, total - (order.deposit ?? 0));
  const stored = {
    province: order.customerProvince,
    ward: order.customerWard,
    district: order.customerDistrict,
  };
  const parsed = parseVietnameseAddress(order.customerAddress);
  const province = getFullProvinceName(stored.province || parsed.province);
  const ward = stored.ward || parsed.ward;
  const district = stored.district || '';
  const items = order.items.filter((i) => !i.isGift && !i.isExchangeReturn);

  const productNames = items.map((item) => {
    const label = [item.productName, item.productColor, item.selectedSize || item.productSize]
      .filter(Boolean).join(' - ');
    return item.quantity > 1 ? `${label} x${item.quantity}` : label;
  }).join(', ');

  const commonAfterAddress = [
    order.customerAddress,
    '',
    '',
    productNames,
    1,
    total,
    '1.00',
    '', '', '',
    '',
    total,
    'N',
    'N',
    'Y',
    'Y',
    50000,
    isCod ? 'Y' : 'N',
    isCod ? codAmount : '',
    total,
    'Người gửi trả',
    order.notes ?? '',
    '',
    'Đủ điều kiện',
  ];

  if (format === '3level') {
    return [
      idx + 1,
      order.customerName,
      order.customerPhone,
      province,
      district,
      ward,
      ...commonAfterAddress,
    ];
  }

  return [
    idx + 1,
    order.customerName,
    order.customerPhone,
    province,
    ward,
    ...commonAfterAddress,
  ];
}

export async function exportSPXToXlsx(
  orderIds: string[],
  format: SpxAddressFormat = '2level',
): Promise<{ count: number }> {
  const loaded = await Promise.all(orderIds.map((id) => orderService.getById(id)));
  const orders = loaded.filter(Boolean) as OrderWithItems[];

  const headers = format === '3level' ? SPX_HEADERS_3LEVEL : SPX_HEADERS_2LEVEL;
  const rows = orders.map((order, idx) => buildRow(order, idx, format));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Format phone column (C, index 2) as text to preserve leading zero
  if (ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    if (!ws['!cols']) ws['!cols'] = [];
    ws['!cols'][2] = { wch: 15 };
    for (let r = 1; r <= range.e.r; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 2 });
      if (ws[cellRef]) {
        ws[cellRef].t = 's';
        ws[cellRef].z = '@';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SPX');

  const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const suffix = format === '3level' ? '_3cap' : '';
  const filename = `SPX_${dd}${mm}${yyyy}${suffix}.xlsx`;

  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { count: orders.length };
}
