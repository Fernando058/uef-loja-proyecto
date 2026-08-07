export type AppRole = 'director' | 'teacher'

export interface Profile {
  id: string
  email: string | null
  first_names: string
  last_names: string
  role: AppRole
  active: boolean
}

export interface Student {
  id: string
  first_names: string
  last_names: string
  national_id: string | null
  birth_date: string | null
  active: boolean
  created_at: string
}

export interface Teacher {
  id: string
  user_id: string | null
  first_names: string
  last_names: string
  national_id: string | null
  active: boolean
  created_at: string
}

export interface AcademicYear {
  id: string
  name: string
  starts_on: string
  ends_on: string
  active: boolean
  closed: boolean
}

export interface Term {
  id: string
  academic_year_id: string
  name: string
  order_no: number
  starts_on: string | null
  ends_on: string | null
  closed: boolean
}

export interface Course {
  id: string
  academic_year_id: string
  grade_level: string
  parallel: string
  active: boolean
}

export interface Subject {
  id: string
  name: string
  short_name: string | null
  active: boolean
}

export interface TeacherAssignment {
  id: string
  academic_year_id: string
  course_id: string
  subject_id: string
  teacher_id: string
  active: boolean
  course?: Course
  subject?: Subject
  teacher?: Teacher
}

export interface Enrollment {
  id: string
  academic_year_id: string
  course_id: string
  student_id: string
  status: 'active' | 'withdrawn' | 'transferred' | 'completed'
  enrolled_on: string
  withdrawn_on: string | null
  student?: Student
}

export interface Assessment {
  id: string
  teacher_assignment_id: string
  term_id: string
  assessment_type_id: string | null
  code: string | null
  title: string
  assessment_date: string | null
  max_score: number
  active: boolean
}

export interface AssessmentType {
  id: string
  code: string
  name: string
  active: boolean
}

export interface Grade {
  id?: string
  assessment_id: string
  enrollment_id: string
  score: number | null
  status: 'graded' | 'pending' | 'absent' | 'not_submitted' | 'not_applicable'
  notes?: string | null
}

export interface SummativeRecord {
  id?: string
  teacher_assignment_id: string
  term_id: string
  enrollment_id: string
  project_score: number | null
  initial_score: number | null
  improvement_score: number | null
  reinforcement_score: number | null
  notes?: string | null
}

export interface TermSubjectResult {
  enrollment_id: string
  student_id: string
  student_name: string
  academic_year_id: string
  course_id: string
  course_name: string
  subject_id: string
  subject_name: string
  teacher_assignment_id: string
  term_id: string
  term_name: string
  term_order: number
  formative_average: number | null
  weighted_70: number | null
  summative_base: number | null
  summative_final: number | null
  weighted_30: number | null
  final_score: number | null
  alphabetic_scale: string | null
  learning_scale: string | null
  result_status: 'incomplete' | 'provisional' | 'complete'
}

export interface AnnualSubjectResult {
  enrollment_id: string
  student_id: string
  student_name: string
  academic_year_id: string
  course_id: string
  course_name: string
  subject_id: string
  subject_name: string
  teacher_assignment_id: string
  term_1: number | null
  term_2: number | null
  term_3: number | null
  annual_average: number | null
  recovery_score: number | null
  final_score: number | null
  alphabetic_scale: string | null
  learning_scale: string | null
  terms_completed: number
}

export interface QualitativeArea {
  id: string
  name: string
  short_name: string | null
  sort_order: number
  active: boolean
}

export interface QualitativeRecord {
  id?: string
  area_id: string
  enrollment_id: string
  term_id: string
  letter: 'A+' | 'A-' | 'B+' | 'B-' | 'C+' | 'C-' | 'D+' | 'D-' | 'E+' | 'E-'
  notes?: string | null
}

export interface BehaviorCatalogItem {
  letter: 'A' | 'B' | 'C' | 'D' | 'E'
  description: string
  active: boolean
}

export interface AttendanceSummary {
  id?: string
  enrollment_id: string
  term_id: string
  attended_days: number
  justified_absences: number
  unjustified_absences: number
  notes?: string | null
}
