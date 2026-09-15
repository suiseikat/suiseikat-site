import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suieikat的小站",
  description: "Suieikat 的个人空间，收集想法、作品与正在发生的事。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans" suppressHydrationWarning><body>{children}</body></html>;
}
