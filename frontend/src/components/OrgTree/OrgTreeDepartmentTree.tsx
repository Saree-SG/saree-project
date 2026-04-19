import type { OrgTreeRoleNode } from "@/modules/org/orgTreeApi"

type OrgTreeDepartmentTreeProps = {
  departmentName: string
  roles: OrgTreeRoleNode[]
  currentRoleId: string | null
}

export default function OrgTreeDepartmentTree({
  departmentName,
  roles,
  currentRoleId,
}: OrgTreeDepartmentTreeProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{departmentName}</h3>
        <span className="text-xs text-muted-foreground">
          {roles.length} levels
        </span>
      </div>
      <div className="space-y-0">
        {roles.map((roleNode, index) => {
          const isCurrentRole = roleNode.role_id === currentRoleId
          return (
            <div
              key={roleNode.role_id}
              className="relative flex flex-col items-center"
            >
              {index > 0 ? <span className="h-5 w-px bg-border" /> : null}
              <div
                className={
                  isCurrentRole
                    ? "w-full rounded-xl border-2 border-primary bg-primary/10 p-4 shadow-sm ring-2 ring-primary/20"
                    : "w-full rounded-xl border bg-card p-4 shadow-sm"
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {roleNode.role_display_name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Level {roleNode.role_level}
                    </span>
                    {isCurrentRole ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        Bạn
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {roleNode.role_name}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roleNode.members.length === 0 ? (
                    <span className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
                      Chưa có nhân sự ở level này
                    </span>
                  ) : (
                    roleNode.members.map((member) => (
                      <span
                        key={member.user_id}
                        className={
                          member.is_current_user
                            ? "rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                            : "rounded-md border bg-background px-2 py-1 text-xs"
                        }
                      >
                        {member.full_name || member.email}
                      </span>
                    ))
                  )}
                </div>
              </div>
              {index < roles.length - 1 ? (
                <span className="h-5 w-px bg-border" />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
