import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['input', className].filter(Boolean).join(' ')} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={['textarea', className].filter(Boolean).join(' ')} {...rest} />
}
