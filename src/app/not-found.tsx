'use client';

import Link from 'next/link';

export default function GlobalNotFound() {
  return (
    <html lang="en" className="h-full">
      <head>
        <title>404 - Page Not Found | ISSA</title>
      </head>
      <body className="h-full flex items-center justify-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans p-6">
        <div className="relative max-w-xl w-full text-center space-y-8 bg-slate-100 dark:bg-slate-800/45 backdrop-blur-md border border-slate-300/50 dark:border-slate-700/50 p-8 md:p-12 rounded-3xl shadow-2xl">
          {/* Wave/Info decoration */}
          <div className="absolute inset-x-0 -top-8 flex justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-bounce">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <h1 className="text-7xl md:text-8xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent select-none">
              404
            </h1>
            <p className="text-xs font-semibold tracking-wider text-cyan-600 dark:text-cyan-400 uppercase">
              Out of Bounds / خارج الحدود
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left border-y border-slate-300/60 dark:border-slate-700/60 py-6">
            {/* English Version */}
            <div className="space-y-2 border-e border-slate-300/30 dark:border-slate-700/30 pe-4 last:border-0 last:pe-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Page Not Found</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
              </p>
            </div>
            {/* Arabic Version */}
            <div className="space-y-2 text-right dir-rtl" dir="rtl">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">الصفحة غير موجودة</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                قد تكون الصفحة التي تبحث عنها قد تمت إزالتها أو تم تغيير اسمها أو أنها غير متاحة مؤقتاً.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
            >
              Back to Safety / العودة للرئيسية
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
