// Old 3-level address service using provinces.open-api.vn
// Province → District → Ward (before administrative merger)

const API_BASE = 'https://provinces.open-api.vn/api';

export interface OldProvince {
  code: number;
  name: string;
}

export interface OldDistrict {
  code: number;
  name: string;
}

export interface OldWard {
  code: number;
  name: string;
}

// Caches
let _provinces: OldProvince[] | null = null;
const _districtCache = new Map<number, OldDistrict[]>();
const _wardCache = new Map<number, OldWard[]>();

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

function stripPrefix(name: string): string {
  return name
    .replace(/^(Thành phố |Tỉnh |Quận |Huyện |Thị xã |Phường |Xã |Thị trấn |Tp\.\s*|TP\.\s*)/i, '')
    .trim();
}

export async function getOldProvinces(): Promise<OldProvince[]> {
  if (_provinces) return _provinces;
  const res = await fetch(`${API_BASE}/?depth=1`);
  const data = await res.json();
  _provinces = data.map((p: { code: number; name: string }) => ({
    code: p.code,
    name: p.name,
  }));
  return _provinces!;
}

export async function getOldDistricts(provinceCode: number): Promise<OldDistrict[]> {
  if (_districtCache.has(provinceCode)) return _districtCache.get(provinceCode)!;
  const res = await fetch(`${API_BASE}/p/${provinceCode}?depth=2`);
  const data = await res.json();
  const districts: OldDistrict[] = (data.districts || []).map((d: { code: number; name: string }) => ({
    code: d.code,
    name: d.name,
  }));
  _districtCache.set(provinceCode, districts);
  return districts;
}

export async function getOldWards(districtCode: number): Promise<OldWard[]> {
  if (_wardCache.has(districtCode)) return _wardCache.get(districtCode)!;
  const res = await fetch(`${API_BASE}/d/${districtCode}?depth=2`);
  const data = await res.json();
  const wards: OldWard[] = (data.wards || []).map((w: { code: number; name: string }) => ({
    code: w.code,
    name: w.name,
  }));
  _wardCache.set(districtCode, wards);
  return wards;
}

// Find province by name (fuzzy)
export function matchOldProvince(provinces: OldProvince[], name: string): OldProvince | null {
  const norm = normalize(name);
  const stripped = normalize(stripPrefix(name));
  for (const p of provinces) {
    const pNorm = normalize(p.name);
    const pStripped = normalize(stripPrefix(p.name));
    if (norm === pNorm || norm === pStripped || stripped === pStripped || stripped === pNorm) {
      return p;
    }
  }
  for (const p of provinces) {
    const pStripped = normalize(stripPrefix(p.name));
    if (pStripped.length >= 4 && (norm.includes(pStripped) || stripped.includes(pStripped))) {
      return p;
    }
  }
  return null;
}

// Find district by name (fuzzy)
export function matchOldDistrict(districts: OldDistrict[], name: string): OldDistrict | null {
  const norm = normalize(name);
  const stripped = normalize(stripPrefix(name));
  for (const d of districts) {
    const dNorm = normalize(d.name);
    const dStripped = normalize(stripPrefix(d.name));
    if (norm === dNorm || norm === dStripped || stripped === dStripped || stripped === dNorm) {
      return d;
    }
  }
  for (const d of districts) {
    const dStripped = normalize(stripPrefix(d.name));
    if (dStripped.length >= 3 && (norm.includes(dStripped) || stripped.includes(dStripped))) {
      return d;
    }
  }
  return null;
}

// Search all districts in a province for a ward name, return the district+ward match
export async function findDistrictByWard(
  provinceCode: number,
  wardName: string,
): Promise<{ district: OldDistrict; ward: OldWard } | null> {
  const districts = await getOldDistricts(provinceCode);
  for (const d of districts) {
    const wards = await getOldWards(d.code);
    const wMatch = matchOldWard(wards, wardName);
    if (wMatch) return { district: d, ward: wMatch };
  }
  return null;
}

// Find ward by name (fuzzy)
export function matchOldWard(wards: OldWard[], name: string): OldWard | null {
  const norm = normalize(name);
  const stripped = normalize(stripPrefix(name));
  for (const w of wards) {
    const wNorm = normalize(w.name);
    const wStripped = normalize(stripPrefix(w.name));
    if (norm === wNorm || norm === wStripped || stripped === wStripped || stripped === wNorm) {
      return w;
    }
  }
  const numMatch = name.match(/(\d+)/);
  if (numMatch) {
    const num = numMatch[1];
    for (const w of wards) {
      const wNum = w.name.match(/(\d+)/);
      if (wNum && wNum[1] === num && /^(Phường|Xã)/.test(w.name)) {
        return w;
      }
    }
  }
  return null;
}
