import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Business OS',
    template: '%s · Business OS',
  },
  description:
    'Premium AI-native business operating system for CRM, WhatsApp, automation, analytics and operations.',
  applicationName: 'Business OS',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Business OS',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#07080b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body><ServiceWorkerRegister /><AppShell>{children}</AppShell></body>
    </html>
  );
}
