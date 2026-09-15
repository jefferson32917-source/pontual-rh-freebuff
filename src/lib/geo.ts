import { useCallback, useState } from 'react'
import type { GeoLocation } from '../types'

const CONSENT_KEY = 'pontual.geoConsent'

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unavailable'

/**
 * Localização para batida de ponto.
 * - O colaborador/gestor PRECISA aceitar o compartilhamento de local para bater o ponto.
 * - O consentimento é lembrado por usuário (por sessão do navegador).
 * - A localização capturada é anexada à batida, mas SÓ gestores/RH a veem.
 */
export function useGeoConsent(userId: string) {
  const storageKey = `${CONSENT_KEY}.${userId}`
  const [status, setStatus] = useState<GeoStatus>(() => {
    try {
      return localStorage.getItem(storageKey) === 'granted' ? 'granted' : 'pending'
    } catch {
      return 'pending'
    }
  })
  const [error, setError] = useState<string | null>(null)

  /** Pede consentimento + posição de teste. Retorna a posição se ok. */
  const requestConsent = useCallback((): Promise<GeoLocation | null> => {
    setError(null)
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setStatus('unavailable')
        setError('Seu navegador não suporta localização.')
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            localStorage.setItem(storageKey, 'granted')
          } catch {
            // ignore
          }
          setStatus('granted')
          resolve({
            lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
            lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
            accuracy: Math.round(pos.coords.accuracy),
          })
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus('denied')
            setError('Permissão de localização negada. Ela é obrigatória para registrar o ponto.')
          } else {
            setError('Não foi possível obter sua localização. Tente novamente.')
          }
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      )
    })
  }, [storageKey])

  /** Captura a posição para a batida (consentimento já concedido). */
  const capture = useCallback((): Promise<GeoLocation | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
            lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
            accuracy: Math.round(pos.coords.accuracy),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
      )
    })
  }, [])

  return { status, error, requestConsent, capture }
}

/** Formata coordenadas para exibição (só usado por gestores/RH). */
export function formatGeo(loc: { lat: number; lng: number; accuracy?: number }): string {
  return `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}${loc.accuracy ? ` (±${loc.accuracy}m)` : ''}`
}

/** Link do Google Maps para a coordenada. */
export function geoMapLink(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
}
