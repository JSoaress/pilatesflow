import './print.css';

export const metadata = { robots: { index: false, follow: false } };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted/60 print:bg-white">{children}</div>;
}
