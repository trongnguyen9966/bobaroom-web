import { OrderWithItems, OrderItem } from "@/types";
import { formatVND } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { getStatusLabel } from "@/components/ui/OrderStatusBadge";

const PADDING = 32;
const IMG_SIZE = 40;
const FONT = "system-ui, -apple-system, sans-serif";

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  y: number;
}

function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
}

function drawText(
  d: DrawContext,
  text: string,
  x: number,
  opts: { size?: number; color?: string; bold?: boolean; maxWidth?: number } = {},
) {
  const { size = 14, color = "#111827", bold = false } = opts;
  setFont(d.ctx, size, bold);
  d.ctx.fillStyle = color;
  d.ctx.textAlign = "left";
  const maxW = opts.maxWidth ?? d.width - x - PADDING;

  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (d.ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  for (const l of lines) {
    d.ctx.fillText(l, x, d.y, maxW);
    d.y += size + 4;
  }
}

function drawLine(d: DrawContext, color = "#e5e7eb") {
  d.y += 8;
  d.ctx.strokeStyle = color;
  d.ctx.lineWidth = 1;
  d.ctx.beginPath();
  d.ctx.moveTo(PADDING, d.y);
  d.ctx.lineTo(d.width - PADDING, d.y);
  d.ctx.stroke();
  d.y += 12;
}

function drawRow(
  d: DrawContext,
  left: string,
  right: string,
  opts: { size?: number; leftColor?: string; rightColor?: string; bold?: boolean } = {},
) {
  const { size = 14, leftColor = "#6b7280", rightColor = "#111827", bold = false } = opts;
  setFont(d.ctx, size, bold);
  d.ctx.textAlign = "left";
  d.ctx.fillStyle = leftColor;
  d.ctx.fillText(left, PADDING, d.y);
  d.ctx.textAlign = "right";
  d.ctx.fillStyle = rightColor;
  d.ctx.fillText(right, d.width - PADDING, d.y);
  d.y += size + 8;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  // Use proxy to avoid CORS issues with Firebase Storage
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = proxyUrl;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function drawProductImage(
  d: DrawContext,
  img: HTMLImageElement | null,
  x: number,
  yPos: number,
) {
  const { ctx } = d;
  if (img) {
    ctx.save();
    drawRoundedRect(ctx, x, yPos, IMG_SIZE, IMG_SIZE, 8);
    ctx.clip();
    ctx.drawImage(img, x, yPos, IMG_SIZE, IMG_SIZE);
    ctx.restore();
  } else {
    // Placeholder
    ctx.fillStyle = "#f3f4f6";
    drawRoundedRect(ctx, x, yPos, IMG_SIZE, IMG_SIZE, 8);
    ctx.fill();
    setFont(ctx, 16, false);
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.fillText("📦", x + IMG_SIZE / 2, yPos + IMG_SIZE / 2 + 6);
  }
}

export async function generateOrderImage(order: OrderWithItems): Promise<Blob> {
  const WIDTH = 600;
  const scale = 2;

  // Pre-load all product images
  const imageMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    order.items.map(async (item) => {
      if (item.productImageUri) {
        const img = await loadImage(item.productImageUri);
        imageMap.set(item.id, img);
      }
    }),
  );

  const blob = await renderToBlob(order, imageMap, WIDTH, scale);
  if (blob) return blob;
  throw new Error("Failed to create image");
}

async function renderToBlob(
  order: OrderWithItems,
  imageMap: Map<string, HTMLImageElement | null>,
  WIDTH: number,
  scale: number,
): Promise<Blob | null> {
  // Calculate height
  const height = calculateHeight(order);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // White background with rounded corners
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, 0, 0, WIDTH, height, 16);
  ctx.fill();

  const d: DrawContext = { ctx, width: WIDTH, y: PADDING };

  // === HEADER ===
  drawText(d, order.customerName || "Khách hàng", PADDING, { size: 20, bold: true });
  d.y += 2;

  const statusText = getStatusLabel(order.status);
  const paymentText =
    order.paymentMethod === "paid" ? "Đã thanh toán" : order.paymentMethod === "cod" ? "COD" : "";
  if (paymentText) {
    drawText(d, paymentText, PADDING, {
      size: 13,
      color: order.paymentMethod === "paid" ? "#15803d" : "#b45309",
    });
  }
  drawText(d, `Trạng thái: ${statusText}`, PADDING, { size: 13, color: "#6b7280" });
  if (order.customerPhone) {
    drawText(d, `SĐT: ${order.customerPhone}`, PADDING, { size: 13, color: "#6b7280" });
  }
  if (order.customerAddress) {
    drawText(d, `Địa chỉ: ${order.customerAddress}`, PADDING, { size: 13, color: "#6b7280" });
  }
  drawText(d, `Tạo lúc: ${formatDateTime(order.createdAt)}`, PADDING, {
    size: 12,
    color: "#9ca3af",
  });
  if (order.notes) {
    d.y += 4;
    drawText(d, `Ghi chú: ${order.notes}`, PADDING, { size: 13, color: "#6b7280" });
  }

  drawLine(d);

  // === PRODUCTS ===
  const regularItems = order.items.filter((i) => !i.isGift);
  const giftItems = order.items.filter((i) => i.isGift);

  drawText(d, `Sản phẩm (${regularItems.length})`, PADDING, { size: 15, bold: true });
  d.y += 6;

  for (const item of regularItems) {
    drawItemRow(d, item, imageMap.get(item.id) ?? null, WIDTH);
  }

  // Gift items
  if (giftItems.length > 0) {
    drawLine(d, "#bbf7d0");
    drawText(d, `Quà tặng (${giftItems.length})`, PADDING, {
      size: 15,
      bold: true,
      color: "#16a34a",
    });
    d.y += 6;
    for (const item of giftItems) {
      drawItemRow(d, item, imageMap.get(item.id) ?? null, WIDTH, true);
    }
  }

  drawLine(d);

  // === TOTALS ===
  drawText(d, "Tổng tiền", PADDING, { size: 15, bold: true });
  d.y += 4;

  drawRow(d, "Tạm tính", formatVND(order.subtotal));

  if (order.discountAmount > 0) {
    const label =
      order.discountType === "percent"
        ? `Giảm giá (${order.discountValue}%)`
        : "Giảm giá";
    drawRow(d, label, `-${formatVND(order.discountAmount)}`, { rightColor: "#ef4444" });
    drawRow(d, "Giá sau giảm", formatVND(Math.max(0, order.subtotal - order.discountAmount)), {
      rightColor: "#16a34a",
      bold: true,
    });
  }

  if (order.shippingFee > 0) {
    drawRow(d, "Phí vận chuyển", formatVND(order.shippingFee));
  }

  if (order.exchangeCost > 0) {
    drawRow(d, "Phí đổi hàng", formatVND(order.exchangeCost));
  }

  if (order.deposit > 0) {
    drawRow(d, "Khách cọc", `-${formatVND(order.deposit)}`, { rightColor: "#16a34a" });
  }

  if (order.platformFeeAmount > 0) {
    drawRow(d, "Phí nền tảng", `-${formatVND(order.platformFeeAmount)}`, {
      rightColor: "#f97316",
    });
  }

  drawLine(d);

  const displayTotal = order.lockedTotal ?? order.total;
  drawRow(d, "Tổng cộng", formatVND(displayTotal), {
    size: 20,
    leftColor: "#111827",
    rightColor: "#2563eb",
    bold: true,
  });

  if (order.deposit > 0) {
    drawRow(d, "Còn thu hộ (COD)", formatVND(Math.max(0, displayTotal - order.deposit)), {
      bold: true,
    });
  }

  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/png",
      );
    } catch {
      resolve(null);
    }
  });
}

