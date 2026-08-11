export type AppRole = 'director' | 'docente'
export type AcademicSublevel = 'elemental' | 'media'
export type EvaluationModel = 'simple_average' | 'weighted_70_30'
export type SubjectKind = 'quantitative' | 'qualitative'
export type EnrollmentStatus = 'active' | 'completed' | 'withdrawn' | 'transferred'
export type AssessmentCategory = 'formative' | 'summative'
export type ProjectStatus = 'draft' | 'active' | 'closed'

export interface Profile {
  id: string
  email: string
  first_names: string | null
  last_names: string | null
  role: AppRole
  active: boolean
}

export interface InstitutionSettings {
  id: string
  institution_name: string
  short_name: string
  amie_code: string | null
  district: string | null
  circuit: string | null
  address: string | null
  phone: string | null
  email: string | null
  principal_name: string | null
  logo_url: string | null
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
  profile_id: string | null
  first_names: string
  last_names: string
  national_id: string | null
  phone: string | null
  email: string | null
  active: boolean
  created_at: string
}

export interface AcademicYear {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  active: boolean
  closed: boolean
}

export interface Term {
  id: string
  academic_year_id: string
  number: number
  name: string
  start_date: string | null
  end_date: string | null
  closed: boolean
}

export interface GradeLevel {
  id: string
  code: string
  name: string
  ordinal: number
  sublevel: AcademicSublevel
  evaluation_model: EvaluationModel
  active: boolean
}

export interface Course {
  id: string
  academic_year_id: string
  grade_level_id: string
  parallel: string
  tutor_profile_id: string | null
  active: boolean
  grade_level?: GradeLevel | null
}

export interface Subject {
  id: string
  code: string
  name: string
  abbreviation: string
  kind: SubjectKind
  active: boolean
  sort_order: number
}

export interface GradeSubject {
  grade_level_id: string
  subject_id: string
  required: boolean
  active: boolean
}

export interface TeacherAssignment {
  id: string
  academic_year_id: string
  course_id: string
  subject_id: string
  teacher_id: string
  active: boolean
  course?: Course | null
  subject?: Subject | null
  teacher?: Teacher | null
}

export interface Enrollment {
  id: string
  academic_year_id: string
  course_id: string
  student_id: string
  status: EnrollmentStatus
  enrolled_on: string
  withdrawn_on: string | null
  withdrawal_reason: string | null
  student?: Student | null
  course?: Course | null
}

export interface AssessmentActivityType {
  id: string
  code: string
  name: string
  default_category: AssessmentCategory | null
  active: boolean
  sort_order: number
}

export interface Assessment {
  id: string
  academic_year_id: string
  term_id: string
  course_id: string
  subject_id: string
  teacher_assignment_id: string | null
  activity_type_id: string | null
  title: string
  category: AssessmentCategory
  assessment_date: string | null
  active: boolean
  activity_type?: AssessmentActivityType | null
}

export interface AssessmentGrade {
  id?: string
  assessment_id: string
  enrollment_id: string
  initial_score: number | null
  direct_improvement_score: number | null
  reinforcement_score: number | null
  reinforced_improvement_score: number | null
  notes?: string | null
}

export interface TermSubjectResult {
  enrollment_id: string
  student_id: string
  academic_year_id: string
  course_id: string
  grade_level_id: string
  sublevel: AcademicSublevel
  evaluation_model: EvaluationModel
  subject_id: string
  term_id: string
  term_number: number
  total_items: number
  formative_items: number
  summative_items: number
  formative_average: number | null
  summative_average: number | null
  term_score: number | null
  qualitative: string | null
}

export interface AnnualSubjectResult {
  enrollment_id: string
  student_id: string
  academic_year_id: string
  course_id: string
  grade_level_id: string
  sublevel: AcademicSublevel
  evaluation_model: EvaluationModel
  subject_id: string
  term_1: number | null
  term_2: number | null
  term_3: number | null
  completed_terms: number
  annual_score: number | null
  qualitative: string | null
}

export interface InterdisciplinaryProject {
  id: string
  academic_year_id: string
  term_id: string
  course_id: string
  name: string
  description: string | null
  product_description: string | null
  presentation_description: string | null
  status: ProjectStatus
  created_by: string | null
}

export interface ProjectSubject {
  id: string
  project_id: string
  subject_id: string
  teacher_assignment_id: string | null
  active: boolean
  subject?: Subject | null
  teacher_assignment?: (TeacherAssignment & { teacher?: Teacher | null }) | null
}

export interface ProjectIndicator {
  id: string
  project_subject_id: string
  code: string | null
  description: string
  sort_order: number
  active: boolean
}

export interface ProjectIndicatorScore {
  id?: string
  indicator_id: string
  enrollment_id: string
  score: number | null
}

export interface ProjectStudentComponent {
  id?: string
  project_id: string
  enrollment_id: string
  product_score: number | null
  presentation_score: number | null
}

export interface ProjectSubjectScore {
  project_subject_id: string
  project_id: string
  academic_year_id: string
  term_id: string
  course_id: string
  subject_id: string
  enrollment_id: string
  expected_indicators: number
  graded_indicators: number
  indicator_average: number | null
  product_score: number | null
  presentation_score: number | null
  project_score: number | null
}

export interface SupplementaryEligibility {
  enrollment_id: string
  student_id: string
  academic_year_id: string
  course_id: string
  grade_level_id: string
  subject_id: string
  annual_score: number | null
  eligible: boolean
  exam_score: number | null
  exam_date: string | null
}


export type QualitativeLetter = 'A+' | 'A-' | 'B+' | 'B-' | 'C+' | 'C-' | 'D+' | 'D-' | 'E+' | 'E-'
export type BehaviorCode = 'A' | 'B' | 'C' | 'D' | 'E'

export interface QualitativeSubjectRecord {
  id?: string
  enrollment_id: string
  term_id: string
  subject_id: string
  letter: QualitativeLetter
  notes?: string | null
}

export interface BehaviorCatalogItem {
  code: BehaviorCode
  description: string
  active: boolean
  sort_order: number
}

export interface BehaviorRecord {
  id?: string
  enrollment_id: string
  term_id: string
  behavior_code: BehaviorCode
  notes?: string | null
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
