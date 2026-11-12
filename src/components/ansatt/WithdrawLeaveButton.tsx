"use client";

import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { withdrawLeaveRequest } from "@/app/ansatt/fravaer/actions";

export function WithdrawLeaveButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      label="Trekk tilbake"
      confirmLabel="Ja, trekk"
      pendingLabel="Trekker …"
      onConfirm={() => withdrawLeaveRequest(id)}
    />
  );
}
