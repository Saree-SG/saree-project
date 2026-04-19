import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { RolesService, UsersService, type UserUpdateMe } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useAuth from "@/hooks/useAuth"
import { useMyPermissions } from "@/hooks/useMyPermissions"
import useCustomToast from "@/hooks/useCustomToast"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

const formSchema = z.object({
  full_name: z.string().max(30).optional(),
  email: z.email({ message: "Invalid email address" }),
})

type FormData = z.infer<typeof formSchema>
type UserInformationProps = {
  embedded?: boolean
}

const UserInformation = ({ embedded = false }: UserInformationProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const { user: currentUser } = useAuth()
  const permissionsQuery = useMyPermissions()
  const canManageUsers = Boolean(
    currentUser?.is_superuser ||
      (permissionsQuery.data ?? []).includes("USER_MANAGE"),
  )
  const [selectedCompanyId, setSelectedCompanyId] = useState("")
  const [selectedRoleId, setSelectedRoleId] = useState("")

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: currentUser?.full_name ?? undefined,
      email: currentUser?.email,
    },
  })

  const { data: accountProfile } = useQuery({
    queryKey: ["roles", "my-account-profile"],
    queryFn: () => RolesService.myAccountProfile(),
    enabled: Boolean(currentUser),
  })

  const memberships = accountProfile?.memberships ?? []

  const companyOptions = memberships
    .map((membership) => ({
      companyId: membership.company_id,
      companyName: membership.company_name,
    }))
    .filter(
      (value, index, array) =>
        array.findIndex((item) => item.companyId === value.companyId) === index,
    )

  const effectiveCompanyId =
    selectedCompanyId ||
    memberships.find((item) => item.is_primary)?.company_id ||
    ""

  const { data: companyRoles } = useQuery({
    queryKey: ["roles", "catalog", effectiveCompanyId],
    queryFn: () =>
      RolesService.listCompanyRoles({ companyId: effectiveCompanyId }),
    enabled: Boolean(currentUser?.is_superuser && effectiveCompanyId),
  })

  const validCompanyRoles = (companyRoles ?? []).filter(
    (role) => Boolean(role.id),
  )

  const toggleEditMode = () => {
    setEditMode(!editMode)
  }

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("User updated successfully")
      toggleEditMode()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: () =>
      RolesService.assignUserCompanyRole({
        requestBody: {
          user_id: currentUser?.id || "",
          company_id: effectiveCompanyId,
          role_id: selectedRoleId,
          is_primary: true,
        },
      }),
    onSuccess: async () => {
      showSuccessToast("Primary role updated")
      setSelectedRoleId("")
      await queryClient.invalidateQueries({
        queryKey: ["roles", "my-account-profile"],
      })
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = (data: FormData) => {
    const updateData: UserUpdateMe = {}

    // only include fields that have changed
    if (data.full_name !== currentUser?.full_name) {
      updateData.full_name = data.full_name
    }
    if (data.email !== currentUser?.email) {
      updateData.email = data.email
    }

    mutation.mutate(updateData)
  }

  const onCancel = () => {
    form.reset()
    toggleEditMode()
  }

  return (
    <div className={embedded ? "w-full" : "max-w-md"}>
      {!embedded ? (
        <h3 className="py-4 text-lg font-semibold">User Information</h3>
      ) : null}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) =>
              editMode ? (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input type="text" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              ) : (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <p
                    className={cn(
                      "py-2 truncate max-w-sm",
                      !field.value && "text-muted-foreground",
                    )}
                  >
                    {field.value || "N/A"}
                  </p>
                </FormItem>
              )
            }
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) =>
              editMode ? (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              ) : (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <p className="py-2 truncate max-w-sm">{field.value}</p>
                </FormItem>
              )
            }
          />

          <div className="flex gap-3">
            {editMode ? (
              <>
                <LoadingButton
                  type="submit"
                  loading={mutation.isPending}
                  disabled={!form.formState.isDirty}
                >
                  Save
                </LoadingButton>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" onClick={toggleEditMode}>
                Edit
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="mt-6 space-y-3">
        <h4 className="text-base font-semibold">Company and Roles</h4>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No company-role memberships found.
          </p>
        ) : (
          memberships.map((membership) => (
            <div
              key={`${membership.company_id}-${membership.role_id}`}
              className="rounded-md border p-3"
            >
              <p className="text-sm font-medium">{membership.company_name}</p>
              <p className="text-sm text-muted-foreground">
                {membership.role_display_name} (Level {membership.role_level})
                {membership.is_primary ? " - Primary" : ""}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 space-y-3">
        <h4 className="text-base font-semibold">Effective Permissions</h4>
        {(permissionsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No permissions resolved for this account.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(permissionsQuery.data ?? []).map((code) => (
              <span
                key={code}
                className="rounded-md border bg-muted px-2 py-1 text-xs font-medium"
              >
                {code}
              </span>
            ))}
          </div>
        )}
      </div>

      {canManageUsers ? (
        <div
          className={
            embedded
              ? "mt-6 space-y-3 rounded-md border p-4"
              : "mt-6 space-y-3 rounded-md border p-4"
          }
        >
          <h4 className="text-base font-semibold">Admin Role Assignment</h4>
          <p className="text-sm text-muted-foreground">
            Assign primary role by company using dropdown.
          </p>

          <div className="space-y-2">
            <FormLabel>Company</FormLabel>
            <Select
              value={effectiveCompanyId}
              onValueChange={(value) => {
                setSelectedCompanyId(value)
                setSelectedRoleId("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map((company) => (
                  <SelectItem key={company.companyId} value={company.companyId}>
                    {company.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FormLabel>Role</FormLabel>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {validCompanyRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id as string}>
                    {role.display_name} (L{role.level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <LoadingButton
            type="button"
            loading={assignRoleMutation.isPending}
            disabled={!effectiveCompanyId || !selectedRoleId}
            onClick={() => {
              assignRoleMutation.mutate()
            }}
          >
            Save primary role
          </LoadingButton>
        </div>
      ) : null}
    </div>
  )
}

export default UserInformation
