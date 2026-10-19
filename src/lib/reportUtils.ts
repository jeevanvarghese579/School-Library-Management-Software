import type { AcademicYear, BookIssue } from '@/types';

export interface BorrowerRanking {
  studentId: string;
  name: string;
  rollNumber: string;
  className: string;
  bookCount: number;
}

export function issuesForReport(
  issues: BookIssue[],
  academicYear: AcademicYear | null,
  className = 'all',
) {
  if (!academicYear) return [];
  return issues.filter((issue) => {
    if (issue.academic_year_id !== academicYear.id) return false;
    if (className !== 'all' && issue.class_name_snapshot !== className) return false;
    if (academicYear.start_date && issue.issue_date < academicYear.start_date) return false;
    if (academicYear.end_date && issue.issue_date > academicYear.end_date) return false;
    return true;
  });
}

export function getBorrowerRankings(issues: BookIssue[]): BorrowerRanking[] {
  const borrowers = new Map<string, BorrowerRanking>();
  issues.forEach((issue) => {
    const key = issue.student_id || `${issue.student_name_snapshot}|${issue.student_roll_number_snapshot}|${issue.class_name_snapshot}`;
    const current = borrowers.get(key);
    if (current) {
      current.bookCount += 1;
      return;
    }
    borrowers.set(key, {
      studentId: key,
      name: issue.student_name_snapshot,
      rollNumber: issue.student_roll_number_snapshot,
      className: issue.class_name_snapshot || 'Unassigned',
      bookCount: 1,
    });
  });
  return [...borrowers.values()]
    .sort((a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name) || a.rollNumber.localeCompare(b.rollNumber));
}
