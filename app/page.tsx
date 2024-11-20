'use client'

import dynamic from 'next/dynamic'

const AzureDevopsBugTracker = dynamic(
  () => import('@/components/azure-devops-bug-tracker'),
  { ssr: false }
)

export default function Page() {
  return <AzureDevopsBugTracker />
}