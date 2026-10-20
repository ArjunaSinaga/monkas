import "./globals.css";

export const metadata = {
  title: "MONKAS — Monjali Kasir",
  description: "App kasir standalone multitenant, 1 QRIS bersama.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
      </body>
    </html>
  );
}
