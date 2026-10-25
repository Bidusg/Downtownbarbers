import { getMemberProfile } from "@/lib/member";
import { Checkout } from "@/components/shop/Checkout";
import { TermsContent } from "@/components/shop/TermsContent";

export const metadata = { title: "Handlekurv og kasse | Downtown Barbers", robots: { index: false } };

export default async function CheckoutPage() {
  const m = await getMemberProfile();
  return (
    <Checkout
      member={
        m
          ? { name: m.name, email: m.email, phone: m.phone, tier: m.tierName ?? "", pct: Math.max(0, m.productPct || 0) }
          : null
      }
      terms={<TermsContent />}
    />
  );
}
