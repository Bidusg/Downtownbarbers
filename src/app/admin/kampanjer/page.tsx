import { redirect } from "next/navigation";

// «Kampanjer» var en ikke-fungerende dublett av Markedsføring (lagret bare
// tekst, sendte ingenting). Markedsføring er den reelle kanalen (segmenter,
// e-post/SMS via Resend/SMS-leverandør, samtykke + avmelding). Vi har slått
// dem sammen til én flate; gamle lenker/bokmerker sendes hit.
export default function AdminKampanjer() {
  redirect("/admin/markedsforing");
}
