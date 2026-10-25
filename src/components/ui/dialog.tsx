"use client";
import * as React from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px]" />
    <Primitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl", className)} {...props}>
      {children}<Primitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2"><X size={18} /><span className="sr-only">Close</span></Primitive.Close>
    </Primitive.Content></Primitive.Portal>;
}
