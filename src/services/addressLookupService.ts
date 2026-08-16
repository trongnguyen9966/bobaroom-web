import divisions from '@/data/vnDivisionsV2.json';

type Ward = string;
interface Province { n: string; fn: string; c: number; w: Ward[] }

const provinces: Province[] = divisions as Province[];

function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalize(str: string): string {
  return removeDiacritics(str).toLowerCase().trim();
}

const PROVINCE_ABBREVS: Record<string, string> = {
  'tphcm': 'Ho Chi Minh',
  'tp.hcm': 'Ho Chi Minh',
  'tp hcm': 'Ho Chi Minh',
  'tp. hcm': 'Ho Chi Minh',
  'tp.ho chi minh': 'Ho Chi Minh',
  'tp. ho chi minh': 'Ho Chi Minh',
  'thanh pho ho chi minh': 'Ho Chi Minh',
  'sai gon': 'Ho Chi Minh',
  'sg': 'Ho Chi Minh',
  'hn': 'Ha Noi',
  'ha noi': 'Ha Noi',
  'thanh pho ha noi': 'Ha Noi',
  'hp': 'Hai Phong',
  'hai phong': 'Hai Phong',
  'dn': 'Da Nang',
  'da nang': 'Da Nang',
  'ct': 'Can Tho',
  'can tho': 'Can Tho',
  'hue': 'Huế',
  'thanh pho hue': 'Huế',
};

function stripPrefix(name: string): string {
  return name
    .replace(/^(Thành phố |Tỉnh |Quận |Huyện |Thị xã |Phường |Xã |Thị trấn |Tp\.\s*|TP\.\s*)/i, '')
    .trim();
}

let _provinceMap: Map<string, Province> | null = null;
function getProvinceMap(): Map<string, Province> {
  if (_provinceMap) return _provinceMap;
  _provinceMap = new Map();
  for (const p of provinces) {
    _provinceMap.set(normalize(p.fn), p);
    _provinceMap.set(normalize(p.n), p);
    _provinceMap.set(normalize(stripPrefix(p.fn)), p);
  }
  for (const [abbr, normalized] of Object.entries(PROVINCE_ABBREVS)) {
    const found = provinces.find(p => normalize(p.n) === normalized.toLowerCase());
    if (found) _provinceMap.set(abbr, found);
  }
  return _provinceMap;
}

function expandAbbreviations(text: string): string {
  return text
    .replace(/\.p\.\s*/gi, 'Phường ')
    .replace(/\.q\.\s*/gi, 'Quận ')
    .replace(/\bQ\.?\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\bP\.?\s+(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ])/gi, 'Phường ')
    .replace(/\bH\.?\s+(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ])/gi, 'Huyện ')
    .replace(/\bTX\.?\s+(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ])/gi, 'Thị xã ')
    .replace(/\bTT\.?\s+(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ])/gi, 'Thị trấn ')
    .replace(/\bTP\.?\s+(?!HCM|hcm)(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ])/gi, 'Thành phố ')
    .trim();
}

function splitOnAdminKeywords(token: string): string[] {
  const match = token.match(/\s+(quận|huyện|thị\s+xã|tỉnh|thành\s+phố)\s+/i);
  if (match && match.index && match.index > 0) {
    return [token.slice(0, match.index).trim(), token.slice(match.index).trim()].filter(Boolean);
  }
  return [token];
}

function tokenize(address: string): string[] {
  const parts: string[] = [];
  const parenContent = address.match(/\(([^)]+)\)/g);
  if (parenContent) {
    for (const p of parenContent) {
      parts.push(p.replace(/[()]/g, '').trim());
    }
  }
  const main = address.replace(/\([^)]*\)/g, ',');
  const mainParts = main.split(/[,\-–]+/).map(t => t.trim()).filter(Boolean);
  const splitParts = mainParts.flatMap(splitOnAdminKeywords);
  return [...splitParts, ...parts];
}

