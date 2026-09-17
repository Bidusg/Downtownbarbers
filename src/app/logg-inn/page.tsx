import { LoginForm } from "./LoginForm";

export default async function LoggInn({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; neste?: string }>;
}) {
  const sp = await searchParams;
  const accessDenied = sp.feil === "tilgang";

  return <LoginForm accessDenied={accessDenied} />;
}
