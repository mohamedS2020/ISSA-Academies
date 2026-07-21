'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function LocaleNotFound() {
  const t = useTranslations('common');

  return (
    <div className="flex flex-1 items-center justify-center min-h-[70vh] p-6">
      <div className="relative max-w-md w-full text-center space-y-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-8 md:p-12 rounded-3xl shadow-xl dark:shadow-2xl">
        {/* Wave/Warning Decoration */}
        <div className="absolute inset-x-0 -top-8 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30 animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <h1 className="text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-r from-primary via-teal-400 to-accent bg-clip-text text-transparent select-none">
            404
          </h1>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {t('pageNotFoundTitle')}
          </h2>
        </div>

        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
          {t('pageNotFoundDesc')}
        </p>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gradient-to-r from-primary to-accent hover:brightness-110 text-white font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          >
            {t('backToHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
