import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, isValid } from 'date-fns';
import type { BookIssue, AppSettings, AcademicYear } from '@/types';

interface PdfParams {
  issues: BookIssue[];
  settings: AppSettings;
  academicYear: AcademicYear | null;
  className?: string | null;
  dateFrom?: string;
  dateTo?: string;
  orientation?: 'portrait' | 'landscape';
}

function fmtDate(date: string | null, fmt = 'dd/MM/yyyy'): string {
  if (!date) return '—';
  const d = parseISO(date);
  if (!isValid(d)) return '—';
  return format(d, fmt);
}

export function generateIssuePdf({
  issues,
  settings,
  academicYear,
  className,
  dateFrom,
  dateTo,
  orientation = 'portrait',
}: PdfParams) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Filter by date range
  let filtered = issues;
  if (dateFrom) {
    filtered = filtered.filter((i) => i.issue_date >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter((i) => i.issue_date <= dateTo);
  }

  // Group by class_name_snapshot
  const classGroups = new Map<string, BookIssue[]>();
  filtered.forEach((issue) => {
    const cls = issue.class_name_snapshot || 'Unassigned';
    const arr = classGroups.get(cls) ?? [];
    arr.push(issue);
    classGroups.set(cls, arr);
  });

  // Sort classes alphabetically
  const sortedClasses = Array.from(classGroups.keys()).sort();

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${settings.school_name} — Book Issue and Return Register`, pageWidth / 2, 16, {
    align: 'center',
  });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let headerY = 24;
  if (academicYear) {
    doc.text(`Academic Year: ${academicYear.year_label}`, pageWidth / 2, headerY, { align: 'center' });
    headerY += 6;
  }
  if (className && className !== 'all') {
    doc.text(`Class: ${className}`, pageWidth / 2, headerY, { align: 'center' });
    headerY += 6;
  }
  const dateRangeStr = `${dateFrom ? fmtDate(dateFrom) : 'Beginning'} — ${dateTo ? fmtDate(dateTo) : 'Now'}`;
  doc.text(`Period: ${dateRangeStr}`, pageWidth / 2, headerY, { align: 'center' });
  headerY += 6;
  doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, headerY, {
    align: 'center',
  });
  headerY += 8;

  if (filtered.length === 0) {
    doc.setFontSize(12);
    doc.text('No issue records found for the selected criteria.', pageWidth / 2, headerY + 10, {
      align: 'center',
    });
    doc.save('library-issues-report.pdf');
    return;
  }

  let firstSection = true;

  sortedClasses.forEach((cls) => {
    const classIssues = classGroups.get(cls)!;

    // Class heading
    if (!firstSection) {
      doc.addPage();
    }
    firstSection = false;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`CLASS ${cls.toUpperCase()}`, margin, headerY);

    // Table
    autoTable(doc, {
      startY: headerY + 4,
      head: [['S.No.', 'Serial Number of Book', 'Name of Book', 'Issued To', 'Date of Issue', 'Date of Return']],
      body: classIssues.map((issue, idx) => [
        String(idx + 1),
        issue.book_number_snapshot,
        issue.book_title_snapshot,
        `${issue.student_name_snapshot} (${issue.student_roll_number_snapshot})`,
        fmtDate(issue.issue_date),
        issue.status === 'returned' ? fmtDate(issue.return_date) : '—',
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 35 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 45 },
        4: { cellWidth: 28 },
        5: { cellWidth: 28 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // Page number footer
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageCount = doc.getNumberOfPages();
        const currentPage = doc.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${currentPage} of ${pageCount}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' }
        );
        doc.text(
          'Developed by Jeevan Varghese',
          margin,
          pageHeight - 8,
        );
      },
    });
  });

  doc.save(`library-issues-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
