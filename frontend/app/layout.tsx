import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { DialogProvider } from "@/components/Dialog";
import { Nav } from "@/components/Nav";
import "./globals.css";

const thai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-thai" });

export const metadata: Metadata = {
  title: "ระบบจัดตารางสอน",
  description: "นำเข้าไฟล์ Excel → คัดกรองข้อมูล → จัดตารางสอนอัตโนมัติ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="min-h-screen font-sans">
        <DialogProvider>
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
            <Nav />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </DialogProvider>
      </body>
    </html>
  );
}
