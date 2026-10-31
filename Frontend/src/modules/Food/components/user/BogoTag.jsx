import { BadgePercent } from "lucide-react"

/** "Buy 1 Get 1 Free" offer tag shown under the price on dish cards that have an active BOGO offer. */
export default function BogoTag({ className = "" }) {
  return (
    <div
      className={`inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[#256fef]/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#256fef] dark:bg-[#256fef]/20 dark:text-[#7aa7ff] ${className}`}
    >
      <BadgePercent size={13} className="shrink-0 stroke-[2.5px]" />
      Buy 1 Get 1 Free
    </div>
  )
}
