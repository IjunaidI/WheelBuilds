import React from "react"

import { IconProps } from "types/icon"

const Car: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M3 11L4.2 7.6A2 2 0 0 1 6.1 6.3H13.9A2 2 0 0 1 15.8 7.6L17 11"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 11H17V14.2A0.5 0.5 0 0 1 16.5 14.7H15A1 1 0 0 1 14 13.7V13.2H6V13.7A1 1 0 0 1 5 14.7H3.5A0.5 0.5 0 0 1 3 14.2V11Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="13" r="0.7" fill={color} />
      <circle cx="13.5" cy="13" r="0.7" fill={color} />
    </svg>
  )
}

export default Car
