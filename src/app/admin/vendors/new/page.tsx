import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { VendorForm } from "@/components/admin/VendorForm";
import { requireStaffPage } from "@/lib/auth/staff";

export const metadata: Metadata = {
  title: "Add a vendor — Quoin",
  robots: { index: false, follow: false },
};

export default async function NewVendorPage() {
  await requireStaffPage();

  return (
    <AdminShell
      current="/admin/vendors"
      title="Add a vendor"
      subtitle="Added as a draft. Verifying them is a separate step, on their own page."
    >
      <Card>
        <VendorForm />
      </Card>
    </AdminShell>
  );
}
