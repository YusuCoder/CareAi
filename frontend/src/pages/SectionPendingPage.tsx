import { DashboardLayout } from '../components/layout/DashboardLayout'
import { t } from '../lib/i18n'

export const SectionPendingPage: React.FC<{ title: string }> = ({ title }) => (
  <DashboardLayout title={title}>
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{t.pending.title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{t.pending.body}</p>
    </div>
  </DashboardLayout>
)
