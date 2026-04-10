import { SweepstakeForm } from '@/components/admin/sweepstake-form'

export default function NewSweepstakePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Sweepstake</h1>
      <SweepstakeForm />
    </div>
  )
}
