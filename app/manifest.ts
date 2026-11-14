import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Handrolls",
    short_name: "Handrolls",
    description:
      "Ficha de RPG online (One Piece) com chat, rolador de dados e mesas em tempo real.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fef4f4",
    theme_color: "#004d4c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/marca/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
