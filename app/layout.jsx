export const metadata = {
  title: "MONKAS — Monjali Kasir",
  description: "App kasir standalone multitenant, 1 QRIS bersama.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
