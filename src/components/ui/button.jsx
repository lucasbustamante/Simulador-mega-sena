import React from "react"

export const Button = React.forwardRef(function Button(
  { className = "", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
