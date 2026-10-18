import { Info, Library } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function AboutPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">About</h1>
        <p className="text-sm text-slate-500 mt-1">About this application</p>
      </div>

      <Card className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex p-4 bg-blue-600 rounded-2xl text-white mb-6 shadow-lg shadow-blue-200">
            <Library size={36} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">School Library Management System</h2>
          <p className="text-slate-500 mt-2">Version 1.0.0</p>

          <p className="text-sm text-slate-600 mt-6 leading-relaxed max-w-lg mx-auto">
            A complete library management solution for schools. Manage your book inventory, track student
            records, issue and return books, generate professional PDF reports, and customize book fields
            — all with persistent data storage and secure authentication.
          </p>

          <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-600 mb-2">Developed by</p>
            <p className="text-xl font-bold text-slate-800">Jeevan Varghese</p>
            <a
              href="https://itsjeevanvarghese.web.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-3 text-blue-600 hover:underline font-medium"
            >
              https://itsjeevanvarghese.web.app
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8 max-w-md mx-auto">
            <div className="p-4 bg-blue-50 rounded-lg">
              <Info size={20} className="mx-auto text-blue-600 mb-2" />
              <p className="text-xs text-slate-600">Customizable book fields with multiple field types</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <Info size={20} className="mx-auto text-emerald-600 mb-2" />
              <p className="text-xs text-slate-600">Import/export books and students from spreadsheets</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <Info size={20} className="mx-auto text-amber-600 mb-2" />
              <p className="text-xs text-slate-600">Class-wise A4 PDF issue reports</p>
            </div>
            <div className="p-4 bg-cyan-50 rounded-lg">
              <Info size={20} className="mx-auto text-cyan-600 mb-2" />
              <p className="text-xs text-slate-600">Historical snapshots preserve data integrity</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
