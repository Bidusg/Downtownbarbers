import { COMPANY_DOCS, companyDocUrl, type DocLang } from "@/lib/company-docs";
import { Card } from "@/components/ui/Card";
import { DocViewerButton } from "@/components/ui/DocViewer";

const LANG_LABEL: Record<DocLang, { label: string; view: string; download: string }> = {
  no: { label: "Norsk", view: "Vis", download: "Last ned" },
  en: { label: "English", view: "View", download: "Download" },
};

/** Felles dokumenter (personalhåndbok o.l.) – ansattportalen og kassa. */
export function CompanyDocsList() {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {COMPANY_DOCS.map((d) => (
          <li key={d.slug} className="px-4 py-3 text-sm">
            <span className="block font-medium text-fg">
              {d.title}
              {d.files.en && <span className="font-normal text-muted"> · {d.titleEn}</span>}
            </span>
            <span className="block text-xs text-muted">
              {d.description} Versjon {d.version} · {d.updated}.
            </span>
            <span className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {(["no", "en"] as const)
                .filter((l) => d.files[l])
                .map((l) => (
                  <span key={l} className="inline-flex items-center gap-3">
                    <span className="text-xs font-semibold text-fg">{LANG_LABEL[l].label}</span>
                    <DocViewerButton
                      filename={`${l === "en" ? d.titleEn : d.title}.pdf`}
                      url={companyDocUrl(d.slug, l)}
                      mime="application/pdf"
                      label={LANG_LABEL[l].view}
                    />
                    <a
                      href={companyDocUrl(d.slug, l, true)}
                      className="text-xs font-semibold text-accent-soft underline-offset-2 hover:underline"
                    >
                      {LANG_LABEL[l].download}
                    </a>
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
