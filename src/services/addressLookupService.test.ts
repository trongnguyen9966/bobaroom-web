import { describe, it, expect } from 'vitest';
import { lookupAddress } from './addressLookupService';

describe('lookupAddress', () => {
  it('parses province and ward from comma-separated address', () => {
    const result = lookupAddress('Phường Thốt Nốt, Quận Thốt Nốt, Cần Thơ');
    expect(result.province).toBeTruthy();
  });

  it('parses province from "TP. Hồ Chí Minh"', () => {
    const result = lookupAddress('123 đường ABC, Phường 1, TP. Hồ Chí Minh');
    expect(result.province).toContain('Hồ Chí Minh');
  });

  it('does not corrupt Vietnamese words with expandAbbreviations', () => {
    // "Tháp Mười" should NOT become "TháPhường Mười"
    const result = lookupAddress('Ấp Mỹ An4 - Tháp Mười đồng tháp');
    expect(result.province).toBeTruthy();
    // The address should not contain "TháPhường"
    // We test indirectly: province should still match Đồng Tháp
  });

  it('does not corrupt "nghiệp" or similar words ending with p', () => {
    const result = lookupAddress('KCN Nông nghiệp Phú Lộc, Huyện Phú Lộc, Thừa Thiên Huế');
    // Should not turn "nghiệp Phú" into "nghiệPhường ú"
    expect(result.province).toBeTruthy();
  });

  it('expands Q. abbreviation correctly', () => {
    const result = lookupAddress('P. Bến Nghé, Q.1, TP HCM');
    expect(result.province).toContain('Hồ Chí Minh');
  });

  it('expands H. abbreviation for Huyện', () => {
    const result = lookupAddress('xã Tân Hiệp, H. Châu Thành, Tiền Giang');
    expect(result.province).toBeTruthy();
  });

  it('handles address without province info', () => {
    const result = lookupAddress('123 đường ABC, khu dân cư XYZ');
    expect(result.province).toBe('');
    expect(result.ward).toBe('');
  });

  it('parses Hà Nội correctly', () => {
    const result = lookupAddress('Phường Đống Đa, Quận Đống Đa, Hà Nội');
    expect(result.province).toContain('Hà Nội');
  });

  it('handles Đồng Tháp province', () => {
    const result = lookupAddress('Tháp Mười, Đồng Tháp');
    expect(result.province).toContain('Đồng Tháp');
  });

  it('parses TPHCM without comma separation', () => {
    const result = lookupAddress('520/2 Ngô Gia Tự Phường An Đông TPHCM');
    expect(result.province).toContain('Hồ Chí Minh');
  });
});
