import { PageHeader } from '../components/PageHeader'

export function AcademicPlaceholder() {
  return (
    <>
      <PageHeader title="Ayuda" description="Consulte el manual del proyecto incluido en el repositorio." />
      <section className="panel"><p>Revise el archivo <strong>README.md</strong> para instalación, despliegue y operación inicial.</p></section>
    </>
  )
}
