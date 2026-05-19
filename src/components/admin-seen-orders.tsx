"use client";

import { useEffect } from "react";

const seenOrdersKey = "license-hub:admin-seen-orders:v1";

function readSeenOrders() {
  try {
    return JSON.parse(window.localStorage.getItem(seenOrdersKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSeenOrders(seenOrders: Record<string, string>) {
  window.localStorage.setItem(seenOrdersKey, JSON.stringify(seenOrders));
}

function markOrderRows(seenOrders: Record<string, string>) {
  document.querySelectorAll<HTMLElement>("[data-admin-order-id]").forEach((row) => {
    const orderId = row.dataset.adminOrderId;
    const createdAt = row.dataset.adminOrderCreatedAt;

    if (!orderId || !createdAt) {
      return;
    }

    const isNew = seenOrders[orderId] !== createdAt;
    row.classList.toggle("bg-[#e7f7ed]", isNew);
    row.classList.toggle("border-l-4", isNew);
    row.classList.toggle("border-l-[#1f7a4d]", isNew);
    row.classList.toggle("bg-[#fff8df]", !isNew && row.dataset.adminOrderSelected === "true");
  });
}

type AdminSeenOrdersProps = {
  orders: {
    id: string;
    createdAt: string;
  }[];
};

export function AdminSeenOrders({ orders }: AdminSeenOrdersProps) {
  useEffect(() => {
    const seenOrders = readSeenOrders();
    const hasSeenBaseline = window.localStorage.getItem(seenOrdersKey) !== null;

    if (!hasSeenBaseline) {
      orders.forEach((order) => {
        seenOrders[order.id] = order.createdAt;
      });
      writeSeenOrders(seenOrders);
    }

    markOrderRows(seenOrders);

    function handleClick(event: MouseEvent) {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-admin-order-id]");

      if (!row?.dataset.adminOrderId || !row.dataset.adminOrderCreatedAt) {
        return;
      }

      const updatedSeenOrders = readSeenOrders();
      updatedSeenOrders[row.dataset.adminOrderId] = row.dataset.adminOrderCreatedAt;
      writeSeenOrders(updatedSeenOrders);
      markOrderRows(updatedSeenOrders);
    }

    document.addEventListener("click", handleClick);

    return () => document.removeEventListener("click", handleClick);
  }, [orders]);

  return null;
}
