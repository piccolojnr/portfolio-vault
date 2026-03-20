import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://memraiq.co";
const SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "MemraIQ";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | AI Knowledge Workspace`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Memra is an AI-powered knowledge workspace for teams. Upload documents, search instantly, and chat with grounded answers.",
  keywords: [
    "AI knowledge base",
    "document intelligence",
    "RAG",
    "team knowledge management",
    "enterprise search",
  ],
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | AI Knowledge Workspace`,
    description:
      "Turn team documents into a searchable, conversational knowledge workspace with Memra.",
    images: [
      {
        url: "/logos/memraiq-icon-512.png",
        width: 512,
        height: 512,
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | AI Knowledge Workspace`,
    description:
      "Upload docs, discover connections, and chat with grounded answers in one AI workspace.",
    images: ["/logos/memraiq-icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-hidden`}
      >
        <QueryProvider>
          {children}
          <Toaster position="bottom-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
