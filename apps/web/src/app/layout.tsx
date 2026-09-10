import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CP System ERP",
  description:
    "Conecta tus departamentos, potencia a tu gente. El ERP integral que impulsa el futuro de tu empresa.",
};

function ThemeInitScript() {
  const code = `
  (function () {
    try {
      var stored = localStorage.getItem('sc_theme');
      var dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var root = document.documentElement;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (dark) root.classList.add('dark'); else root.classList.remove('dark');
    } catch (e) {}
  })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <ThemeInitScript />
      </head>
      <body className={`min-h-screen bg-surface font-sans text-on-surface antialiased ${inter.variable}`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}