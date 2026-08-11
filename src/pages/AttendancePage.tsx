import { PageHeader } from '../components/PageHeader'

export function AttendancePage() {
  return <>
    <PageHeader title="Asistencia resumida" description="Módulo temporalmente desacoplado durante la reconstrucción V2." />
    <section className="panel"><div className="alert alert-info">La asistencia resumida se reincorporará sobre el nuevo esquema V2 en la fase de boletas y complementarios. No se han perdido datos porque la base anterior fue reiniciada de forma deliberada.</div></section>
  </>
}
