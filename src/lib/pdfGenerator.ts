import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { format, parseISO, isValid } from 'date-fns';
import type { BookIssue, AppSettings, AcademicYear } from '@/types';

interface PdfParams {
  issues: BookIssue[];
  settings: AppSettings;
  academicYear: AcademicYear | null;
  className?: string | null;
  orientation?: 'portrait' | 'landscape';
}

interface ReportPage {
  className: string;
  issues: BookIssue[];
  continued: boolean;
  startingIndex: number;
}

function fmtDate(date: string | null, fmt = 'dd/MM/yyyy'): string {
  if (!date) return '-';
  const parsed = parseISO(date);
  return isValid(parsed) ? format(parsed, fmt) : '-';
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration> = {},
  text?: string,
) {
  const element = document.createElement(tag);
  Object.assign(element.style, styles);
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildReportPages(groups: Map<string, BookIssue[]>, rowsPerPage: number): ReportPage[] {
  const pages: ReportPage[] = [];
  [...groups.keys()].sort((a, b) => a.localeCompare(b)).forEach((className) => {
    const issues = groups.get(className) ?? [];
    for (let offset = 0; offset < issues.length; offset += rowsPerPage) {
      pages.push({
        className,
        issues: issues.slice(offset, offset + rowsPerPage),
        continued: offset > 0,
        startingIndex: offset,
      });
    }
  });
  return pages;
}

function makeReportPage({
  width,
  height,
  reportPage,
  pageNumber,
  pageCount,
  settings,
  academicYear,
  className,
  generatedAt,
}: {
  width: number;
  height: number;
  reportPage: ReportPage;
  pageNumber: number;
  pageCount: number;
  settings: AppSettings;
  academicYear: AcademicYear | null;
  className?: string | null;
  generatedAt: Date;
}) {
  const root = createElement('div', {
    width: `${width}px`,
    height: `${height}px`,
    boxSizing: 'border-box',
    padding: '34px 48px 40px',
    position: 'relative',
    backgroundColor: '#ffffff',
    color: '#111827',
    fontFamily: 'Arial, "Noto Sans Malayalam", "Nirmala UI", sans-serif',
  });

  root.append(createElement('div', {
    position: 'absolute',
    right: '28px',
    top: '18px',
    color: '#6b7280',
    fontSize: '8px',
  }, `Generated ${format(generatedAt, 'dd/MM/yyyy HH:mm')}`));

  root.append(createElement('h1', {
    margin: '0',
    textAlign: 'center',
    fontSize: '24px',
    lineHeight: '1.2',
    fontWeight: '700',
  }, settings.school_name));

  root.append(createElement('h2', {
    margin: '8px 0 0',
    textAlign: 'center',
    fontSize: '18px',
    lineHeight: '1.2',
    fontWeight: '700',
  }, 'Book Issue and Return Register'));

  const metadata = createElement('div', {
    marginTop: '12px',
    textAlign: 'center',
    color: '#374151',
    fontSize: '11px',
    lineHeight: '1.6',
  });
  if (academicYear) metadata.append(createElement('div', {}, `Academic Year: ${academicYear.year_label}`));
  if (className && className !== 'all') metadata.append(createElement('div', {}, `Class: ${className}`));
  metadata.append(createElement(
    'div',
    {},
    academicYear?.start_date && academicYear?.end_date
      ? `Period: ${fmtDate(academicYear.start_date)} - ${fmtDate(academicYear.end_date)}`
      : 'Period: Dates not configured',
  ));
  root.append(metadata);

  root.append(createElement('h3', {
    margin: '14px 0 8px',
    fontSize: '16px',
    lineHeight: '1.2',
    fontWeight: '700',
  }, `CLASS ${reportPage.className.toUpperCase()}${reportPage.continued ? ' (continued)' : ''}`));

  const table = createElement('table', {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    fontSize: '10px',
  });
  const columnWidths = ['8%', '18%', '22%', '25%', '14%', '13%'];
  const headers = ['S.No.', 'Serial Number of Book', 'Name of Book', 'Issued To', 'Date of Issue', 'Date of Return'];
  const headerRow = document.createElement('tr');
  headers.forEach((header, index) => {
    const cell = createElement('th', {
      width: columnWidths[index],
      boxSizing: 'border-box',
      padding: '8px 7px',
      border: '1px solid #d1d5db',
      backgroundColor: '#2563eb',
      color: '#ffffff',
      textAlign: 'left',
      fontSize: '10px',
      lineHeight: '1.25',
      fontWeight: '700',
    }, header);
    headerRow.append(cell);
  });
  const tableHead = document.createElement('thead');
  tableHead.append(headerRow);
  table.append(tableHead);

  const tableBody = document.createElement('tbody');
  reportPage.issues.forEach((issue, rowIndex) => {
    const row = document.createElement('tr');
    const values = [
      String(reportPage.startingIndex + rowIndex + 1),
      issue.book_number_snapshot,
      issue.book_title_snapshot,
      `${issue.student_name_snapshot} (${issue.student_roll_number_snapshot})`,
      fmtDate(issue.issue_date),
      issue.status === 'returned' ? fmtDate(issue.return_date) : '-',
    ];
    values.forEach((value) => {
      row.append(createElement('td', {
        boxSizing: 'border-box',
        padding: '7px',
        border: '1px solid #d1d5db',
        color: '#374151',
        textAlign: 'left',
        lineHeight: '1.35',
        overflowWrap: 'anywhere',
        verticalAlign: 'middle',
      }, value));
    });
    tableBody.append(row);
  });
  table.append(tableBody);
  root.append(table);

  root.append(createElement('div', {
    position: 'absolute',
    left: '48px',
    bottom: '18px',
    color: '#6b7280',
    fontSize: '8px',
  }, 'Developed by Jeevan Varghese'));
  root.append(createElement('div', {
    position: 'absolute',
    right: '48px',
    bottom: '18px',
    color: '#6b7280',
    fontSize: '8px',
  }, `Page ${pageNumber} of ${pageCount}`));

  return root;
}

export async function generateIssuePdf({
  issues,
  settings,
  academicYear,
  className,
  orientation = 'portrait',
}: PdfParams) {
  const filtered = issues;

  const classGroups = new Map<string, BookIssue[]>();
  filtered.forEach((issue) => {
    const group = issue.class_name_snapshot || 'Unassigned';
    classGroups.set(group, [...(classGroups.get(group) ?? []), issue]);
  });

  const reportPages = buildReportPages(classGroups, orientation === 'portrait' ? 23 : 12);
  if (reportPages.length === 0) return;

  const pixelWidth = orientation === 'portrait' ? 794 : 1123;
  const pixelHeight = orientation === 'portrait' ? 1123 : 794;
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const generatedAt = new Date();
  const stagingArea = createElement('div', {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${pixelWidth}px`,
    zIndex: '-1',
  });
  document.body.append(stagingArea);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    for (let index = 0; index < reportPages.length; index++) {
      const page = makeReportPage({
        width: pixelWidth,
        height: pixelHeight,
        reportPage: reportPages[index],
        pageNumber: index + 1,
        pageCount: reportPages.length,
        settings,
        academicYear,
        className,
        generatedAt,
      });
      stagingArea.replaceChildren(page);
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      if (index > 0) pdf.addPage('a4', orientation);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }
  } finally {
    stagingArea.remove();
  }

  pdf.save(`library-issues-report-${format(generatedAt, 'yyyy-MM-dd')}.pdf`);
}
