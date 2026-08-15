import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bubld Tasks",
  description: "Internal task tracker for the Bubld team.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
