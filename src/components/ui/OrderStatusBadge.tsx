import { OrderStatus } from "@/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  preparing: "Chuẩn bị hàng",
  packed: "Đã đóng gói",
  shipped: "Đã gửi",
  cancelled: "Đã hủy",
  completed: "Hoàn tất",
  deleted: "Đã xóa",
};

export function getStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`status-${status} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`}
      style={{
        backgroundColor: `var(--status-bg)`,
        color: `var(--status-text)`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
