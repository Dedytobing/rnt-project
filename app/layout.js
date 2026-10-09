import './globals.css';

export const metadata = {
  title: 'RED Project — Recruitment Command',
  description: 'Portal rekrutmen dan manajemen personel RED Project.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
