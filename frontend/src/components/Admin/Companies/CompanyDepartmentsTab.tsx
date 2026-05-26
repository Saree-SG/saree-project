import type { CompanyPublic } from "@/client"
import DepartmentManagement from "@/components/Admin/DepartmentManagement"
import { Card, CardContent } from "@/components/ui/card"

type Props = { company: CompanyPublic }

export default function CompanyDepartmentsTab({ company }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <DepartmentManagement companyId={company.id} />
      </CardContent>
    </Card>
  )
}
