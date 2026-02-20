import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audio Transcriber",
  description: "Upload een audiobestand en ontvang een transcriptie",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
