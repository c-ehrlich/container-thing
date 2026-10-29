import { buttonVariants } from "@repo/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/primitives/card";
import { TrainFrontIcon } from "lucide-react";

/** What every page shows when there's no session, including after it ends in an open tab. */
export function SignInScreen() {
  return (
    // The name is the heading; the button says "Sign in", so the title doesn't need to.
    <main className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-xs gap-6 py-8 [--card-spacing:--spacing(6)]">
        <CardHeader className="justify-items-center gap-3 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <TrainFrontIcon className="size-5" />
          </span>
          <CardTitle>
            <h1 className="text-lg font-semibold tracking-tight">Container Thing</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <a href="/auth/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Sign in with Railway
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
