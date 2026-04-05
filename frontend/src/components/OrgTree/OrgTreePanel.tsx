import { useQuery } from "@tanstack/react-query"

import { getOrgTree } from "@/modules/org/orgTreeApi"
import OrgTreeDepartmentTree from "./OrgTreeDepartmentTree.tsx"

type OrgTreePanelProps = {
  companyId: string
  companyName: string
  departmentId?: string
}

export default function OrgTreePanel({
  companyId,
  companyName,
  departmentId,
}: OrgTreePanelProps) {
  const { data: orgTree, isPending, isError } = useQuery({
    queryKey: ["roles", "org-tree", companyId, departmentId || ""],
    queryFn: () =>
      getOrgTree({
        companyId,
        departmentId,
      }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  })

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sơ đồ tổ chức</h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {companyName}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cấu trúc dạng cây theo level role (lọc theo phòng ban nếu có).
      </p>

      {isPending ? (
        <div className="mt-5 rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">Đang tải sơ đồ...</p>
        </div>
      ) : null}

      {isError ? (
        <div className="mt-5 rounded-xl border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            Không tải được sơ đồ tổ chức.
          </p>
        </div>
      ) : null}

      {!isPending && !isError ? (
        <div className="mt-5 rounded-xl border bg-background p-4">
          <div className="mx-auto max-w-4xl space-y-6">
            {(orgTree?.departments ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có dữ liệu org tree cho company hiện tại.
              </p>
            ) : null}
            {(orgTree?.departments ?? []).map((departmentGroup) => (
              <OrgTreeDepartmentTree
                key={departmentGroup.department_id || "no-department"}
                departmentName={departmentGroup.department_name}
                roles={departmentGroup.roles}
                currentRoleId={orgTree?.current_role_id || null}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

