export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="hidden border-t py-4 px-6 md:block">
      <div className="flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          © {currentYear} Saree ERP. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
