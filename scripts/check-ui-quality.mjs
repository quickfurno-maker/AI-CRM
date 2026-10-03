import { readFileSync, existsSync } from 'node:fs';

const requiredFiles = [
  'apps/web/src/components/app-shell.tsx',
  'apps/web/src/components/workspace-states.tsx',
  'apps/web/src/components/marketing-header.tsx',
  'apps/web/src/components/marketing-footer.tsx',
  'apps/web/src/components/public-pricing.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/platform/page.tsx',
  'apps/web/src/app/pricing/page.tsx',
  'apps/web/src/app/security/page.tsx',
  'apps/web/src/app/loading.tsx',
  'apps/web/src/app/error.tsx',
  'apps/web/src/app/not-found.tsx',
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push('Missing required UI surface: ' + file);
}

function requireText(file, text, label) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes(text)) {
    failures.push(label + ' (' + file + ')');
  }
}

requireText('apps/web/src/app/globals.css', ':focus-visible', 'Global keyboard focus style is missing');
requireText('apps/web/src/app/globals.css', 'prefers-reduced-motion', 'Reduced-motion support is missing');
requireText('apps/web/src/app/globals.css', '.marketing-page', 'Public website design system is missing');
requireText('apps/web/src/components/app-shell.tsx', 'role="main"', 'Application shell main landmark is missing');
requireText('apps/web/src/components/app-shell.tsx', 'aria-current={active ? \'page\'', 'Active navigation semantics are missing');
requireText('apps/web/src/components/app-shell.tsx', "'/pricing'", 'Pricing is not configured as a public route');
requireText('apps/web/src/components/app-shell.tsx', "'/security'", 'Security is not configured as a public route');
requireText('apps/web/src/components/public-pricing.tsx', "fetch('/api/saas/catalog'", 'Public pricing is not backed by the SaaS catalog');
requireText('apps/web/src/app/automations/page.tsx', 'role="tablist"', 'Automation tabs lack tablist semantics');
requireText('apps/web/src/app/automations/page.tsx', 'premium-flow', 'Automation canvas premium styling hook is missing');
requireText('apps/web/src/app/ai-agents/page.tsx', 'role="tablist"', 'AI Agent tabs lack tablist semantics');
requireText('apps/web/src/app/crm/page.tsx', 'WorkspaceLoading label="CRM"', 'CRM intentional loading state is missing');
requireText('apps/web/src/app/whatsapp/page.tsx', 'Search conversations', 'WhatsApp conversation search is missing');
requireText('apps/web/src/app/whatsapp/page.tsx', 'latestMessageRef', 'WhatsApp latest-message positioning is missing');

if (failures.length) {
  console.error('\nUI quality gate failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('UI quality gate passed: premium shell, marketing site, accessibility and high-frequency UX conventions are present.');
