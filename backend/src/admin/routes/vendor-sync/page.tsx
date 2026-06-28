// backend/src/admin/routes/vendor-sync/page.tsx
import { useEffect, useState, useCallback } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import {
  Container, Heading, Table, Badge, Button, Select, Prompt, toast, Text,
} from "@medusajs/ui"
import {
  actionsForStatus, badgeForStatus, isNonTerminal, type RunAction,
} from "./status-actions"
import {
  listRuns, triggerRun, approveRun, cancelRun, replayRun,
  VENDOR_CODES, type VendorRun,
} from "./api"
import RunDetailDrawer from "./run-detail-drawer"

const ACTION_LABEL: Record<RunAction, string> = {
  approve: "Approve",
  cancel: "Cancel",
  replay: "Replay",
}

const runAction = (a: RunAction, id: string) =>
  a === "approve" ? approveRun(id) : a === "cancel" ? cancelRun(id) : replayRun(id)

type Confirm = { title: string; description: string; run: () => Promise<void> } | null

const VendorSyncPage = () => {
  const [runs, setRuns] = useState<VendorRun[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [triggerVendor, setTriggerVendor] = useState<string>(VENDOR_CODES[0])
  const [detail, setDetail] = useState<VendorRun | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const load = useCallback(async () => {
    try {
      const { runs } = await listRuns({ status: statusFilter || undefined, limit: 25 })
      setRuns(runs)
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load runs")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { setLoading(true); load() }, [load])

  // Poll while any visible run is still moving on its own.
  useEffect(() => {
    if (!runs.some((r) => isNonTerminal(r.status))) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [runs, load])

  const onTrigger = async () => {
    try {
      await triggerRun(triggerVendor, true)
      toast.success(`Dry-run started for ${triggerVendor}`)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Trigger failed")
    }
  }

  const doAction = (a: RunAction, run: VendorRun) => {
    const run_ = async () => {
      try {
        await runAction(a, run.id)
        toast.success(`${ACTION_LABEL[a]} ok`)
        setConfirm(null)
        load()
      } catch (e: any) {
        toast.error(e?.message ?? `${ACTION_LABEL[a]} failed`)
      }
    }
    setConfirm({
      title: `${ACTION_LABEL[a]} run?`,
      description:
        a === "approve"
          ? "This applies the staged diff to the live catalog. It can take minutes."
          : a === "cancel"
          ? "This cooperatively cancels the run."
          : "This re-runs the feed from staging.",
      run: run_,
    })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Vendor Sync</Heading>
        <div className="flex items-center gap-2">
          <Select value={triggerVendor} onValueChange={setTriggerVendor}>
            <Select.Trigger className="w-[200px]"><Select.Value /></Select.Trigger>
            <Select.Content>
              {VENDOR_CODES.map((v) => (
                <Select.Item key={v} value={v}>{v}</Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button onClick={onTrigger}>Run dry-run</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">Status</Text>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <Select.Trigger className="w-[200px]"><Select.Value placeholder="All" /></Select.Trigger>
          <Select.Content>
            <Select.Item value="">All</Select.Item>
            {["awaiting_approval", "applying", "completed", "failed", "partially_failed", "cancelled", "exhausted"].map((s) => (
              <Select.Item key={s} value={s}>{s}</Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Vendor</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Started</Table.HeaderCell>
            <Table.HeaderCell>New / Chg / Disc</Table.HeaderCell>
            <Table.HeaderCell>Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {runs.map((r) => (
            <Table.Row key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
              <Table.Cell>{r.vendor_code}</Table.Cell>
              <Table.Cell><Badge color={badgeForStatus(r.status)}>{r.status}</Badge></Table.Cell>
              <Table.Cell>{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</Table.Cell>
              <Table.Cell>{r.new_count} / {r.changed_count} / {r.discontinued_count}</Table.Cell>
              <Table.Cell onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2">
                  {actionsForStatus(r.status).map((a) => (
                    <Button key={a} size="small" variant={a === "cancel" ? "secondary" : "primary"}
                      onClick={() => doAction(a, r)}>
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
          {!loading && runs.length === 0 && (
            <Table.Row><Table.Cell colSpan={5}>No runs.</Table.Cell></Table.Row>
          )}
        </Table.Body>
      </Table>

      <RunDetailDrawer run={detail} onClose={() => setDetail(null)} />

      <Prompt open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{confirm?.title}</Prompt.Title>
            <Prompt.Description>{confirm?.description}</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => confirm?.run()}>Confirm</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Sync",
  icon: ArrowPath,
})

export default VendorSyncPage
