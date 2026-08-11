import { BookOpen, GraduationCap, School, TrendingUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface DashboardStats { students: number; teachers: number; courses: number; subjects: number; reinforcement: number }

export function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({ students: 0, teachers: 0, courses: 0, subjects: 0, reinforcement: 0 })
  const [activeYear, setActiveYear] = useState('Sin año lectivo activo')

  useEffect(() => {
    const load = async () => {
      const [students, teachers, courses, subjects, results, year] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('courses').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('v_subject_term_results').select('term_score').lt('term_score', 6.5).not('term_score', 'is', null),
        supabase.from('academic_years').select('name').eq('active', true).maybeSingle(),
      ])
      setStats({ students: students.count ?? 0, teachers: teachers.count ?? 0, courses: courses.count ?? 0, subjects: subjects.count ?? 0, reinforcement: results.data?.length ?? 0 })
      setActiveYear(year.data?.name ?? 'Sin año lectivo activo')
    }
    void load()
  }, [])

  return <>
    <PageHeader title="Panel principal" description={`Bienvenido, ${profile?.first_names || 'usuario'}. Año lectivo: ${activeYear}.`} />
    <section className="stats-grid"><StatCard label="Estudiantes activos" value={stats.students} icon={GraduationCap} /><StatCard label="Docentes activos" value={stats.teachers} icon={Users} /><StatCard label="Cursos configurados" value={stats.courses} icon={School} /><StatCard label="Asignaturas activas" value={stats.subjects} icon={BookOpen} /><StatCard label="Resultados bajo 6,50" value={stats.reinforcement} helper="Resultados trimestrales con seguimiento" icon={TrendingUp} /></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-heading"><div><h2>Flujo V2</h2><p>Secuencia recomendada después de la reconstrucción normativa.</p></div></div><div className="workflow-list">{[['1','Crear año lectivo, trimestres, cursos y asignaciones docentes.'],['2','Registrar docentes y estudiantes; luego matricularlos.'],['3','Crear aportes y registrar notas según el modelo automático del subnivel.'],['4','Gestionar proyecto interdisciplinar, mejora y supletorio cuando corresponda.']].map(([number,text]) => <div className="workflow-item" key={number}><span>{number}</span><p>{text}</p></div>)}</div></article><article className="panel panel-accent"><div className="panel-heading"><div><h2>Reglas por subnivel</h2><p>El cálculo ya no es igual para todos los grados.</p></div></div><div className="legend-list"><div><span className="legend-dot excellent" /><strong>2.º–4.º EGB</strong><small>Promedio simple de aportes válidos.</small></div><div><span className="legend-dot good" /><strong>5.º–7.º EGB</strong><small>70 % formativa + 30 % sumativa.</small></div><div><span className="legend-dot reinforce" /><strong>Celda vacía</strong><small>NULL: no se considera como cero.</small></div></div></article></section>
  </>
}
