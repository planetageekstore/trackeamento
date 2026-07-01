import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trackeamento — Atribuição Multi-Canal",
  description: "Painel de atribuição multi-canal (RG do lead, WhatsApp, Meta, Google, Nuvemshop).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
