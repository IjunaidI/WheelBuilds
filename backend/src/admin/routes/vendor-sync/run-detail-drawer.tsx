// backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx
import { useState } from "react"
import { Drawer, Badge, Button, Input, Label, Text, toast } from "@medusajs/ui"
import { badgeForStatus } from "./status-actions"
import { replaySku, type VendorRun } from "./api"

type Props = {
  run: VendorRun | null
  onClose: () => void
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <Text size="small" weight="plus">{value}</Text>
  </div>
)

const RunDetailDrawer = ({ run, onClose }: Props) => {
  const [partNumber, setPartNumber] = useState("")
  const [busy, setBusy] = useState(false)

  const onReplaySku = async () => {
    if (!run || !partNumber.trim()) return
    setBusy(true)
    try {
      await replaySku(run.vendor_code, partNumber.trim())
      toast.success(`Replayed ${partNumber.trim()}`)
      setPartNumber("")
    } catch (e: any) {
      toast.error(e?.message ?? "Replay failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={!!run} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{run?.vendor_code}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4 overflow-y-auto">
          {run && (
            <>
              <div className="flex items-center gap-2">
                <Badge color={badgeForStatus(run.status)}>{run.status}</Badge>
                <Text size="small" className="text-ui-fg-subtle">{run.source_filename}</Text>
              </div>
              <div>
                <Stat label="Rows" value={run.row_count} />
                <Stat label="New" value={run.new_count} />
                <Stat label="Changed" value={run.changed_count} />
                <Stat label="Discontinued" value={run.discontinued_count} />
                <Stat label="Hash-matched (skipped)" value={run.hash_match_count} />
                <Stat label="No-image (skipped)" value={run.skipped_no_image_count} />
                <Stat label="Apply attempts" value={run.apply_attempt_count} />
              </div>
              {run.error_message && (
                <Text size="small" className="text-ui-fg-error">{run.error_message}</Text>
              )}
              {!!run.failed_group_keys?.length && (
                <div>
                  <Text size="small" weight="plus">Failed groups ({run.failed_group_keys.length})</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle break-all">
                    {run.failed_group_keys.join(", ")}
                  </Text>
                </div>
              )}
              <div className="border-t pt-4">
                <Label size="small">Replay a single SKU</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="part number"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                  />
                  <Button variant="secondary" disabled={busy || !partNumber.trim()} onClick={onReplaySku}>
                    Replay
                  </Button>
                </div>
              </div>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

export default RunDetailDrawer
