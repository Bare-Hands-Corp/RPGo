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
    <html lang="pt-br">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
        />
      </head>
      <body>
        {/* ThemeScript precisa rodar antes do primeiro render visual.
            Inline no body é a única forma de garantir sync execution +
            acesso a document.body sem hydration mismatch. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
