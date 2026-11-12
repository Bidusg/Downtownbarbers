"use client";

import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { deleteMyDocument } from "@/app/ansatt/dokumenter/actions";

export function DeleteDocumentButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      label="Slett"
      confirmLabel="Ja, slett"
      pendingLabel="Sletter …"
      onConfirm={() => deleteMyDocument(id)}
    />
  );
}
