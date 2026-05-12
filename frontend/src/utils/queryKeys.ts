export const QueryKeys = {
  // Tasks
  task: (taskId: string) => ["task-detail", "task", taskId] as const,
  taskSubtasks: (taskId: string) => ["task-detail", "subtasks", taskId] as const,
  taskComments: (taskId: string) => ["task-detail", "comments", taskId] as const,
  taskProofs: (taskId: string) => ["task-detail", "proofs", taskId] as const,
  taskProgressReports: (taskId: string) => ["task-detail", "progress-reports", taskId] as const,
  taskAudit: (taskId: string) => ["task-detail", "audit", taskId] as const,
  taskParent: (parentId: string | null | undefined) => ["task-detail", "parent-task", parentId] as const,
  taskProjectTasks: (projectId: string | null | undefined) => ["task-detail", "project-tasks", projectId] as const,
  taskProject: (projectId: string | null | undefined) => ["task-detail", "project", projectId] as const,
  taskProjectMembers: (projectId: string | null | undefined) => ["task-detail", "project-members", projectId] as const,
  taskGantt: (projectId: string | null | undefined) => ["task-detail", "gantt", projectId] as const,
  myTasksDashboard: () => ["my-tasks-dashboard"] as const,

  // Projects
  project: (projectId: string) => ["project-dashboard", "project", projectId] as const,
  projectStats: (projectId: string) => ["project-dashboard", "stats", projectId] as const,
  projectTasks: (projectId: string) => ["project-dashboard", "tasks", projectId] as const,
  projectMembers: (projectId: string) => ["project-dashboard", "members", projectId] as const,
  projectWorkload: (projectId: string) => ["project-dashboard", "workload", projectId] as const,
  projectCompanyUsers: (companyId: string | undefined) => ["project-dashboard", "company-users", companyId] as const,
  projectMe: () => ["project-dashboard", "me"] as const,

  // Quotations
  quotation: (quotationId: string) => ["quotation", quotationId] as const,
  quotationNegotiations: (quotationId: string) => ["quotation", quotationId, "negotiations"] as const,
  quotationAttachments: (quotationId: string) => ["quotation", quotationId, "attachments"] as const,
  quotationHistory: (quotationId: string) => ["quotation", quotationId, "history"] as const,
  quotations: () => ["quotations"] as const,

  // Dashboard
  dashboardOverview: (params: unknown) => ["dashboard", "overview", params] as const,
  dashboardProjectStats: (params: unknown) => ["dashboard", "project-stats", params] as const,
  dashboardLeaderboard: (params: unknown) => ["dashboard", "leaderboard", params] as const,
  dashboardWorkload: (params: unknown) => ["dashboard", "workload", params] as const,
  dashboardOverdue: (params: unknown) => ["dashboard", "overdue", params] as const,
  dashboardProjectsCatalog: () => ["dashboard", "projects-catalog"] as const,
  dashboardPendingQuotations: () => ["dashboard", "pending-quotations"] as const,
  dashboardDepartments: (companyId: string | undefined) => ["dashboard", "departments", companyId] as const,
  dashboardUsers: () => ["dashboard", "users"] as const,
  dashboardMe: () => ["dashboard", "me"] as const,
  dashboardProfile: () => ["dashboard", "profile"] as const,

  // Notifications
  notificationsUnreadCount: () => ["notifications-unread-count"] as const,
  notificationsList: () => ["notifications-list"] as const,

  // Contracts
  contract: (contractId: string) => ["contract", contractId] as const,

  // RBAC
  myPermissions: () => ["roles", "my-permissions"] as const,
  rolesCatalog: (companyId: string) => ["roles", "catalog", companyId] as const,
  myAccountProfile: () => ["roles", "my-account-profile"] as const,

  // Reports
  reportsProfile: () => ["reports", "profile"] as const,
  reportsProjectsCatalog: () => ["reports", "projects-catalog"] as const,
  reportsDepartments: (companyId: string | undefined) => ["reports", "departments", companyId] as const,
  reportsMembers: () => ["reports", "members"] as const,
  reportsProjectStats: (params: unknown) => ["reports", "project-stats", params] as const,
  reportsLeaderboard: (params: unknown) => ["reports", "leaderboard", params] as const,
  reportsWorkload: (params: unknown) => ["reports", "workload", params] as const,
  reportsOverdue: (params: unknown) => ["reports", "overdue", params] as const,
} as const
