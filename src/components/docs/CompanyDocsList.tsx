import { COMPANY_DOCS, companyDocUrl } from "@/lib/company-docs";
import { Card } from "@/components/ui/Card";
import { DocViewerButton } from "@/components/ui/DocViewer";

/** Felles dokumenter (personalhåndbok o.l.) – ansattportalen og kassa. */
export function CompanyDocsList() {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {COMPANY_DOCS.map((d) => (
          <li key={d.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-fg">{d.title}</span>
              <span className="block text-xs text-muted">
                {d.description} Versjon {d.version} · {d.updated}.
              </span>
            </span>
            <span className="ml-auto inline-flex items-center gap-4">
              <DocViewerButton filename={`${d.title}.pdf`} url={companyDocUrl(d.slug)} mime="application/pdf" />
              <a
                href={companyDocUrl(d.slug, true)}
                className="text-xs font-semibold text-accent-soft underline-offset-2 hover:underline"
              >
                Last ned
              </a>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
