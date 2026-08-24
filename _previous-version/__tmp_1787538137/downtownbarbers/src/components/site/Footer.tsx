import { salon } from "@/lib/data/salon";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface-2 text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-lg font-bold text-fg">{salon.name}</p>
          <p className="mt-2 text-sm">{salon.address}</p>
          <p className="text-sm">{salon.phone}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <a href={salon.social.instagram} className="hover:text-fg">
            Instagram
          </a>
          <a href={salon.social.tiktok} className="hover:text-fg">
            TikTok
          </a>
          <a href={salon.social.facebook} className="hover:text-fg">
            Facebook
          </a>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">
        © {salon.established}–2026 {salon.name}. Alle rettigheter forbeholdt.
      </div>
    </footer>
  );
}
