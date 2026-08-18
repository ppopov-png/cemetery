type DeviceCheckButtonProps = {
  onClick: () => void
}

export function DeviceCheckButton({ onClick }: DeviceCheckButtonProps) {
  return (
    <button className="device-check-button" type="button" onClick={onClick}>
      <span>Device Check</span>
      <span className="button-arrow" aria-hidden="true">↗</span>
    </button>
  )
}
