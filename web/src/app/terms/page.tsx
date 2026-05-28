import fs from 'fs';
import path from 'path';

export const metadata = { title: 'Terms of Service — Shoprift' };

export default function TermsPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), '..', 'docs', 'legal', 'terms-of-service.md'),
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
