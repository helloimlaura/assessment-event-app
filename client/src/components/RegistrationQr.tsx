/* eslint-disable jsx-a11y/prefer-tag-over-role -- the QR code is an inline <svg>, not an <img>
   tag; role="img" + aria-label is the correct accessible-SVG pattern. */
import { useId, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './RegistrationQr.css'

export interface RegistrationQrProps {
  registrationUrl: string
}

export function RegistrationQr({ registrationUrl }: RegistrationQrProps) {
  const [showQrOnMobile, setShowQrOnMobile] = useState(false)
  const qrId = useId()
  const headingId = useId()

  const qrDescription = 'Scan to open event registration on another device'

  return (
    <section className="registration-qr" aria-labelledby={headingId}>
      <h3 className="registration-qr__heading" id={headingId}>
        Event registration
      </h3>
      <p className="registration-qr__instructions">
        Register on this device, or scan the QR code with a phone.
      </p>

      {/* The action, not the URL: nobody types the address by hand, and the QR
          code below is how it reaches another device. */}
      <a className="registration-qr__link" href={registrationUrl}>
        Register for this event
      </a>

      <button
        className="registration-qr__toggle"
        type="button"
        aria-controls={qrId}
        aria-expanded={showQrOnMobile}
        onClick={() => setShowQrOnMobile((isShown) => !isShown)}
      >
        {showQrOnMobile ? 'Hide QR code' : 'Show QR code'}
      </button>

      <div
        className={`registration-qr__code${showQrOnMobile ? ' registration-qr__code--visible' : ''}`}
        id={qrId}
      >
        <QRCodeSVG
          className="registration-qr__image"
          value={registrationUrl}
          size={256}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
          role="img"
          aria-label={qrDescription}
          title={qrDescription}
        />
      </div>
    </section>
  )
}