function matchProvince(tokens: string[]): { province: Province; tokenIndex: number } | null {
  const pMap = getProvinceMap();

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].trim();
    const norm = normalize(token);

    if (pMap.has(norm)) return { province: pMap.get(norm)!, tokenIndex: i };

    const noSpace = norm.replace(/\s+/g, '');
    if (pMap.has(noSpace)) return { province: pMap.get(noSpace)!, tokenIndex: i };

    const noDot = norm.replace(/\./g, '').replace(/\s+/g, '');
    if (pMap.has(noDot)) return { province: pMap.get(noDot)!, tokenIndex: i };

    const stripped = normalize(stripPrefix(token));
    if (stripped && pMap.has(stripped)) return { province: pMap.get(stripped)!, tokenIndex: i };
  }

  for (let i = tokens.length - 1; i >= 0; i--) {
    const norm = normalize(tokens[i]);
    for (const p of provinces) {
      const pNorm = normalize(p.n);
      if (pNorm.length >= 4 && norm.includes(pNorm)) {
        return { province: p, tokenIndex: i };
      }
    }
  }

  return null;
}

function matchWardInToken(token: string, wards: Ward[]): string | null {
  const norm = normalize(token);
  const stripped = normalize(stripPrefix(token));

  for (const w of wards) {
    const wNorm = normalize(w);
    const wStripped = normalize(stripPrefix(w));

    if (norm === wNorm || norm === wStripped || stripped === wStripped || stripped === wNorm) {
      return w;
    }

    if (wStripped.length >= 1 && (norm.includes(wStripped) || stripped.includes(wStripped))) {
      if (wStripped.length < 4 && /^\d+$/.test(wStripped)) {
        const wardPattern = new RegExp(`(?:phuong|p\\.?)\\s*${wStripped}(?:\\s|$|,)`, 'i');
        if (wardPattern.test(norm)) return w;
      } else if (wStripped.length >= 4) {
        return w;
      }
    }
  }

  return null;
}

function matchWard(tokens: string[], wards: Ward[], usedIndices: Set<number>): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (usedIndices.has(i)) continue;
    const result = matchWardInToken(tokens[i].trim(), wards);
    if (result) return result;
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!usedIndices.has(i)) continue;
    const result = matchWardInToken(tokens[i].trim(), wards);
    if (result) return result;
  }
  return null;
}

function matchWardGlobal(tokens: string[]): { province: Province; ward: string; tokenIndex: number } | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].trim();
    for (const p of provinces) {
      const result = matchWardInToken(token, p.w);
      if (result) return { province: p, ward: result, tokenIndex: i };
    }
  }
  return null;
}

export interface AddressLookupResult {
  province: string;
  ward: string;
}

function formatProvinceName(p: Province): string {
  const centralCities = ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế'];
  if (centralCities.includes(p.n)) return `TP. ${p.n}`;
  return p.n;
}

function findProvince(name: string): Province | undefined {
  const stripped = name.startsWith('TP. ') ? name.slice(4) : name;
  return provinces.find(pr => pr.n === stripped || pr.n === name);
}

export function lookupAddress(address: string): AddressLookupResult {
  const empty: AddressLookupResult = { province: '', ward: '' };
  if (!address || !address.trim()) return empty;

  const expanded = expandAbbreviations(address);
  const tokens = tokenize(expanded);

  if (tokens.length === 0) return empty;

  const result: AddressLookupResult = { province: '', ward: '' };

  const pMatch = matchProvince(tokens);

  if (pMatch) {
    result.province = formatProvinceName(pMatch.province);
    const usedIndices = new Set([pMatch.tokenIndex]);
    const ward = matchWard(tokens, pMatch.province.w, usedIndices);
    if (ward) result.ward = ward;
  } else {
    const globalMatch = matchWardGlobal(tokens);
    if (!globalMatch) return empty;
    result.province = formatProvinceName(globalMatch.province);
    result.ward = globalMatch.ward;
  }

  return result;
}

export function getProvinceNames(): string[] {
  return provinces.map(formatProvinceName);
}

export function getWardNames(provinceName: string): string[] {
  const p = findProvince(provinceName);
  return p ? p.w : [];
}

