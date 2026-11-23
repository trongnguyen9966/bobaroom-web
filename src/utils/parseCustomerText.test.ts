import { describe, it, expect } from 'vitest';
import { parseCustomerText } from './parseCustomerText';

describe('parseCustomerText', () => {
  it('parses name, phone, address on separate lines', () => {
    const result = parseCustomerText(`Bảo Nhi
0766945923
số nhà 157 tổ 7 ấp phụng thạnh 1 lộ chùa sau lưng siêu thị copmax
Phường Thốt Nốt, Quận Thốt Nốt, Cần Thơ`);
    expect(result.name).toBe('Bảo Nhi');
    expect(result.phone).toBe('0766945923');
    expect(result.address).toContain('số nhà 157');
    expect(result.address).toContain('Phường Thốt Nốt');
  });

  it('appends admin-level lines to existing address', () => {
    const result = parseCustomerText(`Nguyễn Văn A
0901234567
123 đường ABC, khu dân cư XYZ
Phường 1, Quận 5, TP. Hồ Chí Minh`);
    expect(result.address).toContain('123 đường ABC');
    expect(result.address).toContain('Phường 1');
  });

  it('parses labeled text (tên:, sdt:, địa chỉ:)', () => {
    const result = parseCustomerText(`Tên: Trần Thị B
SĐT: 0912345678
Địa chỉ: 45 Nguyễn Huệ, Quận 1, TP HCM`);
    expect(result.name).toBe('Trần Thị B');
    expect(result.phone).toBe('0912345678');
    expect(result.address).toContain('45 Nguyễn Huệ');
  });

  it('parses phone on same line as name', () => {
    const result = parseCustomerText(`Minh Anh 0909123456
số 10, đường Lê Lợi, phường Bến Nghé, Quận 1`);
    expect(result.name).toBe('Minh Anh');
    expect(result.phone).toBe('0909123456');
    expect(result.address).toContain('phường Bến Nghé');
  });

  it('handles empty input', () => {
    const result = parseCustomerText('');
    expect(result.name).toBe('');
    expect(result.phone).toBe('');
    expect(result.address).toBe('');
  });

  it('skips noise lines like "dạ", "oke"', () => {
    const result = parseCustomerText(`dạ
oke
Lan Chi
0987654321
ấp Tân Lập, xã Tân Hiệp, huyện Châu Thành, Tiền Giang`);
    expect(result.name).toBe('Lan Chi');
    expect(result.phone).toBe('0987654321');
  });

  it('strips trailing noise like "ạ", "nha"', () => {
    const result = parseCustomerText(`Hồng Nhung
0933111222
số 5 đường Trần Phú, phường 3, quận Gò Vấp nha`);
    expect(result.address).not.toMatch(/nha$/);
  });

  it('parses phone with +84 prefix', () => {
    const result = parseCustomerText(`Thảo Nguyên
+84901234567
123 ấp 1, xã Bình Mỹ, Củ Chi`);
    expect(result.phone).toBe('+84901234567');
  });

  it('handles address with embedded phone', () => {
    const result = parseCustomerText(`Địa chỉ: 100 Lý Thường Kiệt, phường 14, quận 10. SĐT: 0912345678`);
    expect(result.phone).toBe('0912345678');
    expect(result.address).toContain('100 Lý Thường Kiệt');
    expect(result.address).not.toContain('0912345678');
  });

  it('handles multi-line address (street + admin + province)', () => {
    const result = parseCustomerText(`Thanh Hà
0355123456
74/D Nguyễn Thị Minh Khai
Ấp Mỹ An4 - Tháp Mười
đồng tháp`);
    expect(result.name).toBe('Thanh Hà');
    expect(result.address).toContain('Ấp Mỹ An4');
  });
});
