import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import {
  assignUserToDepartment,
  listDepartments,
  unassignUserFromDepartment,
} from "@/modules/org/departmentApi"
import { handleError } from "@/utils"

type Props = {
  companyId: string
  userId: string
  /** Pass the user's current department_id if known, otherwise omit */
  currentDepartmentId?: string | null
}

const UNASSIGN_VALUE = "__none__"

export default function UserDepartmentAssign({
  companyId,
  userId,
  currentDepartmentId,
}: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: () => listDepartments(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  })

  const [selectedId, setSelectedId] = useState<string>(
    currentDepartmentId ?? UNASSIGN_VALUE,
  )

  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedId === UNASSIGN_VALUE) {
        await unassignUserFromDepartment(companyId, userId)
      } else {
        await assignUserToDepartment(companyId, selectedId, userId)
      }
    },
    onSuccess: async () => {
      showSuccessToast("Cập nhật phòng ban thành công")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "org-tree", companyId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["roles", "company-members", companyId],
      })
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Chọn phòng ban" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGN_VALUE}>— Không gán —</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LoadingButton
        loading={mutation.isPending}
        size="sm"
        variant="outline"
        onClick={() => mutation.mutate()}
      >
        Lưu
      </LoadingButton>
    </div>
  )
}
