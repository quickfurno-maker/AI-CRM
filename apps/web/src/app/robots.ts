import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/platform', '/pricing', '/security'],
      disallow: [
        '/api/',
        '/dashboard',
        '/crm',
        '/whatsapp',
        '/ai-agents',
        '/automations',
        '/real-estate',
        '/attendance',
        '/billing',
        '/analytics',
        '/staff',
        '/team',
        '/subscription',
        '/developer',
        '/marketplace',
        '/enterprise',
        '/provider',
        '/login',
        '/register',
        '/sso',
      ],
    },
  };
}
