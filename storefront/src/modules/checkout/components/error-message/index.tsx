const ErrorMessage = ({ error, 'data-testid': dataTestid }: { error?: string | null, 'data-testid'?: string }) => {
  if (!error) {
    return null
  }

  // Defense in depth: form actions feed this component their return value, and a
  // non-string (e.g. a customer object) rendered as a child throws React error
  // #31 and takes down the whole page. Only ever render a string.
  const message = typeof error === "string" ? error : "Something went wrong. Please try again."

  return (
    <div className="pt-2 text-rose-500 text-small-regular" data-testid={dataTestid}>
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage
