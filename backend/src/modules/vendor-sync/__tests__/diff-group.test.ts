import { computeGroupDiffFromSets } from "../pipeline/diff"

const G = "Performance Replicas|126|GLOSS BLACK"
const G2 = "Performance Replicas|126|BLACK BRONZE"

type StagingRow = {
  part_number: string
  group_key: string
  content_hash: string
}
type CurrentRow = StagingRow & { discontinued_at: Date | null }

describe("computeGroupDiffFromSets", () => {
  it("buckets multiple staging rows sharing a group_key into one newGroup", () => {
    const staging: StagingRow[] = [
      { part_number: "126GB-211223", group_key: G, content_hash: "h1" },
      { part_number: "126GB-211235", group_key: G, content_hash: "h2" },
      { part_number: "126GB-2110043", group_key: G, content_hash: "h3" },
    ]
    const current: CurrentRow[] = []

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.newGroups).toHaveLength(1)
    expect(result.newGroups[0].group_key).toBe(G)
    expect(result.newGroups[0].part_numbers).toEqual([
      "126GB-2110043",
      "126GB-211223",
      "126GB-211235",
    ])
    expect(result.changedGroups).toEqual([])
    expect(result.discontinuedGroups).toEqual([])
  })

  it("reports a variant added to an existing group as changedGroup.added_part_numbers", () => {
    const staging: StagingRow[] = [
      { part_number: "126GB-211223", group_key: G, content_hash: "h1" },
      { part_number: "126GB-211235", group_key: G, content_hash: "h2" },
      { part_number: "126GB-NEW", group_key: G, content_hash: "h3" },
    ]
    const current: CurrentRow[] = [
      {
        part_number: "126GB-211223",
        group_key: G,
        content_hash: "h1",
        discontinued_at: null,
      },
      {
        part_number: "126GB-211235",
        group_key: G,
        content_hash: "h2",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.changedGroups).toHaveLength(1)
    expect(result.changedGroups[0]).toMatchObject({
      group_key: G,
      added_part_numbers: ["126GB-NEW"],
      removed_part_numbers: [],
      changed_part_numbers: [],
    })
    expect(result.newGroups).toEqual([])
    expect(result.discontinuedGroups).toEqual([])
  })

  it("reports a variant removed from an existing group (sibling survives) as changedGroup.removed_part_numbers, NOT a discontinuedGroup", () => {
    const staging: StagingRow[] = [
      { part_number: "126GB-211223", group_key: G, content_hash: "h1" },
    ]
    const current: CurrentRow[] = [
      {
        part_number: "126GB-211223",
        group_key: G,
        content_hash: "h1",
        discontinued_at: null,
      },
      {
        part_number: "126GB-OLD",
        group_key: G,
        content_hash: "h-old",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.changedGroups).toHaveLength(1)
    expect(result.changedGroups[0]).toMatchObject({
      group_key: G,
      added_part_numbers: [],
      removed_part_numbers: ["126GB-OLD"],
      changed_part_numbers: [],
    })
    expect(result.discontinuedGroups).toEqual([])
  })

  it("reports content-hash deltas inside an existing group as changedGroup.changed_part_numbers", () => {
    const staging: StagingRow[] = [
      { part_number: "126GB-211223", group_key: G, content_hash: "h1-NEW" },
    ]
    const current: CurrentRow[] = [
      {
        part_number: "126GB-211223",
        group_key: G,
        content_hash: "h1-OLD",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.changedGroups).toHaveLength(1)
    expect(result.changedGroups[0]).toMatchObject({
      group_key: G,
      added_part_numbers: [],
      removed_part_numbers: [],
      changed_part_numbers: ["126GB-211223"],
    })
  })

  it("flags a group as discontinuedGroup when ALL its variants are absent from staging", () => {
    const staging: StagingRow[] = []
    const current: CurrentRow[] = [
      {
        part_number: "126GB-211223",
        group_key: G,
        content_hash: "h1",
        discontinued_at: null,
      },
      {
        part_number: "126GB-211235",
        group_key: G,
        content_hash: "h2",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.discontinuedGroups).toHaveLength(1)
    expect(result.discontinuedGroups[0].group_key).toBe(G)
    expect(result.discontinuedGroups[0].part_numbers).toEqual([
      "126GB-211223",
      "126GB-211235",
    ])
    expect(result.changedGroups).toEqual([])
  })

  it("emits nothing for a group whose parts match exactly on both sides", () => {
    const rows: StagingRow[] = [
      { part_number: "126GB-211223", group_key: G, content_hash: "h1" },
      { part_number: "126GB-211235", group_key: G, content_hash: "h2" },
    ]
    const current: CurrentRow[] = rows.map((r) => ({
      ...r,
      discontinued_at: null,
    }))

    const result = computeGroupDiffFromSets(rows, current)

    expect(result.newGroups).toEqual([])
    expect(result.changedGroups).toEqual([])
    expect(result.discontinuedGroups).toEqual([])
  })

  it("returns empty result when both inputs are empty", () => {
    const result = computeGroupDiffFromSets([], [])
    expect(result).toEqual({
      newGroups: [],
      changedGroups: [],
      discontinuedGroups: [],
    })
  })

  it("ignores already-discontinued current rows", () => {
    const staging: StagingRow[] = []
    const current: CurrentRow[] = [
      {
        part_number: "126GB-OLD",
        group_key: G,
        content_hash: "h1",
        discontinued_at: new Date("2026-01-01"),
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.discontinuedGroups).toEqual([])
  })

  it("part_number that moved groups: added to new group, removed from old", () => {
    // Old: part X was in group G2. New feed has it under group G.
    const staging: StagingRow[] = [
      { part_number: "X", group_key: G, content_hash: "h-new" },
      { part_number: "Y", group_key: G2, content_hash: "h-y" },
    ]
    const current: CurrentRow[] = [
      {
        part_number: "X",
        group_key: G2,
        content_hash: "h-old",
        discontinued_at: null,
      },
      {
        part_number: "Y",
        group_key: G2,
        content_hash: "h-y",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    // X is added to G (G had nothing before, so newGroup with just X)
    expect(result.newGroups).toEqual([{ group_key: G, part_numbers: ["X"] }])
    // G2 lost X but kept Y - changed group with removed=[X]
    expect(result.changedGroups).toEqual([
      {
        group_key: G2,
        added_part_numbers: [],
        removed_part_numbers: ["X"],
        changed_part_numbers: [],
      },
    ])
    expect(result.discontinuedGroups).toEqual([])
  })

  it("part_number moved from a now-empty group: old group becomes discontinuedGroup", () => {
    // X was the only member of G2. It moved to G. G2 has nothing left.
    const staging: StagingRow[] = [
      { part_number: "X", group_key: G, content_hash: "h" },
    ]
    const current: CurrentRow[] = [
      {
        part_number: "X",
        group_key: G2,
        content_hash: "h-old",
        discontinued_at: null,
      },
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.newGroups).toEqual([{ group_key: G, part_numbers: ["X"] }])
    expect(result.discontinuedGroups).toEqual([
      { group_key: G2, part_numbers: ["X"] },
    ])
    expect(result.changedGroups).toEqual([])
  })

  it("per-SKU fallback groups stay separate (no accidental clustering)", () => {
    const staging: StagingRow[] = [
      {
        part_number: "Y305198543+2515",
        group_key: "sku:Y305198543+2515",
        content_hash: "h1",
      },
      {
        part_number: "Y849220543+2060",
        group_key: "sku:Y849220543+2060",
        content_hash: "h2",
      },
    ]
    const current: CurrentRow[] = []

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.newGroups).toHaveLength(2)
    expect(result.newGroups.map((g) => g.part_numbers)).toEqual([
      ["Y305198543+2515"],
      ["Y849220543+2060"],
    ])
  })

  it("mixed deltas inside one group: added + removed + changed all surface", () => {
    const staging: StagingRow[] = [
      { part_number: "A", group_key: G, content_hash: "ha-new" }, // changed
      { part_number: "C", group_key: G, content_hash: "hc" }, // added
    ]
    const current: CurrentRow[] = [
      {
        part_number: "A",
        group_key: G,
        content_hash: "ha-old",
        discontinued_at: null,
      },
      {
        part_number: "B",
        group_key: G,
        content_hash: "hb",
        discontinued_at: null,
      }, // removed
    ]

    const result = computeGroupDiffFromSets(staging, current)

    expect(result.changedGroups).toEqual([
      {
        group_key: G,
        added_part_numbers: ["C"],
        removed_part_numbers: ["B"],
        changed_part_numbers: ["A"],
      },
    ])
  })
})
