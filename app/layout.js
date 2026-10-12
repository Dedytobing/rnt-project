import './globals.css';
import Script from 'next/script';
import ThemeToggle from './theme-toggle';

export const metadata = {
  title: 'RNT | Recruitment and Training',
  description: 'Portal rekrutmen dan manajemen personel RNT.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <Script id="rnt-theme-preference" strategy="beforeInteractive">
          {"try{if(localStorage.getItem('rnt-theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}"}
        </Script>
      </head>
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
