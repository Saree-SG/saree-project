import { forwardRef } from "react"
import { Tree, TreeNode } from "react-organizational-chart"

import { TooltipProvider } from "@/components/ui/tooltip"
import type {
  OrgTreeDepartmentGroup,
  OrgTreeResponse,
} from "@/modules/org/orgTreeApi"

import OrgDeptNode from "./OrgDeptNode"
import OrgNode from "./OrgNode"

type Props = {
  data: OrgTreeResponse
}

/** A department node, with optional nested department children. */
function renderDepartment(
  dept: OrgTreeDepartmentGroup,
  canOpenDetail: boolean,
  children?: React.ReactNode,
) {
  return (
    <TreeNode
      key={dept.department_id ?? "none"}
      label={<OrgDeptNode dept={dept} canOpenDetail={canOpenDetail} />}
    >
      {children}
    </TreeNode>
  )
}

const OrgChart = forwardRef<HTMLDivElement, Props>(function OrgChart(
  { data },
  ref,
) {
  const totalMembers = data.departments.reduce(
    (sum, d) => sum + d.roles.reduce((acc, r) => acc + r.members.length, 0),
    0,
  )

  // Establish a real hierarchy: the leadership department (the one holding the
  // lowest role level, e.g. Giám đốc = L1) becomes the parent of every other
  // department, so the board sits ABOVE the phòng ban (L2). Accounts are not
  // separate nodes — they're shown on hover over each department card. Falls
  // back to a flat layout when leadership is ambiguous.
  const allLevels = data.departments.flatMap((d) =>
    d.roles.map((r) => r.role_level),
  )
  const minLevel = allLevels.length ? Math.min(...allLevels) : null
  const topDepartments =
    minLevel === null
      ? []
      : data.departments.filter((d) =>
          d.roles.some((r) => r.role_level === minLevel),
        )
  const topDept = topDepartments.length === 1 ? topDepartments[0] : null
  const otherDepartments = topDept
    ? data.departments.filter((d) => d !== topDept)
    : data.departments

  // Only managers (role level ≤ 2) may open a person's detail page.
  const canOpenDetail =
    data.current_role_level !== null && data.current_role_level <= 2

  return (
    <TooltipProvider delayDuration={150}>
      <div
        ref={ref}
        className="overflow-auto rounded-md border bg-muted/20 p-6"
      >
        <div className="min-w-[800px]">
          <Tree
            lineWidth="2px"
            lineColor="#cbd5e1"
            lineBorderRadius="8px"
            label={
              <OrgNode
                kind="company"
                title={data.company_name}
                memberCount={totalMembers}
              />
            }
          >
            {topDept
              ? renderDepartment(
                  topDept,
                  canOpenDetail,
                  otherDepartments.map((d) =>
                    renderDepartment(d, canOpenDetail),
                  ),
                )
              : otherDepartments.map((d) => renderDepartment(d, canOpenDetail))}
          </Tree>
        </div>
      </div>
    </TooltipProvider>
  )
})

export default OrgChart
