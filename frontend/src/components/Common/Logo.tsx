import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  // logo_saree_icon.png là icon vòng tròn đã crop riêng (không kèm chữ bake sẵn) —
  // chữ "SAREE" được render bằng font của app thay vì chữ serif trong ảnh gốc để
  // đồng bộ với UI (font Be Vietnam Pro, màu brand-gold).
  const content =
    variant === "responsive" ? (
      <>
        <span
          className={cn(
            "flex h-9 w-fit items-center gap-2 self-center rounded-lg bg-white px-2.5 shadow-sm group-data-[collapsible=icon]:hidden",
            className,
          )}
        >
          <img
            src="/assets/saree_image/logo_saree_icon.png"
            alt=""
            className="h-6 w-6"
          />
          <span className="text-brand-gold-light text-base font-bold tracking-wide">
            SAREE
          </span>
        </span>
        <span className="hidden size-9 w-fit items-center justify-center self-center rounded-lg bg-white shadow-sm group-data-[collapsible=icon]:flex">
          <img
            src="/assets/saree_image/logo_saree_icon.png"
            alt="Saree"
            className="size-6"
          />
        </span>
      </>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-lg bg-white shadow-sm",
          variant === "full" ? "px-3 py-2" : "p-1.5",
          className,
        )}
      >
        <img
          src="/assets/saree_image/logo_saree_icon.png"
          alt={variant === "full" ? "" : "Saree"}
          className={variant === "full" ? "h-7 w-7" : "size-5"}
        />
        {variant === "full" && (
          <span className="text-brand-gold-light text-lg font-bold tracking-wide">
            SAREE
          </span>
        )}
      </span>
    )

  if (!asLink) return content
  return <Link to="/">{content}</Link>
}
