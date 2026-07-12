'use client'

interface ContactData {
  name: string
  email: string
  phone: string
  notes: string
}

interface Props {
  data: ContactData
  onChange: (data: ContactData) => void
  errors: Partial<ContactData>
}

export default function ContactStep({ data, onChange, errors }: Props) {
  const field = (id: keyof ContactData, label: string, type: string, placeholder: string, required = true) => (
    <div>
      <label htmlFor={id} className="block text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-1.5">
        {label}{required && <span className="text-forest-light ml-1">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={data[id]}
        autoComplete={id === 'name' ? 'name' : id === 'email' ? 'email' : id === 'phone' ? 'tel' : 'off'}
        onChange={e => onChange({ ...data, [id]: e.target.value })}
        placeholder={placeholder}
        className={`w-full bg-ink-soft border px-3 py-2.5 text-sm font-sans text-cream placeholder:text-muted/40 outline-none transition-colors duration-150 focus:border-forest ${
          errors[id] ? 'border-red-500/70' : 'border-stroke-dark'
        }`}
      />
      {errors[id] && <p className="text-red-400 text-xs mt-1 font-sans">{errors[id]}</p>}
    </div>
  )

  return (
    <div>
      <h2 className="font-display text-xl text-cream mb-1">Kontaktinfo</h2>
      <p className="text-muted text-sm font-sans mb-7">Vi sender bekreftelse til din e-post.</p>

      <div className="space-y-5">
        {field('name', 'Fullt navn', 'text', 'Ole Nordmann')}
        {field('email', 'E-post', 'email', 'ole@eksempel.no')}
        {field('phone', 'Telefon', 'tel', '+47 400 00 000')}

        <div>
          <label htmlFor="notes" className="block text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-1.5">
            Merknad <span className="text-muted/50 normal-case tracking-normal text-[10px]">(valgfritt)</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            value={data.notes}
            onChange={e => onChange({ ...data, notes: e.target.value })}
            placeholder="Eventuelle ønsker eller informasjon til barberen…"
            className="w-full bg-ink-soft border border-stroke-dark px-3 py-2.5 text-sm font-sans text-cream placeholder:text-muted/40 outline-none transition-colors duration-150 focus:border-forest resize-none"
          />
        </div>
      </div>
    </div>
  )
}
