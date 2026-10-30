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

    // Strip leading "- " or "• " bullet
    const cleaned = line.replace(/^[-•]\s*/, '');

    // Match: SKU (alphanumeric, may contain dots/dashes) ... xN at end
    const match = cleaned.match(/^([A-Za-z0-9._-]+)\s*[-–—]?\s*.*?[xX×]\s*(\d+)\s*$/);
    if (match) {
      const sku = match[1].toUpperCase();
      const qty = parseInt(match[2], 10);
      if (qty > 0) {
        // If same SKU appears multiple times, sum quantities
        const existing = results.find((r) => r.sku === sku);
        if (existing) {
          existing.quantity += qty;
        } else {
          results.push({ sku, quantity: qty });
        }
      }
    }
  }
  return results;
}
