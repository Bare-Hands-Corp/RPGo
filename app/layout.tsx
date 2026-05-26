import type { Metadata } from "next";
import { ThemeScript } from "./theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "RPGo",
  description:
    "Ficha de RPG online (One Piece) com chat, rolador de dados e mesas em tempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
        />
        {/* Script anti-flash: sync no <head>, antes do primeiro paint.
            Aplica vars CSS e classe `dark-mode` em <html> — não em <body>,
            pra evitar React 19 reconciliar a className durante hidratação. */}
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
