import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({ variant = "full", className, asLink = true }: LogoProps) {
  const content =
    variant === "responsive" ? (
      <>
        <img
          src="/assets/saree_image/logo_saree.png"
          alt="Saree"
          className={cn("h-6 w-auto group-data-[collapsible=icon]:hidden", className)}
        />
        <img
          src="/assets/images/favicon.png"
          alt="Saree"
          className={cn("size-5 hidden group-data-[collapsible=icon]:block", className)}
        />
      </>
    ) : (
      <img
        src={variant === "full" ? "/assets/saree_image/logo_saree.png" : "/assets/images/favicon.png"}
        alt="Saree"
        className={cn(variant === "full" ? "h-6 w-auto" : "size-5", className)}
      />
    )

  if (!asLink) return content
  return <Link to="/">{content}</Link>
}
