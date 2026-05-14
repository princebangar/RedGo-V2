import { Loader2 } from "lucide-react"

export default function Loader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 bg-white dark:bg-[#0a0a0a]">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <div className="absolute inset-0 border-4 border-[#DC2626]/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-[#DC2626] rounded-full animate-spin" />
      </div>
      <h1 className="text-xl font-black text-[#DC2626] italic uppercase tracking-tighter mt-6">REDGO</h1>
    </div>
  )
}
