import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { T } from "@/lib/i18n/T";
import { PublicPage, MessageTile } from "@/components/site/PublicPage";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";
import { UnsubscribeSubmit } from "./UnsubscribeSubmit";

export const dynamic = "force-dynamic";
export const viewport = PUBLIC_VIEWPORT;
export const metadata = { title: "Meld av | Downtown Barbers", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const sb = await createClient();
  const { data } = await sb.rpc("marketing_unsubscribe", { p_token: token });
  redirect(`/avmeld/${token}?done=${data ? "1" : "nf"}`);
}

export default async function AvmeldPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(token);

  if (done) {
    return (
      <PublicPage narrow>
        <MessageTile
          title={<T k="avmeld.doneTitle" />}
          action={
            <Link href="/" className="pill pill-soft">
              <T k="common.toFront" />
            </Link>
          }
        >
          <T k="avmeld.doneBody" />
        </MessageTile>
      </PublicPage>
    );
  }

  return (
    <PublicPage narrow>
      <MessageTile title={<T k="avmeld.title" />}>
        <p>
          <T k="avmeld.body" />
        </p>
        {valid ? (
          <form action={unsubscribe} className="mt-8 flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <UnsubscribeSubmit />
            <Link href="/" className="pill pill-soft w-full">
              <T k="avmeld.no" />
            </Link>
          </form>
        ) : (
          <p className="mt-6">
            <T k="avmeld.invalid" />
          </p>
        )}
      </MessageTile>
    </PublicPage>
  );
}
