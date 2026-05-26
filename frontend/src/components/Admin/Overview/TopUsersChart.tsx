import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUsersActivity } from "@/modules/admin/adminStatsApi"

type Props = { days?: number; limit?: number }

export default function TopUsersChart({ days = 7, limit = 10 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats", "users-activity", days, limit],
    queryFn: () => getUsersActivity(days, limit),
  })

  const chartData = (data ?? []).map((row) => ({
    name: row.full_name || row.email,
    logins: row.login_count,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Top {limit} người dùng hoạt động ({days} ngày)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Đang tải...
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Chưa có hoạt động.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  fontSize={11}
                />
                <Tooltip />
                <Bar dataKey="logins" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
