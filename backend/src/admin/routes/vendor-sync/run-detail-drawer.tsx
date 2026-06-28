// backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx
import { useState, useEffect, type ReactNode } from "react"
import { Drawer, Badge, Button, Input, Label, Text, toast } from "@medusajs/ui"
import { badgeForStatus } from "./status-actions"
import { getRun, replaySku, type VendorRun } from "./api"

type Props = {
  run: VendorRun | null
  onClose: () => void
}

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-center justify-between py-1">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <Text size="small" weight="plus">{value}</Text>
  </div>
)

const RunDetailDrawer = ({ run, onClose }: Props) => {
  const [partNumber, setPartNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<VendorRun | null>(null)

  useEffect(() => {
    if (!run) {
      setFresh(null)
      return
    }
    getRun(run.id)
      .then((result) => setFresh(result.run))
      .catch((e: any) => toast.error(e?.message ?? "Failed to fetch run detail"))
  }, [run?.id])

  const view = fresh ?? run

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
          {view && (
            <>
              <div className="flex items-center gap-2">
                <Badge color={badgeForStatus(view.status)}>{view.status}</Badge>
                <Text size="small" className="text-ui-fg-subtle">{view.source_filename}</Text>
              </div>
              <div>
                <Stat label="Rows" value={view.row_count} />
                <Stat label="New" value={view.new_count} />
                <Stat label="Changed" value={view.changed_count} />
                <Stat label="Discontinued" value={view.discontinued_count} />
                <Stat label="Hash-matched (skipped)" value={view.hash_match_count} />
                <Stat label="No-image (skipped)" value={view.skipped_no_image_count} />
                <Stat label="Apply attempts" value={view.apply_attempt_count} />
              </div>
              {view.error_message && (
                <Text size="small" className="text-ui-fg-error">{view.error_message}</Text>
              )}
              {!!view.failed_group_keys?.length && (
                <div>
                  <Text size="small" weight="plus">Failed groups ({view.failed_group_keys.length})</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle break-all">
                    {view.failed_group_keys.join(", ")}
                  </Text>
                </div>
              )}
              {!!view.failed_part_numbers?.length && (
                <div>
                  <Text size="small" weight="plus">Failed SKUs ({view.failed_part_numbers.length})</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle break-all">
                    {view.failed_part_numbers.join(", ")}
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
