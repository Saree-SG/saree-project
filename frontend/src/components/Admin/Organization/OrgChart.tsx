import { forwardRef } from "react"
import { Tree, TreeNode } from "react-organizational-chart"

import type { OrgTreeResponse } from "@/modules/org/orgTreeApi"

import OrgNode from "./OrgNode"

type Props = {
  data: OrgTreeResponse
}

const OrgChart = forwardRef<HTMLDivElement, Props>(function OrgChart(
  { data },
  ref,
) {
  const totalMembers = data.departments.reduce(
    (sum, d) =>
      sum + d.roles.reduce((acc, r) => acc + r.members.length, 0),
    0,
  )

  return (
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
          {data.departments.map((dept) => {
            const deptMembers = dept.roles.reduce(
              (acc, r) => acc + r.members.length,
              0,
            )
            return (
              <TreeNode
                key={dept.department_id ?? "none"}
                label={
                  <OrgNode
                    kind="department"
                    title={dept.department_name}
                    memberCount={deptMembers}
                  />
                }
              >
                {dept.roles.map((role) => (
                  <TreeNode
                    key={role.role_id}
                    label={
                      <OrgNode
                        kind="role"
                        title={role.role_display_name}
                        level={role.role_level}
                        memberCount={role.members.length}
                      />
                    }
                  >
                    {role.members.map((m) => (
                      <TreeNode
                        key={m.user_id}
                        label={
                          <OrgNode
                            kind="member"
                            title={m.full_name || m.email}
                            subtitle={m.email}
                            email={m.email}
                            memberId={m.user_id}
                            badge={m.is_current_user ? "Bạn" : undefined}
                          />
                        }
                      />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            )
          })}
        </Tree>
      </div>
    </div>
  )
})

export default OrgChart
