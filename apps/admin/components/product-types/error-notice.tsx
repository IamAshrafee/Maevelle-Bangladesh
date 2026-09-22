export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}
