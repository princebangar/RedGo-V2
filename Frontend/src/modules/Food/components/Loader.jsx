import { Loader2 } from "lucide-react"

export default function Loader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 bg-white dark:bg-[#0a0a0a]">
      <Loader2 className="h-10 w-10 animate-spin text-[#CB202D]" />
      <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
        Loading...
      </p>
    </div>
  )
}
