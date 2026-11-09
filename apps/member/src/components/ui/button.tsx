import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// The demo's buttons (docs/UI-PARITY.md, phase ui-3): .m-btn is the primary action, .m-btn.m-secondary the
// supporting one, .m-btn.m-danger a removal, .m-text a quiet text action. Their look, sizes (44 px minimum) and states
// come from the demo's stylesheets; only icon handling stays here.
const buttonVariants = cva(
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "m-btn",
        destructive: "m-btn m-danger",
        outline: "m-btn m-secondary",
        danger: "m-btn m-danger",
        secondary: "m-btn m-secondary",
        ghost: "m-text",
        link: "m-text",
      },
      size: {
        default: "",
        xs: "",
        sm: "",
        lg: "",
        icon: "aspect-square !px-0",
        "icon-xs": "aspect-square !px-0",
        "icon-sm": "aspect-square !px-0",
        "icon-lg": "aspect-square !px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
