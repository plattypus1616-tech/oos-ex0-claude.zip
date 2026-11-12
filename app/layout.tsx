import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Shopify OOS & AI Outreach Auditor',
  description: 'Audit Shopify store inventories for sold out items and generate high-converting B2B cold emails',
  openGraph: {
    title: 'Shopify OOS & AI Outreach Auditor',
    description: 'Audit Shopify store inventories for sold out items and generate high-converting B2B cold emails',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shopify OOS & AI Outreach Auditor',
    description: 'Audit Shopify store inventories for sold out items and generate high-converting B2B cold emails',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}



