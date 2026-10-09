'use client';

export const PAGE_SIZE = 10;

export default function Pagination({ page, totalItems, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const start = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
      <span className="text-slate-500">
        Menampilkan <strong className="text-slate-800">{start}–{end}</strong> dari <strong className="text-slate-800">{totalItems}</strong> data
        <span className="ml-2 text-slate-400">· 10 data per halaman</span>
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="whitespace-nowrap text-slate-500">Halaman {page} dari {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Berikutnya →
          </button>
        </div>
      )}
    </div>
  );
}
