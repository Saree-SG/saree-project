import { Check, ChevronRight } from "lucide-react"
import type { QuotationStage } from "@/modules/quotation/quotationTypes"
import { STAGE_CONFIG, STAGE_ORDER } from "@/modules/quotation/stageConfig"

export const QUOTATION_CREATE_STEP = "CREATE_DOSSIER"

interface StageStepperProps {
  currentStage: QuotationStage
  selectedStage?: QuotationStage | typeof QUOTATION_CREATE_STEP | null
  onStepClick?: (stage: QuotationStage | typeof QUOTATION_CREATE_STEP) => void
}

/**
 * Horizontal scrollable stage progress bar for the quotation workflow.
 * Shows a static "create dossier" step before the tracked workflow stages.
 */
export function StageStepper({
  currentStage,
  selectedStage = null,
  onStepClick,
}: StageStepperProps) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)

  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center">
          <div className="flex items-center">
            <button
              type="button"
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                "cursor-pointer hover:bg-muted/50",
                selectedStage === QUOTATION_CREATE_STEP
                  ? "ring-1 ring-primary/40 bg-primary/5 text-primary"
                  : "text-green-700",
              ].join(" ")}
              onClick={() => onStepClick?.(QUOTATION_CREATE_STEP)}
            >
              <span className="shrink-0">
                <Check className="h-3 w-3 text-green-600" />
              </span>
              <span>Tạo hồ sơ</span>
            </button>
            <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
          </div>

          {STAGE_ORDER.map((stageKey, index) => {
            const stage = STAGE_CONFIG[stageKey]
            const isDone = index < currentIndex
            const isCurrent = stageKey === currentStage
            const isLast = index === STAGE_ORDER.length - 1

            return (
              <div key={stageKey} className="flex items-center">
                <button
                  type="button"
                  className={[
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    "cursor-pointer hover:bg-muted/50",
                    isCurrent
                      ? `${stage.badgeBg} ${stage.badgeText} ring-1 ring-current/30`
                      : "",
                    selectedStage === stageKey && !isCurrent
                      ? "ring-1 ring-primary/40 bg-primary/5 text-primary"
                      : "",
                    isDone ? "text-green-700" : "",
                    !isDone && !isCurrent ? "text-muted-foreground" : "",
                  ].join(" ")}
                  onClick={() => onStepClick?.(stageKey)}
                >
                  <span className="shrink-0">
                    {isDone ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : isCurrent ? (
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${stage.dotColor}`}
                      />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/25" />
                    )}
                  </span>
                  <span>{stage.shortLabel}</span>
                </button>

                {!isLast && (
                  <ChevronRight
                    className={[
                      "mx-0.5 h-3.5 w-3.5 shrink-0",
                      index < currentIndex
                        ? "text-green-400"
                        : "text-muted-foreground/30",
                    ].join(" ")}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
