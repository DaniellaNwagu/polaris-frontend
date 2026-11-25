"use client";

import { AdminGate } from "@/components/admin/admin-gate";
import { CreateMarketForm } from "@/components/create-market-form";

export default function AdminCreatePage() {
  return (
    <AdminGate>
      <CreateMarketForm />
    </AdminGate>
  );
}