// Old address detection
const OLD_PROVINCE_MAP: Record<string, string> = {
  'Hà Giang': 'Tuyên Quang',
  'Bắc Kạn': 'Thái Nguyên',
  'Yên Bái': 'Lào Cai',
  'Hoà Bình': 'Phú Thọ',
  'Hòa Bình': 'Phú Thọ',
  'Bắc Giang': 'Bắc Ninh',
  'Vĩnh Phúc': 'Phú Thọ',
  'Hải Dương': 'Hải Phòng',
  'Thái Bình': 'Hưng Yên',
  'Hà Nam': 'Ninh Bình',
  'Nam Định': 'Ninh Bình',
  'Quảng Bình': 'Quảng Trị',
  'Quảng Nam': 'Đà Nẵng',
  'Bình Định': 'Quảng Ngãi',
  'Phú Yên': 'Đắk Lắk',
  'Ninh Thuận': 'Khánh Hòa',
  'Bình Thuận': 'Lâm Đồng',
  'Kon Tum': 'Quảng Ngãi',
  'Đắk Nông': 'Lâm Đồng',
  'Bình Phước': 'Đồng Nai',
  'Bình Dương': 'Hồ Chí Minh',
  'Bà Rịa - Vũng Tàu': 'Hồ Chí Minh',
  'Bà Rịa Vũng Tàu': 'Hồ Chí Minh',
  'Long An': 'Tây Ninh',
  'Tiền Giang': 'Đồng Tháp',
  'Bến Tre': 'Vĩnh Long',
  'Trà Vinh': 'Vĩnh Long',
  'Kiên Giang': 'An Giang',
  'Hậu Giang': 'Cần Thơ',
  'Sóc Trăng': 'Cần Thơ',
  'Bạc Liêu': 'Cà Mau',
};

let _oldProvinceMap: Map<string, { oldName: string; newName: string }> | null = null;
function getOldProvinceMap() {
  if (_oldProvinceMap) return _oldProvinceMap;
  _oldProvinceMap = new Map();
  for (const [oldName, newName] of Object.entries(OLD_PROVINCE_MAP)) {
    _oldProvinceMap.set(normalize(oldName), { oldName, newName });
    _oldProvinceMap.set(normalize(`Tỉnh ${oldName}`), { oldName, newName });
  }
  return _oldProvinceMap;
}

export interface OldAddressWarning {
  oldProvince: string | null;
  newProvince: string | null;
  oldDistrict: string | null;
  message: string;
}

function extractOldDistrict(text: string): string | null {
  const match = text.match(/(?:Quận\s*|Q\.?\s*)(\d+)|(?:Quận|Huyện|Thị\s*xã)\s+([A-ZÀ-Ỹa-zà-ỹ][a-zà-ỹ]*(?:\s+[A-ZÀ-Ỹa-zà-ỹ][a-zà-ỹ]*)*)/i);
  if (match) return match[0].trim();
  return null;
}

export function detectOldAddress(address: string): OldAddressWarning | null {
  if (!address || !address.trim()) return null;

  const expanded = expandAbbreviations(address);
  const tokens = tokenize(expanded);
  const oldMap = getOldProvinceMap();

  let oldProvince: string | null = null;
  let newProvince: string | null = null;

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].trim();
    const norm = normalize(token);
    const stripped = normalize(stripPrefix(token));

    for (const key of [norm, stripped]) {
      if (oldMap.has(key)) {
        const val = oldMap.get(key)!;
        oldProvince = val.oldName;
        const p = provinces.find(pr => pr.n === val.newName);
        newProvince = p ? formatProvinceName(p) : val.newName;
        break;
      }
    }
    if (oldProvince) break;

    for (const [mapKey, val] of oldMap.entries()) {
      if (mapKey.length >= 6 && norm.includes(mapKey)) {
        oldProvince = val.oldName;
        const p = provinces.find(pr => pr.n === val.newName);
        newProvince = p ? formatProvinceName(p) : val.newName;
        break;
      }
    }
    if (oldProvince) break;
  }

  const oldDistrict = extractOldDistrict(address);

  if (!oldProvince && !oldDistrict) return null;

  const parts: string[] = [];
  if (oldProvince) {
    parts.push(`"${oldProvince}" đã sát nhập vào "${newProvince}".`);
  }
  if (oldDistrict) {
    parts.push(`Cấp Quận/Huyện ("${oldDistrict}") không còn tồn tại sau sát nhập.`);
  }
  parts.push('Vui lòng xin lại địa chỉ mới từ khách hàng (chỉ cần Phường/Xã/Ấp + Tỉnh/TP).');

  return {
    oldProvince,
    newProvince,
    oldDistrict,
    message: parts.join(' '),
  };
}
