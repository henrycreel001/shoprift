import fs from 'fs';
import path from 'path';

export const metadata = { title: 'Privacy Policy — Shoprift' };

export default function PrivacyPolicyPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), '..', 'docs', 'legal', 'privacy-policy.md'),
    'utf-8',
  );

  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '0.95rem', lineHeight: '1.7' }}>
        {content}
      </pre>
    </main>
  );
}
