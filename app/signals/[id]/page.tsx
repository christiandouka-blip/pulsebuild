import { SignalDetailShell } from "@/components/command-center/SignalDetailShell";

type SignalDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SignalDetailPage({
  params,
}: SignalDetailPageProps) {
  const { id } = await params;

  return <SignalDetailShell signalId={id} />;
}
