import { useQuery } from "@tanstack/react-query"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getLoginFrequency } from "@/modules/admin/adminStatsApi"

type Props = { days?: number }

export default function LoginFrequencyChart({ days = 30 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats", "logins", days],
    queryFn: () => getLoginFrequency(days),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tần suất đăng nhập ({days} ngày)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Đang tải...
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Chưa có dữ liệu đăng nhập.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="login_count"
                  name="Lượt đăng nhập"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="unique_users"
                  name="User duy nhất"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
