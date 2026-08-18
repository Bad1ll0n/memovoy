export function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={`spinner spinner-${size === 'md' ? '' : size} ${className}`.trim()}
      role="status"
      aria-label="Carregando"
    />
  )
}
