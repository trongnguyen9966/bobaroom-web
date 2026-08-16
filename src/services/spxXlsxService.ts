import * as XLSX from 'xlsx';
import { OrderWithItems } from '@/types';
import { orderService } from './orderService';
import { getFullProvinceName, parseVietnameseAddress } from './addressLookupService';

const SPX_HEADERS = [
  '*Ma don hang', '*Ten nguoi nhan', '*So dien thoai',
  '*Tinh/Thanh Pho', '*Xa/Phuong',
  '*Dia chi chi tiet', 'Luu y ve dia chi', 'Ma buu chinh',
  '*Ten san pham',
  'So luong (Thong tin bat buoc khi chon Giao hang mot phan & Thu COD)',
  'Gia tien (Thong tin bat buoc khi chon Giao hang mot phan & Thu COD)',
  '*Tong can nang buu gui (KG)',
  'Chieu dai (CM)', 'Chieu rong (CM)', 'Chieu cao (CM)',
  'Ma khach hang',
  '*Gia tri don hang',
  '*Giao hang mot phan (Y/N)',
  '*Cho phep thu hang (Y/N)',
  '*Cho xem hang, khong cho thu (Y/N)',
  'Thu phi tu choi nhan hang (Y/N)',
  'Phi tu choi nhan hang can thu',
  '*Thu COD (Y/N)',
  'So tien COD',
  'buu gui gia tri cao (Y/N)',
  '*Hinh thuc thanh Toan',
  'Luu y giao hang',
  'Nhac nho dien dung so tien COD',
  'Don cho hoan thanh neu o duoi hien "Du dieu kien"',
];

export async function exportSPXToXlsx(orderIds: string[]): Promise<{ count: number }> {
  const loaded = await Promise.all(orderIds.map((id) => orderService.getById(id)));
  const orders = loaded.filter(Boolean) as OrderWithItems[];

  const rows = orders.map((order, idx) => {
    const isCod = order.paymentMethod === 'cod';
    const total = order.lockedTotal ?? order.total;
    const codAmount = Math.max(0, total - (order.deposit ?? 0));
    const stored = {
      province: order.customerProvince,
      ward: order.customerWard,
    };
    const parsed = parseVietnameseAddress(order.customerAddress);
    const province = getFullProvinceName(stored.province || parsed.province);
    const ward = stored.ward || parsed.ward;
    const items = order.items.filter((i) => !i.isGift && !i.isExchangeReturn);

    const productNames = items.map((item) => {
      const label = [item.productName, item.productColor, item.productSize]
        .filter(Boolean).join(' - ');
      return item.quantity > 1 ? `${label} x${item.quantity}` : label;
    }).join(', ');

    return [
      idx + 1,
      order.customerName,
      order.customerPhone,
      province,
      ward,
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
      30000,
      isCod ? 'Y' : 'N',
      isCod ? codAmount : '',
      total,
      'Nguoi gui tra',
      order.notes ?? '',
      '',
      'Du dieu kien',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([SPX_HEADERS, ...rows]);

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
  const filename = `SPX_${dd}${mm}${yyyy}.xlxs`;

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
