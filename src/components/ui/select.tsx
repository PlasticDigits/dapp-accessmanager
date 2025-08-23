import * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, multiple, ...props }, ref) => (
  <select
    ref={ref}
    multiple={multiple}
    className={cn(
      "w-full rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1",
      multiple ? "min-h-[2.25rem] px-2 py-2" : "h-9 px-3 py-1",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export { Select };


