import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, fullWidth && 'btn--full', className]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={classes} {...rest} />
}
