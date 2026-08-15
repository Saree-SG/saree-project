/**
 * MOCK DATA cho bộ màn demo UI mới (mô phỏng POC "QL Thi Công").
 * Chỉ phục vụ preview giao diện — KHÔNG phải dữ liệu thật.
 */

export type LoadStatus = "free" | "stable" | "overloaded"

// Đa công ty (multi-tenant) — mỗi công ty đăng ký có dữ liệu riêng.
export const COMPANIES = [
  { id: "c1", name: "Cơ Điện Lạnh Sài Gòn" },
  { id: "c2", name: "Saree Dệt May" },
  { id: "c3", name: "Xây Dựng Miền Nam" },
]

export type Staff = {
  id: string
  name: string
  group: string
  skills: { name: string; level: number }[]
  status: LoadStatus
  availability: "Rảnh" | "Đang làm" | "Đi sửa chữa"
  tasks: number
  hours: number
  load: number // tải trọng %
  progress: number
  currentTask?: string
  currentSite?: string
}

export type Site = {
  id: string
  name: string
  address: string
  status: "Chuẩn bị" | "Đang thi công" | "Đã vận hành"
  pct: number
  staffCount: number
  lat: number
  lng: number
}

export type DemoTask = {
  id: string
  name: string
  skill: string
  site: string
  status: "Chờ làm" | "Đang làm" | "Chưa phân công"
  deadline: string
  progress: number
  need: number
  assignees: string[]
}

export type Incident = {
  id: string
  site: string
  desc: string
  system: string
  address: string
  priority: boolean
  handler?: string
}

export type Candidate = {
  name: string
  availability: "Rảnh" | "Đang bận"
  currentSite: string
  distanceKm: number
  etaMin: number
  impact: "Ít ảnh hưởng" | "Ảnh hưởng vừa" | "Ảnh hưởng lớn"
  skillLevel: number
}

