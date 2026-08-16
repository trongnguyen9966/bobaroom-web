export function parseCustomerText(raw: string): { name: string; phone: string; address: string } {
  const PHONE_RE = /((?:0|\+84)[3-9]\d{8})/;
  const NAME_LABEL = /^(?:tên|ten|họ tên|ho ten|khách hàng|khach hang|name)\s*[:\-]?\s*/i;
  const PHONE_LABEL = /^(?:s[đd]t|sdt|số điện thoại|so dien thoai|phone|tel|đt|dt)\s*[:\-]?\s*/i;
  const ADDR_LABEL = /^(?:địa chỉ|dia chi|đc|dc|address|địa)\s*[,:\-]?\s*/i;
  const ADDR_KWORDS = /thôn|xóm|xã|huyện|phường|quận|tỉnh|thành phố|tp\.|đường|số nhà|ấp|khóm|khu|ngõ|ngách|tiệm|cửa hàng|shop|siêu thị|thị trấn|quốc lộ|đại lộ|ký túc xá|trường|chung cư|tổ |kp\.|kp |lô |\.p\.|\.q\.|làng /i;
  const DIVIDER_LINE = /^[=\-*#_\s]{3,}$|^[=\-]{2,}[^=\-]*[=\-]{2,}$/;
  const NOISE_LINE = /^(?:dạ|da)(?=\s|$)|^mình\s+gửi|^oke?(?=\s|$)|^nhé(?=\s|$)|^nha(?=\s|$)|^ak(?=\s|$)/i;
  const TRAILING_NOISE = /[,\s]*(?:ạ|ak|nha|nhé)\s*$/i;

  let name = '';
  let phone = '';
  let address = '';

  for (const raw_line of raw.split(/\n/)) {
    const line = raw_line.trim();
    if (!line || DIVIDER_LINE.test(line)) continue;

    const cleaned = line.replace(/^(?:dạ|da)\s+/i, '');

    if (NAME_LABEL.test(cleaned)) {
      if (!name) name = cleaned.replace(NAME_LABEL, '').trim();
      continue;
    }
    if (PHONE_LABEL.test(cleaned)) {
      const rest = cleaned.replace(PHONE_LABEL, '').trim();
      const m = rest.match(PHONE_RE);
      if (m && !phone) {
        phone = m[0];
        const after = rest.slice(rest.indexOf(m[0]) + m[0].length).replace(TRAILING_NOISE, '').trim();
        if (after && !name && after.length < 30) name = after;
      } else if (!phone) {
        phone = rest.replace(/\s/g, '');
      }
      continue;
    }
    if (ADDR_LABEL.test(cleaned)) {
      let addrContent = cleaned.replace(ADDR_LABEL, '').replace(TRAILING_NOISE, '').trim();
      const embeddedLabeled = addrContent.match(/[.\s]*(?:s[đd]t|sdt|số điện thoại|phone|tel|đt)\s*[:\-]?\s*((?:0|\+84)[3-9]\d{8})/i);
      if (embeddedLabeled) {
        if (!phone) phone = embeddedLabeled[1];
        addrContent = addrContent.slice(0, addrContent.indexOf(embeddedLabeled[0])).trim().replace(/[.,\s]+$/, '').trim();
      } else {
        const embeddedPhone = addrContent.match(PHONE_RE);
        if (embeddedPhone && !phone) {
          phone = embeddedPhone[0];
          addrContent = addrContent.replace(PHONE_RE, '').trim().replace(/[.,\s]+$/, '').trim();
        }
      }
      if (addrContent) address = addrContent;
      continue;
    }

    if (NOISE_LINE.test(line)) continue;

    const phoneMatch = line.match(PHONE_RE);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0];
      const idx = line.indexOf(phoneMatch[0]);
      const before = line.slice(0, idx).replace(PHONE_LABEL, '').trim().replace(/[.,)\s]+$/, '').trim();
      const after = line.slice(idx + phoneMatch[0].length).replace(TRAILING_NOISE, '').trim();
      const namePart = before || after;
      if (namePart && ADDR_KWORDS.test(namePart) && !address) {
        address = namePart;
      } else if (namePart && !name && namePart.length < 30) {
        name = namePart;
      } else if (namePart && !address && namePart.length >= 15) {
        address = namePart;
      }
      continue;
    }
    if (ADDR_KWORDS.test(line) && !address) {
      address = line.replace(TRAILING_NOISE, '').trim();
      continue;
    }
    if (!name && !/\d/.test(line) && line.length < 40) {
      name = line;
      continue;
    }
    if (!address && line.length > 15) {
      address = line.replace(TRAILING_NOISE, '').trim();
    }
  }

  return { name, phone, address };
}
