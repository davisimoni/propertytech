interface FormFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  /** `false` toglie il vincolo del browser e segnala il campo come facoltativo. */
  required?: boolean;
  /** Testo di aiuto sotto al campo. */
  hint?: string;
}

export function FormField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  required = true,
  hint,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {!required && (
          <span className="ml-1.5 font-normal text-muted-foreground">(facoltativo)</span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
