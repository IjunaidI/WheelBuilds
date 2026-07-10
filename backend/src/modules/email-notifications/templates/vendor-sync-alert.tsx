import { Text, Section, Hr } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'

export const VENDOR_SYNC_ALERT = 'vendor-sync-alert'

export interface VendorSyncAlertFailedRun {
  runId: string
  vendorCode: string
  status: string
  errorMessage?: string | null
  finishedAt?: string | null
}

export interface VendorSyncAlertStaleVendor {
  vendorCode: string
  /** ISO timestamp of the newest completed FULL run, or null when none exists. */
  lastFullSuccessAt?: string | null
}

export interface VendorSyncAlertData {
  failedRuns: VendorSyncAlertFailedRun[]
  staleVendors: VendorSyncAlertStaleVendor[]
  preview?: string
}

export const isVendorSyncAlertData = (data: any): data is VendorSyncAlertData =>
  Array.isArray(data?.failedRuns) &&
  Array.isArray(data?.staleVendors) &&
  (data.failedRuns.length > 0 || data.staleVendors.length > 0)

const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '13px',
  margin: '0 0 4px',
}

export const VendorSyncAlertTemplate: React.FC<VendorSyncAlertData> & {
  PreviewProps: VendorSyncAlertData
} = ({ failedRuns, staleVendors, preview = 'Vendor sync needs attention' }) => {
  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 30px' }}>
          Vendor Sync Alert
        </Text>

        {failedRuns.length > 0 && (
          <>
            <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
              Failed runs (last hour)
            </Text>
            {failedRuns.map((r) => (
              <div key={r.runId} style={{ margin: '0 0 14px' }}>
                <Text style={mono}>
                  {r.vendorCode} · {r.status} · run {r.runId}
                  {r.finishedAt ? ` · ${r.finishedAt}` : ''}
                </Text>
                {r.errorMessage && (
                  <Text style={{ ...mono, color: '#b91c1c' }}>{r.errorMessage}</Text>
                )}
              </div>
            ))}
            <Text style={{ margin: '10px 0 0' }}>
              Inspect and replay from the admin → Vendor Sync console.
            </Text>
            <Hr style={{ margin: '20px 0' }} />
          </>
        )}

        {staleVendors.length > 0 && (
          <>
            <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
              Stale vendors (no completed full sync in &gt;26h)
            </Text>
            {staleVendors.map((v) => (
              <Text key={v.vendorCode} style={mono}>
                {v.vendorCode} · last full success:{' '}
                {v.lastFullSuccessAt ?? 'never'}
              </Text>
            ))}
            <Text style={{ margin: '10px 0 0' }}>
              The 12h cron should have produced one — check Railway logs, SFTP
              credentials, and the in-progress run guard.
            </Text>
          </>
        )}
      </Section>
    </Base>
  )
}

VendorSyncAlertTemplate.PreviewProps = {
  failedRuns: [
    {
      runId: 'vfr_01ABC',
      vendorCode: 'wheelpros-wheels',
      status: 'failed',
      errorMessage: 'no feed file matched wheelInvPriceData*.csv',
      finishedAt: '2026-07-11T11:40:00Z',
    },
  ],
  staleVendors: [{ vendorCode: 'wheelpros-tires', lastFullSuccessAt: null }],
} as VendorSyncAlertData

export default VendorSyncAlertTemplate
