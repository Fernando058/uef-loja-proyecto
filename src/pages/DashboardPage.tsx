import { BookOpen, GraduationCap, School, TrendingUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface DashboardStats {
  students: number
  teachers: number
  courses: number
  subjects: number
  reinforcement: number
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    students: 0,
    teachers: 0,
    courses: 0,
    subjects: 0,
    reinforcement: 0,
  })

  useEffect(() => {
    const load = async () => {
      const [students, teachers, courses, subjects, results] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('courses').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('v_term_subject_results').select('final_score').lt('final_score', 6.5),
      ])

      setStats({
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        courses: courses.count ?? 0,
        subjects: subjects.count ?? 0,
        reinforcement: results.data?.length ?? 0,
      })
    }

    void load()
  }, [])

  return (
    <>
      <PageHeader
        title="Panel principal"
        description={`Bienvenido, ${profile?.first_names || 'usuario'}. Consulte el estado académico general de la institución.`}
      />

      <section className="stats-grid">
        <StatCard label="Estudiantes activos" value={stats.students} icon={GraduationCap} />
        <StatCard label="Docentes activos" value={stats.teachers} icon={Users} />
        <StatCard label="Cursos configurados" value={stats.courses} icon={School} />
        <StatCard label="Materias activas" value={stats.subjects} icon={BookOpen} />
        <StatCard
          label="Resultados bajo 6,50"
          value={stats.reinforcement}
          helper="Registros que requieren seguimiento"
          icon={TrendingUp}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Flujo académico</h2>
              <p>Secuencia principal de trabajo del sistema.</p>
            </div>
          </div>
          <div className="workflow-list">
            {[
              ['1', 'Configurar el año lectivo, cursos, materias y trimestres.'],
              ['2', 'Registrar estudiantes, docentes y sus asignaciones.'],
              ['3', 'Matricular estudiantes e ingresar calificaciones por materia.'],
              ['4', 'Revisar reportes trimestrales, anuales y tendencias.'],
            ].map(([number, text]) => (
              <div className="workflow-item" key={number}>
                <span>{number}</span>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-accent">
          <div className="panel-heading">
            <div>
              <h2>Criterio analítico</h2>
              <p>Clasificación institucional utilizada en gráficos.</p>
            </div>
          </div>
          <div className="legend-list">
            <div><span className="legend-dot excellent" /><strong>Excelente</strong><small>A+ y A− · desde 8,50</small></div>
            <div><span className="legend-dot good" /><strong>Bueno</strong><small>B+ y B− · de 6,50 a 8,49</small></div>
            <div><span className="legend-dot reinforce" /><strong>Necesita refuerzo</strong><small>C+ o inferior · menos de 6,50</small></div>
          </div>
        </article>
      </section>
    </>
  )
}