function drawItemRow(
  d: DrawContext,
  item: OrderItem,
  img: HTMLImageElement | null,
  width: number,
  isGift = false,
) {
  const { ctx } = d;
  const textX = PADDING + IMG_SIZE + 10;
  const rowStartY = d.y;

  // Draw image
  drawProductImage(d, img, PADDING, rowStartY - 4);

  // Product name
  setFont(ctx, 14, true);
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  const nameMaxW = width - textX - 100;
  let displayName = item.productName;
  while (ctx.measureText(displayName).width > nameMaxW && displayName.length > 3) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== item.productName) displayName += "…";
  ctx.fillText(displayName, textX, d.y);
  d.y += 18;

  // Details (color | size - SKU)
  const detail = [item.productColor, item.productSize].filter(Boolean).join(" | ");
  const sku = item.productSku ? ` - ${item.productSku}` : "";
  if (detail || sku) {
    setFont(ctx, 12, false);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(`${detail}${sku}`, textX, d.y);
    d.y += 16;
  }

  // Price + quantity on the right
  const priceText = isGift ? "Tặng" : formatVND(item.unitPrice * item.quantity);
  setFont(ctx, 14, true);
  ctx.textAlign = "right";
  ctx.fillStyle = isGift ? "#16a34a" : "#111827";
  ctx.fillText(priceText, width - PADDING, rowStartY);

  setFont(ctx, 12, false);
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(`x${item.quantity}`, width - PADDING, rowStartY + 16);

  // Ensure minimum row height for image
  const minY = rowStartY + IMG_SIZE + 8;
  if (d.y < minY) d.y = minY;
}

const ITEM_ROW_HEIGHT = 52; // IMG_SIZE + spacing

function calculateHeight(order: OrderWithItems): number {
  let h = PADDING;

  // Header
  h += 24 + 4; // name
  if (order.paymentMethod) h += 17;
  h += 17; // status
  if (order.customerPhone) h += 17;
  if (order.customerAddress) h += 17;
  h += 16; // date
  if (order.notes) h += 21;
  h += 20; // line

  const regularItems = order.items.filter((i) => !i.isGift);
  const giftItems = order.items.filter((i) => i.isGift);

  // Products
  h += 25; // header
  h += regularItems.length * ITEM_ROW_HEIGHT;

  // Gift items
  if (giftItems.length > 0) {
    h += 20; // line
    h += 25; // header
    h += giftItems.length * ITEM_ROW_HEIGHT;
  }

  h += 20; // line

  // Totals
  h += 23; // "Tổng tiền" header
  h += 22; // subtotal
  if (order.discountAmount > 0) h += 22 * 2; // discount + after discount
  if (order.shippingFee > 0) h += 22;
  if (order.exchangeCost > 0) h += 22;
  if (order.deposit > 0) h += 22;
  if (order.platformFeeAmount > 0) h += 22;
  h += 20; // line
  h += 32; // total
  if (order.deposit > 0) h += 24;

  h += PADDING;
  return h;
}
