import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config/marketing';

/**
 * /robots.txt: everything public is crawlable, and AI search and answer
 * engines are explicitly welcome (GEO), as in the design. App pages keep
 * themselves out of search results with a `noindex` meta tag instead.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
