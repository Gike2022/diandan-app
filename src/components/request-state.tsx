import { AlertCircle, Loader2 } from "lucide-react";

export function RequestState({ message, error = false, retry }: { message: string; error?: boolean; retry?: () => void }) {
  return <div role={error ? "alert" : "status"} className="m-4 rounded-2xl border border-card-border bg-card/80 p-6 text-center space-y-3">
    {error ? <AlertCircle className="w-7 h-7 mx-auto text-destructive" aria-hidden="true" /> : <Loader2 className="w-7 h-7 mx-auto animate-spin text-primary" aria-hidden="true" />}
    <p className="text-sm text-foreground">{message}</p>
    {retry && <button onClick={retry} className="min-h-11 px-5 rounded-full border border-primary/40 text-primary hover:bg-primary/10">重新尝试</button>}
  </div>;
}