export const STAFF: Staff[] = [
  {
    id: "s1",
    name: "Vũ Thị Phương",
    group: "Nhóm Hệ thống lạnh",
    skills: [{ name: "Hệ thống lạnh", level: 4 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 1,
    hours: 152,
    load: 55,
    progress: 55,
    currentTask: "Lắp hệ thống lạnh",
    currentSite: "Nhà máy thực phẩm Long An",
  },
  {
    id: "s2",
    name: "Lý Thị Oanh",
    group: "Nhóm Lắp panel",
    skills: [{ name: "Lắp panel", level: 3 }],
    status: "free",
    availability: "Rảnh",
    tasks: 0,
    hours: 120,
    load: 0,
    progress: 0,
  },
  {
    id: "s3",
    name: "Đặng Quốc Giang",
    group: "Nhóm Hệ thống điện",
    skills: [{ name: "Hệ thống điện", level: 5 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 3,
    hours: 168,
    load: 78,
    progress: 62,
    currentTask: "Hệ thống điện điều khiển",
    currentSite: "Kho đông lạnh Tân Uyên",
  },
  {
    id: "s4",
    name: "Nguyễn Văn An",
    group: "Nhóm Hàn",
    skills: [
      { name: "Hàn", level: 4 },
      { name: "Lắp IQF", level: 2 },
    ],
    status: "overloaded",
    availability: "Đang làm",
    tasks: 6,
    hours: 205,
    load: 105,
    progress: 40,
    currentTask: "Hàn khung giá đỡ",
    currentSite: "Kho lạnh Bình Dương A",
  },
  {
    id: "s5",
    name: "Hồ Minh Quân",
    group: "Nhóm Bọc cách nhiệt",
    skills: [{ name: "Bọc cách nhiệt", level: 3 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 2,
    hours: 140,
    load: 60,
    progress: 70,
    currentTask: "Bọc cách nhiệt đường ống",
    currentSite: "Kho lạnh Bình Dương A",
  },
  {
    id: "s6",
    name: "Ngô Thành Kiên",
    group: "Nhóm Lắp IQF",
    skills: [{ name: "Lắp IQF", level: 5 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 4,
    hours: 176,
    load: 88,
    progress: 50,
    currentTask: "Lắp IQF line chính",
    currentSite: "Công trình IQF Đồng Nai",
  },
  {
    id: "s7",
    name: "Lê Hoàng Cường",
    group: "Nhóm Máy trục vít",
    skills: [{ name: "Máy trục vít", level: 4 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 2,
    hours: 160,
    load: 65,
    progress: 45,
    currentTask: "Lắp máy trục vít",
    currentSite: "Công trình IQF Đồng Nai",
  },
  {
    id: "s8",
    name: "Mai Thị Lan",
    group: "Nhóm Lắp panel",
    skills: [{ name: "Lắp panel", level: 2 }],
    status: "stable",
    availability: "Đang làm",
    tasks: 1,
    hours: 132,
    load: 50,
    progress: 30,
    currentTask: "Lắp panel kho A1",
    currentSite: "Kho lạnh Bình Dương A",
  },
]

export const SITES: Site[] = [
  {
    id: "p1",
    name: "Công trình IQF Đồng Nai",
    address: "KCN Amata, Đồng Nai",
    status: "Đang thi công",
    pct: 62,
    staffCount: 3,
    lat: 10.95,
    lng: 106.85,
  },
  {
    id: "p2",
    name: "Kho lạnh Bình Dương A",
    address: "KCN Việt Hương, Bình Dương",
    status: "Đang thi công",
    pct: 45,
    staffCount: 4,
    lat: 10.98,
    lng: 106.65,
  },
  {
    id: "p3",
    name: "Nhà máy thực phẩm Long An",
    address: "Huyện Bến Lức, Long An",
    status: "Chuẩn bị",
    pct: 15,
    staffCount: 1,
    lat: 10.64,
    lng: 106.48,
  },
  {
    id: "p4",
    name: "Công ty TNHH Khánh Sủng",
    address: "Quốc lộ 1, Mỹ Xuyên, Cần Thơ",
    status: "Đã vận hành",
    pct: 100,
    staffCount: 0,
    lat: 9.6,
    lng: 105.97,
  },
  {
    id: "p5",
    name: "Kho đông lạnh Tân Uyên",
    address: "TX Tân Uyên, Bình Dương",
    status: "Đang thi công",
    pct: 28,
    staffCount: 2,
    lat: 11.06,
    lng: 106.77,
  },
]

export const TASKS: DemoTask[] = [
  {
    id: "t1",
    name: "Lắp panel phòng sạch",
    skill: "Lắp panel",
    site: "Nhà máy thực phẩm Long An",
    status: "Chưa phân công",
    deadline: "05/08",
    progress: 0,
    need: 2,
    assignees: [],
  },
  {
    id: "t2",
    name: "Hàn khung giá đỡ",
    skill: "Hàn",
    site: "Kho lạnh Bình Dương A",
    status: "Đang làm",
    deadline: "02/08",
    progress: 40,
    need: 2,
    assignees: ["Nguyễn Văn An", "Trần Minh Bình"],
  },
  {
    id: "t3",
    name: "Hệ thống điện điều khiển",
    skill: "Hệ thống điện",
    site: "Kho đông lạnh Tân Uyên",
    status: "Đang làm",
    deadline: "08/08",
    progress: 62,
    need: 2,
    assignees: ["Đặng Quốc Giang"],
  },
  {
    id: "t4",
    name: "Lắp IQF line chính",
    skill: "Lắp IQF",
    site: "Công trình IQF Đồng Nai",
    status: "Đang làm",
    deadline: "10/08",
    progress: 50,
    need: 3,
    assignees: ["Ngô Thành Kiên"],
  },
  {
    id: "t5",
    name: "Bọc cách nhiệt đường ống",
    skill: "Bọc cách nhiệt",
    site: "Kho lạnh Bình Dương A",
    status: "Đang làm",
    deadline: "03/08",
    progress: 70,
    need: 1,
    assignees: ["Hồ Minh Quân"],
  },
  {
    id: "t6",
    name: "Lắp máy trục vít",
    skill: "Máy trục vít",
    site: "Công trình IQF Đồng Nai",
    status: "Chờ làm",
    deadline: "12/08",
    progress: 0,
    need: 2,
    assignees: ["Lê Hoàng Cường"],
  },
]

export const INCIDENTS: Incident[] = [
  {
    id: "i1",
    site: "Kho đông lạnh Tân Uyên",
    desc: "Máy nén lạnh rung bất thường, cần kiểm tra",
    system: "Hệ thống lạnh",
    address: "TX Tân Uyên, Bình Dương",
    priority: true,
    handler: "Ngô Thành Kiên",
  },
  {
    id: "i2",
    site: "Kho lạnh Bình Dương A",
    desc: "Tủ điện điều khiển báo lỗi",
    system: "Hệ thống điện",
    address: "KCN Việt Hương, Bình Dương",
    priority: false,
    handler: "Đặng Quốc Giang",
  },
]

// Gợi ý điều phối cho task "Lắp panel phòng sạch" (thiếu 2 người)
export const DISPATCH_TASK = TASKS[0]
export const CANDIDATES: Candidate[] = [
  {
    name: "Lý Thị Oanh",
    availability: "Rảnh",
    currentSite: "—",
    distanceKm: 12,
    etaMin: 20,
    impact: "Ít ảnh hưởng",
    skillLevel: 3,
  },
  {
    name: "Mai Thị Lan",
    availability: "Đang bận",
    currentSite: "Kho lạnh Bình Dương A",
    distanceKm: 34,
    etaMin: 45,
    impact: "Ảnh hưởng vừa",
    skillLevel: 2,
  },
  {
    name: "Cao Văn Nam",
    availability: "Đang bận",
    currentSite: "Công trình IQF Đồng Nai",
    distanceKm: 58,
    etaMin: 70,
    impact: "Ảnh hưởng lớn",
    skillLevel: 3,
  },
]

// Hiệu suất nhân sự (leaderboard) — GIỮ từ hệ thống hiện tại của bạn
export const LEADERBOARD = [
  {
    name: "Đặng Quốc Giang",
    dept: "Hệ thống điện",
    done: 18,
    onTime: 16,
    completionPct: 90,
  },
  {
    name: "Ngô Thành Kiên",
    dept: "Lắp IQF",
    done: 15,
    onTime: 13,
    completionPct: 83,
  },
  {
    name: "Hồ Minh Quân",
    dept: "Bọc cách nhiệt",
    done: 12,
    onTime: 11,
    completionPct: 80,
  },
  {
    name: "Vũ Thị Phương",
    dept: "Hệ thống lạnh",
    done: 9,
    onTime: 7,
    completionPct: 72,
  },
  { name: "Nguyễn Văn An", dept: "Hàn", done: 8, onTime: 5, completionPct: 55 },
]

export const LOAD_META: Record<
  LoadStatus,
  { label: string; text: string; bar: string }
> = {
  free: { label: "Rảnh", text: "text-amber-600", bar: "bg-amber-400" },
  stable: { label: "Ổn định", text: "text-green-600", bar: "bg-green-500" },
  overloaded: { label: "Quá tải", text: "text-red-600", bar: "bg-red-500" },
}

export const SITE_STATUS_CLS: Record<string, string> = {
  "Đang thi công": "bg-blue-50 text-blue-700 ring-blue-200",
  "Chuẩn bị": "bg-slate-100 text-slate-600 ring-slate-200",
  "Đã vận hành": "bg-green-50 text-green-700 ring-green-200",
}
