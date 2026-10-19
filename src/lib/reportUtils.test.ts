import { describe, expect, it } from 'vitest';
import { getBorrowerRankings, issuesForReport } from './reportUtils';
import type { AcademicYear, BookIssue } from '@/types';

const year: AcademicYear = {
  id: 'year-1', year_label: '2026-2027', start_date: '2026-06-01', end_date: '2027-03-31',
  is_active: true, created_at: '2026-01-01',
};

function issue(id: string, studentId: string, name: string, className: string, date: string, yearId = 'year-1'): BookIssue {
  return {
    id, student_id: studentId, student_name_snapshot: name, student_roll_number_snapshot: studentId,
    class_name_snapshot: className, book_id: `book-${id}`, book_number_snapshot: id,
    book_title_snapshot: `Book ${id}`, academic_year_id: yearId, issue_date: date, due_date: date,
    return_date: null, status: 'issued', created_at: date,
  };
}

describe('report calculations', () => {
  it('uses the selected academic year dates and class', () => {
    const result = issuesForReport([
      issue('1', 'a', 'Asha', 'S1', '2026-06-01'),
      issue('2', 'a', 'Asha', 'S1', '2027-04-01'),
      issue('3', 'b', 'Binu', 'S2', '2026-08-01'),
      issue('4', 'c', 'Ciya', 'S1', '2026-08-01', 'year-2'),
    ], year, 'S1');
    expect(result.map((item) => item.id)).toEqual(['1']);
  });

  it('returns every borrower ranked by issue transactions', () => {
    const issues = [
      issue('1', 'a', 'Asha', 'S1', '2026-07-01'), issue('2', 'a', 'Asha', 'S1', '2026-07-02'),
      issue('3', 'a', 'Asha', 'S1', '2026-07-03'), issue('4', 'b', 'Binu', 'S2', '2026-07-04'),
      issue('5', 'b', 'Binu', 'S2', '2026-07-05'), issue('6', 'c', 'Ciya', 'S3', '2026-07-06'),
      issue('7', 'd', 'Deepa', 'S4', '2026-07-07'),
    ];
    expect(getBorrowerRankings(issues).map(({ name, bookCount }) => ({ name, bookCount }))).toEqual([
      { name: 'Asha', bookCount: 3 }, { name: 'Binu', bookCount: 2 },
      { name: 'Ciya', bookCount: 1 }, { name: 'Deepa', bookCount: 1 },
    ]);
  });
});
