import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Handshake — payment-protected handoffs for informal digital work",
  description:
    "Escrow-meets-encrypted-delivery on Monad. The client can't lose their money; the freelancer can't lose control of the final work.",
  applicationName: "Handshake",
  authors: [{ name: "Handshake" }],
  keywords: ["Monad", "escrow", "freelance", "onchain", "AES-GCM", "USDC"],
  openGraph: {
    title: "Handshake",
    description: "Payment-protected handoffs for informal digital work, on Monad.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
