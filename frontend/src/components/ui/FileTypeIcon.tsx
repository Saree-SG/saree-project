import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileArchive,
} from "lucide-react"

interface FileTypeIconProps {
  fileName: string
  className?: string
}

/** Returns a colored icon based on the file's extension. */
export function FileTypeIcon({ fileName, className = "w-5 h-5 shrink-0" }: FileTypeIconProps) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""

  if (ext === "pdf") {
    return <FileText className={`${className} text-red-500`} />
  }
  if (ext === "doc" || ext === "docx") {
    return <FileText className={`${className} text-blue-500`} />
  }
  if (ext === "xls" || ext === "xlsx" || ext === "csv") {
    return <FileSpreadsheet className={`${className} text-green-600`} />
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
    return <FileImage className={`${className} text-purple-500`} />
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className={`${className} text-yellow-600`} />
  }
  return <File className={`${className} text-muted-foreground`} />
}
