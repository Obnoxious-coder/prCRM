import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Personal CRM",
  description: "Remember people properly and stay in touch deliberately.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/people", label: "People" },
  { href: "/digest", label: "Digest" },
  { href: "/network", label: "Network" },
  { href: "/tags", label: "Tags" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="bg-paper text-ink min-h-full">
        <header className="border-line border-b">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
            <Link href="/" className="font-serif text-[1.3rem] leading-none tracking-tight">
              Personal&nbsp;CRM
            </Link>
            <nav className="text-ink-soft flex flex-wrap items-center gap-4 text-[0.8125rem]">
              {NAV.slice(1).map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-ink transition-colors">
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/guide"
              title="How this works"
              aria-label="How this works"
              className="border-line text-ink-soft hover:border-ink/30 hover:text-ink ml-auto flex h-7 w-7 items-center justify-center rounded-full border font-serif text-[0.9rem] leading-none transition-colors"
            >
              i
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        <footer className="text-ink-faint mx-auto max-w-5xl px-5 pb-10 text-xs">
          Capture must be frictionless; review must be batched.
        </footer>
      </body>
    </html>
  );
}
