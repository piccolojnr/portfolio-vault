import { AuthProvider } from "@/components/providers/auth-provider";

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
