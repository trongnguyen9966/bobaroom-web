/**
 * Parse a customer catalog message into product SKU + quantity pairs.
 *
 * Supported formats:
 *   - A27 - Lip trắng x1
 *   - A27 - Lip trắng x2
 *   A27 - Lip trắng x1
 *   A27 x3
 */
export interface ParsedProductEntry {
  sku: string;
  quantity: number;
}

export function parseProductMessage(raw: string): ParsedProductEntry[] {
  const results: ParsedProductEntry[] = [];
  for (const rawLine of raw.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip header/footer lines (e.g. "Charm (3):", "Tổng: ...", "Phối từ ...")
    if (/^(Charm|Tổng|Phối từ)\b/i.test(line)) continue;

    // Strip leading "- " or "• " bullet and label prefix like "Vòng: "
    const cleaned = line.replace(/^[-•]\s*/, '').replace(/^[A-Za-zÀ-ỹ]+:\s*/, '');

    // Match: SKU ... xN (optionally followed by price like "— 88.000 ₫")
    const matchWithQty = cleaned.match(/^([A-Za-z0-9._-]+)\s*[-–—]?\s*.*?[xX×]\s*(\d+)/);
    if (matchWithQty) {
      const sku = matchWithQty[1].toUpperCase();
      const qty = parseInt(matchWithQty[2], 10);
      if (qty > 0) {
        const existing = results.find((r) => r.sku === sku);
        if (existing) {
          existing.quantity += qty;
        } else {
          results.push({ sku, quantity: qty });
        }
      }
      continue;
    }

    // Match: SKU - Name — price (no xN → quantity 1, e.g. builder bracelet line)
    const matchNoQty = cleaned.match(/^([A-Za-z0-9._-]+)\s*[-–—]\s*.+?[-–—]\s*[\d.,]+\s*₫?\s*$/);
    if (matchNoQty) {
      const sku = matchNoQty[1].toUpperCase();
      const existing = results.find((r) => r.sku === sku);
      if (existing) {
        existing.quantity += 1;
      } else {
        results.push({ sku, quantity: 1 });
      }
    }
  }
  return results;
}
