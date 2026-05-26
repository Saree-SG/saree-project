import type { CompanyPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Props = {
  companies: CompanyPublic[]
  selectedId: string | null
  onSelect: (company: CompanyPublic) => void
}

export default function CompaniesList({
  companies,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-col gap-1">
      {companies.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Chưa có công ty nào. Tạo mới ở góc phải trên.
        </p>
      ) : (
        companies.map((c) => {
          const active = c.id === selectedId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.slug}</span>
              <Badge
                variant={c.is_active ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {c.is_active ? "Active" : "Inactive"}
              </Badge>
            </button>
          )
        })
      )}
    </div>
  )
}
