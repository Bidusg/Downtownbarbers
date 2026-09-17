import { LoginForm } from "./LoginForm";

export default async function LoggInn({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; neste?: string; tilbakestilt?: string }>;
}) {
  const sp = await searchParams;
  const accessDenied = sp.feil === "tilgang";
  const passwordReset = sp.tilbakestilt === "1";

  return <LoginForm accessDenied={accessDenied} passwordReset={passwordReset} />;
}
