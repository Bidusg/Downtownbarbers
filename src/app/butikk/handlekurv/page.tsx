import { getMemberProfile } from "@/lib/member";
import { getActivePromo } from "@/lib/promo";
import { Checkout } from "@/components/shop/Checkout";
import { TermsContent } from "@/components/shop/TermsContent";

export const metadata = { title: "Handlekurv og kasse | Downtown Barbers", robots: { index: false } };

export default async function CheckoutPage() {
  const [m, promo] = await Promise.all([getMemberProfile(), getActivePromo()]);
  return (
    <Checkout
      member={
        m
          ? { name: m.name, email: m.email, phone: m.phone, tier: m.tierName ?? "", pct: Math.max(0, m.productPct || 0) }
          : null
      }
      promo={promo?.productsOpen ? { label: promo.label, pct: promo.productPct } : null}
      terms={<TermsContent />}
    />
  );
}
