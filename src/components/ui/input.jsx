import React from "react"

export const Input = React.forwardRef(function Input(
  { className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`rounded-md border px-3 py-2 text-sm outline-none focus:ring focus:ring-indigo-400/40 ${className}`}
      {...props}
    />
  )
})
